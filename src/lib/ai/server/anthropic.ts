import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ChatEvent, ChatTurn } from "../protocol";
import { SYSTEM_PROMPT } from "../system-prompt";
import type { ResolvedConnection } from "./connection";

/**
 * Модели с серверным переключением на резервную модель при отказе
 * (`fallbacks: "default"`): вместо отказа ответ продолжит модель,
 * которую Anthropic рекомендует для этой категории запросов.
 */
const MODELS_WITH_FALLBACK = new Set([
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);

function createClient(connection: ResolvedConnection) {
  return new Anthropic({ apiKey: connection.apiKey, maxRetries: 1 });
}

export async function* streamAnthropicChat(
  connection: ResolvedConnection,
  messages: ChatTurn[],
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const client = createClient(connection);
  const params = {
    model: connection.model,
    max_tokens: 64000,
    // Системный промпт одинаков во всех запросах — кэшируем его.
    cache_control: { type: "ephemeral" as const },
    system: SYSTEM_PROMPT,
    messages,
  };

  const stream = MODELS_WITH_FALLBACK.has(connection.model)
    ? client.beta.messages.stream(
        { ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" },
        { signal },
      )
    : client.beta.messages.stream(params, { signal });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "text", text: event.delta.text };
    } else if (event.type === "content_block_start" && event.content_block.type === "fallback") {
      const { from, to } = event.content_block;
      yield { type: "notice", message: `${from.model} отказалась отвечать, ответ продолжила ${to.model}` };
    }
  }

  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    yield { type: "error", message: "Модель отказалась отвечать на этот запрос" };
  } else if (message.stop_reason === "max_tokens") {
    yield { type: "notice", message: "Ответ обрезан: достигнут лимит длины" };
  }
}

export async function listAnthropicModels(connection: ResolvedConnection): Promise<string[]> {
  const models: string[] = [];
  for await (const model of createClient(connection).models.list()) models.push(model.id);
  return models;
}
