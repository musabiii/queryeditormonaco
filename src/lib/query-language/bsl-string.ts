/**
 * Текст запроса из листинга кода 1С — многострочного строкового литерала:
 *
 *   Запрос.Текст = "ВЫБРАТЬ
 *   	|	Т.Ссылка
 *   	|ИЗ
 *   	|	Справочник.Номенклатура КАК Т";
 *
 * Убираются кавычки литерала и то, что стоит перед ним, «|» в начале строк
 * с отступом кода перед ними, строки-комментарии внутри литерала (1С их
 * пропускает), удвоенные кавычки становятся одинарными.
 *
 * И обратно: запрос — в код 1С, который его выполняет.
 */

import { parseBatch } from "./batch";
import { tokenize, type Token } from "./lexer";
import { collectParameters } from "./parameters";

/** Текст без оформления или null, если это не похоже на литерал из кода 1С. */
export function unwrapBslString(text: string): string | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const first = lines.findIndex((line) => line.includes('"') || line.trimStart().startsWith("|"));
  if (first < 0) return null;
  const continued = lines.slice(first + 1).some((line) => line.trimStart().startsWith("|"));
  const opening = lines[first].indexOf('"');
  // Перед кавычкой — ничего, присваивание или скобка: «"ВЫБРАТЬ», «Текст = "ВЫБРАТЬ», «Запрос("ВЫБРАТЬ».
  if (opening >= 0 && !/(^|[=(])\s*$/.test(lines[first].slice(0, opening))) return null;
  // Без «|» литерал может быть только однострочным и закрытым в той же строке —
  // иначе это обычный запрос, в котором просто есть строки в кавычках.
  if (!continued) {
    if (lines.filter((line) => line.trim()).length !== 1) return null;
    if (!/"\s*\)?\s*;?\s*$/.test(lines[first].slice(opening + 1))) return null;
  }

  const result: string[] = [];
  // Строки до литерала: «ТекстЗапроса =» на отдельной строке и пустые.
  for (const line of lines.slice(0, first)) {
    if (line.trim() && !/=\s*$/.test(line)) result.push(line);
  }

  const head = lines[first];
  result.push(opening >= 0 && !head.trimStart().startsWith("|") ? head.slice(opening + 1) : stripBar(head));

  for (const line of lines.slice(first + 1)) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("|")) result.push(stripBar(line));
    else if (trimmed.startsWith("//")) continue;
    else result.push(line);
  }

  // Закрывающая кавычка литерала: «"», «";», «");».
  for (let i = result.length - 1; i >= 0; i--) {
    if (!result[i].trim()) continue;
    result[i] = result[i].replace(/"\s*\)?\s*;?\s*$/, "");
    break;
  }

  return result.join("\n").replace(/""/g, '"').replace(/\s+$/, "");
}

const stripBar = (line: string) => line.slice(line.indexOf("|") + 1);

/**
 * Код 1С для выполнения запроса — как у конструктора запроса с обработкой
 * результата: создание запроса, текст литералом, установка параметров, обход
 * выборки. Первая строка без отступа, остальные с одним табом — фрагмент
 * вставляется в позицию курсора внутри процедуры.
 */
export function bslQueryCode(query: string): string {
  const text = query.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  const literal = text
    .split("\n")
    .map((line, i) => `${i === 0 ? '"' : "|"}${line.replace(/"/g, '""')}`)
    .join("\n\t\t");

  const lines = ["Запрос = Новый Запрос;", "Запрос.Текст = ", `\t"${literal.slice(1)}";`, ""];

  const parameters = collectParameters(text);
  for (const { name } of parameters) lines.push(`Запрос.УстановитьПараметр("${name}", ${name});`);
  if (parameters.length) lines.push("");

  const selects = parseBatch(text).filter((batchQuery) => batchQuery.kind === "select");
  const last = selects.at(-1);
  if (last) {
    // Запрос.Выполнить() возвращает результат последнего запроса пакета.
    const groupings = totalsGroupings(tokenize(text.slice(last.start, last.end)));
    lines.push("РезультатЗапроса = Запрос.Выполнить();", "", ...selectionLoops("РезультатЗапроса", groupings));
  } else {
    // Только временные таблицы — выбирать нечего.
    lines.push("Запрос.Выполнить();");
  }

  return lines.map((line, i) => (i === 0 ? line : `\t${line}`)).join("\n");
}

