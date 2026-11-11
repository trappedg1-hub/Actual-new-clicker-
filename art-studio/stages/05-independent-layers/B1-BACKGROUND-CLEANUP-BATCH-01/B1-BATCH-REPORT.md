# B1.3 — Пакетная очистка 9 компонентов LIKELY_BACKGROUND

**Статус:** `TECHNICAL_PASS / NOT_ARTISTICALLY_APPROVED`. Разрешение распространяется только на девять указанных `LIKELY_BACKGROUND` из B1.1; фактически очищены **6**, три сомнительных компонента пропущены. Работа выполнена только на новой копии результата B1.2.
**Ветка:** `arena/02869c32-actual-new-clicker`. **HEAD перед началом:** `d155dc69005165b3a6db4f5f21df3b0361182fa1` (B1.2). **B1.1:** `737b2925afacfdd513f14fedc9597ae85d5f1b33`.

---

## 1. Preflight и источники

| Проверка | Результат |
|---|---|
| `git fetch origin arena/02869c32-actual-new-clicker` | выполнено |
| Локальный HEAD / origin / GitHub API | все `d155dc69005165b3a6db4f5f21df3b0361182fa1` |
| Родитель B1.2 | `737b2925afacfdd513f14fedc9597ae85d5f1b33` (B1.1) |
| Рабочее дерево до начала | чистое |
| Папка B1.3 до начала | отсутствовала |
| Контрольные SHA256 | [PROTECTED-BASELINE.json](PROTECTED-BASELINE.json) |
| `reset --hard`, `rebase`, `force push`, `amend` | не применялись |

Защищённых файлов B1.2 проверено **880**, изменённых **0**; snapshot `647fd98aaf886b66617d0050d115707ea3fca50807cc565d5dde499969d86af7`. Снимок B1.1 из 836 файлов и встроенный снимок E3.5 из 811 файлов также совпали.

Источники истины: [../B1-BACKGROUND-CLASSIFICATION/COMPONENTS.json](../B1-BACKGROUND-CLASSIFICATION/COMPONENTS.json), [B1.1 diagnostics](../B1-BACKGROUND-CLASSIFICATION/diagnostics/00-overview-map.png), [../B1-BACKGROUND-CLEANUP-PILOT/CHANGED-PIXELS.json](../B1-BACKGROUND-CLEANUP-PILOT/CHANGED-PIXELS.json), [../B1-BACKGROUND-CLEANUP-PILOT/build_cleanup.py](../B1-BACKGROUND-CLEANUP-PILOT/build_cleanup.py), [../E3.5-RESTORATION-PLAN/ISSUE-MAP.json](../E3.5-RESTORATION-PLAN/ISSUE-MAP.json).

## 2. Решения по девяти компонентам

Общая карта: [comparison/00-nine-components-map.png](comparison/00-nine-components-map.png). Зелёный = очищено, красный = пропущено; прямоугольники — точные bbox B1.1.

