"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { DARK_MEDIA_QUERY, THEME_STORAGE_KEY, type Theme } from "./theme";

const listeners = new Set<() => void>();
// Запасной вариант, если localStorage недоступен (приватный режим и т.п.).
let chosenTheme: Theme | null = null;

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Хранилище недоступно — используем выбор из памяти или системную тему.
  }
  if (chosenTheme) return chosenTheme;
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? "dark" : "light";
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

/** Тема интерфейса: сохранённый выбор пользователя, иначе системная. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, readTheme, (): Theme => "light");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    chosenTheme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Выбор не сохранится между сессиями, но сработает сейчас.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return [theme, setTheme];
}
