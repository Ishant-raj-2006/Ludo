/* =====================================================================
   lobby.js - create/join a room, wait for friends, ready up, start.
   ===================================================================== */
import { db, isConfigured, ref, get, set, update, remove, onValue, runTransaction, serverTimestamp } from './firebase-config.js';
import { currentUserReady, displayName, friendlyError } from './auth.js';
import { toast, confirmDialog, esc } from './ui.js';
import { SEAT_ORDER, SEAT_NAMES, seatMap, seatOf, watchPresence, initialGame } from './room-utils.js';

const $ = id => document.getElementById(id);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I confusion
const genCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

let me, myName, code = null, room = null, stopRoom = null, stopPresence = null, leaving = false;

async function init() {
  if (!isConfigured) { $('config-warning').hidden = false; $('view-start').hidden = true; return; }
  const user = await currentUserReady();
  if (!user) { location.href = 'login.html?next=' + encodeURIComponent('lobby.html' + location.search); return; }
  me = user.uid; myName = displayName(user);
  $('who').textContent = myName;
  $('btn-create').onclick = createRoom;
  $('join-form').onsubmit = e => { e.preventDefault(); joinRoom($('join-code').value); };
  const c = new URLSearchParams(location.search).get('room');
  if (c) joinRoom(c); else $('view-start').hidden = false;
}

function busy(b) { document.querySelectorAll('#view-start button').forEach(x => { x.disabled = b; }); }
function showError(msg) { const e = $('start-error'); e.textContent = msg; e.hidden = !msg; }

async function createRoom() {
  showError(''); busy(true);
  try {
    for (let i = 0; i < 5; i++) {
      const c = genCode();
      if ((await get(ref(db, `rooms/${c}`))).exists()) continue;
      await set(ref(db, `rooms/${c}`), {
        meta: { host: me, status: 'waiting', createdAt: serverTimestamp() },
        seats: { [SEAT_ORDER[0]]: me },
        players: { [me]: { name: myName, ready: true, online: true } }
      });
      return enterRoom(c);
    }
    showError('Could not find a free room code. Try again.');
  } catch (e) { showError(friendlyError(e)); }
  busy(false);
}

async function joinRoom(raw) {
  const c = String(raw || '').trim().toUpperCase();
  showError('');
  if (!/^[A-Z0-9]{6}$/.test(c)) return showError('Room codes have 6 letters/numbers.');
  busy(true);
  try {
    const snap = await get(ref(db, `rooms/${c}`));
    if (!snap.exists()) { busy(false); return showError('No room with that code.'); }
    const r = snap.val();
    if (seatOf(r, me) < 0) {                                  // new player: claim a seat
      if (r.meta.status !== 'waiting') { busy(false); return showError('That game has already started.'); }
      let got = false;
      for (const seat of SEAT_ORDER) {
        const res = await runTransaction(ref(db, `rooms/${c}/seats/${seat}`), cur => (cur === null ? me : undefined));
        if (res.committed && res.snapshot.val() === me) { got = true; break; }
      }
      if (!got) { busy(false); return showError('This room is full (4 players).'); }
      await set(ref(db, `rooms/${c}/players/${me}`), { name: myName, ready: false, online: true });
    }
    enterRoom(c);
  } catch (e) { busy(false); showError(friendlyError(e)); }
}

function enterRoom(c) {
  code = c;
  history.replaceState(null, '', 'lobby.html?room=' + c);
  $('view-start').hidden = true; $('view-room').hidden = false;
  $('room-code').textContent = c;
  stopPresence = watchPresence(c, me);
  stopRoom = onValue(ref(db, `rooms/${c}`), snap => {
    room = snap.val();
    if (!room) { if (!leaving) toast('The host closed this room.', 'error'); return goStart(); }
    if (room.meta.status === 'playing') { location.href = `game.html?mode=online&room=${c}`; return; }
    renderRoom();
  }, err => { toast(friendlyError(err), 'error'); goStart(); });
  // when (re)entering the lobby, non-hosts start un-ready
  get(ref(db, `rooms/${c}/meta/host`)).then(s => { if (s.val() !== me) update(ref(db, `rooms/${c}/players/${me}`), { ready: false }).catch(() => {}); });
}

