/* Persistent settings + local data, namespaced under CONFIG.STORAGE_KEY. */
const Storage = {
  _cache: null,
  LEGACY_KEYS: ['neonrush.v1'],
  _load() {
    if (this._cache) return this._cache;
    try {
      this._cache = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || '{}') || {};
      // carry player settings forward from older versions (never the leaderboard — scoring changed)
      if (!Object.keys(this._cache).length) {
        for (const key of this.LEGACY_KEYS) {
          const old = JSON.parse(localStorage.getItem(key) || 'null');
          if (!old) continue;
          for (const k of ['name', 'color', 'muted', 'mode']) if (k in old) this._cache[k] = old[k];
          this._save();
          break;
        }
      }
    } catch (_) {
      this._cache = {};
    }
    return this._cache;
  },
  remove(key) {
    delete this._load()[key];
    this._save();
  },
  _save() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this._cache || {}));
    } catch (_) {
      /* storage may be unavailable (private mode) — game still runs */
    }
  },
  get(key, fallback) {
    const d = this._load();
    return key in d ? d[key] : fallback;
  },
  set(key, value) {
    this._load()[key] = value;
    this._save();
  },
};
