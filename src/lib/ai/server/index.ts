import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ChatEvent, ChatTurn } from "../protocol";
import { listAnthropicModels, streamAnthropicChat } from "./anthropic";
import type { ResolvedConnection } from "./connection";
import { listOpenAiCompatibleModels, streamOpenAiCompatibleChat } from "./openai-compatible";

export { resolveConnection } from "./connection";

export function streamChat(
  connection: ResolvedConnection,
  messages: ChatTurn[],
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  return connection.provider.api === "anthropic"
    ? streamAnthropicChat(connection, messages, signal)
    : streamOpenAiCompatibleChat(connection, messages, signal);
}

export async function listModels(connection: ResolvedConnection): Promise<string[]> {
  const models =
    connection.provider.api === "anthropic"
      ? await listAnthropicModels(connection)
      : await listOpenAiCompatibleModels(connection);
  return [...new Set(models)].sort((a, b) => a.localeCompare(b));
}

/** Понятное сообщение об ошибке провайдера. Ключ в текст не попадает. */
export function describeError(error: unknown, connection: ResolvedConnection): string {
  const { label } = connection.provider;

  // Ошибки соединения — подклассы APIError, поэтому проверяются первыми.
  if (error instanceof Anthropic.APIConnectionError || error instanceof OpenAI.APIConnectionError) {
    return connection.provider.customBaseUrl
      ? `Не удалось подключиться к ${connection.baseUrl}. Проверьте, что ${label} запущен.`
      : `Не удалось подключиться к ${label}. Проверьте интернет-соединение.`;
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof OpenAI.AuthenticationError) {
    return `${label}: неверный API-ключ`;
  }
  if (error instanceof Anthropic.PermissionDeniedError || error instanceof OpenAI.PermissionDeniedError) {
    return `${label}: нет доступа — ключ не подходит для этой модели или региона`;
  }
  if (error instanceof Anthropic.NotFoundError || error instanceof OpenAI.NotFoundError) {
    return connection.model
      ? `${label}: модель «${connection.model}» не найдена`
      : `${label}: адрес API не найден (${connection.baseUrl})`;
  }
  if (error instanceof Anthropic.RateLimitError || error instanceof OpenAI.RateLimitError) {
    return `${label}: превышен лимит запросов или закончились средства на счёте`;
  }
  if (error instanceof Anthropic.APIError || error instanceof OpenAI.APIError) {
    return `${label}: ошибка ${error.status ?? ""} — ${error.message}`.replace(/\s+—/, " —");
  }
  return `Ошибка: ${error instanceof Error ? error.message : String(error)}`;
}