| ID | Px | Bbox | Решение | HZ | Основание после ×4/×8 | Листы |
|---|---|---|---|---|---|---|
| `BG-0003` | 354 | [505, 172, 520, 233] | `CLEANED` | HZ-02, HZ-05, HZ-07, HZ-09, HZ-25 | Чётко замкнутый тёмно-фиолетовый фон между передней прядью, ухом и воротником; на ×4/×8 внутри маски нет волос, кожи, белой обводки или сглаженного края персонажа. | [x4](comparison/10-BG-0003-4x.png) / [x8](comparison/20-BG-0003-8x.png) |
| `BG-0006` | 246 | [326, 183, 339, 232] | `CLEANED` | HZ-02, HZ-06, HZ-09, HZ-25 | Зеркальный замкнутый фон между левой лицевой прядью и задними волосами; границы маски совпадают с естественным просветом, соседние полупрозрачные 253/254 остаются нетронутыми. | [x4](comparison/11-BG-0006-4x.png) / [x8](comparison/21-BG-0006-8x.png) |
| `BG-0007` | 198 | [638, 462, 653, 489] | `CLEANED` | HZ-01, HZ-02, HZ-04, HZ-25, HZ-26 | Тёмный клин между правым предплечьем и отдельными прядями; форма повторяет просвет, а не складку ткани или тень на волосах; контур кожи не задет. | [x4](comparison/12-BG-0007-4x.png) / [x8](comparison/22-BG-0007-8x.png) |
| `BG-0008` | 192 | [195, 453, 211, 487] | `CLEANED` | HZ-01, HZ-02, HZ-03, HZ-25, HZ-26 | Узкий, но цельный тёмный просвет между прядями у левой руки; на ×8 граница проходит по тёмному фону, белая обводка и кожа рядом не изменены. | [x4](comparison/13-BG-0008-4x.png) / [x8](comparison/23-BG-0008-8x.png) |
| `BG-0011` | 114 | [621, 433, 639, 457] | `CLEANED` | HZ-01, HZ-02, HZ-04, HZ-25, HZ-26 | Фоновый клин рядом с уже очищенным BG-0001; отделён от него непрозрачной прядью, не соединяется с существующими дырами и не разрезает контур. | [x4](comparison/14-BG-0011-4x.png) / [x8](comparison/24-BG-0011-8x.png) |
| `BG-0012` | 96 | [191, 487, 198, 517] | `CLEANED` | HZ-01, HZ-03, HZ-25, HZ-26 | Узкий вертикальный просвет между прядями; маска не доходит до кожи и не расширялась; диагональное соседство с BG-0008 сохранено как есть. | [x4](comparison/15-BG-0012-4x.png) / [x8](comparison/25-BG-0012-8x.png) |
| `BG-0013` | 69 | [212, 438, 223, 451] | `SKIPPED` | HZ-01, HZ-02, HZ-03, HZ-25, HZ-26 | Пропущен: на ×8 маска лежит на тонкой тёмной полосе, визуально неотличимой от тени/контура пряди; рядом есть AMBIGUOUS и CHARACTER_PIXEL, уверенно отделить фон от детали волос нельзя. | [x4](comparison/16-BG-0013-4x.png) / [x8](comparison/26-BG-0013-8x.png) |
| `BG-0017` | 54 | [630, 570, 637, 583] | `SKIPPED` | HZ-01, HZ-04, HZ-25, HZ-26 | Пропущен: микрокомпонент 54 px вплотную к высокоградиентной границе кожа/волосы; на контрастном фоне выглядит как точечное повреждение тёмной тени, контекст недостаточен. | [x4](comparison/17-BG-0017-4x.png) / [x8](comparison/27-BG-0017-8x.png) |
| `BG-0023` | 26 | [212, 572, 216, 579] | `SKIPPED` | HZ-01, HZ-03, HZ-25, HZ-26 | Пропущен: микрокомпонент 26 px на тёмной диагональной полосе рядом с кожей; при ×8 нельзя исключить принадлежность к теневому контуру пряди. | [x4](comparison/18-BG-0023-4x.png) / [x8](comparison/28-BG-0023-8x.png) |

**Очищено:** `BG-0003`, `BG-0006`, `BG-0007`, `BG-0008`, `BG-0011`, `BG-0012`. **Пропущено:** `BG-0013`, `BG-0017`, `BG-0023`. Удалённых пикселей: **1200** из 1349 кандидатов; пропущено **149** пикселей.

## 3. Проверка HZ-01…HZ-26

Карта пересекающихся HZ: [comparison/06-HZ-intersections-map.png](comparison/06-HZ-intersections-map.png). Пересечения вычислены по всем 26 прямоугольникам из E3.5 `ISSUE-MAP.json` и побайтово сверены с `hiddenZoneIds` B1.1. Пересекаются 10 зон: HZ-01, HZ-02, HZ-03, HZ-04, HZ-05, HZ-06, HZ-07, HZ-09, HZ-25, HZ-26; остальные 16 имеют 0 общих пикселей. Скрытая анатомия **не восстанавливалась**; все такие зоны остаются `NOT_RESTORED` и требуют отдельного разрешения.

