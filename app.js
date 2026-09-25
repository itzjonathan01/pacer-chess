import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';

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
    rating:400, games:0, wins:0, losses:0, draws:0,
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

function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
function opposite(c){ return c === 'w' ? 'b' : 'w'; }
function colorName(c){ return c === 'w' ? 'White' : 'Black'; }

function loadProfile(){
  try{
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    profile = Object.assign(freshProfile(), saved || {});
    profile.intents = Object.assign({}, freshProfile().intents, saved && saved.intents ? saved.intents : {});
    profile.nemesis = Object.assign({}, freshProfile().nemesis, saved && saved.nemesis ? saved.nemesis : {});
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
  let move = null;
  try{ move = game.move({from:from,to:to,promotion:'q'}); }catch{}
  if(!move){ selectSquare(from); return; }

  selected = null;
  legalMoves = [];
  lastMove = {from:move.from,to:move.to};

  const after = evaluate(game);
  reviewUserMove(before,after,move);
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
function queueBotMove(){
  if(gameEnded || game.turn() !== botColor) return;
  thinking = true;
  updateStatus();
  renderBoard();
  updateClocks();

  const delay = clamp(900-currentBot.strength*.3,230,720);
  setTimeout(() => {
    if(gameEnded || game.turn() !== botColor){ thinking=false; return; }
    const move = chooseBotMove();
    if(move){
      const played = game.move(move);
      lastMove = {from:played.from,to:played.to};
    }
    thinking = false;
    renderAll();
    checkGameEnd();
  },delay);
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
function reviewUserMove(before,after,move){
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
  moveReviews.push({move:move.san,label:label,swing:swing,intent:intent});

  if($('#learningToggle').checked){
    $('#coachMessage').textContent = label + ': ' + msg;
    if(label === 'Blunder' || label === 'Mistake') showToast(label + ': ' + msg);
  }
  updateCoach();
}
function getHint(){
  if(!isUserTurn()) return;
  const helper = Object.assign({},currentBot,{strength:2000,tactics:100,position:100,randomness:0,mistakeRate:0,style:'balanced',risk:45});
  const ranked = rankMovesFor(game,helper,userColor,5);
  if(!ranked.length) return;

  const m = ranked[0].m;
  let reason = 'improves your position';
  if(m.san.includes('#')) reason = 'delivers checkmate';
  else if(m.san.includes('+')) reason = 'gives check';
  else if(m.captured) reason = 'wins or trades a ' + namePiece(m.captured);
  else if((m.flags||'').includes('k') || (m.flags||'').includes('q')) reason = 'gets your king safer';
  else if(m.piece === 'n' || m.piece === 'b') reason = 'develops a piece';

  $('#coachMessage').textContent = 'Hint: consider ' + m.san + '. It ' + reason + '.';
  showToast('Hint: ' + m.san + ' — ' + reason + '.');
}
function namePiece(t){
  return ({p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'})[t] || 'piece';
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
  const cp = evaluate(game);
  const pawns = cp/100;
  const whitePct = clamp(50 + pawns*5.2,8,92);
  const blackPct = 100-whitePct;
  $('#evalWhite').style.height = whitePct + '%';
  $('#evalBlack').style.height = blackPct + '%';

  const userEval = pawns * (userColor === 'w' ? 1 : -1);
  $('#evalText').textContent = (userEval>=0?'+':'') + userEval.toFixed(1);
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

  $('#botSideLabel').textContent=colorName(botColor).toUpperCase();
  $('#userSideLabel').textContent=colorName(userColor).toUpperCase();
  $('#userRating').textContent=profile.rating;
  $('#headerElo').textContent=profile.rating;
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

  game=new Chess();
  selected=null;
  legalMoves=[];
  lastMove=null;
  thinking=false;
  gameEnded=false;
  ratingApplied=false;
  moveReviews=[];
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

  if(game.turn()===botColor) setTimeout(queueBotMove,350);
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
  if(ratingApplied) return 0;
  ratingApplied=true;

  const opponentRating=currentBot.strength;
  const delta=eloDelta(opponentRating,result);
  profile.rating=clamp(profile.rating+delta,100,3000);
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
  return delta;
}
function finishGame(reason,result,title,icon){
  gameEnded=true;
  thinking=false;
  clearInterval(timerHandle);
  timerHandle=null;

  const delta=recordGame(result);
  renderAll();

  $('#gameOverIcon').textContent=icon;
  $('#gameOverTitle').textContent=title;
  $('#gameOverReason').textContent=reason;
  $('#summaryMistakes').textContent=coach.mistakes;
  $('#summaryBlunders').textContent=coach.blunders;
  $('#summaryMoves').textContent=Math.ceil(game.history().length/2);
  $('#summaryOpponent').textContent=currentBot.strength;
  $('#ratingAfter').textContent=profile.rating;
  $('#ratingDelta').textContent=(delta>=0?'+':'')+delta;
  $('#ratingDelta').style.color=delta>=0?'#a9da73':'#e58a82';

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

function setupTabs(){
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click',() => {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active',t===tab));
    $('#gameTab').classList.toggle('active',tab.dataset.tab==='game');
    $('#coachTab').classList.toggle('active',tab.dataset.tab==='coach');
    $('#brainTab').classList.toggle('active',tab.dataset.tab==='brain');
  }));
}
function applyTheme(mode){
  const light=mode==='light';
  document.body.classList.toggle('light-mode',light);
  const toggle=$('#darkModeToggle');
  if(toggle) toggle.checked=!light;
}
function setupTheme(){
  applyTheme(localStorage.getItem(THEME_KEY)||'dark');
}
function setupEvents(){
  $('#newGameBtn').addEventListener('click',startNewGame);
  $('#takebackBtn').addEventListener('click',takeback);
  $('#hintBtn').addEventListener('click',getHint);
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

  $('#botManagerBtn').addEventListener('click',() => {
    loadBotIntoEditor(currentBot);
    renderBotList();
    $('#botDialog').showModal();
  });
  $('#playNemesisBtn').addEventListener('click',() => {
    const bot=bots.find(b=>b.id==='nemesis');
    if(bot) chooseBot(bot);
  });

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
