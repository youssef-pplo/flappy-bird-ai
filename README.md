# Flappy Bird Ultimate AI

A browser-based Flappy Bird game with neural network AI training capabilities. Train a neural network to play Flappy Bird or test your own skills!

## Features

- 🎮 **Classic Flappy Bird Gameplay** - Play the classic game yourself
- 🤖 **AI Training Mode** - Watch a neural network learn to play
- 🎨 **Beautiful Graphics** - High-quality graphics with particles and parallax effects
- ⚡ **Performance Mode** - Low graphics mode for better battery/performance
- 📊 **Real-time Training Dashboard** - Monitor AI training progress
- 🎯 **Customizable AI** - Adjust population size, mutation rate, and elitism

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, Edge)
- Node.js (optional, for local development server)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/youssef-pplo/flappy-bird-ai.git
cd flappy-bird-ai
```

2. Install dependencies (optional):
```bash
npm install
```

3. Run the development server:
```bash
npm start
```

Or simply open `index.html` in your browser.

## Usage

### Playing the Game

1. Click **"Play Game"** to play manually
2. Use **Space**, **Click**, or **Tap** to make the bird flap
3. Avoid pipes and try to get the highest score!

### Training the AI

1. Click **"Train AI"** to start AI training mode
2. Watch as the neural network learns through generations
3. Adjust training speed with the slider
4. Configure AI settings (population, mutation rate, elitism) via the "AI Config" button
5. Drag the dashboard to move it around

### Settings

- **Graphics Quality**: Switch between High (fancy effects) and Low (better performance)
- **AI Configuration**: Customize population size, mutation rate, and elitism percentage

## Technical Details

### Neural Network Architecture

- **Input Nodes**: 5 (bird Y position, velocity, pipe distance, pipe top Y, gap size)
- **Hidden Nodes**: 8
- **Output Nodes**: 1 (jump decision)

### AI Training

The AI uses a genetic algorithm:
- **Population**: Configurable (default: 150)
- **Mutation Rate**: Configurable (default: 0.1)
- **Elitism**: Top performers survive to next generation
- **Fitness**: Based on score squared

## File Structure

```
flappy-bird-ai/
├── index.html      # Main HTML file
├── styles.css      # All CSS styles
├── script.js       # Game logic and AI
├── package.json    # Project configuration
├── .gitignore      # Git ignore rules
└── README.md       # This file
```

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance Tips

- Use **Low Graphics** mode on mobile devices or older hardware
- Reduce **Population Size** if experiencing lag during AI training
- Lower **Training Speed** for smoother animation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this project for learning or personal projects.

## Credits

Created by [youssef pplo](https://pplo.dev)

## Acknowledgments

- Inspired by the original Flappy Bird game
- Neural network implementation based on genetic algorithms
- Built with vanilla JavaScript (no frameworks required)

