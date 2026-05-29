// SQLite cache module — replaces 5 JSON cache files
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT_DIR, 'data', 'cache.db');
const MAX_ENTRIES_PER_TYPE = 10;
const MAX_AGE_DAYS = 30;

// JSON -> SQLite migration map
const CACHE_TYPES = [
  { type: 'inventory',       file: 'shopify_inventory_cache.json' },
  { type: 'link_analytics',  file: 'shopify_link_analytics_cache.json' },
  { type: 'ams_heater',      file: 'shopify_ams_heater_sales_cache.json' },
  { type: 'daily_sku',       file: 'shopify_daily_sku_sales_cache.json' },
  { type: 'daily_traffic',   file: 'shopify_daily_traffic_sales_cache.json' }
];

let _db = null;

function db() {
  if (!_db) {
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    _db = new DatabaseSync(DB_PATH);
    _db.exec('PRAGMA journal_mode = WAL');
    _db.exec('PRAGMA synchronous = NORMAL');
    _db.exec(`CREATE TABLE IF NOT EXISTS cache_entries (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_type TEXT    NOT NULL,
      cache_key  TEXT    NOT NULL,
      saved_at   TEXT    NOT NULL,
      payload    TEXT    NOT NULL,
      UNIQUE(cache_type, cache_key)
    )`);
    _db.exec('CREATE INDEX IF NOT EXISTS idx_cache_type ON cache_entries(cache_type)');
    _db.exec('CREATE INDEX IF NOT EXISTS idx_cache_date ON cache_entries(cache_type, saved_at)');

    // Migration: import any remaining JSON cache files
    migrateJsonCaches();
  }
  return _db;
}

function migrateJsonCaches() {
  CACHE_TYPES.forEach(({ type, file }) => {
    const filePath = path.join(ROOT_DIR, 'data', file);
    if (!fs.existsSync(filePath)) return;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const cache = JSON.parse(raw);
      const entries = cache && cache.entries ? cache.entries : {};
      let count = 0;
      Object.entries(entries).forEach(([key, entry]) => {
        try {
          set(type, key, entry.payload || entry, entry.saved_at);
          count++;
        } catch (e) { /* skip corrupted */ }
      });
      if (count > 0) {
        fs.unlinkSync(filePath);
        console.log('[db] migrated ' + count + ' entries from ' + file);
      }
    } catch (e) {
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }
    }
  });
}

// ---- public API ----

function get(type, cacheKey) {
  const stmt = db().prepare('SELECT payload, saved_at FROM cache_entries WHERE cache_type = ? AND cache_key = ?');
  const row = stmt.get(type, cacheKey);
  if (!row) return null;
  try {
    return { payload: JSON.parse(row.payload), saved_at: row.saved_at };
  } catch (e) {
    return null;
  }
}

function set(type, cacheKey, payload, savedAt) {
  const saved_at = savedAt || new Date().toISOString();
  const payloadJson = JSON.stringify(payload);
  const stmt = db().prepare(
    'INSERT INTO cache_entries (cache_type, cache_key, saved_at, payload) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(cache_type, cache_key) DO UPDATE SET saved_at = excluded.saved_at, payload = excluded.payload'
  );
  stmt.run(type, cacheKey, saved_at, payloadJson);
  cleanup(type);
}

function getAll(type) {
  const stmt = db().prepare('SELECT cache_key, payload, saved_at FROM cache_entries WHERE cache_type = ? ORDER BY saved_at DESC');
  const rows = stmt.all(type);
  const entries = {};
  rows.forEach(row => {
    try {
      entries[row.cache_key] = {
        payload: JSON.parse(row.payload),
        saved_at: row.saved_at
      };
    } catch (e) { /* skip */ }
  });
  return { version: 1, entries };
}

function getAllTypes() {
  const types = CACHE_TYPES.map(t => t.type);
  const result = {};
  types.forEach(type => {
    result[type] = getAll(type);
  });
  return result;
}

function cleanup(type) {
  const d = db();
  // Delete entries older than MAX_AGE_DAYS
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86400000).toISOString();
  d.prepare('DELETE FROM cache_entries WHERE cache_type = ? AND saved_at < ?').run(type, cutoff);
  // Keep only the latest MAX_ENTRIES_PER_TYPE
  d.prepare(
    'DELETE FROM cache_entries WHERE id IN (SELECT id FROM cache_entries WHERE cache_type = ? ORDER BY saved_at DESC LIMIT -1 OFFSET ?)'
  ).run(type, MAX_ENTRIES_PER_TYPE);
}

function close() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = { get, set, getAll, getAllTypes, cleanup, close };
