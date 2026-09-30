/**
 * Разбор пакета запросов на отдельные запросы — как на вкладке «Пакет запросов»
 * конструктора 1С. Полноценный синтаксический разбор не нужен: достаточно
 * лексем, чтобы найти разделители «;», ПОМЕСТИТЬ и УНИЧТОЖИТЬ вне строк,
 * комментариев и подзапросов.
 */

export type BatchQueryKind = "select" | "temp-table" | "drop";

export type BatchQuery = {
  /** Номер запроса в пакете, начиная с 1. */
  index: number;
  kind: BatchQueryKind;
  /** Имя временной таблицы для ПОМЕСТИТЬ и УНИЧТОЖИТЬ. */
  tableName?: string;
  /** Смещения в тексте: от первой лексемы запроса до конца последней (без «;»). */
  start: number;
  end: number;
};

type Token = { kind: "word" | "symbol"; text: string; start: number; end: number };

const WORD_START = /[\p{L}_]/u;
const WORD_PART = /[\p{L}\p{N}_]/u;

const INTO = new Set(["ПОМЕСТИТЬ", "INTO"]);
const DROP = new Set(["УНИЧТОЖИТЬ", "DROP"]);

export function parseBatch(text: string): BatchQuery[] {
  const queries: BatchQuery[] = [];
  let current: Token[] = [];

  const flush = () => {
    if (current.length > 0) queries.push(describe(current, queries.length + 1));
    current = [];
  };

  for (const token of tokenize(text)) {
    if (token.kind === "symbol" && token.text === ";") flush();
    else current.push(token);
  }
  flush();

  return queries;
}

function describe(tokens: Token[], index: number): BatchQuery {
  const range = { index, start: tokens[0].start, end: tokens[tokens.length - 1].end };
  const upper = (token: Token | undefined) =>
    token?.kind === "word" ? token.text.toUpperCase() : undefined;
  const nameAfter = (i: number) =>
    tokens[i + 1]?.kind === "word" ? tokens[i + 1].text : undefined;

  const first = upper(tokens[0]);
  if (first && DROP.has(first)) {
    return { ...range, kind: "drop", tableName: nameAfter(0) };
  }

  // ПОМЕСТИТЬ ищем только на верхнем уровне: в подзапросах его быть не может.
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.text === "(") depth++;
    else if (token.text === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && INTO.has(upper(token) ?? "")) {
      const tableName = nameAfter(i);
      if (tableName) return { ...range, kind: "temp-table", tableName };
    }
  }

  return { ...range, kind: "select" };
}

/** Лексемы без пробелов, комментариев и содержимого строк (строка — одна лексема). */
function* tokenize(text: string): Generator<Token> {
  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (ch === "/" && text[i + 1] === "/") {
      const lineEnd = text.indexOf("\n", i);
      i = lineEnd < 0 ? text.length : lineEnd;
      continue;
    }

    if (ch === '"') {
      const start = i++;
      while (i < text.length) {
        if (text[i] === '"' && text[i + 1] === '"') i += 2;
        else if (text[i++] === '"') break;
      }
      yield { kind: "symbol", text: '"', start, end: i };
      continue;
    }

    if (WORD_START.test(ch)) {
      const start = i++;
      while (i < text.length && WORD_PART.test(text[i])) i++;
      yield { kind: "word", text: text.slice(start, i), start, end: i };
      continue;
    }

    if (!/\s/.test(ch)) {
      yield { kind: "symbol", text: ch, start: i, end: i + 1 };
    }
    i++;
  }
}

/** Название запроса так, как его показывает конструктор запросов. */
export function batchQueryTitle(query: BatchQuery): string {
  if (query.kind === "drop") return `Уничтожить ${query.tableName ?? ""}`.trim();
  return query.tableName ?? `Запрос пакета ${query.index}`;
}
