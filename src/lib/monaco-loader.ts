import { loader } from "@monaco-editor/react";

/** Monaco раздаётся из public/monaco (см. scripts/copy-monaco.mjs), без CDN. */
const MONACO_BASE = "/monaco/vs";

loader.config({ paths: { vs: MONACO_BASE } });

let loading: Promise<void> | undefined;

/**
 * Загружает Monaco с русским интерфейсом.
 *
 * Файл локализации — обычный скрипт, который задаёт глобальные строки, поэтому
 * он должен выполниться до загрузки редактора. Штатная опция загрузчика "vs/nls"
 * с monaco-editor 0.57 зависает: загрузчик ждёт от этого файла AMD-модуль.
 */
export function loadMonaco(): Promise<void> {
  loading ??= injectScript(`${MONACO_BASE}/nls/lang/ru.js`)
    // Без локализации редактор всё равно работает, просто с английским интерфейсом.
    .catch(() => undefined)
    .then(() => loader.init())
    .then(() => undefined);
  return loading;
}

function injectScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    document.head.appendChild(script);
  });
}
