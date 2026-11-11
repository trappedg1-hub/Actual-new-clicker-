# B1.2 — Тестовая очистка 4 подтверждённых фоновых компонентов

**Статус:** `PILOT_ONLY / NOT_APPROVED`. Разрешение распространяется только на четыре `CONFIRMED_BACKGROUND` из B1.1 и только на копию `work-cutout.png`. Удаление или изменение любых других пикселей, alpha, слоёв, оригиналов, B1.1, кода и запуск следующих стадий не выполнялись.
**Ветка:** `arena/02869c32-actual-new-clicker`. **HEAD перед началом:** `737b2925afacfdd513f14fedc9597ae85d5f1b33`.

---

## 1. Проверка состояния перед началом

| Проверка | Результат |
|---|---|
| `git fetch origin arena/02869c32-actual-new-clicker` | выполнено |
| Локальный `HEAD` | `737b2925afacfdd513f14fedc9597ae85d5f1b33` |
| `origin/arena/02869c32-actual-new-clicker` | `737b2925afacfdd513f14fedc9597ae85d5f1b33` |
| GitHub API commit branch | `737b2925afacfdd513f14fedc9597ae85d5f1b33` |
| Родитель | `580ea91b68aecf0388331e51b4d1ddeddffe698a` (E3.5 → B1.1) |
| Рабочее дерево | чистое |
| B1.2 папка до начала | отсутствовала |
| Контрольные SHA256 | сохранены в [PROTECTED-BASELINE.json](PROTECTED-BASELINE.json) |
| `reset --hard`, `rebase`, `force push`, `amend` | не применялись |

Расхождений нет; работа продолжена. Защищённых файлов в снимке B1.1: **836**, изменённых **0**; SHA256 снимка `f786788a22e1c73e5ac7e35d1313f4f6ad7fb200a09e8866271a56fcfd191a3a`. Встроенный снимок E3.5 из 811 файлов также совпал: `998c2cbefb797eb31899ba33bf1722bc683071c739f6237d5b56591ba319969f`.

## 2. Источник, маски и метод

Источник координат и масок: [[COMPONENTS.json](../B1-BACKGROUND-CLASSIFICATION/COMPONENTS.json)](../B1-BACKGROUND-CLASSIFICATION/COMPONENTS.json) коммита B1.1. Исходная копия: [work-cutout-before.png](work-cutout-before.png); результат: [work-cutout-after.png](work-cutout-after.png). Технический кадр-фон: [comparison/source-frame.png](comparison/source-frame.png) (побайтовый RAW-декод совпадает с `IMG_4038_rig-pose.webp`).

Метод: для каждого из 3366 пикселей из `pixelCoordinates` четырёх компонентов alpha изменён **255 → 0**; RGB всего холста оставлен побайтово идентичным. Глобальные цветовые пороги, расширение масок, inpainting, cloning, generative fill, AI-генерация, перерисовка и восстановление анатомии не применялись. Локальное сглаживание края **не применялось**: все удаляемые пиксели имели alpha=255 и RGB, побайтово равный фону `IMG_4038` в тех же координатах, а все 920 четырёхсоседних пикселей сразу вне масок полностью непрозрачны. Полупрозрачный край создал бы новые значения alpha 1…254 внутри маски и потенциальный ореол на контрастном фоне, не улучшая композицию на целевом фоне.

### Обработанные компоненты

| ID | Px | Bbox | Слой B1.1 | Alpha | Маска | x4 | x8 |
|---|---|---|---|---|---|---|---|
| BG-0001 | 1402 | [579,347–635,418] | outfit_blouse | 255 → 0 | [mask](masks/BG-0001.png) | [x4](comparison/10-BG-0001-4x.png) | [x8](comparison/14-BG-0001-8x.png) |
| BG-0002 | 1337 | [214,348–271,415] | outfit_blouse | 255 → 0 | [mask](masks/BG-0002.png) | [x4](comparison/11-BG-0002-4x.png) | [x8](comparison/15-BG-0002-8x.png) |
| BG-0004 | 339 | [568,560–586,608] | outfit_skirt_02 | 255 → 0 | [mask](masks/BG-0004.png) | [x4](comparison/12-BG-0004-4x.png) | [x8](comparison/16-BG-0004-8x.png) |
| BG-0005 | 288 | [307,506–318,553] | outfit_skirt_01 | 255 → 0 | [mask](masks/BG-0005.png) | [x4](comparison/13-BG-0005-4x.png) | [x8](comparison/17-BG-0005-8x.png) |

