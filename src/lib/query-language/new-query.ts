/**
 * Заготовка по набранному в ВЫБРАТЬ пути к таблице «Справочник.МедицинскиеКарты»:
 *
 * - в блоке, где ещё нет запроса (или есть только «ВЫБРАТЬ»), — весь запрос:
 *
 *     ВЫБРАТЬ
 *     	МедицинскиеКарты.
 *     ИЗ
 *     	Справочник.МедицинскиеКарты КАК МедицинскиеКарты
 *
 * - в запросе с ИЗ, где этой таблицы нет, — путь заменяется псевдонимом, а таблица
 *   присоединяется левым соединением с подобранным условием (как двойной клик в дереве).
 *
 * Курсор встаёт после «Псевдоним.» — сразу выбирать реквизиты.
 */

import { tokenize, type Token } from "./lexer";
import { splitStatements } from "./completion/query-context";
import { isAliasListPosition } from "./completion/provider";
import type { MetadataIndex } from "./completion/metadata-index";
import { tableJoin } from "./smart-insert";

export type QueryEdit = { from: number; to: number; text: string };

export type NewQueryProposal = {
  /** Правки в смещениях исходного текста, не пересекаются. */
  edits: QueryEdit[];
  /** Курсор после правок — смещение в новом тексте. */
  cursor: number;
  /** Что показать серым: строки и смещение, после строки которого их показать. */
  preview: { offset: number; lines: string[] }[];
  hint: string;
};

const SELECT = ["ВЫБРАТЬ", "SELECT"];
const SELECT_HEAD = ["ВЫБРАТЬ", "SELECT", "РАЗЛИЧНЫЕ", "DISTINCT", "РАЗРЕШЕННЫЕ", "ALLOWED"];
const upper = (token: Token | undefined) => (token?.kind === "word" ? token.text.toUpperCase() : "");

export function newQueryProposal(text: string, offset: number, index: MetadataIndex, eol = "\n"): NewQueryProposal | null {
  const tokens = tokenize(text);
  // Курсор в конце пути, дальше на строке пусто.
  const lineEnd = text.indexOf("\n", offset);
  if (text.slice(offset, lineEnd < 0 ? text.length : lineEnd).trim()) return null;
  if (tokens.some((token) => token.kind !== "word" && token.kind !== "symbol" && token.start < offset && offset <= token.end)) return null;

  const statement = splitStatements(tokens.filter((token) => token.kind !== "comment")).find(
    (s) => s.start <= offset && offset <= s.end,
  );
  const own = statement?.tokens ?? [];
  const end = own.findIndex((token) => token.end === offset);
  if (end < 0) return null;
  // Путь «Вид.Имя[.Таблица]» перед курсором.
  let start = end;
  while (start >= 2 && own[start - 1].text === "." && own[start - 2].kind === "word") start -= 2;
  const pathTokens = own.slice(start, end + 1);
  if (pathTokens.length < 3 || own[end].kind !== "word" || own[start - 1]?.text === ".") return null;
  const path = pathTokens.filter((_, i) => i % 2 === 0).map((token) => token.text);
  if (!index.rootKind(path[0]) || !index.resolveTable(path)) return null;

  const before = own.slice(0, start);
  const onlyPath = end === own.length - 1 && (!before.length || (before.length === 1 && SELECT.includes(upper(before[0]))));
  if (onlyPath) {
    return wholeQuery(text, offset, path, pathTokens[0], before[0], eol);
  }
  // Новый элемент списка ВЫБРАТЬ: после ВЫБРАТЬ (РАЗЛИЧНЫЕ…) или запятой.
  const previous = before[before.length - 1];
  if (previous.text !== "," && !SELECT_HEAD.includes(upper(previous))) return null;
  if (!isAliasListPosition(text, pathTokens[0].start)) return null;
  return joinedTable(text, offset, path, pathTokens[0].start, index, eol);
}

function wholeQuery(text: string, offset: number, path: string[], first: Token, select: Token | undefined, eol: string): NewQueryProposal {
  // Псевдоним как у конструктора: МедицинскиеКарты, ТоварыНаСкладахОстатки.
  const alias = path.slice(1).join("");
  const head = select ?? first;
  const lineStart = text.lastIndexOf("\n", head.start - 1) + 1;
  const indent = /^[ \t]*/.exec(text.slice(lineStart))![0];
  const keyword = select ? "" : "ВЫБРАТЬ";
  const field = `${eol}${indent}\t${alias}.`;
  const body = `${keyword}${field}${eol}${indent}ИЗ${eol}${indent}\t${path.join(".")} КАК ${alias}`;
  const from = select ? select.end : first.start;
  return {
    edits: [{ from, to: offset, text: body }],
    cursor: from + keyword.length + field.length,
    preview: [{ offset, lines: (text.slice(lineStart, from) + body).split(eol) }],
    hint: "Tab — оформить запрос, Esc — нет",
  };
}

function joinedTable(text: string, offset: number, path: string[], pathStart: number, index: MetadataIndex, eol: string): NewQueryProposal | null {
  // Соединение подбираем по тексту без набранного пути — он станет «Псевдоним.».
  const without = text.slice(0, pathStart) + text.slice(offset);
  const join = tableJoin(without, pathStart, path, index);
  if (!join) return null;
  const shift = offset - pathStart;
  const joins = join.edits.map((edit) => ({ from: edit.start + shift, to: edit.end + shift, text: edit.text.replaceAll("\n", eol) }));
  const lineStart = text.lastIndexOf("\n", pathStart - 1) + 1;
  const field = `${join.alias}.`;
  return {
    edits: [{ from: pathStart, to: offset, text: field }, ...joins],
    cursor: pathStart + field.length,
    preview: joins.length
      ? joins.map((edit) => ({ offset: edit.from, lines: edit.text.split(eol).filter((line) => line.trim()) }))
      : [{ offset, lines: [text.slice(lineStart, pathStart) + field] }],
    hint: joins.length ? `Tab — соединить и выбрать реквизит ${join.alias}, Esc — нет` : `Tab — ${field}, Esc — нет`,
  };
}
