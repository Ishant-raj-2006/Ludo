/* game-main.js - starts game.html in the right mode: offline | ai | online */
import { createGameUI, confirmDialog } from './ui.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode');
const ui = createGameUI();

document.getElementById('btn-leave').addEventListener('click', async () => {
  if (await confirmDialog('Leave this game? Your progress will be lost.', { ok: 'Leave game' })) location.href = 'index.html';
});

try {
  if (mode === 'online') {
    const m = await import('./online-game.js');          // loaded only for online play
    await m.startOnlineGame(params.get('room'), ui);
  } else if (mode === 'offline' || mode === 'ai') {
    let cfg = null;
    try { cfg = JSON.parse(sessionStorage.getItem('ludoConfig')); } catch (e) { /* ignore */ }
    if (!cfg || cfg.mode !== mode || !cfg.players || cfg.players.length < 2) { location.replace('index.html'); }
    else { const m = await import('./offline-game.js'); await m.startLocalGame(cfg, ui); }
  } else {
    location.replace('index.html');
  }
} catch (e) {
  console.error(e);
  ui.fatal(e && e.message ? e.message : 'Unexpected error while loading the game.');
}
