"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ModelsResponse } from "@/lib/ai/protocol";
import { PROVIDERS, getProvider, type ProviderId } from "@/lib/ai/providers";
import type { AiSettings, ProviderSettings } from "@/lib/ai/settings";

type Check = { state: "idle" | "loading" | "ok" | "error"; message?: string };

type Props = {
  settings: AiSettings;
  onSave: (settings: AiSettings) => void;
  onClose: () => void;
};

/** Выбор провайдера, ключ, модель и адрес сервера. Монтируется только на время показа. */
export function AiSettingsDialog({ settings, onSave, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(settings);
  const [models, setModels] = useState<Partial<Record<ProviderId, string[]>>>({});
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const provider = getProvider(draft.provider)!;
  const current = draft.providers[draft.provider];

  const updateProvider = (id: ProviderId, change: Partial<ProviderSettings>) =>
    setDraft((d) => ({ ...d, providers: { ...d.providers, [id]: { ...d.providers[id], ...change } } }));
  const updateCurrent = (change: Partial<ProviderSettings>) => updateProvider(draft.provider, change);

  const loadModels = async () => {
    const id = draft.provider;
    setCheck({ state: "loading" });
    try {
      const response = await fetch("/api/ai/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection: { provider: id, ...current } }),
      });
      const result = (await response.json()) as ModelsResponse;
      if ("error" in result) {
        setCheck({ state: "error", message: result.error });
        return;
      }
      setModels((m) => ({ ...m, [id]: result.models }));
      if (!current.model && result.models[0]) updateProvider(id, { model: result.models[0] });
      setCheck({ state: "ok", message: `Подключение работает, моделей: ${result.models.length}` });
    } catch {
      setCheck({ state: "error", message: "Сервер редактора недоступен" });
    }
  };

  const loadedModels = models[draft.provider];

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[34rem] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <form
        method="dialog"
        onSubmit={() => onSave(draft)}
        className="flex max-h-[calc(100dvh-4rem)] flex-col"
      >
        <h2 className="border-b border-border px-5 py-3 text-base font-semibold">Настройки ИИ-помощника</h2>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <Field label="Провайдер">
            <select
              value={draft.provider}
              onChange={(e) => {
                setDraft((d) => ({ ...d, provider: e.target.value as ProviderId }));
                setCheck({ state: "idle" });
              }}
              className={inputClass}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">{provider.hint}</p>
          </Field>

          {provider.requiresKey && (
            <Field label="API-ключ">
              <div className="flex gap-2">
                <input
                  type={showKey ? "text" : "password"}
                  value={current.apiKey}
                  onChange={(e) => updateCurrent({ apiKey: e.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                  className={`${inputClass} font-mono`}
                />
                <button type="button" onClick={() => setShowKey((v) => !v)} className={secondaryButtonClass}>
                  {showKey ? "Скрыть" : "Показать"}
                </button>
              </div>
            </Field>
          )}

          {provider.customBaseUrl && (
            <Field label="Адрес сервера">
              <input
                type="url"
                value={current.baseUrl}
                placeholder={provider.defaultBaseUrl}
                onChange={(e) => updateCurrent({ baseUrl: e.target.value })}
                spellCheck={false}
                className={`${inputClass} font-mono`}
              />
            </Field>
          )}

          <Field label="Модель">
            <div className="flex gap-2">
              <input
                value={current.model}
                onChange={(e) => updateCurrent({ model: e.target.value })}
                placeholder={provider.defaultModel || "загрузите список или введите имя"}
                spellCheck={false}
                className={`${inputClass} font-mono`}
              />
              <button
                type="button"
                onClick={loadModels}
                disabled={check.state === "loading"}
                className={secondaryButtonClass}
              >
                {check.state === "loading" ? "Проверка…" : "Проверить и загрузить список"}
              </button>
            </div>
            {loadedModels && loadedModels.length > 0 && (
              <select
                aria-label="Модели провайдера"
                value={loadedModels.includes(current.model) ? current.model : ""}
                onChange={(e) => e.target.value && updateCurrent({ model: e.target.value })}
                className={`${inputClass} mt-2 font-mono`}
              >
                <option value="" disabled>
                  Выберите из списка ({loadedModels.length})
                </option>
                {loadedModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            )}
            {check.message && (
              <p
                role="status"
                className={`mt-1 text-xs ${check.state === "error" ? "text-danger" : "text-muted"}`}
              >
                {check.message}
              </p>
            )}
          </Field>

          <p className="rounded-md bg-panel px-3 py-2 text-xs leading-relaxed text-muted">
            Ключи хранятся только в этом браузере и передаются серверу редактора лишь для отправки
            запроса провайдеру. Текст запроса из редактора уходит выбранному провайдеру — если это
            нежелательно, используйте Ollama или LM Studio.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={() => dialogRef.current?.close()} className={secondaryButtonClass}>
            Отмена
          </button>
          <button
            type="submit"
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            Сохранить
          </button>
        </div>
      </form>
    </dialog>
  );
}

const inputClass =
  "w-full min-w-0 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-foreground";

const secondaryButtonClass =
  "shrink-0 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-border/60 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
