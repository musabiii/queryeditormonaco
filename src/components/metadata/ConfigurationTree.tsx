"use client";

import { useMemo, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { MD_KINDS, type ConfigurationModel, type MdObject } from "@/lib/metadata/model";
import { FIELD_DRAG_TYPE, MetadataIndex, tempTablesOf, usedObjects, type SmartTarget, type TableField } from "@/lib/query-language";
import { ToolButton } from "../ToolButton";

type Icon = "kind" | "object" | "group" | "table" | "virtual" | "field" | "value";

type TreeNode = {
  id: string;
  label: string;
  /** Тип поля или количество — справа от имени. */
  detail?: string;
  /** Синоним — во всплывающей подсказке. */
  title?: string;
  icon: Icon;
  /** Что вставить в запрос перетаскиванием (и двойным кликом, если нет target). */
  insert?: string;
  /** Таблица или реквизит: двойной клик добавляет их в запрос под курсором. */
  target?: SmartTarget;
  children?: () => TreeNode[];
};

type Props = {
  open: boolean;
  model: ConfigurationModel | null;
  /** Есть активная конфигурация, но её модель ещё загружается. */
  loading: boolean;
  /** Текст запроса в редакторе — для фильтра «только объекты запроса». */
  text: string;
  onInsert: (text: string) => void;
  /** Добавление таблицы или реквизита в запрос под курсором редактора. */
  onSmartInsert: (target: SmartTarget, index: MetadataIndex) => void;
  onOpenConfigurations: () => void;
  onClose: () => void;
};

/** Сколько объектов показывать в группе, пока не нажато «Показать все». */
const PAGE = 300;

/** Дерево метаданных активной конфигурации слева от редактора. */
export function ConfigurationTree({ open, model, loading, text, onInsert, onSmartInsert, onOpenConfigurations, onClose }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState<Set<string>>(new Set());
  const [width, setWidth] = useState(320);
  /** Только объекты, которые уже есть в тексте запроса. */
  const [onlyUsed, setOnlyUsed] = useState(false);
  const index = useMemo(() => (model ? new MetadataIndex(model) : null), [model]);

  const query = search.trim().toLowerCase();
  const used = useMemo(() => (index && onlyUsed ? usedObjects(text, index) : null), [index, onlyUsed, text]);
  // Пока панель закрыта, текст не разбираем.
  const temps = useMemo(() => (index && open ? tempTableNodes(index, text, query) : []), [index, open, text, query]);
  const roots = useMemo(() => (index ? [...kindNodes(index, query, used), ...temps] : []), [index, query, used, temps]);

  const toggle = (id: string) =>
    setExpanded((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // При поиске и фильтре группы видов раскрыты — иначе совпадения не видно.
  const isExpanded = (node: TreeNode, depth: number) => ((query || used) && depth === 0) || expanded.has(node.id);

  const renderNodes = (nodes: TreeNode[], depth: number): ReactNode => {
    const parentId = nodes[0]?.id.split("/").slice(0, -1).join("/") ?? "";
    const limited = depth === 1 && nodes.length > PAGE && !showAll.has(parentId);
    const visible = limited ? nodes.slice(0, PAGE) : nodes;
    return (
      <>
        {visible.map((node) => {
          const hasChildren = Boolean(node.children);
          const isOpen = hasChildren && isExpanded(node, depth);
          return (
            <li key={node.id} role="treeitem" aria-selected={false} aria-expanded={hasChildren ? isOpen : undefined} aria-level={depth + 1}>
              <TreeRow
                node={node}
                depth={depth}
                open={isOpen}
                onToggle={() => toggle(node.id)}
                onInsert={() => {
                  if (node.target && index) onSmartInsert(node.target, index);
                  else if (node.insert) onInsert(node.insert);
                }}
              />
              {isOpen && node.children && (
                <ul role="group">{renderNodes(node.children(), depth + 1)}</ul>
              )}
            </li>
          );
        })}
        {limited && (
          <li role="none">
            <button
              type="button"
              onClick={() => setShowAll((set) => new Set(set).add(parentId))}
              className="py-1 text-xs text-muted hover:text-foreground"
              style={{ paddingLeft: 12 + depth * 14 }}
            >
              Показать все ({nodes.length})
            </button>
          </li>
        )}
      </>
    );
  };

  return (
    <aside
      aria-label="Структура конфигурации"
      style={{ width }}
      className={`relative max-w-[60vw] shrink-0 flex-col border-r border-border bg-panel ${open ? "hidden md:flex" : "hidden"}`}
    >
      <ResizeHandle width={width} onResize={setWidth} />
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border pr-1 pl-3">
        <h2 className="truncate text-xs font-semibold tracking-wide text-muted uppercase">Конфигурация</h2>
        <div className="ml-auto flex">
          {model && (
            <ToolButton
              label={onlyUsed ? "Показать все объекты" : "Только объекты из запроса"}
              pressed={onlyUsed}
              onClick={() => setOnlyUsed((value) => !value)}
            >
              <path d="M2.5 3.5h11l-4.25 5v4l-2.5 1.25V8.5z" />
            </ToolButton>
          )}
          <ToolButton label="Конфигурации" onClick={onOpenConfigurations}>
            <ellipse cx="8" cy="3.75" rx="5" ry="2" />
            <path d="M3 3.75v8.5c0 1.1 2.24 2 5 2s5-.9 5-2v-8.5M3 8c0 1.1 2.24 2 5 2s5-.9 5-2" />
          </ToolButton>
          <ToolButton label="Закрыть панель" onClick={onClose}>
            <path d="m4 4 8 8m0-8-8 8" />
          </ToolButton>
        </div>
      </div>

      {!model ? (
        <div className="space-y-3 p-3 text-sm">
          {loading ? (
            <p className="text-muted">Загрузка конфигурации…</p>
          ) : (
            <>
              <p className="text-muted">Конфигурация не выбрана.</p>
              <button
                type="button"
                onClick={onOpenConfigurations}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-border/60"
              >
                Выбрать конфигурацию
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="shrink-0 space-y-1.5 border-b border-border p-2">
            <div className="truncate text-xs font-medium" title={model.synonym ?? model.name}>
              {model.synonym ?? model.name}
              {model.version && <span className="ml-1 font-normal text-muted">{model.version}</span>}
            </div>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск объекта по имени или синониму"
              aria-label="Поиск объекта"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-foreground"
            />
          </div>
          {roots.length === 0 ? (
            <p className="p-3 text-sm text-muted">
              {used && !used.size ? "В запросе нет объектов конфигурации" : "Ничего не найдено"}
            </p>
          ) : (
            <ul role="tree" aria-label="Объекты конфигурации" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-1 text-sm">
              {renderNodes(roots, 0)}
            </ul>
          )}
          <p className="shrink-0 border-t border-border px-3 py-1.5 text-xs text-muted">
            Двойной клик — добавить в запрос у курсора, перетаскивание — вставить имя
          </p>
        </>
      )}
    </aside>
  );
}

/** Правый край панели: перетаскиванием меняется ширина, стрелками — с клавиатуры. */
function ResizeHandle({ width, onResize }: { width: number; onResize: (width: number) => void }) {
  const clamp = (value: number) => Math.min(640, Math.max(220, value));
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Ширина панели"
      aria-valuenow={width}
      aria-valuemin={220}
      aria-valuemax={640}
      tabIndex={0}
      onPointerDown={(event) => {
        const startX = event.clientX;
        const startWidth = width;
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        const move = (e: PointerEvent) => onResize(clamp(startWidth + e.clientX - startX));
        const up = () => {
          target.removeEventListener("pointermove", move);
          target.removeEventListener("pointerup", up);
        };
        target.addEventListener("pointermove", move);
        target.addEventListener("pointerup", up);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          onResize(clamp(width + (event.key === "ArrowRight" ? 20 : -20)));
        }
      }}
      className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize hover:bg-border focus-visible:bg-border focus-visible:outline-none"
    />
  );
}

function TreeRow(props: { node: TreeNode; depth: number; open: boolean; onToggle: () => void; onInsert: () => void }) {
  const { node, depth, open } = props;
  const hasChildren = Boolean(node.children);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (node.insert || node.target) props.onInsert();
      else if (hasChildren) props.onToggle();
    } else if ((event.key === "ArrowRight" && hasChildren && !open) || (event.key === "ArrowLeft" && open)) {
      event.preventDefault();
      props.onToggle();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const rows = [...(event.currentTarget.closest('[role="tree"]')?.querySelectorAll<HTMLElement>("[data-tree-row]") ?? [])];
      const next = rows[rows.indexOf(event.currentTarget) + (event.key === "ArrowDown" ? 1 : -1)];
      next?.focus();
    }
  };

  const onDragStart = (event: DragEvent<HTMLDivElement>) => {
    if (!node.insert) return event.preventDefault();
    event.dataTransfer.setData("text/plain", node.insert);
    // Редактор подставит псевдоним таблицы, если она уже есть в запросе.
    if (node.target?.kind === "field") {
      event.dataTransfer.setData(FIELD_DRAG_TYPE, JSON.stringify({ table: node.target.table, field: node.target.field }));
    }
    event.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      data-tree-row
      tabIndex={0}
      draggable={Boolean(node.insert)}
      onDragStart={onDragStart}
      onClick={() => hasChildren && props.onToggle()}
      onDoubleClick={() => (node.insert || node.target) && props.onInsert()}
      onKeyDown={onKeyDown}
      title={[node.title, node.target && "Двойной клик — добавить в запрос", node.insert && `Перетащить: ${node.insert}`].filter(Boolean).join("\n") || undefined}
      className="flex cursor-default items-center gap-1.5 py-0.5 pr-2 select-none hover:bg-border/60 focus-visible:bg-border/60 focus-visible:outline-none"
      style={{ paddingLeft: 6 + depth * 14 }}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center text-muted">
        {hasChildren && (
          <svg viewBox="0 0 16 16" className={`size-3 transition-transform ${open ? "rotate-90" : ""}`} fill="currentColor" aria-hidden>
            <path d="M6 3.5 11 8l-5 4.5z" />
          </svg>
        )}
      </span>
      <NodeIcon icon={node.icon} />
      {/* Имя сокращается последним: сначала обрезается тип справа. */}
      <span className="max-w-[80%] shrink-0 truncate">{node.label}</span>
      {node.detail && <span className="ml-auto min-w-0 truncate pl-2 text-right text-xs text-muted">{node.detail}</span>}
    </div>
  );
}

function NodeIcon({ icon }: { icon: Icon }) {
  const paths: Record<Icon, ReactNode> = {
    kind: <path d="M2 4.5h4l1.5 1.5H14v6.5H2z" />,
    object: <rect x="3" y="3" width="10" height="10" rx="1.5" />,
    group: <path d="M3 4.5h10M3 8h10M3 11.5h10" />,
    table: (
      <>
        <rect x="2.5" y="3" width="11" height="10" rx="1" />
        <path d="M2.5 6.5h11M6.5 6.5V13" />
      </>
    ),
    virtual: (
      <>
        <rect x="2.5" y="3" width="11" height="10" rx="1" strokeDasharray="2 1.5" />
        <path d="M2.5 6.5h11" />
      </>
    ),
    field: <circle cx="8" cy="8" r="2.25" />,
    value: <path d="M4 8h8M8 4v8" />,
  };
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      {paths[icon]}
    </svg>
  );
}

