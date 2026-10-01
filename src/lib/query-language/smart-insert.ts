/**
 * «Умная» вставка из дерева конфигурации по двойному щелчку — в запрос,
 * где стоит курсор (с учётом пакета, вложенных запросов и ОБЪЕДИНИТЬ):
 * - реквизит добавляется в список ВЫБРАТЬ; его таблица, если её ещё нет
 *   в ИЗ, — левым соединением;
 * - таблица добавляется левым соединением;
 * - условие ПО подбирается по типам реквизитов, иначе ИСТИНА (выделяется);
 * - нет ИЗ — таблица становится первым источником, нет запроса — создаётся.
 */

import { tokenize, type Token } from "./lexer";
import {
  AFTER_FROM,
  AFTER_SELECT,
  SELECT_MODIFIERS,
  innermostScope,
  isKeyword,
  matchParen,
  splitStatements,
  splitTopLevel,
  unionPart,
} from "./completion/query-context";
import type { MetadataIndex, TableRef } from "./completion/metadata-index";

/** Что выбрано в дереве: таблица (путь как в запросе) или реквизит таблицы. */
export type SmartTarget =
  | { kind: "table"; path: string[] }
  | { kind: "field"; table: string[]; field: string };

export type TextEdit = { start: number; end: number; text: string };

export type SmartInsertResult = {
  /** Правки в смещениях исходного текста, не пересекаются. */
  edits: TextEdit[];
  /** Выделение после правок — в смещениях нового текста. */
  selection: { start: number; end: number };
};

// Маркеры выделения внутри вставляемого текста; убираются перед возвратом.
const SEL_START = "\u0001";
const SEL_END = "\u0002";
const CURSOR = SEL_START + SEL_END;

const upper = (token: Token | undefined) => (token?.kind === "word" ? token.text.toUpperCase() : "");
const is = (token: Token | undefined, ...words: string[]) => words.includes(upper(token));

type ParsedSource = { alias: string; key: string; table?: TableRef; first: Token };

type ParsedQuery = {
  select: Token;
  /** Последняя лексема перед списком полей: ВЫБРАТЬ, РАЗЛИЧНЫЕ, число после ПЕРВЫЕ. */
  head: Token;
  items: Token[][];
  /** Имя после ПОМЕСТИТЬ — ИЗ вставляется после него. */
  into?: Token;
  from?: Token;
  sources: ParsedSource[];
  /** Последняя лексема раздела ИЗ — соединение добавляется после неё. */
  fromLast?: Token;
};

export function smartInsert(text: string, offset: number, target: SmartTarget, index: MetadataIndex): SmartInsertResult {
  const tokens = tokenize(text).filter((token) => token.kind !== "comment");
  const statements = splitStatements(tokens);
  const statement = statements.find((s) => s.start <= offset && offset <= s.end) ?? statements[statements.length - 1];

  const edits: TextEdit[] = [];
  if (!statement.tokens.some((token) => is(token, "ВЫБРАТЬ", "SELECT"))) {
    edits.push(newQuery(text, statement.tokens, offset, target));
  } else {
    const scope = unionPart(innermostScope(statement.tokens, offset), offset);
    const query = parseQuery(scope, index);
    if (query) editQuery(text, query, target, index, edits);
  }
  return finish(text, edits, offset);
}

// ---------- Новый запрос ----------

function newQuery(text: string, statementTokens: Token[], offset: number, target: SmartTarget): TextEdit {
  const table = target.kind === "table" ? target.path : target.table;
  const alias = defaultAlias(table);
  const item = target.kind === "field" ? `${alias}.${target.field} КАК ${target.field}` : "*";
  const query = `ВЫБРАТЬ\n\t${item}\nИЗ\n\t${table.join(".")} КАК ${alias}${CURSOR}`;
  // Курсор в другом запросе (например, УНИЧТОЖИТЬ) — новый запрос после него.
  const last = statementTokens[statementTokens.length - 1];
  if (last) return { start: last.end, end: last.end, text: `;\n\n${query}` };
  // После «;» предыдущего запроса — с новой строки, через пустую.
  const before = text.slice(0, offset);
  const gap = !before.trim() || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  return { start: offset, end: offset, text: gap + query };
}

