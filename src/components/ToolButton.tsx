"use client";

import type { ReactNode } from "react";

/** Цвет значка по смыслу команды; классы целиком — чтобы Tailwind их нашёл. */
const TONES = {
  amber: "text-icon-amber",
  green: "text-icon-green",
  red: "text-icon-red",
  blue: "text-icon-blue",
  orange: "text-icon-orange",
  teal: "text-icon-teal",
  indigo: "text-icon-indigo",
  purple: "text-icon-purple",
  pink: "text-icon-pink",
} as const;

export type ToolTone = keyof typeof TONES;

/**
 * Кнопка-значок панели инструментов: подсказка = доступное имя, pressed — для переключателей.
 * tone — цвет значка; без него значок серый и темнеет при наведении.
 */
export function ToolButton({
  label,
  onClick,
  pressed,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  tone?: ToolTone;
  children: ReactNode;
}) {
  const color = tone ? TONES[tone] : pressed ? "text-foreground" : "text-muted hover:text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={`flex size-7 items-center justify-center rounded-md hover:bg-border/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${color} ${
        pressed ? "bg-border/80" : ""
      }`}
    >
      <svg
        viewBox="0 0 16 16"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </button>
  );
}
