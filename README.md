# Ludo Lane - Online, Offline and AI Ludo

Plain **HTML + CSS + vanilla JavaScript (ES modules)** with **Firebase Authentication**, **Realtime Database** and **Hosting**. No build step, no Node.js backend.

| Mode | Needs Firebase? | Needs internet? |
|---|---|---|
| Play Offline (2-4 players, one device) | No | Only to load the page the first time |
| Play Against AI (Easy / Medium / Hard) | No | Same |
| Play Online (rooms, lobby, accounts) | **Yes** | Yes |

## Folder structure

```
ludo-game/
├── index.html        home: modes, profile/stats, rules, about
├── login.html        email/password login
├── register.html     create account
├── lobby.html        create / join room, ready, start (online)
├── game.html         the board (offline, AI and online all use it)
├── css/              style.css (site), board.css (board/dice/players), responsive.css
├── js/
│   ├── game-engine.js   pure Ludo rules (shared by all modes)
│   ├── ai-player.js     computer opponent
│   ├── board.js         draws the board, moves tokens
│   ├── dice.js          animated dice
│   ├── ui.js            sounds, toasts, dialogs, game-screen controller
│   ├── offline-game.js  game loop for offline + AI
│   ├── online-game.js   realtime game loop (Firebase)
│   ├── lobby.js         rooms, seats, ready/start
│   ├── room-utils.js    seat helpers, presence, state <-> database conversion
│   ├── firebase-config.js  YOUR Firebase keys (edit this)
│   ├── auth.js / auth-pages.js   login, register, stats
│   ├── app.js           home page logic
│   └── game-main.js     picks the mode when game.html loads
├── assets/images/logo.svg   (sounds are synthesised with WebAudio, no audio files)
├── database.rules.json  Realtime Database security rules
├── firebase.json        Hosting + rules deployment config
└── .gitignore
```

## Rules used (identical in every mode)

1. Four colours (Red, Green, Yellow, Blue), four tokens each, one six-sided die.
2. A **6** brings a token out of the yard onto your start cell.
3. Exact roll needed to reach the final home cell.
4. Landing on an opponent on a normal cell **captures** it (back to the yard). **Safe cells** (4 start cells + 4 stars) cannot be captured on.
5. **Extra turn** after a 6, a capture, or bringing a token home.
6. **Three 6s in a row** = turn lost.
7. No legal move = turn passes automatically.
8. No blockades; same-colour tokens can share a cell.
9. First player with all four tokens home wins; the game ends.

## Run locally (Windows + VS Code)

ES modules do **not** work from `file://`, so use a tiny local server.