function goStart() {
  if (stopRoom) stopRoom(); if (stopPresence) stopPresence();
  stopRoom = stopPresence = null; code = room = null;
  history.replaceState(null, '', 'lobby.html');
  $('view-room').hidden = true; $('view-start').hidden = false; busy(false);
}

function renderRoom() {
  const seats = seatMap(room), isHost = room.meta.host === me, status = room.meta.status;
  $('seat-list').innerHTML = [0, 1, 2, 3].map(s => {
    const uid = seats[s], p = uid && room.players && room.players[uid];
    if (!p) return `<li class="seat empty c${s}"><span class="dot"></span><span>${SEAT_NAMES[s]} seat is open</span></li>`;
    const state = uid === room.meta.host ? 'Host' : p.ready ? 'Ready' : 'Not ready';
    return `<li class="seat c${s}${p.ready ? ' ready' : ''}${p.online === false ? ' off' : ''}"><span class="dot"></span>
      <span class="seat-name">${esc(p.name)}${uid === me ? ' (you)' : ''}</span>
      <span class="seat-state">${p.online === false ? 'Offline' : state}</span></li>`;
  }).join('');

  const count = Object.keys(seats).length;
  const others = Object.values(seats).filter(u => u !== room.meta.host);
  const allReady = others.length > 0 && others.every(u => room.players[u] && room.players[u].ready && room.players[u].online !== false);
  const mine = room.players && room.players[me];

  const ready = $('btn-ready'), start = $('btn-start'), rematch = $('btn-rematch'), note = $('lobby-note');
  ready.hidden = isHost || status !== 'waiting';
  ready.textContent = mine && mine.ready ? 'I am not ready' : 'I am ready';
  start.hidden = !isHost || status !== 'waiting';
  start.disabled = !(count >= 2 && allReady);
  rematch.hidden = !(isHost && status === 'finished');
  note.textContent = status === 'finished'
    ? (isHost ? 'The last match is over. Reopen the room to play again.' : 'The last match is over. Waiting for the host to open a rematch…')
    : count < 2 ? 'Share the room code. You need at least 2 players.'
    : !isHost ? (mine && mine.ready ? 'Waiting for the host to start…' : 'Press "I am ready" when you are set.')
    : allReady ? 'Everyone is ready. Start the match!' : 'Waiting for everyone to press ready…';
}

$('btn-ready').onclick = () => update(ref(db, `rooms/${code}/players/${me}`), { ready: !(room.players[me].ready) }).catch(e => toast(friendlyError(e), 'error'));

$('btn-start').onclick = async () => {
  $('btn-start').disabled = true;
  try {
    await update(ref(db, `rooms/${code}/meta`), { status: 'playing' });           // 1. open the game
    try { await set(ref(db, `rooms/${code}/game`), initialGame(room)); }           // 2. write the first game state
    catch (e) { await update(ref(db, `rooms/${code}/meta`), { status: 'waiting' }); throw e; }
  } catch (e) { toast('Could not start: ' + friendlyError(e), 'error'); }
};

$('btn-rematch').onclick = () =>
  update(ref(db, `rooms/${code}`), { game: null, 'meta/status': 'waiting' }).catch(e => toast(friendlyError(e), 'error'));

$('btn-copy').onclick = async () => {
  const url = `${location.origin}${location.pathname}?room=${code}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Join my Ludo game', text: `Room code: ${code}`, url });
    else { await navigator.clipboard.writeText(`Join my Ludo game! Code: ${code}  ${url}`); toast('Code and link copied'); }
  } catch (e) { /* user cancelled share */ }
};

$('btn-leave').onclick = async () => {
  const isHost = room && room.meta.host === me;
  if (!(await confirmDialog(isHost ? 'You are the host. Leaving closes the room for everyone.' : 'Leave this room?', { ok: 'Leave' }))) return;
  leaving = true;
  const c = code, seat = seatOf(room, me);
  if (stopRoom) stopRoom(); if (stopPresence) stopPresence();
  try {
    if (isHost) await remove(ref(db, `rooms/${c}`));
    else { await remove(ref(db, `rooms/${c}/players/${me}`)); if (seat >= 0) await remove(ref(db, `rooms/${c}/seats/${seat}`)); }
  } catch (e) { toast(friendlyError(e), 'error'); }
  location.href = 'lobby.html';
};

init();
