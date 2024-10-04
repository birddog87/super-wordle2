(function() {
  // Initialize Firebase (Using your Firebase project's configuration)
  const firebaseConfig = {
    apiKey: "AIzaSyApXW3PWhqhQ0mXeIG1oo5mdawQD29Xxjs",
    authDomain: "wordle-upgrade-c055f.firebaseapp.com",
    databaseURL: "https://wordle-upgrade-c055f-default-rtdb.firebaseio.com",
    projectId: "wordle-upgrade-c055f",
    appId: "1:683362789332:web:e3aeb537a5f96773e85841",
  };
  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  var database = firebase.database();
  var auth = firebase.auth();

  // Variables to store game state
  let targetWord = '';
  let currentGuess = '';
  let guesses = [];
  let maxGuesses = 6;
  let wordLength = 5;
  let gameActive = false;
  let startTime;
  let playerName = '';
  let validWordsSet = new Set();
  let currentMode = 'daily';
  let correctPositions = []; // Track correct positions for animations

  // User ID for Firebase (after authentication)
  let userId = null;

  // Streak Counter
  let currentStreak = 0;

  // Load word list
  async function loadWordList() {
    try {
      const response = await fetch('words_en.txt');
      if (!response.ok) {
        throw new Error('Failed to load word list');
      }
      const text = await response.text();
      const wordsArray = text
        .split('\n')
        .map(word => word.trim().toLowerCase())
        .filter(word => word.length > 0);
      validWordsSet = new Set(wordsArray);
      console.log('Word list loaded');
    } catch (error) {
      console.error('Error loading word list:', error);
    }
  }

  // Function to update the mode indicator
  function updateModeIndicator(mode) {
    const modeIndicator = document.getElementById('mode-indicator');
    modeIndicator.textContent = `Current Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
    console.log('Mode updated:', mode);
  }

  // Event listeners for mode buttons
  document.getElementById('daily-mode-button').addEventListener('click', () => startGame('daily'));
  document.getElementById('random-mode-button').addEventListener('click', () => startGame('random'));
  document.getElementById('six-letter-mode-button').addEventListener('click', () => startGame('six-letter'));

  // Start the game based on mode
  async function startGame(mode) {
    console.log('Starting game in mode:', mode);
    await loadWordList();

    if (mode === 'daily') {
      const today = new Date().toLocaleDateString('en-CA');
      const dailyAttempted = localStorage.getItem('dailyAttempted');

      if (dailyAttempted === today) {
        // Instead of alert, display the daily-attempt-modal
        const dailyAttemptModal = document.getElementById('daily-attempt-modal');
        const dailyAttemptContent = document.getElementById('daily-attempt-content');
        dailyAttemptContent.innerHTML = `
          <p>You've already attempted today's word. Please try again tomorrow!</p>
          <p>The word of the day was: <strong>${targetWord.toUpperCase()}</strong></p>
          <button id="view-today-word-button">View Today's Word</button>
        `;

        // Optionally, add an event listener to the new button
        document.getElementById('view-today-word-button').addEventListener('click', () => {
          // Implement functionality to view today's word or related features
        });
        dailyAttemptModal.style.display = 'block';
        dailyAttemptModal.setAttribute('aria-hidden', 'false');
        return; // Exit the function to prevent starting a new game
      }
    }

    gameActive = true;
    currentGuess = '';
    guesses = [];
    startTime = new Date();
    currentMode = mode;
    correctPositions = new Array(wordLength).fill(false); // Reset correct positions

    updateModeIndicator(mode);

    getPlayerName();

    // Set word length and target word based on mode
    if (mode === 'daily') {
      wordLength = 5;
      targetWord = getDailyWord();
    } else if (mode === 'random') {
      wordLength = 5;
      targetWord = getRandomWord(wordLength);
    } else if (mode === 'six-letter') {
      wordLength = 6;
      targetWord = getRandomWord(wordLength);
    }

    console.log('Target word:', targetWord);

    maxGuesses = 6;

    // Reset the game board and keyboard
    createBoard();
    createKeyboard();
    updateBoard();
  }

  // Function to get a random word
  function getRandomWord(length) {
    const filteredWords = Array.from(validWordsSet).filter(word => word.length === length);
    return filteredWords[Math.floor(Math.random() * filteredWords.length)];
  }

  // Function to get the daily word
  function getDailyWord() {
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    const filteredWords = Array.from(validWordsSet).filter(word => word.length === 5);
    return filteredWords[seed % filteredWords.length];
  }

  // Get player's name from Firebase or prompt for it
  function getPlayerName() {
    if (userId) {
      database.ref(`users/${userId}/profile/name`).once('value').then(snapshot => {
        playerName = snapshot.val() || '';
        if (!playerName) {
          showNameModal();
        }
        updateUserDisplay();
      });
    } else {
      // If not authenticated, use localStorage
      playerName = localStorage.getItem('playerName') || '';
      if (!playerName) {
        showNameModal();
      }
      updateUserDisplay();
    }
  }

  // Show name entry modal
  function showNameModal() {
    const nameModal = document.getElementById('name-modal');
    nameModal.style.display = 'block';
    nameModal.setAttribute('aria-hidden', 'false');

    // Automatically focus the input field when the modal opens
    const playerNameInput = document.getElementById('player-name-input');
    playerNameInput.focus();

    document.getElementById('save-name-button').onclick = function () {
      const nameInput = playerNameInput;
      if (nameInput.value.trim()) {
        playerName = sanitizeHTML(nameInput.value.trim());
        if (userId) {
          // Save to Firebase
          database.ref(`users/${userId}/profile`).update({
            name: playerName
          });
        } else {
          // Save to localStorage
          localStorage.setItem('playerName', playerName);
        }
        nameModal.style.display = 'none';
        nameModal.setAttribute('aria-hidden', 'true');
        updateUserDisplay();
      } else {
        alert('Please enter your name.');
      }
    };
  }

  // Create game board
  function createBoard() {
    const gameBoard = document.getElementById('game-board');
    gameBoard.innerHTML = '';

    for (let i = 0; i < maxGuesses; i++) {
      const row = document.createElement('div');
      row.classList.add('board-row');
      row.style.gridTemplateColumns = `repeat(${wordLength}, 1fr)`;

      for (let j = 0; j < wordLength; j++) {
        const tile = document.createElement('div');
        tile.classList.add('tile');
        tile.setAttribute('data-row', i);
        tile.setAttribute('data-col', j);
        row.appendChild(tile);
      }
      gameBoard.appendChild(row);
    }

    console.log('Game board created with', maxGuesses * wordLength, 'tiles');
  }

  // Create keyboard
  function createKeyboard() {
    const keyboard = document.getElementById('keyboard');
    keyboard.innerHTML = '';

    const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
    rows.forEach((row, rowIndex) => {
      const rowDiv = document.createElement('div');
      rowDiv.classList.add('keyboard-row');

      // Add Enter key on the left of the last row
      if (rowIndex === 2) {
        const enterButton = document.createElement('button');
        enterButton.textContent = 'Enter';
        enterButton.classList.add('wide-button');
        enterButton.setAttribute('aria-label', 'Enter');
        enterButton.addEventListener('click', () => handleKeyPress('Enter'));
        rowDiv.appendChild(enterButton);
      }

      row.split('').forEach((key) => {
        const button = document.createElement('button');
        button.textContent = key;
        button.id = 'key-' + key;
        button.setAttribute('aria-label', key);
        button.addEventListener('click', () => handleKeyPress(key));
        rowDiv.appendChild(button);
      });

      // Add Backspace key on the right of the last row
      if (rowIndex === 2) {
        const backspaceButton = document.createElement('button');
        backspaceButton.textContent = '←';
        backspaceButton.classList.add('wide-button');
        backspaceButton.setAttribute('aria-label', 'Backspace');
        backspaceButton.addEventListener('click', () => handleKeyPress('Backspace'));
        rowDiv.appendChild(backspaceButton);
      }

      keyboard.appendChild(rowDiv);
    });
  }

  // Handle key presses
  function handleKeyPress(key) {
    if (!gameActive) return;

    console.log('Key pressed:', key);

    key = key.toLowerCase();

    if (key === 'enter') {
      if (currentGuess.length === wordLength) {
        if (validWordsSet.has(currentGuess.toLowerCase())) {
          submitGuess();
        } else {
          showInvalidGuess();
        }
      }
    } else if (key === 'backspace') {
      currentGuess = currentGuess.slice(0, -1);
      updateBoard();
    } else if (/^[a-z]$/.test(key)) {
      if (currentGuess.length < wordLength) {
        currentGuess += key;
        updateBoard();
      }
    }
  }

  // Update game board
  function updateBoard() {
    const gameBoard = document.getElementById('game-board');
    const currentRow = gameBoard.children[guesses.length];
    const tiles = currentRow.querySelectorAll('.tile');

    for (let i = 0; i < wordLength; i++) {
      const tile = tiles[i];
      tile.textContent = currentGuess[i] ? currentGuess[i].toUpperCase() : '';
      tile.classList.remove('invalid');
      tile.classList.remove('flip');
    }

    console.log('Board updated. Current guess:', currentGuess);
  }

  // Submit guess and update keyboard
  function submitGuess() {
    console.log('Submitting guess:', currentGuess);

    const gameBoard = document.getElementById('game-board');
    const currentRow = gameBoard.children[guesses.length];
    const tiles = currentRow.querySelectorAll('.tile');
    const guessArray = currentGuess.split('');
    const targetArray = targetWord.split('');
    const matchedIndices = new Array(wordLength).fill(false);
    const animationPromises = [];

    // First pass: Check for correct letters in the correct position (Green)
    for (let i = 0; i < wordLength; i++) {
      if (guessArray[i] === targetArray[i]) {
        matchedIndices[i] = true;
      }
    }

    // Second pass: Check for correct letters in the wrong position (Yellow) and incorrect letters (Grey)
    for (let i = 0; i < wordLength; i++) {
      const tile = tiles[i];
      const keyButton = document.getElementById('key-' + guessArray[i].toUpperCase());

      setTimeout(() => {
        tile.classList.add('flip');

        if (guessArray[i] === targetArray[i]) {
          tile.classList.add('correct');

          // Apply water filling animation
          if (!correctPositions[i]) {
            tile.classList.add('correct-first-time');
            correctPositions[i] = true;
            // Play pop sound
            playPopSound();
          }

          // Always set the key to 'key-correct' regardless of its current class
          keyButton.classList.remove('key-absent', 'key-present');
          keyButton.classList.add('key-correct');
        } else if (targetWord.includes(guessArray[i])) {
          tile.classList.add('present');
          // Upgrade to 'key-present' only if it's not already 'key-correct'
          if (!keyButton.classList.contains('key-correct')) {
            keyButton.classList.remove('key-absent');
            keyButton.classList.add('key-present');
          }
        } else {
          tile.classList.add('absent');
          // Only set to 'key-absent' if it hasn't been marked before
          if (
            !keyButton.classList.contains('key-correct') &&
            !keyButton.classList.contains('key-present') &&
            !keyButton.classList.contains('key-absent')
          ) {
            keyButton.classList.add('key-absent');
          }
        }
      }, i * 500);

      animationPromises.push(new Promise(resolve => setTimeout(resolve, (i + 1) * 500)));
    }

    Promise.all(animationPromises).then(() => {
      guesses.push(currentGuess);

      if (currentGuess === targetWord) {
        gameActive = false;
        setTimeout(() => {
          showWinningAnimation();
          logResult(true, currentMode);
          updateAchievements();
          if (currentMode === 'daily') {
            localStorage.setItem('dailyAttempted', new Date().toLocaleDateString('en-CA'));
          }
        }, 500);
      } else if (guesses.length === maxGuesses) {
        gameActive = false;
        setTimeout(() => {
          alert(`Game Over! The word was ${targetWord.toUpperCase()}.`);
          logResult(false, currentMode);
          updateAchievements();
          if (currentMode === 'daily') {
            localStorage.setItem('dailyAttempted', new Date().toLocaleDateString('en-CA'));
          }
        }, 500);
      }

      currentGuess = '';
    });
  }

  // Function to play pop sound
  function playPopSound() {
    const popSound = new Audio('pop-sound.mp3'); // Ensure you have this audio file
    popSound.play();
  }

  // Function to log the result to Firebase
  function logResult(won, mode) {
    const endTime = new Date();
    const timeTaken = Math.floor((endTime - startTime) / 1000); // in seconds
    const today = new Date().toLocaleDateString('en-CA'); // e.g., "2024-09-25"

    const log = {
      player: playerName,
      time: endTime.toLocaleString(),
      date: today, // Add date to the log
      timeTaken: timeTaken,
      attempts: guesses.length,
      word: targetWord.toUpperCase(),
      won: won,
    };

    if (userId) {
      // Save the log to Firebase under the appropriate mode and date
      database.ref(`leaderboard/${mode}/${today}/${Date.now()}`).set(log)
        .catch(error => {
          console.error('Error writing to leaderboard:', error);
          alert('Unable to log your game result. Please try again later.');
        });

      // Update user statistics
      updateUserStats(won, guesses.length);
    } else {
      alert('Please log in to save your game results.');
    }
  }

  // Show invalid guess animation
  function showInvalidGuess() {
    const gameBoard = document.getElementById('game-board');
    const currentRow = gameBoard.children[guesses.length];
    const tiles = currentRow.querySelectorAll('.tile');

    tiles.forEach(tile => {
      tile.classList.add('invalid');
    });

    setTimeout(() => {
      tiles.forEach(tile => {
        tile.classList.remove('invalid');
      });
      }, 500);
  }

  // Function to show the winning animation and modal
  function showWinningAnimation() {
    const winningModal = document.getElementById('winning-modal');
    winningModal.style.display = 'block';
    winningModal.setAttribute('aria-hidden', 'false');

    // Display the word in the modal
    const winningWordDisplay = document.getElementById('winning-word-display');
    winningWordDisplay.textContent = `You guessed the word: ${targetWord.toUpperCase()}`;

    // Fetch and display the word's definition
    fetchWordDefinition(targetWord)
      .then(details => {
        const definitionDiv = document.getElementById('word-definition');
        let htmlContent = `<strong>Definition:</strong><br>`;
        details.forEach(detail => {
          htmlContent += `<strong>${detail.partOfSpeech}:</strong> ${detail.definitions.join(', ')}<br>`;
          if (detail.synonyms && detail.synonyms.length > 0) {
            htmlContent += `<strong>Synonyms:</strong> ${detail.synonyms.join(', ')}<br>`;
          }
          if (detail.antonyms && detail.antonyms.length > 0) {
            htmlContent += `<strong>Antonyms:</strong> ${detail.antonyms.join(', ')}<br>`;
          }
        });
        definitionDiv.innerHTML = htmlContent;
      })
      .catch(error => {
        const definitionDiv = document.getElementById('word-definition');
        definitionDiv.innerHTML = `<strong>Definition:</strong> Not found.`;
        console.error('Error fetching word details:', error);
      });

    // Trigger the confetti animation
    triggerConfetti();
  }

  // Function to trigger confetti animation
  function triggerConfetti() {
    const confettiCanvas = document.getElementById('confetti-canvas');
    const myConfetti = confetti.create(confettiCanvas, { resize: true, useWorker: true });
    const end = Date.now() + (5 * 1000); // Run for 5 seconds

    // Confetti animation frame function
    (function frame() {
      // Launch confetti from random positions
      myConfetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: Math.random() },
      });
      myConfetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: Math.random() },
      });

      // Continue the animation if time hasn't expired
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  }

  // Fetch word definition from dictionary API
  async function fetchWordDefinition(word) {
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
      if (!response.ok) {
        throw new Error('Word details not found');
      }
      const data = await response.json();
      const meanings = data[0].meanings.map(meaning => ({
        partOfSpeech: meaning.partOfSpeech,
        definitions: meaning.definitions.map(def => def.definition),
        synonyms: meaning.synonyms,
        antonyms: meaning.antonyms,
      }));
      return meanings;
    } catch (error) {
      console.error('Error fetching word details:', error);
      return [{
        partOfSpeech: 'N/A',
        definitions: ['Details not available.'],
        synonyms: [],
        antonyms: [],
      }];
    }
  }

  // Share on Twitter
  document.getElementById('share-button').addEventListener('click', () => {
    const shareText = generateShareText();
    const twitterURL = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(twitterURL, '_blank');
  });

  // Share on WhatsApp
  document.getElementById('share-whatsapp-button').addEventListener('click', () => {
    const shareText = generateShareText();
    const whatsappURL = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappURL, '_blank');
  });

  // Generate share text similar to Wordle, including time taken
  function generateShareText() {
    const endTime = new Date();
    const timeTaken = Math.floor((endTime - startTime) / 1000); // in seconds

    let shareText = `Wordle Upgrade - ${currentMode.charAt(0).toUpperCase() + currentMode.slice(1)} Mode\n`;
    shareText += `${guesses.length}/${maxGuesses}, Time: ${timeTaken}s\n\n`;

    guesses.forEach(guess => {
      let rowResult = '';
      for (let i = 0; i < wordLength; i++) {
        if (guess[i] === targetWord[i]) {
          rowResult += '🟩';
        } else if (targetWord.includes(guess[i])) {
          rowResult += '🟨';
        } else {
          rowResult += '⬛';
        }
      }
      shareText += rowResult + '\n';
    });

    return shareText;
  }

  // Statistics Tracking
  function updateUserStats(won, attempts) {
    if (!userId) return; // Only track stats for authenticated users

    const statsRef = database.ref(`users/${userId}/stats`);
    statsRef.transaction((currentStats) => {
      if (currentStats === null) {
        currentStreak = won ? 1 : 0;
        return {
          gamesPlayed: 1,
          gamesWon: won ? 1 : 0,
          currentStreak: currentStreak,
          maxStreak: currentStreak,
          totalAttempts: won ? attempts : 0,
        };
      } else {
        currentStats.gamesPlayed += 1;
        if (won) {
          currentStats.gamesWon += 1;
          currentStats.currentStreak += 1;
          currentStreak = currentStats.currentStreak;
          if (currentStats.currentStreak > currentStats.maxStreak) {
            currentStats.maxStreak = currentStats.currentStreak;
          }
          currentStats.totalAttempts += attempts;
        } else {
          currentStats.currentStreak = 0;
          currentStreak = 0;
        }
        return currentStats;
      }
    }).then(() => {
      document.getElementById('streak-counter').textContent = `Current Streak: ${currentStreak}`;
    });
  }

  // Display Statistics Chart
  function displayStatistics() {
    if (!userId) return;

    const statsRef = database.ref(`users/${userId}/stats`);
    statsRef.once('value').then(snapshot => {
      const stats = snapshot.val();
      if (stats) {
        const gamesPlayed = stats.gamesPlayed;
        const gamesWon = stats.gamesWon;
        const winPercentage = gamesPlayed > 0 ? ((gamesWon / gamesPlayed) * 100).toFixed(2) : 0;
        const averageAttempts = gamesWon > 0 ? (stats.totalAttempts / stats.gamesWon).toFixed(2) : 0;
        currentStreak = stats.currentStreak || 0;

        document.getElementById('streak-counter').textContent = `Current Streak: ${currentStreak}`;

        const ctx = document.getElementById('stats-chart').getContext('2d');
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: ['Games Played', 'Win %', 'Avg Attempts'],
            datasets: [{
              label: 'Statistics',
              data: [gamesPlayed, winPercentage, averageAttempts],
              backgroundColor: ['#538D4E', '#B59F3B', '#3A3A3C']
            }]
          },
          options: {
            responsive: true,
            scales: {
              y: { beginAtZero: true }
            }
          }
        });
      }
    });
  }

  // Function to sanitize HTML to prevent XSS
  function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  }

  // Handle Physical Keyboard Input
  document.addEventListener('keydown', (event) => {
    // Check if modals are open and skip if any modal is open
    const modals = document.querySelectorAll('.modal');
    let isAnyModalOpen = false;

    modals.forEach((modal) => {
      if (modal.style.display === 'block') {
        isAnyModalOpen = true;
      }
    });

    if (isAnyModalOpen) return;

    const key = event.key;

    // Only allow a single character or Backspace/Enter
    if (key === 'Backspace' || key === 'Enter' || /^[a-zA-Z]$/.test(key)) {
      handleKeyPress(key.toLowerCase());
    }
  });

  // Update user display
  function updateUserDisplay() {
    const userDisplay = document.getElementById('user-display');
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');

    if (userId) {
      userDisplay.textContent = 'Logged in as: ' + playerName;
      logoutButton.style.display = 'inline-block';
      loginButton.style.display = 'none';
    } else {
      userDisplay.textContent = 'Not logged in';
      logoutButton.style.display = 'none';
      loginButton.style.display = 'inline-block';
    }
  }

  // Authentication Logic
  const authModalElement = document.getElementById('auth-modal');
  const emailAuthModalElement = document.getElementById('email-auth-modal');

  // Open Authentication Modal on Page Load if Not Authenticated
  auth.onAuthStateChanged((user) => {
    if (user) {
      userId = user.uid;
      playerName = user.displayName || user.email;
      localStorage.setItem('playerName', playerName);
      authModalElement.style.display = 'none';
      emailAuthModalElement.style.display = 'none';
      displayStatistics();
      updateUserDisplay();
    } else {
      userId = null;
      playerName = '';
      updateUserDisplay();
    }
  });

  // Login Button Event Listener
  document.getElementById('login-button').addEventListener('click', () => {
    authModalElement.style.display = 'block';
    authModalElement.setAttribute('aria-hidden', 'false');
  });

  // Email Sign-In Button
  document.getElementById('email-signin-button').addEventListener('click', () => {
    authModalElement.style.display = 'none';
    authModalElement.setAttribute('aria-hidden', 'true');
    emailAuthModalElement.style.display = 'block';
    emailAuthModalElement.setAttribute('aria-hidden', 'false');
  });

  // Email Sign-In Submit
  document.getElementById('email-signin-submit-button').addEventListener('click', () => {
    const email = document.getElementById('user-email').value.trim();
    const password = document.getElementById('user-password').value.trim();
    if (email && password) {
      auth.signInWithEmailAndPassword(email, password)
        .then(() => {
          // Success: Close the email auth modal
          emailAuthModalElement.style.display = 'none';
          emailAuthModalElement.setAttribute('aria-hidden', 'true');
          authModalElement.style.display = 'none';
          authModalElement.setAttribute('aria-hidden', 'true');
        })
        .catch(error => {
          console.error('Email Sign-In Error:', error);
          alert('Error signing in. Please check your credentials.');
        });
    } else {
      alert('Please enter both email and password.');
    }
  });

  // Email Sign-Up Button
  document.getElementById('email-signup-button').addEventListener('click', () => {
    authModalElement.style.display = 'none';
    authModalElement.setAttribute('aria-hidden', 'true');
    emailAuthModalElement.style.display = 'block';
    emailAuthModalElement.setAttribute('aria-hidden', 'false');
  });

  // Email Sign-Up Submit
  document.getElementById('email-signup-submit-button').addEventListener('click', () => {
    const email = document.getElementById('user-email').value.trim();
    const password = document.getElementById('user-password').value.trim();
    if (email && password) {
      auth.createUserWithEmailAndPassword(email, password)
        .then(() => {
          // Success: Close the email auth modal
          emailAuthModalElement.style.display = 'none';
          emailAuthModalElement.setAttribute('aria-hidden', 'true');
          authModalElement.style.display = 'none';
          authModalElement.setAttribute('aria-hidden', 'true');
        })
        .catch(error => {
          console.error('Email Sign-Up Error:', error);
          alert('Error signing up. Please try a different email.');
        });
    } else {
      alert('Please enter both email and password.');
    }
  });

  // Logout functionality
  document.getElementById('logout-button').addEventListener('click', () => {
    auth.signOut().then(() => {
      console.log('User signed out');
      userId = null;
      playerName = '';
      localStorage.removeItem('playerName');
      updateUserDisplay();
      // Optionally, restart the game
      startGame('daily');
    }).catch((error) => {
      console.error('Error signing out:', error);
    });
  });

  // Ensure modals have close buttons and event listeners
  const modalsList = document.querySelectorAll('.modal');
  modalsList.forEach(modal => {
    const closeButton = modal.querySelector('.close');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
      });
    }
  });

  // View leaderboard data
  function viewLeaderboard() {
    const leaderboardModal = document.getElementById('leaderboard-modal');
    leaderboardModal.style.display = 'block';
    leaderboardModal.setAttribute('aria-hidden', 'false');

    const tabs = document.querySelectorAll('.tablink');
    const tabContents = document.querySelectorAll('.tabcontent');

    tabs.forEach(tab => {
      tab.addEventListener('click', (event) => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        tabContents.forEach(content => content.classList.remove('active'));
        const activeContent = document.getElementById(tab.getAttribute('data-tab'));
        activeContent.classList.add('active');

        // Fetch leaderboard data for the active tab
        const mode = tab.getAttribute('data-tab').replace('leaderboard-', '');
        fetchLeaderboardData(mode, activeContent);
      });
    });

    // Fetch and display leaderboard data for the active tab
    const activeTab = document.querySelector('.tablink.active').getAttribute('data-tab');
    const mode = activeTab.replace('leaderboard-', '');
    const container = document.getElementById(activeTab);
    fetchLeaderboardData(mode, container);
  }

  // Fetch leaderboard data
  function fetchLeaderboardData(mode, container) {
    const selectedDate = document.getElementById('leaderboard-date').value;
    database.ref(`leaderboard/${mode}`).once('value')
      .then(snapshot => {
        const data = snapshot.val();
        const leaderboardHTML = displayLeaderboard(data, mode, selectedDate);
        container.innerHTML = leaderboardHTML;
      })
      .catch(error => {
        console.error('Error fetching leaderboard data:', error);
        container.innerHTML = '<p>Error loading leaderboard. Please try again later.</p>';
      });
  }

  // Display leaderboard
  function displayLeaderboard(data, mode, selectedDate) {
    if (!data) {
      return `<p>No leaderboard data available for ${mode} mode.</p>`;
    }

    const allEntries = [];

    // Function to recursively extract entries
    function extractEntries(obj, path = '') {
      Object.keys(obj).forEach(key => {
        const value = obj[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          if (value.player) {
            // Filter by selected date if provided
            if (selectedDate) {
              const entryDate = value.date || '';
              if (entryDate === selectedDate) {
                allEntries.push(value);
              }
            } else {
              allEntries.push(value);
            }
          } else {
            extractEntries(value, path + '/' + key);
          }
        }
      });
    }

    extractEntries(data);

    if (allEntries.length === 0) {
      return `<p>No leaderboard data available for ${mode} mode on the selected date.</p>`;
    }

    // Sort the entries
    allEntries.sort((a, b) => {
      if (a.won !== b.won) return b.won - a.won; // Sort by wins first
      if (a.attempts !== b.attempts) return a.attempts - b.attempts; // Then by attempts
      return a.timeTaken - b.timeTaken; // Finally by time taken
    });

    let leaderboardHTML = '<table><tr><th>Rank</th><th>Player</th><th>Date</th><th>Time (s)</th><th>Attempts</th></tr>';

    const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };

    allEntries.slice(0, 10).forEach((entry, index) => {
      const date = new Date(entry.time);
      const formattedDate = date.toLocaleDateString('en-US', dateOptions);

      leaderboardHTML += `<tr>
        <td data-label="Rank">${index + 1}</td>
        <td data-label="Player">${sanitizeHTML(entry.player)}</td>
        <td data-label="Date">${formattedDate}</td>
        <td data-label="Time (s)">${entry.timeTaken}</td>
        <td data-label="Attempts">${entry.attempts}</td>
      </tr>`;
    });

    leaderboardHTML += '</table>';
    return leaderboardHTML;
  }

  // Add event listener for date input
  document.getElementById('leaderboard-date').addEventListener('change', () => {
    const activeTab = document.querySelector('.tablink.active').getAttribute('data-tab');
    const mode = activeTab.replace('leaderboard-', '');
    const container = document.getElementById(activeTab);
    fetchLeaderboardData(mode, container);
  });

  // Add event listener for view leaderboard button
  document.getElementById('view-leaderboard').addEventListener('click', viewLeaderboard);

  // Initialize the game on page load
  window.addEventListener('load', () => {
    console.log('Page loaded, initializing game');
    startGame('daily');
  });

  // Define updateAchievements function
  function updateAchievements() {
    if (!userId) return;

    const achievementsRef = database.ref(`users/${userId}/achievements`);
    const statsRef = database.ref(`users/${userId}/stats`);

    Promise.all([achievementsRef.once('value'), statsRef.once('value')])
      .then(([achievementsSnapshot, statsSnapshot]) => {
        const achievements = achievementsSnapshot.val() || {};
        const stats = statsSnapshot.val() || {};

        // Check for new achievements
        if (stats.gamesWon >= 1 && !achievements.firstWin) {
          achievements.firstWin = true;
        }
        if (stats.gamesWon >= 10 && !achievements.tenWins) {
          achievements.tenWins = true;
        }
        if (stats.currentStreak >= 5 && !achievements.fiveStreak) {
          achievements.fiveStreak = true;
        }
        if (stats.maxStreak >= 10 && !achievements.tenStreak) {
          achievements.tenStreak = true;
        }

        // Update achievements in Firebase
        achievementsRef.set(achievements);

        // Display new achievements
        displayAchievements(achievements);
      })
      .catch(error => {
        console.error('Error updating achievements:', error);
      });
  }

  // Function to display achievements
  function displayAchievements(achievements) {
    const achievementsList = document.getElementById('achievements-list');
    achievementsList.innerHTML = '';

    const achievementItems = [
      { key: 'firstWin', name: 'First Win', description: 'Win your first game' },
      { key: 'tenWins', name: 'Decathlon', description: 'Win 10 games' },
      { key: 'fiveStreak', name: 'Hot Streak', description: 'Achieve a 5-game winning streak' },
      { key: 'tenStreak', name: 'Unstoppable', description: 'Achieve a 10-game winning streak' }
    ];

    achievementItems.forEach(item => {
      const li = document.createElement('li');
      li.className = 'achievement';
      if (achievements[item.key]) {
        li.innerHTML = `<img src="images/${item.key}.png" alt="${item.name}"> <span>${item.name}: ${item.description}</span>`;
      } else {
        li.innerHTML = `<img src="images/locked.png" alt="Locked"> <span>${item.name}: Locked</span>`;
      }
      achievementsList.appendChild(li);
    });

    // Show achievements modal
    const achievementsModal = document.getElementById('achievements-modal');
    achievementsModal.style.display = 'block';
    achievementsModal.setAttribute('aria-hidden', 'false');
  }

  // Add event listener for view achievements button
  document.getElementById('view-achievements').addEventListener('click', () => {
    if (userId) {
      const achievementsRef = database.ref(`users/${userId}/achievements`);
      achievementsRef.once('value')
        .then(snapshot => {
          const achievements = snapshot.val() || {};
          displayAchievements(achievements);
        })
        .catch(error => {
          console.error('Error fetching achievements:', error);
        });
    } else {
      alert('Please log in to view your achievements.');
    }
  });

  // Function to handle feedback submission
  function submitFeedback() {
    const feedbackText = document.getElementById('feedback-text').value.trim();
    if (feedbackText) {
      const feedbackRef = database.ref('feedback');
      feedbackRef.push({
        user: userId ? playerName : 'Anonymous',
        feedback: feedbackText,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      }).then(() => {
        alert('Thank you for your feedback!');
        document.getElementById('feedback-modal').style.display = 'none';
        document.getElementById('feedback-text').value = '';
      }).catch(error => {
        console.error('Error submitting feedback:', error);
        alert('There was an error submitting your feedback. Please try again.');
      });
    } else {
      alert('Please enter your feedback before submitting.');
    }
  }

  // Add event listener for feedback submission
  document.getElementById('submit-feedback').addEventListener('click', submitFeedback);

  // Add event listener for opening feedback modal
  document.getElementById('open-feedback').addEventListener('click', () => {
    document.getElementById('feedback-modal').style.display = 'block';
  });

  // Function to close modal when clicking outside
  window.onclick = function(event) {
    const modals = document.getElementsByClassName('modal');
    for (let i = 0; i < modals.length; i++) {
      if (event.target == modals[i]) {
        modals[i].style.display = "none";
        modals[i].setAttribute('aria-hidden', 'true');
      }
    }
  }

})();
