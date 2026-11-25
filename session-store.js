'use strict';

// Store only hashes of session identifiers: a database copy alone cannot be used
// as a browser cookie. Data is local to the application's SQLite database.
const { Store } = require('express-session');
const crypto = require('node:crypto');

class SQLiteSessionStore extends Store {
  constructor(db, maxAgeMs) {
    super();
    this.db = db;
    this.maxAgeMs = maxAgeMs;
    db.exec(`CREATE TABLE IF NOT EXISTS sessions (
      sid_hash TEXT PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      data TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    ); CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
       CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`);
    this.cleanup = setInterval(() => {
      try { db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now()); }
      catch (err) { this.emit('error', err); }
    }, 60 * 60 * 1000);
    this.cleanup.unref();
  }
  hash(sid) { return crypto.createHash('sha256').update(sid).digest('hex'); }
  expiration(sess) {
    const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + this.maxAgeMs;
    return Number.isFinite(expires) ? expires : Date.now() + this.maxAgeMs;
  }
  get(sid, callback) {
    try {
      const hash = this.hash(sid);
      const row = this.db.prepare('SELECT data,expires_at FROM sessions WHERE sid_hash=?').get(hash);
      if (!row) return callback(null, null);
      if (row.expires_at <= Date.now()) {
        this.db.prepare('DELETE FROM sessions WHERE sid_hash=?').run(hash);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.data));
    } catch (err) { return callback(err); }
  }
  set(sid, sess, callback = () => {}) {
    try {
      this.db.prepare(`INSERT INTO sessions(sid_hash,user_id,data,expires_at) VALUES(?,?,?,?)
        ON CONFLICT(sid_hash) DO UPDATE SET user_id=excluded.user_id,data=excluded.data,expires_at=excluded.expires_at`)
        .run(this.hash(sid), sess.user?.id || null, JSON.stringify(sess), this.expiration(sess));
      callback(null);
    } catch (err) { callback(err); }
  }
  touch(sid, sess, callback = () => {}) {
    try {
      this.db.prepare('UPDATE sessions SET expires_at=? WHERE sid_hash=?').run(this.expiration(sess), this.hash(sid));
      callback(null);
    } catch (err) { callback(err); }
  }
  destroy(sid, callback = () => {}) {
    try { this.db.prepare('DELETE FROM sessions WHERE sid_hash=?').run(this.hash(sid)); callback(null); }
    catch (err) { callback(err); }
  }
  destroyUser(userId) { this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId); }
}

module.exports = SQLiteSessionStore;
