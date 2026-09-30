// Копирует готовую сборку Monaco (min/vs) в public/, чтобы редактор
// загружался с нашего же сервера, а не с CDN. Повторный запуск ничего
// не делает, пока версия monaco-editor не изменилась.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "node_modules", "monaco-editor");
const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

const targetDir = join(root, "public", "monaco");
const marker = join(targetDir, ".version");

if (existsSync(marker) && readFileSync(marker, "utf8").trim() === version) {
  process.exit(0);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
cpSync(join(pkgDir, "min", "vs"), join(targetDir, "vs"), { recursive: true });
writeFileSync(marker, version);

console.log(`monaco-editor ${version} скопирован в public/monaco`);
