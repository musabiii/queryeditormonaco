export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "query-editor:theme";
export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/**
 * Встраивается в <head> до гидратации, чтобы страница сразу рисовалась
 * в нужной теме, без вспышки светлого фона.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t!=="light"&&t!=="dark")t=matchMedia(${JSON.stringify(
  DARK_MEDIA_QUERY,
)}).matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}})()`;
