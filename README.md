# Pacer Chess 0.5

Pacer Chess is a dark-first single-player chess trainer with calibrated 0–3600 Elo opponents, Stockfish 19 analysis, Pacer Elo, an adaptive Nemesis, Chess Brain, a player clone, post-game review, and mistake training.

## 0.5 — Learn From Every Game

### Calibrated 0–3600 Elo opponents

The Game tab now includes an instant opponent selector from **0 to 3600 Elo**.

Pacer no longer treats low strength as merely “Stockfish plus a random mistake chance.” Bot strength now controls the **quality band of moves the bot is allowed to choose**.

- 0–100: mostly weak/random legal moves, quiet moves preferred
- 100–300: avoids top engine choices and misses obvious threats
- 300–500: basic ideas with frequent tactical misses
- 500–800: sees simple checks/captures but remains inconsistent
- 800–1200: basic tactics and improving positional play
- 1200–1600: increasingly solid engine candidates with inaccuracies
- 1600–2000: strong play
- 2000–2400: expert-level choices with some variety
- 2400–3000: extremely strong
- 3000–3599: near-full Stockfish
- 3600: strongest Stockfish choice

Individual chess moves do not literally have Elo ratings, so these are **target behavior bands**, not a claim that a move itself has an exact Elo number.

The offline Pacer fallback uses the same banded idea so low-rated bots do not suddenly become much stronger if Stockfish cannot load.

### Test Mode

Test Mode is designed for development and experimentation.

When enabled:

- Pacer Elo cannot change
- profile statistics are protected
- the game is marked **TEST**
- you can freely test bots, controls, and positions

This prevents development/testing games from polluting your real Pacer rating.

### Stockfish post-game review

After a completed game, Pacer can analyze each of your decisions using Stockfish 19 and classify them as:

- Best
- Excellent
- Good
- Inaccuracy
- Mistake
- Blunder

The Review tab also produces a **Pacer Accuracy** score and shows the Stockfish-preferred move when it differed from yours.

Pacer's accuracy is its own training metric and is not the Chess.com accuracy formula.

### Mistake → Training

Reviewed inaccuracies, mistakes, and blunders can become training positions.

Pacer reloads the position from your game and asks you to find the stronger move. Correct solutions advance to the next saved position.

### Neutral coaching

The default coach tone is **Neutral**.

Available tones:

- Neutral
- Detailed
- Competitive
- Minimal

Neutral feedback focuses on what happened and what to improve without pity, embarrassment, or judgment.

### Your Chess Clone

The Brain tab now builds **Your Clone**, a bot derived from:

- current Pacer Elo
- aggression
- checks and captures
- tactics score
- discipline
- blunder/mistake rate
- accumulated game history

The clone is intentionally **unrated** so playing against yourself cannot be used to farm Pacer Elo.

### Profile additions

The Brain tab now shows:

- current Pacer Elo
- peak Pacer Elo
- win/loss/draw record
- Chess Brain scores
- VEX / Nemesis progress
- Your Chess Clone

## Stockfish 19

Pacer runs the vendored **Stockfish 19 Lite single-threaded** browser engine through a Web Worker.

Stockfish currently powers:

- live evaluation
- engine depth
- top candidate lines
- hints
- high-strength bot choices
- post-game review

An ASM Stockfish fallback and Pacer's lightweight built-in evaluator are available if WebAssembly is unavailable.

## Other features

- Dark mode by default
- White / Black / Random side selection
- player's pieces stay at the bottom
- clear YOU / BOT identity
- drag-and-drop and click-to-move
- legal move indicators
- check and last-move highlights
- Threat Vision
- Focus Mode
- move history
- captured pieces
- clocks
- takebacks
- resign / rematch
- opening recognition
- four board themes
- move sounds
- custom Bot Lab
- VEX // Nemesis
- Chess Brain
- Thought Engine
- browser-local saves
- no backend/account required

## Rated games

Built-in bots, VEX, and instant calibrated Elo opponents are eligible for rated play.

Custom Bot Lab bots and Your Clone are **unrated**.

Test Mode overrides everything and prevents rating/profile changes.

Pacer Elo and bot Elo values are internal Pacer ratings/strength targets. They are not official Chess.com, USCF, or FIDE ratings.

## Live site

https://itzjonathan01.github.io/pacer-chess/

## Run locally

Because the project uses ES modules and Web Workers:

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

## Dependencies and credits

- [chess.js](https://github.com/jhlywa/chess.js) handles legal chess rules.
- [Stockfish.js](https://github.com/nmrugg/stockfish.js) provides the in-browser engine.
- Stockfish.js 19 is GPL-3.0. Its license copy is retained at `vendor/stockfish/COPYING.txt`.