Все **4 компонента / 3366 px** обработаны; ни один не оставлен нетронутым, потому что после ×4/×8 проверки риска повреждения рисунка не обнаружено. Маски: [BG-0001](masks/BG-0001.png), [BG-0002](masks/BG-0002.png), [BG-0004](masks/BG-0004.png), [BG-0005](masks/BG-0005.png) и объединённая [confirmed-4-mask.png](masks/confirmed-4-mask.png).

## 3. Точный перечень изменённых пикселей

Полный machine-readable перечень с координатами, alpha до/после, RGB до/после и RGB исходного кадра: [CHANGED-PIXELS.json](CHANGED-PIXELS.json). Канонический SHA256 списка: `dfefa4bfa935e2c3756b5f3ffbc1d85b6d5998317c2d05b7f9440645bb8ac254`. Ниже — точная построчная запись диапазонов `x` для каждой строки `y`; формат `y: x0-x1, …`, границы включительные. Реконструкция из этой записи побайтово совпадает с 3366 координатами `COMPONENTS.json`.

### BG-0001 — 1402 px, bbox [579, 347, 635, 418]

```text
y=347: 581-582
y=348: 581-586
y=349: 581-587
y=350: 580-587
y=351: 580-589
y=352: 580-590
y=353: 579-592, 594-595
y=354: 579-594
y=355: 580-596
y=356: 581-598
y=357: 581-599
y=358: 582-600
y=359: 583-602
y=360: 584-604, 606
y=361: 584-606
y=362: 584-603, 605-606
y=363: 584-608
y=364: 585-608
y=365: 586, 588-609
y=366: 588-610
y=367: 589, 591-613
y=368: 589, 591-614
y=369: 592-615
y=370: 591-617
y=371: 591-615
y=372: 593-620
y=373: 593-619
y=374: 593-620
y=375: 593-623
y=376: 595-624
y=377: 595-625
y=378: 596-624
y=379: 597-624
y=380: 598, 600-627
y=381: 599-627
y=382: 599-627
y=383: 600-627
y=384: 600-601, 603-627
y=385: 600-601, 603-627
y=386: 602-627
y=387: 604-629
y=388: 603-629
y=389: 603, 605-630
y=390: 606-631
y=391: 607-631
y=392: 608-631
y=393: 608-631
y=394: 609-633
y=395: 609-632
y=396: 610-632
y=397: 611-632
y=398: 612-632
y=399: 612-632
y=400: 616-633
y=401: 616-633
y=402: 616-633
y=403: 616-634
y=404: 618-634
y=405: 623-634
y=406: 624-634
y=407: 624-635
y=408: 624-635
y=409: 624-635
y=410: 625-635
y=411: 626-635
y=412: 627-635
y=413: 628-635
y=414: 629-635
y=415: 630-634
y=416: 632-634
y=417: 633
y=418: 633
```

### BG-0002 — 1337 px, bbox [214, 348, 271, 415]

```text
y=348: 268-271
y=349: 266-271
y=350: 261-271
y=351: 259-260, 262-271
y=352: 256-267, 270
y=353: 256-269
y=354: 255-267
y=355: 256-268
y=356: 254-267
y=357: 252-267
y=358: 249-267
y=359: 249, 251-267
y=360: 247-263, 265
y=361: 246-265
y=362: 246-263, 265
y=363: 245-263
y=364: 239, 246-262
y=365: 236, 239, 246-260, 262-263
y=366: 235-239, 241-260, 262
y=367: 236-262
y=368: 233-260
y=369: 232-261
y=370: 231-259
y=371: 230-259
y=372: 228-256, 258-259
y=373: 228-255
y=374: 228-255
y=375: 227-254
y=376: 224-253
y=377: 223-253
y=378: 224-252
y=379: 223-251
y=380: 224-250
y=381: 223-249
y=382: 223-249
y=383: 223-248
y=384: 222-247
y=385: 223-247
y=386: 223-246
y=387: 222-246
y=388: 221-243
y=389: 221-243
y=390: 221-244
y=391: 217-218, 220-243
y=392: 218-243
y=393: 218-240
y=394: 218-241
y=395: 218-240
y=396: 218-239
y=397: 218-236
y=398: 216-236
y=399: 217-235
y=400: 218-236
y=401: 215, 218-233
y=402: 215-232
y=403: 215-232
y=404: 215-227, 229-230
y=405: 215-229
y=406: 215-228
y=407: 215-227
y=408: 215-226
y=409: 214-224
y=410: 214-223
y=411: 215-222
y=412: 216-219, 221
y=413: 216-219
y=414: 216-219
y=415: 215-218
```

### BG-0004 — 339 px, bbox [568, 560, 586, 608]

