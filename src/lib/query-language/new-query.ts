/**
 * Заготовка запроса по таблице: в блоке, где ещё нет запроса (или есть только
 * «ВЫБРАТЬ»), набран путь «Справочник.МедицинскиеКарты» — предлагается
 *
 *   ВЫБРАТЬ
 *   	МедицинскиеКарты.
 *   ИЗ
 *   	Справочник.МедицинскиеКарты КАК МедицинскиеКарты
 *
 * с курсором после «МедицинскиеКарты.» — сразу выбирать реквизиты.
 */

import { tokenize } from "./lexer";
import { splitStatements } from "./completion/query-context";
import type { MetadataIndex } from "./completion/metadata-index";

export type NewQueryProposal = {
  /** Заменяемый участок: от конца «ВЫБРАТЬ» (или начала пути) до курсора. */
  from: number;
  to: number;
  text: string;
  /** Где поставить курсор — смещение внутри text. */
  cursor: number;
};

const SELECT = ["ВЫБРАТЬ", "SELECT"];

export function newQueryProposal(text: string, offset: number, index: MetadataIndex, eol = "\n"): NewQueryProposal | null {
  const tokens = tokenize(text);
  // Курсор в конце пути, дальше на строке пусто.
  const lineEnd = text.indexOf("\n", offset);
  if (text.slice(offset, lineEnd < 0 ? text.length : lineEnd).trim()) return null;
  if (tokens.some((token) => token.kind === "comment" && token.start < offset && offset <= token.end)) return null;

  const statement = splitStatements(tokens.filter((token) => token.kind !== "comment")).find(
    (s) => s.start <= offset && offset <= s.end,
  );
  const own = statement?.tokens ?? [];
  const select = own[0]?.kind === "word" && SELECT.includes(own[0].text.toUpperCase()) ? own[0] : undefined;
  const pathTokens = select ? own.slice(1) : own;
  // Только путь «Вид.Имя[.Таблица]», и курсор сразу за ним.
  if (pathTokens.length < 3 || pathTokens.length % 2 === 0 || pathTokens[pathTokens.length - 1].end !== offset) return null;
  if (!pathTokens.every((token, i) => (i % 2 === 0 ? token.kind === "word" : token.text === "."))) return null;
  const path = pathTokens.filter((_, i) => i % 2 === 0).map((token) => token.text);
  if (!index.rootKind(path[0]) || !index.resolveTable(path)) return null;

  // Псевдоним как у конструктора: МедицинскиеКарты, ТоварыНаСкладахОстатки.
  const alias = path.slice(1).join("");
  const first = select ?? pathTokens[0];
  const lineStart = text.lastIndexOf("\n", first.start - 1) + 1;
  const indent = /^[ \t]*/.exec(text.slice(lineStart))![0];
  const head = select ? "" : "ВЫБРАТЬ";
  const field = `${eol}${indent}\t${alias}.`;
  const body = `${head}${field}${eol}${indent}ИЗ${eol}${indent}\t${path.join(".")} КАК ${alias}`;
  return { from: select ? select.end : pathTokens[0].start, to: offset, text: body, cursor: head.length + field.length };
}
