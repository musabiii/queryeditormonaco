import type { ImportRequest, ImportResponse } from "./import-protocol";
import type { ConfigurationModel } from "./model";
import type { DumpSelection } from "./pick-dump";

/** Разбирает выбранную выгрузку в фоновом потоке. */
export function importDump(
  selection: DumpSelection,
  onProgress: (done: number, total: number) => void,
): Promise<{ model: ConfigurationModel; skipped: string[] }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" });
    const finish = () => worker.terminate();

    worker.onmessage = (event: MessageEvent<ImportResponse>) => {
      const message = event.data;
      if (message.type === "progress") {
        onProgress(message.done, message.total);
      } else if (message.type === "done") {
        finish();
        resolve({ model: message.model, skipped: message.skipped });
      } else {
        finish();
        reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "Ошибка фонового разбора"));
    };

    const request: ImportRequest = { configuration: selection.configuration, files: selection.files };
    worker.postMessage(request);
  });
}
