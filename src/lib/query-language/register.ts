import type * as MonacoApi from "monaco-editor";
import { registerCompletion } from "./completion/provider";
import { formatQuery } from "./formatter";
import { LANGUAGE_ID, languageConfiguration, monarchLanguage } from "./grammar";
import { themes } from "./themes";

// Тип Monaco из @monaco-editor/react ссылается на путь, которого нет в monaco-editor 0.56+.
type Monaco = typeof MonacoApi;

// Провайдеры прошлой регистрации. Monaco живёт на странице дольше, чем модули
// при горячей перезагрузке, поэтому храним их глобально, а не в переменной модуля.
const REGISTRATION = Symbol.for("queryeditor.sdbl.registration");
type RegistrationStore = { [REGISTRATION]?: MonacoApi.IDisposable[] };

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