// ---------- Изменение запроса ----------

function editQuery(text: string, query: ParsedQuery, target: SmartTarget, index: MetadataIndex, edits: TextEdit[]) {
  const tablePath = target.kind === "table" ? target.path : target.table;
  const table = index.resolveTable(tablePath);
  const key = tableKey(tablePath, table, index);

  // Реквизит таблицы, которая уже есть в запросе, — берём её псевдоним.
  const existing = target.kind === "field" ? query.sources.find((source) => source.key === key) : undefined;
  let alias = existing?.alias;
  let join: TextEdit | undefined;
  if (!alias) {
    alias = uniqueAlias(defaultAlias(tablePath), query.sources);
    join = joinEdit(text, query, tablePath.join("."), alias, joinCondition(table, alias, query.sources, index));
  }

  if (target.kind === "field") {
    const name = uniqueName(target.field, query.items);
    // Курсор после поля, если условие соединения не нужно править.
    const cursor = join?.text.includes(SEL_START) ? "" : CURSOR;
    edits.push(selectItemEdit(text, query, `${alias}.${target.field} КАК ${name}${cursor}`));
  } else if (!query.items.length) {
    // ВЫБРАТЬ без полей с ИЗ недопустим.
    edits.push(selectItemEdit(text, query, "*"));
  }
  if (join) {
    if (!join.text.includes(SEL_START) && target.kind === "table") join.text += CURSOR;
    edits.push(join);
  }
}

function selectItemEdit(text: string, query: ParsedQuery, item: string): TextEdit {
  const { items, select, head } = query;
  if (!items.length) {
    return { start: head.end, end: head.end, text: `\n${lineIndent(text, select.start)}\t${item}` };
  }
  // «ВЫБРАТЬ *» — звёздочку заменяем полем.
  if (items.length === 1 && items[0].length === 1 && items[0][0].text === "*") {
    return { start: items[0][0].start, end: items[0][0].end, text: item };
  }
  const last = items[items.length - 1];
  const indent = sameLine(text, select, last[0]) ? `${lineIndent(text, select.start)}\t` : lineIndent(text, last[0].start);
  const end = last[last.length - 1].end;
  return { start: end, end, text: `,\n${indent}${item}` };
}

function joinEdit(text: string, query: ParsedQuery, table: string, alias: string, condition: string | null): TextEdit {
  const { from, fromLast, select } = query;
  if (!from || !fromLast) {
    // Первый источник: «ИЗ» после списка полей (и ПОМЕСТИТЬ).
    const after = query.into ?? query.items.at(-1)?.at(-1) ?? query.head;
    const indent = lineIndent(text, select.start);
    return { start: after.end, end: after.end, text: `\n${indent}ИЗ\n${indent}\t${table} КАК ${alias}` };
  }
  const first = query.sources[0]?.first ?? fromLast;
  const base = sameLine(text, from, first) ? lineIndent(text, from.start) : lineIndent(text, first.start);
  const on = condition ?? `${SEL_START}ИСТИНА${SEL_END}`;
  return {
    start: fromLast.end,
    end: fromLast.end,
    text: `\n${base}\tЛЕВОЕ СОЕДИНЕНИЕ ${table} КАК ${alias}\n${base}\tПО ${on}`,
  };
}

// ---------- Разбор запроса ----------

