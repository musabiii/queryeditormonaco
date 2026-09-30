"use client";

import { useRef, useState } from "react";
import type { BatchQuery } from "@/lib/query-language";
import { SAMPLE_QUERY } from "@/lib/sample-query";
import { useTheme } from "@/lib/use-theme";
import { QueryEditor, type EditorStatus, type QueryEditorHandle } from "./QueryEditor";
import { QueryStructure } from "./QueryStructure";
import { QueryToolbar } from "./QueryToolbar";

export function QueryWorkbench() {
  const [theme, setTheme] = useTheme();
  const [status, setStatus] = useState<EditorStatus | null>(null);
  const [queries, setQueries] = useState<BatchQuery[]>([]);
  const [showWhitespace, setShowWhitespace] = useState(false);
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
        theme={theme}
        onThemeChange={setTheme}
      />

      <main className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <QueryEditor
            ref={editorRef}
            defaultValue={SAMPLE_QUERY}
            theme={theme}
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
        <span className="ml-auto">Язык запросов 1С</span>
      </footer>
    </div>
  );
}
