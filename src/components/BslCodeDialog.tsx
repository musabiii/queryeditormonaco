"use client";

import { useEffect, useRef, useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

type Props = {
  code: string;
  onClose: () => void;
};

/** Код 1С с текстом запроса для копирования в модуль. Монтируется на время показа. */
export function BslCodeDialog({ code, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    dialogRef.current?.showModal();
    // Окно фокусирует поле с кодом — курсор в начало, без выделения.
    textRef.current?.setSelectionRange(0, 0);
    return () => clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    setCopied((await copyToClipboard(code)) ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied("idle"), 1500);
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="bsl-code-title"
      className="m-auto h-[85dvh] w-[64rem] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <div className="flex h-full flex-col">
        <h2 id="bsl-code-title" className="border-b border-border px-5 py-3 text-base font-semibold">
          Текст для кода 1С
        </h2>

        <textarea
          ref={textRef}
          readOnly
          value={code}
          spellCheck={false}
          aria-label="Код 1С"
          className="min-h-0 flex-1 resize-none bg-background px-5 py-3 font-mono text-sm leading-relaxed whitespace-pre text-foreground [tab-size:4] focus-visible:outline-none"
          style={{ fontFamily: "Consolas, 'Cascadia Mono', 'Courier New', monospace" }}
        />

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <span role="status" className="mr-auto text-sm text-muted">
            {copied === "copied" ? "Скопировано" : copied === "failed" ? "Не удалось скопировать" : ""}
          </span>
          <button
            type="button"
            onClick={copy}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            Скопировать
          </button>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-border/60"
          >
            Закрыть
          </button>
        </div>
      </div>
    </dialog>
  );
}
