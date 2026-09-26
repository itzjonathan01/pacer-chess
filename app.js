import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
import { StockfishClient } from './stockfish-client.js';

const $ = (s) => document.querySelector(s);
const boardEl = $('#board');

const pieceGlyph = {
  wp:'♟', wn:'♞', wb:'♝', wr:'♜', wq:'♛', wk:'♚',
  bp:'♟', bn:'♞', bb:'♝', br:'♜', bq:'♛', bk:'♚'
};
const pieceValue = { p:100, n:320, b:330, r:500, q:900, k:0 };
const pieceOrder = ['q','r','b','n','p'];
const avatars = ['🤖','🧠','🦊','🐉','👑','🥷','🦉','⚡','🧊','🔥','🧿','🐺'];

const BOT_STORAGE_KEY = 'pacerChessBotsV03';
const OLD_BOT_STORAGE_KEY = 'pacerChessBotsV02';
const PROFILE_KEY = 'pacerChessProfileV03';
const THEME_KEY = 'pacerChessThemeV02';
const BOARD_THEME_KEY = 'pacerChessBoardThemeV04';
const SOUND_KEY = 'pacerChessSoundV04';
const TEST_MODE_KEY = 'pacerChessTestModeV05';
const COACH_TONE_KEY = 'pacerChessCoachToneV05';

const defaultBots = [
  { id:'beginner', name:'Pacer Beginner', avatar:'🤖', strength:500, aggression:42, tactics:42, position:42, risk:38, randomness:38, mistakeRate:25, style:'balanced', locked:true },
  { id:'gambler', name:'The Gambler', avatar:'🔥', strength:750, aggression:94, tactics:72, position:32, risk:92, randomness:42, mistakeRate:18, style:'attacker', locked:true },
  { id:'wall', name:'The Wall', avatar:'🧊', strength:900, aggression:18, tactics:62, position:86, risk:20, randomness:14, mistakeRate:12, style:'defender', locked:true },
  { id:'tactician', name:'Fork.exe', avatar:'🧠', strength:1100, aggression:74, tactics:94, position:58, risk:68, randomness:12, mistakeRate:8, style:'attacker', locked:true },
  { id:'chaos', name:'Chaos Bot', avatar:'⚡', strength:650, aggression:80, tactics:50, position:20, risk:88, randomness:92, mistakeRate:29, style:'chaos', locked:true },
  { id:'nemesis', name:'VEX // Nemesis', avatar:'🧿', strength:475, aggression:68, tactics:72, position:70, risk:58, randomness:16, mistakeRate:18, style:'balanced', locked:true, nemesis:true }
];

function freshProfile(){
  return {
    rating:400, peakRating:400, ratingHistory:[400], games:0, wins:0, losses:0, draws:0,
    moves:0, mistakes:0, blunders:0, checks:0, captures:0, castles:0, developments:0,
    intents:{},
    nemesis:{ games:0, wins:0, losses:0, draws:0, focus:'Board vision' }
  };
}

let game = new Chess();
let selected = null;
let legalMoves = [];
let lastMove = null;
let viewFlipped = false;
let thinking = false;
let gameEnded = false;
let timers = { w:600, b:600 };
let timerHandle = null;
let clockEnabled = true;
let currentBot = null;
let bots = [];
let selectedAvatar = '🤖';
let profile = freshProfile();
let userColor = 'w';
let botColor = 'b';
let coach = { mistakes:0, blunders:0, bestStreak:0, currentStreak:0 };
let gameStats = {};
let moveReviews = [];
let toastTimer = null;
let ratingApplied = false;
let threatVision = false;
let soundEnabled = true;
let engineReady = false;
let engineEvalCp = null;
let engineDepth = null;
let engineLines = [];
let engineSerial = 0;
let testMode = false;
let coachTone = 'neutral';
let lastCompletedGame = null;
let reviewResults = [];
let reviewRunning = false;
let trainingMode = false;
let trainingQueue = [];
let trainingIndex = 0;
let trainingTargetUci = null;
let trainingCurrent = null;
const stockfish = new StockfishClient();

function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
function opposite(c){ return c === 'w' ? 'b' : 'w'; }
function colorName(c){ return c === 'w' ? 'White' : 'Black'; }

function loadProfile(){
  try{
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    profile = Object.assign(freshProfile(), saved || {});
    profile.intents = Object.assign({}, freshProfile().intents, saved && saved.intents ? saved.intents : {});
    profile.nemesis = Object.assign({}, freshProfile().nemesis, saved && saved.nemesis ? saved.nemesis : {});
    profile.peakRating = Math.max(profile.rating || 400, profile.peakRating || 400);
    if(!Array.isArray(profile.ratingHistory) || !profile.ratingHistory.length) profile.ratingHistory=[profile.rating||400];
  }catch{
    profile = freshProfile();
  }
}
function saveProfile(){ localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }

function normalizeBot(bot){
  return Object.assign({position:50,risk:50,aggression:50,tactics:50,randomness:30,mistakeRate:18,style:'balanced'},bot);
}
function loadBots(){
  try{
    let saved = JSON.parse(localStorage.getItem(BOT_STORAGE_KEY) || 'null');
    if(!saved) saved = JSON.parse(localStorage.getItem(OLD_BOT_STORAGE_KEY) || '[]');
    saved = Array.isArray(saved) ? saved.map(normalizeBot) : [];
    bots = defaultBots.map(normalizeBot).concat(saved.filter(b => !defaultBots.some(d => d.id === b.id)));
  }catch{
    bots = defaultBots.map(normalizeBot);
  }
  currentBot = bots[0];
}
function saveCustomBots(){
  localStorage.setItem(BOT_STORAGE_KEY, JSON.stringify(bots.filter(b => !b.locked)));
}
function uid(){ return 'bot-' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function showToast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2300);
}

function currentOrientationFlipped(){
  const naturalFlip = userColor === 'b';
  return viewFlipped ? !naturalFlip : naturalFlip;
}
function boardSquares(){
  const flipped = currentOrientationFlipped();
  const ranks = flipped ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];
  const files = flipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'];
  const out = [];
  for(const r of ranks) for(const f of files) out.push(f + r);
  return out;
}
function squareColor(sq){
  const file = 'abcdefgh'.indexOf(sq[0]);
  const rank = Number(sq[1]) - 1;
  return ((file + rank) % 2 === 0) ? 'dark' : 'light';
}
function isUserTurn(){ return !gameEnded && !thinking && game.turn() === userColor; }
function isRatedGame(){ return !!currentBot && currentBot.locked !== false && !testMode && !trainingMode; }

function eloBehaviorText(elo){
  elo=clamp(Math.round(Number(elo)||0),0,3600);
  if(elo<=100) return elo+' Elo · mostly random legal moves and very little tactical awareness';
  if(elo<=300) return elo+' Elo · misses obvious threats and avoids strong engine choices';
  if(elo<=500) return elo+' Elo · basic ideas, frequent tactical misses';
  if(elo<=800) return elo+' Elo · sees simple captures and checks, still inconsistent';
  if(elo<=1200) return elo+' Elo · basic tactics and improving positional play';
  if(elo<=1600) return elo+' Elo · solid play with regular inaccuracies';
  if(elo<=2000) return elo+' Elo · strong and tactically reliable';
  if(elo<=2400) return elo+' Elo · expert-level engine choices with some variety';
  if(elo<=3000) return elo+' Elo · extremely strong engine play';
  if(elo<3600) return elo+' Elo · near full Stockfish strength';
  return '3600 Elo · Stockfish unleashed';
}
function makeEloBot(elo){
  elo=clamp(Math.round(Number(elo)||0),0,3600);
  const q=elo/3600;
  return {
    id:'elo-'+elo,
    name:'Pacer '+elo,
    avatar:elo>=3000?'♛':elo>=1800?'🧠':elo>=800?'♞':'🤖',
    strength:elo,
    aggression:Math.round(35+q*45),
    tactics:Math.round(18+q*82),
    position:Math.round(18+q*82),
    risk:Math.round(55-q*20),
    randomness:Math.round(92-q*84),
    mistakeRate:Math.round(42-q*40),
    style:'balanced',
    locked:true,
    calibrated:true
  };
}
function makeCloneBot(){
  const s=brainScores();
  const moves=Math.max(1,profile.moves);
  const attack=clamp(Math.round(35+(profile.checks/moves)*500+(profile.captures/moves)*80),20,92);
  const risk=clamp(Math.round(35+(profile.blunders/moves)*350),20,90);
  const style=attack>68?'attacker':s.discipline>72?'defender':'balanced';
  return {
    id:'player-clone',name:'Your Clone',avatar:'🪞',strength:clamp(profile.rating,0,3600),
    aggression:attack,tactics:s.tactics,position:s.discipline,risk:risk,
    randomness:clamp(42-Math.round(profile.games*.7),10,42),
    mistakeRate:clamp(Math.round((profile.mistakes+profile.blunders*2)/moves*100),4,38),
    style:style,locked:false,clone:true
  };
}

