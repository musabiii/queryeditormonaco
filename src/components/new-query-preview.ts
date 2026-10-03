/**
 * Заготовка запроса по таблице (new-query.ts): в пустом блоке набран путь
 * «Справочник.МедицинскиеКарты» — под строкой серым показывается готовый
 * запрос. Tab — вставить, курсор встаёт после «МедицинскиеКарты.» и сразу
 * открывается список реквизитов; Esc, набор текста или перемещение курсора — убрать.
 */

import type * as MonacoApi from "monaco-editor";
import type { editor } from "monaco-editor";
import { completionMetadata, newQueryProposal, type NewQueryProposal } from "@/lib/query-language";

type Monaco = typeof MonacoApi;

const CONTEXT_KEY = "queryeditor.newQueryPreview";

export function createNewQueryPreview(instance: editor.IStandaloneCodeEditor, monaco: Monaco) {
  const shown = instance.createContextKey<boolean>(CONTEXT_KEY, false);
  let pending: { proposal: NewQueryProposal; versionId: number } | null = null;
  let zoneId: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const dismiss = () => {
    clearTimeout(timer);
    if (!pending) return;
    pending = null;
    shown.set(false);
    if (zoneId) {
      const id = zoneId;
      instance.changeViewZones((accessor) => accessor.removeZone(id));
      zoneId = null;
    }
  };

  const accept = () => {
    const current = pending;
    const model = instance.getModel();
    dismiss();
    if (!current || !model || model.getVersionId() !== current.versionId) return;
    const { proposal } = current;
    const from = model.getPositionAt(proposal.from);
    const to = model.getPositionAt(proposal.to);
    instance.pushUndoStop();
    instance.executeEdits("new-query", [{ range: monaco.Range.fromPositions(from, to), text: proposal.text }], () => {
      const cursor = model.getPositionAt(proposal.from + proposal.cursor);
      return [monaco.Selection.fromPositions(cursor)];
    });
    instance.pushUndoStop();
    // Курсор после «Псевдоним.» — сразу список реквизитов.
    setTimeout(() => instance.trigger("new-query", "editor.action.triggerSuggest", {}));
  };

  const show = () => {
    const model = instance.getModel();
    const position = instance.getPosition();
    const index = completionMetadata();
    if (!model || !position || !index || !instance.getSelection()?.isEmpty()) return;
    const eol = model.getEOL();
    const proposal = newQueryProposal(model.getValue(), model.getOffsetAt(position), index, eol);
    if (!proposal) return;

    pending = { proposal, versionId: model.getVersionId() };
    shown.set(true);
    // Путь набран полностью — список объектов больше не нужен, Tab достаётся заготовке.
    instance.trigger("new-query", "hideSuggestWidget", {});
    // Весь будущий запрос — от строки, где он начинается.
    const startLine = model.getPositionAt(proposal.from).lineNumber;
    const before = model.getValueInRange(new monaco.Range(startLine, 1, startLine, model.getPositionAt(proposal.from).column));
    const lines = (before + proposal.text).split(eol);
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
      if (i === 0) {
        const hint = document.createElement("span");
        hint.className = "group-by-preview-hint";
        hint.textContent = "Tab — оформить запрос, Esc — нет";
        row.append(hint);
      }
      node.append(row);
    });
    instance.changeViewZones((accessor) => {
      zoneId = accessor.addZone({ afterLineNumber: position.lineNumber, heightInLines: lines.length, domNode: node });
    });
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
    if (pending && model && model.getOffsetAt(event.position) !== pending.proposal.to) dismiss();
  });
  instance.onDidDispose(dismiss);

  return { dismiss };
}
