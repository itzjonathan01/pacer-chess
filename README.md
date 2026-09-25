# Pacer Chess 0.2

A single-player chess learning game built as a static website. It is designed to be easy to host on GitHub Pages.

## Features

- Full legal chess rules powered by chess.js
- Click-to-move and drag-and-drop pieces
- Legal move dots and capture rings
- Last-move highlighting and check highlighting
- Adjustable clocks, including unlimited games
- Move history
- Captured piece display
- Quick evaluation bar
- Takebacks, board flip, resign, restart
- Learning feedback, hints, mistake/blunder tracking
- Custom bot creator with name, avatar, strength, aggression, tactics, randomness, mistake rate, and style
- Built-in bot presets
- Custom bots saved in the browser with localStorage
- Responsive layout for desktop and mobile
- GitHub Pages friendly: no backend required

## Run it

The easiest option is to use a tiny local web server:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

You can also use VS Code's Live Server extension.

## Put it on GitHub Pages

1. Open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Choose `main` and `/ (root)`.
4. Save.

GitHub will give you the site URL once Pages is deployed.

## Project structure

```text
pacer-chess/
├── index.html
├── styles.css
├── app.js
├── README.md
└── .gitignore
```

## Notes about the bot engine

0.2 uses a lightweight browser-side evaluation/search system so the project stays small and works as a static site. Bot ratings are difficulty targets, not officially calibrated Elo ratings.

A future version can replace the lightweight bot engine with Stockfish/WASM for stronger analysis while keeping the same UI and Bot Lab.

## Dependency

The app imports `chess.js` 1.4.0 from jsDelivr in `app.js`, so the browser needs internet access when loading the game. If you want the project completely offline later, vendor the chess.js ESM bundle into the repository and change the import path.