```text
y=560: 585
y=561: 585
y=562: 585
y=563: 583-586
y=564: 584-586
y=565: 584-586
y=566: 584-586
y=567: 584-586
y=568: 583-586
y=569: 583-586
y=570: 583-586
y=571: 582-586
y=572: 583-586
y=573: 582-586
y=574: 582-586
y=575: 582-586
y=576: 582-586
y=577: 582-586
y=578: 581-586
y=579: 581-586
y=580: 581-586
y=581: 580-586
y=582: 580-586
y=583: 580-586
y=584: 580-586
y=585: 579-585
y=586: 578-584
y=587: 578-583
y=588: 578-583
y=589: 578-584
y=590: 577-584
y=591: 576-584
y=592: 576-584
y=593: 575-584
y=594: 574-583
y=595: 573-583
y=596: 572-579, 581-582
y=597: 572-583
y=598: 572-582
y=599: 571-581
y=600: 572-580
y=601: 571-580
y=602: 569, 571-580
y=603: 569, 571-580
y=604: 568-579
y=605: 568-579
y=606: 568-579
y=607: 568-579
y=608: 572-576
```

### BG-0005 — 288 px, bbox [307, 506, 318, 553]

```text
y=506: 311
y=507: 309, 311
y=508: 309-311
y=509: 309-311
y=510: 309-311
y=511: 309-311
y=512: 308-311
y=513: 308-311
y=514: 308-311
y=515: 308-311
y=516: 308-311
y=517: 308-311
y=518: 308-311
y=519: 308-312
y=520: 307-312
y=521: 307-312
y=522: 307-312
y=523: 307-312
y=524: 307-313
y=525: 307-313
y=526: 307-313
y=527: 307-313
y=528: 307-313
y=529: 307-314
y=530: 307-314
y=531: 307-315
y=532: 307-315
y=533: 307-315
y=534: 307-316
y=535: 307-315
y=536: 307-315
y=537: 307-317
y=538: 307-316
y=539: 307-316, 318
y=540: 308-318
y=541: 308-315, 317
y=542: 308-317
y=543: 308-316
y=544: 308-316
y=545: 308-316
y=546: 308-315
y=547: 309-311, 313-315
y=548: 309
y=549: 309
y=550: 309
y=551: 309
y=552: 309
y=553: 308-309
```

## 4. Автоматические проверки

| Проверка | Результат |
|---|---|
| preflightHeadOriginGithubMatch | PASS |
| preflightWorktreeClean | PASS |
| headBeforeB12 | 737b2925afacfdd513f14fedc9597ae85d5f1b33 |
| onlyFourConfirmedComponentsProcessed | PASS |
| skippedComponents | 0 |
| totalPixelsProcessed | 3366 |
| pixelsFullyRemoved | 3366 |
| alphaBeforeAtChangedPixels | 255 |
| alphaAfterAtChangedPixels | 0 |
| noGlobalColourThreshold | PASS |
| noMaskExpansion | PASS |
| edgeFeatherApplied | FAIL |
| edgeFeatherReason | Все 3366 пикселей маски имеют alpha=255, их RGB побайтово равен IMG_4038 в тех же координатах, а все 920 четырёхсоседних пикселей сразу вне масок полностью непрозрачны. На целевом фоне композиция до/после побайтово идентична. Однопиксельный feather оставил бы полупрозрачные фоноподобные пиксели внутри маски, уменьшил бы точное удаление и создал риск ореола на контрастном фоне; поэтому он не применялся. |
| changedOnlyAllowedCoordinates | PASS |
| rgbaOutsideChangedCoordinatesByteIdentical | PASS |
| rgbEntireCanvasByteIdentical | PASS |
| alphaOutsideChangedCoordinatesByteIdentical | PASS |
| masksExactlyMatchComponentCoordinates | PASS |
| maskBboxesMatchB11 | PASS |
| masksDoNotOverlap | PASS |
| alphaCorrectAtChangedPixels | PASS |
| noNewSemiTransparentPixelsOutsideMasks | PASS |
| semiTransparentOutsideMasksBefore | 29426 |
| semiTransparentOutsideMasksAfter | 29426 |
| removedRgbEqualsSourceBackground | PASS |
| adjacentContourPixelsUnchanged | PASS |
| compositeOnIntendedBackgroundByteIdentical | PASS |
| internalTransparentComponentsBefore | 4 |
| internalTransparentComponentsAfter | 8 |
| newInternalTransparentPixels | 3366 |
| unintendedHoles | 0 |
| newInternalComponentsMatchMasks | PASS |
| exteriorConnectedTransparentUnchanged | PASS |
| protectedFilesChecked | 836 |
| protectedFilesChanged | 0 |
| b11ProtectedSnapshotSHA256 | f786788a22e1c73e5ac7e35d1313f4f6ad7fb200a09e8866271a56fcfd191a3a |
| b11ProtectedSnapshotMatchesPreflight | PASS |
| e35EmbeddedSnapshotMatches | PASS |
| sourceFramePngRawEqualsWebpRaw | PASS |
| beforeCopyEqualsOriginalWorkCutout | PASS |
| afterPngOpensWithoutErrors | PASS |
| allDiagnosticPngsOpenWithoutErrors | PASS |
| afterPngHasAlphaChannel | PASS |
| rowRunEncodingExact | PASS |
| changedPixelListSha256 | dfefa4bfa935e2c3756b5f3ffbc1d85b6d5998317c2d05b7f9440645bb8ac254 |
| aiGeneratedImages | 0 |
| inpaintingCloningGenerativeFill | 0 |
| hiddenAnatomyRestored | 0 |
| newArtLayers | 0 |
| originalWebpE1E2E2V2E3E35B11Changed | FAIL |
| likelyBackgroundOrAmbiguousOrCharacterOrAntialiasProcessed | FAIL |
| codePixiJSAtlasPublicSrcDistPRChanged | FAIL |
| vercelPreviewOrProduction | FAIL |
| b2ToB6OrE4ToE8Started | FAIL |
| b13OrFurtherCleanupStarted | FAIL |
| selfApproval | FAIL |
| residualDefectsWaived | FAIL |
| technicalPassEqualsArtisticQuality | FAIL |
| approval | NOT_APPROVED |

