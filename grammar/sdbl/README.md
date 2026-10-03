# Грамматика языка запросов 1С (SDBL)

`SDBLLexer.g4` и `SDBLParser.g4` — без изменений из
[1c-syntax/bsl-parser](https://github.com/1c-syntax/bsl-parser) (`src/main/antlr`),
коммит из файла `.source-sha`. Лицензия — LGPL-3.0-or-later, авторы указаны в заголовках файлов.

Из них ANTLR (`antlr-ng`) генерирует разборщик на TypeScript в
`src/lib/query-language/sdbl/generated` — он используется проверкой синтаксиса
(`src/lib/query-language/syntax-check.ts`) в фоновом потоке редактора.

Обновить грамматику: заменить `.g4` новыми версиями, записать коммит в `.source-sha` и выполнить

```bash
npm run grammar:build
```

Затем прогнать проверку по запросам из модулей выгрузки — ложных ошибок на полных
запросах типовых быть не должно:

```bash
npm run syntax:corpus -- <папка выгрузки>
```
