import "server-only";
import { getProvider, type ProviderInfo } from "../providers";

export type ResolvedConnection = {
  provider: ProviderInfo;
  apiKey: string;
  model: string;
  baseUrl: string;
};

/**
 * Проверяет настройки, пришедшие из браузера. Адрес облачных провайдеров
 * всегда берётся из каталога — прокси не отправит ключ на чужой сервер.
 */
export function resolveConnection(
  input: unknown,
  { requireModel }: { requireModel: boolean },
): ResolvedConnection | { error: string } {
  if (!input || typeof input !== "object") return { error: "Не заданы настройки подключения" };
  const { provider: providerId, apiKey, model, baseUrl } = input as Record<string, unknown>;

  const provider = typeof providerId === "string" ? getProvider(providerId) : undefined;
  if (!provider) return { error: "Неизвестный провайдер" };

  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (provider.requiresKey && !key) {
    return { error: `Укажите API-ключ ${provider.label} в настройках` };
  }

  const modelName = typeof model === "string" ? model.trim() : "";
  if (requireModel && !modelName) return { error: "Укажите модель в настройках" };

  let url = provider.defaultBaseUrl;
  if (provider.customBaseUrl && typeof baseUrl === "string" && baseUrl.trim()) {
    try {
      const parsed = new URL(baseUrl.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
      url = parsed.toString();
    } catch {
      return { error: "Некорректный адрес сервера" };
    }
  }

  return { provider, apiKey: key, model: modelName, baseUrl: url };
}
