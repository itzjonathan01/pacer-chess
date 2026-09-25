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
    let v=pieceValue[p.type];
    const center = (3.5-Math.abs(c-3.5)) + (3.5-Math.abs(r-3.5));
    if(p.type==='n' || p.type==='b') v += center*4;
    if(p.type==='p'){
      const advance=p.color==='w' ? (6-r) : (r-1); v += advance*5;
    }
    score += p.color==='w' ? v : -v;
  }
  if(g.inCheck()) score += g.turn()==='w' ? -25 : 25;
  return score;
}
function styleBonus(move,bot){
  let b=0;
  const flags=move.flags||'';
  if(move.captured) b += (bot.tactics/100)*pieceValue[move.captured]*0.25;
  if(move.san.includes('+')) b += 20+(bot.aggression*.45);
  if(move.san.includes('#')) b += 100000;
  if(move.promotion) b += 500;
  if(flags.includes('k')||flags.includes('q')) b += bot.style==='defender'?45:20;
  if(bot.style==='trader'&&move.captured) b+=80;
  if(bot.style==='attacker'&&(move.san.includes('+')||move.captured)) b+=70;
  if(bot.style==='defender'&&!move.captured) b+=12;
  if(bot.style==='chaos') b+=Math.random()*120;
  return b;
}
function rankMovesFor(g,bot,color='b',limit=null){
  const moves=g.moves({verbose:true}); const scored=[];
  for(const m of moves){
    g.move(m);
    let score=evaluate(g)*(color==='w'?1:-1);
    score += styleBonus(m,bot);
    if(g.isCheckmate()) score += 100000;
    g.undo();
    scored.push({m,score});
  }
  scored.sort((a,b)=>b.score-a.score);
  return limit?scored.slice(0,limit):scored;
}
function chooseBotMove(){
  const ranked=rankMovesFor(game,currentBot,'b');
  if(!ranked.length) return null;
  const strength=currentBot.strength;
  let lookahead=0;
  if(strength>=850) lookahead=1;
  if(strength>=1400) lookahead=2;

  if(lookahead){
    for(const item of ranked.slice(0,Math.min(ranked.length,strength>=1400?10:7))){
      game.move(item.m);
      if(!game.isGameOver()){
        const replies=rankMovesFor(game,currentBot,'w',lookahead===2?6:4);
        if(replies.length){
          let replyImpact=replies[0].score;
          if(lookahead===2){
            const reply=replies[0].m; game.move(reply);
            const follow=rankMovesFor(game,currentBot,'b',4);
            if(follow.length) item.score += follow[0].score*0.18;
            game.undo();
          }
          item.score -= replyImpact*0.30;
        }
      }
      game.undo();
    }
    ranked.sort((a,b)=>b.score-a.score);
  }

  const mistakeChance=currentBot.mistakeRate/100;
  if(Math.random()<mistakeChance && ranked.length>2){
    const start=Math.min(2,ranked.length-1);
    const width=Math.max(2,Math.round(2+currentBot.randomness/13));
    const pool=ranked.slice(start,Math.min(ranked.length,start+width));
    return (pool[Math.floor(Math.random()*pool.length)]||ranked[0]).m;
  }
  const topK=clamp(Math.round((1900-strength)/260 + currentBot.randomness/28),1,8);
  const pick=Math.floor(Math.pow(Math.random(),2.2)*Math.min(topK,ranked.length));
  return ranked[pick].m;
}
function queueBotMove(){
  if(gameEnded || game.turn()!=='b') return;
  thinking=true; updateStatus(); renderBoard(); updateClocks();
  const delay=clamp(900-currentBot.strength*.35,240,760);
  setTimeout(()=>{
    if(gameEnded || game.turn()!=='b'){thinking=false;return;}
    const move=chooseBotMove();
    if(move){ const played=game.move(move); lastMove={from:played.from,to:played.to}; }
    thinking=false; renderAll(); checkGameEnd();
  },delay);
}

