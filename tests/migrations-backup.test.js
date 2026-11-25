'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtemp, mkdir, writeFile, readFile, rm, stat } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { migrate, migrations } = require('../migrations');

test('migraciones preservan datos, son idempotentes y rechazan historial alterado', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY);
      CREATE TABLE listings(id INTEGER PRIMARY KEY,owner INTEGER,status TEXT,confirmed TEXT);
      CREATE TABLE messages(id INTEGER PRIMARY KEY,listing INTEGER,sender INTEGER,recipient INTEGER);
      CREATE TABLE reviews(id INTEGER PRIMARY KEY,owner INTEGER,status TEXT);
      CREATE TABLE verifications(user INTEGER PRIMARY KEY);
      INSERT INTO users VALUES(42);`);
    assert.equal(migrate(db, migrations.slice(0, 2)), 2);
    assert.equal(migrate(db), migrations.length - 2, 'actualiza una base con las dos versiones anteriores');
    assert.equal(migrate(db), 0);
    assert.equal(db.prepare('SELECT id FROM users').get().id, 42);
    assert.equal(db.prepare('SELECT count(*) AS n FROM schema_migrations').get().n, migrations.length);
    db.prepare("UPDATE schema_migrations SET checksum='changed' WHERE version=1").run();
    assert.throws(() => migrate(db), /incompatible/);
  } finally { db.close(); }
});

test('una migración fallida revierte tanto cambios como registros', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE users(id);CREATE TABLE listings(id);CREATE TABLE messages(id);CREATE TABLE reviews(id)');
    const entries = [migrations[0], { version: 2, name: 'invalid', sql: 'CREATE TABLE created_in_transaction(id); INSERT INTO missing VALUES(1);' }];
    assert.throws(() => migrate(db, entries));
    assert.equal(db.prepare('SELECT count(*) AS n FROM schema_migrations').get().n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='created_in_transaction'").get().n, 0);
  } finally { db.close(); }
});

test('respaldo cifrado restaura SQLite con WAL y archivos sin sobrescribir destinos', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vgt-recovery-test-'));
  const dbPath = path.join(dir, 'source.sqlite'), photoDir = path.join(dir, 'photos');
  const profileDir = path.join(dir, 'profiles'), evidenceDir = path.join(dir, 'evidence');
  const archive = path.join(dir, 'backup.vgt'), restored = path.join(dir, 'restored');
  const env = { ...process.env, DB_PATH: dbPath, PHOTO_DIR: photoDir, PROFILE_PHOTO_DIR: profileDir, EVIDENCE_DIR: evidenceDir, BACKUP_PASSPHRASE: 'clave ficticia larga de prueba' };
  const script = path.resolve(__dirname, '../scripts/backup.js');
  let db;
  try {
    for (const folder of [photoDir, profileDir, evidenceDir]) await mkdir(folder);
    await writeFile(path.join(photoDir, 'foto.webp'), 'foto-ficticia');
    await writeFile(path.join(profileDir, 'perfil.webp'), 'perfil-ficticio');
    await writeFile(path.join(evidenceDir, 'documento.webp'), 'documento-ficticio');
    db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE sample(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO sample VALUES(1,'vigente en WAL')");
    const call = (args, vars = env) => spawnSync(process.execPath, [script, ...args], { env: vars, encoding: 'utf8' });
    let result = call(['create', archive]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!(await readFile(archive)).includes(Buffer.from('documento-ficticio')));
    const original = await readFile(archive);
    result = call(['create', archive]);
    assert.notEqual(result.status, 0);
    assert.deepEqual(await readFile(archive), original);
    result = call(['restore', archive, path.join(dir, 'wrong')], { ...env, BACKUP_PASSPHRASE: 'contraseña incorrecta de prueba' });
    assert.notEqual(result.status, 0);
    await assert.rejects(stat(path.join(dir, 'wrong')), { code: 'ENOENT' });
    const corrupted = Buffer.from(original);
    corrupted[Math.floor(corrupted.length / 2)] ^= 1;
    const corruptPath = path.join(dir, 'corrupt.vgt');
    await writeFile(corruptPath, corrupted);
    result = call(['restore', corruptPath, path.join(dir, 'corrupt-restored')]);
    assert.notEqual(result.status, 0);
    await assert.rejects(stat(path.join(dir, 'corrupt-restored')), { code: 'ENOENT' });
    result = call(['restore', archive, restored]);
    assert.equal(result.status, 0, result.stderr);
    const restoredDb = new DatabaseSync(path.join(restored, 'database.sqlite'), { readOnly: true });
    try {
      assert.equal(restoredDb.prepare('SELECT value FROM sample').get().value, 'vigente en WAL');
      assert.equal(restoredDb.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    } finally { restoredDb.close(); }
    assert.equal(await readFile(path.join(restored, 'photos/foto.webp'), 'utf8'), 'foto-ficticia');
    assert.equal(await readFile(path.join(restored, 'profile-photos/perfil.webp'), 'utf8'), 'perfil-ficticio');
    assert.equal(await readFile(path.join(restored, 'evidence/documento.webp'), 'utf8'), 'documento-ficticio');
    result = call(['restore', archive, restored]);
    assert.notEqual(result.status, 0);
    assert.equal(await readFile(path.join(restored, 'photos/foto.webp'), 'utf8'), 'foto-ficticia');
  } finally {
    if (db) db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
