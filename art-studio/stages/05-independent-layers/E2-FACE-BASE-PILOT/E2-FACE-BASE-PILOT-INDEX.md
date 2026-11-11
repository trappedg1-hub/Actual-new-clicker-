# E2 / FACE BASE PILOT — галерея визуальной проверки

Пилот только для `eye_l_closed-B`. Решение `9c2dd18` закрыто и не пересматривалось.
Все файлы — копии или результаты, сохранённые внутри этой папки.

## Главные материалы

| Что | Файл |
|---|---|
| Технический отчёт | [E2-FACE-BASE-PILOT-REPORT.md](E2-FACE-BASE-PILOT-REPORT.md) |
| Метрики (JSON) | [E2-face-base-pilot.json](E2-face-base-pilot.json) |
| Исходный фрагмент | [00-source-fragment.png](00-source-fragment.png) |
| Чистая база (весь кадр, 848×1264) | [01-clean-base.png](01-clean-base.png) |
| Маска (весь кадр, gray) | [02-mask-eye_l_closed-B.png](02-mask-eye_l_closed-B.png) |
| Элемент с новой альфой (RGBA) | [02-masked-element-eye_l_closed-B.png](02-masked-element-eye_l_closed-B.png) |
| **Оверлей, натуральная величина** | [03-overlay-full.png](03-overlay-full.png) |
| Оверлей, лицо 1:1 | [03-overlay-face-1x.png](03-overlay-face-1x.png) |
| Оверлей, лицо ×4 | [03-overlay-face-4x.png](03-overlay-face-4x.png) |
| **Оверлей, глаз ×8** | [03-overlay-zoom-8x.png](03-overlay-zoom-8x.png) |
| Маска ×8 | [02-mask-zoom-8x.png](02-mask-zoom-8x.png) |

## Листы сравнения

| Лист | Содержание |
|---|---|
| [04-comparison-full-size.png](comparison/04-comparison-full-size.png) | A ORIGINAL / B PILOT, 848×1264 без масштабирования |
| [04-comparison-face.png](comparison/04-comparison-face.png) | A исходник · B чистая база · C опубликованный E2 · D пилот, лицо ×4 |
| [04-comparison-zoom.png](comparison/04-comparison-zoom.png) | те же 4 панели, глаз ×8 |
| [05-mask-and-protection.png](comparison/05-mask-and-protection.png) | маска ×8 + карта защитных зон |
| [05-protection-map.png](comparison/05-protection-map.png) | зелёное = защищено и побайтово идентично, красное = линза маски |

Отдельные панели: [original-face-4x](comparison/original-face-4x.png),
[clean-base-face-4x](comparison/clean-base-face-4x.png),
[published-E2-face-4x](comparison/published-E2-face-4x.png),
[pilot-face-4x](comparison/pilot-face-4x.png),
[original-zoom-8x](comparison/original-zoom-8x.png),
[clean-base-zoom-8x](comparison/clean-base-zoom-8x.png),
[published-E2-zoom-8x](comparison/published-E2-zoom-8x.png),
[pilot-zoom-8x](comparison/pilot-zoom-8x.png).

## Отклонённый вариант (дефект показан, не спрятан)

| Файл | Что |
|---|---|
| [mask-stroke-only-REJECTED.png](variants/mask-stroke-only-REJECTED.png) | маска «только штрихи» |
| [masked-element-stroke-only-REJECTED.png](variants/masked-element-stroke-only-REJECTED.png) | элемент с этой маской |
| [overlay-stroke-only-REJECTED.png](variants/overlay-stroke-only-REJECTED.png) | оверлей |
| [overlay-stroke-only-REJECTED-zoom-8x.png](variants/overlay-stroke-only-REJECTED-zoom-8x.png) | ×8: видна плоская заплатка кожи |
| [mask-stroke-only-REJECTED-zoom-8x.png](variants/mask-stroke-only-REJECTED-zoom-8x.png) | маска ×8 |
| [README.md](variants/README.md) | причина отказа |

## Копии исходников (только чтение)

[source-frame.webp](source-frame.webp) ·
[element-eye_l_closed-B.png](element-eye_l_closed-B.png) ·
[e1-layer-14_eye_l_open.png](e1-layer-14_eye_l_open.png) ·
[layer-map-reference.json](layer-map-reference.json) ·
[00-e2-existing-overlay.png](00-e2-existing-overlay.png) ·
[00-e2-overlay-full.png](00-e2-overlay-full.png)

## Воспроизводимость

[build_pilot.py](build_pilot.py) · [build_comparison.py](build_comparison.py)

Генеративный ИИ, inpainting и generative fill не применялись.
Оригиналы, E1, `E2-facial-states/`, stage 04, код, атлас, PR #3, Vercel и
Production не изменялись.
