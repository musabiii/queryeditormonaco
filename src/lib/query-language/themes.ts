import type { editor } from "monaco-editor";

export const LIGHT_THEME = "1c-classic";
export const DARK_THEME = "1c-dark";

/** Светлая тема в духе конфигуратора 1С: ключевые слова красные, имена синие. */
const classic: editor.IStandaloneThemeData = {
  base: "vs",
  inherit: true,
  rules: [
    { token: "keyword", foreground: "FF0000" },
    { token: "predefined", foreground: "FF0000" },
    { token: "constant", foreground: "FF0000" },
    { token: "operator", foreground: "FF0000" },
    { token: "delimiter", foreground: "FF0000" },
    { token: "identifier", foreground: "0000FF" },
    { token: "type", foreground: "800080" },
    { token: "variable.parameter", foreground: "963200" },
    { token: "number", foreground: "000000" },
    { token: "string", foreground: "000000" },
    { token: "string.escape", foreground: "6E6E6E" },
    { token: "comment", foreground: "008000" },
  ],
  colors: {
    "editor.background": "#FFFFFF",
    "editor.foreground": "#000000",
    "editor.lineHighlightBackground": "#FFFBE6",
    "editorLineNumber.foreground": "#9A9A9A",
    "editorLineNumber.activeForeground": "#333333",
  },
};

/** Тёмная тема в палитре VS Code Dark+. */
const dark: editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "keyword", foreground: "569CD6" },
    { token: "predefined", foreground: "DCDCAA" },
    { token: "constant", foreground: "569CD6" },
    { token: "operator", foreground: "D4D4D4" },
    { token: "delimiter", foreground: "D4D4D4" },
    { token: "identifier", foreground: "9CDCFE" },
    { token: "type", foreground: "4EC9B0" },
    { token: "variable.parameter", foreground: "C586C0" },
    { token: "number", foreground: "B5CEA8" },
    { token: "string", foreground: "CE9178" },
    { token: "string.escape", foreground: "D7BA7D" },
    { token: "comment", foreground: "6A9955" },
  ],
  colors: {
    "editor.background": "#1E1E1E",
  },
};

export const themes: Record<string, editor.IStandaloneThemeData> = {
  [LIGHT_THEME]: classic,
  [DARK_THEME]: dark,
};
