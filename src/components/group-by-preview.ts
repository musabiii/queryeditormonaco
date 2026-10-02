/**
 * Заготовка «СГРУППИРОВАТЬ ПО» на её будущем месте, не трогая курсор: после
 * применения агрегатной функции к полю в конце запроса серым показывается
 * раздел с полями вне агрегатов. Tab — вставить; Esc, набор текста или
 * перемещение курсора — убрать. Если место вставки не видно, рядом с курсором —
 * напоминание. Серая подсказка Monaco так не умеет: она бывает только у курсора.
 */

import type * as MonacoApi from "monaco-editor";
import type { editor } from "monaco-editor";
import { groupByProposal, type GroupByProposal } from "@/lib/query-language";

type Monaco = typeof MonacoApi;

const CONTEXT_KEY = "queryeditor.groupByPreview";

export function createGroupByPreview(instance: editor.IStandaloneCodeEditor, monaco: Monaco) {
  const shown = instance.createContextKey<boolean>(CONTEXT_KEY, false);
  let pending: GroupByProposal | null = null;
  let zoneId: string | null = null;
  let widget: editor.IContentWidget | null = null;

  const dismiss = () => {
    if (!pending) return;
    pending = null;
    shown.set(false);
    if (zoneId) {
      const id = zoneId;
      instance.changeViewZones((accessor) => accessor.removeZone(id));
      zoneId = null;
    }
    if (widget) {
      instance.removeContentWidget(widget);
      widget = null;
    }
  };

  const accept = () => {
    const proposal = pending;
    const model = instance.getModel();
    dismiss();
    if (!proposal || !model) return;
    const at = model.getPositionAt(proposal.offset);
    instance.pushUndoStop();
    instance.executeEdits("group-by", [
      { range: new monaco.Range(at.lineNumber, at.column, at.lineNumber, at.column), text: proposal.text },
    ]);
    instance.pushUndoStop();
  };

  // Клавиши действуют, только пока заготовка на экране.
  instance.addCommand(monaco.KeyCode.Tab, accept, CONTEXT_KEY);
  instance.addCommand(monaco.KeyCode.Escape, dismiss, CONTEXT_KEY);
  instance.onDidChangeModelContent(dismiss);
  instance.onDidChangeCursorPosition(dismiss);
  instance.onDidDispose(dismiss);

  /** Показать заготовку, если запросу под курсором нужна группировка. */
  const offer = () => {
    dismiss();
    const model = instance.getModel();
    const position = instance.getPosition();
    if (!model || !position) return;
    const eol = model.getEOL();
    const proposal = groupByProposal(model.getValue(), model.getOffsetAt(position), eol);
    if (!proposal) return;

    pending = proposal;
    shown.set(true);
    const line = model.getPositionAt(proposal.offset).lineNumber;
    const lines = proposal.text.split(eol).slice(1);
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
      if (i === 0) row.append(hintNode("Tab — вставить, Esc — отклонить"));
      node.append(row);
    });
    instance.changeViewZones((accessor) => {
      zoneId = accessor.addZone({ afterLineNumber: line, heightInLines: lines.length, domNode: node });
    });

    // Место вставки за пределами экрана — напоминание у курсора.
    const [visible] = instance.getVisibleRanges();
    if (visible && (line < visible.startLineNumber || line >= visible.endLineNumber)) {
      const reminder = hintNode("Tab — добавить СГРУППИРОВАТЬ ПО, Esc — нет");
      reminder.classList.add("group-by-reminder");
      widget = {
        getId: () => "queryeditor.groupByReminder",
        getDomNode: () => reminder,
        getPosition: () => ({ position, preference: [monaco.editor.ContentWidgetPositionPreference.BELOW] }),
      };
      instance.addContentWidget(widget);
    }
  };

  return { offer, dismiss };
}

function hintNode(text: string) {
  const hint = document.createElement("span");
  hint.className = "group-by-preview-hint";
  hint.textContent = text;
  return hint;
}
