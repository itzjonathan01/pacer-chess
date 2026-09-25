# Pacer Chess 0.4

Pacer Chess is a dark-first single-player chess trainer with customizable bots, an adaptive rival, Pacer Elo, and real Stockfish-powered analysis.

## 0.4 highlights

- **Stockfish 19 Lite** runs in-browser through a Web Worker
- Stockfish is vendored inside the repository so GitHub Pages serves the JS/WASM from the same origin
- Automatic **Stockfish 19 ASM fallback** for browsers where WebAssembly fails
- Live engine status indicator
- Real evaluation bar powered by Stockfish when the engine is available
- Engine depth display
- Top 3 Stockfish candidate lines translated into normal chess notation
- Stockfish-powered hints
- Stockfish-powered bot move selection with Pacer personality/difficulty shaping layered on top
- Lower-rated bots deliberately make human-like mistakes instead of simply becoming full-strength Stockfish
- **Threat Vision** highlights your pieces that are currently attacked
- **Focus Mode** hides side UI when you just want the board
- Four board themes: Forest Dark, Slate, Midnight Blue, and Classic
- Optional move sounds
- Opening recognition for common openings
- Built-in bots and VEX/Nemesis are rated for Pacer Elo
- Custom bots are **unrated** so you cannot create a weak “2000 Elo” bot and farm rating
- Dark mode remains the default

## Adaptive features

### Pacer Elo

Pacer Elo starts at 400 and changes after rated bot games using an Elo-style expected-score formula.

### VEX // Nemesis

VEX adapts around your profile and gets stronger as you improve. It targets your weakest area from the Chess Brain model.

### Chess Brain

Pacer tracks four training dimensions:

- Board vision
- Tactics
- King safety
- Discipline

### Thought Engine

Pacer tries to infer the idea behind each move, such as:

- development
- king safety
- center control
- trading material
- gaining space
- direct attack

## Core game features

- Full legal chess rules through chess.js
- Click-to-move and drag-and-drop
- Play as White, Black, or Random
- Your pieces remain at the bottom by default
- Clear YOU / BOT labels
- Legal move dots and capture rings
- Check and last-move highlighting
- Move history
- Captured pieces
- Takebacks
- Hints
- Board flip
- Resign and rematch
- 5, 10, 15 minute, or unlimited clocks
- Custom bot creator
- Browser-local saves for bots, theme, Pacer Elo, Chess Brain, and Nemesis progress
- Responsive desktop/mobile layout
- No backend or account required

## Live site

https://itzjonathan01.github.io/pacer-chess/

## Run locally

Because the project uses ES modules and Web Workers, run it through a local HTTP server rather than opening `index.html` directly.

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Project structure

```text
pacer-chess/
├── index.html
├── styles.css
├── app.js
├── stockfish-client.js
├── vendor/
│   └── stockfish/
│       ├── stockfish-19-lite-single.js
│       ├── stockfish-19-lite-single.wasm
│       ├── stockfish-19-asm.js
│       └── COPYING.txt
├── README.md
├── .gitignore
└── .nojekyll
```

## Engine architecture

Pacer asks Stockfish for candidate moves and evaluations. Bot personality settings then influence which candidate a bot actually chooses. Very low-rated bots can deliberately choose weaker legal moves to keep them realistically beatable.

If Stockfish cannot initialize, Pacer automatically falls back to its lightweight built-in move evaluator so the game remains playable.

## Dependencies and credits

- [chess.js](https://github.com/jhlywa/chess.js) handles legal chess rules.
- [Stockfish.js](https://github.com/nmrugg/stockfish.js) provides the in-browser Stockfish engine.
- Stockfish.js 19 is GPL-3.0. Its license copy is retained at `vendor/stockfish/COPYING.txt`.

Bot ratings are Pacer difficulty targets and are not official Chess.com, USCF, or FIDE ratings.
