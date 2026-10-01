"use client";

import { useCallback, useSyncExternalStore } from "react";
import { PROVIDERS, type ProviderConnection, type ProviderId } from "./providers";

export type ProviderSettings = { apiKey: string; model: string; baseUrl: string };

export type AiSettings = {
  provider: ProviderId;
  /** Настройки каждого провайдера хранятся отдельно, чтобы при переключении ключи не терялись. */
  providers: Record<ProviderId, ProviderSettings>;
  /** Вместе с текстом запроса передавать реквизиты и типы его таблиц из конфигурации. */
  sendTableStructure: boolean;
};

/** Ключи хранятся только в этом браузере и уходят на сервер редактора лишь вместе с запросом. */
const STORAGE_KEY = "query-editor:ai-settings";

export function defaultAiSettings(): AiSettings {
  const providers = Object.fromEntries(
    PROVIDERS.map((p) => [p.id, { apiKey: "", model: p.defaultModel, baseUrl: "" }]),
  ) as Record<ProviderId, ProviderSettings>;
  return { provider: "anthropic", providers, sendTableStructure: true };
}

export function activeConnection(settings: AiSettings): ProviderConnection {
  return { provider: settings.provider, ...settings.providers[settings.provider] };
}

// useSyncExternalStore требует один и тот же объект, пока данные не менялись.
let cachedRaw: string | null | undefined;
let cachedSettings: AiSettings = defaultAiSettings();
const serverSnapshot = defaultAiSettings();
const listeners = new Set<() => void>();

function readSettings(): AiSettings {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Хранилище недоступно — работаем с настройками из памяти.
    return cachedSettings;
  }
  if (raw === cachedRaw) return cachedSettings;
  cachedRaw = raw;
  cachedSettings = parse(raw);
  return cachedSettings;
}

function parse(raw: string | null): AiSettings {
  const settings = defaultAiSettings();
  if (!raw) return settings;
  try {
    const saved = JSON.parse(raw) as Partial<AiSettings>;
    if (saved.provider && saved.provider in settings.providers) settings.provider = saved.provider;
    if (typeof saved.sendTableStructure === "boolean") settings.sendTableStructure = saved.sendTableStructure;
    for (const id of Object.keys(settings.providers) as ProviderId[]) {
      settings.providers[id] = { ...settings.providers[id], ...saved.providers?.[id] };
    }
  } catch {
    // Повреждённые настройки — начинаем с умолчаний.
  }
  return settings;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useAiSettings(): [AiSettings, (settings: AiSettings) => void] {
  const settings = useSyncExternalStore(subscribe, readSettings, () => serverSnapshot);

  const save = useCallback((next: AiSettings) => {
    cachedSettings = next;
    try {
      const raw = JSON.stringify(next);
      localStorage.setItem(STORAGE_KEY, raw);
      cachedRaw = raw;
    } catch {
      // Не сохранится между сессиями, но будет работать до перезагрузки.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return [settings, save];
}
