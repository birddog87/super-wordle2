# Design System — Wordle Upgrade

Concept: **a well-made physical toy on a dim table**. Dark, green-tinted surfaces; recessed sockets and raised keycaps; motion that decelerates, never bounces.

## Color tokens (style.css `:root`, hex fallback + OKLCH override)

| Token | Value | Role |
|---|---|---|
| `--bg-deep` | `oklch(0.16 0.012 140)` | Page base, input wells |
| `--bg` | `oklch(0.19 0.014 140)` | Radial glow center (body background) |
| `--surface` | `oklch(0.235 0.016 140)` | Modals, mode switch track |
| `--surface-high` | `oklch(0.285 0.018 140)` | Buttons, switch thumb, toasts, dist bars |
| `--border` / `--border-strong` | `oklch(0.35/0.46 0.02 140)` | Hairlines / filled-tile borders |
| `--fg` / `--fg-muted` / `--fg-faint` | `oklch(0.965/0.78/0.63 ~0.01 130)` | Text hierarchy |
| `--correct` / `--present` / `--absent` | `#538d4e` / `#b59f3b` / `#3a3e37` | Game semantics — never change |
| high-contrast | `#f5793a` / `#85c0f9` | Colour-blind alternative (class on `<html>`) |
| `--key-bg` / `--key-edge` | `oklch(0.58/0.42 0.02 135)` | Keycap face / bottom edge |
| `--accent` | `#57a94f` | Primary actions, focus rings, caret pulse |
| `--ember` | `oklch(0.74 0.14 60)` | Streak flame only |

All neutrals are tinted toward hue 140 (brand green). Never `#000`/`#fff`.

## Physicality rules

- **Empty tile** = recessed socket: darker than page, `inset 0 2px 4px` shadow, 1.5px hairline border, 4px radius.
- **Revealed tile** = raised: semantic color fill, `0 2px 6px` drop shadow.
- **Keycap**: subtle top-light gradient, `0 2.5px 0 var(--key-edge)` hard bottom edge + soft shadow. Press = `translateY(2.5px)` and the edge collapses to 0. Colored keys recolor the edge via `color-mix(... 55%, black)`.
- **Caret**: the tile awaiting input pulses its border toward accent (2.2s, disabled under reduced motion).

## Type

System sans stack for all UI. Exception: `#word-definition` uses Georgia/serif (dictionary character). Numbers are `font-variant-numeric: tabular-nums` everywhere they update (streak, countdown, stats, context line).

## Motion

`--ease-out-quart/quint/expo` only; no bounce/elastic. Page load: one short staggered rise. Modal in: 340ms expo. Flip reveal: 500ms per tile, 300ms stagger. Guess-distribution bars reveal via `clip-path` (not width). Everything respects `prefers-reduced-motion`.

## Surfaces

- **Main screen**: header (wordmark, streak ember pill, 3 icon buttons) → segmented mode switch (sliding thumb via `data-active` + `--mode-index`) → context line → board → keyboard. Nothing else.
- **Modals**: ≤600px = bottom sheets (drag-handle pseudo, top-only radius, slide-up); >600px = centered dialogs. Primary action = `.modal-button` (accent); quiet action = `.text-button`.
- **Landscape ≤520px tall**: `main` flexes board and keyboard side by side; tile size capped by `100dvh` budget.

## Constraints (unchanged)

Vanilla HTML/CSS/JS, no build step. Single script.js IIFE, single style.css. PWA offline (bump `CACHE_NAME` in service-worker.js on every asset change). Gameplay identical to Wordle. CDN deps: Firebase 8.x, canvas-confetti only.
