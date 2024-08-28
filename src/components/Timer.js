import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';

const Timer = ({ gameState }) => {
  const [time, setTime] = useState(0);

  useEffect(() => {
    let interval;
    if (gameState === 'playing') {
      interval = setInterval(() => {
        setTime((prevTime) => prevTime + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [gameState]);

  return (
    <div className="text-xl font-bold mb-4">
      Time: {format(new Date(time * 1000), 'mm:ss')}
    </div>
  );
};

export default Timer;