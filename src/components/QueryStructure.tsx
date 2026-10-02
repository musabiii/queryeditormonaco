"use client";

import {
  batchQueryTitle,
  type BatchQuery,
  type BatchQueryKind,
  type QueryParameter,
} from "@/lib/query-language";
import { QueryFunctions } from "./QueryFunctions";

const KIND_LABEL: Record<BatchQueryKind, string> = {
  select: "Запрос выборки",
  "temp-table": "Временная таблица",
  drop: "Уничтожение временной таблицы",
};

type Props = {
  queries: BatchQuery[];
  /** Смещение курсора: запрос, в котором он стоит, подсвечивается. */
  cursorOffset?: number;
  onSelect: (query: BatchQuery) => void;
  parameters: QueryParameter[];
  /** Выделяет вхождение параметра в тексте. */
  onSelectRange: (start: number, end: number) => void;
  /** Вставка шаблона из дерева функций. */
  onInsertSnippet: (snippet: string) => void;
  /** Новый запрос в конце пакета. */
  onAddQuery: () => void;
};

/** Три блока панели делят высоту поровну, каждый прокручивается сам. */
const PANEL_SECTION = "flex min-h-0 flex-1 basis-0 flex-col";

const HEADING =
  "flex h-8 shrink-0 items-center justify-between border-b border-border bg-panel-header px-3 text-xs font-semibold tracking-wide text-muted uppercase";

/**
 * Список запросов пакета, как на вкладке «Пакет запросов» конструктора 1С,
 * под ним — параметры запроса и дерево функций языка запросов.
 */
export function QueryStructure({
  queries,
  cursorOffset,
  onSelect,
  onAddQuery,
  parameters,
  onSelectRange,
  onInsertSnippet,
}: Props) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-l border-border bg-panel md:flex">
      <section aria-labelledby="query-structure" className={PANEL_SECTION}>
        <h2 id="query-structure" className={HEADING}>
          Структура запроса
          {queries.length > 0 && <span className="font-normal normal-case">{queries.length}</span>}
        </h2>

        <div className="min-h-0 overflow-y-auto py-1">
          {queries.length === 0 && <p className="px-3 py-1.5 text-sm text-muted">Запрос пуст</p>}
          <ol>
            {queries.map((query) => {
              const active =
                cursorOffset !== undefined && cursorOffset >= query.start && cursorOffset <= query.end;
              // Жирным — то, что участвует в результате: запросы пакета и используемые временные таблицы.
              const bold = query.kind === "select" || (query.kind === "temp-table" && query.used);
              return (
                <li key={`${query.index}-${query.start}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(query)}
                    title={query.kind === "temp-table" && !query.used ? `${KIND_LABEL[query.kind]} — не используется` : KIND_LABEL[query.kind]}
                    aria-current={active ? "true" : undefined}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-border/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground ${
                      active ? "bg-border/80" : ""
                    }`}
                  >
                    <KindIcon kind={query.kind} />
                    <span className={`truncate ${bold ? "font-semibold" : ""} ${query.kind === "drop" ? "text-muted" : ""}`}>
                      {batchQueryTitle(query)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {/* Как «Добавить» на вкладке «Пакет запросов» конструктора. */}
          <button
            type="button"
            onClick={onAddQuery}
            title="Добавить запрос в конец пакета"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-muted hover:bg-border/60 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
          >
            <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
              <path d="M8 3v10M3 8h10" />
            </svg>
            Добавить
          </button>
        </div>
      </section>

      <QueryParameters parameters={parameters} cursorOffset={cursorOffset} onSelectRange={onSelectRange} />
      <QueryFunctions onInsert={onInsertSnippet} className={PANEL_SECTION} />
    </aside>
  );
}

function QueryParameters(props: {
  parameters: QueryParameter[];
  cursorOffset?: number;
  onSelectRange: (start: number, end: number) => void;
}) {
  const { parameters, cursorOffset = 0 } = props;

  // Каждый щелчок — к следующему вхождению после курсора, после последнего — снова к первому.
  const selectNext = ({ occurrences }: QueryParameter) => {
    const next = occurrences.find((item) => item.start >= cursorOffset) ?? occurrences[0];
    props.onSelectRange(next.start, next.end);
  };

  return (
    <section aria-labelledby="query-parameters" className={`${PANEL_SECTION} border-t border-border`}>
      <h2 id="query-parameters" className={HEADING}>
        Параметры
        {parameters.length > 0 && <span className="font-normal normal-case">{parameters.length}</span>}
      </h2>
      {parameters.length === 0 ? (
        <p className="p-3 text-sm text-muted">Параметров нет</p>
      ) : (
        <ul className="min-h-0 overflow-y-auto py-1">
          {parameters.map((parameter) => {
            const count = parameter.occurrences.length;
            const active = parameter.occurrences.some(
              (item) => cursorOffset >= item.start && cursorOffset <= item.end,
            );
            return (
              <li key={parameter.name.toUpperCase()}>
                <button
                  type="button"
                  onClick={() => selectNext(parameter)}
                  title={count > 1 ? `Вхождений: ${count} — щелчок переходит к следующему` : "Перейти к параметру"}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-border/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground ${
                    active ? "bg-border/80" : ""
                  }`}
                >
                  <span className="shrink-0 text-muted" aria-hidden>
                    &amp;
                  </span>
                  <span className="min-w-0 flex-1 truncate">{parameter.name}</span>
                  {count > 1 && <span className="shrink-0 text-xs text-muted">{count}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function KindIcon({ kind }: { kind: BatchQueryKind }) {
  const common = {
    viewBox: "0 0 16 16",
    className: "size-4 shrink-0 text-muted",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    "aria-hidden": true,
  } as const;

  if (kind === "temp-table") {
    return (
      <svg {...common}>
        <rect x="2" y="3" width="12" height="10" rx="1" />
        <path d="M2 6.5h12M6 6.5V13" />
      </svg>
    );
  }
  if (kind === "drop") {
    return (
      <svg {...common}>
        <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3 4h10M3 8h10M3 12h6" />
    </svg>
  );
}
