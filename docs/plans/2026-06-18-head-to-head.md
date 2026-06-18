# Head-to-Head (Live Race) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a live, real-time 1-v-1 Wordle race joined by a private room code, resolved by sudden death, built on the existing Firebase Realtime Database with no new dependencies.

**Architecture:** A new H2H module lives inside the existing `script.js` IIFE. The solo game flow (`startGame`/`submitGuess`/`endGame`) is left untouched; `handleKeyPress` gains one early branch that routes Enter to the race submit path when a race is active. Each browser referees its own board (reusing `evaluateGuess`, `createBoard`, `createKeyboard`, `updateBoard`, the flip animation) and writes only its own subtree under `races/{code}` — guesses count, per-row colour codes (`0`/`1`/`2`), and a `typing` flag. Both clients subscribe to the whole race node via `.on('value')` and render the opponent as colour blocks. Sudden death is resolved with a Firebase transaction on `races/{code}/winner`. Synced start uses `.info/serverTimeOffset`.

**Tech Stack:** Vanilla HTML/CSS/JS (no build), Firebase 8.10 (app + database + auth, already loaded), anonymous auth (new use of the existing `auth` object). No new CDN deps.

**Testing reality:** This project has **no test runner** and the code is one DOM/Firebase-coupled IIFE. So: pure helpers are verified by a small assert snippet run via `node` (the helpers are duplicated nowhere — the test snippet `require`s nothing; instead each pure helper is *also* exposed read-only on `window.__WU_TEST__` so Playwright can assert against the real shipped code). Stateful/live behaviour is verified by driving **two browser contexts** with the Playwright MCP, per the design's verification plan. Each task ends with a concrete verify step + a commit.

**Branch:** `feature/head-to-head` (worktree `.worktrees/head-to-head`). Commit after every task.

---

## Conventions used below

- `script.js` is an IIFE; "add function X" means add it inside the IIFE, grouped under a new `// ---- Head-to-Head ----` section placed just before `// ---- Auth UI ----` (around line 1209), unless a different anchor is named.
- Reuse existing helpers: `$`, `$$`, `openModal`, `closeModal`, `toast`, `sanitize`, `reduceMotion`, `evaluateGuess`, `createBoard`, `createKeyboard`, `updateBoard`, `updateKeyColor`, `getRandomWord`, `renderWordTiles`, `fetchWordDefinition`.
- `database`, `auth`, `firebase` are already in scope.
- Colour-code alphabet for race progress: `2` = correct, `1` = present, `0` = absent (a string per guessed row, e.g. `"20100"`).

---

## Task 1: H2H state scaffold + anonymous auth helper

**Files:**
- Modify: `script.js` — `state` object (around line 34-59); add helpers in a new H2H section.

**Step 1: Extend `state`**

Add to the `state` object literal (after `popBytesPromise: null,` on line 58, before the closing `};`):

```js
    h2h: null,            // active race context (see startRaceContext)
    serverOffset: 0,      // ms offset from Firebase server clock
```

**Step 2: Add the H2H section header + anon-auth helper**

Insert immediately before `// ---- Auth UI ----` (line 1209):

```js
  // ---- Head-to-Head (live race) ----

  // Resolve a uid for racing. Reuse an existing logged-in uid; otherwise sign in
  // anonymously. Returns a promise of the uid.
  function ensureRaceAuth() {
    if (state.userId) return Promise.resolve(state.userId);
    if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
    return auth.signInAnonymously().then((cred) => cred.user.uid);
  }

  // Read-only export so pure helpers can be asserted against in the browser.
  window.__WU_TEST__ = window.__WU_TEST__ || {};
```

**Step 3: Verify**

Run the app (`npm start`, open `http://localhost:3000`). In the browser console:
```js
await (window.__WU_TEST__, firebase.auth().signInAnonymously()).then(c => c.user.isAnonymous)
```
Expected: `true`. Then `firebase.auth().signOut()`.

(Heads-up: anonymous auth must be enabled in the Firebase console — Authentication → Sign-in method → Anonymous → Enable. If the above throws `auth/operation-not-allowed`, enable it. This is also captured in Task 13.)

**Step 4: Commit**
```bash
git add script.js
git commit -m "feat(h2h): add race state + anonymous auth helper"
```

---

## Task 2: Pure helpers (room code, eval encoding, tiebreak)

**Files:**
- Modify: `script.js` — H2H section.
- Create (temporary): `/tmp/h2h-selftest.mjs` (deleted after, not committed).

**Step 1: Add pure helpers** (in the H2H section, after `ensureRaceAuth`)

```js
  // 4-char code from an unambiguous alphabet (no O/0/I/1). Pure.
  const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function genRoomCode(rand) {
    const r = rand || Math.random;
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(r() * CODE_ALPHABET.length)];
    return code;
  }

  // ['correct','present','absent'] -> "210"-style string. Pure.
  function encodeEval(evalArr) {
    return evalArr.map((s) => (s === 'correct' ? '2' : s === 'present' ? '1' : '0')).join('');
  }

  // "210" -> ['correct','present','absent']. Pure.
  function decodeEval(code) {
    return code.split('').map((c) => (c === '2' ? 'correct' : c === '1' ? 'present' : 'absent'));
  }

  // Greens in a row code (for the both-failed tiebreak). Pure.
  function greenCount(code) {
    return (code.match(/2/g) || []).length;
  }

  Object.assign(window.__WU_TEST__, { genRoomCode, encodeEval, decodeEval, greenCount, CODE_ALPHABET });
```

**Step 2: Write the self-test** (`/tmp/h2h-selftest.mjs`)

