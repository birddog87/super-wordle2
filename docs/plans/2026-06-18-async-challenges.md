# Async Challenges Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to implement task-by-task.

**Goal:** Firebase-backed async word challenges — finish a Random/6-Letter game → "Challenge friends" → share a link → anyone plays the same word → per-challenge leaderboard → creator notified in-app.

**Architecture:** New `challenges/{id}` Firebase node (sibling to `races`). Creating requires Google sign-in (reuse `isRealUser()`/`signInWithGoogle()`); playing a `?c={id}` link works for anyone (auto anon auth via `ensureRaceAuth()`). Playing forces the board to the challenge word via a new `startChallengeGame()` and routes the end-of-game to a challenge result sheet instead of the solo one. Reuses the board engine, result-tiles renderer, leaderboard styling, share helper, and `races`-style patterns. No new game logic.

**Tech stack:** Vanilla JS single IIFE, Firebase 8.10 (auth + database, already used by races/leaderboard). No new deps.

**Testing:** `node --check` syntax gate; controller drives the real UI as creator + a scripted second Firebase identity as a taker (same method that found the H2H rematch bug). Google OAuth click-through is the user's.

**Branch:** `feature/async-challenges` (off main). Commit after each task.

**Reuse map (functions already in script.js):** `genRoomCode`, `ensureRaceAuth`, `isRealUser`, `signInWithGoogle`, `requireName`, `sanitize`, `openModal`, `closeModal`, `toast`, `$`, `$$`, `renderWordTiles`, `formatDuration`, `startGame`, `createBoard`, `createKeyboard`, `updateBoard`, `evaluateGuess`, `shareRace` (pattern), `CONFIG`. State: `state.h2h` exists; add `state.challenge`.

---

## Task C1: Markup — chooser, intro/result sheets, challenges list, result button, badge

**File:** `index.html`.

