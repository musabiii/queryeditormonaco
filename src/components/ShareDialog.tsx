"use client";

import { useEffect, useRef, useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

type Props = {
  /** Текст запроса, которым делимся. */
  text: string;
  onClose: () => void;
};

type State =
  | { status: "saving" }
  | { status: "done"; url: string; expiresAt: number }
  | { status: "error"; message: string };

type Saved = { url: string; expiresAt: number };

/**
 * Один и тот же текст — одна ссылка: повторное «Поделиться» без правок не плодит
 * копии на сервере (и двойной запуск эффекта в режиме разработки тоже).
 */
const savedByText = new Map<string, Promise<Saved>>();

function share(text: string): Promise<Saved> {
  let saved = savedByText.get(text);
  if (!saved) {
    saved = fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).then(async (response) => {
      const body = (await response.json().catch(() => null)) as { id?: string; expiresAt?: number; error?: string } | null;
      if (!response.ok || !body?.id || !body.expiresAt) {
        throw new Error(body?.error ?? `Сервер ответил ${response.status}`);
      }
      return { url: `${window.location.origin}/${body.id}`, expiresAt: body.expiresAt };
    });
    // Ошибку не запоминаем — следующая попытка отправит запрос заново.
    saved.catch(() => savedByText.delete(text));
    savedByText.set(text, saved);
  }
  return saved;
}

/** «Поделиться»: сохраняет запрос на сервере и показывает ссылку. Монтируется на время показа. */
export function ShareDialog({ text, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ status: "saving" });
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    dialogRef.current?.showModal();
    let current = true;
    share(text).then(
      (saved) => current && setState({ status: "done", ...saved }),
      (error: unknown) =>
        current && setState({ status: "error", message: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      current = false;
    };
  }, [text]);

  const copy = async (url: string) => {
    setCopied((await copyToClipboard(url)) ? "copied" : "failed");
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="share-title"
      className="m-auto w-[34rem] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <h2 id="share-title" className="border-b border-border px-5 py-3 text-base font-semibold">
        Поделиться запросом
      </h2>

      <div className="space-y-3 px-5 py-4 text-sm">
        {state.status === "saving" && <p role="status" className="text-muted">Сохраняю запрос…</p>}
        {state.status === "error" && (
          <p role="alert" className="text-danger">
            {state.message}
          </p>
        )}
        {state.status === "done" && (
          <>
            <div className="flex gap-2">
              <input
                readOnly
                value={state.url}
                aria-label="Ссылка на запрос"
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md border border-border bg-panel px-2.5 py-1.5 font-mono text-sm focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-foreground"
              />
              <button
                type="button"
                onClick={() => copy(state.url)}
                className="shrink-0 rounded-md bg-foreground px-3 py-1.5 font-medium text-background hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              >
                {copied === "copied" ? "Скопировано" : "Скопировать"}
              </button>
            </div>
            {copied === "failed" && <p className="text-danger">Не удалось скопировать — выделите ссылку и нажмите Ctrl+C.</p>}
            <p className="text-muted">
              По ссылке откроется редактор с этим запросом. Ссылка действует до{" "}
              {new Date(state.expiresAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}{" "}
              — её может открыть любой, у кого она есть.
            </p>
          </>
        )}
      </div>

      <div className="flex justify-end border-t border-border px-5 py-3">
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-border/60"
        >
          Закрыть
        </button>
      </div>
    </dialog>
  );
}
