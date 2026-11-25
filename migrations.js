'use strict';
const crypto = require('node:crypto');

// 001 records the existing, idempotent legacy schema. It does not create it:
// until that schema is extracted, call this after all legacy setup functions.
const migrations = [
  { version: 1, name: 'legacy_schema_baseline', sql: 'SELECT 1;' },
  { version: 2, name: 'query_indexes', sql: `
    CREATE INDEX IF NOT EXISTS idx_listings_public_status_confirmed ON listings(status, confirmed);
    CREATE INDEX IF NOT EXISTS idx_listings_owner ON listings(owner);
    CREATE INDEX IF NOT EXISTS idx_messages_participants_listing ON messages(listing, sender, recipient);
    CREATE INDEX IF NOT EXISTS idx_reviews_owner_status ON reviews(owner, status);
  ` },
  { version: 3, name: 'legal_acceptance', sql: `
    CREATE TABLE IF NOT EXISTS legal_acceptances (
      id INTEGER PRIMARY KEY,
      user INTEGER NOT NULL REFERENCES users(id),
      version TEXT NOT NULL,
      accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user ON legal_acceptances(user);
  ` },
  { version: 4, name: 'admin_mfa', sql: `
    CREATE TABLE IF NOT EXISTS admin_mfa (
      user_id INTEGER PRIMARY KEY REFERENCES users(id), secret TEXT,
      pending_secret TEXT, pending_until INTEGER, enabled INTEGER NOT NULL DEFAULT 0,
      last_counter INTEGER NOT NULL DEFAULT -1
    );
    CREATE TABLE IF NOT EXISTS admin_mfa_recovery (
      user_id INTEGER NOT NULL REFERENCES users(id), code_hash TEXT NOT NULL,
      used_at INTEGER, PRIMARY KEY(user_id,code_hash)
    );
    CREATE TABLE IF NOT EXISTS admin_mfa_attempts (
      user_id INTEGER PRIMARY KEY REFERENCES users(id), failures INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0
    );
  ` },
  { version: 5, name: 'safety_reports', sql: `
    CREATE TABLE IF NOT EXISTS safety_reports (
      id INTEGER PRIMARY KEY,
      reporter INTEGER NOT NULL REFERENCES users(id),
      subject_kind TEXT NOT NULL CHECK(subject_kind IN ('listing','user','message','review')),
      subject_id INTEGER NOT NULL,
      target_user INTEGER NOT NULL REFERENCES users(id),
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved','dismissed')),
      resolver INTEGER REFERENCES users(id),
      resolution TEXT NOT NULL DEFAULT '',
      created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS safety_reports_queue ON safety_reports(status,id);
    CREATE INDEX IF NOT EXISTS safety_reports_reporter ON safety_reports(reporter,id);
  ` },
  { version: 6, name: 'privacy_requests', sql: require('./privacy-request-routes').schema },
  { version: 7, name: 'daily_metrics', sql: `
    CREATE TABLE IF NOT EXISTS metrics_daily (
      day TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('search','detail')),
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(day,kind)
    );
  ` },
  { version: 8, name: 'verification_correction_note', sql: `
    ALTER TABLE verifications ADD COLUMN user_note TEXT NOT NULL DEFAULT '';
  ` },
];

function checksum(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex');
}

function migrate(db, entries = migrations) {
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].version !== i + 1 || !entries[i].name || !entries[i].sql) {
      throw new Error('Las migraciones deben estar ordenadas y numeradas consecutivamente desde 1.');
    }
  }
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const tableNames = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
  for (const table of ['users', 'listings', 'messages', 'reviews']) {
    if (!tableNames.has(table)) throw new Error(`Falta la tabla heredada ${table}; inicializá el esquema antes de migrar.`);
  }
  // Serialize concurrent startup processes before inspecting or changing versions.
  db.exec('BEGIN IMMEDIATE');
  try {
    const applied = db.prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version').all();
    for (let i = 0; i < applied.length; i++) {
      const stored = applied[i], expected = entries[i];
      if (!expected || stored.version !== expected.version || stored.name !== expected.name || stored.checksum !== checksum(expected.sql)) {
        throw new Error(`Historial de migración incompatible en versión ${stored.version}.`);
      }
    }
    const insert = db.prepare('INSERT INTO schema_migrations(version,name,checksum) VALUES(?,?,?)');
    for (const entry of entries.slice(applied.length)) {
      db.exec(entry.sql);
      insert.run(entry.version, entry.name, checksum(entry.sql));
    }
    db.exec('COMMIT');
    return entries.length - applied.length;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
module.exports = { migrate, migrations };
