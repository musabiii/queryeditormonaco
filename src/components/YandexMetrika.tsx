import Script from "next/script";
import { connection } from "next/server";

/**
 * Счётчик Яндекс Метрики для своего сервера. Номер берётся из переменной
 * окружения YANDEX_METRIKA_ID при запросе, а не при сборке, — его задают
 * в docker-compose.yml без пересборки образа. Пусто — счётчика нет.
 *
 * Вебвизор выключен: он записывал бы набранные в редакторе тексты запросов.
 */
export async function YandexMetrika() {
  await connection();
  const id = process.env.YANDEX_METRIKA_ID?.trim();
  // Только цифры: номер подставляется в код скрипта.
  if (!id || !/^\d+$/.test(id)) return null;

  return (
    <>
      <Script id="yandex-metrika" strategy="afterInteractive">
        {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();
for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
ym(${id}, "init", { clickmap: true, trackLinks: true, accurateTrackBounce: true });`}
      </Script>
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- пиксель для браузеров без JS */}
          <img src={`https://mc.yandex.ru/watch/${id}`} style={{ position: "absolute", left: "-9999px" }} alt="" />
        </div>
      </noscript>
    </>
  );
}