Отдельно: до/после композиция на целевом фоне `IMG_4038` **побайтово идентична** (`compositeOnIntendedBackgroundByteIdentical=true`), поэтому цветовой каймы/ореола/видимой ступенчатости на целевом фоне нет. Непреднамеренных дыр: **0**; внутренних прозрачных компонентов стало **8** = 4 исторических stage-04 + 4 новых, и новые множества пикселей точно равны четырём маскам. Связная с краем холста прозрачная область не изменилась.

## 5. Диагностические материалы и визуальная проверка

| Требование | Файл |
|---|---|
| Исходник и результат рядом, общий вид 1:1 | [comparison/00-source-vs-result-1x.png](comparison/00-source-vs-result-1x.png) |
| Cutout до/после 1:1 на шахматном фоне | [comparison/01-cutout-before-after-1x.png](comparison/01-cutout-before-after-1x.png) |
| Альфа-канал до и после | [comparison/02-alpha-before-after.png](comparison/02-alpha-before-after.png); [masks/alpha-before.png](masks/alpha-before.png); [masks/alpha-after.png](masks/alpha-after.png) |
| Оверлей изменённых пикселей | [comparison/03-changed-pixels-overlay.png](comparison/03-changed-pixels-overlay.png); [comparison/03-overlay-with-header.png](comparison/03-overlay-with-header.png) |
| Тёмный / светлый / шахматный фон | [comparison/04-background-checks.png](comparison/04-background-checks.png) |
| Каждый компонент отдельно, ×4 и ×8 | [BG-0001 x4](comparison/10-BG-0001-4x.png); [BG-0001 x8](comparison/14-BG-0001-8x.png); [BG-0002 x4](comparison/11-BG-0002-4x.png); [BG-0002 x8](comparison/15-BG-0002-8x.png); [BG-0004 x4](comparison/12-BG-0004-4x.png); [BG-0004 x8](comparison/16-BG-0004-8x.png); [BG-0005 x4](comparison/13-BG-0005-4x.png); [BG-0005 x8](comparison/17-BG-0005-8x.png) |
| Визуальный контроль волос, плеч, одежды, кожи, контуров, краёв, ×8 | [comparison/19-visual-defect-review-8x.png](comparison/19-visual-defect-review-8x.png) |
| Маски и delta alpha | [masks/confirmed-4-mask.png](masks/confirmed-4-mask.png); [masks/alpha-delta.png](masks/alpha-delta.png) |

Просмотрены крупные планы волос/плеч/рук, складок юбки, кожи, внешних и внутренних контуров и сглаженных краёв рядом с четырьмя удалёнными областями. Визуальные дефекты, требующие отката: **не обнаружены**. На целевом фоне IMG_4038 композиции до/после побайтово идентичны; ореолов, цветовой каймы, повреждения контуров, непреднамеренных дыр и видимой ступенчатости не обнаружено. На контрастном/шахматном фоне при ×8 видна дискретная граница 1 px новой бинарной alpha-маски; это ожидаемое свойство точного покомпонентного удаления, а не дефект рисунка или цветовой ореол.

