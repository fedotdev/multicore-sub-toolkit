# Sub Toolkit

Статичный клиентский инструмент для работы с прокси-подписками (decode/parse/export в Happ JSON, Clash/Mihomo YAML, v2rayNG/Xray JSON). GitHub Pages, Vite + TypeScript + Preact, Vitest.

## Команды
- `npm ci` — установить зависимости (без `package-lock.json` изменений)
- `npm run dev` — dev-сервер Vite
- `npm run test` — Vitest
- `npm run build` — сборка (TypeScript + Vite)
- `npm run preview` — preview собранной сборки (под base `/<repo>/`)

## Соглашения
- Чистые функции в `src/core/*`, никакой работы с DOM там.
- UI в `src/ui/*` на Preact; шаги: Input → Nodes → DNS → Routing → Export.
- Секреты (UUID, ключи, пароли) никуда не улетают и не логируются. Режим Redact маскирует их в выходах.
- localStorage только для несекретных настроек (тема, DNS-пресеты, списки доменов).
- После изменения функционала/поведения обновить этот файл и `README.md`.
- Тесты пишутся на анонимных фикстурах (не настоящие ключи).

## Сборка и деплой
Vite `base` устанавливается автоматически: `/` локально, `/<repo>/` в GitHub Actions. Сайт деплоится workflowми `.github/workflows/pages.yml` (permissions: pages write, id-token write). См. `README.md`.
