/**
 * Разбор выгрузки конфигурации в фоновом потоке, чтобы интерфейс не подвисал.
 * Получает файлы, отвечает прогрессом и готовой моделью.
 */

import { buildModel } from "./build-model";
import type { ImportRequest, ImportResponse } from "./import-protocol";

const post = (message: ImportResponse) => self.postMessage(message);

self.onmessage = async (event: MessageEvent<ImportRequest>) => {
  const { configuration, files } = event.data;
  try {
    const result = await buildModel(
      { folder: "", name: configuration.name, read: () => configuration.text() },
      files.map(({ folder, file }) => ({ folder, name: file.name, read: () => file.text() })),
      (done, total) => post({ type: "progress", done, total }),
    );
    post({ type: "done", ...result });
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