| ID | Пересечения с непустым числом пикселей | HZ с нулём пикселей |
|---|---|---|
| `BG-0003` | HZ-02: 351 px, HZ-05: 191 px, HZ-07: 354 px, HZ-09: 354 px, HZ-25: 220 px | HZ-01, HZ-03, HZ-04, HZ-06, HZ-08, HZ-10, HZ-11, HZ-12, HZ-13, HZ-14, HZ-15, HZ-16, HZ-17, HZ-18, HZ-19, HZ-20, HZ-21, HZ-22, HZ-23, HZ-24, HZ-26 |
| `BG-0006` | HZ-02: 246 px, HZ-06: 246 px, HZ-09: 246 px, HZ-25: 168 px | HZ-01, HZ-03, HZ-04, HZ-05, HZ-07, HZ-08, HZ-10, HZ-11, HZ-12, HZ-13, HZ-14, HZ-15, HZ-16, HZ-17, HZ-18, HZ-19, HZ-20, HZ-21, HZ-22, HZ-23, HZ-24, HZ-26 |
| `BG-0007` | HZ-01: 198 px, HZ-02: 112 px, HZ-04: 198 px, HZ-25: 198 px, HZ-26: 198 px | HZ-03, HZ-05, HZ-06, HZ-07, HZ-08, HZ-09, HZ-10, HZ-11, HZ-12, HZ-13, HZ-14, HZ-15, HZ-16, HZ-17, HZ-18, HZ-19, HZ-20, HZ-21, HZ-22, HZ-23, HZ-24 |
| `BG-0008` | HZ-01: 192 px, HZ-02: 130 px, HZ-03: 192 px, HZ-25: 192 px, HZ-26: 192 px | HZ-04, HZ-05, HZ-06, HZ-07, HZ-08, HZ-09, HZ-10, HZ-11, HZ-12, HZ-13, HZ-14, HZ-15, HZ-16, HZ-17, HZ-18, HZ-19, HZ-20, HZ-21, HZ-22, HZ-23, HZ-24 |
| `BG-0011` | HZ-01: 114 px, HZ-02: 114 px, HZ-04: 114 px, HZ-25: 114 px, HZ-26: 114 px | HZ-03, HZ-05, HZ-06, HZ-07, HZ-08, HZ-09, HZ-10, HZ-11, HZ-12, HZ-13, HZ-14, HZ-15, HZ-16, HZ-17, HZ-18, HZ-19, HZ-20, HZ-21, HZ-22, HZ-23, HZ-24 |
| `BG-0012` | HZ-01: 96 px, HZ-03: 96 px, HZ-25: 96 px, HZ-26: 96 px | HZ-02, HZ-04, HZ-05, HZ-06, HZ-07, HZ-08, HZ-09, HZ-10, HZ-11, HZ-12, HZ-13, HZ-14, HZ-15, HZ-16, HZ-17, HZ-18, HZ-19, HZ-20, HZ-21, HZ-22, HZ-23, HZ-24 |
| `BG-0013` | HZ-01: 69 px, HZ-02: 69 px, HZ-03: 69 px, HZ-25: 69 px, HZ-26: 69 px | HZ-04, HZ-05, HZ-06, HZ-07, HZ-08, HZ-09, HZ-10, HZ-11, HZ-12, HZ-13, HZ-14, HZ-15, HZ-16, HZ-17, HZ-18, HZ-19, HZ-20, HZ-21, HZ-22, HZ-23, HZ-24 |
| `BG-0017` | HZ-01: 54 px, HZ-04: 54 px, HZ-25: 54 px, HZ-26: 54 px | HZ-02, HZ-03, HZ-05, HZ-06, HZ-07, HZ-08, HZ-09, HZ-10, HZ-11, HZ-12, HZ-13, HZ-14, HZ-15, HZ-16, HZ-17, HZ-18, HZ-19, HZ-20, HZ-21, HZ-22, HZ-23, HZ-24 |
| `BG-0023` | HZ-01: 26 px, HZ-03: 26 px, HZ-25: 26 px, HZ-26: 26 px | HZ-02, HZ-04, HZ-05, HZ-06, HZ-07, HZ-08, HZ-09, HZ-10, HZ-11, HZ-12, HZ-13, HZ-14, HZ-15, HZ-16, HZ-17, HZ-18, HZ-19, HZ-20, HZ-21, HZ-22, HZ-23, HZ-24 |

