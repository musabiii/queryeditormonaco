/**
 * Разбор пакета запросов на отдельные запросы — как на вкладке «Пакет запросов»
 * конструктора 1С. Полноценный синтаксический разбор не нужен: достаточно
 * лексем, чтобы найти разделители «;», ПОМЕСТИТЬ и УНИЧТОЖИТЬ вне строк,
 * комментариев и подзапросов.
 */

import { tokenize, type Token } from "./lexer";

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
    if (token.kind === "comment") continue;
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

/** Название запроса так, как его показывает конструктор запросов. */
export function batchQueryTitle(query: BatchQuery): string {
  if (query.kind === "drop") return `Уничтожить ${query.tableName ?? ""}`.trim();
  return query.tableName ?? `Запрос пакета ${query.index}`;
}
