import { format } from 'date-fns';

// This is a simplified word list. In a real application, you'd have a much larger list.
const wordList5 = ['REACT', 'QUERY', 'STATE', 'PROPS', 'HOOKS'];
const wordList6 = ['WORDLE', 'CODING', 'GITHUB', 'TAILWIND', 'FRAMER'];

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

export const checkGuess = (guess, targetWord) => {
  const result = Array(guess.length).fill('absent');
  const targetLetters = targetWord.split('');

  // Check for correct letters
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