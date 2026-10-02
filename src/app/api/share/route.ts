import { MAX_SHARE_BYTES, saveShare, shareAvailable } from "@/lib/share/store";

/** Не больше RATE_LIMIT ссылок в час с одного адреса — чтобы не превратить сервер в файлообменник. */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const recent = new Map<string, { count: number; resetAt: number }>();

function clientAddress(request: Request) {
  // За nginx настоящий адрес — в X-Forwarded-For / X-Real-IP.
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

function rateLimited(address: string) {
  const now = Date.now();
  const entry = recent.get(address);
  if (!entry || entry.resetAt < now) {
    recent.set(address, { count: 1, resetAt: now + RATE_WINDOW_MS });
    if (recent.size > 10_000) {
      for (const [key, value] of recent) if (value.resetAt < now) recent.delete(key);
    }
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

const error = (message: string, status: number) => Response.json({ error: message }, { status });

/** Сохраняет текст запроса и возвращает идентификатор ссылки. */
export async function POST(request: Request) {
  if (!shareAvailable()) return error("Ссылки на запросы на этом хостинге не поддерживаются", 503);

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = body?.text;
  if (typeof text !== "string" || !text.trim()) return error("Пустой запрос — делиться нечем", 400);
  if (Buffer.byteLength(text, "utf8") > MAX_SHARE_BYTES) {
    return error(`Запрос больше ${MAX_SHARE_BYTES / 1024} КБ — такой ссылкой не поделиться`, 413);
  }
  if (rateLimited(clientAddress(request))) return error("Слишком много ссылок подряд — попробуйте позже", 429);

  try {
    const { id, expiresAt } = await saveShare(text);
    return Response.json({ id, expiresAt });
  } catch (cause) {
    console.error("Не удалось сохранить ссылку на запрос", cause);
    return error("Не удалось сохранить запрос на сервере", 500);
  }
}
