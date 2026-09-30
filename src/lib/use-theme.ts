"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { DEFAULT_LIGHT_SCHEME, getColorScheme, type ColorScheme } from "./color-schemes";
import { DARK_MEDIA_QUERY, THEME_STORAGE_KEY, applySchemeToDocument, resolveSchemeId } from "./theme";

const listeners = new Set<() => void>();
// Запасной вариант, если localStorage недоступен (приватный режим и т.п.).
let chosenScheme: string | null = null;

function readSchemeId(): string {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Хранилище недоступно — используем выбор из памяти или системную тему.
  }
  return resolveSchemeId(saved ?? chosenScheme, window.matchMedia(DARK_MEDIA_QUERY).matches);
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DARK_MEDIA_QUERY);
  listeners.add(onChange);
  media.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Цветовая схема: сохранённый выбор пользователя, иначе светлая или тёмная по системе. */
export function useColorScheme(): [ColorScheme, (id: string) => void] {
  const id = useSyncExternalStore(subscribe, readSchemeId, () => DEFAULT_LIGHT_SCHEME);
  const scheme = getColorScheme(id);

  useEffect(() => {
    applySchemeToDocument(scheme);
  }, [scheme]);

  const setScheme = useCallback((next: string) => {
    chosenScheme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Выбор не сохранится между сессиями, но сработает сейчас.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return [scheme, setScheme];
}
