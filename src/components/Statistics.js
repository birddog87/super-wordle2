import React, { useState, useEffect } from 'react';

const Statistics = ({ darkMode }) => {
  const [stats, setStats] = useState({
    played: 0,
    won: 0,
    currentStreak: 0,
    maxStreak: 0,
    distribution: [0, 0, 0, 0, 0, 0]
  });

  useEffect(() => {
    const savedStats = localStorage.getItem('wordleStats');
    if (savedStats) {
      setStats(JSON.parse(savedStats));
    }
  }, []);

  const winPercentage = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
  const maxDistribution = Math.max(...stats.distribution, 1);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Statistics</h2>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="text-center">
          <p className="text-3xl font-bold">{stats.played}</p>
          <p className="text-xs opacity-75">Played</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold">{winPercentage}</p>
          <p className="text-xs opacity-75">Win %</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold">{stats.currentStreak}</p>
          <p className="text-xs opacity-75">Current Streak</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold">{stats.maxStreak}</p>
          <p className="text-xs opacity-75">Max Streak</p>
        </div>
      </div>

      <h3 className="font-bold mb-2">Guess Distribution</h3>
      <div className="space-y-1">
        {stats.distribution.map((count, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-4 text-sm">{index + 1}</span>
            <div className="flex-1 bg-gray-200 dark:bg-gray-700 h-6 rounded overflow-hidden">
              <div
                className="bg-green-500 h-full flex items-center justify-end pr-2 text-white text-xs font-bold transition-all duration-300"
                style={{
                  width: `${count > 0 ? Math.max((count / maxDistribution) * 100, 10) : 0}%`
                }}
              >
                {count > 0 && count}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Statistics;
