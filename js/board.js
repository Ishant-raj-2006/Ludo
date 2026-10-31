/* =====================================================================
   board.js - draws the 15x15 Ludo board with HTML/CSS and moves tokens.
   Coordinates are (row, col) on a 15x15 grid. Tokens are absolutely
   positioned with percentages, so CSS transitions animate every hop.
   ===================================================================== */
import { COLORS, START, SAFE_CELLS, LANE_FIRST, HOME, movePath } from './game-engine.js';

// The 52 shared track cells, clockwise, starting at RED's start cell.
export const TRACK = [
  [6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],[0,8],
  [1,8],[2,8],[3,8],[4,8],[5,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],[8,14],
  [8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],[14,6],
  [13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],[6,0]
];
// 5-cell coloured home lanes, in walking order (red, green, yellow, blue)
export const LANES = [
  [[7,1],[7,2],[7,3],[7,4],[7,5]],
  [[1,7],[2,7],[3,7],[4,7],[5,7]],
  [[7,13],[7,12],[7,11],[7,10],[7,9]],
  [[13,7],[12,7],[11,7],[10,7],[9,7]]
];
const YARDS = [[0,0],[0,9],[9,9],[9,0]];   // top-left cell of each 6x6 yard
const OFFSETS = [[-.2,-.2],[.2,.2],[-.2,.2],[.2,-.2]];
const DIRS = [[-1,0],[0,-1],[1,0],[0,1]];  // where each colour's home triangle points from the centre

const sleep = ms => new Promise(r => setTimeout(r, ms));
const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Position (in cell units, 0..15) of a token with given colour/progress. */
export function tokenXY(color, progress, t) {
  if (progress === -1) {
    const [r, c] = YARDS[color];
    return { x: c + (t % 2 ? 4 : 2), y: r + (t < 2 ? 2 : 4), scale: 1, z: 1 };
  }
  if (progress === HOME) {
    const [dx, dy] = DIRS[color];
    const k = (t - 1.5) * 0.3;
    return { x: 7.5 + dx * 0.85 + Math.abs(dy) * k, y: 7.5 + dy * 0.85 + Math.abs(dx) * k, scale: 0.55, z: 2 };
  }
  const [r, c] = progress >= LANE_FIRST
    ? LANES[color][progress - LANE_FIRST]
    : TRACK[(START[color] + progress) % 52];
  return { x: c + 0.5, y: r + 0.5, scale: 1, z: 3, cell: true };
}

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

export function createBoard(root) {
  root.innerHTML = '';
  root.classList.add('board');
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'Ludo board');

  // 1. Yards (four coloured corners)
  YARDS.forEach(([r, c], i) => {
    const y = el('div', 'yard y' + i);
    y.style.gridArea = `${r + 1} / ${c + 1} / span 6 / span 6`;
    y.innerHTML = '<div class="yard-box"><i></i><i></i><i></i><i></i></div>';
    root.append(y);
  });
  // 2. Track cells
  const addCell = (r, c, cls) => {
    const d = el('div', 'cell ' + cls);
    d.style.gridArea = `${r + 1} / ${c + 1}`;
    root.append(d);
    return d;
  };
  TRACK.forEach(([r, c], i) => {
    let cls = 'track';
    const owner = START.indexOf(i);
    if (owner >= 0) cls += ' start c' + owner;
    if (SAFE_CELLS.has(i)) cls += ' safe';
    addCell(r, c, cls);
  });
  LANES.forEach((lane, ci) => lane.forEach(([r, c]) => addCell(r, c, 'lane c' + ci)));
  // 3. Centre triangles
  const centre = el('div', 'centre');
  centre.style.gridArea = '7 / 7 / span 3 / span 3';
  root.append(centre);
  // 4. Token layer
  const layer = el('div', 'tokens');
  root.append(layer);

  const els = new Map();          // "p-t" -> element
  let picker = null;              // resolve function while waiting for a click

  function getEl(p, t, colorName) {
    const key = p + '-' + t;
    let e = els.get(key);
    if (!e) {
      e = el('button', 'token');
      e.type = 'button';
      e.tabIndex = -1;
      e.dataset.p = p; e.dataset.t = t;
      e.addEventListener('click', () => { if (e.classList.contains('movable') && picker) picker(t); });
      layer.append(e);
      els.set(key, e);
    }
    e.dataset.color = colorName;
    e.setAttribute('aria-label', `${colorName} token ${t + 1}`);
    return e;
  }
  function place(e, pos) {
    e.style.left = (pos.x / 15 * 100) + '%';
    e.style.top = (pos.y / 15 * 100) + '%';
    e.style.setProperty('--s', pos.scale || 1);
    e.style.zIndex = pos.z || 1;
  }

  /** Draw all tokens for a state (jumps/transitions to final positions). */
  function render(state) {
    const items = [], groups = new Map(), alive = new Set();
    state.players.forEach((pl, p) => state.tokens[p].forEach((prog, t) => {
      const pos = tokenXY(pl.color, prog, t);
      items.push({ p, t, color: pl.color, pos });
      if (pos.cell) {
        const k = pos.x + ',' + pos.y;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(items.length - 1);
      }
    }));
    groups.forEach(list => {            // several tokens on one cell: spread them out
      if (list.length > 1) list.forEach((idx, n) => {
        const it = items[idx], o = OFFSETS[n % 4];
        it.pos = { ...it.pos, x: it.pos.x + o[0], y: it.pos.y + o[1], scale: 0.68 };
      });
    });
    items.forEach(it => { alive.add(it.p + '-' + it.t); place(getEl(it.p, it.t, COLORS[it.color]), it.pos); });
    els.forEach((e, k) => { if (!alive.has(k)) { e.remove(); els.delete(k); } });
  }

  /** Hop a token along its path. `mv` = {p,t,from,to}. */
  async function animateMove(state, mv, onStep) {
    const color = state.players[mv.p].color;
    const e = getEl(mv.p, mv.t, COLORS[color]);
    e.classList.add('hopping');
    for (const prog of movePath(mv.from, mv.to)) {
      const pos = tokenXY(color, prog, mv.t);
      pos.z = 9;
      place(e, pos);
      if (onStep) onStep();
      await sleep(reduce() ? 40 : 170);
    }
    e.classList.remove('hopping');
  }

  function clearHighlight() { els.forEach(e => { e.classList.remove('movable'); e.tabIndex = -1; }); }
  /** Highlight tokens and resolve with the token index the player clicks. */
  function pick(p, list) {
    return new Promise(resolve => {
      clearHighlight();
      list.forEach(t => { const e = els.get(p + '-' + t); if (e) { e.classList.add('movable'); e.tabIndex = 0; } });
      picker = t => { if (!list.includes(t)) return; picker = null; clearHighlight(); resolve(t); };
    });
  }
  function cancelPick() { picker = null; clearHighlight(); }

  return { render, animateMove, pick, cancelPick };
}
