/** Формат обмена между панелью ИИ и серверными маршрутами /api/ai/*. */

import type { ProviderConnection } from "./providers";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatRequest = {
  connection: ProviderConnection;
  messages: ChatTurn[];
};

/** Ответ /api/ai/chat — поток строк JSON (NDJSON), по одному событию на строку. */
export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "notice"; message: string }
  | { type: "error"; message: string };

export type ModelsRequest = { connection: ProviderConnection };

export type ModelsResponse = { models: string[] } | { error: string };
