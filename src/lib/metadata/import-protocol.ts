import type { ConfigurationModel } from "./model";

/** Сообщения между страницей и import.worker.ts. */
export type ImportRequest = {
  configuration: File;
  files: { folder: string; file: File; predefined?: File }[];
};

export type ImportResponse =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; model: ConfigurationModel; skipped: string[] }
  | { type: "error"; message: string };
