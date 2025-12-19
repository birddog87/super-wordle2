# SuperWordle 🎮

A beautiful, feature-rich Wordle game built with React! Play with 5 or 6 letter words in daily or random modes.

## ✨ Features

- **Multiple Game Modes**
  - Daily Word: New word every day
  - Random Word: Endless gameplay with random words

- **Word Length Options**
  - 5-letter words
  - 6-letter words

- **Rich Word Lists**
  - 500+ words for 5-letter mode
  - 500+ words for 6-letter mode

- **Beautiful UI/UX**
  - Smooth tile flip animations
  - Color-coded feedback (green/yellow/gray)
  - Keyboard color highlighting
  - Dark mode toggle with persistence
  - Responsive design for all devices

- **Game Features**
  - Word validation against dictionary
  - Timer to track your speed
  - Statistics tracking (games played, win %, streaks)
  - Guess distribution chart
  - Share results feature
  - Local storage for progress persistence

## 🚀 Live Demo

**Public URL:** https://birddog87.github.io/super-wordle2/

> Note: The game will be automatically deployed to GitHub Pages when changes are merged to the main branch.

## 🎮 How to Play

1. Guess the word in 6 tries
2. Each guess must be a valid word
3. Press Enter to submit your guess
4. After each guess, tiles change color:
   - 🟩 **Green**: Letter is correct and in the right spot
   - 🟨 **Yellow**: Letter is in the word but wrong spot
   - ⬜ **Gray**: Letter is not in the word

## 🛠️ Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build

# Deploy to GitHub Pages
npm run deploy
```

### Tech Stack

- **React 18** - UI framework
- **Framer Motion** - Animations
- **date-fns** - Date utilities
- **Tailwind CSS** - Styling
- **React Scripts** - Build tooling

## 📁 Project Structure

```
src/
├── components/
│   ├── SuperWordle.js      # Main game component
│   ├── GameBoard.js        # Game board with tiles
│   ├── Keyboard.js         # On-screen keyboard
│   ├── Timer.js            # Game timer
│   ├── Statistics.js       # Stats display
│   ├── Modal.js            # Modal component
│   └── utils/
│       └── gameLogic.js    # Game logic functions
├── utils/
│   └── wordLists.js        # Comprehensive word lists
├── App.js                  # App wrapper
└── index.js                # Entry point
```

## 🎨 Features in Detail

### Dark Mode
Toggle between light and dark themes. Your preference is saved automatically.

### Statistics
Track your performance with:
- Games played
- Win percentage
- Current streak
- Maximum streak
- Guess distribution chart

### Share Results
Share your results as emoji grids (like the original Wordle):
```
SuperWordle 4/6

⬜🟨⬜🟨⬜
⬜🟩🟩⬜⬜
🟩🟩🟩⬜🟩
🟩🟩🟩🟩🟩
```

## 🚀 Deployment

The project is configured for automatic deployment to GitHub Pages using GitHub Actions.

### Manual Deployment

```bash
npm run deploy
```

### Automatic Deployment

Push to the `main` branch to trigger automatic deployment via GitHub Actions.

## 📝 Recent Updates

- ✅ Added comprehensive word lists (500+ words each)
- ✅ Implemented proper tile color coding with animations
- ✅ Added keyboard color feedback
- ✅ Implemented word validation
- ✅ Added statistics tracking with localStorage
- ✅ Implemented dark mode with persistence
- ✅ Enhanced UI/UX with better styling
- ✅ Added timer functionality
- ✅ Implemented share results feature
- ✅ Updated to Node 18 and latest dependencies

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## 📄 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

Inspired by the original Wordle game by Josh Wardle.

---

**Enjoy playing SuperWordle!** 🎉
