"use client";

import { batchQueryTitle, type BatchQuery, type BatchQueryKind } from "@/lib/query-language";

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
};

/** Список запросов пакета, как на вкладке «Пакет запросов» конструктора 1С. */
export function QueryStructure({ queries, cursorOffset, onSelect }: Props) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-l border-border bg-panel md:flex">
      <h2 className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3 text-xs font-semibold tracking-wide text-muted uppercase">
        Структура запроса
        {queries.length > 0 && <span className="font-normal normal-case">{queries.length}</span>}
      </h2>

      {queries.length === 0 ? (
        <p className="p-3 text-sm text-muted">Запрос пуст</p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto py-1">
          {queries.map((query) => {
            const active =
              cursorOffset !== undefined && cursorOffset >= query.start && cursorOffset <= query.end;
            return (
              <li key={`${query.index}-${query.start}`}>
                <button
                  type="button"
                  onClick={() => onSelect(query)}
                  title={KIND_LABEL[query.kind]}
                  aria-current={active ? "true" : undefined}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-border/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground ${
                    active ? "bg-border/80 font-medium" : ""
                  }`}
                >
                  <KindIcon kind={query.kind} />
                  <span className={`truncate ${query.kind === "drop" ? "text-muted" : ""}`}>
                    {batchQueryTitle(query)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
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
