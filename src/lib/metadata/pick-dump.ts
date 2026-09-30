/**
 * Выбор папки с выгрузкой конфигурации в браузере и отбор нужных файлов.
 * Читаются только Configuration.xml и описания объектов верхнего уровня
 * (Catalogs/Имя.xml и т.п.) — формы, модули и макеты не трогаются.
 */

import { DUMP_FOLDERS } from "./build-model";

export type DumpSelection = {
  /** Имя выбранной папки — для сообщений. */
  folderName: string;
  configuration: File;
  files: { folder: string; file: File }[];
};

const WANTED_FOLDERS = new Set(DUMP_FOLDERS);

export class DumpFormatError extends Error {}

// File System Access API есть в Chromium-браузерах, но не во всех версиях типов TypeScript.
type DirectoryHandle = {
  kind: "directory";
  name: string;
  values(): AsyncIterable<DirectoryHandle | FileHandle>;
  getDirectoryHandle(name: string): Promise<DirectoryHandle>;
  getFileHandle(name: string): Promise<FileHandle>;
};
type FileHandle = { kind: "file"; name: string; getFile(): Promise<File> };
type WindowWithPicker = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: "read" }) => Promise<DirectoryHandle>;
};

/** Есть ли выбор папки с чтением только нужных файлов (Chrome, Edge, Яндекс.Браузер). */
export function supportsDirectoryPicker(): boolean {
  return typeof (window as WindowWithPicker).showDirectoryPicker === "function";
}

/** Системный диалог выбора папки. Возвращает null, если пользователь отменил выбор. */
export async function pickDumpDirectory(): Promise<DumpSelection | null> {
  let directory: DirectoryHandle;
  try {
    directory = await (window as WindowWithPicker).showDirectoryPicker!({ id: "configuration-dump", mode: "read" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
  const root = await findDumpRoot(directory);

  const configuration = await (await root.getFileHandle("Configuration.xml")).getFile();
  const files: DumpSelection["files"] = [];
  for await (const entry of root.values()) {
    if (entry.kind !== "directory" || !WANTED_FOLDERS.has(entry.name)) continue;
    for await (const child of entry.values()) {
      if (child.kind === "file" && child.name.endsWith(".xml")) {
        files.push({ folder: entry.name, file: await child.getFile() });
      }
    }
  }
  return { folderName: root.name, configuration, files };
}

/** Корень выгрузки: выбранная папка или вложенная в неё на один уровень. */
async function findDumpRoot(directory: DirectoryHandle): Promise<DirectoryHandle> {
  if (await hasFile(directory, "Configuration.xml")) return directory;
  const nested: DirectoryHandle[] = [];
  for await (const entry of directory.values()) {
    if (entry.kind === "directory" && (await hasFile(entry, "Configuration.xml"))) nested.push(entry);
  }
  if (nested.length === 1) return nested[0];
  if (await hasEdtProject(directory)) {
    throw new DumpFormatError("Это проект EDT — пока поддерживается только выгрузка из Конфигуратора в XML.");
  }
  throw new DumpFormatError(
    "В папке нет Configuration.xml. Выберите корневую папку выгрузки конфигурации в файлы.",
  );
}

async function hasFile(directory: DirectoryHandle, name: string) {
  try {
    await directory.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function hasEdtProject(directory: DirectoryHandle) {
  try {
    const src = await directory.getDirectoryHandle("src");
    const configuration = await src.getDirectoryHandle("Configuration");
    return hasFile(configuration, "Configuration.mdo");
  } catch {
    return false;
  }
}

/**
 * Файлы из <input type="file" webkitdirectory> — запасной вариант для браузеров
 * без выбора папки. Браузер перечисляет все файлы, но читаем только нужные.
 */
export function selectionFromFileList(list: FileList): DumpSelection {
  const all = [...list];
  // Корень — папка с Configuration.xml, ближайшая к выбранной.
  const configuration = all
    .filter((file) => file.name === "Configuration.xml")
    .sort((a, b) => depth(a) - depth(b))[0];
  if (!configuration) {
    const isEdt = all.some((file) => file.webkitRelativePath.endsWith("/src/Configuration/Configuration.mdo"));
    throw new DumpFormatError(
      isEdt
        ? "Это проект EDT — пока поддерживается только выгрузка из Конфигуратора в XML."
        : "В папке нет Configuration.xml. Выберите корневую папку выгрузки конфигурации в файлы.",
    );
  }

  const rootPath = configuration.webkitRelativePath.slice(0, -"Configuration.xml".length);
  const files: DumpSelection["files"] = [];
  for (const file of all) {
    const path = file.webkitRelativePath;
    if (!path.startsWith(rootPath) || !file.name.endsWith(".xml")) continue;
    const parts = path.slice(rootPath.length).split("/");
    if (parts.length === 2 && WANTED_FOLDERS.has(parts[0])) files.push({ folder: parts[0], file });
  }
  const folderName = rootPath.split("/").filter(Boolean).pop() ?? "выгрузка";
  return { folderName, configuration, files };
}

const depth = (file: File) => file.webkitRelativePath.split("/").length;