function parseQuery(scope: Token[], index: MetadataIndex): ParsedQuery | null {
  const depthAt: number[] = [];
  let depth = 0;
  for (const token of scope) {
    if (token.text === ")") depth--;
    depthAt.push(depth);
    if (token.text === "(") depth++;
  }
  const topLevel = (from: number, match: (token: Token) => boolean) => {
    for (let i = from; i < scope.length; i++) if (depthAt[i] === 0 && match(scope[i])) return i;
    return -1;
  };

  const selectIndex = topLevel(0, (token) => is(token, "ВЫБРАТЬ", "SELECT"));
  if (selectIndex < 0) return null;
  let i = selectIndex + 1;
  for (;;) {
    if (is(scope[i], ...SELECT_MODIFIERS)) i++;
    else if (is(scope[i], "ПЕРВЫЕ", "TOP")) i += 2;
    else break;
  }
  const head = scope[Math.min(i, scope.length) - 1];
  let listEnd = topLevel(i, (token) => is(token, ...AFTER_SELECT));
  if (listEnd < 0) listEnd = scope.length;
  const items = splitTopLevel(scope.slice(i, listEnd), (token) => token.text === ",").filter((item) => item.length);

  const into = is(scope[listEnd], "ПОМЕСТИТЬ", "INTO") && scope[listEnd + 1]?.kind === "word" ? scope[listEnd + 1] : undefined;
  const fromIndex = topLevel(listEnd, (token) => is(token, "ИЗ", "FROM"));
  if (fromIndex < 0) return { select: scope[selectIndex], head, items, into, sources: [] };

  let fromEnd = topLevel(fromIndex + 1, (token) => is(token, ...AFTER_FROM));
  if (fromEnd < 0) fromEnd = scope.length;
  const fromLast = fromEnd - 1 > fromIndex ? scope[fromEnd - 1] : undefined;

  const sources: ParsedSource[] = [];
  let expect = true;
  for (let k = fromIndex + 1; k < fromEnd; k++) {
    const token = scope[k];
    if (expect) {
      expect = false;
      k = readSource(scope, k, index, sources) - 1;
    } else if (token.text === "(") {
      k = matchParen(scope, k);
    } else if (is(token, "СОЕДИНЕНИЕ", "JOIN") || token.text === ",") {
      expect = true;
    }
  }
  return { select: scope[selectIndex], head, items, into, from: scope[fromIndex], sources, fromLast };
}

/** Источник: путь к таблице или вложенный запрос в скобках, затем псевдоним. */
function readSource(tokens: Token[], i: number, index: MetadataIndex, sources: ParsedSource[]): number {
  const first = tokens[i];
  let path: string[] = [];
  if (first?.text === "(") {
    i = matchParen(tokens, i) + 1;
  } else if (first?.kind === "word") {
    path = [first.text];
    i++;
    while (tokens[i]?.text === "." && tokens[i + 1]?.kind === "word") {
      path.push(tokens[i + 1].text);
      i += 2;
    }
    if (tokens[i]?.text === "(") i = matchParen(tokens, i) + 1; // параметры виртуальной таблицы
  } else {
    return i + 1;
  }

  let alias = path[path.length - 1] ?? "";
  if (is(tokens[i], "КАК", "AS") && tokens[i + 1]?.kind === "word") {
    alias = tokens[i + 1].text;
    i += 2;
  } else if (tokens[i]?.kind === "word" && !isKeyword(tokens[i])) {
    alias = tokens[i].text;
    i++;
  }
  const table = path.length ? index.resolveTable(path) : undefined;
  if (alias) sources.push({ alias, key: tableKey(path, table, index), table, first });
  return i;
}

// ---------- Условие соединения ----------

/** Тип ссылки на объект таблицы, если у неё есть поле Ссылка: «Справочник.Валюты». */
function refType(table: TableRef, index: MetadataIndex): string | undefined {
  if (table.type !== "object") return undefined;
  return index.fieldsOf(table).some((field) => field.name === "Ссылка") ? index.describeTable(table).toLowerCase() : undefined;
}

const hasType = (types: string[], type: string) => types.some((t) => t.toLowerCase() === type);

