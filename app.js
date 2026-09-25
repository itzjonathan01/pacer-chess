import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';

const $ = (s) => document.querySelector(s);
const boardEl = $('#board');
const pieceGlyph = {
  wp:'♙', wn:'♘', wb:'♗', wr:'♖', wq:'♕', wk:'♔',
  bp:'♟', bn:'♞', bb:'♝', br:'♜', bq:'♛', bk:'♚'
};
const pieceValue = { p:100, n:320, b:330, r:500, q:900, k:0 };
const pieceOrder = ['q','r','b','n','p'];
const avatars = ['🤖','🧠','🦊','🐉','👑','🥷','🦉','⚡','🧊','🔥'];
const STORAGE_KEY = 'pacerChessBotsV02';

const defaultBots = [
  { id:'beginner', name:'Pacer Beginner', avatar:'🤖', strength:500, aggression:50, tactics:45, randomness:35, mistakeRate:24, style:'balanced', locked:true },
  { id:'gambler', name:'The Gambler', avatar:'🔥', strength:750, aggression:92, tactics:70, randomness:45, mistakeRate:18, style:'attacker', locked:true },
  { id:'wall', name:'The Wall', avatar:'🧊', strength:900, aggression:18, tactics:62, randomness:15, mistakeRate:12, style:'defender', locked:true },
  { id:'chaos', name:'Chaos Bot', avatar:'⚡', strength:650, aggression:78, tactics:48, randomness:90, mistakeRate:28, style:'chaos', locked:true }
];

let game = new Chess();
let selected = null;
let legalMoves = [];
let lastMove = null;
let flipped = false;
let thinking = false;
let resigned = false;
let gameEnded = false;
let timers = { w:600, b:600 };
let timerHandle = null;
let clockEnabled = true;
let currentBot = null;
let bots = [];
let selectedAvatar = '🤖';
let coach = { mistakes:0, blunders:0, bestStreak:0, currentStreak:0, lastEval:0 };
let moveReviews = [];
let toastTimer = null;

function loadBots(){
  try{
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    bots = [...defaultBots, ...saved.filter(b => !defaultBots.some(d => d.id === b.id))];
  }catch{
    bots = [...defaultBots];
  }
  currentBot = bots[0];
}
function saveCustomBots(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bots.filter(b => !b.locked)));
}
function uid(){ return 'bot-' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
function showToast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2200);
}

function boardSquares(){
  const ranks = flipped ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];
  const files = flipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'];
  const out=[];
  for(const r of ranks) for(const f of files) out.push(`${f}${r}`);
  return out;
}
function squareColor(sq){
  const file='abcdefgh'.indexOf(sq[0]); const rank=Number(sq[1])-1;
  return ((file+rank)%2===0)?'dark':'light';
}
function renderBoard(){
  boardEl.innerHTML='';
  const checkSq = getCheckedKingSquare();
  for(const sq of boardSquares()){
    const p = game.get(sq);
    const btn = document.createElement('button');
    btn.type='button'; btn.className=`square ${squareColor(sq)}`; btn.dataset.square=sq;
    btn.setAttribute('role','gridcell');
    if(lastMove && (lastMove.from===sq || lastMove.to===sq)) btn.classList.add('last');
    if(selected===sq) btn.classList.add('selected');
    if(checkSq===sq) btn.classList.add('in-check');
    const lm=legalMoves.find(m=>m.to===sq);
    if(lm) btn.classList.add(p ? 'capture':'legal');

    if(p){
      const span=document.createElement('span');
      span.className='piece'; span.textContent=pieceGlyph[p.color+p.type];
      span.draggable = p.color === 'w' && game.turn()==='w' && !thinking && !gameEnded;
      span.dataset.from=sq;
      span.addEventListener('dragstart',e=>{
        if(!span.draggable){e.preventDefault();return;}
        e.dataTransfer.setData('text/plain',sq); e.dataTransfer.effectAllowed='move';
        selectSquare(sq);
      });
      btn.appendChild(span);
      btn.setAttribute('aria-label',`${p.color==='w'?'White':'Black'} ${p.type} on ${sq}`);
    } else btn.setAttribute('aria-label',`Empty ${sq}`);

    const displayFile = flipped ? 'hgfedcba'.indexOf(sq[0]) : 'abcdefgh'.indexOf(sq[0]);
    const displayRankIndex = flipped ? Number(sq[1])-1 : 8-Number(sq[1]);
    if(displayFile===0){ const c=document.createElement('span');c.className='coord rank';c.textContent=sq[1];btn.appendChild(c); }
    if(displayRankIndex===7){ const c=document.createElement('span');c.className='coord file';c.textContent=sq[0];btn.appendChild(c); }

    btn.addEventListener('click',()=>handleSquareClick(sq));
    btn.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';});
    btn.addEventListener('drop',e=>{e.preventDefault();const from=e.dataTransfer.getData('text/plain'); if(from) tryUserMove(from,sq);});
    boardEl.appendChild(btn);
  }
}

function selectSquare(sq){
  if(thinking || gameEnded || game.turn()!=='w') return;
  const p=game.get(sq);
  if(p && p.color==='w'){
    selected=sq; legalMoves=game.moves({square:sq,verbose:true});
  } else { selected=null; legalMoves=[]; }
  renderBoard();
}
function handleSquareClick(sq){
  if(thinking || gameEnded || game.turn()!=='w') return;
  if(selected && legalMoves.some(m=>m.to===sq)){ tryUserMove(selected,sq); return; }
  selectSquare(sq);
}
function tryUserMove(from,to){
  if(thinking || gameEnded || game.turn()!=='w') return;
  const before = evaluate(game);
  let move;
  try{ move=game.move({from,to,promotion:'q'}); }catch{ move=null; }
  if(!move){ selectSquare(from); return; }
  selected=null;legalMoves=[];lastMove={from:move.from,to:move.to};
  const after = evaluate(game);
  reviewUserMove(before,after,move);
  renderAll();
  if(checkGameEnd()) return;
  queueBotMove();
}

function evaluate(g){
  let score=0;
  const board=g.board();
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=board[r][c]; if(!p) continue;
