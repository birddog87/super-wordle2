import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';

// Word lists (you should replace these with more extensive lists)
const WORD_LIST_5 = ['REACT', 'REDUX', 'HOOKS', 'STATE', 'PROPS'];
const WORD_LIST_6 = ['PYTHON', 'CODING', 'GITHUB', 'GITLAB', 'NODEJS'];

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE'],
];

const MAX_ATTEMPTS = 6;

const SuperWordle = () => {
  const [wordLength, setWordLength] = useState(5);
  const [gameMode, setGameMode] = useState('random');
  const [targetWord, setTargetWord] = useState('');
  const [guesses, setGuesses] = useState(Array(MAX_ATTEMPTS).fill(''));
  const [currentAttempt, setCurrentAttempt] = useState(0);
  const [gameStatus, setGameStatus] = useState('playing');
  const [timer, setTimer] = useState(0);
  const [keyboardStatus, setKeyboardStatus] = useState({});
  const [showInstructions, setShowInstructions] = useState(false);
  const [showShareResults, setShowShareResults] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [shakeTiles, setShakeTiles] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [wordChangeAnimation, setWordChangeAnimation] = useState(false);
  const confettiRef = useRef(null);
  const [stats, setStats] = useState(() => {
    const savedStats = localStorage.getItem('superWordleStats');
    return savedStats ? JSON.parse(savedStats) : {
      gamesPlayed: 0,
      gamesWon: 0,
      currentStreak: 0,
      maxStreak: 0,
    };
  });

  const generateRandomWord = useCallback(() => {
    const wordList = wordLength === 5 ? WORD_LIST_5 : WORD_LIST_6;
    return wordList[Math.floor(Math.random() * wordList.length)];
  }, [wordLength]);

  const generateDailyWord = useCallback(() => {
    const today = new Date().toDateString();
    let seed = 0;
    for (let i = 0; i < today.length; i++) {
      seed += today.charCodeAt(i);
    }
    const wordList = wordLength === 5 ? WORD_LIST_5 : WORD_LIST_6;
    return wordList[seed % wordList.length];
  }, [wordLength]);

  useEffect(() => {
    setWordChangeAnimation(true);
    setTimeout(() => {
      if (gameMode === 'random') {
        setTargetWord(generateRandomWord());
      } else {
        setTargetWord(generateDailyWord());
      }
      setWordChangeAnimation(false);
    }, 500);
  }, [gameMode, wordLength, generateRandomWord, generateDailyWord]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (gameStatus === 'playing') {
        setTimer((prevTimer) => prevTimer + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [gameStatus]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (gameStatus === 'playing') {
        if (event.key === 'Enter') {
          submitGuess();
        } else {
          handleKeyPress(event.key.toUpperCase());
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameStatus, guesses, currentAttempt, wordLength]);

  useEffect(() => {
    localStorage.setItem('superWordleStats', JSON.stringify(stats));
  }, [stats]);

  const handleKeyPress = (key) => {
    if (gameStatus !== 'playing') return;

    if (key === 'BACKSPACE') {
      setGuesses((prevGuesses) => {
        const newGuesses = [...prevGuesses];
        newGuesses[currentAttempt] = newGuesses[currentAttempt].slice(0, -1);
        return newGuesses;
      });
    } else if (/^[A-Z]$/.test(key) && guesses[currentAttempt].length < wordLength) {
      setGuesses((prevGuesses) => {
        const newGuesses = [...prevGuesses];
        newGuesses[currentAttempt] += key;
        return newGuesses;
      });
    }
  };

  const submitGuess = () => {
    if (guesses[currentAttempt].length === wordLength) {
      checkGuess();
    } else {
      setShakeTiles(true);
      setTimeout(() => setShakeTiles(false), 500);
    }
  };

  const checkGuess = () => {
    const currentGuess = guesses[currentAttempt];
    const newKeyboardStatus = { ...keyboardStatus };
    let correctCount = 0;

    for (let i = 0; i < wordLength; i++) {
      if (currentGuess[i] === targetWord[i]) {
        correctCount++;
        newKeyboardStatus[currentGuess[i]] = 'correct';
      } else if (targetWord.includes(currentGuess[i])) {
        if (newKeyboardStatus[currentGuess[i]] !== 'correct') {
          newKeyboardStatus[currentGuess[i]] = 'present';
        }
      } else {
        newKeyboardStatus[currentGuess[i]] = 'absent';
      }
    }

    setKeyboardStatus(newKeyboardStatus);

    if (correctCount === wordLength) {
      setGameStatus('won');
      updateStats(true);
      triggerWinAnimation();
    } else if (currentAttempt === MAX_ATTEMPTS - 1) {
      setGameStatus('lost');
      updateStats(false);
    } else {
      setCurrentAttempt((prevAttempt) => prevAttempt + 1);
    }
  };

  const triggerWinAnimation = () => {
    setShowConfetti(true);
    setTimeout(() => setShowShareResults(true), 1500);
  };

  const updateStats = (won) => {
    setStats((prevStats) => {
      const newStats = {
        gamesPlayed: prevStats.gamesPlayed + 1,
        gamesWon: won ? prevStats.gamesWon + 1 : prevStats.gamesWon,
        currentStreak: won ? prevStats.currentStreak + 1 : 0,
        maxStreak: won
          ? Math.max(prevStats.maxStreak, prevStats.currentStreak + 1)
          : prevStats.maxStreak,
      };
      return newStats;
    });
  };

  const resetGame = () => {
    setGuesses(Array(MAX_ATTEMPTS).fill(''));
    setCurrentAttempt(0);
    setGameStatus('playing');
    setTimer(0);
    setKeyboardStatus({});
    setShowShareResults(false);
    setShowConfetti(false);
    setWordChangeAnimation(true);
    setTimeout(() => {
      if (gameMode === 'random') {
        setTargetWord(generateRandomWord());
      } else {
        setTargetWord(generateDailyWord());
      }
      setWordChangeAnimation(false);
    }, 500);
  };

  const shareResults = () => {
    let result = `SuperWordle ${wordLength} ${gameMode === 'daily' ? format(new Date(), 'yyyy-MM-dd') : 'random'}\n`;
    result += `${currentAttempt + 1}/${MAX_ATTEMPTS}\n\n`;

    for (let i = 0; i <= currentAttempt; i++) {
      for (let j = 0; j < wordLength; j++) {
        if (guesses[i][j] === targetWord[j]) {
          result += '🟩';
        } else if (targetWord.includes(guesses[i][j])) {
          result += '🟨';
        } else {
          result += '⬛';
        }
      }
      result += '\n';
    }

    navigator.clipboard.writeText(result).then(() => {
      alert('Results copied to clipboard!');
    });
  };

  const toggleDarkMode = () => {
    setDarkMode((prevMode) => !prevMode);
    document.body.classList.toggle('dark');
  };

  const Confetti = () => {
    useEffect(() => {
      const canvas = confettiRef.current;
      const ctx = canvas.getContext('2d');
      const confettiPieces = [];

      const colors = ['#f00', '#0f0', '#00f', '#ff0', '#f0f', '#0ff'];

      for (let i = 0; i < 100; i++) {
        confettiPieces.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 5 + 5,
          color: colors[Math.floor(Math.random() * colors.length)],
          speedY: Math.random() * 3 + 1,
          speedX: Math.random() * 2 - 1,
        });
      }

      const animate = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        confettiPieces.forEach((piece) => {
          ctx.beginPath();
          ctx.arc(piece.x, piece.y, piece.size, 0, 2 * Math.PI);
          ctx.fillStyle = piece.color;
          ctx.fill();

          piece.y += piece.speedY;
          piece.x += piece.speedX;

          if (piece.y > canvas.height) {
            piece.y = 0;
          }
        });

        requestAnimationFrame(animate);
      };

      animate();
    }, []);

    return (
      <canvas
        ref={confettiRef}
        className="fixed inset-0 pointer-events-none"
        width={window.innerWidth}
        height={window.innerHeight}
      />
    );
  };

  return (
    <div className={`flex flex-col items-center justify-center min-h-screen ${darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100 text-black'}`}>
      <motion.h1 
        className="text-4xl font-bold mb-4"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        SuperWordle
      </motion.h1>
      <div className="mb-4">
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setGameMode('random')} 
          className={`mr-2 px-3 py-1 rounded ${gameMode === 'random' ? 'bg-blue-500 text-white' : 'bg-gray-300'}`}
        >
          Random
        </motion.button>
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setGameMode('daily')} 
          className={`px-3 py-1 rounded ${gameMode === 'daily' ? 'bg-blue-500 text-white' : 'bg-gray-300'}`}
        >
          Daily
        </motion.button>
      </div>
      <div className="mb-4">
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setWordLength(5)} 
          className={`mr-2 px-3 py-1 rounded ${wordLength === 5 ? 'bg-blue-500 text-white' : 'bg-gray-300'}`}
        >
          5 Letters
        </motion.button>
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setWordLength(6)} 
          className={`px-3 py-1 rounded ${wordLength === 6 ? 'bg-blue-500 text-white' : 'bg-gray-300'}`}
        >
          6 Letters
        </motion.button>
      </div>
      <motion.div 
        className="grid grid-rows-6 gap-2 mb-4"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {guesses.map((guess, index) => (
          <motion.div 
            key={index} 
            className="flex"
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            {[...Array(wordLength)].map((_, i) => (
              <motion.div
                key={i}
                className={`w-12 h-12 border-2 flex items-center justify-center text-2xl font-bold ${
                  index < currentAttempt
                    ? guess[i] === targetWord[i]
                      ? 'bg-green-500'
                      : targetWord.includes(guess[i])
                      ? 'bg-yellow-500'
                      : 'bg-gray-500'
                    : 'border-gray-300'
                }`}
                initial={{ rotateY: 0 }}
                animate={{ 
                  rotateY: guess[i] && index < currentAttempt ? 360 : 0,
                  scale: shakeTiles && index === currentAttempt ? [1, 1.1, 1] : 1
                }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                {guess[i] || ''}
              </motion.div>
            ))}
          </motion.div>
        ))}
      </motion.div>
      <motion.div 
        className="mb-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <p>Timer: {format(timer * 1000, 'mm:ss')}</p>
      </motion.div>
      <motion.div 
        className="mb-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        {KEYBOARD_ROWS.map((row, rowIndex) => (
          <div key={rowIndex} className="flex justify-center mb-2">
            {row.map((key) => (
              <motion.button
                key={key}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => key === 'ENTER' ? submitGuess() : handleKeyPress(key)}
                className={`mx-1 px-3 py-2 rounded ${
                  keyboardStatus[key] === 'correct'
                    ? 'bg-green-500'
                    : keyboardStatus[key] === 'present'
                    ? 'bg-yellow-500'
                    : keyboardStatus[key] === 'absent'
                    ? 'bg-gray-500'
                    : 'bg-gray-300'
                }`}
              >
                {key}
              </motion.button>
            ))}
          </div>
        ))}
      </motion.div>
      <AnimatePresence>
        {gameStatus !== 'playing' && (
          <motion.div 
            className="mb-4"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
          >
            <h2 className="text-2xl font-bold mb-2">
              {gameStatus === 'won' ? 'Congratulations!' : 'Game Over'}
            </h2>
            <p>The word was: {targetWord}</p>
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={resetGame} 
              className="mr-2 px-3 py-1 rounded bg-blue-500 text-white"
            >
              Play Again
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={shareResults} 
              className="px-3 py-1 rounded bg-green-500 text-white"
            >
              Share Results
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div 
        className="mb-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
      >
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowInstructions(true)} 
          className="px-3 py-1 rounded bg-gray-300"
        >
          How to Play
        </motion.button>
      </motion.div>
      <motion.div 
        className="mb-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1 }}
      >
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={toggleDarkMode} 
          className="px-3 py-1 rounded bg-gray-300"
        >
          {darkMode ? 'Light Mode' : 'Dark Mode'}
        </motion.button>
      </motion.div>
      <AnimatePresence>
        {showInstructions && (
          <motion.div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div 
              className={`bg-white p-6 rounded-lg ${darkMode ? 'text-black' : ''}`}
              initial={{ scale: 0.5, y: -100 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.5, y: -100 }}
            >
              <h2 className="text-2xl font-bold mb-4">How to Play</h2>
              <ul className="list-disc pl-6 mb-4">
                <li>Guess the word in 6 tries.</li>
                <li>Each guess must be a valid {wordLength}-letter word.</li>
                <li>The color of the tiles will change to show how close your guess was:</li>
                <ul className="list-disc pl-6">
                  <li>Green: The letter is correct and in the right position.</li>
                  <li>Yellow: The letter is in the word but in the wrong position.</li>
                  <li>Gray: The letter is not in the word.</li>
                </ul>
              </ul>
              <motion.button 
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowInstructions(false)} 
                className="px-3 py-1 rounded bg-blue-500 text-white"
              >
                Close
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showShareResults && (
          <motion.div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div 
              className={`bg-white p-6 rounded-lg ${darkMode ? 'text-black' : ''}`}
              initial={{ scale: 0.5, y: -100 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.5, y: -100 }}
            >
              <h2 className="text-2xl font-bold mb-4">Share Your Results</h2>
              <p className="mb-4">Great job! Would you like to share your results?</p>
              <motion.button 
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  shareResults();
                  setShowShareResults(false);
                }} 
                className="mr-2 px-3 py-1 rounded bg-green-500 text-white"
              >
                Share
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowShareResults(false)} 
                className="px-3 py-1 rounded bg-gray-300"
              >
                Close
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div 
        className="mt-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.3 }}
      >
        <h3 className="text-xl font-bold mb-2">Statistics</h3>
        <p>Games Played: {stats.gamesPlayed}</p>
        <p>Win Percentage: {stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0}%</p>
        <p>Current Streak: {stats.currentStreak}</p>
        <p>Max Streak: {stats.maxStreak}</p>
      </motion.div>
      {showConfetti && <Confetti />}
      <AnimatePresence>
        {wordChangeAnimation && (
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="text-4xl font-bold text-white"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              transition={{ duration: 0.5 }}
            >
              New Word!
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SuperWordle;