# B1.1 — Классификация запечённого фона HEROINE-01

**Статус:** технический аудит и классификация **только**. Ни один пиксель, alpha-канал, слой или утверждённый файл не изменён. Удаление не разрешено даже для `CONFIRMED_BACKGROUND`.
**Ветка:** `arena/02869c32-actual-new-clicker`.
**HEAD до работы:** `580ea91b68aecf0388331e51b4d1ddeddffe698a` — совпадает с ожидаемым HEAD ветки перед B1.1. Поле `ISSUE-MAP.json → headBefore = ed4d3730442f56f2f8211a0bf2d021dda29a7f9e` относится к проверке перед созданием E3.5 и **не** является HEAD перед B1.1.
**Родитель коммита B1.1:** E3.5 `580ea91b68aecf0388331e51b4d1ddeddffe698a`. **Следующий этап:** не начат; ждём визуального подтверждения и отдельного разрешения на B1.2.

---

## 0. Проверка Git перед началом

| Проверка | Результат |
|---|---|
| `git fetch origin arena/02869c32-actual-new-clicker` | выполнено |
| `git branch --show-current` | `arena/02869c32-actual-new-clicker` |
| `HEAD`, `origin`, GitHub API | `580ea91b68aecf0388331e51b4d1ddeddffe698a` |
| `ISSUE-MAP.json → headBefore` (до E3.5, для справки) | `ed4d3730442f56f2f8211a0bf2d021dda29a7f9e` |
| `git status --porcelain` до создания B1 | пусто |
| `git diff --cached` / `git diff` | пусто |
| SHA256 811 защищённых файлов из E3.5 | совпал, изменённых 0 |
| `reset --hard`, `rebase`, `force push`, amend | не применялись |

Расхождений HEAD и посторонних изменений нет; работа продолжена.

---

## 1. Что классифицировалось

Исходная выборка E3/E3.5: **6717 px / 782 4-связных компонента**. Метод-первоисточник: `work-cutout.png` alpha ≥ 128 и RGB непрозрачного пикселя в пределах **±10 по каждому каналу** от цвета фона `x=0` той же строки `IMG_4038`. Это **цветовая близость**, а не доказательство фона.

Дополнительно для каждого компонента вычислены: alpha, L1/max-diff к билинейной 4-угловой модели фона stage-04, локальный градиент, доля высокоградиентных пикселей, характер непрозрачного окружения в радиусе 5 px, расстояние до внешнего контура, расстояние до 4 исторических прозрачных лакун stage-04, слой-владелец E1, пересечения с `HZ-01…HZ-26`, пересечение с worst motion gap. Ни один вывод не сделан только по цвету.

Полные записи: [COMPONENTS.json](COMPONENTS.json). Сводка: [CLASSIFICATION-SUMMARY.json](CLASSIFICATION-SUMMARY.json).

---

## 2. Категории и правила

| Категория | Смысл | Признаки |
|---|---|---|
| `CONFIRMED_BACKGROUND` | достоверный остаток фона | крупный однородный запертый участок, L1≤19 к модели stage-04, низкий градиент, α≈255, не у внешнего контура |
| `LIKELY_BACKGROUND` | вероятный фон | фоноподобный L1 и гладкость, но недостаточно размера/контекста для «достоверно» |
| `CHARACTER_PIXEL` | героиня | высокий градиент, контур/складка/блик/тень, характерное окружение, тёмная сохранённая полоса L1 19…57 |
| `ANTIALIAS_EDGE` | сглаживание | α<255 и/или крошечный компонент у внешнего контура |
| `AMBIGUOUS` | неопределимо | 1–3 px или смешанные признаки; оставлено без автоматического решения |

Сомнительные участки **не принуждены** к первым четырём категориям: `AMBIGUOUS` — 385 компонентов / 1482 px.

### Итог

| Категория | Компоненты | Px | Доля, % | Ср. уверенность | Рекомендуемое действие |
|---|---|---|---|---|---|
| CONFIRMED_BACKGROUND | 4 | 3366 | 50.11 | 0.927 | NO_DELETION_IN_B1.1; B1.2 candidate only after user visual confirmation and separate permission; test on a copy. |
| LIKELY_BACKGROUND | 9 | 1349 | 20.08 | 0.644 | NO_DELETION_IN_B1.1; manual visual review required before any B1.2 consideration. |
| CHARACTER_PIXEL | 343 | 468 | 6.97 | 0.776 | KEEP; hair/skin/clothing/shadow/contour pixel; do not remove. |
| ANTIALIAS_EDGE | 41 | 52 | 0.77 | 0.88 | KEEP; semi-transparent contour/feather; do not remove. |
| AMBIGUOUS | 385 | 1482 | 22.06 | 0.39 | KEEP/NO_AUTOMATED_DECISION; insufficient evidence; manual visual review only. |

