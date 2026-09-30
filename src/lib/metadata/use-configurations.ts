"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { importDump } from "./import-dump";
import type { ConfigurationSummary } from "./model";
import { pickDumpDirectory, selectionFromFileList, type DumpSelection } from "./pick-dump";
import { deleteConfiguration, listConfigurations, saveConfiguration } from "./store";

export type ImportState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "parsing"; done: number; total: number }
  | { status: "saving" }
  | { status: "done"; summary: ConfigurationSummary; seconds: number; skipped: string[] }
  | { status: "error"; message: string };

// Активная конфигурация — выбор пользователя в этом браузере.
const ACTIVE_KEY = "query-editor:active-configuration";
const activeListeners = new Set<() => void>();
let activeFallback: string | null = null;

function readActive(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return activeFallback;
  }
}

function writeActive(id: string | null) {
  activeFallback = id;
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Выбор не сохранится между сессиями.
  }
  activeListeners.forEach((listener) => listener());
}

function subscribeActive(onChange: () => void) {
  activeListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    activeListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Загруженные конфигурации, активная конфигурация и загрузка новой выгрузки. */
export function useConfigurations() {
  /** null — список ещё читается из хранилища. */
  const [summaries, setSummaries] = useState<ConfigurationSummary[] | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [importState, setImportState] = useState<ImportState>({ status: "idle" });
  const activeId = useSyncExternalStore(subscribeActive, readActive, () => null);

  const showList = useCallback((list: ConfigurationSummary[]) => {
    setSummaries(list);
    setStorageError(null);
  }, []);
  const showStorageError = useCallback((error: unknown) => {
    setSummaries([]);
    setStorageError(`Хранилище браузера недоступно: ${error instanceof Error ? error.message : error}`);
  }, []);

  const refresh = useCallback(
    () => listConfigurations().then(showList, showStorageError),
    [showList, showStorageError],
  );

  useEffect(() => {
    let active = true;
    listConfigurations().then(
      (list) => active && showList(list),
      (error) => active && showStorageError(error),
    );
    return () => {
      active = false;
    };
  }, [showList, showStorageError]);

  const runImport = useCallback(
    async (select: () => Promise<DumpSelection | null>) => {
      setImportState({ status: "reading" });
      try {
        const selection = await select();
        if (!selection) {
          setImportState({ status: "idle" });
          return;
        }
        if (selection.files.length === 0) {
          throw new Error("В выгрузке не найдено описаний объектов (папок Catalogs, Documents…)");
        }

        const started = performance.now();
        setImportState({ status: "parsing", done: 0, total: selection.files.length });
        const { model, skipped } = await importDump(selection, (done, total) =>
          setImportState({ status: "parsing", done, total }),
        );

        setImportState({ status: "saving" });
        const summary = await saveConfiguration(model);
        writeActive(summary.id);
        await refresh();
        setImportState({
          status: "done",
          summary,
          seconds: (performance.now() - started) / 1000,
          skipped,
        });
      } catch (error) {
        setImportState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      }
    },
    [refresh],
  );

  const importFromDirectory = useCallback(() => runImport(pickDumpDirectory), [runImport]);
  const importFromFileList = useCallback(
    (list: FileList) => runImport(async () => selectionFromFileList(list)),
    [runImport],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteConfiguration(id);
      if (readActive() === id) writeActive(null);
      await refresh();
    },
    [refresh],
  );

  const active = summaries?.find((summary) => summary.id === activeId) ?? null;

  return {
    summaries,
    storageError,
    active,
    setActive: writeActive,
    remove,
    importState,
    importFromDirectory,
    importFromFileList,
  };
}
