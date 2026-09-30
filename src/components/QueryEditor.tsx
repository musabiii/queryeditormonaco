"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useEffect, useState } from "react";
import { loadMonaco } from "@/lib/monaco-loader";
import {
  DARK_THEME,
  LANGUAGE_ID,
  LIGHT_THEME,
  registerQueryLanguage,
} from "@/lib/query-language";
import type { Theme } from "@/lib/theme";

export type EditorStatus = {
  line: number;
  column: number;
  /** Количество выделенных символов. */
  selected: number;
  lineCount: number;
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
  fixedOverflowWidgets: true,
  // Иначе Monaco помечает кириллические буквы, похожие на латинские.
  unicodeHighlight: { ambiguousCharacters: false },
};

type Props = {
  defaultValue: string;
  theme: Theme;
  onStatusChange?: (status: EditorStatus) => void;
};

export function QueryEditor({ defaultValue, theme, onStatusChange }: Props) {
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

  const handleMount: OnMount = (instance) => {
    instance.focus();
    if (!onStatusChange) return;

    const report = () => {
      const model = instance.getModel();
      const selection = instance.getSelection();
      if (!model || !selection) return;
      onStatusChange({
        line: selection.positionLineNumber,
        column: selection.positionColumn,
        selected: model.getValueLengthInRange(selection),
        lineCount: model.getLineCount(),
      });
    };

    instance.onDidChangeCursorSelection(report);
    instance.onDidChangeModelContent(report);
    report();
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
