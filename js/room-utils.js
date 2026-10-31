/* room-utils.js - helpers shared by lobby.js and online-game.js */
import { db, ref, onValue, onDisconnect, set } from './firebase-config.js';
import { createState } from './game-engine.js';

export const SEAT_ORDER = [0, 2, 1, 3];   // 1st player red, 2nd yellow (opposite), then green, blue
export const SEAT_NAMES = ['Red', 'Green', 'Yellow', 'Blue'];

/** Firebase may return arrays or objects; make both a plain list. */
export function toList(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x.filter(v => v !== null && v !== undefined);
  return Object.keys(x).sort((a, b) => a - b).map(k => x[k]);
}
/** seats object -> { seatNumber: uid } (works for array/object responses) */
export function seatMap(room) {
  const out = {};
  for (let i = 0; i < 4; i++) { const v = room && room.seats && room.seats[i]; if (v) out[i] = v; }
  return out;
}
export const seatOf = (room, uid) => { const m = seatMap(room); const k = Object.keys(m).find(s => m[s] === uid); return k === undefined ? -1 : Number(k); };

/** Mark this player online; Firebase flips it to false by itself if the tab closes / connection drops. */
export function watchPresence(code, uid) {
  const pRef = ref(db, `rooms/${code}/players/${uid}/online`);
  const off = onValue(ref(db, '.info/connected'), snap => {
    if (snap.val() === true) onDisconnect(pRef).set(false).then(() => set(pRef, true)).catch(() => {});
  });
  return () => { off(); onDisconnect(pRef).cancel().catch(() => {}); };
}

/** Engine state -> plain object stored in the database (rooms/CODE/game). */
export function serializeGame(state) {
  const g = {
    turn: state.turn, turnUid: state.players[state.turn].uid, dice: state.dice, phase: state.phase,
    sixStreak: state.sixStreak, winner: state.winner, rev: state.rev, ev: state.ev,
    order: state.players.map(p => p.uid), tokens: state.tokens
  };
  if (state.last) g.last = state.last;
  return g;
}
/** Database room -> engine state. */
export function stateFromRoom(room) {
  const g = room.game, order = toList(g.order), seats = seatMap(room);
  const players = order.map(uid => {
    const seat = Object.keys(seats).find(s => seats[s] === uid);
    return { uid, color: Number(seat), kind: 'human', name: (room.players && room.players[uid] && room.players[uid].name) || 'Player' };
  });
  return {
    players, tokens: order.map((_, i) => toList(g.tokens[i]).map(Number)),
    turn: g.turn, dice: g.dice, phase: g.phase, sixStreak: g.sixStreak || 0,
    winner: g.winner === undefined ? -1 : g.winner, rev: g.rev, ev: g.ev, last: g.last || null
  };
}
/** Build the first game node from a lobby room (seat order = turn order). */
export function initialGame(room) {
  const seats = seatMap(room);
  const players = Object.keys(seats).map(Number).sort((a, b) => a - b)
    .map(s => ({ uid: seats[s], color: s, kind: 'human', name: room.players[seats[s]].name }));
  const st = createState(players);
  return serializeGame(st);
}