### Ручные визуальные уточнения

После просмотра крупных планов и листа крупных компонентов 8 записей уточнены вручную; автоматические признаки сохранены в плоских полях `COMPONENTS.json → components[]`. Это не удаление, только классификация.

| ID | Категория | Уверенность | Причина |
|---|---|---|---|
| BG-0002 | CONFIRMED_BACKGROUND | 0.95 | Manual visual review: mirrored homogeneous dark-purple wedge between back hair and sleeve/arm, symmetric to BG-0001; source and E3 red map agree. |
| BG-0003 | LIKELY_BACKGROUND | 0.7 | Manual visual review: dark-purple locked wedge between front hair, ear and collar; background-like but adjacent to high-gradient hair contour. |
| BG-0006 | LIKELY_BACKGROUND | 0.68 | Manual visual review: left-side hair/collar wedge resembling BG-0003; background-like but needs user confirmation. |
| BG-0007 | LIKELY_BACKGROUND | 0.64 | Manual visual review: narrow dark wedge between right arm and hair strands; shape follows an occlusion gap, not a fabric fold. |
| BG-0008 | LIKELY_BACKGROUND | 0.62 | Manual visual review: left arm/hair dark wedge; likely locked background, but thin and close to contour. |
| BG-0011 | LIKELY_BACKGROUND | 0.62 | Manual visual review: right arm/hair dark wedge near BG-0001; likely background gap, visual confirmation required. |
| BG-0012 | LIKELY_BACKGROUND | 0.6 | Manual visual review: narrow left arm/hair wedge; background-like but thin/edge-adjacent. |
| BG-0013 | LIKELY_BACKGROUND | 0.58 | Manual visual review: small left arm/hair wedge; background-like but insufficient area for high confidence. |

---

## 3. Визуальная проверка

Все изображения ниже — технические оверлеи уже утверждённых `IMG_4038`, `09-baked-lacunae-map.png` и данных E3.5; новой художественной графики нет. Цвета: `CONFIRMED_BACKGROUND`=(230, 40, 40), `LIKELY_BACKGROUND`=(255, 155, 0), `CHARACTER_PIXEL`=(40, 205, 90), `ANTIALIAS_EDGE`=(0, 205, 255), `AMBIGUOUS`=(215, 55, 220). Отдельная легенда: [12-legend.png](diagnostics/12-legend.png).

| Диагностический файл |
|---|
| [00-overview-map.png](diagnostics/00-overview-map.png) |
| [01-classification-overlay-full.png](diagnostics/01-classification-overlay-full.png) |
| [02-HZ-intersections-map.png](diagnostics/02-HZ-intersections-map.png) |
| [03-bbox-overlay-full.png](diagnostics/03-bbox-overlay-full.png) |
| [04-large-components-sheet.png](diagnostics/04-large-components-sheet.png) |
| [05-disputed-components-sheet.png](diagnostics/05-disputed-components-sheet.png) |
| [06-closeup-hair.png](diagnostics/06-closeup-hair.png) |
| [07-closeup-shoulders.png](diagnostics/07-closeup-shoulders.png) |
| [08-closeup-clothing.png](diagnostics/08-closeup-clothing.png) |
| [09-closeup-hands-left.png](diagnostics/09-closeup-hands-left.png) |
| [10-closeup-hands-right.png](diagnostics/10-closeup-hands-right.png) |
| [11-closeup-external-contours.png](diagnostics/11-closeup-external-contours.png) |
| [12-legend.png](diagnostics/12-legend.png) |
| [13-source-vs-overlay-full.png](diagnostics/13-source-vs-overlay-full.png) |
| [source.png](diagnostics/source.png) |

