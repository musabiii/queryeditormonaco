import "server-only";
import OpenAI from "openai";
import type { ChatEvent, ChatTurn } from "../protocol";
import { SYSTEM_PROMPT } from "../system-prompt";
import type { ResolvedConnection } from "./connection";

/** OpenAI, Gemini, DeepSeek, OpenRouter, Ollama и LM Studio — все через OpenAI-совместимый API. */
function createClient(connection: ResolvedConnection) {
  return new OpenAI({
    // Локальным серверам ключ не нужен, но SDK требует непустое значение.
    apiKey: connection.apiKey || "local",
    baseURL: connection.baseUrl,
    maxRetries: 1,
    defaultHeaders:
      connection.provider.id === "openrouter" ? { "X-Title": "1C Query Editor" } : undefined,
  });
}

export async function* streamOpenAiCompatibleChat(
  connection: ResolvedConnection,
  messages: ChatTurn[],
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const stream = await createClient(connection).chat.completions.create(
    {
      model: connection.model,
      stream: true,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    },
    { signal },
  );

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (choice?.delta?.content) yield { type: "text", text: choice.delta.content };
    if (choice?.finish_reason === "length") {
      yield { type: "notice", message: "Ответ обрезан: достигнут лимит длины" };
    } else if (choice?.finish_reason === "content_filter") {
      yield { type: "error", message: "Ответ остановлен фильтром содержимого провайдера" };
    }
  }
}

export async function listOpenAiCompatibleModels(connection: ResolvedConnection): Promise<string[]> {
  const models: string[] = [];
  for await (const model of createClient(connection).models.list()) {
    // Gemini отдаёт имена вида «models/gemini-...», а в запросе ждёт без префикса.
    models.push(model.id.replace(/^models\//, ""));
  }
  return models;
}
