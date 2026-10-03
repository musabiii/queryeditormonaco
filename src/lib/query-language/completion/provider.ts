/**
 * Автодополнение и всплывающие подсказки языка запросов.
 * Работает и без загруженной конфигурации (ключевые слова, функции,
 * псевдонимы, временные таблицы); с конфигурацией — ещё объекты и поля.
 */

import type * as MonacoApi from "monaco-editor";
import type { ConfigurationModel } from "@/lib/metadata/model";
import { tokenize } from "../lexer";
import { AS_KEYWORDS, CONSTANTS, FUNCTIONS, KEYWORDS, METADATA_ROOTS, WORD_OPERATORS, type WordPair } from "../vocabulary";
import { MetadataIndex, queryNameOf, type TableField } from "./metadata-index";
import { analyzeQuery, fieldAtPath, fieldsAfterPath, type QueryContext } from "./query-context";

type Monaco = typeof MonacoApi;
type CompletionItem = MonacoApi.languages.CompletionItem;

// Текущая конфигурация. Хранится глобально: Monaco живёт дольше модулей при горячей перезагрузке.
const METADATA = Symbol.for("queryeditor.sdbl.metadata");
type MetadataStore = { [METADATA]?: MetadataIndex | null };

/** Подключает загруженную конфигурацию к автодополнению (null — отключить). */
export function setCompletionMetadata(model: ConfigurationModel | null) {
  (globalThis as MetadataStore)[METADATA] = model ? new MetadataIndex(model) : null;
}

const currentIndex = () => (globalThis as MetadataStore)[METADATA] ?? null;
/** Метаданные активной конфигурации — для перетаскивания реквизитов в редактор. */
export const completionMetadata = currentIndex;

/** Составные конструкции — подсказываются целиком. */
const PHRASES: WordPair[] = [
  ["СГРУППИРОВАТЬ ПО", "GROUP BY"],
  ["УПОРЯДОЧИТЬ ПО", "ORDER BY"],
  ["ИНДЕКСИРОВАТЬ ПО", "INDEX BY"],
  ["ЛЕВОЕ СОЕДИНЕНИЕ", "LEFT JOIN"],
  ["ВНУТРЕННЕЕ СОЕДИНЕНИЕ", "INNER JOIN"],
  ["ПОЛНОЕ СОЕДИНЕНИЕ", "FULL JOIN"],
  ["ПРАВОЕ СОЕДИНЕНИЕ", "RIGHT JOIN"],
  ["ОБЪЕДИНИТЬ ВСЕ", "UNION ALL"],
  ["В ИЕРАРХИИ", "IN HIERARCHY"],
  ["ДЛЯ ИЗМЕНЕНИЯ", "FOR UPDATE"],
  ["ЕСТЬ NULL", "IS NULL"],
];

const IDENT = "[\\p{L}_][\\p{L}\\p{N}_]*";
/** Цепочка «А.Б.» и недописанное слово перед курсором. */
const CHAIN_BEFORE_CURSOR = new RegExp(`((?:${IDENT}\\s*\\.\\s*)*)(${IDENT})?$`, "u");
const WORD_AT = new RegExp(IDENT, "gu");
/** «ГДЕ», «И», «ИЛИ», «НЕ» и пробел или перевод строки перед курсором. */
const CONDITION_WORD = /(?:^|[^\p{L}\p{N}_])(ГДЕ|WHERE|И|AND|ИЛИ|OR|НЕ|NOT)\s+$/iu;
/** Разделы запроса: по ближайшему из них слева понятно, что курсор в ГДЕ. */
const CLAUSES = new Set(["ВЫБРАТЬ", "SELECT", "ИЗ", "FROM", "ПО", "ON", "BY", "ГДЕ", "WHERE", "СГРУППИРОВАТЬ", "GROUP", "ИМЕЮЩИЕ", "HAVING", "УПОРЯДОЧИТЬ", "ORDER", "ИТОГИ", "TOTALS", "ОБЪЕДИНИТЬ", "UNION", "ПОМЕСТИТЬ", "INTO"]);

/**
 * Начало условия в разделе ГДЕ — пора выбирать таблицу: после «ГДЕ», а также после
 * «И», «ИЛИ», «НЕ» внутри ГДЕ (кроме «И» в «МЕЖДУ … И …»).
 */