Главная общая карта: [00-overview-map.png](diagnostics/00-overview-map.png). Карта пересечений HZ: [02-HZ-intersections-map.png](diagnostics/02-HZ-intersections-map.png). Листы крупных и спорных компонентов: [04](diagnostics/04-large-components-sheet.png), [05](diagnostics/05-disputed-components-sheet.png). Исходник рядом с оверлеем: [13-source-vs-overlay-full.png](diagnostics/13-source-vs-overlay-full.png). Крупные планы ×4 (волосы, плечи, одежда, руки, ноги/обувь) и ×8 (внешние контуры прядей): [06](diagnostics/06-closeup-hair.png), [07](diagnostics/07-closeup-shoulders.png), [08](diagnostics/08-closeup-clothing.png), [09](diagnostics/09-closeup-hands-left.png), [10](diagnostics/10-closeup-hands-right.png), [11](diagnostics/11-closeup-external-contours.png).

---

## 4. Крупные компоненты

| ID | Px | Bbox | Слой | Категория | Уверенность | HZ |
|---|---|---|---|---|---|---|
| BG-0001 | 1402 | [579,347–635,418] | outfit_blouse | CONFIRMED_BACKGROUND | 0.92 | HZ-01, HZ-02, HZ-18 |
| BG-0002 | 1337 | [214,348–271,415] | outfit_blouse | CONFIRMED_BACKGROUND | 0.95 | HZ-01, HZ-02, HZ-10 |
| BG-0003 | 354 | [505,172–520,233] | hair_front_02 | LIKELY_BACKGROUND | 0.7 | HZ-02, HZ-05, HZ-07 |
| BG-0004 | 339 | [568,560–586,608] | outfit_skirt_02 | CONFIRMED_BACKGROUND | 0.92 | HZ-01, HZ-04, HZ-21 |
| BG-0005 | 288 | [307,506–318,553] | outfit_skirt_01 | CONFIRMED_BACKGROUND | 0.92 | HZ-01, HZ-03, HZ-25 |
| BG-0006 | 246 | [326,183–339,232] | hair_side_l | LIKELY_BACKGROUND | 0.68 | HZ-02, HZ-06, HZ-09 |
| BG-0007 | 198 | [638,462–653,489] | arm_r | LIKELY_BACKGROUND | 0.64 | HZ-01, HZ-02, HZ-04 |
| BG-0008 | 192 | [195,453–211,487] | arm_l | LIKELY_BACKGROUND | 0.62 | HZ-01, HZ-02, HZ-03 |
| BG-0009 | 179 | [445,650–462,667] | outfit_skirt_02 | AMBIGUOUS | 0.45 | HZ-01, HZ-23, HZ-25 |
| BG-0010 | 147 | [406,412–419,433] | outfit_ribbon | AMBIGUOUS | 0.45 | HZ-01, HZ-02, HZ-18 |
| BG-0011 | 114 | [621,433–639,457] | arm_r | LIKELY_BACKGROUND | 0.62 | HZ-01, HZ-02, HZ-04 |
| BG-0012 | 96 | [191,487–198,517] | arm_l | LIKELY_BACKGROUND | 0.6 | HZ-01, HZ-03, HZ-25 |
| BG-0013 | 69 | [212,438–223,451] | arm_l | LIKELY_BACKGROUND | 0.58 | HZ-01, HZ-02, HZ-03 |
| BG-0014 | 68 | [482,614–492,623] | outfit_skirt_02 | AMBIGUOUS | 0.45 | HZ-01, HZ-25, HZ-26 |
| BG-0015 | 60 | [513,624–524,629] | outfit_skirt_02 | AMBIGUOUS | 0.45 | HZ-01, HZ-04, HZ-25 |
| BG-0016 | 59 | [465,258–476,269] | hair_side_r | AMBIGUOUS | 0.45 | HZ-02, HZ-07, HZ-08 |
| BG-0017 | 54 | [630,570–637,583] | hair_back_01 | LIKELY_BACKGROUND | 0.68 | HZ-01, HZ-04, HZ-25 |
| BG-0018 | 48 | [368,253–377,263] | hair_side_l | AMBIGUOUS | 0.45 | HZ-02, HZ-06, HZ-09 |
| BG-0019 | 45 | [478,260–487,267] | hair_side_r | AMBIGUOUS | 0.45 | HZ-02, HZ-07, HZ-08 |
| BG-0020 | 39 | [518,648–527,654] | outfit_skirt_02 | AMBIGUOUS | 0.45 | HZ-01, HZ-04, HZ-25 |

## 5. Спорные участки

`AMBIGUOUS + LIKELY_BACKGROUND` = **394 компонентов / 2831 px**. Топ-30 по площади:

