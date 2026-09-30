/**
 * Минимальный и быстрый разбор XML для файлов выгрузки конфигурации 1С.
 *
 * Выгрузки однообразны: без смешанного содержимого, CDATA и DTD. Поэтому
 * достаточно одного прохода по строке. Результат — объекты вида
 * { ИмяТега: значение }: префиксы пространств имён отброшены, повторяющиеся
 * теги собираются в массив, атрибуты — в ключи «@имя», текст элемента
 * с атрибутами — в «#text», пустые элементы — пустая строка.
 */

export type XmlValue = string | XmlNode | XmlValue[];
export type XmlNode = { [key: string]: XmlValue };

type Frame = { name: string; node: XmlNode; text: string; hasChildren: boolean };

const TAG = /<(\/?)([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*"[^"]*")*)\s*(\/?)>/y;
const ATTRIBUTE = /([^\s=]+)\s*=\s*"([^"]*)"/g;
const ENTITY = /&(?:#x([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));/g;
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(ENTITY, (_, hex: string, dec: string, named: string) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : dec ? String.fromCodePoint(+dec) : NAMED[named],
  );
}

const localName = (name: string) => {
  const colon = name.indexOf(":");
  return colon < 0 ? name : name.slice(colon + 1);
};

function attributesOf(source: string): XmlNode | null {
  if (!source) return null;
  const node: XmlNode = {};
  let found = false;
  ATTRIBUTE.lastIndex = 0;
  for (let m = ATTRIBUTE.exec(source); m; m = ATTRIBUTE.exec(source)) {
    // Объявления пространств имён не нужны.
    if (m[1] === "xmlns" || m[1].startsWith("xmlns:")) continue;
    node["@" + localName(m[1])] = decode(m[2]);
    found = true;
  }
  return found ? node : null;
}

function append(parent: XmlNode, name: string, value: XmlValue) {
  const existing = parent[name];
  if (existing === undefined) parent[name] = value;
  else if (Array.isArray(existing)) existing.push(value);
  else parent[name] = [existing, value];
}

export function parseXml(xml: string): XmlNode {
  const root: Frame = { name: "", node: {}, text: "", hasChildren: false };
  const stack: Frame[] = [root];
  let position = xml.charCodeAt(0) === 0xfeff ? 1 : 0;

  while (position < xml.length) {
    const lt = xml.indexOf("<", position);
    if (lt < 0) break;
    const top = stack[stack.length - 1];
    if (lt > position) top.text += xml.slice(position, lt);

    // Объявление <?xml ?> и комментарии пропускаем.
    const skipTo = xml.startsWith("<?", lt) ? "?>" : xml.startsWith("<!--", lt) ? "-->" : null;
    if (skipTo) {
      const end = xml.indexOf(skipTo, lt);
      if (end < 0) throw new Error("XML оборван: незакрытое объявление или комментарий");
      position = end + skipTo.length;
      continue;
    }

    TAG.lastIndex = lt;
    const match = TAG.exec(xml);
    if (!match) throw new Error(`Некорректный XML около позиции ${lt}`);
    position = TAG.lastIndex;
    const [, closing, rawName, rawAttributes, selfClosing] = match;
    const name = localName(rawName);

    if (closing) {
      const frame = stack.pop();
      if (!frame || frame.name !== name || stack.length === 0) {
        throw new Error(`Незакрытый или лишний тег </${rawName}>`);
      }
      const text = frame.text.trim();
      let value: XmlValue;
      if (frame.hasChildren || Object.keys(frame.node).length) {
        if (text) frame.node["#text"] = decode(text);
        value = frame.node;
      } else {
        value = decode(text);
      }
      const parent = stack[stack.length - 1];
      parent.hasChildren = true;
      append(parent.node, name, value);
      continue;
    }

    const attributes = attributesOf(rawAttributes);
    if (selfClosing) {
      top.hasChildren = true;
      append(top.node, name, attributes ?? "");
    } else {
      stack.push({ name, node: attributes ?? {}, text: "", hasChildren: false });
    }
  }

  if (stack.length !== 1) throw new Error("XML оборван: не все теги закрыты");
  return root.node;
}
