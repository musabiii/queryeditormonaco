/**
 * Разбор выгрузки конфигурации в файлы (Конфигуратор → «Выгрузить конфигурацию в файлы»).
 * Не зависит от браузера: работает и в Web Worker, и в Node.
 */

import { MD_KINDS, type MdField, type MdKind, type MdObject, type MdTable } from "./model";
import { parseXml } from "./xml";

type XmlNode = Record<string, unknown>;

const asArray = <T>(value: T | T[] | null | undefined): T[] =>
  value == null || value === "" ? [] : Array.isArray(value) ? value : [value];

const asNode = (value: unknown): XmlNode | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as XmlNode) : undefined;

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const node = asNode(value);
  return node && typeof node["#text"] === "string" ? node["#text"].trim() : "";
}

function synonymOf(properties: XmlNode | undefined): string | undefined {
  const items = asArray(asNode(properties?.Synonym)?.item as XmlNode | XmlNode[] | undefined);
  const item = items.find((i) => textOf(i.lang) === "ru") ?? items[0];
  return item ? textOf(item.content) || undefined : undefined;
}

// ---------- Типы ----------

/** Вид ссылочного типа в выгрузке → как тип пишется в языке запросов. */
const REF_TYPES: Record<string, string> = {
  CatalogRef: "Справочник",
  DocumentRef: "Документ",
  EnumRef: "Перечисление",
  ChartOfCharacteristicTypesRef: "ПланВидовХарактеристик",
  ChartOfAccountsRef: "ПланСчетов",
  ChartOfCalculationTypesRef: "ПланВидовРасчета",
  BusinessProcessRef: "БизнесПроцесс",
  BusinessProcessRoutePointRef: "ТочкаМаршрутаБизнесПроцесса",
  TaskRef: "Задача",
  ExchangePlanRef: "ПланОбмена",
};

const SIMPLE_TYPES: Record<string, string> = {
  "xs:dateTime": "Дата",
  "xs:boolean": "Булево",
  "xs:base64Binary": "ДвоичныеДанные",
  "v8:ValueStorage": "ХранилищеЗначения",
  "v8:UUID": "УникальныйИдентификатор",
  "v8:Null": "NULL",
  "cfg:AnyRef": "ЛюбаяСсылка",
};

/** Разворачивает определяемые типы (DefinedType) в реальные типы. */
export type DefinedTypeResolver = (name: string) => string[];

function convertType(raw: string, typeNode: XmlNode): string {
  if (raw === "xs:decimal") {
    const q = asNode(typeNode.NumberQualifiers);
    const digits = textOf(q?.Digits);
    const fraction = textOf(q?.FractionDigits);
    if (!digits || digits === "0") return "Число";
    return fraction && fraction !== "0" ? `Число(${digits}, ${fraction})` : `Число(${digits})`;
  }
  if (raw === "xs:string") {
    const length = textOf(asNode(typeNode.StringQualifiers)?.Length);
    return length && length !== "0" ? `Строка(${length})` : "Строка";
  }
  if (raw in SIMPLE_TYPES) return SIMPLE_TYPES[raw];

  const ref = /^cfg:(\w+Ref)(?:\.(.+))?$/.exec(raw);
  if (ref && ref[1] in REF_TYPES) {
    return ref[2] ? `${REF_TYPES[ref[1]]}.${ref[2]}` : `${REF_TYPES[ref[1]]}Ссылка`;
  }
  return raw.replace(/^(cfg|v8|xs):/, "");
}

function typesOf(typeValue: unknown, resolveDefined: DefinedTypeResolver): string[] {
  const typeNode = asNode(typeValue);
  if (!typeNode) return [];
  const types: string[] = [];
  for (const t of asArray(typeNode.Type)) types.push(convertType(textOf(t), typeNode));
  for (const t of asArray(typeNode.TypeSet)) {
    const raw = textOf(t);
    const defined = /^cfg:DefinedType\.(.+)$/.exec(raw);
    const characteristic = /^cfg:Characteristic\.(.+)$/.exec(raw);
    if (defined) types.push(...resolveDefined(defined[1]));
    else if (characteristic) types.push(`Характеристика.${characteristic[1]}`);
    // Набор «любая ссылка вида»: cfg:DocumentRef — любой документ, cfg:AnyRef — любая ссылка.
    else types.push(convertType(raw, {}));
  }
  return [...new Set(types)];
}