export function isAfterWhere(text: string, offset: number): boolean {
  const match = CONDITION_WORD.exec(text.slice(Math.max(0, offset - 100), offset));
  if (!match || insideStringOrComment(text, offset)) return false;
  const word = match[1].toUpperCase();
  if (word === "ГДЕ" || word === "WHERE") return true;

  // Слова до «И/ИЛИ/НЕ» на том же уровне скобок: ближайший раздел должен быть ГДЕ.
  const tokens = tokenize(text).filter((token) => token.kind !== "comment" && token.end <= offset);
  tokens.pop();
  let depth = 0;
  let seenAnd = false;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    if (token.text === ")") depth++;
    else if (token.text === "(") {
      // Начало скобки — условие внутри «( … И |» продолжается левее.
      if (depth === 0) continue;
      depth--;
    } else if (token.text === ";") return false;
    if (depth > 0 || token.kind !== "word") continue;
    const upper = token.text.toUpperCase();
    if ((upper === "И" || upper === "AND") && !seenAnd) seenAnd = true;
    if ((upper === "МЕЖДУ" || upper === "BETWEEN") && (word === "И" || word === "AND") && !seenAnd) return false;
    if (CLAUSES.has(upper)) return upper === "ГДЕ" || upper === "WHERE";
  }
  return false;
}

/** «Псевдоним.Поле = » перед курсором (возможно, с начатым словом) — сравнение с полем. */
const COMPARISON_BEFORE_CURSOR = new RegExp(`(${IDENT}(?:\\s*\\.\\s*${IDENT})+)\\s*(?:=|<>)\\s*(${IDENT})?$`, "u");

