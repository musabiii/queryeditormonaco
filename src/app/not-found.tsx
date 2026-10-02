import Link from "next/link";

/** 404 — в основном устаревшие ссылки «Поделиться» (хранятся 30 дней). */
export default function NotFound() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-3 bg-background px-4 text-center text-foreground">
      <h1 className="text-lg font-semibold">Запрос не найден</h1>
      <p className="max-w-md text-sm text-muted">
        Ссылка неверная или устарела: запросы, которыми поделились, хранятся 30 дней.
      </p>
      <Link href="/" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-border/60">
        Открыть редактор
      </Link>
    </main>
  );
}
