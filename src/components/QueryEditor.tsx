"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
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
  // Иначе Monaco помечает кириллические буквы, похожие на латинские.
  unicodeHighlight: { ambiguousCharacters: false },
};

type Props = {
  defaultValue: string;
  theme: Theme;
  onStatusChange?: (status: EditorStatus) => void;
  onBatchChange?: (queries: BatchQuery[]) => void;
  ref?: Ref<QueryEditorHandle>;
};

export function QueryEditor({ defaultValue, theme, onStatusChange, onBatchChange, ref }: Props) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
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
  }));

  const handleMount: OnMount = (instance) => {
    editorRef.current = instance;
    instance.onDidDispose(() => {
      editorRef.current = null;
    });
    instance.focus();

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
      options={OPTIONS}
      beforeMount={registerQueryLanguage}
      onMount={handleMount}
      loading={null}
    />
  );
}