Полный список диагностических PNG: [VERIFICATION.json → diagnosticImages](VERIFICATION.json).

## 6. SHA256

| Файл | SHA256 |
|---|---|
| [work-cutout-before.png](work-cutout-before.png) | bb6dd0ef7af83a16cdc4258f60517eb1a13001c4f981f8506170afecffe05b4e |
| [work-cutout-after.png](work-cutout-after.png) | 142ea49e03fab0b60e116851ddfd31331531bfa720c0ac5ea430b250030c4298 |
| [CHANGED-PIXELS.json](CHANGED-PIXELS.json) | 6e108716472eacac4dd68c75f6588b6303f7baca6849a03a1241130557b1fe11 |
| [PROTECTED-BASELINE.json](PROTECTED-BASELINE.json) | 0aa6374460fe29856cdc617488f894b7403a5a8f692b6c3354eacb679381a31e |
| [VERIFICATION.json](VERIFICATION.json) | 8dd5f04623f2da7cdf3490462173aa9ce519f6cde738e6f1bb437902de3ea78a |
| [build_cleanup.py](build_cleanup.py) | 685169ccd89cd8388dd3d8da01d36225807bf7c36e8d64534d0c0cca621ba01d |
| [mask BG-0001](masks/BG-0001.png) | 42f60f6fdd6e35e01c379a099c758b36b19a05088f30e89b1495626a8937ea3a |
| [mask BG-0002](masks/BG-0002.png) | a13dc32ac35b5ebe18730e804adda6854677907b8faf59ff6895532b12c0526f |
| [mask BG-0004](masks/BG-0004.png) | 6d15cf45ba4ed95927e7ab7f169de904f248497bc2ea60e5e7eb5109a9692124 |
| [mask BG-0005](masks/BG-0005.png) | d2f0630692e25e5c2161a13a6f0040eaba9510b9165b38ec49c2a0fbaeb111fb |
| stage-04 work-cutout.png | bb6dd0ef7af83a16cdc4258f60517eb1a13001c4f981f8506170afecffe05b4e |
| IMG_4038_rig-pose.webp | 477c64490b1e966109d8f68b815c4983a655373473fa2856d1a9ff57fd52dbf9 |
| B1.1 COMPONENTS.json | afa99359a9a9e73c85274025348bc04c853c6b7465a6a8efb54f092b2efa16f1 |
| B1.1 CLASSIFICATION-SUMMARY.json | af7f78ca17a18c8e4b46920abc649955bd1d3482cdca2b67e60b0f2136b379f0 |
| E3.5 ISSUE-MAP.json | 5ccb59f3421b1ebc02ed02e63676e488b86b822dfc8aea5bd13296b65713f7c2 |

Все файлы папки, включая этот отчёт, перечислены в [SHA256SUMS.txt](SHA256SUMS.txt) (кроме самого файла сумм).

## 7. Сохранность, границы разрешения и STOP

- Изменено пикселей/alpha только в копии: **3366 / 3366**; все остальные RGBA побайтово идентичны.
- Оригиналы WebP, stage-04, E1, E2, E2 V2, E3, E3.5, B1.1, `public/`, `src/`, `dist/`, PixiJS, атлас, PR #3 не тронуты; защищённый снимок 836 файлов совпал.
- `BG-0003`, остальные 9 `LIKELY_BACKGROUND`, все `AMBIGUOUS`, `CHARACTER_PIXEL`, `ANTIALIAS_EDGE` и любые другие пиксели не обработаны.
- AI-генерация, inpainting, cloning, generative fill, художественная перерисовка, восстановление анатомии, новые слои: **0**. Vercel Preview/Production, B1.3, B2–B6, E4–E8 не запускались.
- Технический PASS не объявлен художественным качеством; самоодобрения нет; остаточные дефекты E2/E3/E3.5 не списаны; скрытые зоны не восстановлены; настоящие поворот/деформация/иерархическая анимация не проверены.

### Заключение о методе

Метод безопасен для этих четырёх точных компонентов на копии: меняется только их alpha, каждый байт RGB сохранён, на целевом фоне результат визуально неотличим. Это НЕ автоматическое одобрение и не доказанная безопасность для BG-0003, остальных LIKELY_BACKGROUND, AMBIGUOUS или следующих стадий; любая дальнейшая очистка требует отдельного визуального подтверждения и разрешения пользователя.

**СТОП.** Это только пилот четырёх компонентов. Жду визуального подтверждения пользователя. Без отдельного разрешения не перехожу к `BG-0003`, другим `LIKELY_BACKGROUND`, B2 или следующим стадиям.