```js
// Mirror of the pure helpers for a quick node assert. Keep in sync with script.js.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genRoomCode = (r) => { let c=''; for(let i=0;i<4;i++) c+=CODE_ALPHABET[Math.floor(r()*CODE_ALPHABET.length)]; return c; };
const encodeEval = (a) => a.map(s => s==='correct'?'2':s==='present'?'1':'0').join('');
const decodeEval = (c) => c.split('').map(x => x==='2'?'correct':x==='1'?'present':'absent');
const greenCount = (c) => (c.match(/2/g)||[]).length;
const assert = (cond, msg) => { if(!cond){ console.error('FAIL:', msg); process.exit(1);} };
assert(genRoomCode(() => 0) === 'AAAA', 'genRoomCode deterministic');
assert(/^[A-Z2-9]{4}$/.test(genRoomCode(Math.random)), 'genRoomCode charset');
assert(!/[OI01]/.test(genRoomCode(Math.random)), 'no ambiguous chars');
assert(encodeEval(['correct','present','absent','absent','present']) === '21001', 'encodeEval');
assert(JSON.stringify(decodeEval('21001')) === JSON.stringify(['correct','present','absent','absent','present']), 'decodeEval');
assert(greenCount('21221') === 3, 'greenCount');
console.log('OK: all h2h pure-helper tests passed');
```

**Step 3: Run it**

Run: `node /tmp/h2h-selftest.mjs`
Expected: `OK: all h2h pure-helper tests passed` (exit 0).

**Step 4: Verify the shipped code matches** (browser console, app running)
```js
window.__WU_TEST__.encodeEval(['correct','present','absent']) // "210"
window.__WU_TEST__.greenCount('22100')                         // 2
```

**Step 5: Cleanup + commit**
```bash
rm /tmp/h2h-selftest.mjs
git add script.js
git commit -m "feat(h2h): pure helpers for room code, eval encoding, tiebreak"
```

---

## Task 3: Markup — Versus button, lobby, countdown overlay, opponent panel, result modal

**Files:**
- Modify: `index.html`.

**Step 1: Add the Versus header button**

In `.header-actions` (after the `open-settings` button, before `</div>` on line 41), add:

```html
        <button id="open-h2h" class="icon-button" type="button" aria-label="Head to head" title="Head to head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14.5 3.5l6 6M3.5 14.5l6 6"/><path d="M18 2l4 4-9 9-4-4z" transform="translate(-7 1)"/><path d="M2 18l4 4 9-9-4-4z"/><path d="M14 7l3 3M7 14l3 3"/></svg>
        </button>
```
(Crossed-swords glyph; exact path can be tuned in CSS task — keep the `id` and classes.)

**Step 2: Add the opponent panel container**

In `<main>` (line 51-54), add an opponent panel *above* the board, hidden by default:

```html
    <main role="main">
      <div id="opponent-panel" class="opponent-panel" hidden aria-live="polite">
        <div class="opp-head">
          <span id="opp-name" class="opp-name">Opponent</span>
          <span id="opp-status" class="opp-status">guess 0/6</span>
        </div>
        <div id="opp-grid" class="opp-grid" aria-label="Opponent progress"></div>
      </div>
      <div id="game-board" aria-label="Game board"></div>
      <div id="keyboard" aria-label="On-screen keyboard"></div>
    </main>
```

**Step 3: Add the H2H lobby modal** (after `daily-attempt-modal`, before `feedback-modal`, ~line 176)

```html
  <div id="h2h-modal" class="modal" aria-hidden="true">
    <div class="modal-content" role="dialog" aria-labelledby="h2h-modal-title" aria-modal="true">
      <button class="close" aria-label="Close" type="button">&times;</button>
      <h2 id="h2h-modal-title">Head to Head</h2>

      <div id="h2h-home" class="h2h-pane">
        <p class="modal-note">Race a friend on the same word. First to solve wins.</p>
        <button id="h2h-create" class="modal-button" type="button">Create a race</button>
        <div class="h2h-join-row">
          <input type="text" id="h2h-code-input" placeholder="Code" maxlength="4" autocomplete="off"
                 autocapitalize="characters" spellcheck="false" inputmode="text" aria-label="Race code">
          <button id="h2h-join" class="text-button" type="button">Join</button>
        </div>
      </div>

      <div id="h2h-waiting" class="h2h-pane" hidden>
        <p class="modal-note">Share this code with your friend:</p>
        <div id="h2h-code-display" class="h2h-code" aria-live="polite">----</div>
        <div class="share-buttons">
          <button id="h2h-share" type="button">Share</button>
          <button id="h2h-copy-code" type="button">Copy code</button>
        </div>
        <p class="h2h-wait-status"><span class="h2h-pulse"></span> Waiting for opponent…</p>
        <button id="h2h-cancel" class="text-button" type="button">Cancel</button>
      </div>
    </div>
  </div>
```

**Step 4: Add the countdown overlay** (top level, after `toast-container`, ~line 57)

```html
  <div id="h2h-countdown" class="h2h-countdown" hidden aria-hidden="true">
    <span id="h2h-countdown-num" class="h2h-countdown-num">3</span>
  </div>
```

**Step 5: Add the H2H result modal** (after `winning-modal`, ~line 204)

```html
  <div id="h2h-result-modal" class="modal" aria-hidden="true">
    <div class="modal-content" role="dialog" aria-labelledby="h2h-result-title" aria-modal="true">
      <button class="close" aria-label="Close" type="button">&times;</button>
      <h2 id="h2h-result-title">Result</h2>
      <p id="h2h-result-subline" class="result-subline"></p>
      <div id="h2h-result-tiles" class="result-tiles"></div>
      <div id="h2h-result-def"></div>
      <div class="modal-actions">
        <button id="h2h-rematch" class="modal-button" type="button">Rematch</button>
        <button id="h2h-leave" class="text-button" type="button">Leave</button>
      </div>
    </div>
  </div>
```

**Step 6: Verify**

Reload the app. In console:
```js
['open-h2h','h2h-modal','h2h-home','h2h-waiting','h2h-countdown','opponent-panel','h2h-result-modal']
  .every(id => document.getElementById(id) !== null)
```
Expected: `true`. The board still renders normally; opponent panel + countdown are hidden.