## 4. Метод и результат

Исходная копия: [work-cutout-before.png](work-cutout-before.png) — точная копия `work-cutout-after.png` из B1.2. Результат: [work-cutout-after.png](work-cutout-after.png). Для 1200 разрешённых координат alpha изменён **255 → 0**; RGB всего холста и все остальные RGBA-байты побайтово идентичны. Глобальные цветовые пороги, расширение масок, feather, AI, inpainting, cloning, generative fill, перерисовка и восстановление анатомии не применялись.

Маски: [approved-6-mask.png](masks/approved-6-mask.png), [skipped-3-mask.png](masks/skipped-3-mask.png), [all-9-mask.png](masks/all-9-mask.png), девять отдельных масок `masks/BG-*.png`, [alpha-before.png](masks/alpha-before.png), [alpha-after.png](masks/alpha-after.png), [alpha-delta.png](masks/alpha-delta.png).

Точный machine-readable перечень удалённых координат: [CHANGED-PIXELS.json](CHANGED-PIXELS.json). Канонический SHA256 списка: `c9d30823ce48ebec353283da9a8b84f99eb8894469c3685159f2e3564a6fceb5`.

### Построчный перечень удалённых координат

Формат `y: x0-x1, …`, границы включительные. Реконструкция побайтово совпадает с 1200 координатами шести компонентов.

### BG-0003 — 354 px, bbox [505, 172, 520, 233]

```text
y=172: 506
y=173: 506
y=174: 506
y=175: 505-506
y=176: 506
y=177: 506
y=178: 506, 508
y=179: 506, 508
y=180: 506-509
y=181: 506-509
y=182: 505-510
y=183: 505-511
y=184: 508-511
y=185: 507-511
y=186: 507-511
y=187: 507-511
y=188: 507-511
y=189: 507-512
y=190: 507-512
y=191: 507-513
y=192: 507-513
y=193: 506-513
y=194: 507-513
y=195: 507-513
y=196: 507-514
y=197: 507-514
y=198: 508-514
y=199: 508-514
y=200: 508-515
y=201: 509-515
y=202: 509-516
y=203: 509-515
y=204: 509-515
y=205: 511-516
y=206: 512-516
y=207: 512-515
y=208: 512-516
y=209: 512-517
y=210: 512-517
y=211: 512-518
y=212: 511-519
y=213: 512-519
y=214: 512-519
y=215: 512-519
y=216: 513-519
y=217: 513-519
y=218: 513-519
y=219: 513-519
y=220: 512-520
y=221: 512-520
y=222: 514-520
y=223: 513-520
y=224: 514-520
y=225: 514-520
y=226: 514-520
y=227: 515-520
y=228: 516-520
y=229: 516-520
y=230: 516-520
y=231: 516-520
y=232: 516, 518
y=233: 518
```

### BG-0006 — 246 px, bbox [326, 183, 339, 232]

```text
y=183: 338
y=184: 336-339
y=185: 336-338
y=186: 336-338
y=187: 336-338
y=188: 336-339
y=189: 335-339
y=190: 335-339
y=191: 335-339
y=192: 334-338
y=193: 334-338
y=194: 333-338
y=195: 333-337
y=196: 332-337
y=197: 332-337
y=198: 332-337
y=199: 332-337
y=200: 332-337
y=201: 331-337
y=202: 331-337
y=203: 332-335, 337
y=204: 330-335
y=205: 330, 332-336
y=206: 330-336
y=207: 330-336
y=208: 330-335
y=209: 329-335
y=210: 329-335
y=211: 328-335
y=212: 328-329
y=213: 328-329, 331-332
y=214: 328-332
y=215: 328-332
y=216: 328-332
y=217: 328-331
y=218: 328-331
y=219: 328-331
y=220: 328-332
y=221: 328-332
y=222: 327-331
y=223: 327-330
y=224: 327-331
y=225: 327-332
y=226: 327-331
y=227: 327-330
y=228: 327-330
y=229: 327-330
y=230: 326-330
y=231: 326-328
y=232: 327
```

