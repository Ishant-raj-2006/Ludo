/* =====================================================================
   game-engine.js  -  PURE Ludo rules. No DOM, no Firebase.
   Used by offline, AI and online modes so the rules are IDENTICAL everywhere.

   TOKEN PROGRESS (per token):
     -1        = in the yard
      0..50    = on the shared 52-cell track (0 = that colour's start cell)
      51..55   = coloured home lane (5 cells)
      56       = HOME (finished)

   CHOSEN RULES
   1. A 6 is needed to bring a token out of the yard (it lands on the start cell).
   2. Exact roll needed to reach HOME (56). Too-big rolls make that token unmovable.
   3. Landing on an opponent token on a NON-safe cell captures it
      (all opponent tokens on that cell go back to their yard).
   4. Safe cells = the 4 start cells + the 4 star cells. No captures there.
   5. Extra turn after: rolling a 6, capturing, or getting a token HOME.
   6. Three 6s in a row = turn is lost (no move is made on the third six).
   7. No legal move = turn passes automatically.
   8. No blockades. Same-colour tokens may share a cell.
   9. First player to bring all 4 tokens HOME wins; the game ends immediately.
   ===================================================================== */

export const COLORS = ['red', 'green', 'yellow', 'blue']; // clockwise
export const START = [0, 13, 26, 39];                     // track index of each colour's start cell
export const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const TRACK_LEN = 52;
export const LANE_FIRST = 51;
export const HOME = 56;

/** Map a colour + progress to a track cell (0..51), or -1 if not on the shared track. */
export function trackIndex(color, progress) {
  if (progress < 0 || progress > 50) return -1;
  return (START[color] + progress) % TRACK_LEN;
}

/** players = [{ color:0-3, name, kind:'human'|'ai', uid? }] ordered by turn order. */
export function createState(players) {
  return {
    players: players.map(p => ({ ...p })),
    tokens: players.map(() => [-1, -1, -1, -1]),
    turn: 0,            // index into players
    dice: 0,            // last dice value (0 = none yet)
    phase: 'roll',      // 'roll' | 'move' | 'over'
    sixStreak: 0,
    winner: -1,
    rev: 0,             // increases by 1 on every action (used by online sync)
    ev: 'start',        // last event: start | roll | move | skip
    last: null          // last move {p,t,from,to,rev}
  };
}

export const cloneState = s => JSON.parse(JSON.stringify(s));
export const rollValue = (rng = Math.random) => 1 + Math.floor(rng() * 6);

/** Where would a token with `progress` land with `dice`? null = illegal. */
export function destination(progress, dice) {
  if (progress === -1) return dice === 6 ? 0 : null;
  if (progress === HOME) return null;
  const to = progress + dice;
  return to <= HOME ? to : null;
}

/** Indexes (0-3) of tokens the current player may move. */
export function legalMoves(state) {
  if (state.phase !== 'move') return [];
  const out = [];
  state.tokens[state.turn].forEach((pr, t) => {
    if (destination(pr, state.dice) !== null) out.push(t);
  });
  return out;
}

/** List of progress values a token passes through (for hop animation). */
export function movePath(from, to) {
  if (from === -1) return [0];
  const a = [];
  for (let i = from + 1; i <= to; i++) a.push(i);
  return a;
}

export function nextTurn(state) {
  state.turn = (state.turn + 1) % state.players.length;
  state.phase = 'roll';
  state.sixStreak = 0;
}

/** Apply a dice roll. Returns { value, legal, skipped: null|'no-moves'|'three-sixes' }. */
export function applyRoll(state, value) {
  if (state.phase !== 'roll') throw new Error('Not allowed to roll now');
  if (!(value >= 1 && value <= 6)) throw new Error('Bad dice value');
  state.dice = value;
  state.ev = 'roll';
  state.last = null;
  state.rev++;
  state.sixStreak = value === 6 ? state.sixStreak + 1 : 0;
  if (state.sixStreak >= 3) {          // rule 6
    nextTurn(state);
    return { value, legal: [], skipped: 'three-sixes' };
  }
  state.phase = 'move';
  const legal = legalMoves(state);
  if (!legal.length) {                 // rule 7
    nextTurn(state);
    return { value, legal, skipped: 'no-moves' };
  }
  return { value, legal, skipped: null };
}

/** Move token t of the current player. Throws on illegal moves. */
export function applyMove(state, t) {
  if (state.phase !== 'move') throw new Error('Not allowed to move now');
  const p = state.turn;
  const from = state.tokens[p][t];
  const to = destination(from, state.dice);
  if (to === null) throw new Error('Illegal move');

  state.tokens[p][t] = to;
  state.rev++;
  state.ev = 'move';

  // capture (rule 3 + 4)
  const captured = [];
  const cell = trackIndex(state.players[p].color, to);
  if (cell >= 0 && !SAFE_CELLS.has(cell)) {
    state.players.forEach((pl, q) => {
      if (q === p) return;
      state.tokens[q].forEach((pr, j) => {
        if (trackIndex(pl.color, pr) === cell) { state.tokens[q][j] = -1; captured.push({ p: q, t: j }); }
      });
    });
  }
  state.last = { p, t, from, to, rev: state.rev };

  const reachedHome = to === HOME;
  const won = state.tokens[p].every(x => x === HOME);
  if (won) { state.phase = 'over'; state.winner = p; }
  else if (state.dice === 6 || captured.length || reachedHome) { state.phase = 'roll'; } // rule 5
  else nextTurn(state);

  return { p, t, from, to, captured, reachedHome, won,
           extraTurn: state.phase === 'roll' && state.turn === p };
}

/** Skip the current player's turn (used when a player is disconnected). */
export function passTurn(state) {
  nextTurn(state);
  state.ev = 'skip';
  state.last = null;
  state.rev++;
}

export const homeCount = (state, p) => state.tokens[p].filter(x => x === HOME).length;