function playMoveSound(capture=false){
  if(!soundEnabled) return;
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx) return;
    const ctx=new AudioCtx();
    const osc=ctx.createOscillator();
    const gain=ctx.createGain();
    osc.type='sine';
    osc.frequency.value=capture?230:330;
    gain.gain.setValueAtTime(.035,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.055);
    osc.connect(gain);gain.connect(ctx.destination);
    osc.start();osc.stop(ctx.currentTime+.06);
    osc.addEventListener('ended',()=>ctx.close(),{once:true});
  }catch{}
}

function uciToMove(chess,uci){
  if(!uci || uci.length<4) return null;
  const from=uci.slice(0,2),to=uci.slice(2,4),promotion=uci[4]||undefined;
  return chess.moves({verbose:true}).find(m=>m.from===from&&m.to===to&&(!promotion||m.promotion===promotion))||null;
}
function pvToSan(fen,pv,limit=6){
  const c=new Chess(fen);
  const out=[];
  for(const uci of (pv||[]).slice(0,limit)){
    const m=uciToMove(c,uci);
    if(!m) break;
    out.push(m.san);
    c.move({from:m.from,to:m.to,promotion:m.promotion||'q'});
  }
  return out.join(' ');
}
function infoToWhiteCp(info,fen){
  if(!info) return null;
  let cp=info.cp;
  if(info.mate!==null && info.mate!==undefined) cp=(info.mate>0?1:-1)*(100000-Math.min(999,Math.abs(info.mate))*100);
  if(cp===null || cp===undefined) return null;
  const turn=new Chess(fen).turn();
  return turn==='w'?cp:-cp;
}
function openingName(){
  const h=game.history();
  const s=h.join(' ');
  const openings=[
    ['e4 e5 Nf3 Nc6 Bb5','Ruy Lopez'],
    ['e4 e5 Nf3 Nc6 Bc4','Italian Game'],
    ['e4 c5','Sicilian Defense'],
    ['e4 e6','French Defense'],
    ['e4 c6','Caro-Kann Defense'],
    ['e4 d5','Scandinavian Defense'],
    ['d4 d5 c4','Queen\'s Gambit'],
    ['d4 Nf6 c4 g6','King\'s Indian Defense'],
    ['d4 Nf6 c4 e6','Nimzo / Indian setup'],
    ['c4','English Opening'],
    ['Nf3','Réti Opening']
  ];
  for(const [prefix,name] of openings) if(s.startsWith(prefix)) return name;
  if(!h.length) return 'Starting position';
  if(h[0]==='e4') return 'King\'s Pawn Opening';
  if(h[0]==='d4') return 'Queen\'s Pawn Opening';
  return 'Unclassified position';
}

