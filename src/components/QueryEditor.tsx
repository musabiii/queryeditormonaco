"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { commentLines, uncommentLines } from "@/lib/comment-lines";
import { loadMonaco } from "@/lib/monaco-loader";
import { createGroupByPreview } from "./group-by-preview";
import { createNewQueryPreview } from "./new-query-preview";
import {
  LANGUAGE_ID,
  collectParameters,
  parseBatch,
  registerQueryLanguage,
  smartInsert,
  tableAlias,
  completionMetadata,
  FIELD_DRAG_TYPE,
  shouldListAliases,
  tokenize,
  groupBySuggestion,
  isAggregateSnippet,
  wrapSelectField,
  unwrapBslString,
  type BatchQuery,
  type MetadataIndex,
  type QueryParameter,
  type SmartTarget,
} from "@/lib/query-language";

export type EditorStatus = {
  line: number;
  column: number;
  /** Смещение курсора от начала текста. */
  offset: number;
  /** Количество выделенных символов. */
  selected: number;
  lineCount: number;
};

export type QueryEditorHandle = {
  /** Выделяет фрагмент текста по смещениям и прокручивает к нему. */
  selectRange(start: number, end: number): void;
  commentLines(): void;
  uncommentLines(): void;
  format(): void;
  getText(): string;
  getSelectedText(): string;
  /** Вставляет текст на место выделения (или в позицию курсора). */
  insertText(text: string): void;
  /** Вставляет шаблон с полями для заполнения (синтаксис сниппетов Monaco). */
  insertSnippet(snippet: string): void;
  /** Функция из дерева: применяется к полю выборки под курсором, иначе вставляется как insertSnippet. */
  applyFunction(snippet: string): void;
  /**
   * Убирает оформление строкового литерала 1С (кавычки, «|», удвоенные кавычки)
   * в выделении или во всём тексте. false — текст не похож на литерал.
   */
  unwrapCodeString(): boolean;
  /** Добавляет реквизит или таблицу из дерева конфигурации в запрос под курсором. */
  smartInsert(target: SmartTarget, index: MetadataIndex): void;
  /** Заменяет весь текст; действие можно отменить через Ctrl+Z. */
  replaceAll(text: string): void;
  /** Добавляет в конец пакета новый запрос (с «;» и разделителем) и ставит курсор в него. */
  appendBatchQuery(): void;
};

const OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontFamily: "Consolas, 'Cascadia Mono', 'Courier New', monospace",
  fontSize: 14,
  tabSize: 4,
  insertSpaces: false,
  detectIndentation: false,
  automaticLayout: true,
  scrollBeyondLastLine: false,
  renderWhitespace: "selection",
  smoothScrolling: true,
  padding: { top: 8 },
  // Вместо миникарты справа — панель структуры запроса.
  minimap: { enabled: false },
  fixedOverflowWidgets: true,
  // Как в конфигураторе 1С: «//» без пробела после.
  comments: { insertSpace: false },
  // Иначе Monaco помечает кириллические буквы, похожие на латинские.
  unicodeHighlight: { ambiguousCharacters: false },
  // Разделители строк U+2028/U+2029 (бывают в скопированном тексте и ответах ИИ)
  // убираем молча: по умолчанию Monaco спрашивает через блокирующий window.confirm,
  // и страница «зависает», пока окно не закрыто.
  unusualLineTerminators: "auto",
  // Перетаскивание обрабатываем сами — см. handleTextDrop.
  dropIntoEditor: { enabled: false },
  // Псевдоним таблицы правится сразу во всём запросе — см. linked-aliases.ts.
  linkedEditing: true,
};

/** Разделитель запросов пакета, как у конструктора запросов 1С. */
const BATCH_SEPARATOR = "/".repeat(80);
/** Сколько пустых строк оставить под добавленным запросом. */
const TRAILING_LINES = 5;

/** Все виды переводов строк, включая U+2028/U+2029 и NEL, — в обычный «\n». */
function normalizeLineBreaks(text: string) {
  return text.replace(/\r\n?|[\u2028\u2029\u0085]/g, "\n");
}

/**
 * Перетаскивание текста в редактор (из дерева конфигурации и функций).
 * Встроенная обработка Monaco вставляет текст как сниппет с «$0» в конце,
 * а в standalone-сборке сниппет применяется как обычный текст — «$0»
 * остаётся в запросе. Поэтому она отключена (dropIntoEditor), и текст
 * вставляется обычной правкой; курсор во время перетаскивания показывает место.
 * Реквизит, чья таблица уже есть в запросе, вставляется с её псевдонимом.
 */