function joinCondition(table: TableRef | undefined, alias: string, sources: ParsedSource[], index: MetadataIndex): string | null {
  if (!table || table.type === "derived") return null;
  const withTables = sources.filter((source) => source.table && source.table.type !== "derived");

  // Табличная часть и её объект (или другая табличная часть того же объекта).
  for (const source of withTables) {
    const other = source.table!;
    if (other.type === "derived") continue;
    const sameObject = other.object === table.object;
    if (sameObject && (table.type === "tabular" || other.type === "tabular")) {
      return `${alias}.Ссылка = ${source.alias}.Ссылка`;
    }
  }
  // Реквизит новой таблицы ссылается на существующую: КурсыВалют.Валюта = Валюты.Ссылка.
  for (const source of withTables) {
    const ref = refType(source.table!, index);
    const field = ref && index.fieldsOf(table).find((f) => f.name !== "Ссылка" && hasType(f.types, ref));
    if (field) return `${alias}.${field.name} = ${source.alias}.Ссылка`;
  }
  // Реквизит существующей таблицы ссылается на новую.
  const ref = refType(table, index);
  if (ref) {
    for (const source of withTables) {
      const field = index.fieldsOf(source.table!).find((f) => f.name !== "Ссылка" && hasType(f.types, ref));
      if (field) return `${source.alias}.${field.name} = ${alias}.Ссылка`;
    }
  }
  return null;
}

// ---------- Имена ----------

function tableKey(path: string[], table: TableRef | undefined, index: MetadataIndex) {
  return (table ? index.describeTable(table) : path.join(".")).toLowerCase();
}

/** Псевдоним как у конструктора: Валюты, РеализацияТоваровУслугТовары, ТоварыНаСкладахОстатки. */
function defaultAlias(path: string[]) {
  return path.slice(1).join("") || path[0];
}

function uniqueAlias(base: string, sources: ParsedSource[]) {
  const taken = new Set(sources.map((source) => source.alias.toLowerCase()));
  let alias = base;
  for (let n = 1; taken.has(alias.toLowerCase()); n++) alias = `${base}${n}`;
  return alias;
}

/** Имя поля в выборке: Наименование, Наименование1… — без повторов. */
function uniqueName(base: string, items: Token[][]) {
  const taken = new Set(
    items.map((item) => {
      const as = item.findLastIndex((token) => is(token, "КАК", "AS"));
      return (as >= 0 ? item[as + 1]?.text : item[item.length - 1]?.text)?.toLowerCase() ?? "";
    }),
  );
  let name = base;
  for (let n = 1; taken.has(name.toLowerCase()); n++) name = `${base}${n}`;
  return name;
}

// ---------- Текст ----------

function lineIndent(text: string, offset: number) {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))![0];
}

const sameLine = (text: string, a: Token, b: Token) => !text.slice(Math.min(a.start, b.start), Math.max(a.start, b.start)).includes("\n");

/** Сливает вставки в одно место, вычисляет выделение по маркерам и убирает их. */
function finish(text: string, raw: TextEdit[], offset: number): SmartInsertResult {
  const edits: TextEdit[] = [];
  for (const edit of [...raw].sort((a, b) => a.start - b.start)) {
    const previous = edits[edits.length - 1];
    if (previous && previous.start === edit.start && previous.end === previous.start && edit.end === edit.start) {
      previous.text += edit.text;
    } else {
      edits.push({ ...edit });
    }
  }

  let result = "";
  let position = 0;
  for (const edit of edits) {
    result += text.slice(position, edit.start) + edit.text;
    position = edit.end;
  }
  result += text.slice(position);

  const start = result.indexOf(SEL_START);
  const end = result.indexOf(SEL_END) - 1;
  const clean = (value: string) => value.replaceAll(SEL_START, "").replaceAll(SEL_END, "");
  return {
    edits: edits.map((edit) => ({ ...edit, text: clean(edit.text) })),
    // Без маркеров (запрос не разобран) курсор остаётся на месте.
    selection: start >= 0 ? { start, end: Math.max(start, end) } : { start: offset, end: offset },
  };
}
