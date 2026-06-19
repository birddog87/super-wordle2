# Async Challenges Design

**Date:** 2026-06-18
**Goal (user's words):** make the game better — "stickier multiplayer." Async word challenges to complement live head-to-head.
**Branch:** `feature/async-challenges` (off `main`).

## Summary

After finishing a Random/6-Letter game, a **signed-in** player can **Challenge friends**
on the word they just played. It creates a **Firebase-backed** challenge with a
shareable link (`?c={id}`). **Anyone with the link** (no login needed) plays the same
word; each person's result lands in a **per-challenge leaderboard** (broadcast to the
whole group). The creator gets an **in-app notification** ("Nick beat your PLUMB — 2 vs 3").

## Decisions (confirmed with user)

| Question | Decision |
|---|---|
| Carrier | **Firebase-backed** challenge (two-way; results flow back), not a backendless link |
| Identity | **Sign in (Google) to create**; anyone (anon OK) can **play** a link |
| Reach | **Broadcast** — many takers, per-challenge leaderboard |
| Word source | The Random/6-Letter word you just finished (Daily excluded) |
| Notifications | **In-app** (badge + toast); PWA push deferred to retention work |

## Data model

New `challenges` node, sibling to `races`:
```
challenges/{id}:                      # id = short code (genRoomCode-style)
  word, wordLength
  creator:       { uid, name }
  creatorResult: { won, attempts, timeMs }
  createdAt
  attempts/{uid}: { name, won, attempts, timeMs, at }   # one per taker, write-once
users/{uid}/myChallenges/{id}: createdAt                 # list "your" challenges
users/{uid}/seen/{id}: <ts>                              # clear the "new result" badge
```

**Ranking** (creatorResult + all attempts): solved > fewer attempts > faster time —
identical to the existing leaderboard sort, for consistency.

## Flow

- **Create** (signed in): Random/6-Letter result screen → **Challenge friends** →
  writes `challenges/{id}` (word + your result) + `users/{uid}/myChallenges/{id}` →
  share sheet with `…/?c={id}` (reuses the H2H share helper).
- **Play** (`?c={id}` on load): fetch challenge → **intro sheet** ("Nick dares you to
  beat 3/6 on this 5-letter word", word hidden) → **Play** runs a normal game **forced
  to that word** → on finish writes `attempts/{uid}` → **challenge result sheet** with
  the leaderboard (your row highlighted) + **Challenge back** / **Play your own**.
- **Notifications** (signed in, on app open): listen to your `myChallenges`; any
  `attempts` newer than `seen` → badge on the Versus icon + a toast. Opening the
  Challenges list updates `seen` and clears the badge.

## UI surfaces

- **Versus header button → "Play with friends" chooser sheet:** **Head to Head**
  (existing live race) and **Challenges** (async). Avoids another header icon; the icon
  carries a **new-result badge**.
- **Challenge create:** a **Challenge friends** button on the Random/6-Letter result
  modal (with the share buttons). Not signed in → a "Sign in with Google to create"
  nudge.
- **Incoming link:** challenge **intro sheet** → forced-word game → challenge **result
  sheet** (leaderboard 🥇🥈🥉 + Challenge back).
- **Challenges list sheet:** **Created by you** (word-as-tiles, your score, mini
  leaderboard, re-share, new-result dot) + **Played** (ones you attempted).

Reuses: bottom-sheet modals, result-tiles renderer, leaderboard table styling, share
buttons, the board engine (forced target via `startGame`), and `races`-style Firebase
patterns. No new game logic.

## Edge cases

- **Replays:** `attempts/{uid}` write-once (`!data.exists()` rule); re-opening shows the
  leaderboard, not another go.
- **Anonymous taker:** auto anon sign-in + local name; attempt keyed by anon uid.
- **Creator opens own link:** their row is `creatorResult`; no double-count.
- **Bad/deleted id:** "This challenge isn't available anymore."
- **Offline:** create/fetch need network; clean error toasts.

## Fair-play caveat (accepted)

The word lives in the challenge node, so it's readable via dev tools — fine for a
friends game, documented in the README (same stance as head-to-head).

## Firebase rules (to publish)

```json
"challenges": {
  "$id": {
    ".read": "auth != null",
    ".write": "auth != null && newData.child('creator/uid').val() === auth.uid && (!data.exists() || data.child('creator/uid').val() === auth.uid)",
    "attempts": {
      "$uid": {
        ".write": "auth != null && $uid === auth.uid && !data.exists()"
      }
    }
  }
}
```
- Any signed-in user can **read** a challenge (so takers fetch it).
- Only the **creator** can write the challenge body (the `creator/uid` check).
- Each **taker** can write only their own `attempts/{uid}` and only **once** (the leaf
  rule grants that path even though the parent write is creator-only; RTDB allows a
  write if the leaf or any ancestor grants it).
- `users/{uid}/myChallenges` and `users/{uid}/seen` ride on the existing
  `users/$uid` own-data rule.

## Out of scope (v2)

PWA push notifications · challenge expiry/cleanup · reactions · replay/best-of attempts.

## Verification

Sign-in-gated create; share link round-trip; a second identity plays and appears in the
leaderboard; write-once enforcement; badge/toast on new result; bad-id handling. Driven
the same way as head-to-head (real UI as creator, a scripted second Firebase identity as
the taker). The actual Google sign-in click-through is the user's (can't automate OAuth).
