"use client";

import { useEffect, useRef, useState } from "react";
import { MD_KINDS, type ConfigurationSummary, type ImportStats, type MdKind } from "@/lib/metadata/model";
import { supportsDirectoryPicker } from "@/lib/metadata/pick-dump";
import type { useConfigurations } from "@/lib/metadata/use-configurations";

type Props = {
  configurations: ReturnType<typeof useConfigurations>;
  onClose: () => void;
};

/** Список загруженных конфигураций и загрузка выгрузки в XML. Монтируется на время показа. */
export function ConfigurationsDialog({ configurations, onClose }: Props) {
  const { builtins, summaries, storageError, active, setActive, remove, importState } = configurations;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const busy = importState.status === "reading" || importState.status === "parsing" || importState.status === "saving";

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const pickFolder = () => {
    if (supportsDirectoryPicker()) void configurations.importFromDirectory();
    else inputRef.current?.click();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(event) => {
        // Пока идёт разбор, окно не закрываем — иначе прогресс потеряется из виду.
        if (busy) event.preventDefault();
      }}
      className="m-auto w-[38rem] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <div className="flex max-h-[calc(100dvh-4rem)] flex-col">
        <h2 className="border-b border-border px-5 py-3 text-base font-semibold">Конфигурации</h2>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-sm text-muted">
            Загрузите выгрузку конфигурации в XML — по ней будет работать автодополнение объектов и
            реквизитов. Выгрузка делается в Конфигураторе: <em>Конфигурация → Выгрузить конфигурацию в
            файлы</em>.
          </p>

          {builtins.length > 0 && (
            <section aria-labelledby="builtin-configurations" className="space-y-2">
              <h3 id="builtin-configurations" className="text-xs font-semibold tracking-wide text-muted uppercase">
                Типовые — встроены в редактор
              </h3>
              {builtins.map((summary) => (
                <ConfigurationRow
                  key={summary.id}
                  summary={summary}
                  active={summary.id === active?.id}
                  onActivate={() => setActive(summary.id)}
                />
              ))}
            </section>
          )}

          <section aria-labelledby="user-configurations" className="space-y-2">
            <h3 id="user-configurations" className="text-xs font-semibold tracking-wide text-muted uppercase">
              Загруженные из выгрузки
            </h3>
            {summaries === null ? (
              <p className="text-sm text-muted">Чтение списка…</p>
            ) : summaries.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
                Пока нет — загрузите свою конфигурацию из папки выгрузки
              </p>
            ) : (
              summaries.map((summary) => (
                <ConfigurationRow
                  key={summary.id}
                  summary={summary}
                  active={summary.id === active?.id}
                  onActivate={() => setActive(summary.id)}
                  deletion={{
                    confirming: confirmDelete === summary.id,
                    onAsk: () => setConfirmDelete(summary.id),
                    onCancel: () => setConfirmDelete(null),
                    onConfirm: () => {
                      setConfirmDelete(null);
                      void remove(summary.id);
                    },
                  }}
                />
              ))
            )}
            {storageError && <p className="text-sm text-danger">{storageError}</p>}
          </section>

          <section aria-label="Загрузка" className="space-y-2">
            <button
              type="button"
              onClick={pickFolder}
              disabled={busy}
              className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              Загрузить из папки выгрузки…
            </button>
            <input
              ref={inputRef}
              type="file"
              // Выбор папки в браузерах без File System Access API.
              {...{ webkitdirectory: "", directory: "" }}
              hidden
              onChange={(event) => {
                if (event.target.files?.length) void configurations.importFromFileList(event.target.files);
                event.target.value = "";
              }}
            />
            <ImportStatus state={importState} />
            <p className="text-xs text-muted">
              Файлы читаются только в этом браузере и никуда не отправляются. Из выгрузки берутся лишь
              описания объектов — формы, модули и макеты не читаются.
            </p>
          </section>
        </div>

        <div className="flex justify-end border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            disabled={busy}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-border/60 disabled:opacity-50"
          >
            Закрыть
          </button>
        </div>
      </div>
    </dialog>
  );
}

const REGISTER_KINDS: MdKind[] = ["InformationRegister", "AccumulationRegister", "AccountingRegister", "CalculationRegister"];

