/* =====================================================================
   online-game.js - online match. The database room is the single source
   of truth. Every move is written with a transaction; every client
   listens with onValue() and animates what changed.
   ===================================================================== */
import { auth, db, isConfigured, ref, onValue, runTransaction, update } from './firebase-config.js';
import { currentUserReady, recordResult } from './auth.js';
import * as E from './game-engine.js';
import { sfx, toast } from './ui.js';
import { watchPresence, stateFromRoom, serializeGame, seatMap } from './room-utils.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const OFFLINE_SKIP_MS = 15000;

export async function startOnlineGame(rawCode, ui) {
  if (!isConfigured) return ui.fatal('Firebase is not configured yet. Online mode needs your Firebase keys (see README).');
  const code = (rawCode || '').toUpperCase();
  const user = await currentUserReady();
  if (!user) { location.href = 'login.html?next=' + encodeURIComponent('game.html' + location.search); return; }

  const me = user.uid;
  const gameRef = ref(db, `rooms/${code}/game`);
  ui.setRoomInfo('Room ' + code);
  ui.setMsg('Connecting…');
  ui.setRoll(false, 'Connecting…');
  watchPresence(code, me);

  let room = null, local = null, handledRev = -1, finished = false, statsDone = false;
  let chain = Promise.resolve();
  const offlineSince = new Map();

  const offlineSet = () => new Set(Object.entries((room && room.players) || {}).filter(([, p]) => p.online === false).map(([u]) => u));

  onValue(ref(db, `rooms/${code}`), snap => {
    room = snap.val();
    if (!room) { toast('This room no longer exists.', 'error'); setTimeout(() => { location.href = 'index.html'; }, 1500); return; }
    if (!Object.values(seatMap(room)).includes(me)) return ui.fatal('You are not a player in this room.');
    if (room.meta.status === 'waiting') { location.href = 'lobby.html?room=' + code; return; }
    chain = chain.then(() => handle()).catch(err => console.error(err));
  }, err => ui.fatal('Cannot read the room: ' + err.message));

  /* ---- react to every database change ---- */
  async function handle() {
    if (!room.game) { ui.setMsg('Waiting for the host to start…'); return; }
    const next = stateFromRoom(room);

    if (!local || next.rev < local.rev || next.rev > local.rev + 1 || next.ev === 'start') {
      // first load, reconnect, or a rejected write rolled back: just redraw
      local = next; handledRev = -1;
      ui.board.cancelPick(); ui.board.render(local); ui.dice.set(local.dice);
    } else if (next.rev === local.rev + 1) {
      const prev = local;
      ui.board.cancelPick();
      if (next.ev === 'roll') {
        sfx.roll();
        await ui.dice.roll(next.dice);
        if (next.turn !== prev.turn) {            // turn passed on = roller had no move (or lost it)
          ui.setMsg(`${prev.players[prev.turn].name} rolled ${next.dice}. ${next.dice === 6 && prev.sixStreak === 2 ? 'Three 6s: turn lost!' : 'No move possible.'}`);
          await sleep(1200);
        }
      } else if (next.ev === 'move') {
        await ui.board.animateMove(next, next.last, sfx.step);
        const lost = next.tokens.some((ts, p) => ts.some((x, t) => x === -1 && prev.tokens[p][t] >= 0 && p !== next.last.p));
        if (lost) sfx.capture(); else if (next.last.to === E.HOME) sfx.home();
      }
      local = next;
      ui.board.render(local);
    } else {
      ui.setPlayers(local, { meUid: me, offline: offlineSet() });   // presence-only change
      return;
    }
    refreshControls();
  }

  /* ---- what can *I* do now? ---- */
  function refreshControls() {
    const s = local, cur = s.players[s.turn];
    ui.setPlayers(s, { meUid: me, offline: offlineSet() });
    if (s.phase === 'over') return finish(s);
    ui.setTurn(cur.uid === me ? 'Your turn' : `${cur.name}'s turn`, cur.color);
    if (handledRev === s.rev) return;
    handledRev = s.rev;

    if (cur.uid !== me) { ui.setRoll(false, `Waiting for ${cur.name}…`); ui.setMsg(''); return; }
    const rev = s.rev;
    if (s.phase === 'roll') {
      ui.setMsg(s.dice === 6 && s.ev === 'move' ? 'Extra turn!' : '');
      ui.setRoll(true, 'Roll dice');
      ui.onRoll(async () => { ui.setRoll(false, 'Rolling…'); const n = E.cloneState(local); E.applyRoll(n, E.rollValue()); await commit(n); });
    } else if (s.phase === 'move') {
      ui.setRoll(false, 'Choose a token');
      const legal = E.legalMoves(s);
      const go = async t => { if (!local || local.rev !== rev) return; const n = E.cloneState(local); E.applyMove(n, t); await commit(n); };
      if (legal.length === 1) { ui.setMsg(`You rolled ${s.dice}`); setTimeout(() => go(legal[0]), 500); }
      else { ui.setMsg(`You rolled ${s.dice}. Tap a glowing token.`); ui.board.pick(s.turn, legal).then(go); }
    }
  }

  /* ---- write a new state; reject if somebody else wrote first ---- */
  async function commit(next) {
    try {
      const res = await runTransaction(gameRef, cur => {
        if (!cur || cur.rev !== next.rev - 1) return;     // stale -> abort
        return serializeGame(next);
      });
      if (!res.committed) toast('Out of sync, refreshing…', 'info');
    } catch (e) {
      toast('Could not send your move: ' + (e.code || e.message), 'error');
      handledRev = -1; refreshControls();
    }
  }

  /* ---- game over ---- */
  function finish(s) {
    if (finished) return;
    finished = true;
    const w = s.players[s.winner];
    ui.setRoll(false, 'Game over');
    ui.setTurn(`${w.name} wins!`, w.color);
    sfx.win();
    if (!statsDone) { statsDone = true; recordResult(me, w.uid === me).catch(() => {}); }
    if (w.uid === me) update(ref(db, `rooms/${code}/meta`), { status: 'finished' }).catch(() => {});
    const isHost = room.meta.host === me;
    ui.showResult({
      title: w.uid === me ? 'You win!' : `${w.name} wins!`,
      text: isHost ? 'You are the host: "Play again" reopens this room for a rematch.' : 'Go back to the lobby and wait for the host to start a rematch.',
      buttons: [
        { label: isHost ? 'Play again' : 'Back to lobby', primary: true, onClick: async () => {
            if (isHost) { try { await update(ref(db, `rooms/${code}`), { game: null, 'meta/status': 'waiting' }); } catch (e) { toast('Could not reset the room', 'error'); } }
            location.href = 'lobby.html?room=' + code; } },
        { label: 'Return home', onClick: () => { location.href = 'index.html'; } }
      ]
    });
  }

  /* ---- disconnected player? after 15 s one online player skips their turn ---- */
  setInterval(() => {
    if (!room || !local || local.phase === 'over' || finished) return;
    const cur = local.players[local.turn];
    if (cur.uid === me) return;
    if (room.players?.[cur.uid]?.online !== false) { offlineSince.delete(cur.uid); return; }
    if (!offlineSince.has(cur.uid)) offlineSince.set(cur.uid, Date.now());
    if (Date.now() - offlineSince.get(cur.uid) < OFFLINE_SKIP_MS) return;
    const helpers = local.players.filter(p => p.uid !== cur.uid && room.players?.[p.uid]?.online !== false).sort((a, b) => a.color - b.color);
    if (!helpers.length || helpers[0].uid !== me) return;      // only ONE client does the skip
    const n = E.cloneState(local); E.passTurn(n);
    offlineSince.delete(cur.uid);
    toast(`${cur.name} is offline. Turn skipped.`);
    commit(n);
  }, 3000);
}
