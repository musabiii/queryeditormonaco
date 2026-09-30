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
 */

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
