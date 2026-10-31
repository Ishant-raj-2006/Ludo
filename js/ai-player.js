/* =====================================================================
   ai-player.js - the computer opponent.
   It never breaks rules: it only chooses among engine.legalMoves().
   easy   = random legal move
   medium = scores moves (capture > home > leave yard > safety > progress) + randomness
   hard   = medium scoring + looks at danger (can an opponent hit me next turn?)
   ===================================================================== */
import { legalMoves, destination, trackIndex, SAFE_CELLS, HOME, cloneState, applyMove } from './game-engine.js';

export const LEVELS = ['easy', 'medium', 'hard'];

/** How many opponent tokens are 1-6 steps behind this token (and able to reach it)? */
function danger(state, p, progress) {
  const cell = trackIndex(state.players[p].color, progress);
  if (cell < 0 || SAFE_CELLS.has(cell)) return 0;
  let n = 0;
  state.players.forEach((pl, q) => {
    if (q === p) return;
    state.tokens[q].forEach(pr => {
      const c = trackIndex(pl.color, pr);
      if (c < 0) return;
      const dist = (cell - c + 52) % 52;
      if (dist >= 1 && dist <= 6 && dist <= 50 - pr) n++;
    });
  });
  return n;
}

function scoreMove(state, t, level, rng) {
  const p = state.turn;
  const from = state.tokens[p][t];
  const to = destination(from, state.dice);
  const after = cloneState(state);
  const res = applyMove(after, t);          // simulate on a copy

  let s = 0;
  s += res.captured.length * 100;
  res.captured.forEach(c => { s += Math.max(0, state.tokens[c.p][c.t]) * 0.6; }); // hurting a far-advanced token is better
  if (to === HOME) s += 80;
  if (from === -1) s += 45;
  if (to >= 51 && from < 51) s += 25;        // entering the safe home lane
  const cell = trackIndex(state.players[p].color, to);
  if (cell >= 0 && SAFE_CELLS.has(cell)) s += 20;
  s += to * 0.3;                              // general progress

  if (level === 'hard') {
    s -= danger(after, p, to) * 40;           // don't step into danger
    s += danger(state, p, from) * 35;         // run away from danger
    s += from * 0.1;
    s += rng() * 2;
  } else {
    s += rng() * 12;                          // medium is a bit careless
  }
  return s;
}

/** Returns token index to move, or -1 if no legal move. */
export function chooseMove(state, level = 'medium', rng = Math.random) {
  const legal = legalMoves(state);
  if (!legal.length) return -1;
  if (legal.length === 1) return legal[0];
  if (level === 'easy') return legal[Math.floor(rng() * legal.length)];
  let best = legal[0], bestScore = -Infinity;
  for (const t of legal) {
    const sc = scoreMove(state, t, level, rng);
    if (sc > bestScore) { bestScore = sc; best = t; }
  }
  return best;
}
