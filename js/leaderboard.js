/* Leaderboard service with pluggable providers.
 *
 * Today: LocalProvider (localStorage). Later: a YouTube-backed provider that
 * pushes runs to a backend and pulls a shared board for the stream. Providers
 * only need `list(mode)`, `submit(entry)` and `clear(mode)`; all return Promises
 * so swapping to a network provider is a one-line change in main.js.
 */

class LocalLeaderboardProvider {
  constructor(maxEntries = 10) {
    this.max = maxEntries;
  }
  _all() {
    return Storage.get('leaderboard', { race: [], endless: [] });
  }
  async list(mode) {
    return (this._all()[mode] || []).slice();
  }
  async submit(entry) {
    const all = this._all();
    const list = all[entry.mode] || [];
    list.push(entry);
    list.sort((a, b) => b.score - a.score || a.time - b.time);
    all[entry.mode] = list.slice(0, this.max);
    Storage.set('leaderboard', all);
    const rank = all[entry.mode].indexOf(entry);
    return { rank: rank === -1 ? null : rank + 1, total: all[entry.mode].length };
  }
  async clear(mode) {
    const all = this._all();
    all[mode] = [];
    Storage.set('leaderboard', all);
  }
  /* Portable backup of the whole board (both modes). */
  exportJSON() {
    return JSON.stringify({ version: 1, exported: Date.now(), boards: this._all() }, null, 2);
  }
  importJSON(text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !data.boards) throw new Error('Not a Neon Rush leaderboard export');
    const all = this._all();
    for (const mode of ['race', 'endless']) {
      const incoming = Array.isArray(data.boards[mode]) ? data.boards[mode] : [];
      const merged = [...(all[mode] || []), ...incoming.filter((e) => e && typeof e.score === 'number' && typeof e.name === 'string')];
      merged.sort((a, b) => b.score - a.score || a.time - b.time);
      all[mode] = merged.slice(0, this.max);
    }
    Storage.set('leaderboard', all);
    return all;
  }
}

/* Placeholder for the upcoming YouTube integration. Falls back to local storage
 * until CONFIG.YOUTUBE.enabled and an apiBase are configured. */
class YouTubeLeaderboardProvider extends LocalLeaderboardProvider {
  constructor(opts) {
    super(opts?.maxEntries || 10);
    this.apiBase = opts?.apiBase || '';
  }
  // TODO(youtube): POST entry to `${apiBase}/runs`, GET `${apiBase}/board?mode=`
}

const Leaderboard = {
  provider: new LocalLeaderboardProvider(10),
  setProvider(p) {
    this.provider = p;
  },
  list(mode) {
    return this.provider.list(mode);
  },
  submit(entry) {
    return this.provider.submit(entry);
  },
  clear(mode) {
    return this.provider.clear(mode);
  },
  exportJSON() {
    return this.provider.exportJSON ? this.provider.exportJSON() : '{}';
  },
  importJSON(text) {
    if (!this.provider.importJSON) throw new Error('Provider does not support import');
    return this.provider.importJSON(text);
  },
  async best(mode) {
    const l = await this.list(mode);
    return l.length ? l[0] : null;
  },
};