**Step 7: Commit**
```bash
git add index.html
git commit -m "feat(h2h): lobby, countdown, opponent panel, result markup"
```

---

## Task 4: Styles for the H2H surfaces

**Files:**
- Modify: `style.css` (append a `/* ---- Head-to-Head ---- */` section at the end).

**Step 1: Add styles.** Use only existing tokens (`--surface`, `--surface-high`, `--correct`, `--present`, `--absent`, `--accent`, `--fg`, `--fg-muted`, `--border`, `--ease-out-expo` etc.). Required rules:

- `.opponent-panel` — slim card above the board: `background: var(--surface)`, hairline border, small radius, padding, margin-bottom. `[hidden]` already hides it.
- `.opp-head` — flex row, space-between; `.opp-name` medium weight; `.opp-status` `font-variant-numeric: tabular-nums; color: var(--fg-muted)`.
- `.opp-grid` — `display:grid; grid-auto-rows: …; gap` of small block rows. Each row `.opp-row` is `display:grid; grid-template-columns: repeat(var(--len),1fr); gap:2px`. Each block `.opp-cell` is a ~14px square, `border-radius:2px`, `background: var(--absent)`; modifiers `.opp-cell.correct{background:var(--correct)}`, `.opp-cell.present{background:var(--present)}`, `.opp-cell.empty{background:var(--bg-deep)}`.
- `.opp-cell` reveal: subtle `transition: background-color .25s var(--ease-out-expo)`. Under `@media (prefers-reduced-motion: reduce)` set `transition:none`.
- `.h2h-pulse` / `.h2h-wait-status` — small dot that pulses (reuse a keyframe; disable under reduced motion). Typing indicator on opponent: `.opp-status.typing::after { content:' · typing…' }` or a `.opp-typing` dot — keep simple.
- `.h2h-code` — big, letter-spaced, tabular code display (`font-size: clamp(2rem, 12vw, 3rem); letter-spacing:.2em; text-align:center; font-variant-numeric:tabular-nums`).
- `.h2h-join-row` — flex row, input + Join button; input ≥44px tall, uppercase (`text-transform:uppercase`), centered.
- `.h2h-countdown` — fixed full-screen overlay, `display:grid; place-items:center`, dim scrim (`background: color-mix(in oklab, var(--bg-deep) 80%, transparent)`), `z-index:1400`. `.h2h-countdown-num` huge (`clamp(5rem,30vw,12rem)`), accent color, with an ease-out scale-in keyframe per number (disabled under reduced motion). `[hidden]` hides it.
- Landscape: in the existing `@media (orientation: landscape) and (max-height: 520px)` block, make `.opponent-panel` sit beside the board (the main flexes). Keep it compact; cap opponent cell size.
- Header `#open-h2h` reuses `.icon-button` (already styled) — no extra rule needed beyond optional accent on hover.

**Step 2: Verify (visual, Playwright MCP)**

Open `http://localhost:3000`. Click the Versus button → lobby appears, "Create a race" is a primary button, Join row aligned, ≥44px targets. Resize to 375×667 and 1280×800; screenshot both. Temporarily un-hide the opponent panel + countdown via console to eyeball them:
```js
document.getElementById('opponent-panel').hidden = false;
document.getElementById('opp-grid').innerHTML = '<div class="opp-row" style="--len:5"><span class="opp-cell correct"></span><span class="opp-cell present"></span><span class="opp-cell"></span><span class="opp-cell"></span><span class="opp-cell"></span></div>';
document.getElementById('h2h-countdown').hidden = false;
```
Confirm colours match the board, then re-hide. Toggle OS reduced-motion (or emulate) and confirm no transitions/animations on the overlay.

**Step 3: Commit**
```bash
git add style.css
git commit -m "feat(h2h): styles for lobby, opponent panel, countdown overlay"
```

---

## Task 5: Open the lobby + create a race

**Files:**
- Modify: `script.js` (H2H section + `bindUI`).

**Step 1: Add lobby open/close + create flow**

```js
  function openH2H() {
    showH2HPane('home');
    $('h2h-code-input').value = '';
    openModal('h2h-modal');
  }

  function showH2HPane(which) {
    $('h2h-home').hidden = which !== 'home';
    $('h2h-waiting').hidden = which !== 'waiting';
  }

  // Build the race context object stored on state.h2h.
  function startRaceContext(code, role, myUid) {
    return {
      code, role, myUid, oppUid: null,
      ref: database.ref('races/' + code),
      word: null, wordLength: CONFIG.DEFAULT_LENGTH,
      active: false, started: false, finished: false,
      guesses: [], currentGuess: '', typing: false,
    };
  }

  function createRace() {
    ensureRaceAuth().then((uid) => ensurePlayerName() || uid && uid).then(() => {
      const uid = state.userId || auth.currentUser.uid;
      const name = state.playerName || 'Player';
      // word list must be loaded to pick a word
      return loadWordList().then(() => {
        const code = genRoomCode();
        const word = getRandomWord(CONFIG.DEFAULT_LENGTH);
        const h = startRaceContext(code, 'host', uid);
        h.word = word;
        state.h2h = h;
        const payload = {
          status: 'waiting',
          word, wordLength: CONFIG.DEFAULT_LENGTH,
          host: uid,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          players: { [uid]: racePlayerSeed(name) },
        };
        return h.ref.set(payload).then(() => {
          // Clean up an abandoned room if the host disconnects while waiting.
          h.ref.child('status').once('value'); // noop to ensure ref live
          h.ref.onDisconnect().remove();
          $('h2h-code-display').textContent = code;
          showH2HPane('waiting');
          subscribeRace(h);
        });
      });
    }).catch((err) => {
      console.error('createRace failed', err);
      toast('Could not start a race. Check your connection.', 'error');
    });
  }

  function racePlayerSeed(name) {
    return { name: sanitize(name), guesses: 0, progress: [], typing: false,
             solved: false, failed: false, connected: true, greens: 0 };
  }
```

