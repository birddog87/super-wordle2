import React, { useState, useEffect } from 'react';

const Timer = ({ gameState, darkMode }) => {
  const [time, setTime] = useState(0);

  useEffect(() => {
    let interval;
    if (gameState === 'playing') {
      interval = setInterval(() => {
        setTime((prevTime) => prevTime + 1);
      }, 1000);
    } else {
      if (gameState === 'won' || gameState === 'lost') {
        // Keep the final time displayed
      } else {
        setTime(0);
      }
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [gameState]);

  useEffect(() => {
    if (gameState === 'playing') {
      setTime(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`text-center mb-4 font-mono text-lg ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
      ⏱️ {formatTime(time)}
    </div>
  );
};

export default Timer;