function handleTextDrop(
  instance: editor.IStandaloneCodeEditor,
  monaco: typeof import("monaco-editor"),
): () => void {
  const container = instance.getContainerDomNode();
  const positionAt = (event: DragEvent) =>
    instance.getTargetAtClientPoint(event.clientX, event.clientY)?.position ?? null;

  const onDragOver = (event: DragEvent) => {
    if (!event.dataTransfer?.types.includes("text/plain")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const position = positionAt(event);
    if (position) instance.setPosition(position);
  };

  const onDrop = (event: DragEvent) => {
    const text = event.dataTransfer?.getData("text/plain");
    const model = instance.getModel();
    const position = positionAt(event) ?? instance.getPosition();
    if (!text || !model || !position) return;
    event.preventDefault();
    const offset = model.getOffsetAt(position);
    const inserted = normalizeLineBreaks(withAlias(event, model.getValue(), offset) ?? text);
    instance.pushUndoStop();
    instance.executeEdits("drop", [{ range: monaco.Range.fromPositions(position), text: inserted }], () => {
      const end = model.getPositionAt(offset + inserted.length);
      return [monaco.Selection.fromPositions(end)];
    });
    instance.pushUndoStop();
    instance.focus();
  };

  /** «Псевдоним.Реквизит», если таблица реквизита есть в запросе в месте вставки. */
  const withAlias = (event: DragEvent, text: string, offset: number) => {
    const index = completionMetadata();
    const data = event.dataTransfer?.getData(FIELD_DRAG_TYPE);
    if (!index || !data) return null;
    try {
      const { table, field } = JSON.parse(data) as { table: string[]; field: string };
      const alias = tableAlias(text, offset, table, index);
      return alias ? `${alias}.${field}` : null;
    } catch {
      return null;
    }
  };

  container.addEventListener("dragover", onDragOver);
  container.addEventListener("drop", onDrop);
  return () => {
    container.removeEventListener("dragover", onDragOver);
    container.removeEventListener("drop", onDrop);
  };
}

/** Контроллер сниппетов Monaco — его нет в публичных типах. */
function snippetController(instance: editor.IStandaloneCodeEditor) {
  return instance.getContribution("snippetController2") as unknown as {
    insert(template: string, options?: { adjustWhitespace?: boolean }): void;
  } | null;
}

function withEditor(
  instance: editor.IStandaloneCodeEditor | null,
  action: (instance: editor.IStandaloneCodeEditor) => void,
) {
  if (!instance) return;
  instance.focus();
  action(instance);
}

type Props = {
  defaultValue: string;
  /** Идентификатор цветовой схемы — он же имя темы Monaco. */
  theme: string;
  onStatusChange?: (status: EditorStatus) => void;
  onBatchChange?: (queries: BatchQuery[]) => void;
  onParametersChange?: (parameters: QueryParameter[]) => void;
  /** Текст после каждого изменения — например, для фильтра дерева конфигурации. */
  onTextChange?: (text: string) => void;
  /** Показывать пробелы и табы во всём тексте, а не только в выделении. */
  showWhitespace?: boolean;
  ref?: Ref<QueryEditorHandle>;
};

export function QueryEditor({
  defaultValue,
  theme,
  onStatusChange,
  onBatchChange,
  onParametersChange,
  onTextChange,
  showWhitespace = false,
  ref,
}: Props) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const groupByRef = useRef<ReturnType<typeof createGroupByPreview> | null>(null);
  const options = useMemo<editor.IStandaloneEditorConstructionOptions>(
    () => ({ ...OPTIONS, renderWhitespace: showWhitespace ? "all" : "selection" }),
    [showWhitespace],
  );
  const [monacoState, setMonacoState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    loadMonaco().then(
      () => active && setMonacoState("ready"),
      () => active && setMonacoState("error"),
    );
    return () => {
      active = false;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    selectRange(start, end) {
      const instance = editorRef.current;
      const model = instance?.getModel();
      if (!instance || !model) return;
      const from = model.getPositionAt(start);
      const to = model.getPositionAt(end);
      const range = {
        startLineNumber: from.lineNumber,
        startColumn: from.column,
        endLineNumber: to.lineNumber,
        endColumn: to.column,
      };
      instance.setSelection(range);
      instance.revealRangeNearTopIfOutsideViewport(range);
      instance.focus();
    },
    commentLines() {
      withEditor(editorRef.current, commentLines);
    },
    uncommentLines() {
      withEditor(editorRef.current, uncommentLines);
    },
    format() {
      withEditor(editorRef.current, (instance) => instance.getAction("editor.action.formatDocument")?.run());
    },
    getText() {
      return editorRef.current?.getValue() ?? "";
    },
    getSelectedText() {
      const instance = editorRef.current;
      const selection = instance?.getSelection();
      return (selection && instance?.getModel()?.getValueInRange(selection)) || "";
    },
    insertText(text) {
      withEditor(editorRef.current, (instance) => {
        const selection = instance.getSelection();
        if (!selection) return;
        instance.pushUndoStop();
        instance.executeEdits("ai", [{ range: selection, text: normalizeLineBreaks(text), forceMoveMarkers: true }]);
        instance.pushUndoStop();
      });
    },
    insertSnippet(snippet) {
      withEditor(editorRef.current, (instance) => {
        instance.pushUndoStop();
        snippetController(instance)?.insert(snippet);
        instance.pushUndoStop();
      });
    },
    applyFunction(snippet) {
      withEditor(editorRef.current, (instance) => {
        const model = instance.getModel();
        const position = instance.getPosition();
        if (!model || !position) return;
        const wrap = wrapSelectField(model.getValue(), model.getOffsetAt(position), snippet);
        instance.pushUndoStop();
        if (wrap) {
          const from = model.getPositionAt(wrap.start);
          const to = model.getPositionAt(wrap.end);
          instance.setSelection({ startLineNumber: from.lineNumber, startColumn: from.column, endLineNumber: to.lineNumber, endColumn: to.column });
          // Выражение уже с отступами — не добавлять к ним отступ строки.
          snippetController(instance)?.insert(wrap.snippet, { adjustWhitespace: false });
        } else {
          snippetController(instance)?.insert(snippet);
        }
        instance.pushUndoStop();
        // Агрегат применили к полю — предложить группировку по остальным полям.
        if (wrap && isAggregateSnippet(snippet)) groupByRef.current?.offer();
      });
    },
    unwrapCodeString() {
      const instance = editorRef.current;
      const model = instance?.getModel();
      const selection = instance?.getSelection();
      if (!instance || !model || !selection) return false;
      instance.focus();
      const range = selection.isEmpty() ? model.getFullModelRange() : selection;
      const text = unwrapBslString(model.getValueInRange(range));
      if (text === null) return false;
      instance.pushUndoStop();
      instance.executeEdits("unwrap", [{ range, text }]);
      instance.pushUndoStop();
      return true;
    },
    smartInsert(target, index) {
      withEditor(editorRef.current, (instance) => {
        const model = instance.getModel();
        const position = instance.getPosition();
        if (!model || !position) return;
        const result = smartInsert(model.getValue(), model.getOffsetAt(position), target, index);
        if (!result.edits.length) return;
        const rangeOf = (start: number, end: number) => {
          const from = model.getPositionAt(start);
          const to = model.getPositionAt(end);
          return { startLineNumber: from.lineNumber, startColumn: from.column, endLineNumber: to.lineNumber, endColumn: to.column };
        };
        instance.pushUndoStop();
        instance.executeEdits(
          "tree",
          result.edits.map((edit) => ({ range: rangeOf(edit.start, edit.end), text: edit.text })),
        );
        instance.pushUndoStop();
        const selection = rangeOf(result.selection.start, result.selection.end);
        instance.setSelection(selection);
        instance.revealRangeInCenterIfOutsideViewport(selection);
      });
    },
    appendBatchQuery() {
      withEditor(editorRef.current, (instance) => {
        const model = instance.getModel();
        if (!model) return;
        const text = model.getValue();
        const rangeOf = (start: number, finish: number) => {
          const from = model.getPositionAt(start);
          const to = model.getPositionAt(finish);
          return { startLineNumber: from.lineNumber, startColumn: from.column, endLineNumber: to.lineNumber, endColumn: to.column };
        };
        // Хвостовые пробелы и пустые строки заменяем — новый запрос идёт сразу после текста.
        const end = text.trimEnd().length;
        const query = "ВЫБРАТЬ";
        // Пустые строки после — чтобы новый запрос не прилипал к нижнему краю редактора.
        let insert = `${end ? `\n\n${BATCH_SEPARATOR}\n` : ""}${query}${"\n".repeat(TRAILING_LINES)}`;
        // «;» — после последней лексемы, а не в конце текста: там может быть комментарий.
        const last = tokenize(text).filter((token) => token.kind !== "comment").at(-1);
        const needSemicolon = last && last.text !== ";";
        if (needSemicolon && last.end === end) insert = `;${insert}`;
        const edits = [{ range: rangeOf(end, text.length), text: insert }];
        if (needSemicolon && last.end !== end) edits.unshift({ range: rangeOf(last.end, last.end), text: ";" });
        instance.pushUndoStop();
        instance.executeEdits("batch", edits);
        instance.pushUndoStop();
        // Курсор — сразу после «ВЫБРАТЬ», пустые строки под ним тоже в поле зрения.
        const line = model.getLineCount() - TRAILING_LINES;
        const cursor = { lineNumber: line, column: model.getLineMaxColumn(line) };
        instance.setPosition(cursor);
        instance.revealLinesInCenterIfOutsideViewport(cursor.lineNumber, cursor.lineNumber + TRAILING_LINES);
      });
    },
    replaceAll(text) {
      withEditor(editorRef.current, (instance) => {
        const model = instance.getModel();
        if (!model) return;
        instance.pushUndoStop();
        instance.executeEdits("ai", [{ range: model.getFullModelRange(), text: normalizeLineBreaks(text) }]);
        instance.pushUndoStop();
        instance.setPosition({ lineNumber: 1, column: 1 });
      });
    },
  }));

  const handleMount: OnMount = (instance, monaco) => {
    editorRef.current = instance;
    const stopDrop = handleTextDrop(instance, monaco);
    groupByRef.current = createGroupByPreview(instance, monaco);
    createNewQueryPreview(instance, monaco);
    instance.onDidDispose(() => {
      editorRef.current = null;
      stopDrop();
    });
    instance.focus();

    // Сочетания клавиш конфигуратора 1С: Ctrl+Num/, Ctrl+Shift+Num/ и Ctrl+L.
    const { KeyMod, KeyCode } = monaco;
    instance.addCommand(KeyMod.CtrlCmd | KeyCode.NumpadDivide, () => commentLines(instance));
    instance.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.NumpadDivide, () =>
      uncommentLines(instance),
    );
    // В Monaco Ctrl+L выделяет строку, в 1С — удаляет её.
    instance.addCommand(KeyMod.CtrlCmd | KeyCode.KeyL, () =>
      instance.trigger("keyboard", "editor.action.deleteLines", null),
    );

    const reportStatus = () => {
      const model = instance.getModel();
      const selection = instance.getSelection();
      if (!model || !selection || !onStatusChange) return;
      const position = selection.getPosition();
      onStatusChange({
        line: position.lineNumber,
        column: position.column,
        offset: model.getOffsetAt(position),
        selected: model.getValueLengthInRange(selection),
        lineCount: model.getLineCount(),
      });
    };

    const reportBatch = () => {
      const model = instance.getModel();
      if (!model) return;
      const text = model.getValue();
      onBatchChange?.(parseBatch(text));
      onParametersChange?.(collectParameters(text));
      onTextChange?.(text);
    };

    instance.onDidChangeCursorSelection(reportStatus);

    // Серую подсказку Monaco запрашивает при наборе текста, но не при переходе курсора:
    // встав на пустую строку в конце запроса с агрегатами, сразу видим «СГРУППИРОВАТЬ ПО».
    let suggestTimer: ReturnType<typeof setTimeout> | undefined;
    instance.onDidChangeCursorPosition(() => {
      clearTimeout(suggestTimer);
      suggestTimer = setTimeout(() => {
        const model = instance.getModel();
        const position = instance.getPosition();
        if (!model || !position || !instance.getSelection()?.isEmpty()) return;
        if (groupBySuggestion(model.getValue(), model.getOffsetAt(position))) {
          instance.trigger("group-by", "editor.action.inlineSuggest.trigger", {});
        }
      }, 150);
    });
    instance.onDidDispose(() => clearTimeout(suggestTimer));

    instance.onDidChangeModelContent((event) => {
      reportBatch();
      reportStatus();
      // Enter или Tab после «ВЫБРАТЬ», запятой, «ГДЕ», «ПО», «И»… — сразу список псевдонимов (пробел Monaco обрабатывает сам).
      // Enter может прийти несколькими правками (перевод строки и удаление пробелов в конце строки).
      const typed = event.changes.map((change) => change.text);
      const model = instance.getModel();
      const position = instance.getPosition();
      const whitespaceOnly = typed.every((text) => text.trim() === "") && typed.some((text) => /[\n\t]/.test(text));
      if (model && position && whitespaceOnly && !event.isUndoing && !event.isRedoing && !event.isFlush) {
        if (shouldListAliases(model.getValue(), model.getOffsetAt(position))) {
          setTimeout(() => instance.trigger("where", "editor.action.triggerSuggest", {}));
        }
      }
    });
    reportBatch();
    reportStatus();
  };

  if (monacoState !== "ready") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        {monacoState === "error"
          ? "Не удалось загрузить редактор. Обновите страницу."
          : "Загрузка редактора…"}
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      language={LANGUAGE_ID}
      defaultValue={defaultValue}
      theme={theme}
      options={options}
      beforeMount={registerQueryLanguage}
      onMount={handleMount}
      loading={null}
    />
  );
}
