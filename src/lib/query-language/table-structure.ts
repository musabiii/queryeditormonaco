/**
 * Описание таблиц конфигурации, упомянутых в запросе, для ИИ-помощника:
 * реквизиты с типами, у объектов — табличные части и виртуальные таблицы,
 * у перечислений — значения. Модель видит настоящие имена полей и не
 * придумывает их.
 */

import { tokenize } from "./lexer";
import type { MetadataIndex, TableRef } from "./completion/metadata-index";

export type TablesStructure = {
  /** Таблицы в порядке упоминания: «Справочник.Валюты», «РегистрСведений.КурсыВалют.СрезПоследних». */
  tables: string[];
  text: string;
};

/** Предел описания, чтобы запрос с десятком больших документов не съел контекст модели. */
const MAX_CHARS = 60_000;
const MAX_VALUES = 100;

const GROUP_NOTE = { dimension: " (измерение)", resource: " (ресурс)", standard: "", attribute: "" } as const;

/** null — в запросе нет таблиц конфигурации. */
export function queryTablesStructure(query: string, index: MetadataIndex): TablesStructure | null {
  const tokens = tokenize(query).filter((token) => token.kind !== "comment" && token.kind !== "string");
  const found = new Map<string, TableRef>();

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    // Путь начинается с корня метаданных и не является продолжением другого пути.
    if (token.kind !== "word" || !index.rootKind(token.text) || tokens[i - 1]?.text === ".") continue;
    const path = [token.text];
    while (path.length < 3 && tokens[i + 1]?.text === "." && tokens[i + 2]?.kind === "word") {
      path.push(tokens[i + 2].text);
      i += 2;
    }
    // ЗНАЧЕНИЕ(Справочник.Валюты.ПустаяСсылка) — третья часть не таблица, берём объект.
    const table = index.resolveTable(path) ?? index.resolveTable(path.slice(0, 2));
    if (!table) continue;
    const name = index.describeTable(table);
    if (!found.has(name.toLowerCase())) found.set(name.toLowerCase(), table);
  }
  if (!found.size) return null;

  const tables: string[] = [];
  const blocks: string[] = [];
  let length = 0;
  for (const table of found.values()) {
    const block = describe(table, index);
    if (length + block.length > MAX_CHARS) {
      blocks.push(`(остальные таблицы не переданы — описание слишком большое)`);
      break;
    }
    tables.push(index.describeTable(table));
    blocks.push(block);
    length += block.length;
  }

  const { synonym, name, version } = index.model;
  const header = `Таблицы конфигурации «${synonym ?? name}»${version ? ` ${version}` : ""} из запроса — поля и их типы:`;
  return { tables, text: `${header}\n\n${blocks.join("\n\n")}` };
}

function describe(table: TableRef, index: MetadataIndex): string {
  const lines = [index.describeTable(table)];
  for (const field of index.fieldsOf(table)) {
    const types = field.types.length ? `: ${field.types.join(" | ")}` : "";
    lines.push(`- ${field.name}${types}${GROUP_NOTE[field.group]}`);
  }
  if (table.type === "object") {
    const sub = index.subTables(table.object);
    const tabular = sub.filter((s) => s.kind === "tabular").map((s) => s.name);
    const virtual = sub.filter((s) => s.kind === "virtual").map((s) => s.name);
    if (tabular.length) lines.push(`Табличные части: ${tabular.join(", ")}`);
    if (virtual.length) lines.push(`Виртуальные таблицы: ${virtual.join(", ")}`);
    const values = table.object.values ?? [];
    if (values.length) {
      const more = values.length > MAX_VALUES ? ` и ещё ${values.length - MAX_VALUES}` : "";
      lines.push(`Значения: ${values.slice(0, MAX_VALUES).join(", ")}${more}`);
    }
  }
  return lines.join("\n");
}
