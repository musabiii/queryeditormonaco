/**
 * Прогон проверки синтаксиса по настоящим запросам из модулей выгрузки конфигурации:
 *
 *   npm run syntax:corpus -- <папка выгрузки> [файл отчёта]
 *
 * Из файлов .bsl извлекаются строковые литералы, начинающиеся с ВЫБРАТЬ/SELECT.
 * Шаблоны, которые код дособирает перед выполнением (#Таблица, %1, %Поля%,
 * обрывки без ИЗ), отсеиваются. Каждая ошибка в оставшихся запросах типовой —
 * повод проверить грамматику (grammar/sdbl) или сообщения syntax-check.ts.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkSyntax } from "../src/lib/query-language/syntax-check";

function* bslFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* bslFiles(path);
    else if (name.endsWith(".bsl")) yield path;
  }
}

/** Строковые литералы BSL с текстом запроса; склеиваемые через «+» пропускаются. */
function queries(source: string): string[] {
  const found: string[] = [];
  const start = /"\s*(?:\|\s*)?(?:ВЫБРАТЬ|SELECT)(?![\p{L}\p{N}_])/giu;
  let match: RegExpExecArray | null;
  while ((match = start.exec(source))) {
    const open = match.index;
    let close = open + 1;
    for (; close < source.length; close++) {
      if (source[close] !== '"') continue;
      if (source[close + 1] === '"') close++;
      else break;
    }
    start.lastIndex = close + 1;
    const glued = /\+\s*$/.test(source.slice(Math.max(0, open - 20), open)) || /^\s*\+/.test(source.slice(close + 1, close + 20));
    if (glued) continue;
    const text = source.slice(open + 1, close).replace(/\n[ \t]*\|/g, "\n").replace(/""/g, '"');
    const template = /#[\p{L}_]|%[\p{L}\d]|\?[a-z]+=/u.test(text) || !/(ИЗ|FROM|ПОМЕСТИТЬ|INTO)/iu.test(text);
    if (!template) found.push(text);
  }
  return found;
}

const [dump, report] = process.argv.slice(2);
if (!dump) {
  console.error("Использование: npm run syntax:corpus -- <папка выгрузки> [файл отчёта]");
  process.exit(1);
}

let total = 0;
const failures: string[] = [];
const kinds = new Map<string, number>();
for (const file of bslFiles(dump)) {
  for (const query of queries(readFileSync(file, "utf8"))) {
    total++;
    const [error] = checkSyntax(query);
    if (!error) continue;
    const kind = error.message.replace(/«[^»]*»/, "«…»");
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    failures.push(`### ${file}\n${error.message}\n${query.slice(Math.max(0, error.start - 200), error.end + 100)}`);
  }
}

console.log(`${dump}: запросов ${total}, с ошибками ${failures.length}`);
for (const [kind, count] of [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`${count}\t${kind}`);
if (report) writeFileSync(report, failures.join("\n\n"));
