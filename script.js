(function () {
  'use strict';

  const CONFIG = {
    MAX_GUESSES: 6,
    DEFAULT_LENGTH: 5,
    SIX_LETTER_LENGTH: 6,
    FLIP_STEP_MS: 300,
    FLIP_DURATION_MS: 500,
    SHAKE_MS: 500,
    TOAST_MS: 2500,
    DAILY_EPOCH: new Date(2022, 0, 1).getTime(),
    RECENT_MAX: 100,
    MODES: { DAILY: 'daily', RANDOM: 'random', SIX: 'six-letter' },
    LS: {
      STATS: 'wu_stats', ACH: 'wu_ach', HARD: 'wu_hard', SOUND: 'wu_sound',
      CONTRAST: 'wu_contrast', GAME: 'wu_game', RECENT: 'wu_recent',
      NAME: 'playerName', DAILY_DONE: 'dailyAttempted', LAST_DAILY: 'lastDailyWord',
      SEEN_HELP: 'wu_seen_help',
    },
    FIREBASE: {
      apiKey: 'AIzaSyApXW3PWhqhQ0mXeIG1oo5mdawQD29Xxjs',
      authDomain: 'wordle-upgrade-c055f.firebaseapp.com',
      databaseURL: 'https://wordle-upgrade-c055f-default-rtdb.firebaseio.com',
      projectId: 'wordle-upgrade-c055f',
      appId: '1:683362789332:web:e3aeb537a5f96773e85841',
    },
  };

  firebase.initializeApp(CONFIG.FIREBASE);
  const database = firebase.database();
  const auth = firebase.auth();

  const state = {
    targetWord: '',
    currentGuess: '',
    guesses: [],
    wordLength: CONFIG.DEFAULT_LENGTH,
    gameActive: false,
    startTime: null,
    playerName: '',
    answersByLength: new Map(),
    validByLength: new Map(),
    currentMode: CONFIG.MODES.DAILY,
    correctPositions: [],
    userId: null,
    currentStreak: 0,
    wordListPromise: null,
    leaderboardTabsBound: false,
    animating: false,
    loading: false,
    countdownTimer: null,
    hardMode: false,
    soundOn: true,
    lastResult: null,
    audioCtx: null,
    popBuffer: null,
    popBytesPromise: null,
    h2h: null,            // active race context (see startRaceContext)
    serverOffset: 0,      // ms offset from Firebase server clock
  };

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  function reduceMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function todayISO() {
    return new Date().toLocaleDateString('en-CA');
  }

  function dailyIndex() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return Math.floor((midnight - CONFIG.DAILY_EPOCH) / 86400000);
  }

  function sanitize(str) {
    const t = document.createElement('div');
    t.textContent = String(str ?? '');
    return t.innerHTML;
  }

  function readJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch {
      return fallback;
    }
  }

  // ---- Word list loading (two-list system) ----
  function parseWords(text) {
    return text.split(/\r?\n/).map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]+$/.test(w));
  }

  function loadWordList() {
    if (state.wordListPromise) return state.wordListPromise;
    const files = [
      ['words/answers_5.txt', 'a', 5],
      ['words/guesses_5.txt', 'v', 5],
      ['words/answers_6.txt', 'a', 6],
      ['words/guesses_6.txt', 'v', 6],
    ];
    state.wordListPromise = Promise.all(
      files.map(([path]) => fetch(path).then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + path);
        return r.text();
      }))
    ).then((texts) => {
      texts.forEach((text, i) => {
        const [, kind, len] = files[i];
        const words = parseWords(text);
        if (kind === 'a') state.answersByLength.set(len, words);
        else state.validByLength.set(len, new Set(words));
      });
      // Answers must always be accepted as guesses too.
      for (const [len, answers] of state.answersByLength) {
        const set = state.validByLength.get(len) || new Set();
        answers.forEach((w) => set.add(w));
        state.validByLength.set(len, set);
      }
    }).catch((err) => {
      console.error('Word list load failed:', err);
      toast('Could not load word list. Try refreshing.', 'error');
      state.wordListPromise = null;
      throw err;
    });
    return state.wordListPromise;
  }

  function isValidGuess(word) {
    const set = state.validByLength.get(word.length);
    return !!set && set.has(word);
  }

  // mulberry32 — tiny deterministic PRNG for a stable daily shuffle
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededShuffle(arr, seed) {
    const out = arr.slice();
    const rand = mulberry32(seed);
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function getDailyWord() {
    const list = state.answersByLength.get(CONFIG.DEFAULT_LENGTH);
    if (!list || !list.length) return null;
    const shuffled = seededShuffle(list, 0x5717d1e);
    const idx = ((dailyIndex() % shuffled.length) + shuffled.length) % shuffled.length;
    return shuffled[idx];
  }

  function getRandomWord(length) {
    const list = state.answersByLength.get(length);
    if (!list || !list.length) return null;
    const recent = readJSON(CONFIG.LS.RECENT, []);
    let pick = null;
    for (let tries = 0; tries < 60; tries++) {
      pick = list[Math.floor(Math.random() * list.length)];
      if (!recent.includes(pick)) break;
    }
    recent.push(pick);
    while (recent.length > CONFIG.RECENT_MAX) recent.shift();
    localStorage.setItem(CONFIG.LS.RECENT, JSON.stringify(recent));
    return pick;
  }

  // ---- Modal helpers ----
  function openModal(id) {
    const m = $(id);
    if (!m) return;
    m.classList.add('open');
    m.setAttribute('aria-hidden', 'false');
  }

  function closeModal(idOrEl) {
    const m = typeof idOrEl === 'string' ? $(idOrEl) : idOrEl;
    if (!m || !m.classList.contains('open')) return;
    if (m.querySelector('.countdown-time')) stopCountdown();
    if (reduceMotion()) {
      m.classList.remove('open', 'closing');
      m.setAttribute('aria-hidden', 'true');
      return;
    }
    m.classList.add('closing');
    setTimeout(() => {
      m.classList.remove('open', 'closing');
      m.setAttribute('aria-hidden', 'true');
    }, 180);
  }

  function anyModalOpen() {
    return document.querySelector('.modal.open') !== null;
  }

  function toast(message, type = 'info', duration = CONFIG.TOAST_MS) {
    let container = $('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = message;
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 250);
    }, duration);
  }

  function updateModeIndicator(mode) {
    const order = [CONFIG.MODES.DAILY, CONFIG.MODES.RANDOM, CONFIG.MODES.SIX];
    const idx = Math.max(0, order.indexOf(mode));
    const switcher = document.querySelector('.mode-switch');
    if (switcher) {
      switcher.dataset.active = idx;
      [...switcher.children].forEach((btn, i) => {
        btn.classList.toggle('active', i === idx);
        btn.setAttribute('aria-pressed', String(i === idx));
      });
    }
    const ctx = $('mode-indicator');
    if (!ctx) return;
    if (mode === CONFIG.MODES.DAILY) {
      const date = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      ctx.textContent = `Puzzle #${dailyIndex()} · ${date}`;
    } else if (mode === CONFIG.MODES.SIX) {
      ctx.textContent = 'Unlimited · 6 letters';
    } else {
      ctx.textContent = 'Unlimited · 5 letters';
    }
  }

  // ---- Game lifecycle ----
  async function startGame(mode) {
    if (state.loading) return;
    state.loading = true;
    try {
      await loadWordList();
    } catch {
      state.loading = false;
      return;
    }
    state.loading = false;

    if (mode === CONFIG.MODES.DAILY && localStorage.getItem(CONFIG.LS.DAILY_DONE) === todayISO()) {
      // Keep a composed (idle) board behind the dialog instead of a blank screen
      if (!$('game-board').children.length) {
        state.wordLength = CONFIG.DEFAULT_LENGTH;
        createBoard();
        createKeyboard();
      }
      updateModeIndicator(CONFIG.MODES.DAILY);
      showDailyAttemptedModal();
      return;
    }

    clearSavedGame();
    state.currentMode = mode;
    state.wordLength = mode === CONFIG.MODES.SIX ? CONFIG.SIX_LETTER_LENGTH : CONFIG.DEFAULT_LENGTH;
    state.targetWord = mode === CONFIG.MODES.DAILY ? getDailyWord() : getRandomWord(state.wordLength);

    if (!state.targetWord) {
      toast('No words available for this mode.', 'error');
      return;
    }

    state.currentGuess = '';
    state.guesses = [];
    state.startTime = Date.now();
    state.correctPositions = new Array(state.wordLength).fill(false);
    state.gameActive = true;
    state.animating = false;

    updateModeIndicator(mode);
    ensurePlayerName();
    createBoard();
    createKeyboard();
    updateBoard();
  }

  function ensurePlayerName() {
    state.playerName = localStorage.getItem(CONFIG.LS.NAME) || '';
    if (!state.playerName && !localStorage.getItem(CONFIG.LS.SEEN_HELP)) {
      // first-timers see help first; name prompt only when they post a score
      updateUserDisplay();
      return;
    }
    updateUserDisplay();
  }

  function showNameModal() {
    openModal('name-modal');
    $('player-name-input').value = state.playerName || '';
    $('player-name-input').focus();
  }

  function saveName() {
    const input = $('player-name-input');
    const value = input.value.trim();
    if (!value) {
      toast('Please enter a name.', 'error');
      input.focus();
      return;
    }
    state.playerName = sanitize(value);
    localStorage.setItem(CONFIG.LS.NAME, state.playerName);
    if (state.userId) {
      database.ref(`users/${state.userId}/profile`).update({ name: state.playerName });
    }
    closeModal('name-modal');
    updateUserDisplay();
    if (state._afterName) { const resolve = state._afterName; state._afterName = null; resolve(state.playerName); }
  }

  function createBoard() {
    const board = $('game-board');
    board.innerHTML = '';
    board.style.setProperty('--word-length', state.wordLength);
    for (let i = 0; i < CONFIG.MAX_GUESSES; i++) {
      const row = document.createElement('div');
      row.className = 'board-row';
      row.style.gridTemplateColumns = `repeat(${state.wordLength}, 1fr)`;
      row.style.setProperty('--row', i);
      for (let j = 0; j < state.wordLength; j++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.dataset.row = i;
        tile.dataset.col = j;
        tile.style.setProperty('--col', j);
        row.appendChild(tile);
      }
      board.appendChild(row);
    }
  }

  function createKeyboard() {
    const keyboard = $('keyboard');
    keyboard.innerHTML = '';
    const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
    rows.forEach((row, idx) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'keyboard-row';
      rowEl.style.setProperty('--krow', idx);
      if (idx === 2) rowEl.appendChild(makeKey('Enter', 'wide-button'));
      for (const ch of row) rowEl.appendChild(makeKey(ch));
      if (idx === 2) rowEl.appendChild(makeKey('Backspace', 'wide-button', '←'));
      keyboard.appendChild(rowEl);
    });
  }

  function makeKey(key, extraClass = '', display = key) {
    const btn = document.createElement('button');
    btn.textContent = display;
    btn.setAttribute('aria-label', key);
    btn.type = 'button';
    if (key.length === 1) btn.id = 'key-' + key;
    if (extraClass) btn.classList.add(extraClass);
    btn.addEventListener('click', () => handleKeyPress(key));
    return btn;
  }

  function flashKey(rawKey) {
    if (reduceMotion()) return;
    const k = rawKey.toLowerCase();
    let btn = null;
    if (/^[a-z]$/.test(k)) {
      btn = $('key-' + k.toUpperCase());
    } else {
      const label = k === 'backspace' ? 'Backspace' : k === 'enter' ? 'Enter' : null;
      if (label) btn = [...$$('#keyboard button')].find((b) => b.getAttribute('aria-label') === label);
    }
    if (!btn) return;
    btn.classList.remove('pressed');
    void btn.offsetWidth;
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 200);
  }

  function handleKeyPress(rawKey) {
    if (!state.gameActive || state.animating) return;
    ensureAudio();
    flashKey(rawKey);
    const key = rawKey.toLowerCase();
    if (key === 'enter') {
      if (state.currentGuess.length !== state.wordLength) {
        toast('Not enough letters.', 'warn');
        shakeCurrentRow();
        return;
      }
      if (!isValidGuess(state.currentGuess)) {
        toast('Not in word list.', 'warn');
        shakeCurrentRow();
        return;
      }
      const hardErr = state.hardMode ? hardModeViolation(state.currentGuess) : null;
      if (hardErr) {
        toast(hardErr, 'warn', 3000);
        shakeCurrentRow();
        return;
      }
      submitGuess();
    } else if (key === 'backspace') {
      state.currentGuess = state.currentGuess.slice(0, -1);
      updateBoard();
    } else if (/^[a-z]$/.test(key)) {
      if (state.currentGuess.length < state.wordLength) {
        state.currentGuess += key;
        updateBoard();
      }
    }
  }

  function updateBoard() {
    const board = $('game-board');
    const row = board.children[state.guesses.length];
    if (!row) return;
    const tiles = row.children;
    for (let i = 0; i < state.wordLength; i++) {
      const tile = tiles[i];
      const ch = state.currentGuess[i];
      tile.textContent = ch ? ch.toUpperCase() : '';
      tile.classList.remove('invalid', 'pop', 'caret');
      if (ch) {
        void tile.offsetWidth;
        tile.classList.add('pop');
      }
    }
    // Soft pulse on the tile awaiting input
    if (state.gameActive && !reduceMotion()) {
      const next = tiles[state.currentGuess.length];
      if (next) next.classList.add('caret');
    }
  }

  function evaluateGuess(guess, target) {
    const result = new Array(guess.length).fill('absent');
    const targetArr = target.split('');
    const taken = new Array(target.length).fill(false);
    for (let i = 0; i < guess.length; i++) {
      if (guess[i] === targetArr[i]) {
        result[i] = 'correct';
        taken[i] = true;
      }
    }
    for (let i = 0; i < guess.length; i++) {
      if (result[i] === 'correct') continue;
      for (let j = 0; j < targetArr.length; j++) {
        if (!taken[j] && guess[i] === targetArr[j]) {
          result[i] = 'present';
          taken[j] = true;
          break;
        }
      }
    }
    return result;
  }

  // Standard hard-mode rules: revealed greens stay put, revealed yellows must be reused.
  function hardModeViolation(guess) {
    const greens = {};
    const required = {};
    for (const g of state.guesses) {
      const ev = evaluateGuess(g, state.targetWord);
      const need = {};
      for (let i = 0; i < ev.length; i++) {
        if (ev[i] === 'correct') greens[i] = g[i];
        if (ev[i] === 'correct' || ev[i] === 'present') need[g[i]] = (need[g[i]] || 0) + 1;
      }
      for (const ch in need) required[ch] = Math.max(required[ch] || 0, need[ch]);
    }
    for (const pos in greens) {
      if (guess[pos] !== greens[pos]) {
        return `Spot ${Number(pos) + 1} must be ${greens[pos].toUpperCase()}.`;
      }
    }
    for (const ch in required) {
      const count = guess.split('').filter((c) => c === ch).length;
      if (count < required[ch]) {
        return `Guess must contain ${ch.toUpperCase()}.`;
      }
    }
    return null;
  }

  function submitGuess() {
    state.animating = true;
    const board = $('game-board');
    const row = board.children[state.guesses.length];
    const tiles = row.children;
    const evaluation = evaluateGuess(state.currentGuess, state.targetWord);

    for (let i = 0; i < state.wordLength; i++) {
      const tile = tiles[i];
      tile.style.setProperty('--flip-delay', `${i * CONFIG.FLIP_STEP_MS}ms`);
      tile.classList.add('flip');
      setTimeout(() => {
        tile.classList.add(evaluation[i]);
        if (evaluation[i] === 'correct') {
          if (!state.correctPositions[i]) {
            state.correctPositions[i] = true;
            tile.classList.add('correct-first-time');
          }
          playPopSound();
        }
        updateKeyColor(state.currentGuess[i], evaluation[i]);
      }, i * CONFIG.FLIP_STEP_MS + CONFIG.FLIP_DURATION_MS / 2);
    }

    const totalDelay = state.wordLength * CONFIG.FLIP_STEP_MS + CONFIG.FLIP_DURATION_MS;
    setTimeout(() => {
      state.guesses.push(state.currentGuess);
      const won = state.currentGuess === state.targetWord;
      state.currentGuess = '';
      state.animating = false;
      if (won) {
        state.gameActive = false;
        endGame(true);
      } else if (state.guesses.length >= CONFIG.MAX_GUESSES) {
        state.gameActive = false;
        endGame(false);
      } else {
        saveGame();
        updateBoard();
      }
    }, totalDelay);
  }

  function updateKeyColor(letter, status) {
    const key = $('key-' + letter.toUpperCase());
    if (!key) return;
    if (key.classList.contains('key-correct')) return;
    if (status === 'correct') {
      key.classList.remove('key-absent', 'key-present');
      key.classList.add('key-correct');
    } else if (status === 'present' && !key.classList.contains('key-present')) {
      key.classList.remove('key-absent');
      key.classList.add('key-present');
    } else if (status === 'absent' && !key.classList.contains('key-present')) {
      key.classList.add('key-absent');
    }
  }

  function shakeCurrentRow() {
    const row = $('game-board').children[state.guesses.length];
    if (!row) return;
    [...row.children].forEach((tile) => tile.classList.add('invalid'));
    setTimeout(() => {
      [...row.children].forEach((tile) => tile.classList.remove('invalid'));
    }, CONFIG.SHAKE_MS);
  }

  function endGame(won) {
    const attempts = state.guesses.length;
    const stats = recordGame(won, attempts);
    updateAchievements(stats);
    clearSavedGame();
    if (state.userId) {
      writeLeaderboard(won, attempts);
      syncStatsToFirebase(stats);
    }
    if (state.currentMode === CONFIG.MODES.DAILY) {
      localStorage.setItem(CONFIG.LS.DAILY_DONE, todayISO());
      localStorage.setItem(CONFIG.LS.LAST_DAILY, state.targetWord);
    }
    displayStatistics({ celebrate: true });
    if (won) {
      celebrateWin();
    } else {
      setTimeout(() => showResultModal(false), 350);
    }
  }

  function celebrateWin() {
    const row = $('game-board').children[state.guesses.length - 1];
    if (row && !reduceMotion()) {
      [...row.children].forEach((t) => {
        t.classList.remove('dance');
        void t.offsetWidth;
        t.classList.add('dance');
      });
      setTimeout(() => showResultModal(true), 1000);
    } else {
      showResultModal(true);
    }
  }

  function showDailyAttemptedModal() {
    const lastWord = localStorage.getItem(CONFIG.LS.LAST_DAILY) || '';
    const content = $('daily-attempt-content');
    content.innerHTML = `
      <p class="result-subline">You've played today's puzzle. Today's word was</p>
      <div class="result-tiles" id="daily-attempt-tiles"></div>
      <p class="next-daily">Next Daily in <span class="countdown-time">&mdash;</span></p>
      <div class="modal-actions">
        <button id="switch-to-random" class="modal-button">Play Random Instead</button>
      </div>
    `;
    if (lastWord) {
      renderWordTiles($('daily-attempt-tiles'), lastWord, false);
    } else {
      $('daily-attempt-tiles').remove();
    }
    $('switch-to-random').addEventListener('click', () => {
      closeModal('daily-attempt-modal');
      startGame(CONFIG.MODES.RANDOM);
    }, { once: true });
    openModal('daily-attempt-modal');
    startCountdown(content.querySelector('.countdown-time'));
  }

  // Web Audio: decode the pop once, then fire a fresh source per reveal so
  // rapid, overlapping pops never get dropped and start with no latency.
  function prefetchPopBytes() {
    if (state.popBytesPromise) return state.popBytesPromise;
    state.popBytesPromise = fetch('pop-sound.mp3')
      .then((r) => r.arrayBuffer())
      .catch(() => null);
    return state.popBytesPromise;
  }

  // Must be called from a user gesture to satisfy autoplay policy.
  function ensureAudio() {
    try {
      if (!state.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        state.audioCtx = new Ctx();
      }
      if (state.audioCtx.state === 'suspended') state.audioCtx.resume().catch(() => {});
      if (!state.popBuffer) {
        prefetchPopBytes().then((bytes) => {
          if (!bytes || state.popBuffer) return;
          // slice() because decodeAudioData detaches the buffer
          state.audioCtx.decodeAudioData(bytes.slice(0)).then((decoded) => {
            state.popBuffer = decoded;
          }).catch(() => {});
        });
      }
    } catch {}
  }

  function playPopSound() {
    if (!state.soundOn) return;
    const ctx = state.audioCtx;
    if (!ctx || !state.popBuffer) return;
    try {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const src = ctx.createBufferSource();
      src.buffer = state.popBuffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.4;
      src.connect(gain).connect(ctx.destination);
      src.start();
    } catch {}
  }

  // ---- Local-first stats ----
  function defaultStats() {
    return { gamesPlayed: 0, gamesWon: 0, currentStreak: 0, maxStreak: 0, guessDist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } };
  }

  function loadStats() {
    const s = readJSON(CONFIG.LS.STATS, null);
    if (!s) return defaultStats();
    const d = defaultStats();
    return {
      gamesPlayed: s.gamesPlayed || 0,
      gamesWon: s.gamesWon || 0,
      currentStreak: s.currentStreak || 0,
      maxStreak: s.maxStreak || 0,
      guessDist: Object.assign(d.guessDist, s.guessDist || {}),
    };
  }

  function recordGame(won, attempts) {
    const s = loadStats();
    s.gamesPlayed += 1;
    if (won) {
      s.gamesWon += 1;
      s.currentStreak += 1;
      if (s.currentStreak > s.maxStreak) s.maxStreak = s.currentStreak;
      if (attempts >= 1 && attempts <= 6) s.guessDist[attempts] = (s.guessDist[attempts] || 0) + 1;
    } else {
      s.currentStreak = 0;
    }
    localStorage.setItem(CONFIG.LS.STATS, JSON.stringify(s));
    state.currentStreak = s.currentStreak;
    state.lastResult = won ? { attempts } : null;
    return s;
  }

  function displayStatistics(opts = {}) {
    const stats = loadStats();
    state.currentStreak = stats.currentStreak || 0;

    const badge = $('streak-badge');
    const count = $('streak-count');
    if (badge && count) {
      count.textContent = state.currentStreak;
      badge.classList.toggle('lit', state.currentStreak > 0);
      badge.setAttribute('aria-label', `Current streak: ${state.currentStreak}. View statistics`);
      if (opts.celebrate && state.lastResult && !reduceMotion()) {
        badge.classList.remove('bump');
        void badge.offsetWidth;
        badge.classList.add('bump');
      }
    }

    const winPct = stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
    const summary = $('stats-summary');
    if (summary) {
      summary.innerHTML = '';
      [
        ['Played', stats.gamesPlayed],
        ['Win %', winPct],
        ['Streak', stats.currentStreak],
        ['Best', stats.maxStreak],
      ].forEach(([label, value]) => {
        const box = document.createElement('div');
        box.className = 'stat-box';
        box.innerHTML = `<span class="stat-num">${value}</span><span class="stat-label">${label}</span>`;
        summary.appendChild(box);
      });
    }
    renderGuessDist(stats);
  }

  function renderGuessDist(stats) {
    const wrap = $('guess-dist');
    if (!wrap) return;
    wrap.innerHTML = '';
    const max = Math.max(1, ...Object.values(stats.guessDist).map(Number));
    const latest = state.lastResult ? state.lastResult.attempts : null;
    for (let n = 1; n <= CONFIG.MAX_GUESSES; n++) {
      const c = stats.guessDist[n] || 0;
      const row = document.createElement('div');
      row.className = 'dist-row';
      const label = document.createElement('span');
      label.className = 'dist-label';
      label.textContent = n;
      const track = document.createElement('div');
      track.className = 'dist-track';
      const fill = document.createElement('div');
      fill.className = 'dist-fill' + (n === latest ? ' latest' : '') + (c === 0 ? ' zero' : '');
      fill.style.setProperty('--i', n - 1);
      fill.style.width = c > 0 ? `${Math.round((c / max) * 100)}%` : '';
      fill.textContent = c;
      track.appendChild(fill);
      row.appendChild(label);
      row.appendChild(track);
      wrap.appendChild(row);
    }
  }

  function syncStatsToFirebase(stats) {
    if (!state.userId) return;
    database.ref(`users/${state.userId}/stats`).update({
      gamesPlayed: stats.gamesPlayed,
      gamesWon: stats.gamesWon,
      currentStreak: stats.currentStreak,
      maxStreak: stats.maxStreak,
    }).catch((err) => console.error('Stats sync failed:', err));
  }

  function writeLeaderboard(won, attempts) {
    const timeTaken = Math.floor((Date.now() - state.startTime) / 1000);
    const today = todayISO();
    const log = {
      player: state.playerName || 'Anonymous',
      time: new Date().toLocaleString(),
      date: today,
      timeTaken,
      attempts,
      word: state.targetWord.toUpperCase(),
      won,
    };
    database.ref(`leaderboard/${state.currentMode}/${today}/${Date.now()}`).set(log).catch((err) => {
      console.error('Leaderboard write failed:', err);
    });
  }

  // ---- Result modal (win or loss) ----
  function renderWordTiles(container, word, correct) {
    container.innerHTML = '';
    word.toUpperCase().split('').forEach((ch, i) => {
      const t = document.createElement('span');
      t.className = 'result-tile' + (correct ? ' correct' : '');
      t.style.setProperty('--i', i);
      t.textContent = ch;
      container.appendChild(t);
    });
  }

  function formatDuration(secs) {
    if (secs < 100) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }

  function msToNextMidnight() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  }

  function startCountdown(el) {
    stopCountdown();
    if (!el) return;
    const tick = () => {
      const ms = msToNextMidnight();
      const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
      const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
      const s = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
      el.textContent = `${h}:${m}:${s}`;
    };
    tick();
    state.countdownTimer = setInterval(tick, 1000);
  }

  function stopCountdown() {
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
  }

  function showResultModal(won) {
    const title = $('winning-modal-title');
    const subline = $('winning-word-display');
    const attempts = state.guesses.length;
    const secs = Math.floor((Date.now() - state.startTime) / 1000);
    if (won) {
      title.textContent = pickWinTitle(attempts);
      subline.textContent = `Solved in ${attempts} ${attempts === 1 ? 'try' : 'tries'} · ${formatDuration(secs)}`;
    } else {
      title.textContent = 'So close!';
      subline.textContent = 'That one got away.';
    }
    renderWordTiles($('result-word-tiles'), state.targetWord, won);

    const isDaily = state.currentMode === CONFIG.MODES.DAILY;
    $('play-again-button').textContent = isDaily ? 'Play Random' : 'Play Again';
    const nextDaily = $('next-daily');
    nextDaily.hidden = !isDaily;
    if (isDaily) startCountdown($('next-daily-time'));

    openModal('winning-modal');

    const def = $('word-definition');
    def.innerHTML = '<em class="def-loading">Looking it up…</em>';
    fetchWordDefinition(state.targetWord)
      .then((details) => {
        def.innerHTML = '';
        details.forEach((d) => {
          const entry = document.createElement('p');
          entry.className = 'def-entry';
          const pos = document.createElement('em');
          pos.className = 'def-pos';
          pos.textContent = d.partOfSpeech;
          entry.appendChild(pos);
          entry.appendChild(document.createTextNode(d.definitions.join('; ')));
          def.appendChild(entry);
        });
      })
      .catch(() => { def.innerHTML = '<em class="def-loading">Definition not available.</em>'; });

    if (won) triggerConfetti();
  }

  function pickWinTitle(attempts) {
    return ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'][Math.min(attempts, 6) - 1] || 'You got it!';
  }

  function triggerConfetti() {
    if (typeof confetti === 'undefined' || reduceMotion()) return;
    // A few gentle, gravity-driven bursts — not a continuous strobe.
    const colors = ['#538d4e', '#6aaa64', '#b59f3b', '#f7f8f4'];
    const base = {
      spread: 70,
      startVelocity: 42,
      gravity: 0.9,
      ticks: 220,
      zIndex: 1500,
      colors,
      disableForReducedMotion: true,
    };
    confetti({ ...base, particleCount: 70, origin: { x: 0.5, y: 0.7 } });
    setTimeout(() => confetti({ ...base, particleCount: 35, angle: 60, origin: { x: 0.08, y: 0.75 } }), 180);
    setTimeout(() => confetti({ ...base, particleCount: 35, angle: 120, origin: { x: 0.92, y: 0.75 } }), 340);
  }

  async function fetchWordDefinition(word) {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) throw new Error('Definition not found');
    const data = await res.json();
    return data[0].meanings.map((m) => ({
      partOfSpeech: m.partOfSpeech,
      definitions: m.definitions.map((d) => d.definition).slice(0, 2),
    }));
  }

  function generateShareText() {
    const timeTaken = Math.floor((Date.now() - state.startTime) / 1000);
    const modeLabel = state.currentMode === CONFIG.MODES.SIX ? '6-Letter' : state.currentMode.charAt(0).toUpperCase() + state.currentMode.slice(1);
    const won = state.guesses[state.guesses.length - 1] === state.targetWord;
    const score = won ? state.guesses.length : 'X';
    const hard = state.hardMode ? '*' : '';
    let txt = `Wordle Upgrade — ${modeLabel}\n${score}/${CONFIG.MAX_GUESSES}${hard} in ${timeTaken}s\n\n`;
    state.guesses.forEach((guess) => {
      const ev = evaluateGuess(guess, state.targetWord);
      txt += ev.map((s) => (s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬛')).join('') + '\n';
    });
    return txt;
  }

  // ---- Save & resume ----
  function saveGame() {
    if (!state.gameActive) return;
    const payload = {
      mode: state.currentMode,
      wordLength: state.wordLength,
      targetWord: state.targetWord,
      guesses: state.guesses,
      hardMode: state.hardMode,
      startTime: state.startTime,
      date: todayISO(),
    };
    try { localStorage.setItem(CONFIG.LS.GAME, JSON.stringify(payload)); } catch {}
  }

  function clearSavedGame() {
    localStorage.removeItem(CONFIG.LS.GAME);
  }

  function resumeGame() {
    const saved = readJSON(CONFIG.LS.GAME, null);
    if (!saved || !saved.targetWord || !Array.isArray(saved.guesses)) return false;
    if (!saved.guesses.length || saved.guesses.length >= CONFIG.MAX_GUESSES) return false;
    if (saved.guesses[saved.guesses.length - 1] === saved.targetWord) return false;
    if (saved.mode === CONFIG.MODES.DAILY && saved.date !== todayISO()) { clearSavedGame(); return false; }

    state.currentMode = saved.mode;
    state.wordLength = saved.wordLength;
    state.targetWord = saved.targetWord;
    state.guesses = saved.guesses.slice();
    state.hardMode = !!saved.hardMode;
    state.startTime = saved.startTime || Date.now();
    state.currentGuess = '';
    state.correctPositions = new Array(state.wordLength).fill(false);
    state.gameActive = true;
    state.animating = false;

    updateModeIndicator(state.currentMode);
    ensurePlayerName();
    createBoard();
    createKeyboard();
    renderResumedGuesses();
    toast('Resumed your game.', 'info', 1800);
    return true;
  }

  function renderResumedGuesses() {
    const board = $('game-board');
    state.guesses.forEach((guess, r) => {
      const row = board.children[r];
      const ev = evaluateGuess(guess, state.targetWord);
      for (let i = 0; i < state.wordLength; i++) {
        const tile = row.children[i];
        tile.textContent = guess[i].toUpperCase();
        tile.classList.add(ev[i]);
        if (ev[i] === 'correct') state.correctPositions[i] = true;
        updateKeyColor(guess[i], ev[i]);
      }
    });
  }

  // ---- User display / auth ----
  function updateUserDisplay() {
    const userDisplay = $('user-display');
    const loginBtn = $('login-button');
    const logoutBtn = $('logout-button');
    if (state.userId) {
      userDisplay.textContent = state.playerName || 'Player';
      logoutBtn.style.display = 'inline-block';
      loginBtn.style.display = 'none';
    } else {
      userDisplay.textContent = state.playerName ? state.playerName : 'Guest';
      logoutBtn.style.display = 'none';
      loginBtn.style.display = 'inline-block';
    }
  }

  function viewLeaderboard() {
    closeModal('stats-modal');
    openModal('leaderboard-modal');
    if (!state.leaderboardTabsBound) {
      $$('.tablink').forEach((tab) => {
        tab.addEventListener('click', () => {
          $$('.tablink').forEach((t) => t.classList.remove('active'));
          tab.classList.add('active');
          $$('.tabcontent').forEach((c) => c.classList.remove('active'));
          const content = $(tab.getAttribute('data-tab'));
          content.classList.add('active');
          const mode = tab.getAttribute('data-tab').replace('leaderboard-', '');
          fetchLeaderboardData(mode, content);
        });
      });
      $('leaderboard-date').addEventListener('change', () => {
        const activeTab = document.querySelector('.tablink.active');
        if (!activeTab) return;
        const tabId = activeTab.getAttribute('data-tab');
        const mode = tabId.replace('leaderboard-', '');
        fetchLeaderboardData(mode, $(tabId));
      });
      state.leaderboardTabsBound = true;
    }
    const activeTab = document.querySelector('.tablink.active');
    const tabId = activeTab.getAttribute('data-tab');
    const mode = tabId.replace('leaderboard-', '');
    fetchLeaderboardData(mode, $(tabId));
  }

  function fetchLeaderboardData(mode, container) {
    container.innerHTML = '<p class="loading">Loading leaderboard…</p>';
    const selectedDate = $('leaderboard-date').value;
    database.ref(`leaderboard/${mode}`).once('value')
      .then((snap) => renderLeaderboard(snap.val(), mode, selectedDate, container))
      .catch((err) => {
        console.error('Leaderboard fetch failed:', err);
        container.innerHTML = '<p>Error loading leaderboard. Try again later.</p>';
      });
  }

  function renderLeaderboard(data, mode, selectedDate, container) {
    container.innerHTML = '';
    if (!data) {
      container.textContent = `No leaderboard data for ${mode} mode yet.`;
      return;
    }
    const entries = [];
    (function walk(obj) {
      if (!obj || typeof obj !== 'object') return;
      for (const v of Object.values(obj)) {
        if (v && typeof v === 'object') {
          if (v.player !== undefined) {
            if (!selectedDate || v.date === selectedDate) entries.push(v);
          } else {
            walk(v);
          }
        }
      }
    })(data);

    if (!entries.length) {
      container.textContent = `No entries for ${mode}${selectedDate ? ' on ' + selectedDate : ''}.`;
      return;
    }

    entries.sort((a, b) => {
      if (a.won !== b.won) return b.won - a.won;
      if (a.attempts !== b.attempts) return a.attempts - b.attempts;
      return a.timeTaken - b.timeTaken;
    });

    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Rank</th><th>Player</th><th>Date</th><th>Time (s)</th><th>Attempts</th></tr></thead>';
    const tbody = document.createElement('tbody');
    entries.slice(0, 10).forEach((entry, i) => {
      const tr = document.createElement('tr');
      [
        { label: 'Rank', value: i + 1 },
        { label: 'Player', value: entry.player },
        { label: 'Date', value: entry.date || '' },
        { label: 'Time (s)', value: entry.timeTaken },
        { label: 'Attempts', value: entry.attempts },
      ].forEach(({ label, value }) => {
        const td = document.createElement('td');
        td.setAttribute('data-label', label);
        td.textContent = value;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  // ---- Achievements (local-first) ----
  const ACHIEVEMENTS = [
    { key: 'firstWin', name: 'First Win', desc: 'Win your first game' },
    { key: 'ace', name: 'Hole in One', desc: 'Win in a single guess' },
    { key: 'eagle', name: 'Eagle Eye', desc: 'Win in two guesses' },
    { key: 'tenWins', name: 'Decathlon', desc: 'Win 10 games' },
    { key: 'fiftyWins', name: 'Centurion', desc: 'Win 50 games' },
    { key: 'fiveStreak', name: 'Hot Streak', desc: '5-game winning streak' },
    { key: 'tenStreak', name: 'Unstoppable', desc: '10-game winning streak' },
  ];

  function loadAch() { return readJSON(CONFIG.LS.ACH, {}); }

  function updateAchievements(stats) {
    const ach = loadAch();
    const newly = [];
    const check = (key, condition, name) => {
      if (condition && !ach[key]) { ach[key] = true; newly.push(name); }
    };
    check('firstWin', stats.gamesWon >= 1, 'First Win');
    check('ace', (stats.guessDist[1] || 0) >= 1, 'Hole in One');
    check('eagle', (stats.guessDist[2] || 0) >= 1, 'Eagle Eye');
    check('tenWins', stats.gamesWon >= 10, 'Decathlon');
    check('fiftyWins', stats.gamesWon >= 50, 'Centurion');
    check('fiveStreak', (stats.currentStreak || 0) >= 5, 'Hot Streak');
    check('tenStreak', (stats.maxStreak || 0) >= 10, 'Unstoppable');
    localStorage.setItem(CONFIG.LS.ACH, JSON.stringify(ach));
    if (state.userId) database.ref(`users/${state.userId}/achievements`).update(ach).catch(() => {});
    newly.forEach((n) => toast(`Achievement unlocked: ${n}!`, 'success', 3500));
  }

  function displayAchievements() {
    closeModal('stats-modal');
    const achievements = loadAch();
    const list = $('achievements-list');
    list.innerHTML = '';
    ACHIEVEMENTS.forEach((item) => {
      const li = document.createElement('li');
      const unlocked = !!achievements[item.key];
      li.className = 'achievement' + (unlocked ? ' unlocked' : '');
      const icon = document.createElement('span');
      icon.className = 'achievement-icon';
      icon.textContent = unlocked ? '★' : '☆';
      const text = document.createElement('span');
      text.textContent = `${item.name} — ${item.desc}`;
      li.appendChild(icon);
      li.appendChild(text);
      list.appendChild(li);
    });
    openModal('achievements-modal');
  }

  function submitFeedback() {
    const text = $('feedback-text').value.trim();
    if (!text) {
      toast('Please enter feedback first.', 'warn');
      return;
    }
    database.ref('feedback').push({
      user: state.playerName || 'Anonymous',
      feedback: text,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
    }).then(() => {
      toast('Thanks for the feedback!', 'success');
      closeModal('feedback-modal');
      $('feedback-text').value = '';
    }).catch((err) => {
      console.error('Feedback submit failed:', err);
      toast('Could not submit feedback.', 'error');
    });
  }

  // ---- Settings ----
  function applySettings() {
    state.hardMode = localStorage.getItem(CONFIG.LS.HARD) === '1';
    state.soundOn = localStorage.getItem(CONFIG.LS.SOUND) !== '0';
    const contrast = localStorage.getItem(CONFIG.LS.CONTRAST) === '1';
    document.documentElement.classList.toggle('high-contrast', contrast);
    if ($('setting-hard')) $('setting-hard').checked = state.hardMode;
    if ($('setting-contrast')) $('setting-contrast').checked = contrast;
    if ($('setting-sound')) $('setting-sound').checked = state.soundOn;
  }

  function bindSettings() {
    $('open-settings').addEventListener('click', () => { applySettings(); openModal('settings-modal'); });
    $('setting-hard').addEventListener('change', (e) => {
      if (state.gameActive && state.guesses.length > 0) {
        e.target.checked = state.hardMode;
        toast('Finish this game before changing Hard Mode.', 'warn', 3000);
        return;
      }
      state.hardMode = e.target.checked;
      localStorage.setItem(CONFIG.LS.HARD, state.hardMode ? '1' : '0');
    });
    $('setting-contrast').addEventListener('change', (e) => {
      localStorage.setItem(CONFIG.LS.CONTRAST, e.target.checked ? '1' : '0');
      document.documentElement.classList.toggle('high-contrast', e.target.checked);
    });
    $('setting-sound').addEventListener('change', (e) => {
      state.soundOn = e.target.checked;
      localStorage.setItem(CONFIG.LS.SOUND, state.soundOn ? '1' : '0');
      if (state.soundOn) ensureAudio();
    });
  }

  // ---- Head-to-Head (live race) ----

  // Resolve a uid for racing. Reuse an existing logged-in uid; otherwise sign in
  // anonymously. Returns a promise of the uid.
  function ensureRaceAuth() {
    if (state.userId) return Promise.resolve(state.userId);
    if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
    return auth.signInAnonymously().then((cred) => cred.user.uid);
  }

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

  function openH2H() {
    showH2HPane('home');
    $('h2h-code-input').value = '';
    openModal('h2h-modal');
  }

  function showH2HPane(which) {
    $('h2h-home').hidden = which !== 'home';
    $('h2h-waiting').hidden = which !== 'waiting';
  }

  // Ensure we have a display name; prompt for one if needed. Resolves with the name.
  function requireName() {
    state.playerName = localStorage.getItem(CONFIG.LS.NAME) || state.playerName || '';
    if (state.playerName) return Promise.resolve(state.playerName);
    return new Promise((resolve) => { state._afterName = resolve; showNameModal(); });
  }

  // The race-node shape for one player.
  function racePlayerSeed(name) {
    return { name: sanitize(name), guesses: 0, progress: [], typing: false,
             solved: false, failed: false, connected: true, greens: 0 };
  }

  // Build the in-memory race context stored on state.h2h.
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
    ensureRaceAuth()
      .then((uid) => requireName().then(() => uid))
      .then((uid) => loadWordList().then(() => uid))
      .then((uid) => {
        const name = state.playerName || 'Player';
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
          // Remove an abandoned room if the host disconnects while still waiting.
          h.ref.onDisconnect().remove();
          $('h2h-code-display').textContent = code;
          showH2HPane('waiting');
          subscribeRace(h);
        });
      })
      .catch((err) => {
        console.error('createRace failed', err);
        toast('Could not start a race. Check your connection.', 'error');
      });
  }

  function shareRace() {
    if (!state.h2h) return;
    const text = `Join my Wordle race! Code: ${state.h2h.code} — ${location.origin}${location.pathname}`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else navigator.clipboard.writeText(text).then(() => toast('Invite copied!', 'success')).catch(() => {});
  }

  function leaveRace() {
    const h = state.h2h;
    if (h) {
      h.ref.onDisconnect().cancel();
      h.ref.remove().catch(() => {});
      state.h2h = null;
    }
    closeModal('h2h-modal');
  }

  // Filled in by later tasks.
  function joinRace() {}
  function subscribeRace() {}

  // Read-only export so pure helpers can be asserted against in the browser.
  window.__WU_TEST__ = window.__WU_TEST__ || {};
  Object.assign(window.__WU_TEST__, { genRoomCode, encodeEval, decodeEval, greenCount, CODE_ALPHABET });

  // ---- Auth UI ----
  function bindAuthUI() {
    auth.onAuthStateChanged((user) => {
      if (user) {
        state.userId = user.uid;
        const name = user.displayName || (user.email ? user.email.split('@')[0] : 'Player');
        state.playerName = state.playerName || name;
        localStorage.setItem(CONFIG.LS.NAME, state.playerName);
        closeModal('auth-modal');
        closeModal('email-auth-modal');
        const local = loadStats();
        if (local.gamesPlayed > 0) syncStatsToFirebase(local);
      } else {
        state.userId = null;
        state.playerName = localStorage.getItem(CONFIG.LS.NAME) || '';
      }
      updateUserDisplay();
    });

    $('login-button').addEventListener('click', () => openModal('auth-modal'));
    $('email-signin-button').addEventListener('click', () => {
      closeModal('auth-modal');
      $('email-auth-modal').dataset.intent = 'signin';
      $('email-auth-title').textContent = 'Sign In';
      openModal('email-auth-modal');
    });
    $('email-signup-button').addEventListener('click', () => {
      closeModal('auth-modal');
      $('email-auth-modal').dataset.intent = 'signup';
      $('email-auth-title').textContent = 'Sign Up';
      openModal('email-auth-modal');
    });
    $('email-auth-submit').addEventListener('click', () => {
      const email = $('user-email').value.trim();
      const password = $('user-password').value;
      if (!email || !password) {
        toast('Email and password required.', 'warn');
        return;
      }
      if (password.length < 6) {
        toast('Password must be at least 6 characters.', 'warn');
        return;
      }
      const intent = $('email-auth-modal').dataset.intent || 'signin';
      const fn = intent === 'signup' ? auth.createUserWithEmailAndPassword : auth.signInWithEmailAndPassword;
      fn.call(auth, email, password)
        .then(() => { $('user-email').value = ''; $('user-password').value = ''; })
        .catch((err) => {
          toast(friendlyAuthError(err), 'error', 4000);
          console.error('Auth error:', err);
        });
    });
    $('logout-button').addEventListener('click', () => {
      auth.signOut().catch((err) => console.error('Logout failed:', err));
    });
  }

  function friendlyAuthError(err) {
    switch (err && err.code) {
      case 'auth/invalid-email': return 'Invalid email address.';
      case 'auth/user-not-found': return 'No account with that email.';
      case 'auth/wrong-password': return 'Wrong password.';
      case 'auth/email-already-in-use': return 'That email is already registered.';
      case 'auth/weak-password': return 'Password is too weak.';
      case 'auth/network-request-failed': return 'Network error. Check your connection.';
      default: return 'Authentication failed. Please try again.';
    }
  }

  function bindModalCloseUI() {
    $$('.modal .close').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.closest('.modal')));
    });
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) closeModal(e.target);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && anyModalOpen()) {
        document.querySelectorAll('.modal.open').forEach((m) => closeModal(m));
      }
    });
  }

  function bindPhysicalKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (anyModalOpen()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key;
      if (key === 'Backspace' || key === 'Enter' || /^[a-zA-Z]$/.test(key)) {
        e.preventDefault();
        handleKeyPress(key.toLowerCase());
      }
    });
  }

  function bindUI() {
    $('daily-mode-button').addEventListener('click', () => startGame(CONFIG.MODES.DAILY));
    $('random-mode-button').addEventListener('click', () => startGame(CONFIG.MODES.RANDOM));
    $('six-letter-mode-button').addEventListener('click', () => startGame(CONFIG.MODES.SIX));
    $('view-leaderboard').addEventListener('click', viewLeaderboard);
    $('view-achievements').addEventListener('click', displayAchievements);
    const openStats = () => { displayStatistics(); openModal('stats-modal'); };
    $('open-stats').addEventListener('click', openStats);
    $('streak-badge').addEventListener('click', openStats);
    $('open-feedback').addEventListener('click', () => {
      closeModal('settings-modal');
      openModal('feedback-modal');
    });
    $('submit-feedback').addEventListener('click', submitFeedback);
    $('save-name-button').addEventListener('click', saveName);
    $('player-name-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveName(); }
    });

    $('open-help').addEventListener('click', () => openModal('help-modal'));
    $('help-got-it').addEventListener('click', () => {
      localStorage.setItem(CONFIG.LS.SEEN_HELP, '1');
      closeModal('help-modal');
    });

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

    $('play-again-button').addEventListener('click', () => {
      closeModal('winning-modal');
      const next = state.currentMode === CONFIG.MODES.DAILY ? CONFIG.MODES.RANDOM : state.currentMode;
      startGame(next);
    });

    $('share-button').addEventListener('click', () => {
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(generateShareText())}`;
      window.open(url, '_blank', 'noopener');
    });
    $('share-whatsapp-button').addEventListener('click', () => {
      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(generateShareText())}`;
      window.open(url, '_blank', 'noopener');
    });
    $('copy-result-button').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(generateShareText());
        toast('Result copied to clipboard!', 'success');
      } catch {
        toast('Could not copy to clipboard.', 'error');
      }
    });
  }

  function maybeShowHelp() {
    if (!localStorage.getItem(CONFIG.LS.SEEN_HELP)) {
      openModal('help-modal');
    }
  }

  function init() {
    applySettings();
    bindAuthUI();
    bindModalCloseUI();
    bindPhysicalKeyboard();
    bindSettings();
    bindUI();
    displayStatistics();
    maybeShowHelp();

    // Prime audio: prefetch the clip now, unlock/decode on the first gesture.
    prefetchPopBytes();
    ['pointerdown', 'keydown'].forEach((ev) =>
      document.addEventListener(ev, ensureAudio, { passive: true })
    );

    loadWordList().then(() => {
      if (!resumeGame()) startGame(CONFIG.MODES.DAILY);
    }).catch(() => {});

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
