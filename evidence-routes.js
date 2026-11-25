'use strict';
const multer = require('multer');
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {readKey, encryptEvidence, decryptEvidence} = require('./evidence-crypto');

const receive = multer({storage: multer.memoryStorage(), limits: {files: 1, fileSize: 6 * 1024 * 1024, parts: 1}}).single('evidence');

module.exports = function(app, db, auth, audit, adminAllowed = () => true) {
  const root = process.env.EVIDENCE_DIR || path.join(__dirname, 'private-evidence');
  const key = readKey(process.env.EVIDENCE_ENCRYPTION_KEY);
  const retention = Number(process.env.EVIDENCE_RETENTION_DAYS || 30);
  if (!Number.isInteger(retention) || retention < 1 || retention > 3650) throw new Error('EVIDENCE_RETENTION_DAYS debe estar entre 1 y 3650.');
  if (process.env.NODE_ENV === 'production' && !key) throw new Error('Producción requiere EVIDENCE_ENCRYPTION_KEY.');
  db.exec(`CREATE TABLE IF NOT EXISTS listing_evidence(id TEXT PRIMARY KEY,listing INTEGER NOT NULL REFERENCES listings(id),owner INTEGER NOT NULL REFERENCES users(id),created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,expires TEXT NOT NULL);CREATE TABLE IF NOT EXISTS evidence_access(id INTEGER PRIMARY KEY,evidence TEXT NOT NULL,actor INTEGER NOT NULL REFERENCES users(id),reason TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const result = (s, code, msg) => s.status(code).json({error: msg});
  const file = (id, ext) => path.join(root, id + ext);
  const privileged = (q, row) => {
    if (!adminAllowed(q)) return false;
    if (q.session.user.role === 'admin') return true;
    if (q.session.user.role !== 'verifier' || row.owner === q.session.user.id) return false;
    const listing = row.listing ?? row.id;
    return !!db.prepare("SELECT 1 FROM listings WHERE id=? AND owner<>? AND status='pending'").get(listing, q.session.user.id);
  };
  const allowed = (q, row) => row && (row.owner === q.session.user.id || privileged(q, row));
  const access = (q, s, row) => {
    if (!allowed(q, row)) { result(s, 404, 'Evidencia no encontrada.'); return false; }
    if (row.owner !== q.session.user.id) {
      const reason = String(q.query.reason || '').trim();
      if (reason.length < 10 || reason.length > 500) { result(s, 400, 'Indicá un motivo de acceso de 10 a 500 caracteres.'); return false; }
      db.prepare('INSERT INTO evidence_access(evidence,actor,reason) VALUES(?,?,?)').run(row.id, q.session.user.id, reason);
      audit(q.session.user.id, 'view', 'evidence', row.listing);
    }
    return true;
  };
  async function removeFiles(id) {
    await fs.rm(file(id, '.enc'), {force: true});
    await fs.rm(file(id, '.webp'), {force: true});
  }
  async function cleanup() {
    const rows = db.prepare("SELECT id FROM listing_evidence WHERE datetime(expires)<=datetime('now')").all();
    for (const row of rows) {
      try { await removeFiles(row.id); db.prepare('DELETE FROM listing_evidence WHERE id=?').run(row.id); }
      catch (e) { console.error('No se pudo eliminar evidencia vencida:', row.id, e.message); }
    }
  }
  cleanup().catch(e => console.error('Limpieza de evidencia:', e.message));
  setInterval(() => cleanup().catch(e => console.error('Limpieza de evidencia:', e.message)), 3600000).unref();
  app.post('/api/listings/:id/evidence', auth, (q, s) => {
    const initial = db.prepare('SELECT id,owner,status FROM listings WHERE id=?').get(q.params.id);
    if (!initial || initial.owner !== q.session.user.id || !['draft','pending','rejected'].includes(initial.status)) return result(s, 404, 'Anuncio no encontrado.');
    receive(q, s, async err => {
      if (err || !q.file) return result(s, 400, 'Adjuntá una imagen JPEG, PNG o WebP de hasta 6 MB.');
      let id, ext, written=false, transaction=false;
      try {
        const image=sharp(q.file.buffer,{limitInputPixels:40000000,failOn:'error'}),meta=await image.metadata();
        if (!['jpeg','png','webp'].includes(meta.format) || meta.pages > 1) throw Error('Formato inválido');
        const output=await image.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
        id=crypto.randomBytes(16).toString('hex');ext=key?'.enc':'.webp';
        await fs.mkdir(root,{recursive:true,mode:0o700});
        await fs.writeFile(file(id,ext),key?encryptEvidence(output,key,id):output,{mode:0o600,flag:'wx'});written=true;
        db.exec('BEGIN IMMEDIATE');transaction=true;
        const current=db.prepare('SELECT l.id,l.owner,l.status,u.suspended owner_suspended FROM listings l JOIN users u ON u.id=l.owner WHERE l.id=?').get(q.params.id);
        if(!current||current.owner!==q.session.user.id||current.owner_suspended||!['draft','pending','rejected'].includes(current.status)){const e=Error('state');e.publicStatus=404;throw e}
        if(db.prepare('SELECT COUNT(*) n FROM listing_evidence WHERE listing=?').get(current.id).n>=3){const e=Error('limit');e.publicStatus=400;e.publicMessage='Máximo tres imágenes por inmueble.';throw e}
        db.prepare("INSERT INTO listing_evidence(id,listing,owner,expires) VALUES(?,?,?,datetime('now',?))").run(id,current.id,current.owner,'+'+retention+' days');
        audit(q.session.user.id,'upload','evidence',current.id);db.exec('COMMIT');transaction=false;
        s.status(201).json({id,expires:db.prepare('SELECT expires FROM listing_evidence WHERE id=?').get(id).expires});
      }catch(e){
        if(transaction)try{db.exec('ROLLBACK')}catch{}
        if(written)await fs.rm(file(id,ext),{force:true}).catch(()=>{});
        if(e.publicStatus===404)return result(s,404,'Anuncio no encontrado.');
        return result(s,400,e.publicMessage||'No se pudo procesar la imagen de autorización.');
      }
    });
  });
  app.get('/api/listings/:id/evidence', auth, (q, s) => {
    const l = db.prepare('SELECT id,owner FROM listings WHERE id=?').get(q.params.id);
    if (!allowed(q, l)) return result(s, 404, 'Anuncio no encontrado.');
    if (l.owner !== q.session.user.id) {
      const reason = String(q.query.reason || '').trim();
      if (reason.length < 10 || reason.length > 500) return result(s, 400, 'Indicá un motivo de acceso de 10 a 500 caracteres.');
      db.prepare('INSERT INTO evidence_access(evidence,actor,reason) VALUES(?,?,?)').run('list:' + l.id, q.session.user.id, reason);
      audit(q.session.user.id, 'list', 'evidence', l.id);
    }
    s.json(db.prepare("SELECT id,created,expires FROM listing_evidence WHERE listing=? AND datetime(expires)>datetime('now') ORDER BY created").all(l.id));
  });
  app.get('/api/evidence/:id', auth, async (q, s) => {
    if (!/^[a-f0-9]{32}$/.test(q.params.id)) return s.sendStatus(404);
    const row = db.prepare("SELECT * FROM listing_evidence WHERE id=? AND datetime(expires)>datetime('now')").get(q.params.id);
    if (!access(q, s, row)) return;
    try {
      let image;
      try { image = decryptEvidence(await fs.readFile(file(row.id, '.enc')), key, row.id); }
      catch (err) {
        // Los archivos anteriores sin cifrar siguen disponibles para una migración explícita.
        if (err.code !== 'ENOENT' || process.env.NODE_ENV === 'production') throw err;
        image = await fs.readFile(file(row.id, '.webp'));
      }
      s.set('Cache-Control', 'no-store').set('X-Content-Type-Options', 'nosniff').type('image/webp').send(image);
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('No se pudo leer evidencia privada.');
      s.sendStatus(err.code === 'ENOENT' ? 404 : 500);
    }
  });
  app.post('/api/evidence/:id/delete', auth, async (q, s) => {
    const row = db.prepare('SELECT * FROM listing_evidence WHERE id=?').get(q.params.id);
    if (!row || row.owner !== q.session.user.id) return s.sendStatus(404);
    try {
      await removeFiles(row.id);
      db.prepare('DELETE FROM listing_evidence WHERE id=?').run(row.id);
      audit(q.session.user.id, 'delete', 'evidence', row.listing);
      s.json({ok: true});
    } catch { result(s, 500, 'No se pudo eliminar la evidencia.'); }
  });
};
