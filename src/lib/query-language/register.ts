import type * as MonacoApi from "monaco-editor";
import { LANGUAGE_ID, languageConfiguration, monarchLanguage } from "./grammar";
import { themes } from "./themes";

// Тип Monaco из @monaco-editor/react ссылается на путь, которого нет в monaco-editor 0.56+.
type Monaco = typeof MonacoApi;

/** Регистрирует язык запросов 1С и темы в экземпляре Monaco. Повторный вызов безопасен. */
export function registerQueryLanguage(monaco: Monaco) {
  if (monaco.languages.getLanguages().some((lang) => lang.id === LANGUAGE_ID)) {
    return;
  }

  monaco.languages.register({
    id: LANGUAGE_ID,
    aliases: ["Язык запросов 1С", "1C Query", "sdbl"],
    extensions: [".sdbl"],
  });
  monaco.languages.setLanguageConfiguration(LANGUAGE_ID, languageConfiguration);
  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, monarchLanguage);

  for (const [name, data] of Object.entries(themes)) {
    monaco.editor.defineTheme(name, data);
  }
}
