/**
 * Свои события для Umami (src/components/UmamiAnalytics.tsx): какими функциями
 * пользуются. Без счётчика (не задан UMAMI_WEBSITE_ID, блокировщик рекламы) —
 * ничего не делает. Тексты запросов сюда не передавать.
 */

type Umami = { track: (event: string, data?: Record<string, string | number | boolean>) => void };

export function track(event: string, data?: Record<string, string | number | boolean>) {
  try {
    (window as { umami?: Umami }).umami?.track(event, data);
  } catch {
    // Аналитика не должна мешать работе редактора.
  }
}