### BG-0007 — 198 px, bbox [638, 462, 653, 489]

```text
y=462: 641-643
y=463: 641-644
y=464: 638-647
y=465: 639-647
y=466: 639-647
y=467: 640-647
y=468: 640-648
y=469: 640-649
y=470: 641-648
y=471: 641-650
y=472: 641-650
y=473: 644-650
y=474: 644-650
y=475: 644-651
y=476: 644-651
y=477: 644-651
y=478: 644-651
y=479: 644-652
y=480: 646-651
y=481: 647-652
y=482: 647-651
y=483: 647-651
y=484: 646-651
y=485: 647-652
y=486: 647-653
y=487: 647-652
y=488: 649-652
y=489: 649-650
```

### BG-0008 — 192 px, bbox [195, 453, 211, 487]

```text
y=453: 209-211
y=454: 209
y=455: 209-210
y=456: 206-209
y=457: 206-209
y=458: 205, 207
y=459: 205-208
y=460: 204-209
y=461: 204-209
y=462: 204-209
y=463: 204-209
y=464: 203-207, 209-210
y=465: 203-207, 209-210
y=466: 203-207, 209-210
y=467: 201-209
y=468: 200-209
y=469: 200-207
y=470: 199-206
y=471: 200-205
y=472: 200-203, 205
y=473: 199-205
y=474: 199-204
y=475: 199-204
y=476: 199-203
y=477: 199-203
y=478: 199-203
y=479: 199-203
y=480: 199-202
y=481: 199-202
y=482: 199-202
y=483: 199-202
y=484: 196-202
y=485: 195-201
y=486: 196-202
y=487: 196-200
```

### BG-0011 — 114 px, bbox [621, 433, 639, 457]

```text
y=433: 621-623
y=434: 621-622
y=435: 622
y=436: 622-623
y=437: 623-624
y=438: 624-625
y=439: 625-626
y=440: 624-626
y=441: 625-630
y=442: 625-626, 628, 630-632
y=443: 625, 627-631
y=444: 627-632
y=445: 628-633
y=446: 627-634
y=447: 628-635
y=448: 629-636
y=449: 629-636
y=450: 631-635
y=451: 631-635
y=452: 632-635
y=453: 633-637
y=454: 632-633, 636-638
y=455: 633, 636-639
y=456: 637-639
y=457: 637-639
```

### BG-0012 — 96 px, bbox [191, 487, 198, 517]

```text
y=487: 194
y=488: 194-195
y=489: 194
y=490: 194
y=491: 194
y=492: 193-194, 196-198
y=493: 193-198
y=494: 192-198
y=495: 193-197
y=496: 193-195
y=497: 193-197
y=498: 193-197
y=499: 193-196
y=500: 193-196
y=501: 193-196
y=502: 193-196
y=503: 193-195
y=504: 193-195
y=505: 192-195
y=506: 192-195
y=507: 192-194
y=508: 193-194
y=509: 193-194
y=510: 192-194
y=511: 192-194
y=512: 192-193
y=513: 192-193
y=514: 191-193
y=515: 192-193
y=516: 193
y=517: 193
```

## 5. Автоматические проверки