// ---------- Ссылки на объекты метаданных ----------

const QUERY_NAME_BY_KIND = new Map(MD_KINDS.map((k) => [k.kind as string, k.queryName]));

/** «Catalog.Сотрудники» → «Справочник.Сотрудники». */
function convertMdRef(raw: string): string {
  const [kind, ...rest] = raw.split(".");
  const queryName = QUERY_NAME_BY_KIND.get(kind);
  return queryName && rest.length ? [queryName, ...rest].join(".") : raw;
}

function refsOf(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [convertMdRef(value.trim())] : [];
  const node = asNode(value);
  if (!node) return [];
  return asArray(node.Item).map(textOf).filter(Boolean).map(convertMdRef);
}

// ---------- Свойства объектов ----------

type PropReader = "text" | "bool" | "refs" | "type";

/** Какие свойства объектов сохранять: [тег в выгрузке, ключ в модели, как читать]. */
const PROPS: Partial<Record<MdKind, [string, string, PropReader][]>> = {
  Catalog: [
    ["Hierarchical", "hierarchical", "bool"],
    ["HierarchyType", "hierarchyType", "text"],
    ["Owners", "owners", "refs"],
    ["CodeLength", "codeLength", "text"],
    ["DescriptionLength", "descriptionLength", "text"],
  ],
  Document: [["NumberLength", "numberLength", "text"]],
  DocumentJournal: [["RegisteredDocuments", "registeredDocuments", "refs"]],
  ChartOfCharacteristicTypes: [
    ["Hierarchical", "hierarchical", "bool"],
    ["CodeLength", "codeLength", "text"],
    ["DescriptionLength", "descriptionLength", "text"],
    ["Type", "valueType", "type"],
  ],
  ChartOfAccounts: [
    ["CodeLength", "codeLength", "text"],
    ["DescriptionLength", "descriptionLength", "text"],
    ["ExtDimensionTypes", "extDimensionTypes", "refs"],
    ["MaxExtDimensionCount", "maxExtDimensionCount", "text"],
  ],
  ChartOfCalculationTypes: [
    ["CodeLength", "codeLength", "text"],
    ["DescriptionLength", "descriptionLength", "text"],
    ["DependenceOnCalculationTypes", "dependence", "text"],
    ["ActionPeriodUse", "actionPeriodUse", "bool"],
  ],
  InformationRegister: [
    ["InformationRegisterPeriodicity", "periodicity", "text"],
    ["WriteMode", "writeMode", "text"],
  ],
  AccumulationRegister: [["RegisterType", "registerType", "text"]],
  AccountingRegister: [
    ["ChartOfAccounts", "chartOfAccounts", "refs"],
    ["Correspondence", "correspondence", "bool"],
  ],
  CalculationRegister: [
    ["Periodicity", "periodicity", "text"],
    ["ActionPeriod", "actionPeriod", "bool"],
    ["BasePeriod", "basePeriod", "bool"],
    ["Schedule", "schedule", "refs"],
    ["ChartOfCalculationTypes", "chartOfCalculationTypes", "refs"],
  ],
  BusinessProcess: [
    ["Task", "task", "refs"],
    ["NumberLength", "numberLength", "text"],
  ],
  Task: [
    ["NumberLength", "numberLength", "text"],
    ["DescriptionLength", "descriptionLength", "text"],
  ],
  ExchangePlan: [
    ["CodeLength", "codeLength", "text"],
    ["DescriptionLength", "descriptionLength", "text"],
  ],
  Constant: [["Type", "valueType", "type"]],
  Sequence: [["Documents", "documents", "refs"]],
  FilterCriterion: [["Type", "valueType", "type"]],
};

function readProps(kind: MdKind, properties: XmlNode, resolveDefined: DefinedTypeResolver) {
  const result: Record<string, string | string[] | boolean> = {};
  for (const [tag, key, reader] of PROPS[kind] ?? []) {
    const value = properties[tag];
    if (value === undefined) continue;
    if (reader === "bool") result[key] = textOf(value) === "true";
    else if (reader === "text") {
      const text = textOf(value);
      if (text) result[key] = text;
    } else {
      const list = reader === "refs" ? refsOf(value) : typesOf(value, resolveDefined);
      if (list.length) result[key] = list;
    }
  }
  return Object.keys(result).length ? result : undefined;
}

// ---------- Разбор файлов ----------