function reviewUserMove(before,after,move){
  const swing=after-before;
  let label='Good move'; let msg='Solid. Keep developing and watch for checks, captures, and threats.';
  if(move.san.includes('#')){label='Checkmate';msg='That ends the game. Nice finish.';coach.currentStreak++;}
  else if(move.san.includes('+')){label='Check';msg='You found a check. Now look for the opponent’s strongest reply.';coach.currentStreak++;}
  else if(swing<=-180){label='Blunder';msg='That move dropped a lot of value. Before moving, scan for enemy checks and captures.';coach.blunders++;coach.currentStreak=0;}
  else if(swing<=-85){label='Mistake';msg='That move lost some value. Check whether the moved piece or another piece became undefended.';coach.mistakes++;coach.currentStreak=0;}
  else if(move.captured){label='Capture';msg='You won or traded material. Check if the capturing piece can be taken back.';coach.currentStreak++;}
  else{coach.currentStreak++;}
  coach.bestStreak=Math.max(coach.bestStreak,coach.currentStreak);
  moveReviews.push({move:move.san,label,swing});
  if($('#learningToggle').checked){ $('#coachMessage').textContent=`${label}: ${msg}`; if(label==='Blunder'||label==='Mistake') showToast(`${label}: ${msg}`); }
  updateCoach();
}
function getHint(){
  if(thinking || gameEnded || game.turn()!=='w') return;
  const helper={...currentBot,strength:1800,tactics:100,randomness:0,mistakeRate:0,style:'balanced'};
  const ranked=rankMovesFor(game,helper,'w',5); if(!ranked.length)return;
  const m=ranked[0].m;
  let reason='improves your position';
  if(m.san.includes('#')) reason='delivers checkmate';
  else if(m.san.includes('+')) reason='gives check';
  else if(m.captured) reason=`wins or trades a ${namePiece(m.captured)}`;
  else if((m.flags||'').includes('k')||(m.flags||'').includes('q')) reason='castles your king to safety';
  else if(['n','b'].includes(m.piece)) reason='develops a piece';
  $('#coachMessage').textContent=`Hint: consider ${m.san}. It ${reason}.`;
  showToast(`Hint: ${m.san} — ${reason}.`);
}
function namePiece(t){return ({p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'})[t]||'piece';}

function renderMoves(){
  const hist=game.history(); const list=$('#moveList'); list.innerHTML='';
  if(!hist.length){list.innerHTML='<div class="status-sub" style="padding:10px">Moves will appear here.</div>';return;}
  for(let i=0;i<hist.length;i+=2){
    const row=document.createElement('div');row.className='move-row';
    const num=document.createElement('div');num.className='move-num';num.textContent=`${i/2+1}.`;
    const w=document.createElement('div');w.className='move-cell';w.textContent=hist[i]||'';
    const b=document.createElement('div');b.className='move-cell';b.textContent=hist[i+1]||'';
    if(i===hist.length-1) w.classList.add('latest'); if(i+1===hist.length-1)b.classList.add('latest');
    row.append(num,w,b);list.appendChild(row);
  }
  list.scrollTop=list.scrollHeight;
}
function capturedPieces(){
  const start={w:{p:8,n:2,b:2,r:2,q:1},b:{p:8,n:2,b:2,r:2,q:1}};
  const now={w:{p:0,n:0,b:0,r:0,q:0},b:{p:0,n:0,b:0,r:0,q:0}};
  for(const row of game.board()) for(const p of row) if(p && p.type!=='k') now[p.color][p.type]++;
  const takenByWhite=[],takenByBlack=[];
  for(const t of pieceOrder){ for(let i=0;i<start.b[t]-now.b[t];i++) takenByWhite.push(pieceGlyph['b'+t]); for(let i=0;i<start.w[t]-now.w[t];i++) takenByBlack.push(pieceGlyph['w'+t]); }
  $('#whiteCaptured').textContent=takenByWhite.join(''); $('#blackCaptured').textContent=takenByBlack.join('');
