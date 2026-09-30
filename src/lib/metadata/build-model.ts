import {
  DEFINED_TYPES_FOLDER,
  MD_KINDS,
  MODEL_FORMAT_VERSION,
  type ConfigurationModel,
  type MdObject,
} from "./model";
import {
  createDefinedTypeResolver,
  parseConfigurationInfo,
  parseDefinedType,
  parseMetadataObject,
} from "./parse-dump";

/** Файл выгрузки: папка вида объектов (Catalogs…) и способ прочитать текст. */
export type DumpFile = {
  folder: string;
  name: string;
  read: () => Promise<string>;
};

export type BuildResult = {
  model: ConfigurationModel;
  /** Файлы, которые не удалось разобрать, с причиной. */
  skipped: string[];
};

/** Папки выгрузки, из которых читаются описания объектов (только файлы верхнего уровня). */
export const DUMP_FOLDERS = [DEFINED_TYPES_FOLDER, ...MD_KINDS.map((k) => k.folder)];

const KIND_BY_FOLDER = new Map(MD_KINDS.map((k) => [k.folder, k.kind]));
const KIND_ORDER = new Map(MD_KINDS.map((k, i) => [k.kind, i]));

export async function buildModel(
  configuration: DumpFile,
  files: DumpFile[],
  onProgress?: (done: number, total: number) => void,
): Promise<BuildResult> {
  const info = parseConfigurationInfo(await configuration.read());
  if (!info) throw new Error("Configuration.xml не похож на выгрузку конфигурации в файлы");

  const skipped: string[] = [];
  const total = files.length;
  let done = 0;
  const step = () => {
    done++;
    if (onProgress && (done % 20 === 0 || done === total)) onProgress(done, total);
  };

  // Сначала определяемые типы: через них заданы типы многих реквизитов.
  const definitions = new Map<string, unknown>();
  for (const file of files.filter((f) => f.folder === DEFINED_TYPES_FOLDER)) {
    try {
      const defined = parseDefinedType(await file.read());
      if (defined) definitions.set(defined.name, defined.typeNode);
    } catch (error) {
      skipped.push(`${file.folder}/${file.name}: ${String(error)}`);
    }
    step();
  }
  const resolveDefined = createDefinedTypeResolver(definitions);

  const objects: MdObject[] = [];
  for (const file of files) {
    const kind = KIND_BY_FOLDER.get(file.folder);
    if (!kind) continue;
    try {
      const object = parseMetadataObject(await file.read(), kind, resolveDefined);
      if (object) objects.push(object);
      else skipped.push(`${file.folder}/${file.name}: не описание объекта`);
    } catch (error) {
      skipped.push(`${file.folder}/${file.name}: ${String(error)}`);
    }
    step();
  }

  objects.sort(
    (a, b) => KIND_ORDER.get(a.kind)! - KIND_ORDER.get(b.kind)! || a.name.localeCompare(b.name, "ru"),
  );

  return {
    model: { formatVersion: MODEL_FORMAT_VERSION, ...info, loadedAt: new Date().toISOString(), objects },
    skipped,
  };
}
