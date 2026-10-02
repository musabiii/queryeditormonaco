import type { Metadata } from "next";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { YandexMetrika } from "@/components/YandexMetrika";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Редактор запросов 1С",
  description: "Редактор текста запросов 1С:Предприятия на Monaco",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="h-full">
        {children}
        {/*
          Посещения и просмотры страниц в Vercel Analytics — только при сборке на Vercel
          (там задана VERCEL=1): на другом хостинге скрипта /_vercel/insights нет.
        */}
        {process.env.VERCEL && <Analytics />}
        {/* На своём сервере — Яндекс Метрика, номер счётчика в YANDEX_METRIKA_ID. */}
        <Suspense fallback={null}>
          <YandexMetrika />
        </Suspense>
      </body>
    </html>
  );
}
