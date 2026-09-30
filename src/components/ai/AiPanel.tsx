"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { getProvider } from "@/lib/ai/providers";
import { activeConnection, useAiSettings, type AiSettings } from "@/lib/ai/settings";
import { useAiChat, type ChatMessage, type EditorContext } from "@/lib/ai/use-ai-chat";
import { ToolButton } from "../ToolButton";
import { AiMessageContent } from "./AiMessageContent";
import { AiSettingsDialog } from "./AiSettingsDialog";

const QUICK_ACTIONS = [
  {
    label: "Объяснить",
    prompt:
      "Объясни, что делает этот запрос: какие данные выбирает, как соединяются таблицы и что попадает в результат.",
  },
  {
    label: "Найти ошибки",
    prompt:
      "Проверь запрос на синтаксические и логические ошибки. Для каждой укажи, где она и как исправить. Если ошибок нет, так и скажи.",
  },
  {
    label: "Оптимизировать",
    prompt:
      "Предложи, как ускорить этот запрос, и объясни почему. В конце приведи исправленный текст запроса целиком.",
  },
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  getContext: () => EditorContext;
  onInsert: (text: string) => void;
  onReplaceAll: (text: string) => void;
};

/** Чат с ИИ справа от редактора. Остаётся смонтированным, когда скрыт, чтобы не терять переписку. */
export function AiPanel({ open, onClose, getContext, onInsert, onReplaceAll }: Props) {
  const [settings, saveSettings] = useAiSettings();
  const { messages, busy, send, stop, clear } = useAiChat();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [includeQuery, setIncludeQuery] = useState(true);

  const connection = activeConnection(settings);
  const provider = getProvider(connection.provider)!;
  const problem = configurationProblem(settings);

  const submit = (text: string) => {
    if (problem || busy || !text.trim()) return;
    void send(text.trim(), connection, includeQuery ? getContext() : null);
    setInput("");
  };

  return (
    <aside
      aria-label="ИИ-помощник"
      className={`w-[26rem] max-w-[45vw] shrink-0 flex-col border-l border-border bg-panel ${open ? "hidden md:flex" : "hidden"}`}
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border pr-1 pl-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">ИИ-помощник</h2>
        <span className="ml-1 truncate text-xs text-muted" title={`${provider.label}: ${connection.model}`}>
          {connection.model || provider.label}
        </span>
        <div className="ml-auto flex">
          <ToolButton label="Очистить переписку" onClick={clear}>
            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
          </ToolButton>
          <ToolButton label="Настройки ИИ" onClick={() => setSettingsOpen(true)}>
            <circle cx="8" cy="8" r="2" />
            <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
          </ToolButton>
          <ToolButton label="Закрыть панель" onClick={onClose}>
            <path d="m4 4 8 8m0-8-8 8" />
          </ToolButton>
        </div>
      </div>

      <MessageList
        messages={messages}
        emptyState={
          problem ? (
            <div className="space-y-3 text-sm">
              <p>{problem}</p>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-border/60"
              >
                Открыть настройки
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Спросите о запросе в редакторе или опишите, какой запрос нужно составить.
            </p>
          )
        }
        onInsert={onInsert}
        onReplaceAll={onReplaceAll}
      />

      <div className="shrink-0 space-y-2 border-t border-border p-2">
        <div className="flex flex-wrap gap-1">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={Boolean(problem) || busy}
              onClick={() => submit(action.prompt)}
              className="rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-border/60 disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit(input);
            }
          }}
          rows={3}
          placeholder="Вопрос или задача (Enter — отправить, Shift+Enter — новая строка)"
          aria-label="Сообщение для ИИ"
          className="block w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-foreground"
        />

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={includeQuery} onChange={(e) => setIncludeQuery(e.target.checked)} />
            Передавать текст запроса
          </label>
          {busy ? (
            <button
              type="button"
              onClick={stop}
              className="ml-auto rounded-md border border-border px-3 py-1 text-sm hover:bg-border/60"
            >
              Стоп
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submit(input)}
              disabled={Boolean(problem) || !input.trim()}
              className="ml-auto rounded-md bg-foreground px-3 py-1 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40"
            >
              Отправить
            </button>
          )}
        </div>
      </div>

      {settingsOpen && (
        <AiSettingsDialog settings={settings} onSave={saveSettings} onClose={() => setSettingsOpen(false)} />
      )}
    </aside>
  );
}

function configurationProblem(settings: AiSettings): string | null {
  const provider = getProvider(settings.provider)!;
  const current = settings.providers[settings.provider];
  if (provider.requiresKey && !current.apiKey.trim()) {
    return `Чтобы начать, укажите API-ключ ${provider.label} в настройках.`;
  }
  if (!current.model.trim()) return `Выберите модель ${provider.label} в настройках.`;
  return null;
}

function MessageList({
  messages,
  emptyState,
  onInsert,
  onReplaceAll,
}: {
  messages: ChatMessage[];
  emptyState: ReactNode;
  onInsert: (text: string) => void;
  onReplaceAll: (text: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Пока приходит ответ, держим прокрутку внизу — если пользователь сам не ушёл выше.
  useEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  return (
    <div
      ref={listRef}
      onScroll={(e) => {
        const list = e.currentTarget;
        stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
      }}
      className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
      aria-live="polite"
    >
      {messages.length === 0
        ? emptyState
        : messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="ml-6 rounded-lg bg-border/60 px-3 py-2 text-sm whitespace-pre-wrap">
                {message.text}
              </div>
            ) : (
              <div key={message.id} className="space-y-1.5">
                {message.text ? (
                  <AiMessageContent text={message.text} onInsert={onInsert} onReplaceAll={onReplaceAll} />
                ) : (
                  message.streaming && <p className="text-sm text-muted">Думаю…</p>
                )}
                {message.notices.map((notice, i) => (
                  <p key={i} className="text-xs text-muted">
                    {notice}
                  </p>
                ))}
                {message.error && (
                  <p role="alert" className="text-sm text-danger">
                    {message.error}
                  </p>
                )}
              </div>
            ),
          )}
    </div>
  );
}
