# Wordle Upgrade — Head-to-Head (Live Race) Design

**Date:** 2026-06-18
**Goal (user's words):** "let's build a head to head mode."

## Summary

A **live, real-time race** between two players over a shared word, joined via a
**private room code**, resolved by **sudden death** (first to solve wins). Players
see each other as **colored blocks only** (no letters). Each race is a **single
word with a Rematch** button. No account needed — entering H2H does a silent
**anonymous Firebase sign-in** and reuses the existing name prompt.

## Decisions (confirmed with user)

| Question | Decision |
|---|---|
| Connection model | Live real-time race |
| Matchmaking | Private room code (Create / Join), no public queue |
| Opponent visibility | Colored blocks (0/1/2 codes) + guess count + "typing" pulse; **never letters** |
| Win condition | Sudden death — first correct submission wins; both fail → draw (tiebreak: more greens in last row) |
| Rounds | Single word + Rematch (series is just this looped; out of scope for v1) |
| Identity | Name only — silent `signInAnonymously()`; logged-in users keep their uid |
| Word length | 5 only in v1 (no picker) |

## Architecture

No backend exists; the race lives entirely in **Firebase Realtime Database**
(already a dependency) under a new `races/{code}` node. **Each browser is the
referee for its own board** — it scores its own guesses locally. Firebase is only
the shared blackboard both clients watch. Letters never leave the device; only the
per-row evaluation codes (0 absent · 1 present · 2 correct) are written.

### Data model

```
races/FROG7:
  status:    "waiting" | "live" | "done"
  word:      "frog"                 # host picks a random 5-letter answer
  wordLength: 5
  startAt:   <server time + ~3.5s>  # synced GO moment
  host:      <uid>
  players/<uid>:
     name:      "Nick"
     progress:  ["00210","02200", …]   # per-row codes
     guesses:   3
     typing:    true
     solved:    false      solvedAt: <ms>
     failed:    false      connected: true
  winner:    <uid> | "draw" | null
```

### Sync mechanics

- **Identity:** entering H2H triggers `auth.signInAnonymously()` so every player
  has a `uid`; reuse existing name prompt (`showNameModal` / `saveName`).
- **Live sync:** each client writes only its own `players/<uid>` subtree (guesses,
  colored-block codes, throttled `typing` flag) and subscribes to the whole
  `races/<code>` via `.on('value')` to render the opponent column.
- **Synced start:** host sets `startAt` from Firebase server time; both clients
  align via `.info/serverTimeOffset`, run the 3·2·1, unlock input at `startAt`.

## Race resolution & robustness

- **Sudden death:** correct submission runs a **transaction** on
  `races/<code>/winner` — first write wins; ties broken by `solvedAt`. Both clients
  watch `winner`; when set, input locks and the result sheet appears.
- **Both fail:** each sets `failed:true` after a missed 6th guess; when both true,
  compute a **draw**, tiebreak by greens in last row.
- **Disconnects:** `onDisconnect()` sets `connected:false` and deletes the room if
  the host bails while `waiting`. Opponent drop mid-race → "Nick disconnected" with
  **Claim win / Leave**. Closing the tab counts as a disconnect.
- **Cleanup:** finished room removed when both leave; abandoned `waiting` rooms
  vanish via host `onDisconnect`. No cron.

### Fair-play caveat (accepted)

Both clients must score their own guesses, so the answer sits in the DB as
plaintext — a determined cheater could read it in devtools. Accepted trade-off for
a casual friends game (a real fix needs a server we don't have). Documented in
README, not engineered around.

### Firebase security rules (one-time console change, not a repo file)

Widen rules so authenticated (incl. anonymous) users can read/write under
`races/`. Exact snippet to be documented during implementation.

## UI & screen flow

- **Entry point:** a **"Versus" icon button in the header** (next to
  help/stats/settings). The 3-mode segmented switch stays solo-only. Tapping opens
  the **H2H lobby sheet**.
- **Lobby sheet** (bottom sheet ≤600px, dialog above):
  - **Create race** → big code (`FROG-7`), **Share** button (existing share helper
    / `navigator.share`), "Waiting for opponent…" pulse.
  - **Join race** → short uppercase code input (≥44px). Bad/expired → inline toast.
  - Both present → morph into **3·2·1 GO** overlay → race screen.
- **Race screen:** reuses the real board + keyboard untouched, plus a **compact
  opponent panel** (name, mini grid of colored blocks, guess count, "typing"
  pulse). Portrait: slim strip on top. Landscape: beside the board. Reduced-motion:
  blocks fade, not flip.
- **Result sheet:** H2H variant of the existing result modal — headline ("You beat
  Nick! · 3 vs 4" / "Nick got it first" / "Draw"), word revealed as tiles, reused
  serif definition, **Rematch / Leave**. Rematch keeps the room; host rolls a fresh
  word; both re-ready.

## Constraints (unchanged)

Vanilla HTML/CSS/JS, no build step. Single `script.js` IIFE, single `style.css`.
PWA offline (bump `CACHE_NAME` in `service-worker.js`). Gameplay identical to
Wordle. CDN deps unchanged: Firebase 8.x, canvas-confetti only. Accessibility:
keyboard play, ARIA, reduced-motion, ≥44px touch targets.

## Out of scope for v1 (YAGNI)

Public matchmaking queue · best-of-N series · 6-letter races · H2H win/loss stats &
leaderboard · spectating · chat/emotes. All are natural follow-ons if wanted.

## Verification

Run locally (`npm start`), drive two browser contexts: create+join, synced
countdown, live block updates, sudden-death win (both orderings), both-fail draw,
mid-race disconnect → claim win, rematch, 375px mobile + landscape. Honor
reduced-motion. Commit on a feature branch.