function fieldOf(node: XmlNode, resolveDefined: DefinedTypeResolver): MdField {
  const properties = asNode(node.Properties) ?? {};
  const name = textOf(properties.Name);
  const synonym = synonymOf(properties);
  return {
    name,
    ...(synonym && synonym !== name ? { synonym } : {}),
    type: typesOf(properties.Type, resolveDefined),
  };
}

export type ConfigurationInfo = {
  id: string;
  name: string;
  synonym?: string;
  version?: string;
  vendor?: string;
};

/** Configuration.xml — имя, синоним, версия и поставщик конфигурации. */
export function parseConfigurationInfo(xml: string): ConfigurationInfo | null {
  const configuration = asNode(asNode(parseXml(xml).MetaDataObject)?.Configuration);
  const properties = asNode(configuration?.Properties);
  if (!configuration || !properties) return null;
  const name = textOf(properties.Name);
  return {
    id: textOf(configuration["@uuid"]) || name,
    name,
    synonym: synonymOf(properties),
    version: textOf(properties.Version) || undefined,
    vendor: textOf(properties.Vendor) || undefined,
  };
}

/** DefinedTypes/Имя.xml — имя и узел типа (раскрывается позже, когда известны все определяемые типы). */
export function parseDefinedType(xml: string): { name: string; typeNode: unknown } | null {
  const node = asNode(asNode(parseXml(xml).MetaDataObject)?.DefinedType);
  const properties = asNode(node?.Properties);
  if (!properties) return null;
  return { name: textOf(properties.Name), typeNode: properties.Type };
}

/** Строит функцию раскрытия определяемых типов; вложенные определяемые типы тоже раскрываются. */
export function createDefinedTypeResolver(definitions: Map<string, unknown>): DefinedTypeResolver {
  const cache = new Map<string, string[]>();
  const resolving = new Set<string>();
  const resolve: DefinedTypeResolver = (name) => {
    const cached = cache.get(name);
    if (cached) return cached;
    if (resolving.has(name) || !definitions.has(name)) return [`ОпределяемыйТип.${name}`];
    resolving.add(name);
    const types = typesOf(definitions.get(name), resolve);
    resolving.delete(name);
    cache.set(name, types);
    return types;
  };
  return resolve;
}

/** Файл объекта метаданных, например Catalogs/Сотрудники.xml. */
export function parseMetadataObject(
  xml: string,
  kind: MdKind,
  resolveDefined: DefinedTypeResolver,
): MdObject | null {
  const node = asNode(asNode(parseXml(xml).MetaDataObject)?.[kind]);
  const properties = asNode(node?.Properties);
  if (!node || !properties) return null;

  const children = asNode(node.ChildObjects) ?? {};
  const list = (tag: string) => asArray(children[tag] as XmlNode | XmlNode[] | undefined);
  const fields = (tag: string) => list(tag).map((child) => fieldOf(child, resolveDefined));

  const tables: MdTable[] = list("TabularSection").map((section) => {
    const sectionProps = asNode(section.Properties) ?? {};
    const name = textOf(sectionProps.Name);
    const synonym = synonymOf(sectionProps);
    const sectionChildren = asNode(section.ChildObjects) ?? {};
    return {
      name,
      ...(synonym && synonym !== name ? { synonym } : {}),
      fields: asArray(sectionChildren.Attribute as XmlNode | XmlNode[] | undefined).map((a) =>
        fieldOf(a, resolveDefined),
      ),
    };
  });

  const name = textOf(properties.Name);
  const synonym = synonymOf(properties);
  const object: MdObject = {
    kind,
    name,
    ...(synonym && synonym !== name ? { synonym } : {}),
    // Графы журналов, реквизиты адресации задач и признаки учёта счетов тоже доступны как поля.
    fields: [...fields("Attribute"), ...fields("AddressingAttribute"), ...fields("Column"), ...fields("AccountingFlag")],
  };
  const dimensions = fields("Dimension");
  const resources = fields("Resource");
  const values = list("EnumValue").map((v) => textOf(asNode(v.Properties)?.Name)).filter(Boolean);
  const props = readProps(kind, properties, resolveDefined);
  if (dimensions.length) object.dimensions = dimensions;
  if (resources.length) object.resources = resources;
  if (tables.length) object.tables = tables;
  if (values.length) object.values = values;
  if (props) object.props = props;
  return object;
}
