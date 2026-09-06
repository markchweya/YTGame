/* Persistent settings + local data, namespaced under CONFIG.STORAGE_KEY. */
const Storage = {
  _cache: null,
  _load() {
    if (this._cache) return this._cache;
    try {
      this._cache = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || '{}') || {};
    } catch (_) {
      this._cache = {};
    }
    return this._cache;
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
