"use client";

import type * as MonacoApi from "monaco-editor";
import { useEffect, useState, type ReactNode } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { LANGUAGE_ID } from "@/lib/query-language";

type Segment =
  | { kind: "text"; text: string }
  | { kind: "code"; code: string; complete: boolean };

type Actions = {
  onInsert: (code: string) => void;
  onReplaceAll: (code: string) => void;
};

/** Ответ модели: текст с простой разметкой и блоки кода с действиями. */
export function AiMessageContent({ text, ...actions }: { text: string } & Actions) {
  return (
    <div className="space-y-2">
      {parseSegments(text).map((segment, i) =>
        segment.kind === "code" ? (
          <CodeBlock key={i} code={segment.code} complete={segment.complete} {...actions} />
        ) : (
          <TextBlock key={i} text={segment.text} />
        ),
      )}
    </div>
  );
}

/** Делит текст на обычный текст и блоки ```кода```; незакрытый блок — ещё пишется. */
function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let rest = text;
  while (rest) {
    const open = rest.indexOf("```");
    if (open < 0) {
      segments.push({ kind: "text", text: rest });
      break;
    }
    if (open > 0) segments.push({ kind: "text", text: rest.slice(0, open) });

    const lineEnd = rest.indexOf("\n", open);
    if (lineEnd < 0) break; // Пишется строка с меткой языка.
    const close = rest.indexOf("```", lineEnd + 1);
    const code = rest.slice(lineEnd + 1, close < 0 ? undefined : close);
    segments.push({ kind: "code", code: code.replace(/\n$/, ""), complete: close >= 0 });
    rest = close < 0 ? "" : rest.slice(close + 3).replace(/^\n/, "");
  }
  return segments.filter((segment) => segment.kind === "code" || segment.text.trim());
}

function TextBlock({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap">
      {text
        .trim()
        .split("\n")
        .map((line, i) => {
          const heading = /^#{1,6}\s+(.*)$/.exec(line);
          return (
            <span key={i}>
              {i > 0 && "\n"}
              {heading ? <strong>{inline(heading[1])}</strong> : inline(line)}
            </span>
          );
        })}
    </div>
  );
}

/** `код` и **жирный** внутри строки. */
function inline(line: string): ReactNode[] {
  return line.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="rounded bg-border/60 px-1 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function CodeBlock({ code, complete, onInsert, onReplaceAll }: { code: string; complete: boolean } & Actions) {
  const html = useColorized(complete ? code : null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <pre className="overflow-x-auto p-2.5 font-mono text-[13px] leading-5 [tab-size:4]">
        {html ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{code}</code>}
      </pre>
      {complete && (
        <div className="flex flex-wrap gap-1 border-t border-border px-2 py-1.5">
          <ActionButton onClick={() => onInsert(code)} title="Вставить на место выделения или в позицию курсора">
            Вставить
          </ActionButton>
          <ActionButton onClick={() => onReplaceAll(code)} title="Заменить весь текст в редакторе (Ctrl+Z отменит)">
            Заменить всё
          </ActionButton>
          <ActionButton
            onClick={async () => {
              if (await copyToClipboard(code)) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            }}
          >
            {copied ? "Скопировано" : "Копировать"}
          </ActionButton>
        </div>
      )}
    </div>
  );
}

function ActionButton({ children, onClick, title }: { children: ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded px-2 py-0.5 text-xs text-muted hover:bg-border/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground"
    >
      {children}
    </button>
  );
}

/** Подсветка кода той же грамматикой и темой, что и в редакторе. */
function useColorized(code: string | null) {
  const [result, setResult] = useState<{ code: string; html: string } | null>(null);

  useEffect(() => {
    const monaco = (window as { monaco?: typeof MonacoApi }).monaco;
    if (code === null || !monaco) return;
    let active = true;
    monaco.editor.colorize(code, LANGUAGE_ID, { tabSize: 4 }).then((html) => {
      if (active) setResult({ code, html });
    });
    return () => {
      active = false;
    };
  }, [code]);

  return result && result.code === code ? result.html : null;
}
