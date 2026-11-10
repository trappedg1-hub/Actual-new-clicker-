# HEROINE-01 — спецификация анимации для рига из 20 слотов / 24 состояний

**Дата:** 2026-11-10 · **Статус:** ПРОЕКТ (на согласовании) · **Этап:** 04-подготовка, спецификация
**Основа:** `docs/HEROINE-01-recovery.md` §5 (реальная иерархия), PAT `1068c68` (`LAYER-HIERARCHY.md`, `public/art/heroine.json`), PR #3 (`pose → idle → art`), `package.json`
**Визуальные эталоны:** `art-studio/references/originals/IMG_4036_style-reference.webp` (манера), `IMG_4037_campus-outfit.webp` (канон), `IMG_4038_rig-pose.webp` (геометрия позы)

> **Граница применимости.** Публичные GitHub-проекты ниже — **внешние технические референсы по анимации**, а не репозитории пользователя, не канон HEROINE-01 и не источник художественного стиля. К сторонним/соседним репозиториям пользователя, Vercel и деплоям обращений не было. Канон берётся только из PAT, `docs/HEROINE-01-recovery.md`, истории переписки и трёх присланных референсов.

---

## 1. Текущий стек и отправная точка

| Компонент | Состояние | Источник |
|---|---|---|
| `pixi.js` 8.22.0, `@pixi/layout` 3.2.1, `@pixi/ui` 2.4.1 | в `package.json` | репозиторий |
| `pixijs-actions` 1.5.0 | в `package.json`; Action-движок для циклов | репозиторий |
| `inkjs` 2.4.0, `yoga-layout` 3.2.1 | нарратив / layout | репозиторий |
| `startIdlePose` — дыхание, качание волос, моргание | 9 технических слоёв | `src/heroine/poses/idlePose.ts` в `main` |
| `playZoneReaction` — 6 зон: head/frontHair/backHair/torso/leftArm/rightArm | работает | `src/heroine/reactions/zoneReactions.ts` в `main` |
| `AnimationLayer`: `pose → idle → art`, rest-transform на `pose`, арт всегда identity | в PAT и PR #3 | `src/heroine/rig/animationLayer.ts` |
| `applyArt()` — 9 имён фреймов плейсхолдер-атласа, `anchor = pivot / size` | в PAT и PR #3 | `LayeredHeroineRig.ts`, `heroineArt.ts` |
| Манифест `version 3`, страница 512×512 при `density 2`, 9 фреймов | тестовый атлас, **не финальный арт** | `public/art/heroine.json` |
| **Цель:** 20 графических слотов / **24 визуальных состояния** | не нарезано | `docs/HEROINE-01-recovery.md` §5.6 |

**Ключевое ограничение:** упрощение до 7–9 слоёв запрещено. Целевая структура — 24 состояния из §5.6.

---

## 2. Что берём из публичных GitHub-проектов по анимации

