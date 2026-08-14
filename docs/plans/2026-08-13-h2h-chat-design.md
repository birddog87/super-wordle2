# Head-to-Head smack talk — design

**Date:** 2026-08-13
**Status:** approved

## What it is

Trash talk inside a live race. Two halves, because a phone mid-race has no room
for a text field and no spare keyboard:

- **Mid-race:** a `💬` button on the opponent card opens a popover of six canned
  jabs. Tap one, it lands on their screen as a floating bubble. No typing.
- **Between rounds:** a real chat thread — scrollback, input, send — in the
  waiting lobby and on the result modal, the two places you are not racing.

Solo, daily and challenge play are untouched.

## Why not free text everywhere

The letters you type *are* the game's input. A text field mid-race means the
native keyboard slides up over both the board and the game keyboard, and every
keystroke has to be arbitrated between chat and guess. Presets sidestep the
whole problem and are faster to fire when you are three seconds from solving.

## Data

One node per room, dying with the room:

```
races/<CODE>/chat/<pushId> = {
  uid, name, text, kind: 'jab' | 'said', at: <ServerValue.TIMESTAMP>
}
```

A jab and a typed message are the same record. `kind` only decides how it is
drawn. `name` is denormalised so a thread still reads correctly after someone
leaves.

Verified against the live rules: pushing to and reading `races/<code>/chat` is
permitted for any authenticated client, so no console change is needed.

### History replay

Clients subscribe with `.limitToLast(40).on('child_added')`, so the thread comes
back on reconnect — which matters now that a race survives a phone restart.

That creates one trap: on attach, `child_added` fires once per existing message.
Twenty bubbles must not fly across the board when you rejoin. Firebase fires
every backfilled `child_added` *before* the corresponding `value` event, so a
one-shot `once('value')` marks the boundary exactly:

```
h._chatPrimed = false
h._chatRef.once('value').then(() => { h._chatPrimed = true })
```

Messages arriving while `_chatPrimed` is false fill the log silently. Everything
after floats.

## Rules

| Rule | Value | Why |
|---|---|---|
| Send rate | 1 per 1500ms, controls disabled while cooling | Jab buttons are irresistible |
| Length | 120 chars | Fits the bubble; keeps the node small |
| Escaping | rendered with `textContent` | No markup can escape, by construction |
| History | whole life of the room, across rematches | Scrolling back through three rounds is half the fun |
| Delivery | any incoming message floats if you are mid-race | One rule everywhere, jab or typed |
| Own messages | logged, never floated | You know what you said |

## Interface

**The button.** `💬` in the opponent card header beside `guess 3/6`, with a dot
when something arrived that you have not seen in the thread. Tapping it opens
the jab popover; tapping a jab sends and closes it. Escape and an outside click
also close it.

**The deck.** `too slow 🐌` · `nice try` · `any day now` · `🔥` · `gg` · `👀`

Cheeky, not cruel — this gets played with partners and kids. Anything sharper
can be typed by hand between rounds.

**The bubble.** Floats above the opponent card, holds 2.5s, fades. Up to three
stack; a fourth evicts the oldest. Honors `reduceMotion()` like the rest of the
app.

**The thread.** One `#chat-panel` element — log, input, send — moved between a
mount in the waiting lobby and a mount in the result modal. Built once, so the
two never drift apart. Hidden when no race is running.

**Screen readers.** Bubbles land in an `aria-live` region so incoming messages
are announced rather than only flashed; the log is `role="log"`. The opponent
panel already declares `aria-live="polite"`, so this follows the existing grain.

## Deliberately out

- No notification sound or haptic. The pop sound means "correct letter" and
  muddying it costs more than it gives.
- No custom jab editor. Six presets and a text field already cover it.
- No moderation or filtering. This is a 4-character code you hand to a friend.

## Testing

Extends `tools/h2h-presence-check.mjs`, which already drives two real browsers
through a full race:

1. Jab mid-race → bubble lands on the opponent's board, not on the sender's.
2. Typed message in the lobby → appears in both threads.
3. Reload mid-race → history returns, and **no** stale bubbles float.
4. Cooldown → a rapid second send is dropped.
5. The race itself still plays out and rematches with chat present.

## Known adjacent issue

The database rules let any authenticated client write anywhere under a race,
including another player's node. Unrelated to chat and pre-existing, but it is
what makes chat trivially writable too. Worth tightening separately.