Note: `ensurePlayerName()` currently returns `undefined` and only prompts on first score. For H2H we need a name *now*. Replace the `ensurePlayerName() || uid && uid` hack with an explicit guard:

```js
  function requireName() {
    state.playerName = localStorage.getItem(CONFIG.LS.NAME) || state.playerName || '';
    if (state.playerName) return Promise.resolve(state.playerName);
    return new Promise((resolve) => {
      state._afterName = resolve;       // saveName() will call this if set
      showNameModal();
    });
  }
```
And in `saveName()` (line 316-331), after `updateUserDisplay();`, add:
```js
    if (state._afterName) { const r = state._afterName; state._afterName = null; r(state.playerName); }
```
Then rewrite `createRace` to `ensureRaceAuth().then(() => requireName()).then(() => loadWordList()).then(() => { …pick code/word, set node… })`. (Keep the body above; just fix the promise chain to use `requireName()`.)

**Step 2: Wire the buttons** — in `bindUI` (after the help bindings, ~line 1327):

```js
    $('open-h2h').addEventListener('click', openH2H);
    $('h2h-create').addEventListener('click', createRace);
    $('h2h-cancel').addEventListener('click', leaveRace);
    $('h2h-copy-code').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(state.h2h ? state.h2h.code : ''); toast('Code copied!', 'success'); }
      catch { toast('Could not copy.', 'error'); }
    });
    $('h2h-share').addEventListener('click', shareRace);
    $('h2h-join').addEventListener('click', () => {
      const code = $('h2h-code-input').value.trim().toUpperCase();
      if (code.length !== 4) { toast('Enter the 4-character code.', 'warn'); return; }
      joinRace(code);
    });
    $('h2h-code-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $('h2h-join').click(); }
    });
```

Add stubs now (filled in later tasks) so the file runs: `function joinRace(){}`, `function subscribeRace(){}`, `function leaveRace(){ if(state.h2h){ state.h2h.ref.onDisconnect().cancel(); state.h2h.ref.remove().catch(()=>{}); } state.h2h=null; closeModal('h2h-modal'); }`, and:
```js
  function shareRace() {
    if (!state.h2h) return;
    const text = `Join my Wordle race! Code: ${state.h2h.code} — ${location.origin}${location.pathname}`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else { navigator.clipboard.writeText(text).then(() => toast('Invite copied!', 'success')).catch(() => {}); }
  }
```

**Step 3: Verify (Playwright, one context)**

Open the app, click Versus → "Create a race". A 4-char code shows, status flips to "Waiting…". In console confirm the node exists:
```js
await firebase.database().ref('races/' + window.__WU_TEST__ ? null : null; // use the visible code:
await firebase.database().ref('races/' + document.getElementById('h2h-code-display').textContent).once('value').then(s => s.val())
```
Expected: an object with `status:'waiting'`, a `word`, and one `players` entry. Click Cancel → node removed (re-query returns `null`).

**Step 4: Commit**
```bash
git add script.js
git commit -m "feat(h2h): open lobby, create race, name prompt, share/cancel"
```

---

## Task 6: Join a race

**Files:**
- Modify: `script.js` (replace the `joinRace` stub).

**Step 1: Implement `joinRace`**

```js
  function joinRace(code) {
    ensureRaceAuth().then(() => requireName()).then(() => {
      const uid = state.userId || auth.currentUser.uid;
      const name = state.playerName || 'Player';
      const ref = database.ref('races/' + code);
      return ref.once('value').then((snap) => {
        const data = snap.val();
        if (!data) { toast('No race with that code.', 'warn'); return; }
        if (data.status !== 'waiting') { toast('That race already started.', 'warn'); return; }
        const players = data.players || {};
        const ids = Object.keys(players);
        if (ids.length >= 2 && !players[uid]) { toast('That race is full.', 'warn'); return; }
        const h = startRaceContext(code, 'guest', uid);
        h.word = data.word; h.wordLength = data.wordLength || CONFIG.DEFAULT_LENGTH;
        h.oppUid = ids.find((id) => id !== uid) || null;
        state.h2h = h;
        return ref.child('players/' + uid).set(racePlayerSeed(name)).then(() => {
          h.ref.child('players/' + uid + '/connected').onDisconnect().set(false);
          showH2HPane('waiting');
          $('h2h-code-display').textContent = code;
          subscribeRace(h);
        });
      });
    }).catch((err) => {
      console.error('joinRace failed', err);
      toast('Could not join. Check the code and your connection.', 'error');
    });
  }
```

**Step 2: Verify (two Playwright contexts — A=host, B=guest)**

- Context A: Create race → note the code.
- Context B: open app, Versus → type the code → Join.
- Confirm B reaches the waiting pane; in A's console the node now has 2 `players`:
```js
await firebase.database().ref('races/CODE/players').once('value').then(s => Object.keys(s.val()).length) // 2
```

**Step 3: Commit**
```bash
git add script.js
git commit -m "feat(h2h): join race by code with validation"
```

---

## Task 7: Subscribe + host transitions room to "live"

**Files:**
- Modify: `script.js` (replace the `subscribeRace` stub).

**Step 1: Implement `subscribeRace`** — the single source of truth that reacts to every change.