function getCheckedKingSquare(){
  if(!game.inCheck()) return null;
  const color = game.turn();
  for(const sq of boardSquares()){
    const p = game.get(sq);
    if(p && p.type === 'k' && p.color === color) return sq;
  }
  return null;
}
function renderBoard(){
  boardEl.innerHTML = '';
  const checkSq = getCheckedKingSquare();
  const flipped = currentOrientationFlipped();

  for(const sq of boardSquares()){
    const p = game.get(sq);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'square ' + squareColor(sq);
    btn.dataset.square = sq;
    btn.setAttribute('role','gridcell');

    if(lastMove && (lastMove.from === sq || lastMove.to === sq)) btn.classList.add('last');
    if(selected === sq) btn.classList.add('selected');
    if(checkSq === sq) btn.classList.add('in-check');
    if(threatVision && p && p.color===userColor && typeof game.isAttacked==='function' && game.isAttacked(sq,botColor)) btn.classList.add('threatened');

    const lm = legalMoves.find(m => m.to === sq);
    if(lm) btn.classList.add(p ? 'capture' : 'legal');

    if(p){
      const span = document.createElement('span');
      span.className = 'piece ' + (p.color === 'w' ? 'white-piece' : 'black-piece');
      span.textContent = pieceGlyph[p.color + p.type];
      span.draggable = p.color === userColor && isUserTurn();
      span.dataset.from = sq;
      span.addEventListener('dragstart', e => {
        if(!span.draggable){ e.preventDefault(); return; }
        e.dataTransfer.setData('text/plain', sq);
        e.dataTransfer.effectAllowed = 'move';
        selectSquare(sq);
      });
      btn.appendChild(span);
      btn.setAttribute('aria-label', colorName(p.color) + ' ' + namePiece(p.type) + ' on ' + sq);
    }else{
      btn.setAttribute('aria-label','Empty ' + sq);
    }

    const displayFile = flipped ? 'hgfedcba'.indexOf(sq[0]) : 'abcdefgh'.indexOf(sq[0]);
    const displayRankIndex = flipped ? Number(sq[1])-1 : 8-Number(sq[1]);
    if(displayFile === 0){
      const c = document.createElement('span');
      c.className = 'coord rank';
      c.textContent = sq[1];
      btn.appendChild(c);
    }
    if(displayRankIndex === 7){
      const c = document.createElement('span');
      c.className = 'coord file';
      c.textContent = sq[0];
      btn.appendChild(c);
    }

    btn.addEventListener('click', () => handleSquareClick(sq));
    btn.addEventListener('dragover', e => {
      if(isUserTurn()) e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    btn.addEventListener('drop', e => {
      e.preventDefault();
      const from = e.dataTransfer.getData('text/plain');
      if(from) tryUserMove(from,sq);
    });
    boardEl.appendChild(btn);
  }
}

function selectSquare(sq){
  if(!isUserTurn()) return;
  const p = game.get(sq);
  if(p && p.color === userColor){
    selected = sq;
    legalMoves = game.moves({square:sq,verbose:true});
  }else{
    selected = null;
    legalMoves = [];
  }
  renderBoard();
}
function handleSquareClick(sq){
  if(!isUserTurn()) return;
  if(selected && legalMoves.some(m => m.to === sq)){
    tryUserMove(selected,sq);
    return;
  }
  selectSquare(sq);
}
function tryUserMove(from,to){
  if(!isUserTurn()) return;
  const before = evaluate(game);
  const beforeFen = game.fen();
  let move = null;
  try{ move = game.move({from:from,to:to,promotion:'q'}); }catch{}
  if(!move){ selectSquare(from); return; }

  selected = null;
  legalMoves = [];
  lastMove = {from:move.from,to:move.to};

  const after = evaluate(game);
  playMoveSound(!!move.captured);

  if(trainingMode){
    selected=null;
    legalMoves=[];
    lastMove={from:move.from,to:move.to};
    handleTrainingAttempt(move,beforeFen);
    return;
  }

  reviewUserMove(before,after,move,beforeFen);
  renderAll();
  if(checkGameEnd()) return;
  queueBotMove();
}

function evaluate(g){
  let score = 0;
  const board = g.board();
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p = board[r][c];
    if(!p) continue;
    let v = pieceValue[p.type];
    const center = (3.5-Math.abs(c-3.5)) + (3.5-Math.abs(r-3.5));
    if(p.type === 'n' || p.type === 'b') v += center * 4;
    if(p.type === 'p'){
      const advance = p.color === 'w' ? (6-r) : (r-1);
      v += advance * 5;
    }
    score += p.color === 'w' ? v : -v;
  }
  if(g.inCheck()) score += g.turn() === 'w' ? -25 : 25;
  return score;
}
function styleBonus(move,bot){
  let b = 0;
  const flags = move.flags || '';
  const toFile = 'abcdefgh'.indexOf(move.to[0]);
  const toRank = Number(move.to[1]) - 1;
  const center = (3.5-Math.abs(toFile-3.5)) + (3.5-Math.abs(toRank-3.5));

  if(move.captured) b += (bot.tactics/100) * pieceValue[move.captured] * (0.18 + bot.risk/500);
  if(move.san.includes('+')) b += 18 + bot.aggression * 0.48 + bot.risk * 0.2;
  if(move.san.includes('#')) b += 100000;
  if(move.promotion) b += 500;
  if(flags.includes('k') || flags.includes('q')) b += bot.style === 'defender' ? 52 : 24;
  b += center * (bot.position/100) * 4;

  if(bot.style === 'trader' && move.captured) b += 80;
  if(bot.style === 'attacker' && (move.san.includes('+') || move.captured)) b += 70;
  if(bot.style === 'defender' && !move.captured) b += 12;
  if(bot.style === 'chaos') b += Math.random() * 130;
  return b;
}
function rankMovesFor(g,bot,color,limit){
  const moves = g.moves({verbose:true});
  const scored = [];
  for(const m of moves){
    g.move(m);
    let score = evaluate(g) * (color === 'w' ? 1 : -1);
    score += styleBonus(m,bot);
    if(g.isCheckmate()) score += 100000;
    g.undo();
    scored.push({m:m,score:score});
  }
  scored.sort((a,b) => b.score-a.score);
  return limit ? scored.slice(0,limit) : scored;
}
function materializeNemesis(bot){
  if(!bot || bot.id !== 'nemesis') return bot;
  const weak = brainScores().weakest;
  const games = profile.nemesis.games || 0;
  const rating = clamp(Math.round(profile.rating + 75 + games*8), 425, 2000);
  const vex = Object.assign({},bot,{
    strength:rating,
    tactics:78,
    position:76,
    aggression:68,
    risk:56,
    randomness:clamp(18-games,7,18),
    mistakeRate:clamp(19-games*0.8,5,19)
  });
  if(weak === 'King safety'){ vex.aggression=92; vex.risk=75; vex.style='attacker'; }
  if(weak === 'Tactics'){ vex.tactics=96; vex.aggression=80; }
  if(weak === 'Board vision'){ vex.tactics=90; vex.randomness=8; }
  if(weak === 'Discipline'){ vex.style='trader'; vex.position=88; vex.risk=28; }
  return vex;
}
function chooseBotMove(){
  const bot = materializeNemesis(currentBot);
  currentBot = bot;
  const ranked = rankMovesFor(game,bot,botColor);
  if(!ranked.length) return null;

  const strength = bot.strength;
  let lookahead = 0;
  if(strength >= 800) lookahead = 1;
  if(strength >= 1350) lookahead = 2;

  if(lookahead){
    const candidates = ranked.slice(0,Math.min(ranked.length,strength>=1350?10:7));
    for(const item of candidates){
      game.move(item.m);
      if(!game.isGameOver()){
        const replies = rankMovesFor(game,bot,userColor,lookahead===2?6:4);
        if(replies.length){
          item.score -= replies[0].score * 0.30;
          if(lookahead===2){
            game.move(replies[0].m);
            const follow = rankMovesFor(game,bot,botColor,4);
            if(follow.length) item.score += follow[0].score * 0.18;
            game.undo();
          }
        }
      }
      game.undo();
    }
    ranked.sort((a,b) => b.score-a.score);
  }

  if(Math.random() < bot.mistakeRate/100 && ranked.length > 2){
    const start = Math.min(2,ranked.length-1);
    const width = Math.max(2,Math.round(2 + bot.randomness/13));
    const pool = ranked.slice(start,Math.min(ranked.length,start+width));
    return (pool[Math.floor(Math.random()*pool.length)] || ranked[0]).m;
  }

  const topK = clamp(Math.round((2050-strength)/270 + bot.randomness/30),1,8);
  const pick = Math.floor(Math.pow(Math.random(),2.2) * Math.min(topK,ranked.length));
  return ranked[pick].m;
}
function pickWeakCalibratedMove(bot,engineCandidates){
  const legal=game.moves({verbose:true});
  if(!legal.length) return null;
  const elo=clamp(bot.strength,0,3600);
  const engineTop=new Set(engineCandidates.slice(0,8).map(c=>c.move.from+c.move.to+(c.move.promotion||'')));

  // Below 1000, intentionally choose from weaker quality bands. This prevents a low-rated
  // bot from repeatedly inheriting Stockfish's strongest tactical sequence.
  if(elo<=1000){
    const ranked=rankMovesFor(game,Object.assign({},bot,{tactics:Math.min(bot.tactics,45)}),botColor);
    const n=ranked.length;
    const quality=elo/1200;
    const center=Math.round((1-quality)*(n-1)*0.78);
    const spread=elo<=300?Math.max(2,Math.ceil(n*.16)):Math.max(2,Math.ceil(n*.12));
    let pool=ranked.slice(clamp(center-spread,0,n-1),clamp(center+spread+1,1,n));

    if(elo<=100){
      const nonTop=pool.filter(x=>!engineTop.has(x.m.from+x.m.to+(x.m.promotion||'')));
      const quiet=nonTop.filter(x=>!x.m.captured&&!x.m.san.includes('+')&&!x.m.san.includes('#'));
      pool=quiet.length?quiet:(nonTop.length?nonTop:pool);
    }else if(elo<=300){
      const topFive=new Set(engineCandidates.slice(0,5).map(c=>c.move.from+c.move.to+(c.move.promotion||'')));
      const weaker=pool.filter(x=>!topFive.has(x.m.from+x.m.to+(x.m.promotion||'')));
      if(weaker.length) pool=weaker;
    }else if(elo<=500){
      const topThree=new Set(engineCandidates.slice(0,3).map(c=>c.move.from+c.move.to+(c.move.promotion||'')));
      const weaker=pool.filter(x=>!topThree.has(x.m.from+x.m.to+(x.m.promotion||'')));
      if(weaker.length) pool=weaker;
    }

    return (pool[Math.floor(Math.random()*pool.length)]||ranked[Math.min(center,n-1)]||ranked[n-1]).m;
  }
  return null;
}

function pickCalibratedEngineMove(bot,candidates){
  if(!candidates.length) return null;
  const elo=clamp(bot.strength,0,3600);

  if(elo<=1000){
    const weak=pickWeakCalibratedMove(bot,candidates);
    if(weak) return weak;
  }

  const ranges =
    elo<=1200 ? [2,Math.min(6,candidates.length)] :
    elo<=1600 ? [1,Math.min(5,candidates.length)] :
    elo<=2000 ? [0,Math.min(4,candidates.length)] :
    elo<=2400 ? [0,Math.min(3,candidates.length)] :
    elo<=3000 ? [0,Math.min(2,candidates.length)] :
    [0,1];

  let pool=candidates.slice(ranges[0],ranges[1]);
  if(!pool.length) pool=candidates.slice(0,1);

  for(const c of pool){
    const personality=styleBonus(c.move,bot)*(elo<1800?.28:.12);
    const noise=Math.random()*clamp((2200-elo)/8,0,120);
    c.calibratedScore=-(c.rank-1)*(elo>=2400?170:95)+personality+noise;
  }
  pool.sort((a,b)=>b.calibratedScore-a.calibratedScore);

  if(elo>=3200) return candidates[0].move;
  if(elo>=2600 && Math.random()<.88) return candidates[0].move;
  if(elo>=2200 && Math.random()<.72) return candidates[0].move;
  return pool[0].move;
}

async function chooseBotMovePowered(){
  if(!engineReady) return chooseBotMove();
  const bot=materializeNemesis(currentBot);
  currentBot=bot;
  try{
    const elo=clamp(bot.strength,0,3600);
    const skill=elo>=3000?20:clamp(Math.round((elo-700)/95),0,20);
    const movetime=elo>=3200?900:clamp(Math.round(80+elo*.2),90,700);
    const result=await stockfish.analyze(game.fen(),{movetime:movetime,multiPV:8,skill:skill});
    const candidates=[];
    for(const info of result.lines){
      const uci=info.pv&&info.pv[0];
      const move=uciToMove(game,uci);
      if(move) candidates.push({move:move,rank:info.multipv||1,info:info});
    }
    if(!candidates.length && result.bestmove){
      const move=uciToMove(game,result.bestmove);
      if(move) candidates.push({move:move,rank:1,info:result.lastInfo});
    }
    if(!candidates.length) return chooseBotMove();
    return pickCalibratedEngineMove(bot,candidates) || chooseBotMove();
  }catch(err){
    console.warn('Stockfish bot search failed; using Pacer fallback',err);
    return chooseBotMove();
  }
}

async function queueBotMove(){
  if(gameEnded || game.turn() !== botColor) return;
  thinking = true;
  updateStatus();
  renderBoard();
  updateClocks();

  const delay = clamp(650-currentBot.strength*.18,120,500);
  await new Promise(r=>setTimeout(r,delay));
  if(gameEnded || game.turn() !== botColor){ thinking=false; return; }

  const move = await chooseBotMovePowered();
  if(move && !gameEnded && game.turn()===botColor){
    const played=game.move({from:move.from,to:move.to,promotion:move.promotion||'q'});
    lastMove={from:played.from,to:played.to};
    playMoveSound(!!played.captured);
  }
  thinking=false;
  renderAll();
  if(!checkGameEnd()) refreshEngineAnalysis();
}

function inferIntent(move){
  const flags = move.flags || '';
  const ply = game.history().length;
  if(flags.includes('k') || flags.includes('q')) return 'King safety — castling';
  if(move.san.includes('#')) return 'Finish the attack — checkmate';
  if(move.san.includes('+')) return 'Direct attack on the king';
  if(move.captured) return 'Trade or win material on ' + move.to;
  if(move.piece === 'p' && ['d4','e4','d5','e5'].includes(move.to) && ply <= 10) return 'Claim the center';
  if((move.piece === 'n' || move.piece === 'b') && ply <= 12) return 'Develop a piece';
  if(move.piece === 'q' && ply <= 12) return 'Early queen activity';
  if(move.piece === 'p') return 'Gain space or support a piece';
  if(move.piece === 'k') return 'Improve king safety';
  return 'Improve piece placement and create pressure';
}
function reviewUserMove(before,after,move,beforeFen){
  const perspective = userColor === 'w' ? 1 : -1;
  const swing = (after-before) * perspective;
  const intent = inferIntent(move);
  $('#intentLine').textContent = intent;

  gameStats.moves++;
  profile.intents[intent] = (profile.intents[intent] || 0) + 1;

  if(move.captured) gameStats.captures++;
  if(move.san.includes('+') || move.san.includes('#')) gameStats.checks++;
  if((move.flags||'').includes('k') || (move.flags||'').includes('q')) gameStats.castles++;
  if((move.piece === 'n' || move.piece === 'b') && game.history().length <= 12) gameStats.developments++;

  let label = 'Good move';
  let msg = 'Solid. Keep checking what your opponent attacks before you commit to the next plan.';

  if(move.san.includes('#')){
    label='Checkmate'; msg='You finished the attack cleanly.'; coach.currentStreak++;
  }else if(swing <= -180){
    label='Blunder'; msg='That move dropped a lot of value. Scan enemy checks and captures before your next move.';
    coach.blunders++; gameStats.blunders++; coach.currentStreak=0;
  }else if(swing <= -85){
    label='Mistake'; msg='That move gave away some value. Check whether something became loose or undefended.';
    coach.mistakes++; gameStats.mistakes++; coach.currentStreak=0;
  }else if(move.san.includes('+')){
    label='Check'; msg='You found a check. Now ask what the strongest reply is.'; coach.currentStreak++;
  }else if(move.captured){
    label='Capture'; msg='You changed the material balance. Make sure the capturing piece is safe.'; coach.currentStreak++;
  }else{
    coach.currentStreak++;
  }

  coach.bestStreak = Math.max(coach.bestStreak,coach.currentStreak);
  moveReviews.push({
    move:move.san,label:label,swing:swing,intent:intent,
    beforeFen:beforeFen,afterFen:game.fen(),
    uci:move.from+move.to+(move.promotion||'')
  });

  if($('#learningToggle').checked){
    const feedback=formatCoachFeedback(label,msg);
    $('#coachMessage').textContent=feedback;
    if((label==='Blunder'||label==='Mistake') && coachTone!=='minimal') showToast(feedback);
  }
  updateCoach();
}
async function getHint(){
  if(!isUserTurn()) return;
  const fen=game.fen();
  let m=null;
  if(engineReady){
    try{
      const result=await stockfish.analyze(fen,{movetime:320,multiPV:3,skill:20});
      const uci=(result.lines[0]&&result.lines[0].pv&&result.lines[0].pv[0])||result.bestmove;
      m=uciToMove(game,uci);
    }catch(err){console.warn('Stockfish hint failed',err);}
  }
  if(!m){
    const helper=Object.assign({},currentBot,{strength:2000,tactics:100,position:100,randomness:0,mistakeRate:0,style:'balanced',risk:45});
    const ranked=rankMovesFor(game,helper,userColor,5);
    if(ranked.length) m=ranked[0].m;
  }
  if(!m) return;

  let reason='improves your position';
  if(m.san.includes('#')) reason='delivers checkmate';
  else if(m.san.includes('+')) reason='gives check';
  else if(m.captured) reason='wins or trades a '+namePiece(m.captured);
  else if((m.flags||'').includes('k')||(m.flags||'').includes('q')) reason='gets your king safer';
  else if(m.piece==='n'||m.piece==='b') reason='develops a piece';

  $('#coachMessage').textContent='Stockfish hint: consider '+m.san+'. It '+reason+'.';
  showToast('Hint: '+m.san+' — '+reason+'.');
}
function namePiece(t){
  return ({p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'})[t] || 'piece';
}
function formatCoachFeedback(label,msg){
  if(coachTone==='minimal') return label;
  if(coachTone==='competitive'){
    if(label==='Blunder'||label==='Mistake') return label+': '+msg+' Find the correction on the next move.';
    return label+': '+msg;
  }
  if(coachTone==='detailed') return label+': '+msg+' Pacer will save this decision for your post-game review.';
  return label+': '+msg;
}

function renderMoves(){
  const hist = game.history();
  const list = $('#moveList');
  list.innerHTML = '';
  if(!hist.length){
    list.innerHTML = '<div class="status-sub" style="padding:10px">Moves will appear here.</div>';
    return;
  }
  for(let i=0;i<hist.length;i+=2){
    const row = document.createElement('div');
    row.className = 'move-row';

    const num = document.createElement('div');
    num.className = 'move-num';
    num.textContent = String(i/2+1) + '.';

    const w = document.createElement('div');
    w.className = 'move-cell';
    w.textContent = hist[i] || '';

    const b = document.createElement('div');
    b.className = 'move-cell';
    b.textContent = hist[i+1] || '';

    if(i === hist.length-1) w.classList.add('latest');
    if(i+1 === hist.length-1) b.classList.add('latest');

    row.append(num,w,b);
    list.appendChild(row);
  }
  list.scrollTop = list.scrollHeight;
}
function capturedByColor(){
  const start={w:{p:8,n:2,b:2,r:2,q:1},b:{p:8,n:2,b:2,r:2,q:1}};
  const now={w:{p:0,n:0,b:0,r:0,q:0},b:{p:0,n:0,b:0,r:0,q:0}};
  for(const row of game.board()) for(const p of row) if(p && p.type !== 'k') now[p.color][p.type]++;

  const taken={w:[],b:[]};
  for(const t of pieceOrder){
    for(let i=0;i<start.b[t]-now.b[t];i++) taken.w.push(pieceGlyph['b'+t]);
    for(let i=0;i<start.w[t]-now.w[t];i++) taken.b.push(pieceGlyph['w'+t]);
  }
  return taken;
}
function renderCaptured(){
  const taken = capturedByColor();
  $('#userCaptured').textContent = taken[userColor].join('');
  $('#botCaptured').textContent = taken[botColor].join('');
}
function renderEval(){
  const cp = engineEvalCp!==null ? engineEvalCp : evaluate(game);
  const pawns = cp/100;
  const whitePct = clamp(50 + pawns*5.2,8,92);
  const blackPct = 100-whitePct;
  $('#evalWhite').style.height=whitePct+'%';
  $('#evalBlack').style.height=blackPct+'%';

  const userEval=pawns*(userColor==='w'?1:-1);
  $('#evalText').textContent=Math.abs(userEval)>900?'M':((userEval>=0?'+':'')+userEval.toFixed(1));
}
function updateStatus(){
  let title = game.turn() === userColor ? 'Your move' : currentBot.name + ' to move';
  let sub = 'You are ' + colorName(userColor);

  if(gameEnded){
    title='Game over'; sub='Start a new game when you are ready.';
  }else if(thinking){
    title=currentBot.name + ' is thinking…'; sub='You are ' + colorName(userColor);
  }else if(game.inCheck() && game.turn() === userColor){
    title='YOU ARE IN CHECK'; sub='Protect your king.';
  }else if(game.inCheck() && game.turn() === botColor){
    title='Bot is in check'; sub='Nice — keep the pressure on.';
  }

  $('#statusTitle').textContent=title;
  $('#statusSub').textContent=sub;
  $('#takebackBtn').disabled=thinking || game.history().length===0 || gameEnded;
  $('#hintBtn').disabled=!isUserTurn();
}
function updateCoach(){
  $('#mistakeCount').textContent=coach.mistakes;
  $('#blunderCount').textContent=coach.blunders;
  $('#bestStreak').textContent=coach.bestStreak;
}
function renderPlayer(){
  const bot = materializeNemesis(currentBot);
  if(currentBot.id === 'nemesis') currentBot = bot;

  $('#opponentName').textContent=currentBot.name;
  $('#opponentAvatar').textContent=currentBot.avatar;
  $('#opponentRating').textContent=currentBot.strength;
  $('#nemesisTag').hidden=currentBot.id !== 'nemesis';
  const rated=isRatedGame();
  const statusText=testMode?'TEST':rated?'RATED':'UNRATED';
  $('#ratedTag').textContent=statusText;
  $('#ratedTag').classList.toggle('unrated',!rated);

  $('#botSideLabel').textContent=colorName(botColor).toUpperCase();
  $('#userSideLabel').textContent=colorName(userColor).toUpperCase();
  $('#userRating').textContent=profile.rating;
  $('#headerElo').textContent=profile.rating;
  document.body.classList.toggle('test-mode',testMode);
}
function renderAll(){
  renderBoard();
  renderMoves();
  renderCaptured();
  renderEval();
  renderPlayer();
  updateStatus();
  updateClocks();
  updateCoach();
  renderBrain();
  renderEnginePanel();
  renderReviewState();
}

function resolveSide(){
  const choice=$('#sideSelect').value;
  if(choice==='random') return Math.random()<0.5?'w':'b';
  return choice==='black'?'b':'w';
}
function resetGameStats(){
  gameStats={moves:0,mistakes:0,blunders:0,checks:0,captures:0,castles:0,developments:0};
}
function startNewGame(){
  clearInterval(timerHandle);
  timerHandle=null;

  trainingMode=false;
  document.body.classList.remove('training-active');
  if($('#trainingDialog').open) $('#trainingDialog').close();
  game=new Chess();
  engineEvalCp=null;
  engineDepth=null;
  engineLines=[];
  selected=null;
  legalMoves=[];
  lastMove=null;
  thinking=false;
  gameEnded=false;
  ratingApplied=false;
  moveReviews=[];
  reviewResults=[];
  lastCompletedGame=null;
  coach={mistakes:0,blunders:0,bestStreak:0,currentStreak:0};
  resetGameStats();

  userColor=resolveSide();
  botColor=opposite(userColor);
  viewFlipped=false;

  if(currentBot.id==='nemesis') currentBot=materializeNemesis(bots.find(b=>b.id==='nemesis') || currentBot);

  const sec=Number($('#clockSelect').value);
  clockEnabled=sec>0;
  timers={w:sec,b:sec};

  $('#coachMessage').textContent='Make a move and I’ll explain what changed.';
  $('#intentLine').textContent='—';

  if($('#gameOverDialog').open) $('#gameOverDialog').close();

  renderAll();
  startClockLoop();

  if(game.turn()===botColor) setTimeout(queueBotMove,300);
  else refreshEngineAnalysis();
}
function takeback(){
  if(thinking || gameEnded || game.history().length===0) return;
  game.undo();
  if(game.turn() !== userColor && game.history().length) game.undo();

  lastMove=null;
  selected=null;
  legalMoves=[];

  const review=moveReviews.pop();
  if(review && review.label==='Blunder'){
    coach.blunders=Math.max(0,coach.blunders-1);
    gameStats.blunders=Math.max(0,gameStats.blunders-1);
  }
  if(review && review.label==='Mistake'){
    coach.mistakes=Math.max(0,coach.mistakes-1);
    gameStats.mistakes=Math.max(0,gameStats.mistakes-1);
  }
  renderAll();
  refreshEngineAnalysis();
  showToast('Takeback used. Try a different idea.');
}
function resign(){
  if(gameEnded) return;
  finishGame('You resigned.','loss','Bot wins','🏳️');
}
function checkGameEnd(){
  if(gameEnded) return true;

  if(game.isCheckmate()){
    const winnerColor=opposite(game.turn());
    const userWon=winnerColor===userColor;
    finishGame('Checkmate.',userWon?'win':'loss',userWon?'You win':'Bot wins',userWon?'🏆':'♛');
    return true;
  }
  if(game.isStalemate()){
    finishGame('Stalemate.','draw','Draw','🤝');
    return true;
  }
  if(game.isThreefoldRepetition()){
    finishGame('Threefold repetition.','draw','Draw','🤝');
    return true;
  }
  if(game.isInsufficientMaterial()){
    finishGame('Insufficient material.','draw','Draw','🤝');
    return true;
  }
  if(game.isDraw()){
    finishGame('Draw by the fifty-move rule.','draw','Draw','🤝');
    return true;
  }
  return false;
}

function eloDelta(opponentRating,result){
  const score=result==='win'?1:result==='draw'?0.5:0;
  const expected=1/(1+Math.pow(10,(opponentRating-profile.rating)/400));
  const k=profile.games<20?48:32;
  return Math.round(k*(score-expected));
}
function recordGame(result){
  if(ratingApplied) return {delta:0,rated:isRatedGame(),test:testMode};
  ratingApplied=true;

  if(testMode || trainingMode) return {delta:0,rated:false,test:true};
  const rated=isRatedGame();
  const opponentRating=currentBot.strength;
  const delta=rated?eloDelta(opponentRating,result):0;
  if(rated){
    profile.rating=clamp(profile.rating+delta,100,3600);
    profile.peakRating=Math.max(profile.peakRating||profile.rating,profile.rating);
    if(!Array.isArray(profile.ratingHistory)) profile.ratingHistory=[];
    profile.ratingHistory.push(profile.rating);
    if(profile.ratingHistory.length>100) profile.ratingHistory=profile.ratingHistory.slice(-100);
  }

  profile.games++;
  if(result==='win') profile.wins++;
  else if(result==='loss') profile.losses++;
  else profile.draws++;

  profile.moves+=gameStats.moves;
  profile.mistakes+=gameStats.mistakes;
  profile.blunders+=gameStats.blunders;
  profile.checks+=gameStats.checks;
  profile.captures+=gameStats.captures;
  profile.castles+=gameStats.castles;
  profile.developments+=gameStats.developments;

  if(currentBot.id==='nemesis'){
    profile.nemesis.games++;
    if(result==='win') profile.nemesis.losses++;
    else if(result==='loss') profile.nemesis.wins++;
    else profile.nemesis.draws++;
  }

  profile.nemesis.focus=brainScores().weakest;
  saveProfile();
  return {delta:delta,rated:rated};
}
function finishGame(reason,result,title,icon){
  gameEnded=true;
  thinking=false;
  clearInterval(timerHandle);
  timerHandle=null;

  lastCompletedGame={
    result:result,reason:reason,title:title,
    botName:currentBot.name,botRating:currentBot.strength,
    userColor:userColor,opening:openingName(),
    moveReviews:moveReviews.map(x=>Object.assign({},x)),
    history:game.history()
  };

  const rating=recordGame(result);
  renderAll();
  $('#analyzeGameBtn').disabled=!lastCompletedGame.moveReviews.length;
  $('#reviewGameBtn').disabled=!lastCompletedGame.moveReviews.length;

  $('#gameOverIcon').textContent=icon;
  $('#gameOverTitle').textContent=title;
  $('#gameOverReason').textContent=reason;
  $('#summaryMistakes').textContent=coach.mistakes;
  $('#summaryBlunders').textContent=coach.blunders;
  $('#summaryMoves').textContent=Math.ceil(game.history().length/2);
  $('#summaryOpponent').textContent=currentBot.strength;
  $('#ratingAfter').textContent=profile.rating;
  $('#ratingDelta').textContent=rating.test?'TEST MODE':rating.rated?((rating.delta>=0?'+':'')+rating.delta):'UNRATED';
  $('#ratingDelta').style.color=rating.rated?(rating.delta>=0?'#a9da73':'#e58a82'):'var(--muted)';

  if(!$('#gameOverDialog').open) $('#gameOverDialog').showModal();
}
function formatTime(sec){
  if(!clockEnabled) return '∞';
  sec=Math.max(0,Math.ceil(sec));
  return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
}
function updateClocks(){
  $('#userClock').textContent=formatTime(timers[userColor]);
  $('#botClock').textContent=formatTime(timers[botColor]);
  $('#userClock').classList.toggle('active',!gameEnded && game.turn()===userColor);
  $('#botClock').classList.toggle('active',!gameEnded && game.turn()===botColor);
}
function startClockLoop(){
  clearInterval(timerHandle);
  timerHandle=null;
  if(!clockEnabled) return;

  let last=performance.now();
  timerHandle=setInterval(() => {
    if(gameEnded) return;
    const now=performance.now();
    const dt=(now-last)/1000;
    last=now;
    const side=game.turn();
    timers[side]-=dt;

    if(timers[side]<=0){
      timers[side]=0;
      updateClocks();
      const userLost=side===userColor;
      finishGame((userLost?'You':'The bot')+' ran out of time.',userLost?'loss':'win',userLost?'Bot wins':'You win','⏱️');
      return;
    }
    updateClocks();
  },200);
}

function brainScores(){
  if(profile.moves<1){
    return {vision:50,tactics:50,king:50,discipline:50,weakest:'Board vision'};
  }
  const m=Math.max(1,profile.moves);
  const g=Math.max(1,profile.games);
  const vision=clamp(Math.round(90-(profile.blunders*220+profile.mistakes*75)/m),15,98);
  const tactics=clamp(Math.round(42+(profile.checks*120+profile.captures*18)/m+Math.min(12,profile.games)),20,98);
  const king=clamp(Math.round(48+(profile.castles/g)*35-(profile.blunders/m)*75+Math.min(8,profile.games*.5)),20,96);
  const discipline=clamp(Math.round(94-(profile.mistakes*55+profile.blunders*130)/m),18,99);

  const map={'Board vision':vision,'Tactics':tactics,'King safety':king,'Discipline':discipline};
  const weakest=Object.entries(map).sort((a,b)=>a[1]-b[1])[0][0];
  return {vision:vision,tactics:tactics,king:king,discipline:discipline,weakest:weakest};
}
function renderBrain(){
  const s=brainScores();
  $('#profileGames').textContent=profile.games;
  $('#visionScore').textContent=s.vision;
  $('#tacticsScore').textContent=s.tactics;
  $('#kingScore').textContent=s.king;
  $('#disciplineScore').textContent=s.discipline;
  $('#visionBar').style.width=s.vision+'%';
  $('#tacticsBar').style.width=s.tactics+'%';
  $('#kingBar').style.width=s.king+'%';
  $('#disciplineBar').style.width=s.discipline+'%';

  let insight='Play rated games and Pacer will build a model of your habits.';
  if(profile.games>0){
    const advice={
      'Board vision':'Your biggest leak is board vision. VEX will look for loose pieces, forks, and missed threats.',
      'Tactics':'Your tactics score is the lowest. VEX will create forcing positions and make you calculate.',
      'King safety':'King safety is the weak point. VEX will attack quickly when your king stays exposed.',
      'Discipline':'Discipline is the weak point. VEX will tempt you into bad trades and impatient moves.'
    };
    insight=advice[s.weakest];
  }
  $('#brainInsight').textContent=insight;
  $('#profileRecord').textContent=profile.wins+'-'+profile.losses+'-'+profile.draws;
  $('#peakRating').textContent=profile.peakRating||profile.rating;
  $('#brainRating').textContent=profile.rating;
  const clone=makeCloneBot();
  $('#cloneName').textContent='Your Clone · '+clone.strength;
  $('#cloneDescription').textContent=profile.games<3
    ? 'Early version — play a few more games and the clone will copy more of your habits.'
    : 'Built from your current rating, aggression, tactical profile, discipline, and mistake rate.';

  const nemesisBase=bots.find(b=>b.id==='nemesis') || defaultBots.find(b=>b.id==='nemesis');
  const vex=materializeNemesis(nemesisBase);
  $('#nemesisRating').textContent=vex.strength;
  if(profile.nemesis.games<1){
    $('#nemesisMessage').textContent='VEX has not studied enough games yet. Play it and it will begin targeting your weakest area.';
  }else{
    $('#nemesisMessage').textContent='VEX has studied '+profile.nemesis.games+' game'+(profile.nemesis.games===1?'':'s')+'. Current target: '+s.weakest+'. Record vs you: '+profile.nemesis.wins+'-'+profile.nemesis.losses+'-'+profile.nemesis.draws+'.';
  }
}

function renderAvatarPicker(){
  const wrap=$('#avatarPicker');
  wrap.innerHTML='';
  avatars.forEach(a => {
    const b=document.createElement('button');
    b.type='button';
    b.className='avatar-choice'+(a===selectedAvatar?' selected':'');
    b.textContent=a;
    b.addEventListener('click',() => { selectedAvatar=a; renderAvatarPicker(); });
    wrap.appendChild(b);
  });
}
function renderBotList(){
  const list=$('#botList');
  list.innerHTML='';
  bots.forEach(baseBot => {
    const bot=baseBot.id==='nemesis'?materializeNemesis(baseBot):baseBot;
    const card=document.createElement('div');
    card.className='bot-card'+(currentBot.id===bot.id?' active':'');

    const av=document.createElement('div');
    av.className='bot-card-avatar';
    av.textContent=bot.avatar;

    const info=document.createElement('div');
    const n=document.createElement('div');
    n.className='bot-card-name';
    n.textContent=bot.name;
    const meta=document.createElement('div');
    meta.className='bot-card-meta';
    meta.textContent=bot.strength+' · '+bot.style+(bot.id==='nemesis'?' · adapts':'');
    info.append(n,meta);

    const play=document.createElement('button');
    play.type='button';
    play.textContent='Play';
    play.addEventListener('click',e => { e.stopPropagation(); chooseBot(bot); });

    card.append(av,info,play);
    card.addEventListener('click',() => loadBotIntoEditor(bot));
    list.appendChild(card);
  });
}
function loadBotIntoEditor(bot){
  $('#botNameInput').value=bot.name;
  $('#strengthInput').value=bot.strength;
  $('#aggressionInput').value=bot.aggression;
  $('#tacticsInput').value=bot.tactics;
  $('#positionInput').value=bot.position||50;
  $('#riskInput').value=bot.risk||50;
  $('#randomnessInput').value=bot.randomness;
  $('#mistakeRateInput').value=bot.mistakeRate;
  $('#styleInput').value=bot.style;
  selectedAvatar=bot.avatar;
  syncBotSliders();
  renderAvatarPicker();
  $('#saveBotBtn').dataset.editing=bot.locked?'':bot.id;
}
function syncBotSliders(){
  $('#strengthValue').textContent=$('#strengthInput').value;
  $('#aggressionValue').textContent=$('#aggressionInput').value+'%';
  $('#tacticsValue').textContent=$('#tacticsInput').value+'%';
  $('#positionValue').textContent=$('#positionInput').value+'%';
  $('#riskValue').textContent=$('#riskInput').value+'%';
  $('#randomnessValue').textContent=$('#randomnessInput').value+'%';
  $('#mistakeRateValue').textContent=$('#mistakeRateInput').value+'%';
}
function editorBot(){
  return {
    id:$('#saveBotBtn').dataset.editing||uid(),
    name:($('#botNameInput').value||'Custom Bot').trim().slice(0,24),
    avatar:selectedAvatar,
    strength:+$('#strengthInput').value,
    aggression:+$('#aggressionInput').value,
    tactics:+$('#tacticsInput').value,
    position:+$('#positionInput').value,
    risk:+$('#riskInput').value,
    randomness:+$('#randomnessInput').value,
    mistakeRate:+$('#mistakeRateInput').value,
    style:$('#styleInput').value,
    locked:false
  };
}
function chooseBot(bot){
  currentBot=bot.id==='nemesis'?materializeNemesis(bot):bot;
  renderBotList();
  renderPlayer();
  if($('#botDialog').open) $('#botDialog').close();
  startNewGame();
  showToast('Playing '+currentBot.name+'.');
}
function saveAndPlayBot(e){
  e.preventDefault();
  const bot=editorBot();
  const idx=bots.findIndex(b=>b.id===bot.id);
  if(idx>=0) bots[idx]=bot;
  else bots.push(bot);
  saveCustomBots();
  currentBot=bot;
  renderBotList();
  $('#botDialog').close();
  startNewGame();
  showToast(bot.name+' saved.');
}
function duplicateBot(){
  const bot=editorBot();
  bot.id=uid();
  bot.name=(bot.name+' Copy').slice(0,24);
  bots.push(bot);
  saveCustomBots();
  loadBotIntoEditor(bot);
  renderBotList();
  showToast('Bot duplicated.');
}

function switchTab(name){
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));
  $('#gameTab').classList.toggle('active',name==='game');
  $('#coachTab').classList.toggle('active',name==='coach');
  $('#brainTab').classList.toggle('active',name==='brain');
  $('#analysisTab').classList.toggle('active',name==='analysis');
  $('#reviewTab').classList.toggle('active',name==='review');
}
function renderReviewState(){
  const analyze=$('#analyzeGameBtn');
  if(analyze) analyze.disabled=!lastCompletedGame || !lastCompletedGame.moveReviews.length || reviewRunning;
  if(!lastCompletedGame){
    $('#reviewHeadline').textContent='Finish a game to review it';
    $('#reviewSummary').textContent='Pacer will use Stockfish to classify your moves and turn mistakes into training positions.';
    $('#reviewAccuracy').textContent='—';
    return;
  }
  if(reviewRunning) return;
  if(reviewResults.length){
    const bad=reviewResults.filter(r=>r.label==='Mistake'||r.label==='Blunder').length;
    $('#reviewHeadline').textContent='Review complete · '+lastCompletedGame.opening;
    $('#reviewSummary').textContent=bad?bad+' major decision'+(bad===1?'':'s')+' can be trained.':'No major mistakes found in the reviewed moves.';
  }else{
    $('#reviewHeadline').textContent=lastCompletedGame.title+' vs '+lastCompletedGame.botName;
    $('#reviewSummary').textContent='Ready for Stockfish review.';
  }
}
function classifyReviewMove(loss,bestMatch){
  if(bestMatch) return 'Best';
  if(loss<=20) return 'Excellent';
  if(loss<=60) return 'Good';
  if(loss<=120) return 'Inaccuracy';
  if(loss<=250) return 'Mistake';
  return 'Blunder';
}
function renderReviewResults(){
  const list=$('#reviewMoveList');
  list.innerHTML='';
  if(!reviewResults.length){
    list.innerHTML='<div class="empty-review">No reviewed moves yet.</div>';
    return;
  }
  let totalLoss=0;
  reviewResults.forEach((r,i)=>{
    totalLoss+=Math.min(r.loss,500);
    const row=document.createElement('div');
    row.className='review-move '+r.label.toLowerCase()+(r.loss>120?' bad':'');
    const a=document.createElement('span');a.className='move-index';a.textContent='#'+(i+1);
    const b=document.createElement('span');b.className='move-san';b.textContent=r.san;
    const c=document.createElement('span');c.className='move-label';c.textContent=r.label+(r.bestSan&&r.bestSan!==r.san?' · best '+r.bestSan:'');
    const d=document.createElement('span');d.className='move-loss';d.textContent=r.loss<=5?'≈0':('-'+(r.loss/100).toFixed(1));
    row.append(a,b,c,d);
    list.appendChild(row);
  });
  const avg=totalLoss/reviewResults.length;
  const accuracy=clamp(Math.round(100-avg/4.3),0,100);
  $('#reviewAccuracy').textContent=accuracy+'%';
  $('#trainMistakesBtn').disabled=!reviewResults.some(r=>r.loss>=80);
  renderReviewState();
}
async function analyzeLastGame(){
  if(reviewRunning || !lastCompletedGame || !lastCompletedGame.moveReviews.length) return;
  if(!engineReady){
    showToast('Stockfish is not ready yet.');
    return;
  }
  reviewRunning=true;
  reviewResults=[];
  $('#analyzeGameBtn').disabled=true;
  $('#trainMistakesBtn').disabled=true;
  $('#reviewProgress').hidden=false;
  $('#reviewMoveList').innerHTML='<div class="empty-review">Analyzing your decisions with Stockfish…</div>';

  const items=lastCompletedGame.moveReviews;
  for(let i=0;i<items.length;i++){
    const item=items[i];
    try{
      const before=await stockfish.analyze(item.beforeFen,{movetime:130,multiPV:1,skill:20});
      const beforeInfo=before.lines[0]||before.lastInfo;
      const bestUci=(beforeInfo&&beforeInfo.pv&&beforeInfo.pv[0])||before.bestmove;
      const after=await stockfish.analyze(item.afterFen,{movetime:130,multiPV:1,skill:20});
      const afterInfo=after.lines[0]||after.lastInfo;
      const beforeWhite=infoToWhiteCp(beforeInfo,item.beforeFen);
      const afterWhite=infoToWhiteCp(afterInfo,item.afterFen);
      const sign=lastCompletedGame.userColor==='w'?1:-1;
      const beforeUser=(beforeWhite===null?0:beforeWhite)*sign;
      const afterUser=(afterWhite===null?0:afterWhite)*sign;
      const loss=clamp(Math.round(Math.max(0,beforeUser-afterUser)),0,9999);
      const bestMove=uciToMove(new Chess(item.beforeFen),bestUci);
      reviewResults.push({
        san:item.move,uci:item.uci,beforeFen:item.beforeFen,afterFen:item.afterFen,
        bestUci:bestUci,bestSan:bestMove?bestMove.san:'—',loss:loss,
        label:classifyReviewMove(loss,item.uci===bestUci),intent:item.intent
      });
    }catch(err){
      console.warn('Review move failed',err);
      reviewResults.push({
        san:item.move,uci:item.uci,beforeFen:item.beforeFen,afterFen:item.afterFen,
        bestUci:null,bestSan:'—',loss:Math.max(0,Math.round(-item.swing)),
        label:item.label==='Blunder'?'Blunder':item.label==='Mistake'?'Mistake':'Good',intent:item.intent
      });
    }
    const pct=Math.round((i+1)/items.length*100);
    $('#reviewProgressBar').style.width=pct+'%';
    $('#reviewProgressText').textContent=(i+1)+' / '+items.length;
  }

  reviewRunning=false;
  $('#reviewProgress').hidden=true;
  $('#analyzeGameBtn').disabled=false;
  renderReviewResults();
}
function startMistakeTraining(){
  trainingQueue=reviewResults.filter(r=>r.loss>=80&&r.bestUci);
  if(!trainingQueue.length){
    showToast('No reviewed mistakes to train.');
    return;
  }
  trainingIndex=0;
  trainingMode=true;
  document.body.classList.add('training-active');
  if(!$('#trainingDialog').open) $('#trainingDialog').show();
  loadTrainingPosition();
}
function loadTrainingPosition(){
  trainingCurrent=trainingQueue[trainingIndex];
  if(!trainingCurrent){ stopMistakeTraining(); return; }
  game=new Chess(trainingCurrent.beforeFen);
  userColor=game.turn();
  botColor=opposite(userColor);
  trainingTargetUci=trainingCurrent.bestUci;
  thinking=false;
  gameEnded=false;
  selected=null;legalMoves=[];lastMove=null;
  clockEnabled=false;
  $('#trainingCounter').textContent=(trainingIndex+1)+' / '+trainingQueue.length;
  $('#trainingFeedback').textContent='Your move';
  $('#trainingTitle').textContent='Fix '+trainingCurrent.san;
  $('#trainingPrompt').textContent='Find the better move from this position. Pacer saved it from your last game.';
  renderAll();
}
function handleTrainingAttempt(move,beforeFen){
  const uci=move.from+move.to+(move.promotion||'');
  if(uci===trainingTargetUci){
    $('#trainingFeedback').textContent='Correct · '+move.san;
    renderAll();
    setTimeout(()=>{
      trainingIndex++;
      if(trainingIndex>=trainingQueue.length){
        showToast('Mistake training complete.');
        stopMistakeTraining();
      }else{
        loadTrainingPosition();
      }
    },650);
  }else{
    const best=uciToMove(new Chess(beforeFen),trainingTargetUci);
    $('#trainingFeedback').textContent='Try again'+(best?' · look for something stronger':'');
    game=new Chess(beforeFen);
    selected=null;legalMoves=[];lastMove=null;
    renderAll();
  }
}
function stopMistakeTraining(){
  trainingMode=false;
  trainingQueue=[];
  trainingCurrent=null;
  trainingTargetUci=null;
  document.body.classList.remove('training-active');
  if($('#trainingDialog').open) $('#trainingDialog').close();
  startNewGame();
}

function setupTabs(){
  document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>switchTab(tab.dataset.tab)));
}
function applyTheme(mode){
  const light=mode==='light';
  document.body.classList.toggle('light-mode',light);
  const toggle=$('#darkModeToggle');
  if(toggle) toggle.checked=!light;
}
function setupTheme(){
  applyTheme(localStorage.getItem(THEME_KEY)||'dark');
  const boardTheme=localStorage.getItem(BOARD_THEME_KEY)||'forest';
  document.body.dataset.boardTheme=boardTheme;
  $('#boardThemeSelect').value=boardTheme;
  soundEnabled=localStorage.getItem(SOUND_KEY)!=='off';
  $('#soundToggle').checked=soundEnabled;
  testMode=localStorage.getItem(TEST_MODE_KEY)==='on';
  $('#testModeToggle').checked=testMode;
  coachTone=localStorage.getItem(COACH_TONE_KEY)||'neutral';
  $('#coachToneSelect').value=coachTone;
}
function setupEvents(){
  const syncQuickElo=(value)=>{
    const elo=clamp(Math.round(Number(value)||0),0,3600);
    $('#quickEloRange').value=elo;
    $('#quickEloInput').value=elo;
    $('#quickEloValue').textContent=elo;
    $('#eloBehaviorText').textContent=eloBehaviorText(elo);
  };
  $('#quickEloRange').addEventListener('input',e=>syncQuickElo(e.target.value));
  $('#quickEloInput').addEventListener('input',e=>syncQuickElo(e.target.value));
  $('#playEloBtn').addEventListener('click',()=>{
    const elo=clamp(Math.round(Number($('#quickEloInput').value)||0),0,3600);
    currentBot=makeEloBot(elo);
    startNewGame();
    showToast('Playing calibrated '+elo+' Elo bot.');
  });

  $('#newGameBtn').addEventListener('click',startNewGame);
  $('#takebackBtn').addEventListener('click',takeback);
  $('#hintBtn').addEventListener('click',getHint);
  $('#threatBtn').addEventListener('click',() => {
    threatVision=!threatVision;
    $('#threatBtn').classList.toggle('active',threatVision);
    renderBoard();
    showToast(threatVision?'Threat Vision on — attacked pieces are ringed.':'Threat Vision off.');
  });
  $('#focusBtn').addEventListener('click',() => {
    document.body.classList.toggle('focus-mode');
    $('#focusBtn').classList.toggle('active',document.body.classList.contains('focus-mode'));
  });
  $('#flipBtn').addEventListener('click',() => { viewFlipped=!viewFlipped; renderBoard(); });
  $('#resignBtn').addEventListener('click',resign);
  $('#playAgainBtn').addEventListener('click',startNewGame);

  $('#clockSelect').addEventListener('change',() => {
    if(game.history().length===0) startNewGame();
    else showToast('Clock setting applies when you start a new game.');
  });
  $('#sideSelect').addEventListener('change',() => {
    if(game.history().length===0) startNewGame();
    else showToast('Side choice applies when you start a new game.');
  });

  $('#darkModeToggle').addEventListener('change',e => {
    const mode=e.target.checked?'dark':'light';
    localStorage.setItem(THEME_KEY,mode);
    applyTheme(mode);
  });
  $('#boardThemeSelect').addEventListener('change',e => {
    document.body.dataset.boardTheme=e.target.value;
    localStorage.setItem(BOARD_THEME_KEY,e.target.value);
  });
  $('#soundToggle').addEventListener('change',e => {
    soundEnabled=e.target.checked;
    localStorage.setItem(SOUND_KEY,soundEnabled?'on':'off');
  });
  $('#testModeToggle').addEventListener('change',e=>{
    testMode=e.target.checked;
    localStorage.setItem(TEST_MODE_KEY,testMode?'on':'off');
    renderPlayer();
    showToast(testMode?'Test Mode on — Elo and profile are protected.':'Test Mode off — rated built-in games affect Elo.');
  });
  $('#coachToneSelect').addEventListener('change',e=>{
    coachTone=e.target.value;
    localStorage.setItem(COACH_TONE_KEY,coachTone);
  });

  $('#botManagerBtn').addEventListener('click',() => {
    loadBotIntoEditor(currentBot);
    renderBotList();
    $('#botDialog').showModal();
  });
  $('#playNemesisBtn').addEventListener('click',() => {
    const bot=bots.find(b=>b.id==='nemesis');
    if(bot) chooseBot(bot);
  });
  $('#playCloneBtn').addEventListener('click',()=>chooseBot(makeCloneBot()));
  $('#reviewGameBtn').addEventListener('click',()=>{
    if($('#gameOverDialog').open) $('#gameOverDialog').close();
    switchTab('review');
    analyzeLastGame();
  });
  $('#analyzeGameBtn').addEventListener('click',analyzeLastGame);
  $('#trainMistakesBtn').addEventListener('click',startMistakeTraining);
  $('#closeTrainingBtn').addEventListener('click',stopMistakeTraining);

  $('#botForm').addEventListener('submit',saveAndPlayBot);
  $('#duplicateBotBtn').addEventListener('click',duplicateBot);

  ['strengthInput','aggressionInput','tacticsInput','positionInput','riskInput','randomnessInput','mistakeRateInput'].forEach(id => {
    $('#'+id).addEventListener('input',syncBotSliders);
  });

  document.addEventListener('keydown',e => {
    if(e.key==='Escape' && selected){
      selected=null;
      legalMoves=[];
      renderBoard();
    }
  });
}

