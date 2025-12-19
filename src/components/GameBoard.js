import React from 'react';
import { motion } from 'framer-motion';

const GameBoard = ({ wordLength, guesses, currentGuess, guessResults, darkMode }) => {
  const emptyRows = Math.max(0, 6 - guesses.length - (currentGuess.length > 0 ? 1 : 0));

  const getTileColor = (status, darkMode) => {
    if (status === 'correct') return 'bg-green-500';
    if (status === 'present') return 'bg-yellow-500';
    if (status === 'absent') return darkMode ? 'bg-gray-700' : 'bg-gray-400';
    return '';
  };

  const getTileBorder = (darkMode, hasLetter, isSubmitted) => {
    if (isSubmitted) return 'border-transparent';
    if (hasLetter) return darkMode ? 'border-gray-500' : 'border-gray-400';
    return darkMode ? 'border-gray-700' : 'border-gray-300';
  };

  return (
    <div className="mb-6 flex flex-col items-center gap-1">
      {/* Previous guesses with results */}
      {guesses.map((guess, rowIndex) => (
        <div key={rowIndex} className="flex gap-1">
          {guess.split('').map((letter, colIndex) => {
            const status = guessResults[rowIndex]?.[colIndex];
            return (
              <motion.div
                key={colIndex}
                initial={{ rotateX: 0, scale: 1 }}
                animate={{
                  rotateX: [0, 90, 0],
                  scale: [1, 1.05, 1]
                }}
                transition={{
                  duration: 0.6,
                  delay: colIndex * 0.15,
                  ease: 'easeInOut'
                }}
                className={`
                  w-14 h-14 border-2 flex items-center justify-center text-2xl font-bold
                  ${getTileColor(status, darkMode)}
                  ${getTileBorder(darkMode, true, true)}
                  text-white
                `}
              >
                {letter}
              </motion.div>
            );
          })}
        </div>
      ))}

      {/* Current guess row */}
      {guesses.length < 6 && (
        <div className="flex gap-1">
          {currentGuess.split('').map((letter, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className={`
                w-14 h-14 border-2 flex items-center justify-center text-2xl font-bold
                ${darkMode ? 'border-gray-500 text-white' : 'border-gray-400 text-gray-900'}
              `}
            >
              {letter}
            </motion.div>
          ))}
          {Array(wordLength - currentGuess.length).fill('').map((_, i) => (
            <div
              key={i + currentGuess.length}
              className={`
                w-14 h-14 border-2 flex items-center justify-center text-2xl font-bold
                ${darkMode ? 'border-gray-700' : 'border-gray-300'}
              `}
            />
          ))}
        </div>
      )}

      {/* Empty rows */}
      {Array(emptyRows).fill('').map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-1">
          {Array(wordLength).fill('').map((_, colIndex) => (
            <div
              key={colIndex}
              className={`
                w-14 h-14 border-2 flex items-center justify-center text-2xl font-bold
                ${darkMode ? 'border-gray-700' : 'border-gray-300'}
              `}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

export default GameBoard;