```js
  function subscribeRace(h) {
    if (h._bound) return;
    h._bound = true;
    // Capture server clock offset once.
    database.ref('.info/serverTimeOffset').once('value').then((s) => { state.serverOffset = s.val() || 0; });

    h.handler = (snap) => {
      const data = snap.val();
      if (!data) { onRaceVanished(h); return; }
      h.latest = data;
      const players = data.players || {};
      const ids = Object.keys(players);
      h.oppUid = ids.find((id) => id !== h.myUid) || h.oppUid;

      // Host starts the race once two connected players are present.
      if (data.status === 'waiting' && h.role === 'host' && ids.length >= 2) {
        const startAt = Date.now() + state.serverOffset + 3500;
        h.ref.update({ status: 'live', startAt });
        return; // next snapshot will carry status:'live'
      }

      if (data.status === 'live' && !h.started) {
        h.started = true;
        beginRace(h, data);
      }

      if (data.status === 'live' && h.started) {
        renderOpponent(h, players[h.oppUid]);
        maybeResolve(h, data);
      }

      if (data.status === 'done' && !h.finished) {
        h.finished = true;
        showRaceResult(h, data);
      }
    };
    h.ref.on('value', h.handler);
  }

  function onRaceVanished(h) {
    // Opponent or host tore the room down before it started.
    if (h.finished || h.started) return;
    toast('The race was cancelled.', 'warn');
    teardownRace(h);
    showH2HPane('home');
  }
```

Add stubs to keep the file runnable: `function beginRace(){}`, `function renderOpponent(){}`, `function maybeResolve(){}`, `function showRaceResult(){}`, and:
```js
  function teardownRace(h) {
    if (!h) return;
    if (h.handler) h.ref.off('value', h.handler);
    h.ref.onDisconnect().cancel();
    state.h2h = null;
  }
```
Update `leaveRace` to use `teardownRace` + remove the node if still waiting/host:
```js
  function leaveRace() {
    const h = state.h2h;
    if (h) {
      const wasWaiting = !h.started;
      teardownRace(h);
      if (wasWaiting) h.ref.remove().catch(() => {});
      else h.ref.child('players/' + h.myUid + '/connected').set(false).catch(() => {});
    }
    closeModal('h2h-modal');
  }
```

**Step 2: Verify (two contexts)**

