/**
 * Связанное редактирование псевдонима таблицы: правка «ФЛ» в «КАК ФЛ» раздела ИЗ
 * меняет псевдоним во всём запросе сразу — во всех путях «ФЛ.…». Границы — запрос пакета, часть
 * ОБЪЕДИНИТЬ и подзапрос, в котором объявлен псевдоним; вложенные подзапросы
 * со своими таблицами не затрагиваются.
 */

import { tokenize, type Token } from "./lexer";
import { AFTER_FROM, innermostScope, matchParen, splitStatements, unionPart } from "./completion/query-context";

export type TextRange = { start: number; end: number };

const upper = (token: Token | undefined) => (token?.kind === "word" ? token.text.toUpperCase() : "");
const is = (token: Token | undefined, ...words: string[]) => words.includes(upper(token));

/** Вхождения псевдонима под курсором; null — под курсором не псевдоним таблицы. */
export function linkedAliasRanges(text: string, offset: number): TextRange[] | null {
  const tokens = tokenize(text).filter((token) => token.kind !== "comment");
  // Курсор внутри слова или сразу за ним (так бывает во время набора).
  const word = tokens.find((token) => token.kind === "word" && token.start <= offset && offset <= token.end);
  if (!word) return null;
  const statement = splitStatements(tokens).find((s) => s.start <= word.start && word.end <= s.end);
  if (!statement) return null;

  const scope = ownTokens(unionPart(innermostScope(statement.tokens, word.start), word.start));
  const name = word.text.toLowerCase();
  // Правка запускается только с определения «КАК Псевдоним»; правка «ФЛ» в «ФЛ.Поле» — обычная.
  const definition = aliasDefinition(scope, name);
  if (definition !== word) return null;

  // Определение и начала путей «Псевдоним.…» (не «Т.Псевдоним» — это поле).
  const ranges = scope
    .filter(
      (token, i) =>
        token === definition ||
        (token.kind === "word" && token.text.toLowerCase() === name && scope[i + 1]?.text === "." && scope[i - 1]?.text !== "."),
    )
    .map((token) => ({ start: token.start, end: token.end }));
  return ranges.some((range) => range.start === word.start) ? ranges : null;
}

/** Лексемы области без вложенных подзапросов «(ВЫБРАТЬ …)»: у них свои псевдонимы. */
function ownTokens(scope: Token[]): Token[] {
  const own: Token[] = [];
  for (let i = 0; i < scope.length; i++) {
    if (scope[i].text === "(" && is(scope[i + 1], "ВЫБРАТЬ", "SELECT")) {
      i = matchParen(scope, i);
      continue;
    }
    own.push(scope[i]);
  }
  return own;
}

/** «КАК Псевдоним» в разделе ИЗ этой области. */
function aliasDefinition(scope: Token[], name: string): Token | undefined {
  const from = scope.findIndex((token) => is(token, "ИЗ", "FROM"));
  if (from < 0) return undefined;
  for (let i = from + 1; i < scope.length; i++) {
    if (is(scope[i], ...AFTER_FROM)) break;
    if (is(scope[i], "КАК", "AS") && scope[i + 1]?.kind === "word" && scope[i + 1].text.toLowerCase() === name) return scope[i + 1];
  }
  return undefined;
}
