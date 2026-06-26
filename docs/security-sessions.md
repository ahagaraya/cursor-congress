# Безопасность папки congress/sessions/

Сессии Congress содержат **личные и предметные данные**: ответы intake (город, занятость, бюджет), BRIEF, мнения комиссии, итоговые ANSWER.

## Не коммитить

`congress/.gitignore` исключает `sessions/*/`. **Не удаляйте** это правило и не добавляйте сессии в git вручную.

## Не синхронизировать в облако

Если весь репозиторий или папка `NEEDS` синхронизируется через iCloud, Dropbox, Google Drive и т.п., **`congress/sessions/` попадёт в облако** вместе с intake и ответами.

Рекомендации:

1. Исключите `congress/sessions/` из синхронизации облака (правило исключения провайдера).
2. Или храните сессии вне синхронизируемой папки и задайте симлинк (продвинутый вариант).
3. Не делитесь скриншотами UI Congress (:3747) с видимым slug и текстом intake.

## Локальный UI

Сервер слушает только `127.0.0.1:3747` — не открывайте порт наружу и не меняйте bind на `0.0.0.0` без необходимости.

## Очистка старых сессий

```bash
# Просмотр (сессии старше 30 дней)
node congress/scripts/clean-sessions.mjs --dry-run

# Удаление
node congress/scripts/clean-sessions.mjs --days 30

# Не удалять эталонные сессии
CONGRESS_KEEP_SLUGS=2026-06-26-congress-self-review-run3 node congress/scripts/clean-sessions.mjs --days 30
```

## Pre-commit

Установите хук, чтобы не закоммитить неполный ANSWER:

```bash
node congress/scripts/install-hooks.mjs
```

Хук проверяет staged `congress/sessions/*/ANSWER.md` через `validate-session --gate full --warn`.

## Intake — минимум полей

На предметных задачах с персональными данными собирайте только необходимое (см. `intake-protocol.md`). Для мета-задач intake можно пропускать (`skip_intake_reason`).
