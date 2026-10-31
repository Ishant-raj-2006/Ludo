/* =====================================================================
   offline-game.js - local game loop for BOTH "Offline (pass & play)" and
   "Play against AI". Everything stays in JavaScript memory: no Firebase,
   no internet needed.
   ===================================================================== */
import * as E from './game-engine.js';
import { chooseMove } from './ai-player.js';
import { sfx } from './ui.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function startLocalGame(cfg, ui) {
  // turn order is always clockwise by colour: red, green, yellow, blue
  const players = cfg.players.slice().sort((a, b) => a.color - b.color);
  const state = E.createState(players);
  ui.setRoomInfo(cfg.mode === 'ai' ? `Vs computer (${cfg.difficulty})` : 'Pass & play');
  ui.board.render(state);

  while (state.phase !== 'over') {
    const cur = state.players[state.turn];
    ui.setPlayers(state);
    ui.setTurn(`${cur.name}'s turn`, cur.color);

    // ---- 1. roll ----
    if (cur.kind === 'ai') {
      ui.setRoll(false, 'Computer is thinking…');
      ui.setMsg('');
      await sleep(800);
    } else {
      ui.setMsg('');
      ui.setRoll(true, `${cur.name}: roll dice`);
      await ui.waitRoll();
      ui.setRoll(false, 'Rolling…');
    }
    const value = E.rollValue();
    sfx.roll();
    await ui.dice.roll(value);
    const r = E.applyRoll(state, value);

    if (r.skipped) {
      ui.setMsg(r.skipped === 'three-sixes'
        ? `${cur.name} rolled three 6s in a row. Turn lost!`
        : `${cur.name} rolled ${value}. No move possible.`);
      await sleep(1300);
      continue;
    }

    // ---- 2. choose a token ----
    let t;
    if (cur.kind === 'ai') {
      await sleep(600);
      t = chooseMove(state, cfg.difficulty);
    } else if (r.legal.length === 1) {
      ui.setMsg(`${cur.name} rolled ${value}`);
      await sleep(450);
      t = r.legal[0];
    } else {
      ui.setMsg(`${cur.name} rolled ${value}. Tap a glowing token.`);
      t = await ui.board.pick(state.turn, r.legal);
    }

    // ---- 3. move ----
    const mv = E.applyMove(state, t);
    await ui.board.animateMove(state, mv, sfx.step);
    ui.board.render(state);
    if (mv.captured.length) { sfx.capture(); ui.setMsg(`${cur.name} captured ${mv.captured.length} token${mv.captured.length > 1 ? 's' : ''}!`); }
    else if (mv.reachedHome) { sfx.home(); ui.setMsg(`${cur.name} brought a token home!`); }
    await sleep(350);
  }

  // ---- game over ----
  const w = state.players[state.winner];
  ui.setPlayers(state);
  ui.setTurn(`${w.name} wins!`, w.color);
  ui.setRoll(false, 'Game over');
  sfx.win();
  ui.showResult({
    title: `${w.name} wins!`,
    text: 'All four tokens reached home.',
    buttons: [
      { label: 'Play again', primary: true, onClick: () => location.reload() },
      { label: 'Return home', onClick: () => { location.href = 'index.html'; } }
    ]
  });
}
