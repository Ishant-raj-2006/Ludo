/* =====================================================================
   app.js - home page: menus, offline/AI setup dialogs, profile, hero demo.
   Offline and AI modes work without Firebase; Firebase is loaded lazily.
   ===================================================================== */
import { createBoard } from './board.js';
import * as E from './game-engine.js';
import { chooseMove } from './ai-player.js';
import { toast, esc } from './ui.js';

const $ = id => document.getElementById(id);
const COLOR_NAMES = ['Red', 'Green', 'Yellow', 'Blue'];
let auth = null;           // the auth.js module, if Firebase loaded
let userName = '';

/* ---------- Firebase (optional) ---------- */
async function loadAuth() {
  try {
    auth = await import('./auth.js');
    if (!auth.isConfigured) { $('fb-note').hidden = false; auth.onUser(() => {}); return renderUser(null); }
    auth.onUser(async u => { renderUser(u); if (u) loadStats(u); });
  } catch (e) {                // CDN blocked or offline: the home page must still work
    $('fb-note').hidden = false; $('fb-note').textContent = 'Accounts and online play are unavailable right now (no connection to Firebase). Offline and AI modes still work.';
    renderUser(null);
  }
}
function renderUser(u) {
  userName = u ? auth.displayName(u) : '';
  $('auth-area').innerHTML = u
    ? `<span class="who">${esc(userName)}</span><button class="btn ghost small" id="btn-logout">Log out</button>`
    : `<a class="btn ghost small" href="login.html">Log in</a><a class="btn primary small" href="register.html">Register</a>`;
  if (u) $('btn-logout').onclick = () => auth.logoutUser();
  $('profile-out').hidden = !!u; $('profile-in').hidden = !u;
  if (u) $('profile-name').textContent = userName;
}
async function loadStats(u) {
  try {
    const s = await auth.getStats(u.uid);
    $('st-played').textContent = s.played; $('st-wins').textContent = s.wins;
    $('st-rate').textContent = s.played ? Math.round(s.wins / s.played * 100) + '%' : '-';
  } catch (e) { /* stats are optional */ }
}

/* ---------- menu buttons ---------- */
$('btn-online').onclick = () => {
  if (auth && !auth.isConfigured) return toast('Online play needs Firebase setup. See the README.', 'error', 5000);
  location.href = 'lobby.html';
};
const dlgOffline = $('dlg-offline'), dlgAi = $('dlg-ai');
$('btn-offline').onclick = () => { buildOffline(); dlgOffline.showModal(); };
$('btn-ai').onclick = () => { buildAi(); dlgAi.showModal(); };
document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });

const colorOptions = sel => COLOR_NAMES.map((n, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${n}</option>`).join('');
const startGame = cfg => { sessionStorage.setItem('ludoConfig', JSON.stringify(cfg)); location.href = 'game.html?mode=' + cfg.mode; };

/* ---------- offline setup ---------- */
let offCount = 2;
function buildOffline() {
  const old = [...$('off-rows').querySelectorAll('.row')].map(r => ({ n: r.querySelector('input').value, c: r.querySelector('select').value }));
  const defaults = [0, 2, 1, 3];                                   // red, yellow, green, blue
  $('off-rows').innerHTML = Array.from({ length: offCount }, (_, i) =>
    `<div class="row"><input type="text" maxlength="12" aria-label="Player ${i + 1} name" value="${esc(old[i] ? old[i].n : 'Player ' + (i + 1))}">
     <select aria-label="Player ${i + 1} colour">${colorOptions(old[i] ? +old[i].c : defaults[i])}</select></div>`).join('');
  document.querySelectorAll('#off-count button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.n === offCount)));
}
document.querySelectorAll('#off-count button').forEach(b => { b.onclick = () => { offCount = +b.dataset.n; buildOffline(); }; });
$('off-start').onclick = () => {
  const rows = [...$('off-rows').querySelectorAll('.row')].map(r => ({ name: r.querySelector('input').value.trim(), color: +r.querySelector('select').value, kind: 'human' }));
  if (rows.some(r => !r.name)) return toast('Every player needs a name.', 'error');
  if (new Set(rows.map(r => r.color)).size !== rows.length) return toast('Each player needs a different colour.', 'error');
  startGame({ mode: 'offline', players: rows });
};

/* ---------- AI setup ---------- */
let aiCount = 1;
function buildAi() {
  if (!$('ai-name').value) $('ai-name').value = userName || 'You';
  if (!$('ai-color').options.length) $('ai-color').innerHTML = colorOptions(0);
  document.querySelectorAll('#ai-count button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.n === aiCount)));
}
document.querySelectorAll('#ai-count button').forEach(b => { b.onclick = () => { aiCount = +b.dataset.n; buildAi(); }; });
$('ai-start').onclick = () => {
  const name = $('ai-name').value.trim() || 'You', me = +$('ai-color').value;
  const free = [(me + 2) % 4, (me + 1) % 4, (me + 3) % 4];         // opposite colour first
  const bots = ['Asha', 'Rohan', 'Mira'];
  const players = [{ name, color: me, kind: 'human' }];
  for (let i = 0; i < aiCount; i++) players.push({ name: bots[i] + ' (AI)', color: free[i], kind: 'ai' });
  startGame({ mode: 'ai', difficulty: $('ai-level').value, players });
};

/* ---------- hero: four computer players playing on a loop ---------- */
function heroDemo() {
  const board = createBoard($('hero-board'));
  const make = () => E.createState([0, 1, 2, 3].map(c => ({ color: c, name: COLOR_NAMES[c], kind: 'ai' })));
  let s = make();
  board.render(s);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  setInterval(() => {
    if (document.hidden) return;
    if (s.phase === 'over') s = make();
    else {
      const r = E.applyRoll(s, E.rollValue());
      if (!r.skipped) E.applyMove(s, chooseMove(s, 'medium'));
    }
    board.render(s);
  }, 650);
}

heroDemo();
loadAuth();
