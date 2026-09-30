/**
 * Хранение загруженных конфигураций в IndexedDB браузера.
 * Краткие сведения лежат отдельно от моделей, чтобы список конфигураций
 * не читал мегабайты метаданных.
 */

import { summarize, type ConfigurationModel, type ConfigurationSummary } from "./model";

const DB_NAME = "query-editor";
const DB_VERSION = 1;
const MODELS = "configurations";
const SUMMARIES = "configurationSummaries";

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MODELS)) db.createObjectStore(MODELS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SUMMARIES)) db.createObjectStore(SUMMARIES, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = undefined;
      reject(request.error ?? new Error("Не удалось открыть хранилище браузера"));
    };
  });
  return dbPromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Запись в хранилище прервана"));
  });
}

export async function listConfigurations(): Promise<ConfigurationSummary[]> {
  const db = await openDb();
  const summaries = await requestResult<ConfigurationSummary[]>(
    db.transaction(SUMMARIES).objectStore(SUMMARIES).getAll(),
  );
  return summaries.sort((a, b) => b.loadedAt.localeCompare(a.loadedAt));
}

export async function loadConfiguration(id: string): Promise<ConfigurationModel | undefined> {
  const db = await openDb();
  return requestResult<ConfigurationModel | undefined>(db.transaction(MODELS).objectStore(MODELS).get(id));
}

/** Сохраняет модель; конфигурация с тем же идентификатором заменяется. */
export async function saveConfiguration(model: ConfigurationModel): Promise<ConfigurationSummary> {
  const db = await openDb();
  const summary = summarize(model);
  const transaction = db.transaction([MODELS, SUMMARIES], "readwrite");
  transaction.objectStore(MODELS).put(model);
  transaction.objectStore(SUMMARIES).put(summary);
  await transactionDone(transaction);
  return summary;
}

export async function deleteConfiguration(id: string): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction([MODELS, SUMMARIES], "readwrite");
  transaction.objectStore(MODELS).delete(id);
  transaction.objectStore(SUMMARIES).delete(id);
  await transactionDone(transaction);
}