// ---------- Построение узлов ----------

/** used — показывать только эти объекты (фильтр «только объекты из запроса»). */
function kindNodes(index: MetadataIndex, query: string, used: Set<MdObject> | null): TreeNode[] {
  return MD_KINDS.flatMap(({ kind, plural, queryName }) => {
    const all = index
      .objects(kind)
      .filter((o) => !used || used.has(o))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const objects = query
      ? all.filter((o) => o.name.toLowerCase().includes(query) || o.synonym?.toLowerCase().includes(query))
      : all;
    if (!objects.length) return [];
    const id = `k:${kind}`;
    return [
      {
        id,
        label: plural,
        detail: String(objects.length),
        icon: "kind" as const,
        children: () => objects.map((object) => objectNode(index, object, `${id}/${object.name}`, queryName)),
      },
    ];
  });
}

/** Временные таблицы из текста запроса — в конце дерева, как в конструкторе запросов 1С. */
function tempTableNodes(index: MetadataIndex, text: string, query: string): TreeNode[] {
  const tables = tempTablesOf(text, index).filter((table) => table.name.toLowerCase().includes(query));
  if (!tables.length) return [];
  const id = "temp";
  return [
    {
      id,
      label: "Временные таблицы",
      detail: String(tables.length),
      icon: "kind",
      children: () =>
        tables.map((table) => ({
          id: `${id}/${table.name}`,
          label: table.name,
          title: "Временная таблица",
          icon: "table" as const,
          insert: table.name,
          target: { kind: "table" as const, path: [table.name] },
          children: () => fieldNodes(table.fields, `${id}/${table.name}`, [table.name]),
        })),
    },
  ];
}

