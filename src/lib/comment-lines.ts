import type { editor } from "monaco-editor";

/**
 * Комментирование строк как в конфигураторе 1С: «//» ставится в самое начало
 * каждой строки выделения (до отступа), раскомментирование снимает первые «//»
 * в строке, сохраняя отступ.
 */
export function commentLines(instance: editor.ICodeEditor) {
  applyToSelectedLines(instance, "comment", () => ({ column: 1, remove: 0, insert: "//" }));
}

export function uncommentLines(instance: editor.ICodeEditor) {
  applyToSelectedLines(instance, "uncomment", (line) => {
    const match = /^\s*\/\//.exec(line);
    return match ? { column: match[0].length - 1, remove: 2, insert: "" } : null;
  });
}

type LineEdit = { column: number; remove: number; insert: string } | null;

function applyToSelectedLines(
  instance: editor.ICodeEditor,
  source: string,
  editLine: (text: string) => LineEdit,
) {
  const model = instance.getModel();
  const selections = instance.getSelections();
  if (!model || !selections) return;

  const lines = new Set<number>();
  for (const selection of selections) {
    let last = selection.endLineNumber;
    // Выделение до начала следующей строки эту строку не захватывает.
    if (last > selection.startLineNumber && selection.endColumn === 1) last--;
    for (let line = selection.startLineNumber; line <= last; line++) lines.add(line);
  }

  const edits: editor.IIdentifiedSingleEditOperation[] = [];
  for (const lineNumber of lines) {
    const edit = editLine(model.getLineContent(lineNumber));
    if (!edit) continue;
    edits.push({
      range: {
        startLineNumber: lineNumber,
        startColumn: edit.column,
        endLineNumber: lineNumber,
        endColumn: edit.column + edit.remove,
      },
      text: edit.insert,
    });
  }
  if (edits.length === 0) return;

  instance.pushUndoStop();
  instance.executeEdits(source, edits);
  instance.pushUndoStop();
}
