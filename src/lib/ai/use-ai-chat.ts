"use client";

import { useCallback, useRef, useState } from "react";
import type { TablesStructure } from "../query-language";
import type { ChatEvent, ChatTurn } from "./protocol";
import type { ProviderConnection } from "./providers";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  /** Что показывается в чате. */
  text: string;
  /** Что ушло модели: у сообщений пользователя — вместе с текстом запроса из редактора. */
  content: string;
  notices: string[];
  error?: string;
  streaming?: boolean;
};

export type EditorContext = {
  query: string;
  selection: string;
  /** Реквизиты таблиц запроса из конфигурации; null — не передавать. */
  structure: TablesStructure | null;
};

let nextId = 0;
const newId = () => `m${++nextId}`;

export function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Текст запроса, который модель уже видела: повторно его не отправляем.
  const sentQueryRef = useRef<string | null>(null);
  // Так же и структура таблиц.
  const sentStructureRef = useRef<string | null>(null);

  const update = (id: string, change: (message: ChatMessage) => ChatMessage) =>
    setMessages((list) => list.map((message) => (message.id === id ? change(message) : message)));

  const send = useCallback(
    async (text: string, connection: ProviderConnection, context: EditorContext | null) => {
      if (busy || !text.trim()) return;

      const structure = context?.structure && context.structure.text !== sentStructureRef.current ? context.structure : null;
      const user: ChatMessage = {
        id: newId(),
        role: "user",
        text,
        content: withContext(text, context, sentQueryRef.current) + (structure ? `\n\n${structure.text}` : ""),
        notices: structure ? [`Переданы реквизиты таблиц: ${structure.tables.join(", ")}`] : [],
      };
      const assistant: ChatMessage = {
        id: newId(),
        role: "assistant",
        text: "",
        content: "",
        notices: [],
        streaming: true,
      };
      if (context?.query.trim()) sentQueryRef.current = context.query;
      if (structure) sentStructureRef.current = structure.text;

      // Модели уходит вся переписка; неудачные пустые ответы пропускаем.
      const history: ChatTurn[] = [...messages, user]
        .filter((message) => message.content)
        .map(({ role, content }) => ({ role, content }));

      setMessages((list) => [...list, user, assistant]);
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connection, messages: history }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Сервер ответил ${response.status}`);
        }

        for await (const event of readEvents(response.body)) {
          if (event.type === "text") {
            update(assistant.id, (m) => ({ ...m, text: m.text + event.text, content: m.content + event.text }));
          } else if (event.type === "notice") {
            update(assistant.id, (m) => ({ ...m, notices: [...m.notices, event.message] }));
          } else {
            update(assistant.id, (m) => ({ ...m, error: event.message }));
          }
        }
      } catch (error) {
        const message = controller.signal.aborted
          ? null
          : error instanceof Error
            ? error.message
            : String(error);
        update(assistant.id, (m) => ({
          ...m,
          error: message ?? undefined,
          notices: message ? m.notices : [...m.notices, "Остановлено"],
        }));
      } finally {
        update(assistant.id, (m) => ({ ...m, streaming: false }));
        abortRef.current = null;
        setBusy(false);
      }
    },
    [busy, messages],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    sentQueryRef.current = null;
    sentStructureRef.current = null;
    setMessages([]);
  }, []);

  return { messages, busy, send, stop, clear };
}

function withContext(text: string, context: EditorContext | null, alreadySent: string | null) {
  if (!context) return text;
  let content = text;
  const query = context.query.trim();
  if (query && context.query !== alreadySent) {
    content += `\n\nТекущий текст запроса в редакторе:\n\`\`\`sdbl\n${context.query}\n\`\`\``;
  }
  if (context.selection.trim()) {
    content += `\n\nВыделенный фрагмент:\n\`\`\`sdbl\n${context.selection}\n\`\`\``;
  }
  return content;
}

/** Читает поток NDJSON: одно событие на строку. */
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line) as ChatEvent;
    }
    if (done) return;
  }
}
