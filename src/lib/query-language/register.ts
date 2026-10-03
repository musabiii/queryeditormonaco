import type * as MonacoApi from "monaco-editor";
import { registerCompletion } from "./completion/provider";
import { formatQuery } from "./formatter";
import { groupBySuggestion } from "./group-by";
import { LANGUAGE_ID, languageConfiguration, monarchLanguage } from "./grammar";
import { linkedAliasRanges } from "./linked-aliases";
import { themes } from "./themes";

// Тип Monaco из @monaco-editor/react ссылается на путь, которого нет в monaco-editor 0.56+.
type Monaco = typeof MonacoApi;

// Провайдеры прошлой регистрации. Monaco живёт на странице дольше, чем модули
// при горячей перезагрузке, поэтому храним их глобально, а не в переменной модуля.
const REGISTRATION = Symbol.for("queryeditor.sdbl.registration");
type RegistrationStore = { [REGISTRATION]?: MonacoApi.IDisposable[] };

/** Каким может быть псевдоним во время связанной правки. */
const ALIAS_PATTERN = /[\p{L}_][\p{L}\p{N}_]*/u;

/**
 * Регистрирует язык запросов 1С, его провайдеры и темы в Monaco.
 * Повторный вызов заменяет провайдеры актуальными версиями.
 */
export function registerQueryLanguage(monaco: Monaco) {
  const store = globalThis as RegistrationStore;
  store[REGISTRATION]?.forEach((registration) => registration.dispose());

  if (!monaco.languages.getLanguages().some((lang) => lang.id === LANGUAGE_ID)) {
    monaco.languages.register({
      id: LANGUAGE_ID,
      aliases: ["Язык запросов 1С", "1C Query", "sdbl"],
      extensions: [".sdbl"],
    });
  }

  store[REGISTRATION] = [
    monaco.languages.setLanguageConfiguration(LANGUAGE_ID, languageConfiguration),
    monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, monarchLanguage),
    monaco.languages.registerDocumentFormattingEditProvider(LANGUAGE_ID, {
      provideDocumentFormattingEdits(model) {
        const text = model.getValue();
        const formatted = formatQuery(text);
        return formatted === text ? [] : [{ range: model.getFullModelRange(), text: formatted }];
      },
    }),
    ...registerCompletion(monaco, LANGUAGE_ID),
    // Правка псевдонима таблицы меняет его во всём запросе (опция редактора linkedEditing).
    monaco.languages.registerLinkedEditingRangeProvider(LANGUAGE_ID, {
      provideLinkedEditingRanges(model, position) {
        const ranges = linkedAliasRanges(model.getValue(), model.getOffsetAt(position));
        if (!ranges) return null;
        return {
          ranges: ranges.map(({ start, end }) => monaco.Range.fromPositions(model.getPositionAt(start), model.getPositionAt(end))),
          wordPattern: ALIAS_PATTERN,
        };
      },
    }),
    // Серым текстом — «СГРУППИРОВАТЬ ПО» с полями вне агрегатов; Tab вставляет.
    monaco.languages.registerInlineCompletionsProvider(LANGUAGE_ID, {
      provideInlineCompletions(model, position) {
        const suggestion = groupBySuggestion(model.getValue(), model.getOffsetAt(position), model.getEOL());
        if (!suggestion) return { items: [] };
        const from = model.getPositionAt(suggestion.from);
        const to = model.getPositionAt(suggestion.to);
        return {
          items: [
            {
              insertText: suggestion.text,
              range: { startLineNumber: from.lineNumber, startColumn: from.column, endLineNumber: to.lineNumber, endColumn: to.column },
            },
          ],
        };
      },
      disposeInlineCompletions() {},
    }),
  ];

  for (const [name, data] of Object.entries(themes)) {
    monaco.editor.defineTheme(name, data);
  }
}

// После горячей перезагрузки грамматики или форматтера этот модуль выполняется
// заново: подключаем новые версии к уже загруженному Monaco.
if (typeof window !== "undefined") {
  const loaded = (window as { monaco?: Monaco }).monaco;
  if (loaded) registerQueryLanguage(loaded);
}