| # | Проект (внешний, публичный) | Идея | Как применяется у HEROINE-01 | Чего НЕ берём |
|---:|---|---|---|---|
| 1 | [pixijs/pixijs](https://github.com/pixijs/pixijs), [pixijs/layout](https://github.com/pixijs/layout), [pixijs/ui](https://github.com/pixijs/ui) | рендер/лейаут/UI на PixiJS 8 | базовый стек, уже в зависимостях | — |
| 2 | [reececomo/pixijs-actions](https://github.com/reececomo/pixijs-actions) | высокопроизводительные Action-последовательности для PixiJS | движок для `idle` и `reaction`; **это реальный репозиторий библиотеки `pixijs-actions` из `package.json`** (`pixijs/actions` не существует, API вернул 404) | не меняем версию 1.5.0 |
| 3 | [arjunindia/live2d-skills — Cubism Web motion](https://github.com/arjunindia/live2d-skills/blob/main/live2d-cubism-web-motion/SKILL.md) | **жёсткий порядок обновления кадра**: motion → blink → expression → drag → breath → physics → lipSync → pose (opacity) → final | адаптируем как §5: приоритеты и запрет взаимной перезаписи трансформов; авто-блинк только когда основное движение закончилось | не внедряем сам Cubism SDK, не добавляем зависимость |
| 4 | [RevStudio/Rev2D](https://github.com/RevStudio/Rev2D) | риг = один JSON; параметры/ keyforms, `drawOrder`, `visible`, `z`, **проверка loop seam** (0 % отличающихся пикселей между t=0 и t=конец) | дискретные состояния глаз/рта как `visible`, а не морфинг; регрессионный тест «петля не щёлкает» | не переводим риг в Spine/Live2D-формат, не добавляем IK/weighted meshes |
| 5 | [LiaTemplates/pixijs](https://github.com/LiaTemplates/pixijs) | `blink=`, `talk=`, `idle=breathe`, отдельные файлы под выражения лица | ровно наш подход: `eye_l_open/_closed`, `mouth_neutral/_open/_smile` переключаются видимостью | не берём их DSL и сценарный движок |
| 6 | [Themis-Foundry/pixel-sprite-animator](https://github.com/Themis-Foundry/pixel-sprite-animator) | дыхание **внутреннее**: поднимается торс, голова и стопы остаются на месте; `idle_0` — «sacred», всё выводится из него | дыхание `torso ±6°` без bouncing всего спрайта; neutrality как база для всех состояний | не берём pixel-трансформы и 32×32 контракт |
| 7 | [rosdyana/pixel-rig](https://github.com/rosdyana/pixel-rig) | `look` + `pose` (абсолютные углы суставов), anchors на стопы/руки, опциональный адаптер PixiJS v8 | **пивот = origin слоя**, локальные пивоты из §5.7; иерархия углов | не генерируем спрайты кодом, не берём side-view |
| 8 | [guansss/pixi-live2d-display](https://github.com/guansss/pixi-live2d-display), [Untitled-Story/untitled-pixi-live2d-engine](https://github.com/Untitled-Story/untitled-pixi-live2d-engine) | параметрические модели как Pixi-объект, PixiJS v8 | подтверждение, что параметрический риг совместим с нашим рендерером | не подключаем Live2D/Cubism runtime |
| 9 | [docs.live2d.com — Cubism Viewer for OW](https://docs.live2d.com/en/cubism-editor-manual/cubism3-viewer-for-ow/) | авто-блинк, Breath, Physics, Idle Motion, Pose Switching, Motion-sync как **раздельные системы** | разделяем `idle` (breath/sway/blink) и `pose` (реакции), чтобы они не перезаписывали друг друга | — |
| 10 | [egorfedorov/spine-mcp](https://github.com/egorfedorov/spine-mcp), [GenielabsOpenSource/spine-animation-ai](https://github.com/GenielabsOpenSource/spine-animation-ai) | нарезка рига из cut-up character art | концептуально подтверждает наш этап «дорисовка скрытых зон на отдельных слоях» | не берём их пайплайн, не собираем атлас автоматически |

**Вывод:** прошлый агент фактически уже реализовал тот же архитектурный принцип, что и зрелые 2D-риги — разделение `pose → idle → art`, состояния видимостью, пивоты в локальных координатах, реакции от identity. Наша задача — **расширить его с 9 технических слоёв до 24 состояний**, не переписывая архитектуру.

---

## 3. Карта 24 состояний → анимационные роли

Имена, z-order и амплитуды — дословно из `LAYER-HIERARCHY.md` / §5.2–§5.6 досье. Новое здесь — только привязка к системам анимации.

| z | Состояние(я) | Группа | Система | Движение |
|---:|---|---|---|---|
| 0 | `glow` | код | render | генерируется кодом, не арт |
| 1 | `hair_back_01` | `backHairGroup` | idle / sway | ±10°, своя фаза, **не наследует наклон головы** |
| 2 | `hair_back_02` | `backHairGroup` | idle / sway | ±10°, вторая фаза с задержкой |
| 3 | `leg_l` | `legGroup` | idle | ±4°, пивот в тазобедренном |
| 4 | `leg_r` | `legGroup` | idle | ±4° |
| 5 | `torso` | `bodyRoot` | idle / breath | дыхание, наклон ±6°; внутреннее, стопы и голова не дёргаются |
| 6 | `arm_l` | `armGroup_l` | pose + idle | ±25° от плечевого пивота + наследует наклон корпуса |
| 7 | `arm_r` | `armGroup_r` | pose + idle | ±25°, требует «колпак» плеча |
| 8 | `outfit_blouse` | `outfitGroup` | static | следует за корпусом |
| 9 | `outfit_collar` | `outfitGroup` | static | следует за корпусом, **не за головой**, своей анимации нет |
| 10 | `outfit_ribbon` | `outfitGroup` | static / **[С-3]** | состав уточняется при согласовании |
| 11 | `outfit_skirt_01` | `outfitGroup` | idle | инерция юбки |
| 12 | `outfit_skirt_02` | `outfitGroup` | idle | подол, вторая фаза |
| 13 | `head` | `headGroup` | pose | наклон ±12°, поворот ±8° |
| 14 | `eye_l_open` / `eye_l_closed` | `faceGroup` | visibility / blink | переключение **видимостью, не прозрачностью и не трансформом** |
| 15 | `eye_r_open` / `eye_r_closed` | `faceGroup` | visibility / blink | то же, синхронно с левым |
| 16 | `mouth_neutral` / `mouth_open` / `mouth_smile` | `faceGroup` | visibility / expression | одно из трёх; артикуляция при нарративе `inkjs` |
| 17 | `hair_side_l` | `frontHairGroup` | idle / sway | ±12°, своя фаза |
| 18 | `hair_side_r` | `frontHairGroup` | idle / sway | ±12°, своя фаза |
| 19 | `hair_front_01` | `frontHairGroup` | idle / sway | ±12°, следует за головой |
| 20 | `hair_front_02` | `frontHairGroup` | idle / sway | ±12°, вторая фаза |

**Счёт:** 17 одиночных кадров (z 1–13, 17–20) + 2 + 2 + 3 = **24 визуальных состояния** в **20 графических слотах**.

---

## 4. Порядок обновления кадра (адаптация Cubism Web)

Приоритеты нужны, чтобы `idle` и `reaction` не перезаписывали друг друга — ровно та же проблема, которую прошлый агент решил разделением `pose → idle → art`.

```
1. frame clock   → wall-clock elapsedMS (P1-правка из PAT: НЕ deltaMS с отсечкой 100 мс)
2. reaction pose → playZoneReaction, всегда от identity, финальный no-op reset
3. idle          → breath (torso), sway (волосы), legs, skirt inertia
4. blink         → только когда реакция завершилась; visibility, не трансформ
5. expression    → mouth_* / eye_*_open|closed, видимость
6. art           → контейнер art ВСЕГДА identity; спрайты не анимируются
7. render        → PixiJS 8 ticker, ResizeObserver сначала ресайзит рендерер
```

Правила:
- **Запрет дрейфа:** быстрая серия тапов перезапускает реакцию, а не накапливает трансформы (уже покрыто тестом `rapid taps restart the reaction without stacking transforms` в PAT).
- **Запрет сжатия радужки:** состояния глаз/рта переключаются видимостью; масштабирование век/зрачка не применяется.
- **Задние волосы** идут с трансформом корпуса, но **не** с наклоном головы; четыре передние пряди имеют независимые пивоты и фазы.
- **Блузка(8)/воротник(9) поверх рук(6–7):** при подъёме руки нужны дорисованные «колпаки» плеча на слоях рук.
- **Пивот = origin слоя**, `anchor = pivot / size`; rest-transform живёт на `pose`, а не на `art`.

---

## 5. Петли и тайминги (предложение, НЕ утверждено)

| Система | Петля | Амплитуда | Период | Фазовая задержка |
|---|---|---|---|---|
| Дыхание | `torso` | ±6° | 3.6–4.2 с, синус | 0 |
| Волосы задние | `hair_back_01/02` | ±10° | 4.4–5.2 с | 120–200 мс между прядями |
| Волосы передние | `hair_side_l/r`, `hair_front_01/02` | ±12° | 4.4–5.2 с | 4 независимые фазы |
| Ноги | `leg_l/leg_r` | ±4° | синхронно с дыханием | — |
| Юбка | `outfit_skirt_01/02` | инерция | следом за корпусом | 80–150 мс |
| Моргание | `eye_l/r_closed` | visibility | интервал 2–6 с, длительность 120–160 мс | — |
| Рот | `mouth_*` | visibility | по нарративу / реакции | — |
| Реакция | 6 зон | ±25° руки, ±12° голова | 0.35–0.6 с | всегда от identity |

**Критерий loop seam:** на границе цикла (t=0 против t=конец) трансформы и видимость должны совпадать; визуальный скачок = дефект. Идея проверки взята у Rev2D (`analyze --anim idle`), реализуется как регрессионный тест без браузера, по образцу `tests/heroine-rig.test.ts` и `tests/rendering.test.ts` из PAT.

---

## 6. Критерии приёмки анимации

| # | Проверка |
|---:|---|
| 1 | `pose → idle → art` у каждого узла; все три узла имеют label для поиска |
| 2 | `art` остаётся identity при любых `idle`/`reaction` |
| 3 | `idle` и `reaction` пишут в разные узлы; тап не обнуляет дыхание |
| 4 | 6 хит-зон сохраняются после обёртывания |
| 5 | глаза/веки/рот живут **вне** контейнера `head` artwork |
| 6 | состояние глаз/рта меняется `visible`, а не `alpha`/`scale` |
| 7 | задние волосы не наследуют наклон головы; 4 передние пряди имеют разные фазы |
| 8 | воротник не наследует голову и не имеет своей анимации |
| 9 | быстрые тапы не накапливают дрейф; финальный action — no-op reset |
| 10 | нет скачка на стыке петли (loop seam) |
| 11 | отсутствующие фреймы манифеста логируются, сцена не пустеет |
| 12 | `density` и пивоты не удваивают размер спрайтов |
| 13 | 20 слотов / 24 состояния, **не** 7–9 слоёв |
| 14 | манера рендера = `IMG_4036`/`IMG_4037`, не упрощённая прорисовка `IMG_4038` |

---

## 7. Гейты (без изменений)

| Шаг | Что | Разрешение |
|---:|---|---|
| ✅ | Приёмка 3 референсов, **[С-8]** закрыт | получено |
| ✅ | Сверка с каноном, поза принята с оговорками | `art-studio/stages/REFERENCE-REVIEW.md` |
| ✅ | Спецификация анимации | этот файл |
| ⏳ | **Нарезка 24 визуальных состояний** (с дорисовкой скрытых зон) | требуется явное «одобряю» |
| ⏳ | Финальный атлас + `public/art/heroine.json` на 24 фрейма | отдельное разрешение |
| ⏳ | Изменения кода (`ART_FRAME_NAMES`, `applyArt`, `zoneReactions`) | отдельное разрешение |
| ⏳ | Merge PR #3 | отдельное разрешение |
| ⏳ | Deployment | отдельное разрешение |

**Не делается:** генерация изображений; правка оригинального approved-арта; упрощение рига; смена манеры на полуфотореализм / другой аниме-стиль / cel-shading; использование образа 25+ как основы; обращения к Vercel и сторонним репозиториям пользователя; Merge и Deployment.

---

## 8. Источники

| Источник | Роль |
|---|---|
| `docs/HEROINE-01-recovery.md` §5, §6, §7 | канон иерархии, техсостояние, гейты |
| PAT `1068c68`: `LAYER-HIERARCHY.md`, `APPROVED.json`, `STYLE-LOCK.json`, `public/art/heroine.json`, `src/**`, `tests/**` | реальная иерархия, стиль, код, тесты прошлого агента |
| PR #3 (ветка `arena/f679ef18-actual-new-clicker`) | `pose → idle → art`, загрузчик арта, 9-фреймовый тестовый атлас |
| `package.json`, `src/heroine/**` репозитория | текущие зависимости и 9 технических слоёв |
| Публичные GitHub-проекты из §2 | **только техника анимации**, не канон, не репозитории пользователя |
| Три референса в `art-studio/references/originals/` | манера, канон, геометрия позы |