1. Install [VS Code](https://code.visualstudio.com/). Extract the ZIP, then **File > Open Folder** > `ludo-game`.
2. Extensions (Ctrl+Shift+X) > install **Live Server** (Ritwick Dey).
3. Right-click `index.html` > **Open with Live Server** (opens `http://127.0.0.1:5500`).
4. Offline and AI modes work immediately. 

Alternative without VS Code: open PowerShell in the folder and run `python -m http.server 5500`, then visit `http://localhost:5500`.

## Firebase setup (needed only for accounts + online play)

1. Go to <https://console.firebase.google.com> > **Add project** (Analytics optional).
2. **Project overview > Web icon (`</>`)** > register app (tick *Also set up Firebase Hosting* if you want) > copy the `firebaseConfig` values.
3. Paste them into `js/firebase-config.js`. (These web keys are not secrets. Security comes from the rules. **Never** add service-account keys to this project.)
4. **Build > Authentication > Get started > Sign-in method > Email/Password > Enable**.
5. **Build > Realtime Database > Create database**. Choose the region nearest you (e.g. `asia-southeast1` Singapore for India). Start in **locked mode**. Copy the exact **database URL** shown at the top (it contains the region) into `databaseURL` in `firebase-config.js`.
6. Realtime Database > **Rules** tab > paste the contents of `database.rules.json` > **Publish**.
7. Authentication > **Settings > Authorized domains**: `localhost` and `127.0.0.1` are there by default; your `*.web.app` domain is added automatically on hosting.

### Database layout

```
users/{uid}                 name, played, wins, createdAt      (only that user can read/write)
rooms/{CODE}
   meta/                    host, status (waiting|playing|finished), createdAt
   seats/{0-3}              uid   (0=Red 1=Green 2=Yellow 3=Blue; one uid per seat)
   players/{uid}            name, ready, online
   game/                    turn, turnUid, dice, phase, sixStreak, winner, rev, ev,
                            order[uids], tokens[player][token], last{p,t,from,to,rev}
```

### What the rules enforce

- Must be signed in for any access; users see only their own `users/{uid}`.
- Room code format; only the creator can create it (host); only the host can delete it or change `status` (a member may set `finished` after `phase=over`).
- A seat can be claimed only while the room is `waiting`, only for yourself, and only if empty. This caps rooms at 4 players.
- You can only write your own `players/{uid}` node; joining only while `waiting`.
- `game` can be written by: the host to create it, **the player whose turn it is**, or any member when the turn player is marked offline (so the game can continue). Every write must increase `rev` by exactly 1, and values are range-checked (dice 0-6, tokens -1..56, phases, etc.).

### IMPORTANT limitation: this is not cheat-proof

All game logic runs in the browser. The rules above stop outsiders and out-of-turn writes, but **a player who edits the JavaScript while it is their turn can still write a "valid-looking" bad state** (e.g. choose their own dice, jump a token home). Realtime Database rules cannot run Ludo logic. For competitive/ranked play use a trusted server:

- **Cloud Functions (needs the Blaze plan)**: clients write only a *request* (`roll` / `move token t`); a function validates with `game-engine.js`, generates the dice with `crypto.randomInt`, and is the only writer of `game/`. Rules then make `game/` read-only for clients.
- Or any server you control that uses the Firebase Admin SDK (credentials stay on the server).

Reusing `game-engine.js` on the server is easy because it has no DOM code.

Other limits: stats (`played`/`wins`) are written by the client, so they can be edited by the user; the host's "start" button requires everyone ready only in the UI (the rules do not check it).

## Deploy with Firebase Hosting

```bash
npm install -g firebase-tools     # one-time (needs Node.js installed on your PC)
firebase login
firebase use --add                # pick your project
firebase deploy                   # deploys hosting + database rules
```

`firebase.json` serves the project folder itself (`"public": "."`). Your site will be `https://<project-id>.web.app`.

## Testing

### What was actually tested during development

- **Rules engine:** 3,000 complete simulated games (2-4 players, all AI levels, ~850k turns). Checked: token values stay in range, no two opponents share a non-safe cell, winner always has 4 tokens home. Unit checks for capture, safe cell, exact-roll home, three-sixes, move-without-roll rejection.
- **Board + UI + local game loop** (real `board.js`, `ui.js`, `offline-game.js`, `game.html`) in a simulated DOM (jsdom): a full human-vs-2-AI game was played to the end with clicks on the Roll button and glowing tokens; the result dialog appeared; 72 board cells, 4 yards, 12 tokens rendered.
- **Online data conversion:** 400 moves round-tripped through JSON (as the database would store them) and rebuilt identically.
- All JavaScript files pass a syntax check; every referenced file/import exists; `database.rules.json` and `firebase.json` are valid JSON.

### NOT tested (be honest with yourself)

- **No real Firebase project was used**, so account creation, lobby, realtime sync, presence/disconnect skipping and the **security rules were never run**. The code uses real listeners (`onValue`) and transactions, not simulation, but you must test it. Rules syntax in particular should be checked in the console Rules Playground / Emulator.
- No real browsers/devices were used: the visual layout (desktop/tablet/phone), animations and sounds were written to be responsive but not visually inspected.

### Your checklist

- [ ] Offline: 2, 3 and 4 players; names/colours; play to a win; "Play again".
- [ ] AI: 1, 2, 3 opponents on Easy/Medium/Hard; AI turns animate; game ends.
- [ ] Register, log out, log in; stats shown on home after an online game.
- [ ] Online with 2 browsers (one normal, one private window, different accounts): create room, join with code, ready, start, play, win, rematch.
- [ ] Close one player's tab on their turn: after ~15 s the turn is skipped; reopening the game URL reconnects.
- [ ] Resize to phone width (browser dev tools, 375 px wide).

## Common errors

| Problem | Fix |
|---|---|
| Blank page / "Failed to load module" | You opened the file by double-click. Use Live Server or `python -m http.server`. |
| "Firebase is not configured" | Paste real values in `js/firebase-config.js`. |
| `auth/operation-not-allowed` | Enable Email/Password in Authentication > Sign-in method. |
| `PERMISSION_DENIED` | Publish `database.rules.json`; make sure you are logged in. |
| Database URL error / data never arrives | `databaseURL` must be the exact URL from the console (includes region). |
| `auth/unauthorized-domain` | Add your domain in Authentication > Settings > Authorized domains. |
| No sound | Click the page first (browser autoplay policy) and check "Sound on". |

## Customise

- Colours: CSS variables at the top of `css/style.css`.
- Rules: edit `js/game-engine.js` (only place with game rules).
- Smarter AI: `scoreMove()` in `js/ai-player.js`.
- Ideas: ranking for 2nd/3rd place, chat, team mode, in-room colour choice, Cloud Functions referee.
