"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { commentLines, uncommentLines } from "@/lib/comment-lines";
import { loadMonaco } from "@/lib/monaco-loader";
import {
  LANGUAGE_ID,
  collectParameters,
  parseBatch,
  registerQueryLanguage,
  unwrapBslString,
  type BatchQuery,
  type QueryParameter,
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
  /**
   * Убирает оформление строкового литерала 1С (кавычки, «|», удвоенные кавычки)
   * в выделении или во всём тексте. false — текст не похож на литерал.
   */
  unwrapCodeString(): boolean;
  /** Заменяет весь текст; действие можно отменить через Ctrl+Z. */
  replaceAll(text: string): void;
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
};

/** Все виды переводов строк, включая U+2028/U+2029 и NEL, — в обычный «\n». */
function normalizeLineBreaks(text: string) {
  return text.replace(/\r\n?|[\u2028\u2029\u0085]/g, "\n");
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
  showWhitespace = false,
  ref,
}: Props) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
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
        // Контроллер сниппетов Monaco не входит в публичные типы.
        const controller = instance.getContribution("snippetController2") as unknown as
          | { insert(template: string): void }
          | null;
        instance.pushUndoStop();
        controller?.insert(snippet);
        instance.pushUndoStop();
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
    instance.onDidDispose(() => {
      editorRef.current = null;
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
    };

    instance.onDidChangeCursorSelection(reportStatus);
    instance.onDidChangeModelContent(() => {
      reportBatch();
      reportStatus();
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
