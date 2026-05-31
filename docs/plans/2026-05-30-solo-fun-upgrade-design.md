# Wordle Upgrade — Solo-Fun & Mobile Upgrade

**Date:** 2026-05-30
**Goal (user's words):** "play this by myself and just have fun… don't want stale words or weird words… work on mobile."

## Problems found in audit

1. **Reward loop locked behind login.** Stats, streaks, achievements, and guess history all bail out when `state.userId` is null. A logged-out solo player gets a permanently-zero streak and no tracking.
2. **Word list too small + dual-purpose.** 668×5 / 595×6 words used as *both* answers and the guess validator. Common words (`crane`, `slate`, `pizza`, `mango`) were rejected as "Not in word list." Daily word = `seed % 668` → repeats on a fixed cycle.
3. **Mobile gaps.** `viewport-fit=cover` set but safe-area insets unused; double-tap-zoom / 300ms tap delay; 6-letter board cramped; empty PWA `icons` array.
4. **No save/resume**, no "Play Again", no hard mode, stats chart is generic rather than the satisfying guess histogram.

## Decisions (confirmed with user)

- **Words:** two-list system like NYT Wordle. Curated common answers + large guess dictionary. Built by `tools/build-wordlists.sh`.
  - `answers_5` 2,315 · `guesses_5` 14,855 · `answers_6` 1,227 · `guesses_6` 31,101
  - Proper nouns stripped from 6-letter answers via `/usr/share/dict/words`.
- **Online:** keep Firebase **optional**. Everything works offline/solo via localStorage; login only adds the online leaderboard + cross-device sync.
- **Features:** guess-distribution histogram, Play Again + unlimited practice, Hard Mode toggle, save & resume.

## Design

### Word loading (`script.js`)
- `state.answersByLength: Map<len, string[]>`, `state.validByLength: Map<len, Set>`.
- Validation: `validByLength.get(wordLength).has(guess)`.
- **Daily:** deterministic seeded Fisher–Yates permutation of `answers_5` (mulberry32, fixed seed). `index = floor((today − 2022-01-01)/day) % len` → unique word per calendar day, identical across devices, no repeat for ~6 years.
- **Random/Practice:** pick from answers, skip the last ~50 served (localStorage) to avoid immediate repeats.

### Local-first stats (`localStorage["wu_stats"]`)
`{ gamesPlayed, gamesWon, currentStreak, maxStreak, guessDist:{1..6} }`. Updated on every game end. When logged in, also mirror to Firebase + write leaderboard entry. Stats panel + histogram read from local store (instant, no login). Achievements computed from local stats; unlocked set in `localStorage["wu_ach"]`.

### Gameplay additions
- **Play Again:** restarts current mode with a fresh word (daily → routes to practice).
- **Hard Mode** (`localStorage["wu_hard"]`): on submit, enforce revealed greens (position) + presents (inclusion); locked once a guess is made.
- **Save/Resume** (`localStorage["wu_game"]`): persist `{mode,len,target,guesses,hard,startTime}` after each guess; restore on load if unfinished (daily only if same day); clear on finish.

### Mobile/PWA (`style.css`, `index.html`, `manifest.json`)
- `touch-action:manipulation` + `-webkit-tap-highlight-color:transparent` on interactive elements.
- Safe-area padding via `env(safe-area-inset-*)`.
- Responsive `--tile-size` via `min(62px, calc((100vw − …)/var(--word-length)))` so 6-letter always fits.
- Generate 192/512/maskable PNG + SVG icons; add `apple-touch-icon` + apple meta.
- Settings modal (Hard Mode, Sound, High-Contrast/colorblind) + How-To-Play modal on first visit. Nav reorganized: primary mode row + secondary menu/icons.

### Bug fixes
Reuse one preloaded `Audio`; guard `startGame` against double-trigger during async load; keep ARIA/reduced-motion support.

## Verification
Run locally (`npm start`), drive via browser automation: daily flow, valid/invalid guess, win+lose, hard-mode rejection, refresh-resume, 375px mobile viewport. Commit on existing feature branch.