A creates, B joins. Confirm in both consoles the node flips to `status:'live'` with a numeric `startAt`:
```js
await firebase.database().ref('races/CODE/status').once('value').then(s => s.val()) // "live"
await firebase.database().ref('races/CODE/startAt').once('value').then(s => typeof s.val()) // "number"
```
(Boards won't start yet — `beginRace` is still a stub.)

**Step 3: Commit**
```bash
git add script.js
git commit -m "feat(h2h): subscribe to race + host transition to live"
```

---

## Task 8: Begin the race — synced countdown + board + input routing

**Files:**
- Modify: `script.js` — `beginRace`, `handleKeyPress` (line 397), new race-input helpers.

**Step 1: Implement the synced countdown + `beginRace`**

```js
  function beginRace(h, data) {
    closeModal('h2h-modal');
    h.word = data.word;
    h.wordLength = data.wordLength || CONFIG.DEFAULT_LENGTH;
    // Set up the player's own board reusing solo rendering.
    state.wordLength = h.wordLength;
    state.currentGuess = '';
    state.guesses = [];
    state.correctPositions = new Array(h.wordLength).fill(false);
    state.gameActive = false;       // stays false until GO; race uses h.active
    state.animating = false;
    createBoard();
    createKeyboard();
    updateBoard();
    // Opponent panel on, board context line shows race.
    $('opponent-panel').hidden = false;
    setOpponentName(h);
    renderOpponent(h, (data.players || {})[h.oppUid]);
    $('mode-indicator').textContent = 'Head to Head · race';
    runCountdown(data.startAt, () => {
      h.active = true;
      h.startTime = Date.now();
      $('h2h-countdown').hidden = true;
    });
  }

  function setOpponentName(h) {
    const opp = (h.latest && h.latest.players && h.latest.players[h.oppUid]) || {};
    $('opp-name').textContent = opp.name || 'Opponent';
  }

  function runCountdown(startAt, onGo) {
    const overlay = $('h2h-countdown');
    const num = $('h2h-countdown-num');
    overlay.hidden = false;
    const tick = () => {
      const now = Date.now() + state.serverOffset;
      const remain = startAt - now;
      if (remain <= 0) { onGo(); return; }
      const secs = Math.ceil(remain / 1000);
      if (num.textContent !== String(secs)) {
        num.textContent = secs;
        if (!reduceMotion()) { num.classList.remove('pulse'); void num.offsetWidth; num.classList.add('pulse'); }
      }
      requestAnimationFrame(tick);
    };
    tick();
  }
```

**Step 2: Route input to the race path** — at the very top of `handleKeyPress` (line 397), before the existing solo guard, add:

```js
  function handleKeyPress(rawKey) {
    if (state.h2h && state.h2h.active) { return raceKeyPress(rawKey); }
    if (!state.gameActive || state.animating) return;
    // …existing solo body…
```

**Step 3: Add `raceKeyPress`** (mirrors solo handling but targets the race; submit is in Task 9)

```js
  function raceKeyPress(rawKey) {
    const h = state.h2h;
    if (!h || !h.active || state.animating) return;
    ensureAudio();
    flashKey(rawKey);
    const key = rawKey.toLowerCase();
    if (key === 'enter') {
      if (state.currentGuess.length !== h.wordLength) { toast('Not enough letters.', 'warn'); shakeCurrentRow(); return; }
      if (!isValidGuess(state.currentGuess)) { toast('Not in word list.', 'warn'); shakeCurrentRow(); return; }
      raceSubmitGuess();
    } else if (key === 'backspace') {
      state.currentGuess = state.currentGuess.slice(0, -1);
      updateBoard(); setTyping(h, state.currentGuess.length > 0);
    } else if (/^[a-z]$/.test(key)) {
      if (state.currentGuess.length < h.wordLength) { state.currentGuess += key; updateBoard(); setTyping(h, true); }
    }
  }

  function setTyping(h, typing) {
    if (h.typing === typing) return;       // throttle: only write on change
    h.typing = typing;
    h.ref.child('players/' + h.myUid + '/typing').set(typing).catch(() => {});
  }
```

Add `function raceSubmitGuess(){}` stub for now.

Also: the physical keyboard handler (`bindPhysicalKeyboard`, line 1292) bails when `anyModalOpen()`. During a race no modal is open, so it works — but the lobby modal *is* open right up until `beginRace` closes it. Confirm `closeModal('h2h-modal')` runs at the top of `beginRace` (it does). Good.

**Step 4: Verify (two contexts)**

A creates, B joins. Both should show a synchronized 3·2·1 overlay that disappears at the same instant, revealing the board + opponent panel. Type letters in A: tiles fill; `firebase…/players/<A>/typing` becomes `true`. (No submit yet.)

**Step 5: Commit**
```bash
git add script.js
git commit -m "feat(h2h): synced countdown, race board setup, input routing"
```

---

## Task 9: Submit a guess in a race (local eval + flip + write progress)

**Files:**
- Modify: `script.js` — replace `raceSubmitGuess` stub.

**Step 1: Implement `raceSubmitGuess`** (reuses the solo flip animation; writes the row code, not letters)

```js
  function raceSubmitGuess() {
    const h = state.h2h;
    state.animating = true;
    const board = $('game-board');
    const row = board.children[state.guesses.length];
    const tiles = row.children;
    const evaluation = evaluateGuess(state.currentGuess, h.word);

    for (let i = 0; i < h.wordLength; i++) {
      const tile = tiles[i];
      tile.style.setProperty('--flip-delay', `${i * CONFIG.FLIP_STEP_MS}ms`);
      tile.classList.add('flip');
      setTimeout(() => {
        tile.classList.add(evaluation[i]);
        if (evaluation[i] === 'correct') {
          if (!state.correctPositions[i]) { state.correctPositions[i] = true; tile.classList.add('correct-first-time'); }
          playPopSound();
        }
        updateKeyColor(state.currentGuess[i], evaluation[i]);
      }, i * CONFIG.FLIP_STEP_MS + CONFIG.FLIP_DURATION_MS / 2);
    }

    const code = encodeEval(evaluation);
    const won = state.currentGuess === h.word;
    const totalDelay = h.wordLength * CONFIG.FLIP_STEP_MS + CONFIG.FLIP_DURATION_MS;
    setTimeout(() => {
      state.guesses.push(state.currentGuess);
      h.guesses.push(code);
      state.currentGuess = '';
      state.animating = false;
      h.typing = false;
      // Publish my row(s) + count. Letters never leave the device.
      h.ref.child('players/' + h.myUid).update({
        progress: h.guesses,
        guesses: h.guesses.length,
        typing: false,
        greens: greenCount(code),
      }).catch(() => {});

      if (won) {
        h.active = false;
        claimWin(h);
      } else if (h.guesses.length >= CONFIG.MAX_GUESSES) {
        h.active = false;
        declareFailed(h);
      } else {
        updateBoard();
      }
    }, totalDelay);
  }
```

Add stubs `function claimWin(){}`, `function declareFailed(){}` (Task 11).

**Step 2: Verify (two contexts)**

A creates, B joins, race starts. In A, guess a valid (wrong) word. Confirm in B's console:
```js
await firebase.database().ref('races/CODE/players/<A_uid>').once('value').then(s => s.val())
// -> { progress:["..."], guesses:1, greens:N, typing:false, ... }   NO letters present
```
Confirm `progress` contains only `0/1/2` strings, never letters.

**Step 3: Commit**
```bash
git add script.js
git commit -m "feat(h2h): submit guess writes colour codes + count (no letters)"
```

---

## Task 10: Render the opponent's progress live

**Files:**
- Modify: `script.js` — replace `renderOpponent` stub.

**Step 1: Implement `renderOpponent`**

```js
  function renderOpponent(h, opp) {
    const grid = $('opp-grid');
    const status = $('opp-status');
    if (!opp) { grid.innerHTML = ''; status.textContent = 'guess 0/6'; return; }
    const len = h.wordLength;
    const progress = opp.progress || [];
    grid.style.setProperty('--len', len);
    let html = '';
    for (let r = 0; r < CONFIG.MAX_GUESSES; r++) {
      const code = progress[r];
      html += `<div class="opp-row" style="--len:${len}">`;
      for (let c = 0; c < len; c++) {
        if (code) {
          const cls = code[c] === '2' ? 'correct' : code[c] === '1' ? 'present' : 'absent';
          html += `<span class="opp-cell ${cls}"></span>`;
        } else {
          html += `<span class="opp-cell empty"></span>`;
        }
      }
      html += '</div>';
    }
    grid.innerHTML = html;
    const n = (opp.progress || []).length;
    status.textContent = opp.solved ? 'solved!' : opp.failed ? 'out of guesses' : `guess ${n}/6`;
    status.classList.toggle('typing', !!opp.typing && !opp.solved && !opp.failed);
  }
```

**Step 2: Verify (two contexts)**

Race A vs B. As B guesses, A's opponent panel fills with the matching colour blocks row by row, the `guess n/6` counter increments, and a "typing…" hint appears while B is mid-word (no letters ever shown). Toggle reduced-motion and confirm blocks still update (just without the fade).

**Step 3: Commit**
```bash
git add script.js
git commit -m "feat(h2h): live opponent colour-block rendering"
```

---

## Task 11: Sudden-death resolution (win / loss / draw) + result modal

**Files:**
- Modify: `script.js` — `claimWin`, `declareFailed`, `maybeResolve`, `showRaceResult`.

**Step 1: Implement resolution**

```js
  function claimWin(h) {
    h.ref.child('players/' + h.myUid).update({
      solved: true, solvedAt: firebase.database.ServerValue.TIMESTAMP,
    });
    // First correct submission to write `winner` wins. Transaction aborts if set.
    h.ref.child('winner').transaction((cur) => (cur === null ? h.myUid : undefined));
    // Flip room to done once winner is committed.
    h.ref.child('winner').once('value').then(() => h.ref.child('status').set('done'));
  }

  function declareFailed(h) {
    h.ref.child('players/' + h.myUid).update({ failed: true });
    // resolution for the both-failed case happens in maybeResolve (host-agnostic transaction)
  }

  // Decide a winner when both players have run out (draw / greens tiebreak).
  function maybeResolve(h, data) {
    if (data.winner) return;                     // someone already solved
    const players = data.players || {};
    const ids = Object.keys(players);
    if (ids.length < 2) return;
    const allFailed = ids.every((id) => players[id].failed);
    if (!allFailed) return;
    h.ref.child('winner').transaction((cur) => {
      if (cur !== null) return undefined;
      const [a, b] = ids;
      const ga = players[a].greens || 0, gb = players[b].greens || 0;
      if (ga > gb) return a;
      if (gb > ga) return b;
      return 'draw';
    }).then(() => h.ref.child('status').set('done'));
  }
```

**Step 2: Implement `showRaceResult`**

```js
  function showRaceResult(h, data) {
    h.active = false;
    state.gameActive = false;
    const title = $('h2h-result-title');
    const sub = $('h2h-result-subline');
    const players = data.players || {};
    const me = players[h.myUid] || {};
    const opp = players[h.oppUid] || {};
    const winner = data.winner;
    let won = winner === h.myUid;
    let headline, line;
    if (winner === 'draw') {
      headline = 'Draw';
      line = `Nobody solved ${h.word.toUpperCase()}.`;
    } else if (won) {
      headline = 'You win! 🏆';
      line = me.solved
        ? `Solved in ${me.guesses} · ${opp.name || 'Opponent'} ${opp.solved ? 'also solved' : 'missed it'}.`
        : `${opp.name || 'Opponent'} ran out of guesses.`;
    } else {
      headline = `${opp.name || 'Opponent'} wins`;
      line = opp.solved ? `${opp.name || 'Opponent'} got it in ${opp.guesses}.` : 'You ran out of guesses.';
    }
    title.textContent = headline;
    sub.textContent = line;
    renderWordTiles($('h2h-result-tiles'), h.word, won || winner === 'draw' ? winner !== 'draw' : false);
    // Definition (reuse solo helper)
    const def = $('h2h-result-def');
    def.innerHTML = '<em class="def-loading">Looking it up…</em>';
    fetchWordDefinition(h.word)
      .then((details) => {
        def.innerHTML = '';
        details.forEach((d) => {
          const p = document.createElement('p'); p.className = 'def-entry';
          const pos = document.createElement('em'); pos.className = 'def-pos'; pos.textContent = d.partOfSpeech;
          p.appendChild(pos); p.appendChild(document.createTextNode(d.definitions.join('; ')));
          def.appendChild(p);
        });
      })
      .catch(() => { def.innerHTML = '<em class="def-loading">Definition not available.</em>'; });
    closeModal('h2h-modal');
    openModal('h2h-result-modal');
    if (won) triggerConfetti();
  }
```

(Simplify the `renderWordTiles` colour arg to `won || winner === 'draw' ? false : false`? Keep it readable: pass `won` so the winner sees green tiles, others see neutral. Adjust during implementation if the ternary reads awkwardly — the intent: green tiles only when you won.)

**Step 3: Verify (two contexts) — all three outcomes**

1. **A solves first:** A finishes the word → A sees "You win", B sees "A wins"; both show the word; `races/CODE/winner == A_uid`, `status == 'done'`.
2. **Reverse:** new race, B solves first → mirrored.
3. **Both fail:** both burn all 6 without solving → both see "Draw" (or greens tiebreak if one had more greens in the final standing). Confirm `winner` is `'draw'` or the higher-greens uid.

**Step 4: Commit**
```bash
git add script.js
git commit -m "feat(h2h): sudden-death win, both-fail draw, result modal"
```

---

## Task 12: Disconnect handling + leave + rematch

**Files:**
- Modify: `script.js` — subscribe handler (disconnect detection), `leaveRace`, new `rematch`; `bindUI` for result buttons.

**Step 1: Detect an opponent disconnect mid-race.** In `subscribeRace`'s handler, inside the `status === 'live' && h.started` block, after `renderOpponent`, add:

```js
        const opp = players[h.oppUid];
        if (opp && opp.connected === false && !opp.solved && !h.finished && !h._oppGone) {
          h._oppGone = true;
          offerClaimWin(h);
        }
```

Add:
```js
  function offerClaimWin(h) {
    $('opp-status').textContent = 'disconnected';
    // Lock our input and present a choice via the result modal styling.
    h.active = false;
    const t = $('h2h-result-title'), s = $('h2h-result-subline');
    t.textContent = 'Opponent left';
    s.textContent = `${$('opp-name').textContent} disconnected. Claim the win?`;
    $('h2h-result-tiles').innerHTML = '';
    $('h2h-result-def').innerHTML = '';
    const rematch = $('h2h-rematch'), leave = $('h2h-leave');
    rematch.textContent = 'Claim win';
    rematch.onclick = () => {
      h.ref.child('winner').transaction((cur) => (cur === null ? h.myUid : undefined))
        .then(() => h.ref.child('status').set('done'));
      rematch.textContent = 'Rematch'; rematch.onclick = null;
    };
    openModal('h2h-result-modal');
  }
```

(When the disconnected player's `onDisconnect` removed their `connected` flag, the surviving host still owns the node. If the *host* disconnected, the guest's room ref is the same path; the guest can still claim — the node persists because only the host's `onDisconnect().remove()` fires when status was `waiting`; once `live`, switch that cleanup off. So in `beginRace`, add `h.ref.onDisconnect().cancel();` and instead set only the per-player connected flag on disconnect: `h.ref.child('players/'+h.myUid+'/connected').onDisconnect().set(false);`.)

**Step 2: Rematch.** Host rolls a fresh word and resets both players; guests wait for the new word.

```js
  function rematchRace() {
    const h = state.h2h;
    if (!h) { closeModal('h2h-result-modal'); return; }
    closeModal('h2h-result-modal');
    h.finished = false; h.started = false; h.active = false;
    h.guesses = []; h.currentGuess = '';
    if (h.role === 'host') {
      loadWordList().then(() => {
        const word = getRandomWord(CONFIG.DEFAULT_LENGTH);
        const players = (h.latest && h.latest.players) || {};
        const reset = {};
        Object.keys(players).forEach((id) => {
          reset['players/' + id + '/progress'] = [];
          reset['players/' + id + '/guesses'] = 0;
          reset['players/' + id + '/solved'] = false;
          reset['players/' + id + '/solvedAt'] = null;
          reset['players/' + id + '/failed'] = false;
          reset['players/' + id + '/greens'] = 0;
          reset['players/' + id + '/typing'] = false;
        });
        reset.word = word; reset.winner = null;
        reset.startAt = Date.now() + state.serverOffset + 3500;
        reset.status = 'live';
        h.word = word;
        h.ref.update(reset);
      });
    } else {
      toast('Waiting for a rematch…', 'info');
    }
  }
```

Because the subscribe handler keys `beginRace` off `!h.started` and `status==='live'`, the reset (winner→null, status→live, new startAt) re-triggers `beginRace` for *both* clients automatically. Confirm the handler resets `h.started=false` on entering a fresh `live` with a new `startAt`: guard with a stored `h.lastStartAt`:

```js
      if (data.status === 'live' && data.startAt !== h.lastStartAt) {
        h.lastStartAt = data.startAt; h.started = true; h.finished = false;
        beginRace(h, data);
      }
```
(Replace the earlier `if (data.status === 'live' && !h.started)` block with this.)

**Step 3: Wire result buttons** — in `bindUI`:
```js
    $('h2h-rematch').addEventListener('click', rematchRace);
    $('h2h-leave').addEventListener('click', leaveRace);
```
Ensure `leaveRace` also closes the result modal and clears the opponent panel (`$('opponent-panel').hidden = true;`) and resets `$('mode-indicator')` to the current solo mode (call `updateModeIndicator(state.currentMode)`).

**Step 4: Verify (two contexts)**

- **Disconnect:** start a race, close context B's tab → A sees "Opponent left → Claim win"; clicking it ends the race as A's win.
- **Rematch:** finish a race normally, both click Rematch (or host clicks, guest waits) → a fresh word, new synced countdown, boards reset, opponent panel cleared of old blocks.
- **Leave:** click Leave → result modal closes, opponent panel hidden, back to the solo board in the previous mode; the race node is cleaned (`connected:false`, and removed if it was still waiting).

**Step 5: Commit**
```bash
git add script.js
git commit -m "feat(h2h): disconnect claim-win, rematch, leave/cleanup"
```

---

## Task 13: Firebase rules, README, PWA cache, manifest

**Files:**
- Modify: `README.md`, `service-worker.js`, `docs/plans/2026-06-18-head-to-head-design.md` (rules snippet).
- Manual (Firebase console): enable Anonymous auth; publish rules.

**Step 1: Document + apply Firebase Realtime DB rules.** Add this snippet to the README under a new "Head-to-Head" section, and apply it in the Firebase console (Realtime Database → Rules), merged with existing `users`/`leaderboard` rules:

```json
{
  "rules": {
    "races": {
      "$code": {
        ".read": "auth != null",
        ".write": "auth != null",
        ".validate": "newData.hasChildren(['status'])"
      }
    }
  }
}
```
Note in the README the accepted caveat: the answer is stored in the race node, so a determined cheater could read it via devtools — acceptable for a casual friends game; a true fix needs a server.

**Step 2: Enable Anonymous auth** in the Firebase console (Authentication → Sign-in method → Anonymous → Enable). Document this as a one-time setup step in the README.

**Step 3: Bump the PWA cache** so the new HTML/CSS/JS ship. In `service-worker.js`, increment `CACHE_NAME` (e.g. `wu-cache-vN` → `vN+1`). Confirm `index.html`, `style.css`, `script.js` are in the precache list (they already are).

**Step 4: README feature bullet** — add "Head to Head — live 1-v-1 race over a private room code" to the Features list.

**Step 5: Verify**

- With rules published + anon auth enabled, a full create→join→race→result cycle works from two *fresh* browser profiles (not just the dev console).
- Bump confirmed: in DevTools → Application → Service Workers, the new cache version registers; reload offline still loads the app shell.

**Step 6: Commit**
```bash
git add README.md service-worker.js docs/plans/2026-06-18-head-to-head-design.md
git commit -m "docs(h2h): firebase rules, anon auth setup, README; bump PWA cache"
```

---

## Task 14: Full regression + responsive + reduced-motion pass

**Files:** none (verification only) unless fixes are needed.

**Step 1: Two-context end-to-end matrix** (Playwright MCP, contexts A & B)

- Create + join happy path; synced countdown aligns.
- Live opponent blocks + typing indicator update both directions.
- Sudden death: A-first, B-first, both-fail draw.
- Disconnect → claim win.
- Rematch → fresh word; Leave → back to solo.
- Invalid code, full room, cancel-while-waiting.
- Solo modes (Daily/Random/6-Letter) still work unchanged; resume still works; the new `handleKeyPress` branch doesn't interfere when `state.h2h` is null.

**Step 2: Responsive** — 375×667 portrait and a landscape phone (≤520px tall): opponent panel sits beside the board in landscape, board+keyboard still fit, ≥44px targets in the lobby.

**Step 3: Reduced-motion** — countdown, flips, opponent fades all respect `prefers-reduced-motion`.

**Step 4: Commit** (only if fixes were made)
```bash
git add -A
git commit -m "fix(h2h): regression + responsive + reduced-motion polish"
```

**Step 5: Finish** — use superpowers:finishing-a-development-branch to merge/PR.

---

## Out of scope (YAGNI — do not build now)

Public matchmaking queue · best-of-N series · 6-letter races · H2H win/loss stats & leaderboard · spectating · chat/emotes.
