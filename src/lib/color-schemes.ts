/**
 * Цветовые схемы редактора. Каждая задаёт цвета подсветки языка запросов,
 * самого редактора Monaco и интерфейса вокруг него (шапка, панели, строка состояния).
 */

/** Цвета подсветки по ролям токенов языка запросов (см. grammar.ts). */
export type TokenPalette = {
  keyword: string;
  /** Встроенные функции: СУММА(...), ЕСТЬNULL(...). */
  function: string;
  constant: string;
  operator: string;
  delimiter: string;
  identifier: string;
  /** Объекты метаданных, виртуальные таблицы, типы. */
  type: string;
  /** Параметры &Имя. */
  parameter: string;
  number: string;
  string: string;
  stringEscape: string;
  comment: string;
  /** Какие роли выделять курсивом — как в оригинальной схеме. */
  italic?: ("comment" | "type" | "parameter")[];
};

export type EditorPalette = {
  background: string;
  foreground: string;
  lineHighlight: string;
  lineNumber: string;
  activeLineNumber: string;
  selection: string;
  cursor: string;
};

/** CSS-переменные интерфейса (globals.css). */
export type UiPalette = {
  background: string;
  foreground: string;
  panel: string;
  border: string;
  muted: string;
  danger: string;
};

export type ColorScheme = {
  id: string;
  label: string;
  kind: "light" | "dark";
  ui: UiPalette;
  editor: EditorPalette;
  tokens: TokenPalette;
};

