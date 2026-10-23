# Sub Toolkit — план реализации

Цель: статичный одностраничный клиентский инструмент (GitHub Pages, Vite + TS) для декодирования прокси-подписок, выделении share-ссылок, правки DNS и списков "Zapret → Direct", экспорта в Happ JSON, Clash/Mihomo YAML, v2rayNG/Xray JSON. UI на русском.

## Стек (runtime без сторонних скриптов/шрифтов/CDN)
- Vite + TypeScript, Preact (маленький бандл, JSX)
- js-yaml (сборка-time зависимость, бандлится)
- qrcode (динамический импорт только при открытии вкладки QR)
- Vitest + jsdom + @testing-library/dom — тесты
- GitHub Actions: checkout → setup-node → npm ci → npm test → npm run build → configure-pages → upload-pages-artifact → deploy-pages

## Архитектура
- `src/core/model.ts` — ProxyNode + конфиги (DNS, listas, routing, redact)
- `src/core/parse.ts` — парсер share-ссылок (vless/vmess/trojan/ss/hysteria2/hy2/tuic)
- `src/core/decode.ts` — декодер подписки (base64, текст, Clash YAML, Xray JSON, sing-box JSON, happ://crypto)
- `src/core/serialize/links.ts` — модель → ссылки
- `src/core/serialize/xray.ts` — Xray JSON конфиг на ноду
- `src/core/serialize/happ.ts` — Happ JSON (массив Xray-конфигов)
- `src/core/serialize/mihomo.ts` — Mihomo YAML
- `src/core/lists.ts` — списки Flowreyt (zapret-discord-youtube) с фолбэком на jsDelivr
- `src/core/dns.ts` — DNS конфигурация и пресеты
- `src/core/routing.ts` — preset-правила маршрутизации
- `src/core/redact.ts` — маскирование uuid/pbk/sid/password
- `src/core/validate.ts` — валидация каждого вывода перед показом
- `src/ui/*` — UI (App, шаги Input/Nodes/DNS/Routing/Export, тема, i18n)

## Этапы коммитов
1. Skeleton: AGENTS.md, PLAN.md, package.json, Vite/TS, index.html, .nojekyll, workflow, README-заглушка; `npm ci && npm run build` зелёный
2. Core model + link parser + тесты (фикстуры из задания, round-trip)
3. Subscription decoder + тесты
4. DNS, lists, routing, redact, validate (чистые функции + тесты)
5. Serializers links/xray/happ/mihomo + тесты кросс-таргета
6. UI skeleton: роутинг по хешу, тема, i18n, шаги, шапка
7. UI: шаг Input (вставка/файл/URL, 3 режима, CSP, редакторы)
8. UI: шаг Nodes (таблица, поиск, копирование, QR, скачивание .txt)
9. UI: шаг DNS (редактор, пресеты, предупреждения)
10. UI: шаг Routing (Zapret-режим, списки, пресеты маршрутизации)
11. UI: шаг Export (Happ/Mihomo/v2rayNG, валидация, маскирование, copy/download)
12. README (RU), docs/CORS (Worker шаблон + userscript), финиш, `npm ci && npm test && npm run build` и коммит

## Ограничения
- Никакого бэкенда, аналитики, шрифтов, CDN в рантайме. Вся обработка — в браузере.
- Тайны (UUID, ключи, пароли) не логируются и не уходят никуда, кроме URL, которое пользователь явно указал.
- Режим "Redact" маскирует секреты во всех выходах.
- Strict CSP meta. State в памяти; localStorage только несекретные настройки (DNS-пресеты, списки доменов, тема); кнопка "Clear all".
- Hash-роутинг, `.nojekyll`, base корректно для `<user>.github.io/<repo>/`.
