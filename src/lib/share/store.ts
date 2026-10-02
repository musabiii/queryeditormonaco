import "server-only";

/**
 * Запросы по ссылке («Поделиться»): каждый — файл <id>.json в SHARE_DIR,
 * хранится 30 дней. Базы не нужно; в Docker каталог — том, переживающий
 * обновления контейнера.
 */

import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Запрос в 100 строк — около 4 КБ; 200 КБ хватит на любой разумный пакет. */
export const MAX_SHARE_BYTES = 200 * 1024;

const ID_LENGTH = 8;
const ID_PATTERN = /^[A-Za-z0-9]{8}$/;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

type Stored = { text: string; createdAt: number };
export type SharedQuery = { text: string; expiresAt: number };

const shareDir = () => process.env.SHARE_DIR || path.join(process.cwd(), "data", "shares");
const fileOf = (id: string) => path.join(shareDir(), `${id}.json`);

/**
 * На Vercel файловая система между запросами не сохраняется — ссылки
 * работают только там, где каталог явно задан (SHARE_DIR) или это свой сервер.
 */
export const shareAvailable = () => Boolean(process.env.SHARE_DIR) || !process.env.VERCEL;

function newId() {
  return [...randomBytes(ID_LENGTH)].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export async function saveShare(text: string): Promise<{ id: string; expiresAt: number }> {
  await mkdir(shareDir(), { recursive: true });
  const createdAt = Date.now();
  const data = JSON.stringify({ text, createdAt } satisfies Stored);
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newId();
    try {
      // wx — не перезаписать чужую ссылку при совпадении id.
      await writeFile(fileOf(id), data, { flag: "wx" });
      void sweepExpired();
      return { id, expiresAt: createdAt + SHARE_TTL_MS };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error("Не удалось подобрать свободный идентификатор ссылки");
}

/** null — ссылки нет или её срок истёк. */
export async function loadShare(id: string): Promise<SharedQuery | null> {
  if (!ID_PATTERN.test(id)) return null;
  let stored: Stored;
  try {
    stored = JSON.parse(await readFile(fileOf(id), "utf8")) as Stored;
  } catch {
    return null;
  }
  if (Date.now() - stored.createdAt > SHARE_TTL_MS) {
    await unlink(fileOf(id)).catch(() => {});
    return null;
  }
  return { text: stored.text, expiresAt: stored.createdAt + SHARE_TTL_MS };
}

let lastSweep = 0;

/** Удаляет просроченные ссылки — не чаще раза в час, по ходу сохранения новых. */
async function sweepExpired() {
  if (Date.now() - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = Date.now();
  try {
    for (const name of await readdir(shareDir())) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(shareDir(), name);
      const { mtimeMs } = await stat(file);
      if (Date.now() - mtimeMs > SHARE_TTL_MS) await unlink(file).catch(() => {});
    }
  } catch {
    // Уборка — не главное: просроченные ссылки всё равно не открываются.
  }
}
