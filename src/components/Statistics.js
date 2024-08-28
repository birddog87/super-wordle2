import React from 'react';

const Statistics = () => {
  // In a real application, you would fetch these statistics from local storage or a backend
  const stats = {
    gamesPlayed: 10,
    winPercentage: 70,
    currentStreak: 3,
    maxStreak: 5
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Statistics</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <p className="text-3xl font-bold">{stats.gamesPlayed}</p>
          <p>Games Played</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold">{stats.winPercentage}%</p>
          <p>Win Percentage</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold">{stats.currentStreak}</p>
          <p>Current Streak</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold">{stats.maxStreak}</p>
          <p>Max Streak</p>
        </div>
      </div>
    </div>
  );
};

export default Statistics;