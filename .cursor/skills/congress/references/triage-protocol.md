# Congress triage — выбор режима комиссии

Перед **intake** и Round 1 chair **обязан** спросить пользователя, какой режим нужен.

## Когда спрашивать

При **любом** запуске Congress (`/congress`, convene commission, `new-session.mjs`):

1. Создать сессию (или открыть существующую без `commission_mode`).
2. **`node congress/scripts/run.mjs <session> triage`** — рекомендация + текст для формы.
3. **`AskUserQuestion`** — пользователь выбирает режим (см. ниже).
4. **`node congress/scripts/triage.mjs <session> --set full|lite`** — записать выбор.
5. **Intake** — уточняющие вопросы по `intake-protocol.md` (отдельная форма или вторая группа вопросов).
6. Продолжить `next` → `brief` → …

Не начинать Round 1, пока не выбран `commission_mode` и (если нужно) не заполнен intake.

## Режимы

| Режим | Комиссары | Рой | Отчёт |
| --- | --- | --- | --- |
| **full** | 8 (все ядро) | ≥3 хода | Полная статья, ~1500+ слов |
| **lite** | 4: critic, architect, pragmatist, tech-lead | ≥1 ход | Короче, меньше токенов |

Опциональные (economist, marketer, product-manager) — в **обоих** режимах по необходимости (`optional-roles`).

## Форма для пользователя (обязательно)

Используйте `AskUserQuestion` **до** анализа. Минимум один вопрос:

**«Какой режим комиссии вам нужен?»**

- **Полная комиссия** — 8 ролей, роевой диалог, развёрнутое заключение. Для сделок, стратегии, высоких рисков. ~1–3 ч.
- **Краткая комиссия** — 4 роли, быстрее и дешевле. Для уточнений, узких вопросов, черновых решений. ~30–60 мин.

Покажите **рекомендацию** из `triage` (не навязывайте).

### Вместе с intake

Допустимо **две формы подряд**:

1. Режим (full / lite).
2. Все blocking-вопросы intake одной формой.

Или **одна форма**, если инструмент позволяет: сначала режим, затем пункты из `intake/questions.yaml`.

## CLI

```bash
node congress/scripts/run.mjs congress/sessions/<slug> triage
node congress/scripts/triage.mjs congress/sessions/<slug> --set full
node congress/scripts/triage.mjs congress/sessions/<slug> --set lite
```

Проверка: `assumptions.yaml` → `commission_mode: full|lite`, `deliberation/state.json` → `commission_mode`.

## Авто-рекомендация (не замена выбора пользователя)

Эвристика по BRIEF: длинный текст, сделки, юридика → склонность к **full**; короткий уточняющий вопрос → **lite**. Пользователь всегда подтверждает вручную.

## Флаги

| Флаг / поле | Эффект |
| --- | --- |
| `commission_mode` в assumptions | Зафиксированный режим |
| `--skip-intake` | Не отменяет triage — режим всё равно нужен |

## Chair checklist

- [ ] Спросил режим (full / lite)
- [ ] Записал `--set`
- [ ] Задал intake-вопросы (если есть unknowns)
- [ ] `intake/answers.yaml` или документированный skip
- [ ] Только потом `advance` → r1
