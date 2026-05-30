# Wordle Upgrade

A polished Wordle clone with three modes, leaderboards, achievements, and offline support.

## Features

- **Daily Word** — same 5-letter puzzle for everyone, seeded by date
- **Random Word** — unlimited random 5-letter puzzles
- **6-Letter Word** — extra challenge
- Physical + on-screen keyboard with proper color states
- Word definitions on win (via [dictionaryapi.dev](https://dictionaryapi.dev/))
- Confetti, share-to-Twitter/WhatsApp/clipboard
- Firebase-backed leaderboards, stats, and achievements
- Installable PWA with offline cache
- Mobile-responsive down to 360px

## Run locally

No build step. Just serve the directory:

```bash
npm start
# or any static server
python3 -m http.server 3000
```

Then open <http://localhost:3000>.

## Deploy

```bash
npm run deploy
```

Publishes the repo root to the `gh-pages` branch.

## Project layout

```
index.html         Markup + modal scaffolding
script.js          Game engine, state, Firebase, UI bindings (single IIFE)
style.css          Theme tokens + components + responsive
words_en.txt       Curated 5- and 6-letter word list
service-worker.js  Stale-while-revalidate cache
manifest.json      PWA manifest
pop-sound.mp3      Tile pop SFX
```

## Notes

- The Firebase config in `script.js` is intentionally public — Firebase web keys are not secret. Lock down writes/reads with [Firebase Security Rules](https://firebase.google.com/docs/database/security).
- Word list is curated from common English words. To extend, append lowercase words (one per line) to `words_en.txt`.
