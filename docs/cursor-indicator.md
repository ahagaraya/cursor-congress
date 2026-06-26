# Индикатор Congress в Cursor

Когда Congress работает, в трёх местах видно статус:

1. **Status line** внизу окна Cursor Agent — `⚖️ Congress · сессия · фаза`
2. **Файл** `congress/ACTIVE.congress.md` — можно закрепить вкладку в редакторе
3. **Live UI** — золотой баннер сверху на http://127.0.0.1:3747

Индикатор включается автоматически при любом `saveState` (advance, swarm, validate и т.д.) и выключается после успешного `validate --gate full`.

## Одноразовая установка (status line + hook)

Из корня репозитория:

```bash
node congress/scripts/install-cursor-indicator.mjs
```

Скрипт:

- прописывает `statusLine` в `~/.cursor/cli-config.json`
- добавляет hook `sessionStart` в `.cursor/hooks.json` (контекст агенту, если Congress уже активен)

После установки **перезапустите чат агента** или Cursor.

## Проверка status line вручную

```bash
echo '{"model":{"display_name":"Test"},"context_window":{"used_percentage":10}}' \
  | node congress/scripts/cursor-statusline.mjs
```

Если есть активная сессия — увидите строку с `⚖️ Congress`.

## Live UI

```bash
node congress/ui/server.mjs
```

Откройте http://127.0.0.1:3747 — при активной сессии появится баннер «Congress работает».

## Файлы (gitignored)

| Файл | Назначение |
|------|------------|
| `congress/.active-session.json` | машиночитаемый маркер для status line и UI |
| `congress/ACTIVE.congress.md` | человекочитаемый статус в редакторе |
