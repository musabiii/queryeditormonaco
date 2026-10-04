/**
 * Собирает встроенную типовую конфигурацию из выгрузки в XML:
 *
 *   npm run configuration:build -- <папка выгрузки> --slug zup
 *
 * Модель сохраняется сжатой в public/configurations/<slug>-<версия>.json.gz
 * и добавляется (или заменяет прежнюю версию) в public/configurations/manifest.json.
 * Разбор — тот же код, что и в браузере (src/lib/metadata).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { buildModel, DUMP_FOLDERS, PREDEFINED_FOLDERS, PREDEFINED_PATH, type DumpFile } from "../src/lib/metadata/build-model";
import { summarize, type ConfigurationSummary } from "../src/lib/metadata/model";

const OUT_DIR = resolve(import.meta.dirname, "..", "public", "configurations");
const MANIFEST = join(OUT_DIR, "manifest.json");

function parseArgs() {
  const args = process.argv.slice(2);
  const slugIndex = args.indexOf("--slug");
  const slug = slugIndex >= 0 ? args[slugIndex + 1] : undefined;
  const dump = args.find((arg, i) => !arg.startsWith("--") && i !== slugIndex + 1);
  if (!dump || !slug || !/^[a-z0-9-]+$/.test(slug)) {
    console.error("Использование: npm run configuration:build -- <папка выгрузки> --slug <латиница-и-цифры>");
    process.exit(1);
  }
  return { dump: resolve(dump), slug };
}

async function main() {
  const { dump, slug } = parseArgs();
  const configurationPath = join(dump, "Configuration.xml");
  if (!existsSync(configurationPath)) {
    console.error(`В ${dump} нет Configuration.xml — укажите корневую папку выгрузки конфигурации в файлы`);
    process.exit(1);
  }

  let sourceBytes = statSync(configurationPath).size;
  let sourceFiles = 1;
  const files: DumpFile[] = [];
  for (const folder of DUMP_FOLDERS) {
    const dir = join(dump, folder);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (!name.endsWith(".xml") || !statSync(path).isFile()) continue;
      sourceBytes += statSync(path).size;
      sourceFiles++;
      const file: DumpFile = { folder, name, read: async () => readFileSync(path, "utf8") };
      const predefinedPath = join(dir, name.slice(0, -".xml".length), ...PREDEFINED_PATH);
      if (PREDEFINED_FOLDERS.includes(folder) && existsSync(predefinedPath)) {
        sourceBytes += statSync(predefinedPath).size;
        sourceFiles++;
        file.readPredefined = async () => readFileSync(predefinedPath, "utf8");
      }
      files.push(file);
    }
  }

  const started = performance.now();
  const { model, skipped } = await buildModel(
    { folder: "", name: "Configuration.xml", read: async () => readFileSync(configurationPath, "utf8") },
    files,
  );
  const parseSeconds = (performance.now() - started) / 1000;

  const version = model.version ?? "0";
  model.id = `builtin:${slug}@${version}`;
  const json = JSON.stringify(model);
  const file = `${slug}-${version}.json.gz`;
  const compressed = gzipSync(json, { level: 9 });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, file), compressed);

  const entry: ConfigurationSummary = {
    ...summarize(model, {
      modelBytes: Buffer.byteLength(json),
      sourceBytes,
      sourceFiles,
      parseSeconds,
    }),
    builtinFile: file,
    builtinBytes: compressed.length,
  };
  const manifest: ConfigurationSummary[] = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : [];
  const others = manifest.filter((item) => !item.id.startsWith(`builtin:${slug}@`));
  writeFileSync(MANIFEST, JSON.stringify([...others, entry], null, 2) + "\n");

  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1) + " МБ";
  console.log(`${model.synonym ?? model.name} ${version}: объектов ${model.objects.length}, пропущено файлов ${skipped.length}`);
  console.log(`XML ${mb(sourceBytes)} → модель ${mb(Buffer.byteLength(json))} → ${basename(file)} ${mb(compressed.length)}`);
  skipped.slice(0, 10).forEach((line) => console.log("  пропущен:", line));
}

void main();
