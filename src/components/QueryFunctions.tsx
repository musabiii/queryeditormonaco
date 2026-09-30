"use client";

import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import {
  FUNCTION_CATALOG,
  isCatalogFolder,
  snippetText,
  type CatalogFolder,
  type CatalogItem,
} from "@/lib/query-language";

type Props = {
  /** Вставка шаблона с полями для заполнения. */
  onInsert: (snippet: string) => void;
  className?: string;
};

/** Как в конструкторе: раскрыты «Функции», «Операторы» и «Прочее», вложенные папки свёрнуты. */
const INITIALLY_EXPANDED = FUNCTION_CATALOG.map((folder) => `/${folder.label}`);

/** Дерево «Функции языка запросов», как в конструкторе запросов 1С. */
export function QueryFunctions({ onInsert, className = "" }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(INITIALLY_EXPANDED));

  const toggle = (id: string) =>
    setExpanded((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderNodes = (nodes: (CatalogFolder | CatalogItem)[], depth: number, parentId: string): ReactNode =>
    nodes.map((node) => {
      const id = `${parentId}/${node.label}`;
      if (!isCatalogFolder(node)) {
        return (
          <li key={id} role="treeitem" aria-selected={false} aria-level={depth + 1}>
            <ItemRow item={node} depth={depth} onInsert={() => onInsert(node.snippet)} />
          </li>
        );
      }
      const open = expanded.has(id);
      return (
        <li key={id} role="treeitem" aria-selected={false} aria-expanded={open} aria-level={depth + 1}>
          <FolderRow label={node.label} depth={depth} open={open} onToggle={() => toggle(id)} />
          {open && <ul role="group">{renderNodes(node.children, depth + 1, id)}</ul>}
        </li>
      );
    });

  return (
    <section aria-labelledby="query-functions" className={`${className} border-t border-border`}>
      <h2
        id="query-functions"
        className="flex h-8 shrink-0 items-center border-b border-border bg-panel-header px-3 text-xs font-semibold tracking-wide text-muted uppercase"
      >
        Функции языка запросов
      </h2>
      <ul role="tree" aria-labelledby="query-functions" className="min-h-0 overflow-x-hidden overflow-y-auto py-1 text-sm">
        {renderNodes(FUNCTION_CATALOG, 0, "")}
      </ul>
    </section>
  );
}

const ROW =
  "flex cursor-default items-center gap-1.5 py-0.5 pr-2 select-none hover:bg-border/60 focus-visible:bg-border/60 focus-visible:outline-none";

/** Стрелки вверх/вниз — к соседней строке дерева. */
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  event.preventDefault();
  const rows = [...(event.currentTarget.closest('[role="tree"]')?.querySelectorAll<HTMLElement>("[data-tree-row]") ?? [])];
  rows[rows.indexOf(event.currentTarget) + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
}

function FolderRow(props: { label: string; depth: number; open: boolean; onToggle: () => void }) {
  const { label, depth, open } = props;
  return (
    <div
      data-tree-row
      tabIndex={0}
      onClick={props.onToggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || (event.key === "ArrowRight" && !open) || (event.key === "ArrowLeft" && open)) {
          event.preventDefault();
          props.onToggle();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          moveFocus(event);
        }
      }}
      className={ROW}
      style={{ paddingLeft: 6 + depth * 14 }}
    >
      <svg viewBox="0 0 16 16" className={`size-3 shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`} fill="currentColor" aria-hidden>
        <path d="M6 3.5 11 8l-5 4.5z" />
      </svg>
      <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
        <path d="M2 4.5h4l1.5 1.5H14v6.5H2z" />
      </svg>
      <span className="truncate">{label}</span>
    </div>
  );
}

function ItemRow({ item, depth, onInsert }: { item: CatalogItem; depth: number; onInsert: () => void }) {
  const onDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("text/plain", snippetText(item.snippet, false));
    event.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      data-tree-row
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDoubleClick={onInsert}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onInsert();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          moveFocus(event);
        }
      }}
      title={`Вставить: ${snippetText(item.snippet, true)}`}
      className={ROW}
      // Отступ как у папки того же уровня плюс место под стрелку.
      style={{ paddingLeft: 6 + depth * 14 + 18 }}
    >
      <span className="truncate">{item.label}</span>
    </div>
  );
}
