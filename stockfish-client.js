const LITE_JS = './vendor/stockfish/stockfish-19-lite-single.js';
const ASM_JS = './vendor/stockfish/stockfish-19-asm.js';

function withTimeout(promise, ms, label){
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label || 'Timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export class StockfishClient {
  constructor(){
    this.worker = null;
    this.ready = false;
    this.mode = 'offline';
    this.queue = Promise.resolve();
    this.current = null;
    this._uciWait = null;
    this._readyWait = null;
  }

  async init(){
    if(this.ready) return this;
    try{
      this.worker = await withTimeout(this._createWasmWorker(), 18000, 'Stockfish WASM load timed out');
      this.mode = 'Stockfish 19 Lite';
    }catch(err){
      console.warn('Stockfish WASM failed, trying ASM fallback', err);
      this.worker = await withTimeout(this._createAsmWorker(), 18000, 'Stockfish fallback load timed out');
      this.mode = 'Stockfish 19 ASM fallback';
    }

    this.worker.addEventListener('message', e => this._onMessage(String(e.data || '')));
    this.worker.addEventListener('error', e => console.error('Stockfish worker error', e));

    await this._commandAndWait('uci', 'uciok', 8000);
    this.worker.postMessage('setoption name Hash value 16');
    await this._commandAndWait('isready', 'readyok', 8000);
    this.ready = true;
    return this;
  }

  async _createWasmWorker(){
    return new Worker(LITE_JS);
  }

  async _createAsmWorker(){
    return new Worker(ASM_JS);
  }

  _onMessage(raw){
    const lines = raw.split(/\r?\n/).filter(Boolean);
    for(const line of lines){
      if(this._uciWait && line === 'uciok'){
        this._uciWait.resolve();
        this._uciWait = null;
      }
      if(this._readyWait && line === 'readyok'){
        this._readyWait.resolve();
        this._readyWait = null;
      }
      if(!this.current) continue;

      if(line.startsWith('info ')){
        const info = this._parseInfo(line);
        if(info){
          const key = info.multipv || 1;
          this.current.lines.set(key, info);
          this.current.lastInfo = info;
          if(this.current.onInfo) this.current.onInfo(info);
        }
      }else if(line.startsWith('bestmove ')){
        const parts = line.split(/\s+/);
        const bestmove = parts[1] && parts[1] !== '(none)' ? parts[1] : null;
        const result = {
          bestmove,
          lines:[...this.current.lines.values()].sort((a,b)=>(a.multipv||1)-(b.multipv||1)),
          lastInfo:this.current.lastInfo || null
        };
        const done = this.current;
        this.current = null;
        done.resolve(result);
      }
    }
  }

  _parseInfo(line){
    if(!line.includes(' score ') || !line.includes(' pv ')) return null;
    const depth = Number((line.match(/\bdepth (\d+)/)||[])[1] || 0);
    const multipv = Number((line.match(/\bmultipv (\d+)/)||[])[1] || 1);
    const cpMatch = line.match(/\bscore cp (-?\d+)/);
    const mateMatch = line.match(/\bscore mate (-?\d+)/);
    const pvMatch = line.match(/\bpv (.+)$/);
    return {
      depth,
      multipv,
      cp:cpMatch ? Number(cpMatch[1]) : null,
      mate:mateMatch ? Number(mateMatch[1]) : null,
      pv:pvMatch ? pvMatch[1].trim().split(/\s+/) : []
    };
  }

  _commandAndWait(command, token, timeoutMs){
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(new Error('Stockfish did not answer ' + token)), timeoutMs);
      const wrappedResolve = () => { clearTimeout(timer); resolve(); };
      if(token === 'uciok') this._uciWait = {resolve:wrappedResolve};
      else this._readyWait = {resolve:wrappedResolve};
      this.worker.postMessage(command);
    });
  }

  analyze(fen, options = {}){
    const job = () => this._analyzeNow(fen, options);
    const run = this.queue.then(job, job);
    this.queue = run.catch(() => {});
    return run;
  }

  async _analyzeNow(fen, options){
    if(!this.ready) throw new Error('Stockfish is not ready');
    if(this.current){
      this.worker.postMessage('stop');
      await new Promise(r => setTimeout(r, 20));
    }

    const movetime = Math.max(40, Math.min(2500, Number(options.movetime || 180)));
    const multiPV = Math.max(1, Math.min(8, Number(options.multiPV || 1)));
    const skill = Math.max(0, Math.min(20, Number(options.skill ?? 20)));

    this.worker.postMessage('setoption name Skill Level value ' + skill);
    this.worker.postMessage('setoption name MultiPV value ' + multiPV);
    this.worker.postMessage('position fen ' + fen);

    return new Promise((resolve,reject) => {
      const timeout = setTimeout(() => {
        if(this.current){
          this.worker.postMessage('stop');
          this.current = null;
        }
        reject(new Error('Stockfish search timed out'));
      }, movetime + 5000);

      this.current = {
        lines:new Map(),
        lastInfo:null,
        onInfo:options.onInfo || null,
        resolve:(result) => { clearTimeout(timeout); resolve(result); },
        reject:(err) => { clearTimeout(timeout); reject(err); }
      };
      this.worker.postMessage('go movetime ' + movetime);
    });
  }

  async bestMove(fen, options = {}){
    const result = await this.analyze(fen, options);
    return result.bestmove;
  }

  stop(){
    if(this.worker) this.worker.postMessage('stop');
  }

  terminate(){
    if(this.worker) this.worker.terminate();
    this.worker = null;
    this.ready = false;
    this.mode = 'offline';
  }
}
