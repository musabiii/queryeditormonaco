/**
 * Встроенные типовые конфигурации: готовые модели в public/configurations,
 * собранные скриптом scripts/build-configuration.ts. Модель скачивается при
 * первом выборе и дальше берётся из IndexedDB.
 */

import type { ConfigurationModel, ConfigurationSummary } from "./model";
import { cacheModel, loadConfiguration } from "./store";

const BASE = "/configurations";

export async function fetchBuiltinConfigurations(): Promise<ConfigurationSummary[]> {
  const response = await fetch(`${BASE}/manifest.json`, { cache: "no-cache" });
  if (!response.ok) return [];
  const list = (await response.json()) as ConfigurationSummary[];
  return list.filter((item) => item.builtinFile);
}

/** Модель конфигурации: встроенная — из кэша или с сервера, загруженная пользователем — из IndexedDB. */
export async function loadModel(summary: ConfigurationSummary): Promise<ConfigurationModel | undefined> {
  const cached = await loadConfiguration(summary.id);
  if (cached || !summary.builtinFile) return cached;

  const response = await fetch(`${BASE}/${summary.builtinFile}`);
  if (!response.ok) throw new Error(`Не удалось скачать ${summary.builtinFile}: ${response.status}`);
  const model = JSON.parse(await gunzipText(await response.arrayBuffer())) as ConfigurationModel;
  model.id = summary.id;
  await cacheModel(model);
  return model;
}

/**
 * Распаковка .json.gz. Некоторые серверы отдают .gz с Content-Encoding: gzip —
 * тогда браузер уже распаковал данные, и распаковывать повторно не нужно.
 */
async function gunzipText(data: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(data);
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}
