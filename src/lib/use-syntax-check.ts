"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Проверка синтаксиса при вводе: включена по умолчанию, выбор хранится в браузере. */
const KEY = "query-editor:syntax-check";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSyntaxCheck(): [boolean, () => void] {
  // На сервере — включена; в браузере значение подхватывается после гидрации.
  const enabled = useSyncExternalStore(subscribe, read, () => true);
  const toggle = useCallback(() => {
    try {
      localStorage.setItem(KEY, read() ? "off" : "on");
    } catch {}
    listeners.forEach((listener) => listener());
  }, []);
  return [enabled, toggle];
}
