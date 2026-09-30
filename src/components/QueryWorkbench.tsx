"use client";

import { useEffect, useRef, useState } from "react";
import { setCompletionMetadata, type BatchQuery } from "@/lib/query-language";
import { loadConfiguration } from "@/lib/metadata/store";
import { SAMPLE_QUERY } from "@/lib/sample-query";
import { useConfigurations } from "@/lib/metadata/use-configurations";
import { useColorScheme } from "@/lib/use-theme";
import { QueryEditor, type EditorStatus, type QueryEditorHandle } from "./QueryEditor";
import { QueryStructure } from "./QueryStructure";
import { QueryToolbar } from "./QueryToolbar";
import { AiPanel } from "./ai/AiPanel";
import { ConfigurationsDialog } from "./metadata/ConfigurationsDialog";

export function QueryWorkbench() {
  const [scheme, setScheme] = useColorScheme();
  const [status, setStatus] = useState<EditorStatus | null>(null);
  const [queries, setQueries] = useState<BatchQuery[]>([]);
  const [showWhitespace, setShowWhitespace] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [configurationsOpen, setConfigurationsOpen] = useState(false);
  const configurations = useConfigurations();
  const activeConfiguration = configurations.active;
  const activeId = activeConfiguration?.id ?? null;

  // Автодополнение работает по активной конфигурации: модель читается из IndexedDB.
  useEffect(() => {
    if (!activeId) {
      setCompletionMetadata(null);
      return;
    }
    let current = true;
    loadConfiguration(activeId).then(
      (model) => current && setCompletionMetadata(model ?? null),
      () => current && setCompletionMetadata(null),
    );
    return () => {
      current = false;
    };
  }, [activeId]);
  const editorRef = useRef<QueryEditorHandle>(null);

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <QueryToolbar
        onComment={() => editorRef.current?.commentLines()}
        onUncomment={() => editorRef.current?.uncommentLines()}
        onFormat={() => editorRef.current?.format()}
        getText={() => editorRef.current?.getText() ?? ""}
        showWhitespace={showWhitespace}
        onToggleWhitespace={() => setShowWhitespace((value) => !value)}
        aiOpen={aiOpen}
        onToggleAi={() => setAiOpen((value) => !value)}
        onOpenConfigurations={() => setConfigurationsOpen(true)}
        scheme={scheme}
        onSchemeChange={setScheme}
      />

      <main className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <QueryEditor
            ref={editorRef}
            defaultValue={SAMPLE_QUERY}
            theme={scheme.id}
            onStatusChange={setStatus}
            onBatchChange={setQueries}
            showWhitespace={showWhitespace}
          />
        </div>
        <QueryStructure
          queries={queries}
          cursorOffset={status?.offset}
          onSelect={(query) => editorRef.current?.selectRange(query.start, query.end)}
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
            ? `Конфигурация: ${activeConfiguration.synonym ?? activeConfiguration.name}${activeConfiguration.version ? " " + activeConfiguration.version : ""}`
            : "Конфигурация не загружена"}
        </button>
        <span>Язык запросов 1С</span>
      </footer>

      {configurationsOpen && (
        <ConfigurationsDialog configurations={configurations} onClose={() => setConfigurationsOpen(false)} />
      )}
    </div>
  );
}
