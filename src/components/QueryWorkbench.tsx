"use client";

import { useEffect, useRef, useState } from "react";
import { bslQueryCode, setCompletionMetadata, type BatchQuery, type QueryParameter } from "@/lib/query-language";
import { loadModel } from "@/lib/metadata/builtin";
import { SAMPLE_QUERY } from "@/lib/sample-query";
import { useConfigurations } from "@/lib/metadata/use-configurations";
import { useColorScheme } from "@/lib/use-theme";
import { QueryEditor, type EditorStatus, type QueryEditorHandle } from "./QueryEditor";
import { QueryStructure } from "./QueryStructure";
import { QueryToolbar } from "./QueryToolbar";
import { AiPanel } from "./ai/AiPanel";
import { BslCodeDialog } from "./BslCodeDialog";
import { ConfigurationTree } from "./metadata/ConfigurationTree";
import { ConfigurationsDialog } from "./metadata/ConfigurationsDialog";
import type { ConfigurationModel } from "@/lib/metadata/model";

export function QueryWorkbench() {
  const [scheme, setScheme] = useColorScheme();
  const [status, setStatus] = useState<EditorStatus | null>(null);
  const [queries, setQueries] = useState<BatchQuery[]>([]);
  const [parameters, setParameters] = useState<QueryParameter[]>([]);
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [configurationsOpen, setConfigurationsOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  /** Код 1С для окна «Текст для кода 1С»; null — окно закрыто. */
  const [bslCode, setBslCode] = useState<string | null>(null);
  const configurations = useConfigurations();
  const activeConfiguration = configurations.active;
  const activeId = activeConfiguration?.id ?? null;
  /** Модель какой конфигурации загружена (null — не удалось загрузить). */
  const [modelState, setModelState] = useState<{ id: string; model: ConfigurationModel | null } | null>(null);

  // Автодополнение работает по активной конфигурации: модель берётся из IndexedDB,
  // встроенная типовая при первом выборе скачивается с сервера.
  useEffect(() => {
    if (!activeConfiguration) {
      setCompletionMetadata(null);
      return;
    }
    let current = true;
    const { id } = activeConfiguration;
    loadModel(activeConfiguration).then(
      (model) => {
        if (!current) return;
        setCompletionMetadata(model ?? null);
        setModelState({ id, model: model ?? null });
      },
      () => {
        if (!current) return;
        setCompletionMetadata(null);
        setModelState({ id, model: null });
      },
    );
    return () => {
      current = false;
    };
  }, [activeConfiguration]);
  const modelLoading = Boolean(activeId) && modelState?.id !== activeId;
  const activeModel = activeId && modelState?.id === activeId ? modelState.model : null;
  const modelNote = modelLoading ? " (загрузка…)" : activeId && !activeModel ? " (не удалось загрузить)" : "";
  const editorRef = useRef<QueryEditorHandle>(null);

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <QueryToolbar
        onComment={() => editorRef.current?.commentLines()}
        onUncomment={() => editorRef.current?.uncommentLines()}
        onFormat={() => editorRef.current?.format()}
        onUnwrap={() => editorRef.current?.unwrapCodeString() ?? false}
        onShowBslCode={() => {
          const editor = editorRef.current;
          if (editor) setBslCode(bslQueryCode(editor.getSelectedText() || editor.getText()));
        }}
        getText={() => editorRef.current?.getText() ?? ""}
        showWhitespace={showWhitespace}
        onToggleWhitespace={() => setShowWhitespace((value) => !value)}
        aiOpen={aiOpen}
        onToggleAi={() => setAiOpen((value) => !value)}
        onOpenConfigurations={() => setConfigurationsOpen(true)}
        treeOpen={treeOpen}
        onToggleTree={() => setTreeOpen((value) => !value)}
        scheme={scheme}
        onSchemeChange={setScheme}
      />

      <main className="flex min-h-0 flex-1">
        <ConfigurationTree
          open={treeOpen}
          model={activeModel}
          loading={modelLoading}
          onInsert={(text) => editorRef.current?.insertText(text)}
          onOpenConfigurations={() => setConfigurationsOpen(true)}
          onClose={() => setTreeOpen(false)}
        />
        <div className="min-w-0 flex-1">
          <QueryEditor
            ref={editorRef}
            defaultValue={SAMPLE_QUERY}
            theme={scheme.id}
            onStatusChange={setStatus}
            onBatchChange={setQueries}
            onParametersChange={setParameters}
            showWhitespace={showWhitespace}
          />
        </div>
        <QueryStructure
          queries={queries}
          cursorOffset={status?.offset}
          onSelect={(query) => editorRef.current?.selectRange(query.start, query.end)}
          parameters={parameters}
          onSelectRange={(start, end) => editorRef.current?.selectRange(start, end)}
          onInsertSnippet={(snippet) => editorRef.current?.insertSnippet(snippet)}
        />
        <AiPanel
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          getContext={() => ({
            query: editorRef.current?.getText() ?? "",
            selection: editorRef.current?.getSelectedText() ?? "",
          })}
          onInsert={(text) => editorRef.current?.insertText(text)}
          onReplaceAll={(text) => editorRef.current?.replaceAll(text)}
        />
      </main>

      <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-border bg-panel px-4 text-xs text-muted">
        {status && (
          <>
            <span>
              Стр {status.line}, стлб {status.column}
            </span>
            {status.selected > 0 && <span>Выделено: {status.selected}</span>}
            <span>Строк: {status.lineCount}</span>
          </>
        )}
        <button
          type="button"
          onClick={() => setConfigurationsOpen(true)}
          title="Конфигурации"
          className="ml-auto truncate hover:text-foreground"
        >
          {activeConfiguration
            ? `Конфигурация: ${activeConfiguration.synonym ?? activeConfiguration.name}${activeConfiguration.version ? " " + activeConfiguration.version : ""}${modelNote}`
            : "Конфигурация не загружена"}
        </button>
        <span>Язык запросов 1С</span>
      </footer>

      {bslCode !== null && <BslCodeDialog code={bslCode} onClose={() => setBslCode(null)} />}

      {configurationsOpen && (
        <ConfigurationsDialog configurations={configurations} onClose={() => setConfigurationsOpen(false)} />
      )}
    </div>
  );
}
