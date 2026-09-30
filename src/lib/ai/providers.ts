/** Каталог поддерживаемых провайдеров ИИ. Общий для браузера и сервера. */

export type ProviderId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "openrouter"
  | "ollama"
  | "lmstudio";

export type ProviderInfo = {
  id: ProviderId;
  label: string;
  /** Через какой SDK ходить на сервере. */
  api: "anthropic" | "openai-compatible";
  /** Адрес API. Для облачных провайдеров сервер использует только его. */
  defaultBaseUrl: string;
  /** Можно ли указать свой адрес (локальные модели могут жить на другом хосте). */
  customBaseUrl: boolean;
  requiresKey: boolean;
  /** Модель по умолчанию; актуальный список подгружается из API кнопкой в настройках. */
  defaultModel: string;
  /** Где получить ключ или как запустить. */
  hint: string;
};

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    api: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    customBaseUrl: false,
    requiresKey: true,
    defaultModel: "claude-opus-5-5",
    hint: "Ключ: platform.claude.com → API Keys",
  },
  {
    id: "openai",
    label: "OpenAI",
    api: "openai-compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    customBaseUrl: false,
    requiresKey: true,
    defaultModel: "gpt-5",
    hint: "Ключ: platform.openai.com → API keys",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    api: "openai-compatible",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    customBaseUrl: false,
    requiresKey: true,
    defaultModel: "gemini-2.5-flash",
    hint: "Ключ: aistudio.google.com → Get API key",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    api: "openai-compatible",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    customBaseUrl: false,
    requiresKey: true,
    defaultModel: "deepseek-chat",
    hint: "Ключ: platform.deepseek.com → API keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    api: "openai-compatible",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    customBaseUrl: false,
    requiresKey: true,
    defaultModel: "openrouter/auto",
    hint: "Ключ: openrouter.ai → Keys. Модели других провайдеров — через один ключ",
  },
  {
    id: "ollama",
    label: "Ollama (локально)",
    api: "openai-compatible",
    defaultBaseUrl: "http://localhost:11434/v1",
    customBaseUrl: true,
    requiresKey: false,
    defaultModel: "",
    hint: "Запустите Ollama и скачайте модель: ollama pull <модель>",
  },
  {
    id: "lmstudio",
    label: "LM Studio (локально)",
    api: "openai-compatible",
    defaultBaseUrl: "http://localhost:1234/v1",
    customBaseUrl: true,
    requiresKey: false,
    defaultModel: "",
    hint: "В LM Studio загрузите модель и включите сервер (Developer → Start Server)",
  },
];

export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

/** Настройки подключения, которые браузер передаёт серверу с каждым запросом. */
export type ProviderConnection = {
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
};