export function registerCompletion(monaco: Monaco, languageId: string): MonacoApi.IDisposable[] {
  const { CompletionItemKind: Kind, CompletionItemInsertTextRule: Rule } = monaco.languages;

  const completion = monaco.languages.registerCompletionItemProvider(languageId, {
    // Пробел — только чтобы после «Поле = » сразу показать значения.
    triggerCharacters: [".", " "],
    provideCompletionItems(model, position, trigger) {
      const text = model.getValue();
      const offset = model.getOffsetAt(position);
      if (insideStringOrComment(text, offset)) return { suggestions: [] };

      const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const bySpace = trigger.triggerCharacter === " ";
      const match = CHAIN_BEFORE_CURSOR.exec(line);
      const chain = (match?.[1] ?? "").split(".").map((s) => s.trim()).filter(Boolean);
      const prefix = match?.[2] ?? "";
      const range = new monaco.Range(
        position.lineNumber,
        position.column - prefix.length,
        position.lineNumber,
        position.column,
      );

      const index = currentIndex();
      const context = analyzeQuery(text, offset, index);
      const english = /^[A-Za-z]/.test(prefix);
      const item = (partial: Omit<CompletionItem, "range">): CompletionItem => ({ ...partial, range });

      // «Т.Поле = » — параметр, значения перечисления, предопределённые элементы и пустая ссылка;
      // по пробелу — только они, по Ctrl+Space — сверху общего списка.
      const comparison = COMPARISON_BEFORE_CURSOR.exec(line);
      const valueItems = comparison ? comparisonValues(comparison[1], context, index) : [];
      // После «ГДЕ » — псевдонимы таблиц запроса; выбранный дополняется точкой и списком полей.
      // incomplete: начатое слово запрашивает полный список заново.
      const afterWhere = !prefix && chain.length === 0 && isAfterWhere(text, offset);
      const aliasItems = afterWhere
        ? [...context.sources.values()].map((source, i) =>
            item({
              label: source.alias,
              kind: Kind.Variable,
              insertText: `${source.alias}.`,
              detail: describeSource(source.table, index),
              sortText: String(i).padStart(4, "0"), // в порядке таблиц в ИЗ
              command: { id: "editor.action.triggerSuggest", title: "Поля" },
            }),
          )
        : [];
      if (bySpace) {
        if (comparison && !comparison[2]) return { suggestions: valueItems.map(item) };
        return { suggestions: aliasItems };
      }
      if (aliasItems.length) return { suggestions: aliasItems, incomplete: true };

      // После точки: объекты вида, таблицы объекта или поля.
      if (chain.length > 0) {
        return { suggestions: afterDot(chain, context, index).map(item) };
      }

      const suggestions: CompletionItem[] = [];
      for (const source of context.sources.values()) {
        suggestions.push(
          item({ label: source.alias, kind: Kind.Variable, insertText: source.alias, detail: describeSource(source.table, index), sortText: `0${source.alias}` }),
        );
      }
      for (const table of context.tempTables.values()) {
        if (table.type !== "derived" || context.sources.has(table.name.toLowerCase())) continue;
        suggestions.push(
          item({ label: table.name, kind: Kind.Struct, insertText: table.name, detail: "Временная таблица", sortText: `1${table.name}` }),
        );
      }
      const pick = (pair: WordPair) => (english ? pair[1] : pair[0]);
      for (const pair of [...KEYWORDS, ...AS_KEYWORDS, ...WORD_OPERATORS, ...CONSTANTS, ...PHRASES]) {
        const word = pick(pair);
        suggestions.push(item({ label: word, kind: Kind.Keyword, insertText: word, sortText: `3${word}` }));
      }
      for (const pair of FUNCTIONS) {
        const word = pick(pair);
        suggestions.push(
          item({ label: word, kind: Kind.Function, insertText: `${word}($0)`, insertTextRules: Rule.InsertAsSnippet, sortText: `4${word}` }),
        );
      }
      for (const pair of METADATA_ROOTS) {
        const word = pick(pair);
        suggestions.push(item({ label: word, kind: Kind.Module, insertText: word, sortText: `2${word}` }));
      }
      return { suggestions: dedupe([...valueItems.map(item), ...suggestions]) };
    },
  });

  /**
   * Варианты значения для сравнения с полем: всегда параметр «&ИмяПоля», для булева —
   * ИСТИНА и ЛОЖЬ, для ссылочных типов — ЗНАЧЕНИЕ(Перечисление.Пол.Мужской) и т.п.
   */
  function comparisonValues(rawPath: string, context: QueryContext, index: MetadataIndex | null): Omit<CompletionItem, "range">[] {
    const path = rawPath.split(".").map((part) => part.trim());
    const parameter = `&${path[path.length - 1]}`;
    const items: Omit<CompletionItem, "range">[] = [
      { label: parameter, kind: Kind.Variable, insertText: parameter, detail: "Параметр запроса", sortText: "!0" },
    ];
    const field = index && fieldAtPath(path, context, index);
    if (!index || !field) return items;
    let order = 0;
    for (const type of field.types) {
      if (type === "Булево") {
        for (const word of ["ИСТИНА", "ЛОЖЬ"]) {
          items.push({ label: word, kind: Kind.Keyword, insertText: word, sortText: `!1${String(order++).padStart(5, "0")}` });
        }
        continue;
      }
      const object = index.objectByType(type);
      if (!object) continue;
      const full = `${queryNameOf(object.kind)}.${object.name}`;
      const value = (name: string, kind: MonacoApi.languages.CompletionItemKind, documentation?: string) =>
        items.push({
          label: { label: name, description: full },
          kind,
          insertText: `ЗНАЧЕНИЕ(${full}.${name})`,
          filterText: name,
          detail: `ЗНАЧЕНИЕ(${full}.${name})`,
          documentation,
          // Порядок как в метаданных: сначала типы поля, внутри — значения по порядку.
          sortText: `!1${String(order++).padStart(5, "0")}`,
        });
      for (const name of object.values ?? []) value(name, Kind.EnumMember);
      for (const predefined of object.predefined ?? []) value(predefined.name, Kind.EnumMember, predefined.description);
      if (object.kind !== "InformationRegister" && object.kind !== "AccumulationRegister") value("ПустаяСсылка", Kind.Constant);
    }
    return items;
  }

  function afterDot(chain: string[], context: QueryContext, index: MetadataIndex | null): Omit<CompletionItem, "range">[] {
    const rootKind = index?.rootKind(chain[0]);
    if (index && rootKind) {
      // Справочник. → объекты вида
      if (chain.length === 1) {
        return index.objects(rootKind).map((object) => ({
          label: object.name,
          kind: Kind.Class,
          insertText: object.name,
          detail: object.synonym,
          sortText: object.name,
        }));
      }
      // Справочник.Сотрудники. → виртуальные таблицы, табличные части, значения перечисления и предопределённые
      const object = chain.length === 2 ? index.object(rootKind, chain[1]) : undefined;
      if (!object) return [];
      const kindName = queryNameOf(object.kind);
      return [
        ...index.subTables(object).map((sub) => ({
          label: sub.name,
          kind: sub.kind === "virtual" ? Kind.Method : Kind.Struct,
          insertText: sub.name,
          detail: sub.kind === "virtual" ? "Виртуальная таблица" : `Табличная часть${sub.synonym ? ` — ${sub.synonym}` : ""}`,
          sortText: `0${sub.name}`,
        })),
        ...(object.values ?? []).map((value) => ({
          label: value,
          kind: Kind.EnumMember,
          insertText: value,
          detail: `${kindName}.${object.name}`,
          sortText: `1${value}`,
        })),
        ...(object.predefined ?? []).map((item) => ({
          label: item.name,
          kind: Kind.EnumMember,
          insertText: item.name,
          detail: item.description ? `Предопределенный — ${item.description}` : "Предопределенный",
          sortText: `1${item.name}`,
        })),
        ...(object.kind !== "InformationRegister" && object.kind !== "AccumulationRegister"
          ? [{ label: "ПустаяСсылка", kind: Kind.Constant, insertText: "ПустаяСсылка", sortText: "2" }]
          : []),
      ];
    }

    const fields = fieldsAfterPath(chain, context, index);
    return (fields ?? []).map((field) => fieldItem(field));
  }

  function fieldItem(field: TableField): Omit<CompletionItem, "range"> {
    const order = { dimension: 0, resource: 1, attribute: 2, standard: 3 }[field.group];
    return {
      label: { label: field.name, description: field.types.join(" | ") || undefined },
      kind: field.group === "standard" ? Kind.Property : Kind.Field,
      insertText: field.name,
      detail: field.types.join(" | ") || undefined,
      documentation: field.synonym,
      sortText: `${order}${field.name}`,
    };
  }

  const hover = monaco.languages.registerHoverProvider(languageId, {
    provideHover(model, position) {
      const lineText = model.getLineContent(position.lineNumber);
      const word = wordAt(lineText, position.column - 1);
      if (!word) return null;

      // Цепочка до слова под курсором включительно: «Т.Сотрудник.ФизическоеЛицо».
      const before = CHAIN_BEFORE_CURSOR.exec(lineText.slice(0, word.end));
      const chain = [...(before?.[1] ?? "").split(".").map((s) => s.trim()).filter(Boolean), word.text];
      const index = currentIndex();
      const context = analyzeQuery(model.getValue(), model.getOffsetAt(position), index);
      const range = new monaco.Range(position.lineNumber, word.start + 1, position.lineNumber, word.end + 1);

      const lines = describeChain(chain, context, index);
      return lines ? { range, contents: lines.map((value) => ({ value })) } : null;
    },
  });

  return [completion, hover];
}

