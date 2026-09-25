# Pacer Chess 0.3

Pacer Chess is a dark-first, single-player chess learning game with customizable bots, a personal rating, and an adaptive rival that learns from your games.

## What's new in 0.3

- Clear **YOU** and **BOT** identities around the board
- Your pieces always start visually at the bottom
- Play as **White, Black, or Random**
- Pacer Elo that changes after bot games using an Elo-style formula
- **VEX // Nemesis**, an adaptive rival whose strength rises with your rating
- Nemesis targets the weakest area in your Chess Brain profile
- **Chess Brain** profile with:
  - Board vision
  - Tactics
  - King safety
  - Discipline
- Pacer attempts to infer the idea behind each move, such as development, king safety, attacking, trading, or gaining space
- Dark mode is the default and includes a darker board
- Light and dark pieces are visually distinct
- Bot Lab 2.0 with target Elo, aggression, tactics, positional play, risk, randomness, mistake rate, style, avatar, duplicate, and saved custom bots
- Play as Black correctly makes the bot move first
- Improved responsive UI for desktop and mobile

## Existing game features

- Full legal move handling powered by chess.js
- Click-to-move and drag-and-drop
- Legal move indicators
- Check and last-move highlighting
- Move history
- Captured pieces
- Evaluation bar
- Hints and learning feedback
- Takebacks
- Board flip
- Resign and rematch
- 5, 10, 15 minute, or unlimited clocks
- Browser-local saves for custom bots, theme, Pacer Elo, Chess Brain, and Nemesis progress
- No backend or account required

## Live site

GitHub Pages:

https://itzjonathan01.github.io/pacer-chess/

## Run locally

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
├── README.md
├── .gitignore
└── .nojekyll
```

## Engine note

0.3 still uses Pacer's lightweight browser-side evaluation/search logic for bot decisions and hints. The UI and training systems are designed so a later release can replace that engine layer with Stockfish/WASM without rebuilding the entire app.

Bot Elo values are Pacer difficulty targets, not official Chess.com, USCF, or FIDE ratings.

## Dependency

The app imports `chess.js` 1.4.0 from jsDelivr, so an internet connection is currently required when the page first loads.
