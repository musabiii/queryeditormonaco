import { describeError, listModels, resolveConnection } from "@/lib/ai/server";
import type { ModelsRequest, ModelsResponse } from "@/lib/ai/protocol";

/** Список моделей провайдера. Заодно проверяет ключ и доступность сервера. */
export async function POST(request: Request) {
  let body: Partial<ModelsRequest>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный запрос" } satisfies ModelsResponse, { status: 400 });
  }

  const connection = resolveConnection(body.connection, { requireModel: false });
  if ("error" in connection) {
    return Response.json({ error: connection.error } satisfies ModelsResponse, { status: 400 });
  }

  try {
    const models = await listModels(connection);
    return Response.json({ models } satisfies ModelsResponse);
  } catch (error) {
    return Response.json(
      { error: describeError(error, connection) } satisfies ModelsResponse,
      { status: 502 },
    );
  }
}
