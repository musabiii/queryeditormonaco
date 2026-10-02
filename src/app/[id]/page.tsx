import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QueryWorkbench } from "@/components/QueryWorkbench";
import { loadShare } from "@/lib/share/store";

export const metadata: Metadata = {
  title: "Запрос по ссылке — Редактор запросов 1С",
  // Чужие запросы в поисковики не попадают.
  robots: { index: false, follow: false },
};

/** Запрос, которым поделились кнопкой «Поделиться»: /<id>, хранится 30 дней. */
export default async function SharedQueryPage(props: PageProps<"/[id]">) {
  const { id } = await props.params;
  const shared = await loadShare(id);
  if (!shared) notFound();
  return <QueryWorkbench initialQuery={shared.text} sharedUntil={shared.expiresAt} />;
}
