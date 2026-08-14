/**
 * Regression cover for: "on mobile, sharing the code or backgrounding the app
 * kills the head-to-head race".
 *
 * Mobile browsers close the page's WebSocket whenever the page is hidden (share
 * sheet, app switch, screen lock). Firebase then executes the queued
 * onDisconnect operations server-side. database.goOffline() closes the same
 * socket the same way, so it reproduces the server-side consequence exactly.
 *
 * Scenarios 1-2 are the reported bug. Scenarios 3-7 cover the behaviour the fix
 * has to preserve: a player who really leaves still forfeits, cancelling still
 * cleans up, stale rooms still die, and an ordinary race still finishes.
 *
 * Runs against the real Firebase project: it creates a few race rooms and
 * deletes them again, exactly as normal play does.
 *
 * Needs Playwright (`npm i -g playwright && playwright install chromium`), then:
 *
 *   python3 -m http.server 8123 --bind 127.0.0.1        # serve this directory
 *   NODE_PATH=$(npm root -g) BASE=http://127.0.0.1:8123 node tools/h2h-presence-check.mjs
 *
 * (ESM ignores NODE_PATH, so if the import fails, symlink the global module dir:
 *  `ln -s "$(npm root -g)" node_modules`.)
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8123';
const GRACE_MS = Number(process.env.GRACE_MS || 20000);

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPlayer(browser, name) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.addInitScript((n) => {
    localStorage.setItem('playerName', n);
    localStorage.setItem('wu_seen_help', '1');
    window.__toasts = [];
    document.addEventListener('DOMContentLoaded', () => {
      const c = document.getElementById('toast-container');
      if (!c) return;
      new MutationObserver((muts) => {
        muts.forEach((m) => m.addedNodes.forEach((n) => window.__toasts.push(n.textContent)));
      }).observe(c, { childList: true });
    });
  }, name);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [${name}] pageerror: ${e.message}`));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.firebase && !!document.getElementById('open-h2h'));
  await page.evaluate(async () => {
    if (!window.firebase.auth().currentUser) await window.firebase.auth().signInAnonymously();
  });
  return page;
}

const readRoom = (page, code) =>
  page.evaluate(async (c) => {
    const snap = await window.firebase.database().ref('races/' + c).once('value');
    return snap.val();
  }, code);

const dropRoom = (page, code) =>
  page.evaluate((c) => window.firebase.database().ref('races/' + c).remove(), code).catch(() => {});

const toasts = (page) => page.evaluate(() => window.__toasts || []);

const openH2H = async (page) => {
  await page.click('#open-h2h');
  await page.click('#friends-h2h');
  await page.waitForSelector('#h2h-modal.open');
};

async function hostCreatesRace(host) {
  await openH2H(host);
  await host.click('#h2h-create');
  await host.waitForFunction(
    () => /^[A-Z0-9]{4}$/.test(document.getElementById('h2h-code-display').textContent.trim()),
    null, { timeout: 15000 });
  return (await host.textContent('#h2h-code-display')).trim();
}

async function guestJoins(guest, code) {
  await openH2H(guest);
  await guest.fill('#h2h-code-input', code);
  await guest.click('#h2h-join');
}

async function startedRace(browser) {
  const host = await newPlayer(browser, 'HOST');
  const guest = await newPlayer(browser, 'GUEST');
  const code = await hostCreatesRace(host);
  await guestJoins(guest, code);
  await host.waitForFunction(() => !document.getElementById('opponent-panel').hidden, null, { timeout: 20000 });
  await guest.waitForFunction(() => !document.getElementById('opponent-panel').hidden, null, { timeout: 20000 });
  await sleep(4500); // synced 3.5s countdown
  return { host, guest, code };
}

// Simulate the page being hidden on mobile: the browser drops the socket and the
// server runs the queued onDisconnect writes.
const background = (page) => page.evaluate(() => window.firebase.database().goOffline());
const foreground = (page) => page.evaluate(() => window.firebase.database().goOnline());

const claimOffered = (page) => page.evaluate(() =>
  document.getElementById('h2h-result-modal').classList.contains('open') &&
  document.getElementById('h2h-result-title').textContent.includes('Opponent left'));

// ---------------------------------------------------------------- scenarios

async function s1_shareWhileWaiting(browser) {
  console.log('\n=== 1: host taps Share (page hidden) while waiting for an opponent ===');
  const host = await newPlayer(browser, 'HOST');
  const probe = await newPlayer(browser, 'PROBE');
  const code = await hostCreatesRace(host);
  console.log(`  room ${code}`);
  check('room exists after create', !!(await readRoom(probe, code)));

  await background(host);
  await sleep(2500);
  const room = await readRoom(probe, code);
  check('room survives the host being backgrounded', !!room,
        room ? '' : `races/${code} was deleted by onDisconnect().remove()`);

  await foreground(host);
  await sleep(2500);
  check('host still sees the waiting lobby after returning',
        await host.evaluate(() => !document.getElementById('h2h-waiting').hidden));
  check('room still joinable after the host returns', !!(await readRoom(probe, code)));

  await dropRoom(probe, code);
  await host.context().close(); await probe.context().close();
}

async function s2_backgroundMidRace(browser) {
  console.log('\n=== 2: a player glances at another app mid-race ===');
  const { host, guest, code } = await startedRace(browser);
  console.log(`  room ${code}`);
  check('race started for both players',
        await guest.evaluate(() => !document.getElementById('opponent-panel').hidden));

  await background(guest);
  await sleep(3000);
  const shown = await claimOffered(host);
  check('host is NOT told the opponent left after a 3s background', !shown,
        shown ? 'result modal showed "Opponent left / Claim win" immediately' : '');
  check('host sees a reconnecting hint instead',
        (await host.textContent('#opp-status')).includes('reconnecting'));

  await foreground(guest);
  await sleep(3000);
  const flags = await host.evaluate(async (c) => {
    const snap = await window.firebase.database().ref('races/' + c + '/players').once('value');
    return Object.values(snap.val() || {}).map((p) => p.connected);
  }, code);
  check('both players read as connected after the guest returns',
        flags.every((v) => v !== false), `connected: ${JSON.stringify(flags)}`);
  check('guest is still in the race after returning',
        await guest.evaluate(() => !document.getElementById('opponent-panel').hidden &&
          !document.getElementById('h2h-result-modal').classList.contains('open')));

  await dropRoom(host, code);
  await host.context().close(); await guest.context().close();
}

async function s3_realDeparture(browser) {
  console.log('\n=== 3: opponent really leaves — claim win still works, after the grace window ===');
  const { host, guest, code } = await startedRace(browser);
  console.log(`  room ${code}`);
  await guest.context().close();               // tab closed = a genuine disconnect

  await sleep(GRACE_MS + 4000);
  check('claim-win offer appears once the grace window expires', await claimOffered(host));

  await host.click('#h2h-rematch');             // the button reads "Claim win" here
  await host.waitForFunction(
    () => document.getElementById('h2h-result-title').textContent.includes('You win'),
    null, { timeout: 15000 }).catch(() => {});
  check('claiming the win resolves the race',
        (await host.textContent('#h2h-result-title')).includes('You win'));

  await dropRoom(host, code);
  await host.context().close();
}

async function s4_returnsBeforeClaim(browser) {
  console.log('\n=== 4: opponent comes back after the offer but before the win is claimed ===');
  const { host, guest, code } = await startedRace(browser);
  console.log(`  room ${code}`);
  await background(guest);
  await sleep(GRACE_MS + 4000);
  check('offer appeared while they were away', await claimOffered(host));

  await foreground(guest);
  await sleep(4000);
  check('offer is withdrawn when they reconnect',
        await host.evaluate(() => !document.getElementById('h2h-result-modal').classList.contains('open')));
  check('host was told the opponent is back',
        (await toasts(host)).some((t) => /reconnected/i.test(t)));

  await host.keyboard.type('crane');
  check('host can type again after the race resumes',
        await host.evaluate(() => !!document.querySelector('#game-board .tile')?.textContent.trim()));

  await dropRoom(host, code);
  await host.context().close(); await guest.context().close();
}

async function s5_cancelStillCleansUp(browser) {
  console.log('\n=== 5: cancelling the lobby still removes the room ===');
  const host = await newPlayer(browser, 'HOST');
  const probe = await newPlayer(browser, 'PROBE');
  const code = await hostCreatesRace(host);
  await host.click('#h2h-cancel');
  await sleep(2000);
  check('cancelled room is deleted', !(await readRoom(probe, code)));
  await host.context().close(); await probe.context().close();
}

async function s6_staleRoomRetired(browser) {
  console.log('\n=== 6: a waiting room nobody joined is retired by age ===');
  const host = await newPlayer(browser, 'HOST');
  const guest = await newPlayer(browser, 'GUEST');
  const code = await hostCreatesRace(host);
  await host.context().close();                 // host is long gone
  await guest.evaluate((c) => window.firebase.database()
    .ref('races/' + c + '/createdAt').set(Date.now() - 2 * 60 * 60 * 1000), code);

  await guestJoins(guest, code);
  await sleep(3000);
  check('stale room is rejected on join',
        (await toasts(guest)).some((t) => /No race with that code/i.test(t)));
  check('stale room is deleted on the way out', !(await readRoom(guest, code)));
  await guest.context().close();
}

async function s7_ordinaryRaceStillFinishes(browser) {
  console.log('\n=== 7: an ordinary race still plays out and rematches ===');
  const { host, guest, code } = await startedRace(browser);
  console.log(`  room ${code}`);
  const word = (await readRoom(host, code)).word;
  await host.keyboard.type(word);
  await host.keyboard.press('Enter');
  await host.waitForSelector('#h2h-result-modal.open', { timeout: 20000 });
  check('solver sees the win', (await host.textContent('#h2h-result-title')).includes('You win'));
  await guest.waitForSelector('#h2h-result-modal.open', { timeout: 20000 }).catch(() => {});
  check('opponent sees the loss', (await guest.textContent('#h2h-result-title')).includes('wins'));

  await host.click('#h2h-rematch');
  await guest.waitForFunction(
    () => !document.getElementById('h2h-result-modal').classList.contains('open'), null, { timeout: 20000 }).catch(() => {});
  await sleep(5000);
  const newWord = (await readRoom(host, code)).word;
  check('rematch deals a new word and restarts both boards',
        newWord !== word && await guest.evaluate(() => !document.getElementById('opponent-panel').hidden),
        `${word} -> ${newWord}`);

  await dropRoom(host, code);
  await host.context().close(); await guest.context().close();
}

const browser = await chromium.launch();
try {
  await s1_shareWhileWaiting(browser);
  await s2_backgroundMidRace(browser);
  await s3_realDeparture(browser);
  await s4_returnsBeforeClaim(browser);
  await s5_cancelStillCleansUp(browser);
  await s6_staleRoomRetired(browser);
  await s7_ordinaryRaceStillFinishes(browser);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