1. **Repurpose the Versus entry into a chooser.** Add a **friends chooser** modal `#friends-modal` (bottom sheet) with two big buttons: `#friends-h2h` ("Head to Head — live race") and `#friends-challenges` ("Challenges — async"). (Task C5 makes the `#open-h2h` button open this instead of the H2H lobby directly.)
2. **Add a new-result badge** span inside the `#open-h2h` header button: `<span id="friends-badge" class="friends-badge" hidden></span>`.
3. **Challenge intro sheet** `#challenge-intro-modal`: `#challenge-intro-text` ("… dares you to beat …"), a `.result-tiles`-style hidden-length hint is optional; a `#challenge-intro-play` primary button and a close.
4. **Challenge result sheet** `#challenge-result-modal`: `#challenge-result-title`, `#challenge-result-sub`, `#challenge-result-tiles` (the word), `#challenge-leaderboard` (table container), buttons `#challenge-back` ("Challenge back") and `#challenge-newword` ("Play your own").
5. **Challenges list sheet** `#challenges-list-modal`: `#challenges-created` and `#challenges-played` containers, with section headings.
6. **"Challenge friends" button** on the existing `#winning-modal`: add `<button id="challenge-friends-button" type="button">Challenge friends</button>` into the `.share-buttons` row (it'll be shown only for Random/6-Letter via JS).

Mirror existing modal structure (`.modal` > `.modal-content[role=dialog][aria-modal][aria-labelledby]` > `.close`). Keep all new ids.

**Verify:** div balance matches; all new ids present (grep); main checkout untouched.
**Commit:** `feat(challenges): markup for chooser, intro/result/list sheets, badge`

---

## Task C2: CSS for the new surfaces

**File:** `style.css` (append a `/* ---- Challenges ---- */` section, existing tokens only).

- `.friends-badge` — small accent dot/count on the header button (absolute-positioned, `background: var(--accent)`, hidden via attribute).
- Chooser buttons — reuse `.modal-button` look; stack with gap.
- Challenge leaderboard table — reuse the existing leaderboard `table`/`td[data-label]` styles; add a `.me` row highlight (subtle `--surface-high` background) and rank medal styling.
- Intro sheet — centered text, primary button.
- `.challenge-row .new-dot` — accent dot for unseen results in the list.
- Respect reduced-motion; bottom-sheet on ≤600px (the existing `.modal` responsive rules already do this).

**Verify:** brace balance; only defined tokens; key selectors present; visual check by controller.
**Commit:** `feat(challenges): styles for chooser, leaderboard, intro/result sheets`

---

## Task C3: Create-challenge logic

**File:** `script.js` (new `// ---- Challenges ----` section).

Add:
```js
function createChallenge() {
  if (!isRealUser()) { toast('Sign in with Google to challenge friends.', 'warn'); signInWithGoogle(); return; }
  const r = state.lastResult; // set in endGame: { mode, word, wordLength, won, attempts, timeMs }
  if (!r || r.mode === CONFIG.MODES.DAILY) { toast('Play a Random or 6-Letter game first.', 'warn'); return; }
  const uid = auth.currentUser.uid;
  const name = state.playerName || 'Player';
  const id = genRoomCode();
  const payload = {
    word: r.word, wordLength: r.wordLength,
    creator: { uid, name: sanitize(name) },
    creatorResult: { won: r.won, attempts: r.attempts, timeMs: r.timeMs },
    createdAt: firebase.database.ServerValue.TIMESTAMP,
  };
  const ref = database.ref('challenges/' + id);
  ref.set(payload)
    .then(() => database.ref(`users/${uid}/myChallenges/${id}`).set(firebase.database.ServerValue.TIMESTAMP))
    .then(() => shareChallenge(id, r))
    .catch((e) => { console.error('createChallenge', e); toast('Could not create the challenge.', 'error'); });
}

function shareChallenge(id, r) {
  const url = `${location.origin}${location.pathname}?c=${id}`;
  const verb = r.won ? `solved it in ${r.attempts}` : 'tried it';
  const text = `I ${verb} on Wordle — beat me? ${url}`;
  if (navigator.share) navigator.share({ text }).catch(() => {});
  else navigator.clipboard.writeText(text).then(() => toast('Challenge link copied!', 'success')).catch(() => {});
}
```

**Capture the result:** in `endGame` (or `showResultModal`), set `state.lastResult = { mode: state.currentMode, word: state.targetWord, wordLength: state.wordLength, won, attempts, timeMs: Date.now() - state.startTime }`. (There's already a `state.lastResult` field — confirm/extend it to carry these.)

**Wire** in `bindUI`: `$('challenge-friends-button').addEventListener('click', createChallenge);` and in `showResultModal`, show/hide the button: `$('challenge-friends-button').style.display = (won-or-loss && mode !== DAILY) ? '' : 'none';` (show for Random/6-Letter results regardless of win/loss).

**Verify:** `node --check`; functions present; button wired.
**Commit:** `feat(challenges): create challenge + share link from result screen`

---

## Task C4: Play-challenge logic (incoming link → forced word → attempt → leaderboard)

**File:** `script.js`.

1. **Detect on load.** In `init()`, before the normal `resumeGame()/startGame()` path:
```js
const params = new URLSearchParams(location.search);
const cid = params.get('c');
if (cid) { openChallenge(cid); return; }   // skip the default daily start
```
2. **Fetch + intro:**
```js
function openChallenge(id) {
  database.ref('challenges/' + id).once('value').then((snap) => {
    const ch = snap.val();
    if (!ch) { toast('This challenge isn’t available anymore.', 'warn'); startGame(CONFIG.MODES.DAILY); return; }
    state.challenge = { id, ...ch };
    const cr = ch.creatorResult || {};
    const score = cr.won ? `${cr.attempts}/${CONFIG.MAX_GUESSES}` : 'a loss';
    $('challenge-intro-text').textContent = `${(ch.creator && ch.creator.name) || 'A friend'} dares you to beat ${score} on this ${ch.wordLength}-letter word.`;
    openModal('challenge-intro-modal');
  }).catch(() => { toast('Could not load the challenge.', 'error'); startGame(CONFIG.MODES.DAILY); });
}
```
3. **Play forced word** (`#challenge-intro-play` → `startChallengeGame`):
```js
function startChallengeGame() {
  const ch = state.challenge; if (!ch) return;
  closeModal('challenge-intro-modal');
  loadWordList().then(() => {
    state.currentMode = CONFIG.MODES.RANDOM;     // play surface; not daily
    state.wordLength = ch.wordLength;
    state.targetWord = ch.word;
    state.currentGuess = ''; state.guesses = [];
    state.correctPositions = new Array(ch.wordLength).fill(false);
    state.startTime = Date.now(); state.gameActive = true; state.animating = false;
    state.inChallenge = true;
    updateModeIndicator(CONFIG.MODES.RANDOM);
    $('mode-indicator').textContent = 'Challenge · beat their score';
    createBoard(); createKeyboard(); updateBoard();
  });
}
```
4. **Route end-of-game.** In `endGame(won)`, near the top: `if (state.inChallenge) { return finishChallenge(won); }` so challenge games don't touch solo stats/daily-done/leaderboard.
```js
function finishChallenge(won) {
  const ch = state.challenge; state.inChallenge = false; state.gameActive = false;
  const attempts = state.guesses.length;
  const timeMs = Date.now() - state.startTime;
  recordGame(won, attempts);   // local stats still count — playing is playing
  ensureRaceAuth().then((uid) => requireName().then(() => uid)).then((uid) => {
    const me = { name: sanitize(state.playerName || 'Player'), won, attempts, timeMs, at: firebase.database.ServerValue.TIMESTAMP };
    // write-once: only set if not already present
    return database.ref(`challenges/${ch.id}/attempts/${uid}`).transaction((cur) => (cur === null ? me : undefined))
      .then(() => database.ref(`challenges/${ch.id}`).once('value'));
  }).then((snap) => showChallengeResult(snap.val(), won))
    .catch((e) => { console.error('finishChallenge', e); showChallengeResult(ch, won); });
}
```
5. **Result + leaderboard render** `showChallengeResult(ch, won)`: build the ranked rows from `creatorResult` (as the creator's row) + all `attempts`, sort (won desc, attempts asc, timeMs asc), render into `#challenge-leaderboard` reusing the leaderboard table styles, highlight the current player's row, set title ("You solved it in N!" / "So close"), reveal the word via `renderWordTiles`, `openModal('challenge-result-modal')`.

**Wire:** `#challenge-intro-play`→`startChallengeGame`; `#challenge-back`→create a challenge on the SAME word (or a fresh random — v1: `startGame(RANDOM)` then they can challenge from the result); `#challenge-newword`→`startGame(CONFIG.MODES.RANDOM)`. Clear `?c=` from the URL after handling (`history.replaceState`).

**Verify:** `node --check`; scripted second identity plays → appears in leaderboard; write-once holds; bad id handled.
**Commit:** `feat(challenges): play a challenge link, write attempt, show leaderboard`

---

## Task C5: Friends chooser + Challenges list + in-app notifications

**File:** `script.js`.

1. **Chooser:** repoint `#open-h2h` → `openFriends()` which opens `#friends-modal`; `#friends-h2h`→ existing `openH2H()`; `#friends-challenges`→`openChallengesList()`.
2. **Challenges list** `openChallengesList()`: read `users/{uid}/myChallenges` (if signed in) → for each, read `challenges/{id}` → render a row (word tiles, your score, mini top-3, re-share, a `new-dot` if it has attempts newer than `users/{uid}/seen/{id}`). Also a "Played" section is optional v1 (can be empty/简single). On open, write `users/{uid}/seen/{id}=now` for listed challenges and clear the badge.
3. **Notifications:** in `bindAuthUI`'s signed-in branch (or a dedicated `watchChallenges()` called on sign-in), attach a listener: for each `myChallenges` id, watch `challenges/{id}/attempts`; if any `at` > `seen[id]` and uid≠creator → set `#friends-badge` visible (count) + a one-time toast ("Nick beat your challenge!"). Keep it lightweight (limit to recent N challenges).

**Verify:** `node --check`; chooser opens both; badge appears when a scripted taker beats you; opening the list clears it.
**Commit:** `feat(challenges): friends chooser, challenges list, in-app new-result badge`

---

## Task C6: Firebase rules, README, cache bump

**Files:** `README.md`, `service-worker.js`, design doc.

1. **Rules** (document + user publishes): add the `challenges` block from the design doc alongside existing rules. README "Async challenges" section + the fair-play caveat.
2. **Cache bump:** `service-worker.js` `CACHE_NAME` v11 → **v12**.
3. README feature bullet: "Challenge friends — async: share a word, everyone races to beat your score."

**Verify:** rules JSON valid; `grep v12`; README updated.
**Commit:** `docs(challenges): firebase rules + README; bump PWA cache to v12`

---

## Controller verification (after C1–C6)
Two Firebase identities: creator (real UI, signed in — OAuth is the user's) writes a challenge; scripted taker plays the word, appears in the leaderboard; write-once enforced; badge/toast fires; bad-id path; responsive sheets. Then publish rules + add the (already-authorized) Vercel domain isn't needed again — same origin.

## Out of scope (v2)
PWA push, expiry/cleanup, reactions, replay/best-of.
