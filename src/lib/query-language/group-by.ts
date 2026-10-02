/**
 * Подсказка «СГРУППИРОВАТЬ ПО» серым текстом: если в выборке есть агрегатные
 * функции и поля вне них, а группировки нет, то на пустой строке в конце
 * запроса (после ИЗ/ГДЕ) предлагается раздел с этими полями — Tab вставляет.
 */

import { tokenize, type Token } from "./lexer";
import { batchQueryAt } from "./batch";
import {
  AFTER_SELECT,
  SELECT_MODIFIERS,
  innermostScope,
  isKeyword,
  splitStatements,
  splitTopLevel,
  unionPart,
} from "./completion/query-context";
import { FUNCTIONS, PERIODS, PRIMITIVE_TYPES, spellings } from "./vocabulary";

export type GroupBySuggestion = {
  /** Смещение, с которого текст заменяется (начало набранного «СГР…» или курсор). */
  from: number;
  /** Смещение конца замены — конец строки курсора. */
  to: number;
  text: string;
};

const upper = (token: Token | undefined) => (token?.kind === "word" ? token.text.toUpperCase() : "");
const is = (token: Token | undefined, ...words: string[]) => words.includes(upper(token));

const AGGREGATES = ["СУММА", "SUM", "КОЛИЧЕСТВО", "COUNT", "МАКСИМУМ", "MAX", "МИНИМУМ", "MIN", "СРЕДНЕЕ", "AVG"];
const GROUP_KEYWORD = "СГРУППИРОВАТЬ ПО";
/** Разделы, перед которыми должна стоять группировка. */
const AFTER_GROUP = ["ИМЕЮЩИЕ", "HAVING", "УПОРЯДОЧИТЬ", "ORDER", "ИТОГИ", "TOTALS", "ДЛЯ", "FOR", "ИНДЕКСИРОВАТЬ", "INDEX", "АВТОУПОРЯДОЧИВАНИЕ", "AUTOORDER", "ОБЪЕДИНИТЬ", "UNION"];
/** Слова, которые не делают выражение зависящим от строки таблицы. */
const NOT_FIELDS = new Set(spellings(FUNCTIONS, PERIODS, PRIMITIVE_TYPES).map((word) => word.toUpperCase()));

/**
 * Где курсор может стоять:
 * - в начале строки (пустой, с набранным «СГР…» или перед «;»/УПОРЯДОЧИТЬ… — они
 *   уходят на строку ниже);
 * - в конце последней строки ИЗ/ГДЕ — раздел начнётся с новой строки.
 */
export function groupBySuggestion(text: string, offset: number, eol = "\n"): GroupBySuggestion | null {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const newline = text.indexOf("\n", offset);
  const lineEnd = newline < 0 ? text.length : text[newline - 1] === "\r" ? newline - 1 : newline;
  const beforeCursor = text.slice(lineStart, offset).trimStart();
  const afterCursor = text.slice(offset, lineEnd);

  let typed = "";
  let atLineEnd = false;
  if (beforeCursor && !GROUP_KEYWORD.startsWith(beforeCursor.toUpperCase())) {
    if (afterCursor.trim()) return null;
    atLineEnd = true;
  } else {
    typed = beforeCursor;
  }
  const typedStart = offset - typed.length;

  const tokens = tokenize(text).filter((token) => token.kind !== "comment");
  // Только внутри запроса: после «;» курсор уже в следующем.
  const statement = splitStatements(tokens).find((s) => s.start <= offset && offset <= s.end);
  if (!statement) return null;
  // Набранное «СГР» — не часть запроса.
  const scopeTokens = innermostScope(statement.tokens, offset).filter((token) => token.end <= typedStart || token.start >= offset);
  const parts = splitTopLevel(scopeTokens, (token) => is(token, "ОБЪЕДИНИТЬ", "UNION"))
    .filter((part) => part.length)
    .map((part) => ({ start: part[0].start, part }));
  const scope = batchQueryAt(parts, offset)?.part;
  if (!scope) return null;

  const plan = groupByPlan(text, scope);
  if (!plan) return null;

  // Курсор — после ИЗ/ГДЕ и до следующих разделов.
  const { depthAt, from, indent, fields } = plan;
  const before = scope.filter((token, i) => depthAt[i] === 0 && token.end <= typedStart);
  const after = scope.filter((token, i) => depthAt[i] === 0 && token.start >= offset);
  if (!before.length || before[before.length - 1].start < scope[from].start) return null;
  if (before.some((token) => is(token, ...AFTER_GROUP))) return null;
  if (after.length && !is(after[0], ...AFTER_GROUP)) return null;

  // Остаток строки за курсором — только «;» или следующий раздел; они уходят ниже.
  const rest = atLineEnd ? "" : afterCursor;
  if (rest.trim()) {
    const first = offset + rest.length - rest.trimStart().length;
    if (text[first] !== ";" && after[0]?.start !== first) return null;
  }

  // Набранное «сгр» продолжается в том же регистре — иначе Monaco не покажет подсказку.
  const keywordRest = GROUP_KEYWORD.slice(typed.length);
  const keyword = typed + (typed && typed === typed.toLowerCase() ? keywordRest.toLowerCase() : keywordRest);
  const ownIndent = text.slice(lineStart, offset);
  const lead = atLineEnd ? `${eol}${indent}` : typed ? "" : indent.startsWith(ownIndent) ? indent.slice(ownIndent.length) : "";
  const tail = rest.trim() ? `${eol}${rest}` : "";
  return {
    from: typedStart,
    to: lineEnd,
    text: `${lead}${keyword}${eol}${fieldLines(fields, indent, eol)}${tail}`,
  };
}