type Grouping = { name: string; hierarchy: boolean };

/**
 * Обход выборки: по вложенному циклу на каждую группировку ИТОГИ ПО,
 * внутри последнего — детальные записи. Пустые строки без отступа:
 * общий отступ фрагмента добавляется в конце.
 */
function selectionLoops(source: string, groupings: Grouping[]): string[] {
  const [grouping, ...rest] = groupings;
  const selection = grouping ? `Выборка${grouping.name}` : "ВыборкаДетальныеЗаписи";
  const traversal = grouping
    ? `ОбходРезультатаЗапроса.${grouping.hierarchy ? "ПоГруппировкамСИерархией" : "ПоГруппировкам"}`
    : "";
  const body = grouping ? ["", ...selectionLoops(selection, rest)] : [];
  return [
    `${selection} = ${source}.Выбрать(${traversal});`,
    "",
    `Пока ${selection}.Следующий() Цикл`,
    `\t// Вставить обработку выборки ${selection}`,
    ...body.map((line) => (line ? `\t${line}` : line)),
    "КонецЦикла;",
  ];
}

const word = (token: Token | undefined) => (token?.kind === "word" ? token.text.toUpperCase() : "");

const GROUPING_TAIL = new Set(["ИЕРАРХИЯ", "HIERARCHY", "ТОЛЬКО", "ONLY", "ПЕРИОДАМИ", "PERIODS"]);

/** Группировки из «ИТОГИ ... ПО Поле1, Поле2 ИЕРАРХИЯ» на верхнем уровне запроса. */
function totalsGroupings(tokens: Token[]): Grouping[] {
  // Только верхний уровень: запятые в ПЕРИОДАМИ(ДЕНЬ, &Начало, &Конец) и
  // в агрегатах ИТОГИ СУММА(...) группировки не разделяют.
  const topLevel: Token[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (token.kind === "comment") continue;
    if (token.text === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) topLevel.push(token);
    if (token.text === "(") depth++;
  }

  const totals = topLevel.findIndex((token) => ["ИТОГИ", "TOTALS"].includes(word(token)));
  if (totals < 0) return [];
  const by = topLevel.findIndex((token, i) => i > totals && ["ПО", "BY"].includes(word(token)));
  if (by < 0) return [];

  const groups: Token[][] = [[]];
  for (const token of topLevel.slice(by + 1)) {
    if (token.text === ",") groups.push([]);
    else groups[groups.length - 1].push(token);
  }

  const used = new Map<string, number>();
  return groups
    .filter((group) => group.length)
    .map((group) => {
      const words = group.map(word);
      const as = words.findIndex((w) => w === "КАК" || w === "AS");
      let name: string;
      if (words[0] === "ОБЩИЕ" || words[0] === "OVERALL") name = "ОбщийИтог";
      else if (as >= 0 && group[as + 1]?.kind === "word") name = group[as + 1].text;
      else {
        // Последнее имя пути до ИЕРАРХИЯ / ПЕРИОДАМИ: Товары.Номенклатура — Номенклатура.
        const end = words.findIndex((w) => GROUPING_TAIL.has(w));
        const path = (end < 0 ? group : group.slice(0, end)).filter((token) => token.kind === "word");
        name = path.at(-1)?.text ?? "Группировка";
      }
      // Одинаковые имена переменных во вложенных циклах недопустимы.
      const count = (used.get(name.toUpperCase()) ?? 0) + 1;
      used.set(name.toUpperCase(), count);
      if (count > 1) name += count;
      return { name, hierarchy: words.includes("ИЕРАРХИЯ") || words.includes("HIERARCHY") };
    });
}