| ID | Px | Bbox | Категория | Уверенность | Слой | HZ |
|---|---|---|---|---|---|---|
| BG-0003 | 354 | [505,172–520,233] | LIKELY_BACKGROUND | 0.7 | hair_front_02 | HZ-02, HZ-05, HZ-07 |
| BG-0006 | 246 | [326,183–339,232] | LIKELY_BACKGROUND | 0.68 | hair_side_l | HZ-02, HZ-06, HZ-09 |
| BG-0007 | 198 | [638,462–653,489] | LIKELY_BACKGROUND | 0.64 | arm_r | HZ-01, HZ-02, HZ-04 |
| BG-0008 | 192 | [195,453–211,487] | LIKELY_BACKGROUND | 0.62 | arm_l | HZ-01, HZ-02, HZ-03 |
| BG-0009 | 179 | [445,650–462,667] | AMBIGUOUS | 0.45 | outfit_skirt_02 | HZ-01, HZ-23, HZ-25 |
| BG-0010 | 147 | [406,412–419,433] | AMBIGUOUS | 0.45 | outfit_ribbon | HZ-01, HZ-02, HZ-18 |
| BG-0011 | 114 | [621,433–639,457] | LIKELY_BACKGROUND | 0.62 | arm_r | HZ-01, HZ-02, HZ-04 |
| BG-0012 | 96 | [191,487–198,517] | LIKELY_BACKGROUND | 0.6 | arm_l | HZ-01, HZ-03, HZ-25 |
| BG-0013 | 69 | [212,438–223,451] | LIKELY_BACKGROUND | 0.58 | arm_l | HZ-01, HZ-02, HZ-03 |
| BG-0014 | 68 | [482,614–492,623] | AMBIGUOUS | 0.45 | outfit_skirt_02 | HZ-01, HZ-25, HZ-26 |
| BG-0015 | 60 | [513,624–524,629] | AMBIGUOUS | 0.45 | outfit_skirt_02 | HZ-01, HZ-04, HZ-25 |
| BG-0016 | 59 | [465,258–476,269] | AMBIGUOUS | 0.45 | hair_side_r | HZ-02, HZ-07, HZ-08 |
| BG-0017 | 54 | [630,570–637,583] | LIKELY_BACKGROUND | 0.68 | hair_back_01 | HZ-01, HZ-04, HZ-25 |
| BG-0018 | 48 | [368,253–377,263] | AMBIGUOUS | 0.45 | hair_side_l | HZ-02, HZ-06, HZ-09 |
| BG-0019 | 45 | [478,260–487,267] | AMBIGUOUS | 0.45 | hair_side_r | HZ-02, HZ-07, HZ-08 |
| BG-0020 | 39 | [518,648–527,654] | AMBIGUOUS | 0.45 | outfit_skirt_02 | HZ-01, HZ-04, HZ-25 |
| BG-0021 | 29 | [468,488–479,492] | AMBIGUOUS | 0.45 | outfit_skirt_01 | HZ-01, HZ-17, HZ-25 |
| BG-0022 | 28 | [452,624–458,627] | AMBIGUOUS | 0.45 | outfit_skirt_02 | HZ-01, HZ-25, HZ-26 |
| BG-0023 | 26 | [212,572–216,579] | LIKELY_BACKGROUND | 0.68 | hair_back_01 | HZ-01, HZ-03, HZ-25 |
| BG-0024 | 25 | [654,500–656,510] | AMBIGUOUS | 0.45 | arm_r | HZ-01, HZ-04, HZ-25 |
| BG-0025 | 21 | [436,414–439,423] | AMBIGUOUS | 0.45 | outfit_ribbon | HZ-01, HZ-02, HZ-18 |
| BG-0026 | 17 | [515,367–518,372] | AMBIGUOUS | 0.45 | outfit_blouse | HZ-02, HZ-07, HZ-11 |
| BG-0027 | 16 | [511,264–516,271] | AMBIGUOUS | 0.45 | hair_side_r | HZ-02, HZ-07, HZ-09 |
| BG-0028 | 16 | [516,632–521,635] | AMBIGUOUS | 0.45 | outfit_skirt_02 | HZ-01, HZ-04, HZ-25 |
| BG-0029 | 14 | [279,613–282,618] | AMBIGUOUS | 0.45 | outfit_skirt_02 | HZ-01, HZ-03, HZ-25 |
| BG-0030 | 14 | [400,624–403,627] | AMBIGUOUS | 0.45 | outfit_skirt_02 | HZ-01, HZ-25, HZ-26 |
| BG-0032 | 13 | [525,364–532,368] | AMBIGUOUS | 0.45 | outfit_blouse | HZ-02, HZ-07, HZ-11 |
| BG-0033 | 12 | [378,265–381,270] | AMBIGUOUS | 0.45 | hair_side_l | HZ-02, HZ-06, HZ-08 |
| BG-0035 | 12 | [432,500–434,503] | AMBIGUOUS | 0.45 | outfit_skirt_01 | HZ-01, HZ-17, HZ-25 |
| BG-0038 | 9 | [421,533–423,535] | AMBIGUOUS | 0.45 | outfit_skirt_01 | HZ-01, HZ-25, HZ-26 |