| Проверка | Результат |
|---|---|
| `changedOnlyApprovedCoordinates` | PASS |
| `rgbaOutsideChangedCoordinatesByteIdentical` | PASS |
| `rgbEntireCanvasByteIdentical` | PASS |
| `alphaCorrectAtChangedPixels` | PASS |
| `skippedComponentPixelsUnchanged` | PASS |
| `masksExactlyMatchB11Coordinates` | PASS |
| `masksWithinComponentBounds` | PASS |
| `noGlobalColourThreshold` | PASS |
| `noMaskExpansion` | PASS |
| `edgeFeatherApplied` | NOT APPLIED |
| `removedRgbEqualsSourceBackground` | PASS |
| `compositeOnIntendedBackgroundByteIdentical` | PASS |
| `sourceFrameRawEqualsWebpRaw` | PASS |
| `internalTransparentComponentsBefore` | 8 |
| `internalTransparentComponentsAfter` | 14 |
| `newExactInternalComponents` | 6 |
| `newInternalComponentsMatchApprovedMasks` | PASS |
| `unintendedHoles` | 0 |
| `connectedToPreExistingTransparent4Neighbours` | 0 |
| `connectedToExteriorTransparent4Neighbours` | 0 |
| `exteriorConnectedTransparentUnchanged` | PASS |
| `afterPngOpensWithoutErrors` | PASS |
| `allDiagnosticPngsOpenWithoutErrors` | PASS |
| `afterPngHasAlphaChannel` | PASS |
| `protectedFilesChecked` | 880 |
| `b12SnapshotMatchesPreflight` | PASS |
| `b11SnapshotMatchesPreflight` | PASS |
| `e35EmbeddedSnapshotMatches` | PASS |
| `hzIntersectionsVerifiedAgainstB11` | PASS |
| `aiGeneratedImages` | 0 |
| `inpaintingCloningGenerativeFill` | 0 |
| `hiddenAnatomyRestored` | 0 |
| `selfApproval` | NOT APPLIED |
| `technicalPassEqualsArtisticQuality` | NOT APPLIED |
| `approval` | NOT_APPROVED |

Отдельно: до/после композиция на целевом фоне `IMG_4038` **побайтово идентична**, поэтому цветовой каймы/ореола на целевом фоне нет. Внутренних прозрачных компонентов стало **14** = 4 исторических stage-04 + 4 B1.2 + 6 новых B1.3; непреднамеренных дыр **0**, связи с внешней прозрачной областью или прежними дырами **0**. `BG-0008` и `BG-0012` имеют только диагональное касание точных масок; маски не объединялись и не расширялись.

## 6. Диагностика и визуальный контроль

| Материал | Ссылка |
|---|---|
| Исходный кадр / B1.2 до / B1.3 после, 50% | [comparison/01-source-before-after.png](comparison/01-source-before-after.png) |
| Cutout до/после на шахматном фоне, 50% | [comparison/02-cutout-before-after.png](comparison/02-cutout-before-after.png) |
| Alpha до/после/delta | [comparison/03-alpha-before-after.png](comparison/03-alpha-before-after.png) |
| Оверлей изменённых и пропущенных пикселей | [comparison/04-changed-pixels-overlay.png](comparison/04-changed-pixels-overlay.png) |
| Тёмный / светлый / шахматный фон | [comparison/05-background-checks.png](comparison/05-background-checks.png) |
| Карта девяти компонентов | [comparison/00-nine-components-map.png](comparison/00-nine-components-map.png) |
| Карта HZ-пересечений | [comparison/06-HZ-intersections-map.png](comparison/06-HZ-intersections-map.png) |
| Все девять, ×4 | [comparison/30-visual-review-grid-4x.png](comparison/30-visual-review-grid-4x.png) |
| Все девять, ×8 | [comparison/31-visual-review-grid-8x.png](comparison/31-visual-review-grid-8x.png) |
| Каждый ID отдельно ×4/×8 | ссылки в таблице решений §2 и файлы `comparison/10-*`, `comparison/20-*` |
| Полный список диагностических PNG | [VERIFICATION.json → diagnosticImages](VERIFICATION.json) |

Просмотрены волосы, плечи, руки, кожа, одежда, тени, внешние/внутренние контуры и сглаженные края рядом со всеми девятью масками. Для шести очищенных компонентов просмотрены исходный кадр, оверлей B1.1, точные маски, композиции на шахматном/тёмном/светлом фоне и alpha до/после при ×4 и ×8. Волосы, кожа, одежда, контуры и сглаженные края рядом с масками не разрезаны; на целевом фоне IMG_4038 композиция побайтово идентична B1.2. На контрастном фоне сохранена ожидаемая 1 px ступенчатость бинарной alpha-маски; feather и расширение масок не применялись. Внутри нескольких новых прозрачных областей остаются единичные непрозрачные фоновые пиксели, не вошедшие в точную маску B1.1; они не изменялись и видны только на техническом фоне. У BG-0008 и BG-0012 есть одно диагональное касание точных масок; маски не объединялись. Три сомнительных микрокомпонента оставлены нетронутыми.

