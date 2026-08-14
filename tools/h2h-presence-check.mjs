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


// --- restart / rematch -------------------------------------------------------

const canType = async (page, letters) => {
  await page.keyboard.type(letters);
  await sleep(400);
  return page.evaluate(() => {
    const t = document.querySelector('#game-board .tile');
    return !!(t && t.textContent.trim());
  });
};

// A wrong-but-valid guess, so the race does not end.
const decoyGuess = (word) => (word === 'crane' ? 'slate' : 'crane');

async function s8_restartWhileWaiting(browser) {
  console.log('\n=== 8: the phone restarts the page while the host is waiting ===');
  const host = await newPlayer(browser, 'HOST');
  const probe = await newPlayer(browser, 'PROBE');
  const code = await hostCreatesRace(host);
  console.log(`  room ${code}`);

  await host.reload({ waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => !!window.firebase && !!document.getElementById('open-h2h'));
  await sleep(6000);

  check('room is still on the server after the restart', !!(await readRoom(probe, code)));
  const back = await host.evaluate(() => ({
    modal: document.getElementById('h2h-modal').classList.contains('open'),
    waiting: !document.getElementById('h2h-waiting').hidden,
    code: document.getElementById('h2h-code-display').textContent.trim(),
  }));
  check('host lands back in the lobby with the same code', back.modal && back.waiting && back.code === code,
        JSON.stringify(back));

  // and the code still works for the friend it was shared with
  const guest = await newPlayer(browser, 'GUEST');
  await guestJoins(guest, code);
  await host.waitForFunction(() => !document.getElementById('opponent-panel').hidden, null, { timeout: 25000 }).catch(() => {});
  check('the shared code still starts a race',
        await host.evaluate(() => !document.getElementById('opponent-panel').hidden));

  await dropRoom(probe, code);
  await host.context().close(); await probe.context().close(); await guest.context().close();
}

async function s9_restartMidRace(browser) {
  console.log('\n=== 9: the phone restarts the page mid-race ===');
  const { host, guest, code } = await startedRace(browser);
  console.log(`  room ${code}`);
  const word = (await readRoom(host, code)).word;
  const typed = decoyGuess(word);
  await host.keyboard.type(typed);
  await host.keyboard.press('Enter');
  await sleep(3000);

  await host.reload({ waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => !!window.firebase && !!document.getElementById('open-h2h'));
  await sleep(8000);

  const row0 = await host.evaluate(() => {
    const r = document.querySelector('#game-board .board-row');
    if (!r) return null;
    return {
      letters: [...r.children].map((t) => t.textContent.trim()).join('').toLowerCase(),
      painted: [...r.children].every((t) => /correct|present|absent/.test(t.className)),
    };
  });
  check('board comes back with the letters that were typed',
        !!row0 && row0.letters === typed && row0.painted, JSON.stringify(row0));
  check('still in the race after the restart',
        await host.evaluate(() => !document.getElementById('opponent-panel').hidden));
  check('can keep playing after the restart', await canType(host, 'q'));
  const mirrored = await guest.evaluate(async (c) => {
    const s2 = await window.firebase.database().ref('races/' + c + '/players').once('value');
    return Object.values(s2.val() || {}).map((p) => (p.progress || []).length);
  }, code);
  check('opponent still sees one completed row', mirrored.includes(1), JSON.stringify(mirrored));

  await dropRoom(host, code);
  await host.context().close(); await guest.context().close();
}

async function s10_hostRematchFreesTheGuest(browser) {
  console.log('\n=== 10: host hits Rematch while the guest is still on the result screen ===');
  const { host, guest, code } = await startedRace(browser);
  console.log(`  room ${code}`);
  const word = (await readRoom(host, code)).word;
  await host.keyboard.type(word);
  await host.keyboard.press('Enter');
  await host.waitForSelector('#h2h-result-modal.open', { timeout: 20000 });
  await guest.waitForSelector('#h2h-result-modal.open', { timeout: 20000 });

  await host.click('#h2h-rematch');           // the guest never touches theirs
  await sleep(8000);
  check('guest\'s result modal gets out of the way',
        await guest.evaluate(() => !document.getElementById('h2h-result-modal').classList.contains('open')));
  check('guest can type in the new round', await canType(guest, 'a'));
  check('guest is still in the race', await guest.evaluate(() => !!window.document
        .getElementById('opponent-panel') && !document.getElementById('opponent-panel').hidden));

  await dropRoom(host, code);
  await host.context().close(); await guest.context().close();
}

async function s11_guestRematchKeepsAWayOut(browser) {
  console.log('\n=== 11: guest hits Rematch first ===');
  const { host, guest, code } = await startedRace(browser);
  console.log(`  room ${code}`);
  const word = (await readRoom(host, code)).word;
  await host.keyboard.type(word);
  await host.keyboard.press('Enter');
  await guest.waitForSelector('#h2h-result-modal.open', { timeout: 20000 });

  await guest.click('#h2h-rematch');
  await sleep(2000);
  const waiting = await guest.evaluate(() => ({
    open: document.getElementById('h2h-result-modal').classList.contains('open'),
    label: document.getElementById('h2h-rematch').textContent.trim(),
    disabled: document.getElementById('h2h-rematch').disabled,
  }));
  check('guest keeps a modal they can leave from', waiting.open && waiting.disabled, JSON.stringify(waiting));

  await host.click('#h2h-rematch');
  await sleep(8000);
  check('host\'s rematch releases the waiting guest',
        await guest.evaluate(() => !document.getElementById('h2h-result-modal').classList.contains('open')));
  check('guest can type once the rematch starts', await canType(guest, 'a'));

  await dropRoom(host, code);
  await host.context().close(); await guest.context().close();
}

async function s12_serviceWorkerStillWorks(browser) {
  console.log('\n=== 12: the service worker still installs and serves ===');
  const ctx = await browser.newContext();          // service workers NOT blocked here
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.ready, null, { timeout: 20000 }).catch(() => {});
  await sleep(4000);
  await page.reload({ waitUntil: 'load' });
  await sleep(3000);
  check('page runs clean with the service worker active', errors.length === 0, errors.join(' | '));
  check('controlled by a service worker after a reload',
        await page.evaluate(() => !!navigator.serviceWorker.controller));
  check('the running build is the one we shipped',
        !!(await page.evaluate(() => window.__WU_BUILD__)),
        String(await page.evaluate(() => window.__WU_BUILD__)));
  await ctx.close();
}

const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const run = (n, fn) => (ONLY.length && !ONLY.includes(String(n))) ? Promise.resolve() : fn(browser);

const browser = await chromium.launch();
try {
  await run(1, s1_shareWhileWaiting);
  await run(2, s2_backgroundMidRace);
  await run(3, s3_realDeparture);
  await run(4, s4_returnsBeforeClaim);
  await run(5, s5_cancelStillCleansUp);
  await run(6, s6_staleRoomRetired);
  await run(7, s7_ordinaryRaceStillFinishes);
  await run(8, s8_restartWhileWaiting);
  await run(9, s9_restartMidRace);
  await run(10, s10_hostRematchFreesTheGuest);
  await run(11, s11_guestRematchKeepsAWayOut);
  await run(12, s12_serviceWorkerStillWorks);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