Полный перечень ID и координат — `COMPONENTS.json → components[].visualCategory`.

## 6. Пересечения с HZ-01…HZ-26

Компонентов с хотя бы одним HZ: **781**; карта — [02-HZ-intersections-map.png](diagnostics/02-HZ-intersections-map.png).

| HZ | Компоненты | Px |
|---|---|---|
| HZ-01 | 430 | 5417 |
| HZ-02 | 459 | 4941 |
| HZ-03 | 70 | 771 |
| HZ-04 | 83 | 958 |
| HZ-05 | 10 | 366 |
| HZ-06 | 148 | 521 |
| HZ-07 | 109 | 632 |
| HZ-08 | 21 | 142 |
| HZ-09 | 97 | 900 |
| HZ-10 | 41 | 1408 |
| HZ-11 | 31 | 88 |
| HZ-12 | 24 | 46 |
| HZ-13 | 17 | 42 |
| HZ-15 | 1 | 2 |
| HZ-16 | 24 | 24 |
| HZ-17 | 37 | 86 |
| HZ-18 | 283 | 3362 |
| HZ-19 | 279 | 586 |
| HZ-20 | 117 | 318 |
| HZ-21 | 15 | 355 |
| HZ-22 | 2 | 2 |
| HZ-23 | 4 | 185 |
| HZ-24 | 15 | 136 |
| HZ-25 | 763 | 6696 |
| HZ-26 | 750 | 6081 |

---

## 7. Попадание тёмных волос, складок, контуров, теней и сглаживания

Проверено отдельно, чтобы не принять цветовую близость за фон:

- **4308 px** выборки попадают в сохранённую stage-04 тёмную полосу `L1 19…57` (в `SLICE-MAP.md` это **49 225 px** тёмной одежды/теней, которые намеренно НЕ удалялись).
- **2409 px** имеют `L1≤18` к 4-угловой модели и действительно фоноподобны, но среди них есть тёмные складки/тени; поэтому только часть перешла в `CONFIRMED_BACKGROUND`.
- **381 px** имеют локальный градиент >30: контуры, линии, блики, пряди.
- **62 px** имеют `alpha<255`; **52 px** из них отнесены к `ANTIALIAS_EDGE`, остальные сохранены в `CHARACTER_PIXEL`/`AMBIGUOUS` при отсутствии признаков внешней границы.
- **44 px** примыкают к внешнему контуру; они проверены отдельно и не объявлены фоном автоматически.
- Визуально красные точки E3 на тёмно-синем воротнике, рукавах, ленте и юбке часто совпадают с тёмными линиями/складками, а не с открытым фоном; см. [07](diagnostics/07-closeup-shoulders.png) и [08](diagnostics/08-closeup-clothing.png).

Подробный разбор расхождения `6 717 / 3 841` — [DISCREPANCY-ANALYSIS.md](DISCREPANCY-ANALYSIS.md).

---

## 8. Сохранность и СТОП

- Изменено пикселей / alpha: **0 / 0**. Inpainting, cloning, generative fill, AI-генерация, новые слои, восстановление анатомии: **0**.
- Оригиналы WebP, E1, E2, E2 V2, E3, E3.5, `PLAN.md`, `ANIMATION-SPEC.md`, `MANIFEST.json`, `public/`, `src/`, `dist/`, PixiJS, атлас, PR #3 не тронуты.
- Vercel Preview/Production, B1.2, B2–B6, E4–E8 не запускались. Технические PASS не объявлены художественным качеством; самоодобрения нет.
- Все пять обязательных документа и диагностические PNG находятся только в `art-studio/stages/05-independent-layers/B1-BACKGROUND-CLASSIFICATION/`.

**СТОП.** Это разрешение только на классификацию. Даже `CONFIRMED_BACKGROUND` удалять сейчас нельзя. Жду визуального подтверждения и отдельного разрешения на B1.2.
