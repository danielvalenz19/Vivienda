#!/usr/bin/env node
'use strict';

// Encrypted, portable local backup. Run with application writes paused so the
// SQLite snapshot and attachment directories describe the same point in time.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { once } = require('node:events');
const { DatabaseSync, backup } = require('node:sqlite');

const MAGIC = Buffer.from('VGTBK001');
const HEADER_SIZE = 8 + 16 + 12;
const TAG_SIZE = 16;
const root = path.resolve(__dirname, '..');

function requiredKey() {
  const secret = process.env.BACKUP_PASSPHRASE;
  if (!secret || secret.length < 16) throw new Error('BACKUP_PASSPHRASE debe tener al menos 16 caracteres y guardarse por separado.');
  return secret;
}
function runTar(args) {
  const result = spawnSync('tar', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error('No se pudo procesar el archivo de respaldo: ' + (result.error?.message || result.stderr));
  return result.stdout;
}
async function copySafe(source, target) {
  let info;
  try { info = await fsp.lstat(source); } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (info.isSymbolicLink()) throw new Error('El respaldo no admite enlaces simbólicos: ' + source);
  if (info.isDirectory()) {
    await fsp.mkdir(target, { recursive: true, mode: 0o700 });
    for (const entry of await fsp.readdir(source)) await copySafe(path.join(source, entry), path.join(target, entry));
  } else if (info.isFile()) {
    await fsp.copyFile(source, target, fs.constants.COPYFILE_EXCL);
    await fsp.chmod(target, 0o600);
  } else throw new Error('El respaldo solo admite directorios y archivos regulares: ' + source);
}
async function encrypt(input, output, secret) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(secret, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  // Opening exclusively before entering the cleanup path ensures an existing
  // backup is never deleted if the caller chooses an occupied destination.
  const handle = await fsp.open(output, 'wx', 0o600);
  const out = fs.createWriteStream(null, { fd: handle.fd, autoClose: false });
  try {
    out.write(Buffer.concat([MAGIC, salt, iv]));
    await pipeline(fs.createReadStream(input), cipher, out, { end: false });
    out.end(cipher.getAuthTag());
    await once(out, 'finish');
  } catch (error) {
    out.destroy();
    await fsp.rm(output, { force: true }).catch(() => {});
    throw error;
  } finally { await handle.close(); key.fill(0); }
}
async function decrypt(input, output, secret) {
  const handle = await fsp.open(input, 'r');
  let header, tag, size;
  try {
    size = (await handle.stat()).size;
    if (size <= HEADER_SIZE + TAG_SIZE) throw new Error('Respaldo incompleto.');
    header = Buffer.alloc(HEADER_SIZE); tag = Buffer.alloc(TAG_SIZE);
    await handle.read(header, 0, header.length, 0);
    await handle.read(tag, 0, tag.length, size - TAG_SIZE);
  } finally { await handle.close(); }
  if (!header.subarray(0, 8).equals(MAGIC)) throw new Error('Formato de respaldo no reconocido.');
  const key = crypto.scryptSync(secret, header.subarray(8, 24), 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, header.subarray(24, 36));
  decipher.setAuthTag(tag);
  try {
    await pipeline(fs.createReadStream(input, { start: HEADER_SIZE, end: size - TAG_SIZE - 1 }), decipher, fs.createWriteStream(output, { flags: 'wx', mode: 0o600 }));
  } finally { key.fill(0); }
}
async function withTemp(fn) {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'viviendagt-backup-'));
  await fsp.chmod(tmp, 0o700);
  try { return await fn(tmp); } finally { await fsp.rm(tmp, { recursive: true, force: true }); }
}
async function createBackup(destination) {
  const secret = requiredKey();
  const dbPath = path.resolve(process.env.DB_PATH || path.join(root, 'vivienda.sqlite'));
  const photoDir = path.resolve(process.env.PHOTO_DIR || path.join(root, 'uploads'));
  const profileDir = path.resolve(process.env.PROFILE_PHOTO_DIR || path.join(root, 'profile-photos'));
  const evidenceDir = path.resolve(process.env.EVIDENCE_DIR || path.join(root, 'private-evidence'));
  const info = await fsp.lstat(dbPath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('La base de origen debe ser un archivo regular existente.');
  await withTemp(async temp => {
    const content = path.join(temp, 'content');
    await fsp.mkdir(content, { mode: 0o700 });
    const source = new DatabaseSync(dbPath, { readOnly: true });
    try { await backup(source, path.join(content, 'database.sqlite')); } finally { source.close(); }
    for (const [name, sourceDir] of [['photos', photoDir], ['profile-photos', profileDir], ['evidence', evidenceDir]]) {
      await fsp.mkdir(path.join(content, name), { mode: 0o700 });
      await copySafe(sourceDir, path.join(content, name));
    }
    await fsp.writeFile(path.join(content, 'manifest.json'), JSON.stringify({ format: 1, created_at: new Date().toISOString(), sqlite: 'database.sqlite', directories: ['photos', 'profile-photos', 'evidence'] }, null, 2), { mode: 0o600 });
    const archive = path.join(temp, 'archive.tar.gz');
    runTar(['-czf', archive, '-C', content, 'database.sqlite', 'photos', 'profile-photos', 'evidence', 'manifest.json']);
    await encrypt(archive, path.resolve(destination), secret);
  });
}
async function restoreBackup(sourcePath, destination) {
  const secret = requiredKey(), target = path.resolve(destination);
  try { await fsp.lstat(target); throw new Error('El destino ya existe; elegí un directorio nuevo.'); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await withTemp(async temp => {
    const archive = path.join(temp, 'archive.tar.gz');
    await decrypt(path.resolve(sourcePath), archive, secret);
    const allowed = new Set(['database.sqlite', 'photos', 'profile-photos', 'evidence', 'manifest.json']);
    const paths = runTar(['-tzf', archive]).trim().split('\n');
    if (!paths.length || paths.some(item => item.startsWith('/') || item.split('/').includes('..') || !allowed.has(item.split('/')[0]))) throw new Error('El archivo contiene rutas no permitidas.');
    const listing = runTar(['-tvzf', archive]).trim().split('\n');
    if (listing.some(line => line[0] !== '-' && line[0] !== 'd')) throw new Error('El archivo contiene enlaces o tipos no permitidos.');
    const extracted = path.join(temp, 'extracted');
    await fsp.mkdir(extracted, { mode: 0o700 });
    runTar(['-xzf', archive, '-C', extracted, '--no-same-owner']);
    const manifest = JSON.parse(await fsp.readFile(path.join(extracted, 'manifest.json'), 'utf8'));
    if (manifest.format !== 1 || manifest.sqlite !== 'database.sqlite') throw new Error('El manifiesto no es compatible.');
    const db = new DatabaseSync(path.join(extracted, 'database.sqlite'), { readOnly: true });
    try {
      if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('La base restaurada no superó integrity_check.');
    } finally { db.close(); }
    await fsp.mkdir(target, { mode: 0o700 });
    try { await copySafe(extracted, target); } catch (error) {
      await fsp.rm(target, { recursive: true, force: true });
      throw error;
    }
  });
}

async function main() {
  const [operation, source, destination] = process.argv.slice(2);
  if (operation === 'create' && source && !destination) {
    await createBackup(source);
    console.log('Respaldo cifrado creado.');
  } else if (operation === 'restore' && source && destination) {
    await restoreBackup(source, destination);
    console.log('Respaldo autenticado y restaurado en un directorio nuevo.');
  } else throw new Error('Uso: node scripts/backup.js create ARCHIVO o node scripts/backup.js restore ARCHIVO DIRECTORIO_NUEVO');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { createBackup, restoreBackup };
