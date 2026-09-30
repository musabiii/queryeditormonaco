import type { editor } from "monaco-editor";
import { COLOR_SCHEMES, type ColorScheme, type TokenPalette } from "../color-schemes";

const hex = (color: string) => color.replace("#", "");

/** Какие токены грамматики (grammar.ts) окрашиваются какой ролью палитры. */
const TOKEN_ROLES: [token: string, role: Exclude<keyof TokenPalette, "italic">][] = [
  ["keyword", "keyword"],
  ["predefined", "function"],
  ["constant", "constant"],
  ["operator", "operator"],
  ["delimiter", "delimiter"],
  ["identifier", "identifier"],
  ["type", "type"],
  ["variable.parameter", "parameter"],
  ["number", "number"],
  ["string", "string"],
  ["string.escape", "stringEscape"],
  ["comment", "comment"],
];

function toMonacoTheme({ kind, editor: colors, tokens }: ColorScheme): editor.IStandaloneThemeData {
  const italic = new Set<string>(tokens.italic ?? []);
  return {
    base: kind === "dark" ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      { token: "", foreground: hex(colors.foreground), background: hex(colors.background) },
      ...TOKEN_ROLES.map(([token, role]) => ({
        token,
        foreground: hex(tokens[role]),
        ...(italic.has(role) ? { fontStyle: "italic" } : {}),
      })),
      // Имя временной таблицы после ПОМЕСТИТЬ.
      { token: "identifier.temptable", foreground: hex(tokens.identifier), fontStyle: "bold" },
    ],
    colors: {
      "editor.background": colors.background,
      "editor.foreground": colors.foreground,
      "editor.lineHighlightBackground": colors.lineHighlight,
      "editor.selectionBackground": colors.selection,
      "editorCursor.foreground": colors.cursor,
      "editorLineNumber.foreground": colors.lineNumber,
      "editorLineNumber.activeForeground": colors.activeLineNumber,
    },
  };
}

/** Темы Monaco по идентификатору цветовой схемы. */
export const themes: Record<string, editor.IStandaloneThemeData> = Object.fromEntries(
  COLOR_SCHEMES.map((scheme) => [scheme.id, toMonacoTheme(scheme)]),
);