function describeChain(chain: string[], context: QueryContext, index: MetadataIndex | null): string[] | null {
  const rootKind = index?.rootKind(chain[0]);
  if (index && rootKind) {
    const object = chain.length >= 2 ? index.object(rootKind, chain[1]) : undefined;
    if (!object) return null;
    const title = `**${queryNameOf(object.kind)}.${object.name}**`;
    if (chain.length === 2) return [title + (object.synonym ? ` — ${object.synonym}` : "")];
    const sub = index.subTables(object).find((s) => s.name.toLowerCase() === chain[2].toLowerCase());
    return sub ? [`${title}.${sub.name} — ${sub.kind === "virtual" ? "виртуальная таблица" : "табличная часть"}`] : null;
  }

  if (chain.length === 1) {
    const source = context.sources.get(chain[0].toLowerCase());
    if (source) return [`**${source.alias}** — ${describeSource(source.table, index)}`];
    const temp = context.tempTables.get(chain[0].toLowerCase());
    return temp ? [`**${chain[0]}** — временная таблица`] : null;
  }

  const field = fieldAtPath(chain, context, index);
  if (!field) return null;
  return [
    `**${field.name}**${field.types.length ? `: ${field.types.join(" | ")}` : ""}`,
    ...(field.synonym ? [field.synonym] : []),
  ];
}

function describeSource(table: Parameters<MetadataIndex["describeTable"]>[0], index: MetadataIndex | null) {
  if (index) return index.describeTable(table);
  return table.type === "derived" ? table.name : "";
}

function wordAt(line: string, column: number) {
  WORD_AT.lastIndex = 0;
  for (let m = WORD_AT.exec(line); m; m = WORD_AT.exec(line)) {
    if (m.index <= column && column <= m.index + m[0].length) {
      return { text: m[0], start: m.index, end: m.index + m[0].length };
    }
  }
  return null;
}

function insideStringOrComment(text: string, offset: number): boolean {
  return tokenize(text).some(
    (t) => (t.kind === "string" || t.kind === "comment") && t.start < offset && offset <= t.end && !(t.kind === "string" && offset === t.end && text[t.end - 1] === '"'),
  );
}

function dedupe(items: CompletionItem[]): CompletionItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    // ПустаяСсылка разных типов составного поля — разные варианты.
    const key = typeof item.label === "string" ? `${item.label}|${item.kind}` : `${item.label.label}|${item.label.description}|${item.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