function countsLine(counts: ConfigurationSummary["counts"]) {
  const get = (kind: MdKind) => counts[kind] ?? 0;
  const registers = REGISTER_KINDS.reduce((sum, kind) => sum + get(kind), 0);
  const total = MD_KINDS.reduce((sum, { kind }) => sum + get(kind), 0);
  return [
    `справочников ${get("Catalog")}`,
    `документов ${get("Document")}`,
    `регистров ${registers}`,
    `перечислений ${get("Enum")}`,
    `всего объектов ${total}`,
  ].join(" · ");
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`
    : `${Math.max(1, Math.round(bytes / 1024))} КБ`;

function statsLine(stats: ImportStats) {
  return [
    `модель ${formatSize(stats.modelBytes)}`,
    `из XML ${formatSize(stats.sourceBytes)} (${stats.sourceFiles.toLocaleString("ru-RU")} файлов)`,
    `разбор ${stats.parseSeconds.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} с`,
  ].join(" · ");
}

function ConfigurationRow(props: {
  summary: ConfigurationSummary;
  active: boolean;
  onActivate: () => void;
  /** Нет у встроенных конфигураций — их не удалить. */
  deletion?: {
    confirming: boolean;
    onAsk: () => void;
    onCancel: () => void;
    onConfirm: () => void;
  };
}) {
  const { summary, active } = props;
  const loaded = new Date(summary.loadedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });

  return (
    <div
      className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${active ? "border-foreground/40 bg-panel" : "border-border"}`}
    >
      <input
        type="radio"
        name="active-configuration"
        checked={active}
        onChange={props.onActivate}
        aria-label={`Использовать ${summary.synonym ?? summary.name}`}
        className="mt-1"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          {summary.synonym ?? summary.name}
          {summary.version && <span className="ml-2 font-normal text-muted">{summary.version}</span>}
        </div>
        <div className="text-xs text-muted">{countsLine(summary.counts)}</div>
        {summary.stats && <div className="text-xs text-muted">{statsLine(summary.stats)}</div>}
        {/* У встроенных дата сборки не нужна — только поставщик. */}
        {(summary.vendor || !summary.builtinFile) && (
          <div className="text-xs text-muted">
            {[summary.vendor, !summary.builtinFile && `загружена ${loaded}`].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
      {props.deletion && (props.deletion.confirming ? (
        <div className="flex shrink-0 items-center gap-1 text-xs">
          <span>Удалить?</span>
          <button type="button" onClick={props.deletion.onConfirm} className="rounded px-2 py-1 text-danger hover:bg-border/60">
            Да
          </button>
          <button type="button" onClick={props.deletion.onCancel} className="rounded px-2 py-1 hover:bg-border/60">
            Нет
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={props.deletion.onAsk}
          title="Удалить из браузера"
          aria-label={`Удалить ${summary.synonym ?? summary.name}`}
          className="shrink-0 rounded p-1 text-muted hover:bg-border/60 hover:text-foreground"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
          </svg>
        </button>
      ))}
    </div>
  );
}

function ImportStatus({ state }: { state: ReturnType<typeof useConfigurations>["importState"] }) {
  switch (state.status) {
    case "idle":
      return null;
    case "reading":
      return <p role="status" className="text-sm text-muted">Чтение списка файлов…</p>;
    case "parsing": {
      const percent = state.total ? Math.round((state.done / state.total) * 100) : 0;
      return (
        <div role="status" className="space-y-1">
          <div className="text-sm">
            Разбор описаний объектов: {state.done} из {state.total}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <div className="h-full bg-foreground transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        </div>
      );
    }
    case "saving":
      return <p role="status" className="text-sm text-muted">Сохранение в браузере…</p>;
    case "done":
      return (
        <div role="status" className="text-sm">
          Загружена «{state.summary.synonym ?? state.summary.name}»
          {state.summary.version ? ` ${state.summary.version}` : ""} за{" "}
          {state.seconds.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} с и выбрана для работы.
          {state.skipped.length > 0 && (
            <details className="mt-1 text-xs text-muted">
              <summary>Не удалось разобрать файлов: {state.skipped.length}</summary>
              <ul className="mt-1 max-h-32 overflow-y-auto">
                {state.skipped.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      );
    case "error":
      return (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      );
  }
}
