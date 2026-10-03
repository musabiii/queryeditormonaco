/**
 * Заготовка по набранному пути к таблице (new-query.ts): в пустом блоке — весь
 * запрос, в запросе с ИЗ — соединение с этой таблицей. Серым показывается на своём
 * месте; Tab — вставить, курсор встаёт после «Псевдоним.» и сразу открывается
 * список реквизитов; Esc, набор текста или перемещение курсора — убрать.
 */

import type * as MonacoApi from "monaco-editor";
import type { editor } from "monaco-editor";
import { completionMetadata, newQueryProposal, type NewQueryProposal } from "@/lib/query-language";

type Monaco = typeof MonacoApi;

const CONTEXT_KEY = "queryeditor.newQueryPreview";

export function createNewQueryPreview(instance: editor.IStandaloneCodeEditor, monaco: Monaco) {
  const shown = instance.createContextKey<boolean>(CONTEXT_KEY, false);
  let pending: { proposal: NewQueryProposal; offset: number; versionId: number } | null = null;
  let zoneIds: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const dismiss = () => {
    clearTimeout(timer);
    if (!pending) return;
    pending = null;
    shown.set(false);
    const ids = zoneIds;
    zoneIds = [];
    instance.changeViewZones((accessor) => ids.forEach((id) => accessor.removeZone(id)));
  };

  const accept = () => {
    const current = pending;
    const model = instance.getModel();
    dismiss();
    if (!current || !model || model.getVersionId() !== current.versionId) return;
    const { proposal } = current;
    const edits = proposal.edits.map((edit) => ({
      range: monaco.Range.fromPositions(model.getPositionAt(edit.from), model.getPositionAt(edit.to)),
      text: edit.text,
    }));
    instance.pushUndoStop();
    instance.executeEdits("new-query", edits, () => [monaco.Selection.fromPositions(model.getPositionAt(proposal.cursor))]);
    instance.pushUndoStop();
    // Курсор после «Псевдоним.» — сразу список реквизитов.
    setTimeout(() => instance.trigger("new-query", "editor.action.triggerSuggest", {}));
  };

  const zone = (afterLineNumber: number, lines: string[], hint?: string) => {
    const model = instance.getModel()!;
    const font = instance.getOption(monaco.editor.EditorOption.fontInfo);
    const node = document.createElement("div");
    node.className = "group-by-preview";
    node.style.fontFamily = font.fontFamily;
    node.style.fontSize = `${font.fontSize}px`;
    node.style.lineHeight = `${font.lineHeight}px`;
    node.style.tabSize = String(model.getOptions().tabSize);
    lines.forEach((text, i) => {
      const row = document.createElement("div");
      row.textContent = text;
      if (i === 0 && hint) {
        const label = document.createElement("span");
        label.className = "group-by-preview-hint";
        label.textContent = hint;
        row.append(label);
      }
      node.append(row);
    });
    instance.changeViewZones((accessor) => {
      zoneIds.push(accessor.addZone({ afterLineNumber, heightInLines: lines.length, domNode: node }));
    });
  };

  const show = () => {
    const model = instance.getModel();
    const position = instance.getPosition();
    const index = completionMetadata();
    if (!model || !position || !instance.getSelection()?.isEmpty()) return;
    const offset = model.getOffsetAt(position);
    const proposal = newQueryProposal(model.getValue(), offset, index, model.getEOL());
    if (!proposal) return;

    pending = { proposal, offset, versionId: model.getVersionId() };
    shown.set(true);
    // Путь набран полностью — список объектов больше не нужен, Tab достаётся заготовке.
    instance.trigger("new-query", "hideSuggestWidget", {});
    // Заготовка на своём месте; подсказка про Tab — у курсора.
    let hintShown = false;
    for (const block of proposal.preview) {
      const line = model.getPositionAt(block.offset).lineNumber;
      const atCursor = line === position.lineNumber;
      zone(line, block.lines, atCursor && !hintShown ? proposal.hint : undefined);
      hintShown ||= atCursor;
    }
    if (!hintShown) zone(position.lineNumber, [""], proposal.hint);
  };

  /** Проверить после паузы в наборе: не мигать на каждой букве. */
  const schedule = () => {
    dismiss();
    timer = setTimeout(show, 200);
  };

  // Пока открыт список подсказок, Tab выбирает из него.
  instance.addCommand(monaco.KeyCode.Tab, accept, `${CONTEXT_KEY} && !suggestWidgetVisible`);
  instance.addCommand(monaco.KeyCode.Escape, dismiss, `${CONTEXT_KEY} && !suggestWidgetVisible`);
  instance.onDidChangeModelContent(schedule);
  // Курсор ушёл с конца пути — заготовка больше не к месту.
  instance.onDidChangeCursorPosition((event) => {
    const model = instance.getModel();
    if (pending && model && model.getOffsetAt(event.position) !== pending.offset) dismiss();
  });
  instance.onDidDispose(dismiss);

  return { dismiss };
}
