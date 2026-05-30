(function () {
  'use strict';

  const CONFIG = {
    MAX_GUESSES: 6,
    DEFAULT_LENGTH: 5,
    SIX_LETTER_LENGTH: 6,
    FLIP_STEP_MS: 300,
    FLIP_DURATION_MS: 500,
    SHAKE_MS: 500,
    CONFETTI_MS: 5000,
    TOAST_MS: 2500,
    MODES: { DAILY: 'daily', RANDOM: 'random', SIX: 'six-letter' },
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
    validWordsSet: new Set(),
    wordsByLength: new Map(),
    currentMode: CONFIG.MODES.DAILY,
    correctPositions: [],
    userId: null,
    currentStreak: 0,
    wordListPromise: null,
    leaderboardTabsBound: false,
    animating: false,
    statsChart: null,
  };

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  function todayISO() {
    return new Date().toLocaleDateString('en-CA');
  }

  function sanitize(str) {
    const t = document.createElement('div');
    t.textContent = String(str ?? '');
    return t.innerHTML;
  }

  function loadWordList() {
    if (state.wordListPromise) return state.wordListPromise;
    state.wordListPromise = fetch('words_en.txt')
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then((text) => {
        const words = text
          .split(/\r?\n/)
          .map((w) => w.trim().toLowerCase())
          .filter((w) => /^[a-z]+$/.test(w));
        state.validWordsSet = new Set(words);
        const byLen = new Map();
        for (const w of words) {
          if (!byLen.has(w.length)) byLen.set(w.length, []);
          byLen.get(w.length).push(w);
        }
        state.wordsByLength = byLen;
      })
      .catch((err) => {
        console.error('Word list load failed:', err);
        toast('Could not load word list. Try refreshing.', 'error');
        state.wordListPromise = null;
        throw err;
      });
    return state.wordListPromise;
  }

  function getRandomWord(length) {
    const list = state.wordsByLength.get(length);
    if (!list || !list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function getDailyWord() {
    const list = state.wordsByLength.get(CONFIG.DEFAULT_LENGTH);
    if (!list || !list.length) return null;
    const d = new Date();
    const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    return list[seed % list.length];
  }

  function openModal(id) {
    const m = $(id);
    if (!m) return;
    m.classList.add('open');
    m.setAttribute('aria-hidden', 'false');
  }

  function closeModal(idOrEl) {
    const m = typeof idOrEl === 'string' ? $(idOrEl) : idOrEl;
    if (!m) return;
    m.classList.remove('open');
    m.setAttribute('aria-hidden', 'true');
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
    const label = mode === CONFIG.MODES.SIX ? '6-Letter' : mode.charAt(0).toUpperCase() + mode.slice(1);
    $('mode-indicator').textContent = `Current Mode: ${label}`;
  }

  async function startGame(mode) {
    try {
      await loadWordList();
    } catch {
      return;
    }

    if (mode === CONFIG.MODES.DAILY && localStorage.getItem('dailyAttempted') === todayISO()) {
      showDailyAttemptedModal();
      return;
    }

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
    if (state.userId) {
      database.ref(`users/${state.userId}/profile/name`).once('value').then((snap) => {
        state.playerName = snap.val() || '';
        if (!state.playerName) showNameModal();
        updateUserDisplay();
      });
    } else {
      state.playerName = localStorage.getItem('playerName') || '';
      if (!state.playerName) showNameModal();
      updateUserDisplay();
    }
  }

  function showNameModal() {
    openModal('name-modal');
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
    if (state.userId) {
      database.ref(`users/${state.userId}/profile`).update({ name: state.playerName });
    } else {
      localStorage.setItem('playerName', state.playerName);
    }
    closeModal('name-modal');
    updateUserDisplay();
  }

  function createBoard() {
    const board = $('game-board');
    board.innerHTML = '';
    board.style.setProperty('--word-length', state.wordLength);
    for (let i = 0; i < CONFIG.MAX_GUESSES; i++) {
      const row = document.createElement('div');
      row.className = 'board-row';
      row.style.gridTemplateColumns = `repeat(${state.wordLength}, 1fr)`;
      for (let j = 0; j < state.wordLength; j++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.dataset.row = i;
        tile.dataset.col = j;
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

  function handleKeyPress(rawKey) {
    if (!state.gameActive || state.animating) return;
    const key = rawKey.toLowerCase();
    if (key === 'enter') {
      if (state.currentGuess.length !== state.wordLength) {
        toast('Not enough letters.', 'warn');
        return;
      }
      if (!state.validWordsSet.has(state.currentGuess)) {
        showInvalidGuess();
        toast('Not in word list.', 'warn');
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
      tile.classList.remove('invalid', 'pop');
      if (ch) {
        void tile.offsetWidth;
        tile.classList.add('pop');
      }
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
        if (evaluation[i] === 'correct' && !state.correctPositions[i]) {
          state.correctPositions[i] = true;
          tile.classList.add('correct-first-time');
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

  function endGame(won) {
    logResult(won, state.currentMode);
    updateAchievements();
    if (state.currentMode === CONFIG.MODES.DAILY) {
      localStorage.setItem('dailyAttempted', todayISO());
      localStorage.setItem('lastDailyWord', state.targetWord);
    }
    if (won) {
      showWinningAnimation();
    } else {
      toast(`The word was ${state.targetWord.toUpperCase()}.`, 'info', 5000);
    }
  }

  function showDailyAttemptedModal() {
    const lastWord = localStorage.getItem('lastDailyWord') || '';
    const content = $('daily-attempt-content');
    content.innerHTML = `
      <p>You've already played today's word. Come back tomorrow!</p>
      ${lastWord ? `<p>Today's word was: <strong>${sanitize(lastWord.toUpperCase())}</strong></p>` : ''}
      <div class="modal-actions">
        <button id="switch-to-random" class="modal-button">Play Random Instead</button>
      </div>
    `;
    $('switch-to-random').addEventListener('click', () => {
      closeModal('daily-attempt-modal');
      startGame(CONFIG.MODES.RANDOM);
    }, { once: true });
    openModal('daily-attempt-modal');
  }

  function playPopSound() {
    try {
      const audio = new Audio('pop-sound.mp3');
      audio.volume = 0.4;
      audio.play().catch(() => {});
    } catch {}
  }

  function logResult(won, mode) {
    const timeTaken = Math.floor((Date.now() - state.startTime) / 1000);
    const today = todayISO();
    const log = {
      player: state.playerName || 'Anonymous',
      time: new Date().toLocaleString(),
      date: today,
      timeTaken,
      attempts: state.guesses.length,
      word: state.targetWord.toUpperCase(),
      won,
    };
    if (state.userId) {
      database.ref(`leaderboard/${mode}/${today}/${Date.now()}`).set(log).catch((err) => {
        console.error('Leaderboard write failed:', err);
        toast('Could not save result.', 'error');
      });
      updateUserStats(won, state.guesses.length);
    }
  }

  function showInvalidGuess() {
    const row = $('game-board').children[state.guesses.length];
    if (!row) return;
    [...row.children].forEach((tile) => tile.classList.add('invalid'));
    setTimeout(() => {
      [...row.children].forEach((tile) => tile.classList.remove('invalid'));
    }, CONFIG.SHAKE_MS);
  }

  function showWinningAnimation() {
    openModal('winning-modal');
    $('winning-word-display').textContent = `You guessed: ${state.targetWord.toUpperCase()}`;
    $('word-definition').innerHTML = '<em>Loading definition…</em>';
    fetchWordDefinition(state.targetWord)
      .then((details) => {
        const def = $('word-definition');
        def.innerHTML = '';
        const header = document.createElement('strong');
        header.textContent = 'Definition:';
        def.appendChild(header);
        def.appendChild(document.createElement('br'));
        details.forEach((d) => {
          const pos = document.createElement('em');
          pos.textContent = d.partOfSpeech + ': ';
          def.appendChild(pos);
          def.appendChild(document.createTextNode(d.definitions.join('; ')));
          def.appendChild(document.createElement('br'));
        });
      })
      .catch(() => {
        $('word-definition').innerHTML = '<em>Definition not available.</em>';
      });
    triggerConfetti();
  }

  function triggerConfetti() {
    if (typeof confetti === 'undefined') return;
    const canvas = $('confetti-canvas');
    const myConfetti = confetti.create(canvas, { resize: true, useWorker: true });
    const end = Date.now() + CONFIG.CONFETTI_MS;
    (function frame() {
      myConfetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: Math.random() } });
      myConfetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: Math.random() } });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }

  async function fetchWordDefinition(word) {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) throw new Error('Definition not found');
    const data = await res.json();
    return data[0].meanings.map((m) => ({
      partOfSpeech: m.partOfSpeech,
      definitions: m.definitions.map((d) => d.definition),
    }));
  }

  function generateShareText() {
    const timeTaken = Math.floor((Date.now() - state.startTime) / 1000);
    const modeLabel = state.currentMode === CONFIG.MODES.SIX ? '6-Letter' : state.currentMode.charAt(0).toUpperCase() + state.currentMode.slice(1);
    let txt = `Wordle Upgrade — ${modeLabel}\n${state.guesses.length}/${CONFIG.MAX_GUESSES} in ${timeTaken}s\n\n`;
    state.guesses.forEach((guess) => {
      const ev = evaluateGuess(guess, state.targetWord);
      txt += ev.map((s) => (s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬛')).join('') + '\n';
    });
    return txt;
  }

  function updateUserStats(won, attempts) {
    if (!state.userId) return;
    const statsRef = database.ref(`users/${state.userId}/stats`);
    statsRef.transaction((s) => {
      if (s === null) {
        state.currentStreak = won ? 1 : 0;
        return {
          gamesPlayed: 1,
          gamesWon: won ? 1 : 0,
          currentStreak: state.currentStreak,
          maxStreak: state.currentStreak,
          totalAttempts: won ? attempts : 0,
        };
      }
      s.gamesPlayed += 1;
      if (won) {
        s.gamesWon += 1;
        s.currentStreak = (s.currentStreak || 0) + 1;
        if (s.currentStreak > (s.maxStreak || 0)) s.maxStreak = s.currentStreak;
        s.totalAttempts = (s.totalAttempts || 0) + attempts;
      } else {
        s.currentStreak = 0;
      }
      state.currentStreak = s.currentStreak;
      return s;
    }).then(() => {
      $('streak-counter').textContent = `Current Streak: ${state.currentStreak}`;
      displayStatistics();
    });
  }

  function displayStatistics() {
    if (!state.userId) return;
    database.ref(`users/${state.userId}/stats`).once('value').then((snap) => {
      const stats = snap.val();
      if (!stats) return;
      const winPct = stats.gamesPlayed > 0 ? ((stats.gamesWon / stats.gamesPlayed) * 100).toFixed(1) : 0;
      const avgAttempts = stats.gamesWon > 0 ? (stats.totalAttempts / stats.gamesWon).toFixed(2) : 0;
      state.currentStreak = stats.currentStreak || 0;
      $('streak-counter').textContent = `Current Streak: ${state.currentStreak}`;
      const ctx = $('stats-chart').getContext('2d');
      if (state.statsChart) state.statsChart.destroy();
      state.statsChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Games Played', 'Win %', 'Avg Attempts'],
          datasets: [{
            label: 'Statistics',
            data: [stats.gamesPlayed, winPct, avgAttempts],
            backgroundColor: ['#538D4E', '#B59F3B', '#3A3A3C'],
          }],
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } },
      });
    });
  }

  function updateUserDisplay() {
    const userDisplay = $('user-display');
    const loginBtn = $('login-button');
    const logoutBtn = $('logout-button');
    if (state.userId) {
      userDisplay.textContent = 'Logged in as: ' + (state.playerName || 'Player');
      logoutBtn.style.display = 'inline-block';
      loginBtn.style.display = 'none';
    } else {
      userDisplay.textContent = state.playerName ? `Playing as: ${state.playerName}` : 'Not logged in';
      logoutBtn.style.display = 'none';
      loginBtn.style.display = 'inline-block';
    }
  }

  function viewLeaderboard() {
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
      .then((snap) => {
        renderLeaderboard(snap.val(), mode, selectedDate, container);
      })
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

  function updateAchievements() {
    if (!state.userId) return;
    const achievementsRef = database.ref(`users/${state.userId}/achievements`);
    const statsRef = database.ref(`users/${state.userId}/stats`);
    Promise.all([achievementsRef.once('value'), statsRef.once('value')])
      .then(([aSnap, sSnap]) => {
        const ach = aSnap.val() || {};
        const stats = sSnap.val() || {};
        const newly = [];
        const check = (key, condition, name) => {
          if (condition && !ach[key]) {
            ach[key] = true;
            newly.push(name);
          }
        };
        check('firstWin', stats.gamesWon >= 1, 'First Win');
        check('tenWins', stats.gamesWon >= 10, 'Decathlon');
        check('fiveStreak', (stats.currentStreak || 0) >= 5, 'Hot Streak');
        check('tenStreak', (stats.maxStreak || 0) >= 10, 'Unstoppable');
        achievementsRef.set(ach);
        newly.forEach((n) => toast(`Achievement unlocked: ${n}!`, 'success', 3500));
      })
      .catch((err) => console.error('Achievements update failed:', err));
  }

  function displayAchievements(achievements) {
    const list = $('achievements-list');
    list.innerHTML = '';
    const items = [
      { key: 'firstWin', name: 'First Win', desc: 'Win your first game' },
      { key: 'tenWins', name: 'Decathlon', desc: 'Win 10 games' },
      { key: 'fiveStreak', name: 'Hot Streak', desc: '5-game winning streak' },
      { key: 'tenStreak', name: 'Unstoppable', desc: '10-game winning streak' },
    ];
    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'achievement' + (achievements[item.key] ? ' unlocked' : '');
      const icon = document.createElement('span');
      icon.className = 'achievement-icon';
      icon.textContent = achievements[item.key] ? '★' : '☆';
      const text = document.createElement('span');
      text.textContent = `${item.name} — ${achievements[item.key] ? item.desc : 'Locked'}`;
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
      user: state.userId ? state.playerName : 'Anonymous',
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

  function bindAuthUI() {
    auth.onAuthStateChanged((user) => {
      if (user) {
        state.userId = user.uid;
        state.playerName = user.displayName || (user.email ? user.email.split('@')[0] : 'Player');
        localStorage.setItem('playerName', state.playerName);
        closeModal('auth-modal');
        closeModal('email-auth-modal');
        displayStatistics();
      } else {
        state.userId = null;
        state.playerName = localStorage.getItem('playerName') || '';
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
        .then(() => {
          $('user-email').value = '';
          $('user-password').value = '';
        })
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
    $('view-achievements').addEventListener('click', () => {
      if (!state.userId) {
        toast('Log in to view achievements.', 'warn');
        return;
      }
      database.ref(`users/${state.userId}/achievements`).once('value')
        .then((snap) => displayAchievements(snap.val() || {}))
        .catch((err) => console.error('Achievements fetch failed:', err));
    });
    $('open-feedback').addEventListener('click', () => openModal('feedback-modal'));
    $('submit-feedback').addEventListener('click', submitFeedback);
    $('save-name-button').addEventListener('click', saveName);
    $('player-name-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveName();
      }
    });
    $('share-button').addEventListener('click', () => {
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(generateShareText())}`;
      window.open(url, '_blank', 'noopener');
    });
    $('share-whatsapp-button').addEventListener('click', () => {
      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(generateShareText())}`;
      window.open(url, '_blank', 'noopener');
    });
    const copyBtn = $('copy-result-button');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(generateShareText());
          toast('Result copied to clipboard!', 'success');
        } catch {
          toast('Could not copy to clipboard.', 'error');
        }
      });
    }
  }

  function init() {
    bindAuthUI();
    bindModalCloseUI();
    bindPhysicalKeyboard();
    bindUI();
    loadWordList().then(() => startGame(CONFIG.MODES.DAILY)).catch(() => {});
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