Визуальные дефекты, требующие отката: **не обнаружены**. Технические ограничения, перечисленные выше: 1 px ступенчатость на контрастном фоне, единичные непрозрачные фоновые островки внутри точных масок, диагональное касание двух масок и невосстановленные HZ-зоны.

## 7. SHA256

| Файл | SHA256 |
|---|---|
| [work-cutout-before.png](work-cutout-before.png) | 142ea49e03fab0b60e116851ddfd31331531bfa720c0ac5ea430b250030c4298 |
| [work-cutout-after.png](work-cutout-after.png) | 5bd23a22de6a52c304657d21e707309a0f106a57217bc753b4fbed1060d360db |
| [CHANGED-PIXELS.json](CHANGED-PIXELS.json) | ec8a23e3fce5b616f5d9f1618562d5a7c794e0a84df0e26070ef97b034671c9b |
| [PROTECTED-BASELINE.json](PROTECTED-BASELINE.json) | 6fe29d612d51dedc5bc2b84f93fba555edf67d5d1093b4fbc57e25ec867ee04f |
| [VERIFICATION.json](VERIFICATION.json) | 09f1248e736ff6138329d001bf8f1c0594b8c4048253d6b2cd00cd350164bd28 |
| [build_batch.py](build_batch.py) | 6ded6a7f6571eac70ac027a5f9a7a1847de87d073dbf598fe101316a4ccf7365 |
| B1.2 work-cutout-after.png | 142ea49e03fab0b60e116851ddfd31331531bfa720c0ac5ea430b250030c4298 |
| B1.1 COMPONENTS.json | afa99359a9a9e73c85274025348bc04c853c6b7465a6a8efb54f092b2efa16f1 |
| B1.2 CHANGED-PIXELS.json | 6e108716472eacac4dd68c75f6588b6303f7baca6849a03a1241130557b1fe11 |
| B1.2 build_cleanup.py | 685169ccd89cd8388dd3d8da01d36225807bf7c36e8d64534d0c0cca621ba01d |
| E3.5 ISSUE-MAP.json | 5ccb59f3421b1ebc02ed02e63676e488b86b822dfc8aea5bd13296b65713f7c2 |
| IMG_4038_rig-pose.webp | 477c64490b1e966109d8f68b815c4983a655373473fa2856d1a9ff57fd52dbf9 |

Все файлы папки, включая отчёт, перечислены в [SHA256SUMS.txt](SHA256SUMS.txt), кроме самого файла сумм.

## 8. Границы разрешения и STOP

- Очищено **6 / 9** компонентов, **1200 px**; пропущено **3 / 9**, **149 px**.
- Оригиналы WebP, stage-04, E1, E2, E2 V2, E3, E3.5, B1.1, B1.2, `public/`, `src/`, `dist/`, PixiJS, атлас, игровой код и PR не тронуты; защищённый снимок из 880 файлов совпал.
- `AMBIGUOUS`, `CHARACTER_PIXEL`, `ANTIALIAS_EDGE`, остальные компоненты и любые пиксели вне шести точных масок не изменялись.
- AI-генерация, inpainting, cloning, generative fill, художественная перерисовка, восстановление анатомии, новые слои: **0**. Vercel Preview/Production, B1.4, B2–B6, E4–E8 не запускались.
- Метод B1.2 технически безопасен для шести точных, индивидуально проверенных масок на копии и на целевом фоне. Это не художественное одобрение, не доказательство безопасности для пропущенных или любых других компонентов, не восстановление HZ-зон и не разрешение на следующую очистку. Технический PASS не равен художественному качеству; требуется визуальное подтверждение пользователя.

**СТОП.** Это только пакетный пилот девяти указанных компонентов. Жду визуального подтверждения пользователя. Без отдельного разрешения не перехожу к пропущенным `BG-0013`, `BG-0017`, `BG-0023`, другим компонентам, B2 или следующим стадиям.
