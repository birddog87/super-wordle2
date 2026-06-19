# Google Sign-In Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans / subagent-driven-development to implement this plan task-by-task.

**Goal:** Replace the email/password account flow with Google sign-in (single real-account provider), keeping anonymous sign-in for racing, with anonymous→Google link-in-place and name-only profile display.

**Architecture:** The existing `auth.onAuthStateChanged` listener stays as the source of truth. A new `signInWithGoogle()` helper does `linkWithPopup` for anonymous users (upgrade in place) or `signInWithPopup` otherwise, with a `signInWithRedirect` fallback when the popup is blocked. Email/password UI and bindings are removed. A new `isRealUser()` predicate (`currentUser && !isAnonymous`) gates leaderboard/stats writes and the "signed in" UI, so anonymous racers aren't treated as account holders.

**Tech Stack:** Vanilla JS single IIFE, Firebase 8.10 auth (already loaded), `GoogleAuthProvider`. No new deps.

**Testing reality:** No test runner; `node --check` is the syntax gate. The controller verifies wiring in the browser (button calls the helper, modals removed, UI states, popup opens, no console errors). **The actual Google OAuth completion cannot be automated** (needs the user's real Google credentials) — the user completes the live click-through, same as the Firebase console steps.

**Branch:** `feature/head-to-head` (folded in). Commit after every task.

---

## Task G1: `signInWithGoogle()` + `isRealUser()` + `friendlyAuthError` rewrite + redirect result

**Files:** Modify `script.js`.

**Step 1 — add helpers in the auth section** (near `bindAuthUI`, e.g. just before it):
```js
  function isRealUser() {
    return !!(auth.currentUser && !auth.currentUser.isAnonymous);
  }

  function googleProvider() {
    return new firebase.auth.GoogleAuthProvider();
  }

  // Sign in with Google. If currently anonymous, upgrade the account in place
  // (same uid). Falls back to redirect when the popup is blocked (PWA standalone).
  function signInWithGoogle() {
    const provider = googleProvider();
    const user = auth.currentUser;
    const handle = (err) => {
      if (!err) return;
      if (err.code === 'auth/credential-already-in-use' && err.credential) {
        auth.signInWithCredential(err.credential).catch((e) => toast(friendlyAuthError(e), 'error', 4000));
        return;
      }
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
        (user && user.isAnonymous ? user.linkWithRedirect(provider) : auth.signInWithRedirect(provider))
          .catch((e) => toast(friendlyAuthError(e), 'error', 4000));
        return;
      }
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return; // silent
      toast(friendlyAuthError(err), 'error', 4000);
      console.error('Google sign-in error:', err);
    };
    if (user && user.isAnonymous) {
      user.linkWithPopup(provider).catch(handle);
    } else {
      auth.signInWithPopup(provider).catch(handle);
    }
  }
```

**Step 2 — rewrite `friendlyAuthError`** to Google-relevant cases (replace the email cases):
```js
  function friendlyAuthError(err) {
    switch (err && err.code) {
      case 'auth/popup-blocked': return 'Popup blocked — retrying with a redirect.';
      case 'auth/network-request-failed': return 'Network error. Check your connection.';
      case 'auth/credential-already-in-use': return 'That Google account is already in use.';
      case 'auth/account-exists-with-different-credential': return 'An account already exists for that email.';
      case 'auth/operation-not-allowed': return 'Google sign-in is not enabled for this project.';
      default: return 'Sign-in failed. Please try again.';
    }
  }
```

**Step 3 — complete redirect-based sign-ins on load.** Inside `bindAuthUI` (Task G2 touches this too), after the `onAuthStateChanged` registration, add:
```js
    auth.getRedirectResult().catch((err) => {
      if (err && err.code === 'auth/credential-already-in-use' && err.credential) {
        auth.signInWithCredential(err.credential).catch(() => {});
      }
    });
```
(If implementing G1 before G2, add this line provisionally; G2's `bindAuthUI` rewrite keeps it.)

**Verify:** `node --check script.js` → exit 0. grep one definition each of `signInWithGoogle`, `isRealUser`, `googleProvider`; `friendlyAuthError` no longer references `wrong-password`/`user-not-found`.

**Commit:** `feat(auth): signInWithGoogle helper, isRealUser, friendlyAuthError for Google`

---

## Task G2: rewire `bindAuthUI`, `updateUserDisplay`, and gate Firebase writes on `isRealUser()`

**Files:** Modify `script.js`.

**Step 1 — rewrite `bindAuthUI`.** Replace the whole function body with:
```js
  function bindAuthUI() {
    auth.onAuthStateChanged((user) => {
      if (user && !user.isAnonymous) {
        state.userId = user.uid;
        state.playerName = user.displayName || state.playerName || localStorage.getItem(CONFIG.LS.NAME) || 'Player';
        localStorage.setItem(CONFIG.LS.NAME, state.playerName);
        database.ref(`users/${user.uid}/profile`).update({ name: state.playerName });
        const local = loadStats();
        if (local.gamesPlayed > 0) syncStatsToFirebase(local);
      } else if (user && user.isAnonymous) {
        state.userId = user.uid; // has a uid for racing, but not a "real" account
        state.playerName = localStorage.getItem(CONFIG.LS.NAME) || state.playerName || '';
      } else {
        state.userId = null;
        state.playerName = localStorage.getItem(CONFIG.LS.NAME) || '';
      }
      updateUserDisplay();
    });

    auth.getRedirectResult().catch((err) => {
      if (err && err.code === 'auth/credential-already-in-use' && err.credential) {
        auth.signInWithCredential(err.credential).catch(() => {});
      }
    });

    $('login-button').addEventListener('click', signInWithGoogle);
    $('logout-button').addEventListener('click', () => {
      auth.signOut().catch((err) => console.error('Logout failed:', err));
    });
  }
```
(No more `email-signin-button` / `email-signup-button` / `email-auth-submit` bindings, no `openModal('auth-modal')`.)

**Step 2 — `updateUserDisplay`** to distinguish a real account from anonymous:
```js
  function updateUserDisplay() {
    const userDisplay = $('user-display');
    const loginBtn = $('login-button');
    const logoutBtn = $('logout-button');
    if (isRealUser()) {
      userDisplay.textContent = `Signed in as ${state.playerName || 'Player'}`;
      logoutBtn.style.display = 'inline-block';
      loginBtn.style.display = 'none';
    } else {
      userDisplay.textContent = state.playerName ? state.playerName : 'Guest';
      logoutBtn.style.display = 'none';
      loginBtn.style.display = 'inline-block';
    }
  }
```

**Step 3 — gate Firebase account writes on `isRealUser()`.** In `endGame` (currently `if (state.userId) { writeLeaderboard(...); syncStatsToFirebase(...); }`), change the guard to `if (isRealUser())`. Also in `updateAchievements` (the `if (state.userId) database.ref(...achievements...)` line) change to `if (isRealUser())`, and at the top of `syncStatsToFirebase` change `if (!state.userId) return;` to `if (!isRealUser()) return;`. This keeps the leaderboard and cloud stats to real accounts only (anonymous racers don't post solo scores).

**Verify:** `node --check script.js` → exit 0. grep: `bindAuthUI` no longer references `email-signin-button`/`auth-modal`; `endGame`/`updateAchievements`/`syncStatsToFirebase` use `isRealUser()`. Confirm `$('login-button')` is bound exactly once.

**Commit:** `feat(auth): Google-only bindAuthUI, real-vs-anon user display, gate leaderboard writes`

---

## Task G3: remove email modals; update Settings account UI

**Files:** Modify `index.html`.

**Step 1 — remove markup:** delete the entire `#auth-modal` block and the entire `#email-auth-modal` block.

**Step 2 — Settings account section:** change the login button text and the note. In `.settings-account`:
- `<button id="login-button" type="button">Log in</button>` → `<button id="login-button" type="button">Continue with Google</button>`
- The `account-note` paragraph text → `Sign in with Google to post scores to the leaderboard and sync across devices. Your stats are saved on this device either way.`
- Keep `#logout-button` and `#user-display` ids unchanged.

**Verify:** `grep -c 'id="auth-modal"' index.html` → 0; `grep -c 'id="email-auth-modal"' index.html` → 0; `grep -c 'id="login-button"' index.html` → 1; `grep "Continue with Google" index.html` present. `<div>`/`</div>` balance still matches. Confirm no remaining references in index.html to `email-signin-button`, `email-signup-button`, `email-auth-submit`, `user-email`, `user-password`.

**Commit:** `feat(auth): remove email auth modals, Settings uses Continue with Google`

---

## Task G4: README Google setup + PWA cache bump

**Files:** Modify `README.md`, `service-worker.js`.

**Step 1 — README:** under the Head-to-Head section (or a new "Accounts" note), document the Google console setup: enable Google provider (Authentication → Sign-in method → Google), and add `birddog87.github.io` to Authorized domains (confirm `localhost` present). Note that accounts are optional and stats are local-first.

**Step 2 — cache bump:** in `service-worker.js`, `CACHE_NAME` `wordle-upgrade-cache-v9` → `v10` (index.html + script.js changed again).

**Verify:** `grep -n v10 service-worker.js`; README mentions Google provider + authorized domains. Main checkout untouched.

**Commit:** `docs(auth): Google sign-in setup in README; bump PWA cache to v10`

---

## Verification (controller, after G1–G4)

Browser (worktree on :4173, SW cleared): Settings shows **Continue with Google**; clicking it attempts a Google popup (opens, or errors `operation-not-allowed` if the provider isn't enabled yet — that itself confirms the wiring). No console errors on load; `auth-modal`/`email-auth-modal` gone from the DOM; logged-out shows "Guest". The **full OAuth click-through + leaderboard post is the user's** (needs the Google provider enabled + their real Google account).

## Out of scope (v1)
Avatars, multiple providers, account deletion UI, migrating old email/password Firebase data.
