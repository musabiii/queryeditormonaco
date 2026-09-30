"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { COLOR_SCHEMES, type ColorScheme } from "@/lib/color-schemes";
import { ToolButton } from "./ToolButton";

const GROUPS = [
  { kind: "light", label: "Светлые" },
  { kind: "dark", label: "Тёмные" },
] as const;

type Props = {
  scheme: ColorScheme;
  onChange: (id: string) => void;
};

/** Кнопка на панели инструментов и меню выбора цветовой схемы. */
export function ThemePicker({ scheme, onChange }: Props) {
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const open = position !== null;

  const close = (returnFocus: boolean) => {
    setPosition(null);
    if (returnFocus) rootRef.current?.querySelector<HTMLElement>("button")?.focus();
  };

  // Меню открыто: закрываем по клику снаружи и Escape, фокус — на текущую схему.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPosition(null);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setPosition(null);
        rootRef.current?.querySelector<HTMLElement>("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      close(false);
      return;
    }
    // Шапка прокручивается по горизонтали и обрезала бы выпадающее меню,
    // поэтому меню позиционируется относительно окна.
    const rect = rootRef.current!.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  };

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const options = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const index = options.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    options[(next + options.length) % options.length]?.focus();
  };

  return (
    <div ref={rootRef}>
      <ToolButton label={`Цветовая схема: ${scheme.label}`} onClick={toggle} pressed={open}>
        <path d="M8 1.75a6.25 6.25 0 1 0 0 12.5c.9 0 1.4-.7 1.1-1.5-.4-1 .2-2 1.3-2h1.6a2.25 2.25 0 0 0 2.25-2.25A6.25 6.25 0 0 0 8 1.75Z" />
        <circle cx="4.9" cy="7.3" r=".9" />
        <circle cx="7.3" cy="4.6" r=".9" />
        <circle cx="10.6" cy="5.4" r=".9" />
      </ToolButton>

      {position && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Цветовая схема"
          onKeyDown={moveFocus}
          style={{ top: position.top, right: position.right }}
          className="fixed z-50 max-h-[calc(100dvh-4rem)] w-60 overflow-y-auto rounded-lg border border-border bg-background p-1 text-foreground shadow-xl"
        >
          {GROUPS.map((group) => (
            <div key={group.kind} role="group" aria-label={group.label}>
              <div className="px-2 pt-2 pb-1 text-xs font-semibold text-muted">{group.label}</div>
              {COLOR_SCHEMES.filter((s) => s.kind === group.kind).map((option) => {
                const selected = option.id === scheme.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(option.id);
                      close(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-border/60 focus-visible:bg-border/60 focus-visible:outline-none"
                  >
                    <Swatch scheme={option} />
                    <span className="flex-1 truncate">{option.label}</span>
                    {selected && (
                      <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="m3 8.5 3 3 7-7" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Миниатюра схемы: фон редактора и цвета ключевых слов, функций и строк. */
function Swatch({ scheme }: { scheme: ColorScheme }) {
  const { editor, tokens } = scheme;
  return (
    <span
      className="flex h-5 w-9 shrink-0 items-center justify-center gap-0.5 rounded border border-border"
      style={{ background: editor.background }}
      aria-hidden
    >
      {[tokens.keyword, tokens.function, tokens.string].map((color, i) => (
        <span key={i} className="size-1.5 rounded-full" style={{ background: color }} />
      ))}
    </span>
  );
}
