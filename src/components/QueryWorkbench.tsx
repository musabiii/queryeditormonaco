"use client";

import { useState } from "react";
import { SAMPLE_QUERY } from "@/lib/sample-query";
import type { Theme } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";
import { QueryEditor, type EditorStatus } from "./QueryEditor";

export function QueryWorkbench() {
  const [theme, setTheme] = useTheme();
  const [status, setStatus] = useState<EditorStatus | null>(null);

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-panel px-4">
        <h1 className="text-sm font-semibold">Редактор запросов 1С</h1>
        <ThemeToggle theme={theme} onChange={setTheme} />
      </header>

      <main className="min-h-0 flex-1">
        <QueryEditor defaultValue={SAMPLE_QUERY} theme={theme} onStatusChange={setStatus} />
      </main>

      <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-border bg-panel px-4 text-xs text-muted">
        {status && (
          <>
            <span>
              Стр {status.line}, стлб {status.column}
            </span>
            {status.selected > 0 && <span>Выделено: {status.selected}</span>}
            <span>Строк: {status.lineCount}</span>
          </>
        )}
        <span className="ml-auto">Язык запросов 1С</span>
      </footer>
    </div>
  );
}

function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const next = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Тёмная тема" : "Светлая тема";

  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      title={label}
      aria-label={label}
      className="ml-auto flex size-7 items-center justify-center rounded-md text-muted hover:bg-border/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
