"use client";

import { useEffect, useRef, useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { ToolButton } from "./ToolButton";
import type { ColorScheme } from "@/lib/color-schemes";
import { ThemePicker } from "./ThemePicker";

type Props = {
  onComment: () => void;
  onUncomment: () => void;
  onFormat: () => void;
  getText: () => string;
  showWhitespace: boolean;
  onToggleWhitespace: () => void;
  aiOpen: boolean;
  onToggleAi: () => void;
  onOpenConfigurations: () => void;
  treeOpen: boolean;
  onToggleTree: () => void;
  scheme: ColorScheme;
  onSchemeChange: (id: string) => void;
};

export function QueryToolbar(props: Props) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-panel px-4">
      <h1 className="mr-3 hidden shrink-0 text-sm font-semibold whitespace-nowrap sm:block">Редактор запросов 1С</h1>

      <div role="toolbar" aria-label="Панель инструментов" className="flex items-center gap-1">
        <ToolButton label="Структура конфигурации" onClick={props.onToggleTree} pressed={props.treeOpen}>
          <path d="M2.5 3h4M4.5 3v9.5M4.5 7.5h3M4.5 12.5h3M9 7.5h4.5M9 12.5h4.5" />
        </ToolButton>

        <Divider />

        <ToolButton label="Закомментировать (Ctrl+Num /)" onClick={props.onComment}>
          <path d="M6 2.5 3 12.5M10 2.5 7 12.5" />
          <path d="M12.5 10v5M10 12.5h5" />
        </ToolButton>
        <ToolButton label="Раскомментировать (Ctrl+Shift+Num /)" onClick={props.onUncomment}>
          <path d="M6 2.5 3 12.5M10 2.5 7 12.5" />
          <path d="m10.5 10.5 4 4m0-4-4 4" />
        </ToolButton>

        <Divider />

        <ToolButton label="Форматировать (Shift+Alt+F)" onClick={props.onFormat}>
          <path d="M2 3h12M5 6.5h9M5 10h9M2 13.5h8" />
        </ToolButton>
        <ToolButton
          label="Показать пробелы и табы"
          onClick={props.onToggleWhitespace}
          pressed={props.showWhitespace}
        >
          <path d="M8 14V2.5h5M11 2.5V14M8 2.5a3 3 0 0 0 0 6" />
        </ToolButton>

        <Divider />

        <CopyButton getText={props.getText} />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <ToolButton label="Конфигурации" onClick={props.onOpenConfigurations}>
          <ellipse cx="8" cy="3.75" rx="5" ry="2" />
          <path d="M3 3.75v8.5c0 1.1 2.24 2 5 2s5-.9 5-2v-8.5M3 8c0 1.1 2.24 2 5 2s5-.9 5-2" />
        </ToolButton>
        <ToolButton label="ИИ-помощник" onClick={props.onToggleAi} pressed={props.aiOpen}>
          <path d="M6.5 2.5 7.6 5.9a1 1 0 0 0 .6.6l3.3 1.1-3.3 1.1a1 1 0 0 0-.6.6L6.5 12.7 5.4 9.3a1 1 0 0 0-.6-.6L1.5 7.6l3.3-1.1a1 1 0 0 0 .6-.6Z" />
          <path d="M12.5 1.5v3M11 3h3M12 11v3M10.5 12.5h3" />
        </ToolButton>
        <ThemePicker scheme={props.scheme} onChange={props.onSchemeChange} />
      </div>
    </header>
  );
}

function CopyButton({ getText }: { getText: () => string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    const result = (await copyToClipboard(getText())) ? "copied" : "failed";
    setState(result);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1500);
  };

  const label =
    state === "copied" ? "Скопировано" : state === "failed" ? "Не удалось скопировать" : "Скопировать весь текст";

  return (
    <ToolButton label={label} onClick={copy}>
      {state === "copied" ? (
        <path d="m3 8.5 3 3 7-7" />
      ) : (
        <>
          <rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.5" />
          <path d="M10.5 5.5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2" />
        </>
      )}
    </ToolButton>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden />;
}
