import React from 'react';
import { motion } from 'framer-motion';

const GameBoard = ({ wordLength, guesses, currentGuess }) => {
  const emptyRows = Array(6 - guesses.length - 1).fill('');

  return (
    <div className="mb-4">
      {guesses.map((guess, i) => (
        <div key={i} className="flex mb-2">
          {guess.split('').map((letter, j) => (
            <motion.div
              key={j}
              className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold mr-2"
              initial={{ rotateX: 0 }}
              animate={{ rotateX: 360 }}
              transition={{ duration: 0.5, delay: j * 0.1 }}
            >
              {letter}
            </motion.div>
          ))}
        </div>
      ))}
      {guesses.length < 6 && (
        <div className="flex mb-2">
          {currentGuess.split('').map((letter, i) => (
            <div key={i} className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold mr-2">
              {letter}
            </div>
          ))}
          {Array(wordLength - currentGuess.length).fill('').map((_, i) => (
            <div key={i} className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold mr-2"></div>
          ))}
        </div>
      )}
      {emptyRows.map((_, i) => (
        <div key={i} className="flex mb-2">
          {Array(wordLength).fill('').map((_, j) => (
            <div key={j} className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold mr-2"></div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default GameBoard;