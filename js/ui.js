/* =====================================================================
   ui.js - shared UI helpers: sounds, toasts, confirm dialog, and the
   game-screen controller (players bar, dice button, result screen).
   ===================================================================== */
import { COLORS, homeCount } from './game-engine.js';
import { createBoard } from './board.js';
import { createDice } from './dice.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc };

/* ---------- sound (synthesised with WebAudio, so no audio files needed) ---------- */
let audio = null, muted = false;
try { muted = localStorage.getItem('ludo-muted') === '1'; } catch (e) { /* storage blocked */ }
function tone(freq, dur, type = 'sine', vol = 0.12, delay = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audio.currentTime + delay, o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) { /* audio not available */ }
}
export const sfx = {
  roll()    { [0, .08, .16, .24].forEach((d, i) => tone(300 + i * 40, .05, 'square', .06, d)); },
  step()    { tone(620, .05, 'triangle', .1); },
  capture() { tone(220, .18, 'sawtooth', .12); tone(140, .25, 'sawtooth', .12, .1); },
  home()    { tone(660, .12, 'sine', .12); tone(880, .18, 'sine', .12, .12); },
  win()     { [523, 659, 784, 1047].forEach((f, i) => tone(f, .25, 'triangle', .14, i * .15)); }
};
export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('ludo-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  return muted;
}

/* ---------- toasts ---------- */
export function toast(msg, type = 'info', ms = 3500) {
  let host = $('toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.setAttribute('aria-live', 'polite'); document.body.append(host); }
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  host.append(t);
  setTimeout(() => t.remove(), ms);
}

/* ---------- modal helpers ---------- */
function openModal(html) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-back';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.append(wrap);
  const first = wrap.querySelector('button'); if (first) first.focus();
  return wrap;
}
export function confirmDialog(message, { ok = 'Yes', cancel = 'Cancel' } = {}) {
  return new Promise(resolve => {
    const w = openModal(`<p>${esc(message)}</p><div class="modal-actions"><button class="btn ghost" data-r="0">${esc(cancel)}</button><button class="btn primary" data-r="1">${esc(ok)}</button></div>`);
    w.addEventListener('click', e => {
      const b = e.target.closest('button[data-r]'); if (!b) return;
      w.remove(); resolve(b.dataset.r === '1');
    });
  });
}

/* ---------- game screen controller ---------- */
export function createGameUI() {
  const board = createBoard($('board'));
  const dice = createDice($('dice'));
  const rollBtn = $('btn-roll');
  let onRoll = null;
  rollBtn.addEventListener('click', () => { if (!rollBtn.disabled && onRoll) onRoll(); });

  const muteBtn = $('btn-mute');
  const paintMute = () => { muteBtn.textContent = isMuted() ? 'Sound off' : 'Sound on'; muteBtn.setAttribute('aria-pressed', String(isMuted())); };
  muteBtn.addEventListener('click', () => { toggleMute(); paintMute(); });
  paintMute();

  return {
    board, dice,
    onRoll(fn) { onRoll = fn; },
    waitRoll() { return new Promise(res => { onRoll = () => { onRoll = null; res(); }; }); },
    setRoll(enabled, label) { rollBtn.disabled = !enabled; rollBtn.textContent = label || 'Roll dice'; rollBtn.classList.toggle('pulse', enabled); },
    setTurn(text, colorIdx) {
      $('turn-text').textContent = text;
      document.body.dataset.turn = colorIdx === undefined ? '' : COLORS[colorIdx];
      dice.setColor(colorIdx === undefined ? '' : COLORS[colorIdx]);
    },
    setMsg(text) { $('msg').textContent = text || ''; },
    setRoomInfo(text) { $('room-info').textContent = text || ''; },
    /** opts: { meUid, offline:Set<uid> } */
    setPlayers(state, opts = {}) {
      $('players').innerHTML = state.players.map((pl, i) => {
        const off = opts.offline && opts.offline.has(pl.uid);
        const me = opts.meUid && pl.uid === opts.meUid;
        return `<div class="chip c${pl.color}${i === state.turn && state.phase !== 'over' ? ' active' : ''}${off ? ' off' : ''}">
          <span class="dot"></span>
          <span class="chip-name">${esc(pl.name)}${me ? ' (you)' : ''}${pl.kind === 'ai' ? ' <small>AI</small>' : ''}${off ? ' <small>offline</small>' : ''}</span>
          <span class="chip-home" title="Tokens home">${homeCount(state, i)}/4 home</span></div>`;
      }).join('');
    },
    showResult({ title, text, buttons }) {
      const w = openModal(`<h2>${esc(title)}</h2><p>${esc(text || '')}</p><div class="modal-actions">${
        buttons.map((b, i) => `<button class="btn ${b.primary ? 'primary' : 'ghost'}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>`);
      w.classList.add('result');
      w.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) buttons[+b.dataset.i].onClick(); });
    },
    fatal(msg, linkHref = 'index.html', linkText = 'Back to home') {
      $('msg').textContent = '';
      openModal(`<h2>Cannot start the game</h2><p>${esc(msg)}</p><div class="modal-actions"><a class="btn primary" href="${linkHref}">${esc(linkText)}</a></div>`);
    },
    toast, confirm: confirmDialog
  };
}
