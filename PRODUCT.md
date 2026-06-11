# Design Context — Wordle Upgrade

## Target audience
The owner (solo player) first, plus a handful of friends who occasionally compete on the online leaderboard. Casual word-game players, all ages. Primary device is a phone; also played on desktop.

## Use cases
- Play the once-a-day Daily puzzle for a quick hit of fun.
- Unlimited Random / 6-Letter practice rounds, replayed back-to-back.
- Glance at personal stats/streak; occasionally check the leaderboard.
- Installed to the phone home screen as a PWA; works offline.

## Brand personality / tone
Familiar, tactile, quietly premium. It must read instantly as "Wordle" — players expect the dark board, the green/yellow/grey tiles, the 6×5 grid, the flip reveal. The feeling to aim for: a well-made physical toy. Calm dark surface, satisfying weight to every tap and reveal, small moments of joy on a win. Playful but not childish; refined but not corporate.

## Aesthetic direction (reimagined 2026-06-11, supersedes 2026-05-30)
**"A well-made physical toy on a dim table."** The game IS the screen; everything else lives in sheets/dialogs. Keep the recognizable Wordle DNA (dark surface, green/yellow/grey tiles, 6-row grid, flip reveal) but with committed physicality:
- Shell: slim header (wordmark + streak ember + help/stats/settings icons), segmented mode switch with sliding thumb, puzzle context line ("Puzzle #N · date"), board, keyboard. Nothing else on the main screen.
- Physicality: empty tiles read as recessed sockets (inset shadow), revealed tiles sit raised, keyboard keys are keycaps with a bottom edge that compresses on press. Caret pulse on the tile awaiting input.
- Modals are bottom sheets on mobile (drag handle, slide-up) and centered dialogs on desktop. Stats (4-stat row + pure-CSS guess distribution), settings (toggles + account + feedback), result (word-as-tiles, serif dictionary definition, live countdown to next Daily).
- Landscape phones: board and keyboard side by side.
- Motion: ease-out-expo everywhere, no bounce. Always honor `prefers-reduced-motion`.
- No Chart.js. Only CDN deps: Firebase + canvas-confetti. See DESIGN.md for tokens.

## Constraints
- Vanilla HTML/CSS/JS, no build step. Single `script.js` IIFE, single `style.css`. PWA + offline service worker. Deployed static (GitHub Pages) and served locally on :8090.
- Keep gameplay identical. Keep the established green `--correct` / yellow `--present` colors and the high-contrast (orange/blue) alternative.
- Accessibility: keyboard play, ARIA, reduced-motion, ≥44px touch targets.
