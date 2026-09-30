import {
  COLOR_SCHEMES,
  DEFAULT_DARK_SCHEME,
  DEFAULT_LIGHT_SCHEME,
  type ColorScheme,
} from "./color-schemes";

export const THEME_STORAGE_KEY = "query-editor:theme";
export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/**
 * Идентификатор схемы по сохранённому значению. Раньше хранилось «light»/«dark» —
 * такой выбор переносится на классическую светлую и тёмную схемы.
 */
export function resolveSchemeId(saved: string | null, prefersDark: boolean): string {
  if (saved === "light") return DEFAULT_LIGHT_SCHEME;
  if (saved === "dark") return DEFAULT_DARK_SCHEME;
  if (saved && COLOR_SCHEMES.some((scheme) => scheme.id === saved)) return saved;
  return prefersDark ? DEFAULT_DARK_SCHEME : DEFAULT_LIGHT_SCHEME;
}

/** Переменные интерфейса из globals.css для схемы. */
export function uiVariables({ ui }: ColorScheme): Record<string, string> {
  return {
    "--background": ui.background,
    "--foreground": ui.foreground,
    "--panel": ui.panel,
    "--border": ui.border,
    "--muted": ui.muted,
    "--danger": ui.danger,
  };
}

export function applySchemeToDocument(scheme: ColorScheme) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(uiVariables(scheme))) root.style.setProperty(name, value);
  root.style.colorScheme = scheme.kind;
  root.dataset.theme = scheme.kind;
}

/**
 * Встраивается в <head> до гидратации, чтобы страница сразу рисовалась
 * в выбранной схеме, без вспышки другого фона.
 */
export const themeInitScript = `(function(){try{
var schemes=${JSON.stringify(
  Object.fromEntries(COLOR_SCHEMES.map((scheme) => [scheme.id, { kind: scheme.kind, vars: uiVariables(scheme) }])),
)};
var saved=null;try{saved=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}
var dark=matchMedia(${JSON.stringify(DARK_MEDIA_QUERY)}).matches;
var id=saved==="light"?${JSON.stringify(DEFAULT_LIGHT_SCHEME)}:saved==="dark"?${JSON.stringify(DEFAULT_DARK_SCHEME)}:saved;
var s=schemes[id]||schemes[dark?${JSON.stringify(DEFAULT_DARK_SCHEME)}:${JSON.stringify(DEFAULT_LIGHT_SCHEME)}];
var r=document.documentElement;for(var k in s.vars)r.style.setProperty(k,s.vars[k]);
r.style.colorScheme=s.kind;r.dataset.theme=s.kind;
}catch(e){}})()`;
