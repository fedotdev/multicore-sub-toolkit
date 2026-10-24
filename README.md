# Sub Toolkit

Статичный клиентский инструмент для работы с прокси-подписками. Декодирует подписки, извлекает share-ссылки, правит DNS и списки «Zapret → Direct», конвертирует в **Happ JSON**, **Clash/Mihomo YAML** и **v2rayNG/Xray JSON**. Всё работает в браузере — никакого бэкенда, аналитики, шрифтов или CDN в рантайме.

UI на русском (есть английские ключи).

## Живая идея

Одна страница, два таба:
- **Ввод** — вставка текста, загрузка файла или URL (три режима загрузки), декодирование подписки.
- **Экспорт** — узлы (поиск/выделение, копирование ссылок, скачивание `.txt`), DNS (пресеты, серверы, hosts, предупреждения), маршрутизация/Zapret (режим, списки, пресеты, правила), экспорт (Happ JSON, Clash/Mihomo YAML, v2rayNG/Xray JSON с валидацией, копированием и скачиванием).

## Стек

- Vite + TypeScript + Preact (маленький бандл, без рантайм-сетевых вызовов, кроме пользовательских fetch)
- js-yaml (бандлится), Vitest + jsdom
- GitHub Pages через GitHub Actions

## Быстрый старт

```bash
npm ci            # установить зависимости (требуется package-lock.json)
npm run dev       # dev-сервер на http://localhost:5173
npm run test      # Vitest
npm run build     # TypeScript + Vite сборка в dist/
npm run preview   # предварительный просмотр собранной сборки
```

Сборка по умолчанию использует `base: "/"`. Для GitHub Pages project page (`<user>.github.io/<repo>/`) Actions задаёт `VITE_BASE: /<repo>/` автоматически.

## Деплой на GitHub Pages

Workflow `.github/workflows/pages.yml`:

1. `actions/checkout@v4`
2. `actions/setup-node@v4` (node 26, кэш npm)
3. `npm ci`
4. `npm test`
5. `npm run build` с `VITE_BASE: /<repo>/`
6. `actions/configure-pages@v5`
7. `actions/upload-pages-artifact@v3` (path: `dist`)
8. `actions/deploy-pages@v4`

Права: `contents: read`, `pages: write`, `id-token: write`.

В репозитории должен быть `.nojekyll` (есть) и GitHub Pages должен быть включён в настройках репозитория (источник: GitHub Actions).

## Конфиденциальность (модель безопасности)

- Подписки и конфиги содержат секреты: UUID, public keys (pbk), short IDs (sid), пароли, obfs-password.
- Ничего не логируется и не уходит с вашего устройства, кроме URL, который **вы явно указали** для загрузки.
- Обработка — полностью локальная в браузере.
- Переключатель **Redact** маскирует `uuid/pbk/sid/пароли` во всех выводах, чтобы безопасно делиться скриншотами и конфигами.
- State хранится в памяти. `localStorage` используется только для несекретных настроек: тема, язык, DNS-пресеты, списки доменов. Кнопка «Clear all» стирает их.
- Strict CSP meta (`script-src 'self'`, `form-action 'self'`, `frame-ancestors 'none'` и т.д.).

## Режимы загрузки подписки и CORS

Браузеры блокируют большинство междоменных fetch-запросов к подпискам и не permiten задать `User-Agent`. Поэтому три режима:

1. **Вставка / файл** — всегда работает. Рекомендуемый, самый приватный способ.
2. **Прямой `fetch()`** — работает только если целевой сервер отправляет CORS-заголовки (`Access-Control-Allow-Origin`). При ошибке показывается понятное сообщение.
3. **Через fetch-прокси** — вы указываете свой прокси-URL (`?url=` и `?ua=`). **Внимание:** прокси увидит токен подписки. Используйте только доверенный прокси. Режим выключен по умолчанию.

### Самостоятельно размещённый прокси (Cloudflare Worker)

Мини-шаблон Worker, который вы можете разместить у себя (поддерживает `?url=` и `?ua=`):

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

Подробнее: `docs/cors.md` (режимы, patroн userscript `GM_xmlhttpRequest`, ограничения).

## Поддерживаемые форматы

**Ввод:** base64-подписки (standard/url-safe, авто-padding, игнор пробелов), списки share-ссылок, Clash/Mihomo YAML (`proxies:`), Xray/Happ JSON (один объект или массив с `remarks`), sing-box JSON (outbounds). Ссылки Happ `happ://crypto…` определяются как зашифрованные и показываются с предупреждением.

**Share-ссылки:** `vless://`, `vmess://` (base64 JSON), `trojan://`, `ss://` (SIP002 + legacy), `hysteria2://`/`hy2://`, `tuic://`. Неизвестные параметры сохраняются в `node.extra` / `node.unmapped` с предупреждением — ничего не выпадает молча.

**Вывод:**
- Happ JSON — массив полных Xray-конфигов (по одному на узел) с `remarks`, inbounds socks 10808 / http 10809, outbounds, dns, routing.
- Clash/Mihomo YAML — proxies, proxy-groups (включая переключаемый «🧩 Zapret»), rule-providers, rules, tun/dns/sniffer.
- v2rayNG/Xray JSON — один файл на узел + all-in-one с observatory, `routing.balancers` (leastPing, fallbackTag) и опциональным pinning селектора.

## Совместимость (предупреждения)

Показываются в интерфейсе на шаге маршрутизации и экспорта:
- Mihomo + Reality может дать «REALITY authentication failed» на Xray-core ≥ 26.7.11 (minClientVer). Happ/v2rayNG (Xray core) не затронуты.
- Mihomo xhttp требует недавнего ядра; `reuse-settings` — ≥ 1.19.23. VLESS `encryption` (mlkem) + Reality может быть не поддерживан в Mihomo.
- Xray `protocol: hysteria` (settings.version 2) требует недавнего Xray core; Mihomo имеет нативный hysteria2.
- Mihomo: `pqv`/mldsa65Verify не имеет аналога — предупреждение вместо удаления.

## Разработка

```bash
npm run lint   # tsc --noEmit
npm test       # vitest
npm run build  # сборка
```

Тесты пишутся на анонимных фикстурах (не настоящие ключи). См. `AGENTS.md` для соглашений вклада.

## Лицензия

MIT (см. LICENSE, если добавят).

## Ссылки

- subconverter: https://github.com/tindy2013/subconverter
- urlclash-converter: https://github.com/siiway/urlclash-converter
- mihomo-constructor: https://github.com/raywari/mihomo-constructor
- Flowreyt списки: https://github.com/Flowseal/zapret-discord-youtube
- Mihomo wiki: https://wiki.metacubex.one/
- Happ docs: https://www.happ.su/main/dev-docs/