async function initStockfish(){
  setEngineState('loading','ENGINE LOADING','Stockfish 19');
  try{
    await stockfish.init();
    engineReady=true;
    setEngineState('ready','ENGINE READY',stockfish.mode);
    refreshEngineAnalysis();
  }catch(err){
    console.warn('Stockfish unavailable',err);
    engineReady=false;
    setEngineState('offline','PACER FALLBACK','Stockfish unavailable');
    renderEnginePanel();
  }
}

function setEngineState(state,title,sub){
  const chip=$('#engineChip');
  chip.classList.remove('loading','ready','offline');
  chip.classList.add(state);
  $('#engineChipText').textContent=title;
  $('#engineChipSub').textContent=sub;
  const badge=$('#engineStatusBadge');
  badge.classList.remove('loading','ready','offline');
  badge.classList.add(state);
  badge.textContent=state==='ready'?'READY':state==='offline'?'FALLBACK':'LOADING';
  $('#engineName').textContent=state==='ready'?stockfish.mode:'Stockfish 19';
}

function renderEnginePanel(){
  $('#openingName').textContent=openingName();
  $('#engineDepth').textContent=engineDepth===null?'—':engineDepth;
  const userCp=engineEvalCp===null?evaluate(game)*(userColor==='w'?1:-1):engineEvalCp*(userColor==='w'?1:-1);
  const val=userCp/100;
  $('#engineEvalLarge').textContent=Math.abs(val)>900?'Mate':((val>=0?'+':'')+val.toFixed(1));

  const list=$('#engineLines');
  list.innerHTML='';
  if(!engineReady){
    const d=document.createElement('div');
    d.className='engine-line muted';
    d.textContent='Pacer fallback evaluation is active while Stockfish is unavailable.';
    list.appendChild(d);
  }else if(!engineLines.length){
    const d=document.createElement('div');
    d.className='engine-line muted';
    d.textContent='Analyzing…';
    list.appendChild(d);
  }else{
    const fen=game.fen();
    engineLines.slice(0,3).forEach(info=>{
      const whiteCp=infoToWhiteCp(info,fen);
      const perspective=(whiteCp===null?0:whiteCp)*(userColor==='w'?1:-1);
      const evalText=info.mate!==null&&info.mate!==undefined?'M'+Math.abs(info.mate):((perspective>=0?'+':'')+(perspective/100).toFixed(1));
      const row=document.createElement('div');
      row.className='engine-line';
      const e=document.createElement('span');e.className='line-eval';e.textContent=evalText;
      const pv=document.createElement('span');pv.className='line-pv';pv.textContent=pvToSan(fen,info.pv,7)||'—';
      const dep=document.createElement('span');dep.className='line-depth';dep.textContent='d'+(info.depth||'—');
      row.append(e,pv,dep);list.appendChild(row);
    });
  }

  let explanation='The position is roughly balanced.';
  const pawns=userCp/100;
  if(pawns>4) explanation='You are winning by a lot. Simplify carefully and avoid giving the opponent counterplay.';
  else if(pawns>1.5) explanation='You have a clear advantage. Look for forcing moves, safe trades, and ways to improve your worst piece.';
  else if(pawns>.5) explanation='You are a little better. Keep improving your pieces without rushing.';
  else if(pawns< -4) explanation='You are in serious trouble. Look for checks, tactical resources, and ways to create complications.';
  else if(pawns< -1.5) explanation='The bot has a clear advantage. Prioritize king safety and stop material from falling.';
  else if(pawns< -.5) explanation='You are slightly worse, but the game is very playable. Fix loose pieces and reduce threats.';
  if(engineLines[0]&&engineLines[0].pv&&engineLines[0].pv[0]){
    const best=uciToMove(game,engineLines[0].pv[0]);
    if(best) explanation+=' Stockfish prefers '+best.san+'.';
  }
  $('#engineExplanation').textContent=explanation;
}

async function refreshEngineAnalysis(){
  const serial=++engineSerial;
  renderEnginePanel();
  if(!engineReady || gameEnded) return;
  const fen=game.fen();
  try{
    const result=await stockfish.analyze(fen,{movetime:180,multiPV:3,skill:20,onInfo:(info)=>{
      if(serial!==engineSerial) return;
      engineDepth=Math.max(engineDepth||0,info.depth||0);
      renderEnginePanel();
    }});
    if(serial!==engineSerial) return;
    engineLines=result.lines||[];
    const top=engineLines[0]||result.lastInfo;
    engineEvalCp=infoToWhiteCp(top,fen);
    engineDepth=top&&top.depth||engineDepth;
    renderEval();
    renderEnginePanel();
  }catch(err){
    console.warn('Engine evaluation failed',err);
  }
}

loadProfile();
loadBots();
setupTheme();
setupTabs();
setupEvents();
renderAvatarPicker();
renderBotList();
syncBotSliders();
renderBrain();
startNewGame();
initStockfish();
