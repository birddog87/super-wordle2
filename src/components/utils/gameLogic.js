import { format } from 'date-fns';
import { wordList5, wordList6, validWords5, validWords6 } from '../../utils/wordLists';

export const generateRandomWord = (length) => {
  const list = length === 5 ? wordList5 : wordList6;
  return list[Math.floor(Math.random() * list.length)];
};

export const generateDailyWord = (length) => {
  const list = length === 5 ? wordList5 : wordList6;
  const today = format(new Date(), 'yyyyMMdd');
  const index = parseInt(today, 10) % list.length;
  return list[index];
};

export const isValidWord = (word, length) => {
  const validSet = length === 5 ? validWords5 : validWords6;
  return validSet.has(word.toUpperCase());
};

export const checkGuess = (guess, targetWord) => {
  const result = Array(guess.length).fill('absent');
  const targetLetters = targetWord.split('');

  // Check for correct letters first
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === targetWord[i]) {
      result[i] = 'correct';
      targetLetters[i] = null;
    }
  }

  // Check for present letters
  for (let i = 0; i < guess.length; i++) {
    if (result[i] === 'absent') {
      const index = targetLetters.indexOf(guess[i]);
      if (index !== -1) {
        result[i] = 'present';
        targetLetters[index] = null;
      }
    }
  }

  return result;
};