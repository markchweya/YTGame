# YouTube integration plan

The game is built so the stream integration is additive. Nothing in the
gameplay code needs to change; the hooks are already in place.

## What exists today

| Hook | Where | Purpose |
| --- | --- | --- |
| `Leaderboard.setProvider(provider)` | `js/leaderboard.js` | Swap the local board for a network-backed one. |
| `YouTubeLeaderboardProvider` | `js/leaderboard.js` | Stub that extends the local provider. Fill in `list`, `submit`, `clear`. |
| `CONFIG.YOUTUBE` | `js/config.js` | Feature flag and API base URL. |
| `CONFIG.RIVALS.names` / `colors` | `js/config.js` | Rival identity is plain data. |
| `window.NeonRush` | `js/main.js` | Exposes `game`, `audio`, `input`, `Leaderboard`, `CONFIG`, `Sprites`. |

## Planned flow

1. **Backend** (small Node service): holds the YouTube Data API key, polls the
   live chat of the active broadcast, and stores runs in a database.
2. **Viewer join**: a viewer types `!race` in chat; the backend adds their
   display name to a lobby endpoint. The game polls the lobby and injects those
   names as rivals (`game.rivals[i].name`), so the stream shows chat members
   racing the streamer.
3. **Run submit**: `YouTubeLeaderboardProvider.submit()` POSTs the result to
   `${apiBase}/runs`; `list()` GETs `${apiBase}/board?mode=race`.
4. **Overlay**: the HUD already renders standings and toasts; an OBS browser
   source can load the game directly.

## Security notes

- API keys and OAuth tokens live only on the backend. Never put them in
  `config.js` or any file in this repository.
- Sanitise viewer names server-side (length, characters) before they reach
  the game. The UI escapes HTML, but keep names short for the HUD.
