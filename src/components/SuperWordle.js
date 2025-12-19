import React, { useState, useEffect, useCallback } from 'react';
import GameBoard from './GameBoard';
import Keyboard from './Keyboard';
import Timer from './Timer';
import Modal from './Modal';
import Statistics from './Statistics';
import { generateRandomWord, generateDailyWord, checkGuess, isValidWord } from './utils/gameLogic';

const SuperWordle = () => {
  const [wordLength, setWordLength] = useState(5);
  const [gameMode, setGameMode] = useState('random');
  const [targetWord, setTargetWord] = useState('');
  const [guesses, setGuesses] = useState([]);
  const [currentGuess, setCurrentGuess] = useState('');
  const [gameState, setGameState] = useState('playing');
  const [showInstructions, setShowInstructions] = useState(false);
  const [showStatistics, setShowStatistics] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });
  const [error, setError] = useState('');
  const [guessResults, setGuessResults] = useState([]);
  const [keyboardFeedback, setKeyboardFeedback] = useState({});

  useEffect(() => {
    startNewGame();
  }, [wordLength, gameMode]);

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameState !== 'playing') return;

      if (e.key === 'Enter') {
        handleSubmitGuess();
      } else if (e.key === 'Backspace') {
        handleKeyPress('Backspace');
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        handleKeyPress(e.key.toUpperCase());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, currentGuess, targetWord, guesses]);

  const startNewGame = useCallback(() => {
    const newWord = gameMode === 'random' ? generateRandomWord(wordLength) : generateDailyWord(wordLength);
    setTargetWord(newWord);
    setGuesses([]);
    setGuessResults([]);
    setCurrentGuess('');
    setGameState('playing');
    setError('');
    setKeyboardFeedback({});
  }, [wordLength, gameMode]);

  const handleKeyPress = (key) => {
    if (gameState !== 'playing') return;

    if (key === 'Backspace') {
      setCurrentGuess(currentGuess.slice(0, -1));
      setError('');
    } else if (currentGuess.length < wordLength && /^[A-Z]$/.test(key)) {
      setCurrentGuess(currentGuess + key);
      setError('');
    }
  };

  const updateKeyboardFeedback = (guess, result) => {
    const newFeedback = { ...keyboardFeedback };

    for (let i = 0; i < guess.length; i++) {
      const letter = guess[i];
      const status = result[i];

      // Priority: correct > present > absent
      if (status === 'correct') {
        newFeedback[letter] = 'correct';
      } else if (status === 'present' && newFeedback[letter] !== 'correct') {
        newFeedback[letter] = 'present';
      } else if (!newFeedback[letter]) {
        newFeedback[letter] = 'absent';
      }
    }

    setKeyboardFeedback(newFeedback);
  };

  const handleSubmitGuess = () => {
    if (currentGuess.length !== wordLength) {
      setError('Not enough letters');
      return;
    }

    if (!isValidWord(currentGuess, wordLength)) {
      setError('Not in word list');
      return;
    }

    const upperGuess = currentGuess.toUpperCase();
    const result = checkGuess(upperGuess, targetWord);

    const newGuesses = [...guesses, upperGuess];
    const newGuessResults = [...guessResults, result];

    setGuesses(newGuesses);
    setGuessResults(newGuessResults);
    setCurrentGuess('');
    setError('');

    updateKeyboardFeedback(upperGuess, result);

    if (upperGuess === targetWord) {
      setGameState('won');
      updateStats(true, newGuesses.length);
    } else if (newGuesses.length === 6) {
      setGameState('lost');
      updateStats(false, 7);
    }
  };

  const updateStats = (won, attempts) => {
    const stats = JSON.parse(localStorage.getItem('wordleStats')) || {
      played: 0,
      won: 0,
      currentStreak: 0,
      maxStreak: 0,
      distribution: [0, 0, 0, 0, 0, 0]
    };

    stats.played++;
    if (won) {
      stats.won++;
      stats.currentStreak++;
      stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
      stats.distribution[attempts - 1]++;
    } else {
      stats.currentStreak = 0;
    }

    localStorage.setItem('wordleStats', JSON.stringify(stats));
  };

  const handleModeChange = (mode) => {
    if (gameState === 'playing' && guesses.length > 0) {
      if (window.confirm('Starting a new mode will reset your current game. Continue?')) {
        setGameMode(mode);
      }
    } else {
      setGameMode(mode);
    }
  };

  const handleLengthChange = (length) => {
    if (gameState === 'playing' && guesses.length > 0) {
      if (window.confirm('Changing word length will reset your current game. Continue?')) {
        setWordLength(length);
      }
    } else {
      setWordLength(length);
    }
  };

  const shareResults = () => {
    const emojiGrid = guessResults.map(result =>
      result.map(status => {
        if (status === 'correct') return '🟩';
        if (status === 'present') return '🟨';
        return '⬜';
      }).join('')
    ).join('\n');

    const shareText = `SuperWordle ${guesses.length}/6\n\n${emojiGrid}`;

    if (navigator.share) {
      navigator.share({ text: shareText });
    } else {
      navigator.clipboard.writeText(shareText);
      alert('Results copied to clipboard!');
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-200 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="container mx-auto px-4 py-4 max-w-lg">
        <header className="text-center mb-6 border-b pb-4" style={{ borderColor: darkMode ? '#374151' : '#e5e7eb' }}>
          <h1 className="text-4xl font-bold mb-2">SuperWordle</h1>
          <p className="text-sm opacity-75">Guess the word in 6 tries!</p>
        </header>

        <div className="flex gap-2 mb-4 flex-wrap justify-center">
          <button
            onClick={() => handleLengthChange(5)}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              wordLength === 5
                ? 'bg-blue-500 text-white'
                : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
            }`}
          >
            5 Letters
          </button>
          <button
            onClick={() => handleLengthChange(6)}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              wordLength === 6
                ? 'bg-blue-500 text-white'
                : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
            }`}
          >
            6 Letters
          </button>
          <button
            onClick={() => handleModeChange('random')}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              gameMode === 'random'
                ? 'bg-green-500 text-white'
                : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Random
          </button>
          <button
            onClick={() => handleModeChange('daily')}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              gameMode === 'daily'
                ? 'bg-green-500 text-white'
                : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Daily
          </button>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
            }`}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>

        {error && (
          <div className="text-center mb-4 text-red-500 font-medium animate-bounce">
            {error}
          </div>
        )}

        <Timer gameState={gameState} darkMode={darkMode} />

        <GameBoard
          wordLength={wordLength}
          guesses={guesses}
          currentGuess={currentGuess}
          guessResults={guessResults}
          darkMode={darkMode}
        />

        <Keyboard
          onKeyPress={handleKeyPress}
          onEnter={handleSubmitGuess}
          feedback={keyboardFeedback}
          darkMode={darkMode}
        />

        <div className="flex gap-2 mt-4 justify-center">
          <button
            onClick={() => setShowInstructions(true)}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            How to Play
          </button>
          <button
            onClick={() => setShowStatistics(true)}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Statistics
          </button>
        </div>

        <Modal show={showInstructions} onClose={() => setShowInstructions(false)} darkMode={darkMode}>
          <h2 className="text-2xl font-bold mb-4">How to Play</h2>
          <div className="space-y-3 text-sm">
            <p>Guess the word in 6 tries.</p>
            <p>Each guess must be a valid word. Hit the enter button to submit.</p>
            <p>After each guess, the color of the tiles will change to show how close your guess was to the word.</p>
            <div className="space-y-2 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-green-500 flex items-center justify-center text-white font-bold">W</div>
                <span>The letter W is in the word and in the correct spot.</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-yellow-500 flex items-center justify-center text-white font-bold">I</div>
                <span>The letter I is in the word but in the wrong spot.</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-10 h-10 flex items-center justify-center text-white font-bold ${darkMode ? 'bg-gray-700' : 'bg-gray-400'}`}>U</div>
                <span>The letter U is not in the word in any spot.</span>
              </div>
            </div>
          </div>
        </Modal>

        <Modal show={gameState !== 'playing'} onClose={startNewGame} darkMode={darkMode}>
          <h2 className="text-2xl font-bold mb-2">
            {gameState === 'won' ? '🎉 Congratulations!' : '😢 Game Over'}
          </h2>
          <p className="text-lg mb-4">
            {gameState === 'won'
              ? `You guessed it in ${guesses.length} ${guesses.length === 1 ? 'try' : 'tries'}!`
              : `The word was: ${targetWord}`}
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={shareResults}
              className="px-4 py-2 bg-blue-500 text-white rounded font-medium hover:bg-blue-600 transition-colors"
            >
              Share Results
            </button>
            <button
              onClick={startNewGame}
              className="px-4 py-2 bg-green-500 text-white rounded font-medium hover:bg-green-600 transition-colors"
            >
              Play Again
            </button>
          </div>
        </Modal>

        <Modal show={showStatistics} onClose={() => setShowStatistics(false)} darkMode={darkMode}>
          <Statistics darkMode={darkMode} />
        </Modal>
      </div>
    </div>
  );
};

export default SuperWordle;