function objectNode(index: MetadataIndex, object: MdObject, id: string, queryName: string): TreeNode {
  const full = `${queryName}.${object.name}`;
  return {
    id,
    label: object.name,
    title: object.synonym,
    icon: "object",
    insert: full,
    target: { kind: "table", path: [queryName, object.name] },
    children: () => objectChildren(index, object, id, full),
  };
}

function objectChildren(index: MetadataIndex, object: MdObject, id: string, full: string): TreeNode[] {
  const all = index.fieldsOf({ type: "object", object });
  // «Ссылка» нужна чаще остальных стандартных реквизитов — первой, как в конструкторе 1С.
  const reference = all.filter((f) => f.group === "standard" && f.name === "Ссылка");
  const standard = all.filter((f) => f.group === "standard" && f.name !== "Ссылка");
  const groups: TreeNode[] = fieldNodes(reference, id, full.split("."));
  const addGroup = (key: string, label: string, fields: TableField[]) => {
    if (fields.length) {
      groups.push({ id: `${id}/${key}`, label, detail: String(fields.length), icon: "group", children: () => fieldNodes(fields, `${id}/${key}`, full.split(".")) });
    }
  };

  addGroup("dimensions", "Измерения", all.filter((f) => f.group === "dimension"));
  addGroup("resources", "Ресурсы", all.filter((f) => f.group === "resource"));
  addGroup("attributes", "Реквизиты", all.filter((f) => f.group === "attribute"));

  const subTables = index.subTables(object);
  const tabular = subTables.filter((s) => s.kind === "tabular");
  if (tabular.length) {
    groups.push({
      id: `${id}/tables`,
      label: "Табличные части",
      detail: String(tabular.length),
      icon: "group",
      children: () =>
        tabular.map((sub) => tableNode(index, [full, sub.name], `${id}/tables/${sub.name}`, "table", sub.synonym)),
    });
  }
  const virtual = subTables.filter((s) => s.kind === "virtual");
  if (virtual.length) {
    groups.push({
      id: `${id}/virtual`,
      label: "Виртуальные таблицы",
      detail: String(virtual.length),
      icon: "group",
      children: () => virtual.map((sub) => tableNode(index, [full, sub.name], `${id}/virtual/${sub.name}`, "virtual")),
    });
  }
  if (object.values?.length) {
    groups.push({
      id: `${id}/values`,
      label: "Значения",
      detail: String(object.values.length),
      icon: "group",
      children: () =>
        object.values!.map((value) => ({ id: `${id}/values/${value}`, label: value, icon: "value" as const, insert: `ЗНАЧЕНИЕ(${full}.${value})` })),
    });
  }
  if (object.predefined?.length) {
    groups.push({
      id: `${id}/predefined`,
      label: "Предопределенные",
      detail: String(object.predefined.length),
      icon: "group",
      children: () =>
        object.predefined!.map((item) => ({
          id: `${id}/predefined/${item.name}`,
          label: item.name,
          title: item.description,
          icon: "value" as const,
          insert: `ЗНАЧЕНИЕ(${full}.${item.name})`,
        })),
    });
  }
  addGroup("standard", "Стандартные реквизиты", standard);
  return groups;
}

function tableNode(index: MetadataIndex, [full, name]: [string, string], id: string, icon: "table" | "virtual", synonym?: string): TreeNode {
  const path = `${full}.${name}`;
  return {
    id,
    label: name,
    title: synonym ?? (icon === "virtual" ? "Виртуальная таблица" : undefined),
    icon,
    insert: path,
    target: { kind: "table", path: path.split(".") },
    children: () => {
      const table = index.resolveTable(path.split("."));
      return table ? fieldNodes(index.fieldsOf(table), id, path.split(".")) : [];
    },
  };
}

function fieldNodes(fields: TableField[], parentId: string, table: string[]): TreeNode[] {
  return fields.map((field) => ({
    id: `${parentId}/${field.name}`,
    label: field.name,
    detail: field.types.join(" | ") || undefined,
    title: [field.synonym, field.types.join(" | ")].filter(Boolean).join("\n") || undefined,
    icon: "field" as const,
    insert: field.name,
    target: { kind: "field" as const, table, field: field.name },
  }));
}
