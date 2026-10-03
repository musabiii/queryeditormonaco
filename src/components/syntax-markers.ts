/**
 * Проверка синтаксиса во время ввода: после паузы в наборе текст уходит в
 * фоновый поток (syntax.worker.ts), ошибки показываются красным подчёркиванием
 * с текстом при наведении. Пока набирается строка, её подчёркивание снимается —
 * недописанное не краснеет; после паузы проверка возвращает его, если ошибка осталась.
 * Текст ошибки виден и в конце строки — красным, как комментарий (в сам текст не попадает).
 */

import type * as MonacoApi from "monaco-editor";
import type { editor } from "monaco-editor";
import type { SyntaxRequest, SyntaxResponse } from "@/lib/query-language/syntax.worker";
import { SYNTAX_MARKER_OWNER } from "@/lib/query-language/syntax-owner";

type Monaco = typeof MonacoApi;

/** Пауза в наборе перед проверкой. */
const DELAY_MS = 600;

export function createSyntaxChecker(
  instance: editor.IStandaloneCodeEditor,
  monaco: Monaco,
  onErrors: (count: number) => void,
) {
  let enabled = false;
  let worker: Worker | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let requestId = 0;
  /** Версия модели, для которой отправлен последний запрос. */
  let pendingVersion = -1;

  const inline = instance.createDecorationsCollection();
  // Текст ошибки в конце строки — псевдоэлементом ::after последнего символа: у каждого
  // сообщения своё правило. (Вставка текста декорацией «after» в этой сборке Monaco не отображается.)
  const styles = document.createElement("style");
  document.head.append(styles);
  const editorClass = `syntax-error-${instance.getId().replace(/\W/g, "")}`;

  const setMarkers = (markers: editor.IMarkerData[]) => {
    const model = instance.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(model, SYNTAX_MARKER_OWNER, markers);
    onErrors(markers.length);
    // «// текст ошибки» после конца строки; несколько ошибок в строке — через «;».
    const byLine = new Map<number, string[]>();
    for (const marker of markers) byLine.set(marker.startLineNumber, [...(byLine.get(marker.startLineNumber) ?? []), marker.message]);
    const rules: string[] = [];
    inline.set(
      [...byLine].map(([line, messages], i) => {
        const className = `${editorClass}-${i}`;
        rules.push(`.${className}::after { content: ${cssString(`    // ${messages.join("; ")}`)}; }`);
        const end = model.getLineMaxColumn(line);
        return {
          range: new monaco.Range(line, Math.max(1, end - 1), line, end),
          options: { afterContentClassName: `syntax-error-inline ${className}`, showIfCollapsed: true },
        };
      }),
    );
    styles.textContent = rules.join("\n");
  };

  const run = () => {
    const model = instance.getModel();
    if (!enabled || !model) return;
    if (!worker) {
      worker = new Worker(new URL("../lib/query-language/syntax.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<SyntaxResponse>) => {
        const current = instance.getModel();
        // Ответ на устаревший текст не нужен: следующий уже в пути.
        if (!enabled || !current || event.data.id !== requestId || current.getVersionId() !== pendingVersion) return;
        setMarkers(
          event.data.errors.map((error) => {
            const start = current.getPositionAt(error.start);
            const end = current.getPositionAt(error.end);
            return {
              severity: monaco.MarkerSeverity.Error,
              message: error.message,
              source: "Синтаксис",
              startLineNumber: start.lineNumber,
              startColumn: start.column,
              endLineNumber: end.lineNumber,
              endColumn: end.column,
            };
          }),
        );
      };
    }
    pendingVersion = model.getVersionId();
    worker.postMessage({ id: ++requestId, text: model.getValue() } satisfies SyntaxRequest);
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(run, DELAY_MS);
  };

  instance.onDidChangeModelContent(() => {
    if (!enabled) return;
    const model = instance.getModel();
    const position = instance.getPosition();
    if (model && position) {
      // Строку, которую сейчас набирают, не подчёркиваем до паузы.
      const markers = monaco.editor.getModelMarkers({ owner: SYNTAX_MARKER_OWNER, resource: model.uri });
      const rest = markers.filter((marker) => marker.startLineNumber > position.lineNumber || marker.endLineNumber < position.lineNumber);
      if (rest.length !== markers.length) setMarkers(rest);
    }
    schedule();
  });
  instance.onDidDispose(() => {
    clearTimeout(timer);
    worker?.terminate();
    styles.remove();
  });

  return {
    setEnabled(value: boolean) {
      enabled = value;
      clearTimeout(timer);
      if (value) run();
      else {
        requestId++;
        setMarkers([]);
      }
    },
  };
}

/** Строка для свойства content в CSS. */
function cssString(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`;
}
