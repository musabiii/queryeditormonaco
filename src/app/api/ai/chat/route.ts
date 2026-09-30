import { describeError, resolveConnection, streamChat } from "@/lib/ai/server";
import type { ChatEvent, ChatRequest, ChatTurn } from "@/lib/ai/protocol";

/** Защита от случайно огромных запросов: ~500 тыс. символов на всю переписку. */
const MAX_CONVERSATION_LENGTH = 500_000;

export async function POST(request: Request) {
  let body: Partial<ChatRequest>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const connection = resolveConnection(body.connection, { requireModel: true });
  if ("error" in connection) return Response.json({ error: connection.error }, { status: 400 });

  const messages = validateMessages(body.messages);
  if (!messages) return Response.json({ error: "Некорректная переписка" }, { status: 400 });

  const encoder = new TextEncoder();
  const encode = (event: ChatEvent) => encoder.encode(JSON.stringify(event) + "\n");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamChat(connection, messages, request.signal)) {
          controller.enqueue(encode(event));
        }
      } catch (error) {
        // Если пользователь нажал «Стоп», соединение уже закрыто — сообщать некому.
        if (!request.signal.aborted) {
          controller.enqueue(encode({ type: "error", message: describeError(error, connection) }));
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Поток уже закрыт клиентом.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function validateMessages(input: unknown): ChatTurn[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  let length = 0;
  const messages: ChatTurn[] = [];
  for (const item of input) {
    const { role, content } = (item ?? {}) as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content) return null;
    length += content.length;
    messages.push({ role, content });
  }
  if (length > MAX_CONVERSATION_LENGTH || messages[0].role !== "user") return null;
  return messages;
}
