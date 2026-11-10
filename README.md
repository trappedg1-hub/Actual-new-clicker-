# Anime Fanservice Clicker — Vertical Slice v0.1

A mobile-first browser prototype scaffolded from the official PixiJS Create Vite/TypeScript template (`create-pixi.js@1.4.0`). The slice demonstrates a renderer-independent clicker domain, a technical layered HEROINE-01 placeholder, per-zone tap reactions, affection, one passive-income upgrade, a two-choice InkJS scene, and versioned IndexedDB save/resume with capped offline progress.

## Requirements and run

- Node.js 22.12+
- npm

```sh
npm install
npm run dev
```

The Vite server binds to `0.0.0.0` for preview hosting. The `.ink` source is compiled before the dev server starts.

## Validation commands

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm ls pixi.js
```

`npm test` compiles Ink source and runs the Node test suite. `npm run build` runs that suite, lint, strict TypeScript checking, and the Vite production build.

## Architecture

- `src/domain` contains separate economy, affection, upgrade, progression, unlock and save-state rules; it does not depend on PixiJS.
- `src/simulation` applies elapsed active time and capped offline time independently of renderer frames. Currency precision is retained between ticks to avoid frame-rate-dependent income.
- `src/heroine` owns a technical vector-layer rig, idle motion and zone-specific reactions. The head/hair/body/arms are independent hit targets.
- `src/narrative` adapts the compiled InkJS story to the game session. InkJS is lazy-loaded when the dialogue opens.
- `src/persistence` validates the schema, preserves recovery backups, serializes IndexedDB writes and provides a JSON export.
- `src/presentation` owns Pixi HUD/panels/navigation/feedback and a small DOM live region.

The screen has a responsive portrait/landscape layout, safe-area CSS, a 44–48 CSS-pixel primary control target where the narrow viewport allows it, one available home section and five disabled navigation placeholders. No Service Worker or browser-side localhost API is used.

## Dependencies and compatibility

| Package          | Resolved version | Role                              |
| ---------------- | ---------------: | --------------------------------- |
| `pixi.js`        |           8.22.0 | Renderer and scene graph          |
| `pixijs-actions` |            1.5.0 | Idle and tap motion               |
| `@pixi/ui`       |            2.4.1 | Button and progress UI primitives |
| `@pixi/layout`   |            3.2.1 | Container layout                  |
| `yoga-layout`    |            3.2.1 | Layout peer for `@pixi/layout`    |
| `inkjs`          |            2.4.0 | Dialogue runtime                  |
| `typescript`     |            5.7.3 | Strict TypeScript                 |
| `vite`           |            6.4.6 | Dev server and build              |

The checked peer ranges accept Pixi 8.22.0: `pixijs-actions` supports Pixi `^8`, `@pixi/ui` requires `^8.6.2`, and `@pixi/layout` requires Pixi `^8` plus Yoga `^3`; npm resolves one deduped PixiJS version. `@pixi/layout` declares `@pixi/react` as an optional dependency, which npm includes in the install tree; game code does not import React or `@pixi/react` and its UI is Pixi-native. `pixi-scrollbox` is omitted because this slice has no long list to scroll and it would add a `pixi-viewport` peer.

## Assets and art status

There is no approved heroine artwork in the repository. HEROINE-01 is explicitly a technical placeholder made from Pixi vector geometry and text; it is not final character art. No external images, font downloads, or other character assets are bundled. Replace it only with approved layered art.

## Local verification record — 2026-11-10

Environment: Node.js `v22.22.3`, npm `10.9.8`.

- `npm run build` — **passed**: Ink compile, 7/7 Node tests, ESLint, strict `tsc --noEmit`, and Vite production build.
- Domain tests cover separate tap currency/affection, frame-rate-independent active income, the eight-hour offline cap, clock rollback/high-water behavior, upgrade affordability/unlock, migration normalization, and Ink choices/state restoration.
- Vite HTTP smoke check — **passed** for `/`, transformed `/src/main.ts` and `MainScene`, compiled Ink JSON, and `/style.css`; a representative `*.e2b.app` Host was accepted and an unlisted host returned 403.
- Production dependency audit (`npm audit --omit=dev`) — **0 findings**. Full audit — **7 moderate findings**, all in the development lint/parser dependency chain (`typescript-eslint` / `minimatch`); 0 high and 0 critical. These dev-tool findings remain unresolved.
- Production bundle — passed. The main JavaScript chunk is 532.02 kB raw / 175.91 kB gzip and Ink is lazy-loaded as a 130.05 kB / 32.71 kB gzip chunk. Vite still emits its >500 kB raw-chunk advisory; further bundle optimization is a follow-up.
- No interactive browser execution, browser emulation, or physical iPhone test was run. The HTTP smoke check does not verify rendering, touch behavior, or IndexedDB in a browser.