export const COLOR_SCHEMES: readonly ColorScheme[] = [
  {
    id: "1c-classic",
    label: "1С (классическая)",
    kind: "light",
    ui: { background: "#ffffff", foreground: "#1f2328", panel: "#f6f8fa", border: "#d0d7de", muted: "#59636e", danger: "#cf222e" },
    editor: {
      background: "#FFFFFF", foreground: "#000000", lineHighlight: "#FFFBE6",
      lineNumber: "#9A9A9A", activeLineNumber: "#333333", selection: "#ADD6FF", cursor: "#000000",
    },
    tokens: {
      keyword: "#FF0000", function: "#FF0000", constant: "#FF0000", operator: "#FF0000", delimiter: "#FF0000",
      identifier: "#0000FF", type: "#800080", parameter: "#963200", number: "#000000",
      string: "#000000", stringEscape: "#6E6E6E", comment: "#008000",
    },
  },
  {
    id: "vs-light",
    label: "VS Code Light",
    kind: "light",
    ui: { background: "#ffffff", foreground: "#1f1f1f", panel: "#f8f8f8", border: "#e0e0e0", muted: "#616161", danger: "#cd3131" },
    editor: {
      background: "#FFFFFF", foreground: "#000000", lineHighlight: "#F3F3F3",
      lineNumber: "#237893", activeLineNumber: "#0B216F", selection: "#ADD6FF", cursor: "#000000",
    },
    tokens: {
      keyword: "#0000FF", function: "#795E26", constant: "#0000FF", operator: "#000000", delimiter: "#000000",
      identifier: "#001080", type: "#267F99", parameter: "#AF00DB", number: "#098658",
      string: "#A31515", stringEscape: "#EE0000", comment: "#008000",
    },
  },
  {
    id: "github-light",
    label: "GitHub Light",
    kind: "light",
    ui: { background: "#ffffff", foreground: "#1f2328", panel: "#f6f8fa", border: "#d0d7de", muted: "#59636e", danger: "#cf222e" },
    editor: {
      background: "#FFFFFF", foreground: "#1F2328", lineHighlight: "#F6F8FA",
      lineNumber: "#8C959F", activeLineNumber: "#1F2328", selection: "#0969DA33", cursor: "#0969DA",
    },
    tokens: {
      keyword: "#CF222E", function: "#8250DF", constant: "#0550AE", operator: "#CF222E", delimiter: "#1F2328",
      identifier: "#1F2328", type: "#116329", parameter: "#953800", number: "#0550AE",
      string: "#0A3069", stringEscape: "#116329", comment: "#6E7781",
    },
  },
  {
    id: "solarized-light",
    label: "Solarized Light",
    kind: "light",
    ui: { background: "#fdf6e3", foreground: "#586e75", panel: "#eee8d5", border: "#ddd6c1", muted: "#657b83", danger: "#dc322f" },
    editor: {
      background: "#FDF6E3", foreground: "#657B83", lineHighlight: "#EEE8D5",
      lineNumber: "#93A1A1", activeLineNumber: "#586E75", selection: "#DDD6C1", cursor: "#657B83",
    },
    tokens: {
      keyword: "#859900", function: "#268BD2", constant: "#CB4B16", operator: "#859900", delimiter: "#657B83",
      identifier: "#657B83", type: "#B58900", parameter: "#6C71C4", number: "#D33682",
      string: "#2AA198", stringEscape: "#DC322F", comment: "#93A1A1", italic: ["comment"],
    },
  },
  {
    id: "dark-plus",
    label: "VS Code Dark",
    kind: "dark",
    ui: { background: "#1e1e1e", foreground: "#e6e6e6", panel: "#181818", border: "#2b2b2b", muted: "#9d9d9d", danger: "#f85149" },
    editor: {
      background: "#1E1E1E", foreground: "#D4D4D4", lineHighlight: "#2A2D2E",
      lineNumber: "#6E7681", activeLineNumber: "#CCCCCC", selection: "#264F78", cursor: "#AEAFAD",
    },
    tokens: {
      keyword: "#569CD6", function: "#DCDCAA", constant: "#569CD6", operator: "#D4D4D4", delimiter: "#D4D4D4",
      identifier: "#9CDCFE", type: "#4EC9B0", parameter: "#C586C0", number: "#B5CEA8",
      string: "#CE9178", stringEscape: "#D7BA7D", comment: "#6A9955",
    },
  },
  {
    id: "dracula",
    label: "Dracula",
    kind: "dark",
    ui: { background: "#282a36", foreground: "#f8f8f2", panel: "#21222c", border: "#44475a", muted: "#9ea4c4", danger: "#ff5555" },
    editor: {
      background: "#282A36", foreground: "#F8F8F2", lineHighlight: "#343746",
      lineNumber: "#6272A4", activeLineNumber: "#F8F8F2", selection: "#44475A", cursor: "#F8F8F0",
    },
    tokens: {
      keyword: "#FF79C6", function: "#50FA7B", constant: "#BD93F9", operator: "#FF79C6", delimiter: "#F8F8F2",
      identifier: "#F8F8F2", type: "#8BE9FD", parameter: "#FFB86C", number: "#BD93F9",
      string: "#F1FA8C", stringEscape: "#FF79C6", comment: "#6272A4", italic: ["type", "parameter"],
    },
  },
  {
    id: "one-dark",
    label: "One Dark",
    kind: "dark",
    ui: { background: "#282c34", foreground: "#abb2bf", panel: "#21252b", border: "#3e4451", muted: "#7f848e", danger: "#e06c75" },
    editor: {
      background: "#282C34", foreground: "#ABB2BF", lineHighlight: "#2C313C",
      lineNumber: "#495162", activeLineNumber: "#ABB2BF", selection: "#3E4451", cursor: "#528BFF",
    },
    tokens: {
      keyword: "#C678DD", function: "#61AFEF", constant: "#D19A66", operator: "#56B6C2", delimiter: "#ABB2BF",
      identifier: "#ABB2BF", type: "#E5C07B", parameter: "#E06C75", number: "#D19A66",
      string: "#98C379", stringEscape: "#56B6C2", comment: "#5C6370", italic: ["comment"],
    },
  },
  {
    id: "monokai",
    label: "Monokai",
    kind: "dark",
    ui: { background: "#272822", foreground: "#f8f8f2", panel: "#1e1f1c", border: "#3e3d32", muted: "#a59f85", danger: "#f92672" },
    editor: {
      background: "#272822", foreground: "#F8F8F2", lineHighlight: "#3E3D32",
      lineNumber: "#90908A", activeLineNumber: "#C2C2BF", selection: "#49483E", cursor: "#F8F8F0",
    },
    tokens: {
      keyword: "#F92672", function: "#A6E22E", constant: "#AE81FF", operator: "#F92672", delimiter: "#F8F8F2",
      identifier: "#F8F8F2", type: "#66D9EF", parameter: "#FD971F", number: "#AE81FF",
      string: "#E6DB74", stringEscape: "#AE81FF", comment: "#75715E", italic: ["type", "parameter"],
    },
  },
  {
    id: "github-dark",
    label: "GitHub Dark",
    kind: "dark",
    ui: { background: "#0d1117", foreground: "#e6edf3", panel: "#010409", border: "#30363d", muted: "#8b949e", danger: "#f85149" },
    editor: {
      background: "#0D1117", foreground: "#E6EDF3", lineHighlight: "#161B22",
      lineNumber: "#6E7681", activeLineNumber: "#E6EDF3", selection: "#264F78", cursor: "#58A6FF",
    },
    tokens: {
      keyword: "#FF7B72", function: "#D2A8FF", constant: "#79C0FF", operator: "#FF7B72", delimiter: "#E6EDF3",
      identifier: "#E6EDF3", type: "#7EE787", parameter: "#FFA657", number: "#79C0FF",
      string: "#A5D6FF", stringEscape: "#7EE787", comment: "#8B949E",
    },
  },
  {
    id: "nord",
    label: "Nord",
    kind: "dark",
    ui: { background: "#2e3440", foreground: "#d8dee9", panel: "#272c36", border: "#3b4252", muted: "#9aa4b6", danger: "#bf616a" },
    editor: {
      background: "#2E3440", foreground: "#D8DEE9", lineHighlight: "#3B4252",
      lineNumber: "#4C566A", activeLineNumber: "#D8DEE9", selection: "#434C5E", cursor: "#D8DEE9",
    },
    tokens: {
      keyword: "#81A1C1", function: "#88C0D0", constant: "#81A1C1", operator: "#81A1C1", delimiter: "#ECEFF4",
      identifier: "#D8DEE9", type: "#8FBCBB", parameter: "#D08770", number: "#B48EAD",
      string: "#A3BE8C", stringEscape: "#EBCB8B", comment: "#616E88", italic: ["comment"],
    },
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    kind: "dark",
    ui: { background: "#1a1b26", foreground: "#c0caf5", panel: "#16161e", border: "#292e42", muted: "#787c99", danger: "#f7768e" },
    editor: {
      background: "#1A1B26", foreground: "#A9B1D6", lineHighlight: "#292E42",
      lineNumber: "#3B4261", activeLineNumber: "#737AA2", selection: "#33467C", cursor: "#C0CAF5",
    },
    tokens: {
      keyword: "#BB9AF7", function: "#7AA2F7", constant: "#FF9E64", operator: "#89DDFF", delimiter: "#89DDFF",
      identifier: "#C0CAF5", type: "#2AC3DE", parameter: "#E0AF68", number: "#FF9E64",
      string: "#9ECE6A", stringEscape: "#89DDFF", comment: "#565F89", italic: ["comment"],
    },
  },
  {
    id: "solarized-dark",
    label: "Solarized Dark",
    kind: "dark",
    ui: { background: "#002b36", foreground: "#93a1a1", panel: "#00212b", border: "#0b4452", muted: "#839496", danger: "#dc322f" },
    editor: {
      background: "#002B36", foreground: "#839496", lineHighlight: "#073642",
      lineNumber: "#586E75", activeLineNumber: "#93A1A1", selection: "#274642", cursor: "#839496",
    },
    tokens: {
      keyword: "#859900", function: "#268BD2", constant: "#CB4B16", operator: "#859900", delimiter: "#839496",
      identifier: "#839496", type: "#B58900", parameter: "#6C71C4", number: "#D33682",
      string: "#2AA198", stringEscape: "#DC322F", comment: "#586E75", italic: ["comment"],
    },
  },
];

export const DEFAULT_LIGHT_SCHEME = "vs-light";
export const DEFAULT_DARK_SCHEME = "dark-plus";

export function getColorScheme(id: string): ColorScheme {
  return COLOR_SCHEMES.find((scheme) => scheme.id === id) ?? COLOR_SCHEMES.find((scheme) => scheme.id === DEFAULT_LIGHT_SCHEME)!;
}
