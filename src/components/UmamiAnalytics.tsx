import Script from "next/script";
import { connection } from "next/server";

/**
 * Счётчик Umami для своего сервера. Адрес Umami и идентификатор сайта берутся
 * из переменных окружения UMAMI_URL и UMAMI_WEBSITE_ID при запросе, а не при
 * сборке, — их задают в docker-compose.yml (или в Coolify) без пересборки образа.
 * Не задано — счётчика нет. UMAMI_DOMAINS — через запятую домены, с которых
 * считать посещения (запуски на localhost и копии сайта не попадут в статистику).
 *
 * Свои события — track() из src/lib/analytics.ts; тексты запросов не отправляются.
 */
export async function UmamiAnalytics() {
  await connection();
  const websiteId = process.env.UMAMI_WEBSITE_ID?.trim();
  const base = umamiUrl(process.env.UMAMI_URL);
  if (!base || !websiteId || !/^[0-9a-f-]{36}$/i.test(websiteId)) return null;
  const domains = process.env.UMAMI_DOMAINS?.trim();

  return (
    <Script
      id="umami"
      src={`${base}/script.js`}
      strategy="afterInteractive"
      data-website-id={websiteId}
      {...(domains ? { "data-domains": domains } : {})}
    />
  );
}

/** Адрес Umami без завершающей «/»; только http(s). */
function umamiUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}
