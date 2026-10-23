# Режимы загрузки подписки и CORS

Браузеры блокируют большинство междоменных `fetch()`-запросов к серверам подписок и не позволяют установить заголовок `User-Agent`. Поэтому в Sub Toolkit три режима загрузки.

## 1. Вставка / файл (всегда работает)

Вы вставляете текст подписки или загружаете файл. Данные никогда не покидают браузер. **Это рекомендуемый и самый приватный способ.**

## 2. Прямой fetch()

Страница выполняет `fetch(url)` напрямую. Работает только если сервер подписки отдаёт CORS-заголовок `Access-Control-Allow-Origin` (или `*`). В противном случае браузер блокирует ответ, и на экране появляется сообщение:

> CORS: браузер заблокировал прямой fetch. Используйте вставку/файл или настройте fetch-прокси.

Также нельзя задать `User-Agent`, поэтому 일부 серверы могут отдавать 403.

## 3. Через fetch-прокси (по желанию, выключен по умолчанию)

Вы указываете URL своего прокси-сервера, который делает запрос за вас и возвращает тело с CORS-заголовками. Прокси вызывается примерно так:

```
https://ваш-прокси.example.com/fetch?url=<кодированная-подписка>&ua=<опциональный-user-agent>
```

**⚠️ Внимание:** прокси увидит токен подписки (UUID, ключи и т.д.). Используйте только доверенный, свой прокси. Никогда не вводите URL чужих публичных прокси для приватных подписок.

## Самостоятельно размещённый прокси — Cloudflare Worker

Мини-шаблон (поддерживает `?url=` и `?ua=`):

```js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const target = url.searchParams.get('url')
    const ua = url.searchParams.get('ua') || 'Mozilla/5.0 (compatible; sub-toolkit/1.0)'
    if (!target) return new Response('missing ?url=', { status: 400 })

    try {
      const resp = await fetch(target, {
        headers: { 'User-Agent': ua },
      })
      const body = await resp.text()
      return new Response(body, {
        status: resp.status,
        headers: {
          'access-control-allow-origin': '*',
          'content-type': resp.headers.get('content-type') || 'text/plain',
        },
      })
    } catch (e) {
      return new Response('fetch error: ' + String(e), { status: 502 })
    }
  },
}
```

## Альтернатива: userscript (GM_xmlhttpRequest)

Вспомогательный вариант из проекта urlclash-converter (`fetch-helper-guide.md`): пользовательский скрипт для расширения браузера (Tampermonkey/Violentmonkey), который использует `GM_xmlhttpRequest` для обхода CORS. Не входит в поставку Sub Toolkit по соображениям безопасности (требует установки расширения пользователем). Документирован как опциональный «no-CORS» режим.

## Итог

| Режим | Работает всегда | Виден токен прокси | Нужен CORS на сервере |
|-------|----------------|--------------------|----------------------|
| Вставка / файл | да | нет | нет |
| Прямой fetch | только с CORS | нет | да |
| Свой прокси | да | **да** | нет (прокси делает запрос) |

Рекомендация: используйте вставку/файл. Если нужен URL — свой CORS-прокси (Worker выше). Never use untrusted public proxies for secret subscriptions.
