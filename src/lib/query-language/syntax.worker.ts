/**
 * Проверка синтаксиса в фоновом потоке: разбор ANTLR большого пакета занимает
 * заметное время, а редактор не должен подтормаживать при наборе.
 */

import { checkSyntax, type SyntaxError } from "./syntax-check";

export type SyntaxRequest = { id: number; text: string };
export type SyntaxResponse = { id: number; errors: SyntaxError[] };

self.onmessage = (event: MessageEvent<SyntaxRequest>) => {
  const { id, text } = event.data;
  let errors: SyntaxError[] = [];
  try {
    errors = checkSyntax(text);
  } catch (error) {
    // Сбой самого разборщика — не повод показывать пользователю ошибку в запросе.
    console.error("Проверка синтаксиса:", error);
  }
  self.postMessage({ id, errors } satisfies SyntaxResponse);
};
