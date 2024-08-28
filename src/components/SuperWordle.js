import React, { useState, useEffect } from 'react';
import GameBoard from './GameBoard';
import Keyboard from './Keyboard';
import Timer from './Timer';
import Modal from './Modal';
import Statistics from './Statistics';
import { generateRandomWord, generateDailyWord, checkGuess } from '../utils/gameLogic';

const SuperWordle = () => {
  const [wordLength, setWordLength] = useState(5);
  const [gameMode, setGameMode] = useState('random');
  const [targetWord, setTargetWord] = useState('');
  const [guesses, setGuesses] = useState([]);
  const [currentGuess, setCurrentGuess] = useState('');
  const [gameState, setGameState] = useState('playing');
  const [showInstructions, setShowInstructions] = useState(false);
  const [showStatistics, setShowStatistics] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    startNewGame();
  }, [wordLength, gameMode]);

  const startNewGame = () => {
    const newWord = gameMode === 'random' ? generateRandomWord(wordLength) : generateDailyWord(wordLength);
    setTargetWord(newWord);
    setGuesses([]);
    setCurrentGuess('');
    setGameState('playing');
  };

  const handleKeyPress = (key) => {
    if (gameState !== 'playing') return;

    if (key === 'Enter') {
      if (currentGuess.length === wordLength) {
        submitGuess();
      }
    } else if (key === 'Backspace') {
      setCurrentGuess(currentGuess.slice(0, -1));
    } else if (currentGuess.length < wordLength) {
      setCurrentGuess(currentGuess + key);
    }
  };

  const submitGuess = () => {
    const newGuesses = [...guesses, currentGuess];
    setGuesses(newGuesses);
    setCurrentGuess('');

    if (currentGuess === targetWord) {
      setGameState('won');
    } else if (newGuesses.length === 6) {
      setGameState('lost');
    }
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-gray-800 text-white' : 'bg-white text-black'}`}>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-4">SuperWordle</h1>
        <div className="mb-4">
          <button onClick={() => setWordLength(5)} className="mr-2 px-4 py-2 bg-blue-500 text-white rounded">5 Letters</button>
          <button onClick={() => setWordLength(6)} className="mr-2 px-4 py-2 bg-blue-500 text-white rounded">6 Letters</button>
          <button onClick={() => setGameMode('random')} className="mr-2 px-4 py-2 bg-green-500 text-white rounded">Random</button>
          <button onClick={() => setGameMode('daily')} className="mr-2 px-4 py-2 bg-green-500 text-white rounded">Daily</button>
          <button onClick={() => setDarkMode(!darkMode)} className="px-4 py-2 bg-gray-500 text-white rounded">Toggle Dark Mode</button>
        </div>
        <Timer gameState={gameState} />
        <GameBoard wordLength={wordLength} guesses={guesses} currentGuess={currentGuess} />
        <Keyboard onKeyPress={handleKeyPress} />
        <button onClick={() => setShowInstructions(true)} className="mt-4 px-4 py-2 bg-gray-500 text-white rounded">How to Play</button>
        <button onClick={() => setShowStatistics(true)} className="mt-4 ml-2 px-4 py-2 bg-gray-500 text-white rounded">Statistics</button>
        <Modal show={showInstructions} onClose={() => setShowInstructions(false)}>
          <h2 className="text-2xl font-bold mb-2">How to Play</h2>
          {/* Add instructions here */}
        </Modal>
        <Modal show={gameState !== 'playing'} onClose={startNewGame}>
          <h2 className="text-2xl font-bold mb-2">{gameState === 'won' ? 'Congratulations!' : 'Game Over'}</h2>
          <p>The word was: {targetWord}</p>
          {/* Add share results option here */}
        </Modal>
        <Modal show={showStatistics} onClose={() => setShowStatistics(false)}>
          <Statistics />
        </Modal>
      </div>
    </div>
  );
};

export default SuperWordle;