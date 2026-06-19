# Google Sign-In Design

**Date:** 2026-06-18
**Goal (user's words):** "are we doing google oauth sign in? that would be good for like users and shit."
**Branch:** folded into `feature/head-to-head`.

## Summary

Replace the email/password account flow with **Google sign-in** as the single
"real account" provider, keeping **anonymous** sign-in for pick-up-and-play
head-to-head racing. An anonymous racer who signs in with Google is **upgraded in
place** (Firebase account linking — same uid, stats preserved). **Name only** in
v1 (use the Google display name; ignore the profile photo).

## Decisions (confirmed with user)

| Question | Decision |
|---|---|
| Google vs email/password | **Replace** email/password with Google (+ anonymous for racing) |
| Anonymous → Google | **Link in place** (same uid); fall back to sign-in if that Google acct exists |
| Profile display | **Name only** (Google `displayName`); no avatar in v1 |
| Popup vs redirect | **Popup** primary; `signInWithRedirect` fallback when popup is blocked (PWA standalone) |

## Architecture

The existing `auth.onAuthStateChanged` listener stays and remains the single
source of truth for `state.userId`, name, logout visibility, and the local→cloud
stats mirror. Only the *sign-in mechanism* changes.

### `signInWithGoogle()` (new helper)

```
provider = new firebase.auth.GoogleAuthProvider()
user = auth.currentUser
if (user && user.isAnonymous):
    user.linkWithPopup(provider)
        .catch(err):
            if err.code === 'auth/credential-already-in-use':
                auth.signInWithCredential(err.credential)   // that Google acct exists → switch
            else if popup-blocked: user.linkWithRedirect(provider)
            else: toast(friendly)
else:
    auth.signInWithPopup(provider)
        .catch(err):
            if popup-blocked: auth.signInWithRedirect(provider)
            else if cancelled: (silent)
            else: toast(friendly)
```

On load, call `auth.getRedirectResult()` to complete any redirect-based flow
(handles the `credential-already-in-use` case there too).

### Name precedence

- Signed in with Google → `state.playerName = user.displayName` (write to
  `users/<uid>/profile`); `requireName()` resolves instantly (no manual prompt).
- Anonymous racer → existing `requireName()` manual-name prompt (unchanged).

### `updateUserDisplay()` change (important)

Today it keys off `state.userId`, which is **also set for anonymous users**, so an
anonymous racer would wrongly show "logged in". New rule:
```
signedIn = auth.currentUser && !auth.currentUser.isAnonymous
signedIn → "Signed in as <name>", show Log out, hide Continue-with-Google
else     → playerName || "Guest", hide Log out, show Continue-with-Google
```

## UI changes

- **Settings → Account:** the **Log in** button becomes **"Continue with Google"**
  and calls `signInWithGoogle()` directly (no intermediate modal). `user-display`
  shows "Signed in as Nick" / "Guest". **Log out** shows only for a real
  (non-anonymous) account. Note text → *"Sign in with Google to post scores to the
  leaderboard and sync across devices. Your stats are saved on this device either
  way."*
- **Removed from `index.html`:** `#auth-modal` and `#email-auth-modal`.
- **Removed from `script.js` `bindAuthUI`:** the email bindings
  (`email-signin-button`, `email-signup-button`, `email-auth-submit`, the
  signin/signup `intent` logic). `friendlyAuthError` email cases → Google-relevant
  ones (`popup-closed-by-user`, `popup-blocked`, `cancelled-popup-request`,
  `network-request-failed`, default).
- **Kept:** `#name-modal` (anonymous racers via `requireName()`).
- **H2H:** signed-in users skip the name prompt (Google name); anonymous racers
  still prompt. Race/leaderboard schema unchanged (`name` string).

## Firebase console setup (user action)

- **Enable Google** — Authentication → Sign-in method → Google → Enable (support email).
- **Authorized domains** — Authentication → Settings → Authorized domains: confirm
  `localhost`, add `birddog87.github.io`.
- (Anonymous still enabled for H2H, per the head-to-head design.)

## Edge cases

- Popup cancelled (`popup-closed-by-user` / `cancelled-popup-request`) → silent.
- Popup blocked (PWA standalone) → `signInWithRedirect` / `linkWithRedirect` +
  `getRedirectResult()` on load.
- Anonymous link → existing Google acct (`credential-already-in-use`) →
  `signInWithCredential`; throwaway anonymous uid abandoned.
- Network error → friendly toast.

## Data implications (named, accepted)

- Linking preserves the uid → synced stats survive the upgrade. A fresh sign-in
  mirrors local stats up via the existing `onAuthStateChanged` path.
- **Existing email/password accounts can no longer log in.** Acceptable for the
  owner + a few friends: they re-sign-in with Google (new uid) and their on-device
  stats mirror up. Old email-uid Firebase data orphans.

## Verification (and an honest limit)

I can verify the **wiring**: the button calls `signInWithGoogle`, email modals
gone, `friendlyAuthError` updated, no console errors on load, the popup actually
opens, and the logged-out↔signed-in UI states. I **cannot complete the Google
OAuth** (needs the user's real Google credentials, which I won't enter), so the
final "click through Google → confirm Signed in as X → post a leaderboard score"
check is the user's, alongside the console setup.

## Out of scope (v1)

Avatars/profile photos · multiple providers · account deletion/management UI ·
migrating existing email/password accounts' Firebase data.
