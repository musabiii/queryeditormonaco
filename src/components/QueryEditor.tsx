"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { commentLines, uncommentLines } from "@/lib/comment-lines";
import { loadMonaco } from "@/lib/monaco-loader";
import {
  DARK_THEME,
  LANGUAGE_ID,
  LIGHT_THEME,
  parseBatch,
  registerQueryLanguage,
  type BatchQuery,
} from "@/lib/query-language";
import type { Theme } from "@/lib/theme";

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
};

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
  theme: Theme;
  onStatusChange?: (status: EditorStatus) => void;
  onBatchChange?: (queries: BatchQuery[]) => void;
  /** Показывать пробелы и табы во всём тексте, а не только в выделении. */
  showWhitespace?: boolean;
  ref?: Ref<QueryEditorHandle>;
};

export function QueryEditor({
  defaultValue,
  theme,
  onStatusChange,
  onBatchChange,
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
  }));

  const handleMount: OnMount = (instance, monaco) => {
    editorRef.current = instance;
    instance.onDidDispose(() => {
      editorRef.current = null;
    });
    instance.focus();

    // Сочетания клавиш конфигуратора 1С: Ctrl+Num/ и Ctrl+Shift+Num/.
    const { KeyMod, KeyCode } = monaco;
    instance.addCommand(KeyMod.CtrlCmd | KeyCode.NumpadDivide, () => commentLines(instance));
    instance.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.NumpadDivide, () =>
      uncommentLines(instance),
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
      if (model && onBatchChange) onBatchChange(parseBatch(model.getValue()));
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
      theme={theme === "dark" ? DARK_THEME : LIGHT_THEME}
      options={options}
      beforeMount={registerQueryLanguage}
      onMount={handleMount}
      loading={null}
    />
  );
}
