import React from 'react';

const Keyboard = ({ onKeyPress, onEnter, feedback, darkMode }) => {
  const keys = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Enter', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Backspace']
  ];

  const getKeyColor = (key) => {
    const status = feedback[key];
    if (status === 'correct') return 'bg-green-500 text-white border-green-500';
    if (status === 'present') return 'bg-yellow-500 text-white border-yellow-500';
    if (status === 'absent') return darkMode ? 'bg-gray-800 text-gray-400 border-gray-800' : 'bg-gray-300 text-gray-600 border-gray-300';
    return darkMode ? 'bg-gray-600 text-white border-gray-600 hover:bg-gray-500' : 'bg-gray-200 text-gray-800 border-gray-200 hover:bg-gray-300';
  };

  const handleClick = (key) => {
    if (key === 'Enter') {
      onEnter();
    } else {
      onKeyPress(key);
    }
  };

  return (
    <div className="mt-6">
      {keys.map((row, i) => (
        <div key={i} className="flex justify-center mb-2 gap-1">
          {row.map((key) => (
            <button
              key={key}
              onClick={() => handleClick(key)}
              className={`
                px-3 py-4 rounded font-bold text-sm border-2 transition-all duration-200 active:scale-95
                ${key === 'Enter' || key === 'Backspace' ? 'px-4' : ''}
                ${getKeyColor(key)}
              `}
              style={{ minWidth: key === 'Enter' || key === 'Backspace' ? '65px' : '40px' }}
            >
              {key === 'Backspace' ? '⌫' : key}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};

export default Keyboard;