/** Раздел «СГРУППИРОВАТЬ ПО» для запроса под курсором — где и что вставить. */
export type GroupByProposal = {
  /** Куда вставить: сразу после ИЗ/ГДЕ (перед ИМЕЮЩИЕ, УПОРЯДОЧИТЬ, ИТОГИ, «;»…). */
  offset: number;
  /** Вставляемый текст — начинается с перевода строки. */
  text: string;
};

/**
 * Где бы ни стоял курсор в запросе (например, на поле, к которому только что
 * применили агрегатную функцию) — нужна ли запросу группировка и какая.
 */
export function groupByProposal(text: string, offset: number, eol = "\n"): GroupByProposal | null {
  const tokens = tokenize(text).filter((token) => token.kind !== "comment");
  const statement = splitStatements(tokens).find((s) => s.start <= offset && offset <= s.end);
  if (!statement) return null;
  const scope = unionPart(innermostScope(statement.tokens, offset), offset);
  const plan = groupByPlan(text, scope);
  if (!plan) return null;

  const stop = scope.findIndex((token, i) => plan.depthAt[i] === 0 && is(token, ...AFTER_GROUP));
  const last = scope[(stop < 0 ? scope.length : stop) - 1];
  return {
    offset: last.end,
    text: `${eol}${plan.indent}${GROUP_KEYWORD}${eol}${fieldLines(plan.fields, plan.indent, eol)}`,
  };
}

/** Агрегатная функция из дерева: после неё стоит предложить группировку. */
export const isAggregateSnippet = (snippet: string) => new RegExp(`^(${AGGREGATES.join("|")})\\(`, "i").test(snippet);

type GroupByPlan = { depthAt: number[]; from: number; indent: string; fields: string[] };

/** null — группировка уже есть, нет ИЗ, нет агрегатов или группировать нечего. */
function groupByPlan(text: string, scope: Token[]): GroupByPlan | null {
  const depthAt = depths(scope);
  const topLevel = (match: (token: Token) => boolean) => scope.findIndex((token, i) => depthAt[i] === 0 && match(token));
  if (topLevel((token) => is(token, "СГРУППИРОВАТЬ", "GROUP")) >= 0) return null;
  const from = topLevel((token) => is(token, "ИЗ", "FROM"));
  const select = topLevel((token) => is(token, "ВЫБРАТЬ", "SELECT"));
  if (from < 0 || select < 0) return null;

  const fields = groupFields(scope, depthAt);
  if (!fields) return null;

  const start = scope[select].start;
  const indent = /^[ \t]*/.exec(text.slice(text.lastIndexOf("\n", start - 1) + 1))![0];
  const lines = fields.map((field) => text.slice(field[0].start, field[field.length - 1].end));
  return { depthAt, from, indent, fields: [...new Map(lines.map((line) => [line.toUpperCase(), line])).values()] };
}

function fieldLines(fields: string[], indent: string, eol: string) {
  return fields.map((field) => `${indent}\t${field}`).join(`,${eol}`);
}

/** Выражения полей выборки вне агрегатов; null — агрегатов нет или группировать нечего. */
function groupFields(scope: Token[], depthAt: number[]): Token[][] | null {
  const select = scope.findIndex((token, i) => depthAt[i] === 0 && is(token, "ВЫБРАТЬ", "SELECT"));
  if (select < 0) return null;
  let i = select + 1;
  for (;;) {
    if (is(scope[i], ...SELECT_MODIFIERS)) i++;
    else if (is(scope[i], "ПЕРВЫЕ", "TOP")) i += 2;
    else break;
  }
  let end = scope.findIndex((token, k) => k >= i && depthAt[k] === 0 && is(token, ...AFTER_SELECT));
  if (end < 0) end = scope.length;
  const items = splitTopLevel(scope.slice(i, end), (token) => token.text === ",").filter((item) => item.length);

  let hasAggregate = false;
  const fields: Token[][] = [];
  for (const item of items) {
    if (item.some((token, k) => is(token, ...AGGREGATES) && item[k + 1]?.text === "(")) {
      hasAggregate = true;
      continue;
    }
    const as = lastTopLevel(item, (token) => is(token, "КАК", "AS"));
    const expression = as >= 0 ? item.slice(0, as) : item;
    if (dependsOnRow(expression)) fields.push(expression);
  }
  return hasAggregate && fields.length ? fields : null;
}

/** Поле или выражение от полей; константы и параметры (&Период, "Итого") группировать не нужно. */
function dependsOnRow(expression: Token[]) {
  return expression.some(
    (token, i) =>
      token.kind === "word" &&
      (expression[i + 1]?.text === "." || expression[i - 1]?.text === "." || (!isKeyword(token) && !NOT_FIELDS.has(upper(token)))),
  );
}

function depths(tokens: Token[]) {
  let depth = 0;
  return tokens.map((token) => {
    if (token.text === ")") depth--;
    const current = depth;
    if (token.text === "(") depth++;
    return current;
  });
}

function lastTopLevel(tokens: Token[], match: (token: Token) => boolean): number {
  let depth = 0;
  let found = -1;
  tokens.forEach((token, i) => {
    if (token.text === "(") depth++;
    else if (token.text === ")") depth--;
    else if (depth === 0 && match(token)) found = i;
  });
  return found;
}
