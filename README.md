# Wordle Upgrade

A polished, offline-friendly Wordle game with three modes, hard mode, local stats, and an optional online leaderboard. Plays great solo on desktop or mobile — no account required.

## Features

- **Daily Word** — same 5-letter puzzle for everyone, deterministic per day (no repeats for ~6 years)
- **Random Word** — unlimited 5-letter puzzles, avoids recently-seen words
- **6-Letter Word** — extra challenge, fits even narrow phones
- **Play Again** after every game; **Hard Mode** toggle (revealed hints must be reused)
- **Two-list dictionary** like the real Wordle: a curated pool of common answers (no obscure/weird words) plus a large dictionary of valid guesses (so real words like `crane` are never rejected)
- **Local-first stats** — games played, win %, streaks, and a guess-distribution chart, all stored on-device with no login
- **Achievements** unlocked locally
- **Save & resume** — refresh or close the tab and your in-progress game is restored
- Physical + on-screen keyboard with proper colour states
- Settings: Hard Mode, High Contrast (colour-blind palette), Sound
- Word definitions on win/loss (via [dictionaryapi.dev](https://dictionaryapi.dev/))
- Confetti, share-to-Twitter/WhatsApp/clipboard
- Optional Firebase login for the online leaderboard and cross-device sync
- Installable PWA with offline cache
- Mobile-first: safe-area insets, no tap-zoom delay, responsive tiles down to small phones

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
index.html              Markup + modal scaffolding
script.js               Game engine, state, Firebase, UI bindings (single IIFE)
style.css               Theme tokens + components + responsive
words/answers_5.txt     Curated common 5-letter secret words (~2,315)
words/guesses_5.txt     Accepted 5-letter guesses (~14,855)
words/answers_6.txt     Curated common 6-letter secret words (~1,227)
words/guesses_6.txt     Accepted 6-letter guesses (~31,101)
tools/build-wordlists.sh  Rebuilds the word files from public sources (documented provenance)
icons/                  PWA icons (SVG + 192/512 PNG, maskable)
service-worker.js       Stale-while-revalidate cache
manifest.json           PWA manifest
pop-sound.mp3           Tile pop SFX
docs/plans/             Design docs
```

## Words

The game uses a **two-list system**:

- `answers_*` are the words that can be the secret — curated common words only, so you never get a weird answer.
- `guesses_*` are everything you're allowed to type — a large dictionary, so legitimate words aren't rejected.

To rebuild from source (requires `curl` and `/usr/share/dict/words`):

```bash
./tools/build-wordlists.sh
```

To extend by hand, add lowercase words (one per line) to the relevant file; any answer is automatically also a valid guess.

## Notes

- The Firebase config in `script.js` is intentionally public — Firebase web keys are not secret. Lock down writes/reads with [Firebase Security Rules](https://firebase.google.com/docs/database/security).
- Everything except the online leaderboard works fully offline and without an account; stats live in `localStorage`.
