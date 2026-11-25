'use strict';
// Demo-only local flows. Call only with the application's SQLite connection.
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const path = require('path');

module.exports = function demoAuthRoutes({db, dbPath, sessionStore}) {
  const expected = path.resolve(__dirname, 'demo.sqlite');
  if (process.env.DEMO_AUTH !== '1' || process.env.NODE_ENV === 'production' || path.resolve(dbPath || '') !== expected) {
    throw new Error('Las rutas de prueba requieren DEMO_AUTH=1 y la base demo.sqlite local.');
  }
  db.exec(`CREATE TABLE IF NOT EXISTS demo_auth_tokens (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    purpose TEXT NOT NULL CHECK(purpose IN ('reset','confirm')), expires_at INTEGER NOT NULL, used_at INTEGER
  ); CREATE TABLE IF NOT EXISTS demo_contact_confirmations (
    user_id INTEGER PRIMARY KEY REFERENCES users(id), confirmed_at INTEGER NOT NULL
  );`);
  const router = express.Router();
  const digest = token => crypto.createHash('sha256').update(token).digest('hex');
  const validEmail = value => typeof value === 'string' && value.length <= 254 ? value.trim().toLowerCase() : '';
  const attempts = new Map();
  function throttle(key) { const now=Date.now(); let a=attempts.get(key); if(!a || now>a.until) a={count:0,until:now+15*60*1000}; a.count++; attempts.set(key,a); return a.count<=10; }
  function issue(user,purpose) {
    const token=crypto.randomBytes(32).toString('base64url');
    db.prepare('UPDATE demo_auth_tokens SET used_at=? WHERE user_id=? AND purpose=? AND used_at IS NULL').run(Date.now(),user.id,purpose);
    db.prepare('INSERT INTO demo_auth_tokens(token_hash,user_id,purpose,expires_at) VALUES(?,?,?,?)').run(digest(token),user.id,purpose,Date.now()+15*60*1000);
    console.log(`[DEMO LOCAL] Código de ${purpose==='reset'?'recuperación':'confirmación'} para ${user.email}: ${token} (válido 15 minutos, un uso).`);
  }
  function request(purpose) { return (req,res)=>{
    if(!throttle(`${purpose}:${req.ip}`)) return res.status(429).json({error:'Demasiados intentos. Probá más tarde.'});
    const email=validEmail(req.body?.email); const user=email ? db.prepare('SELECT id,email FROM users WHERE email=?').get(email):null;
    // Do not put token or account existence in any HTTP response.
    if(user) issue(user,purpose);
    res.json({ok:true,message:'Si la cuenta existe, consultá la consola local para obtener el código de demostración.'});
  }; }
  router.get('/api/demo/auth/enabled', (req,res)=>res.json({enabled:true}));
  router.post('/api/demo/auth/request-reset',request('reset'));
  router.post('/api/demo/auth/request-confirmation',request('confirm'));
  router.get('/api/demo/auth/contact-status',(req,res)=>{
    if(!req.session?.user) return res.status(401).json({error:'Iniciá sesión para consultar tu estado.'});
    res.json({confirmed:!!db.prepare('SELECT user_id FROM demo_contact_confirmations WHERE user_id=?').get(req.session.user.id)});
  });
  router.post('/api/demo/auth/use-token',async(req,res)=>{
    if(!throttle(`use:${req.ip}`))return res.status(429).json({error:'Demasiados intentos. Probá más tarde.'});
    const token=typeof req.body?.token==='string'?req.body.token:'';
    const purpose=req.body?.purpose;
    const password=typeof req.body?.password==='string'?req.body.password:'';
    if(!/^[A-Za-z0-9_-]{43}$/.test(token) || !['reset','confirm'].includes(purpose))return res.status(400).json({error:'Código inválido o vencido.'});
    if(purpose==='reset' && (password.length<8 || password.length>128))return res.status(400).json({error:'La contraseña debe tener entre 8 y 128 caracteres.'});
    // Compute before the transaction; recheck the single-use token while holding the write lock.
    const passwordHash=purpose==='reset'?await bcrypt.hash(password,12):null; const hash=digest(token), now=Date.now();
    try {
      db.exec('BEGIN IMMEDIATE');
      const row=db.prepare('SELECT user_id FROM demo_auth_tokens WHERE token_hash=? AND purpose=? AND used_at IS NULL AND expires_at>?').get(hash,purpose,now);
      if(!row){db.exec('ROLLBACK');return res.status(400).json({error:'Código inválido o vencido.'});}
      db.prepare('UPDATE demo_auth_tokens SET used_at=? WHERE token_hash=?').run(now,hash);
      if(purpose==='reset'){
        db.prepare('UPDATE users SET password=?,auth_version=auth_version+1 WHERE id=?').run(passwordHash,row.user_id);
        sessionStore.destroyUser(row.user_id);
      }
      else db.prepare('INSERT INTO demo_contact_confirmations(user_id,confirmed_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET confirmed_at=excluded.confirmed_at').run(row.user_id,now);
      db.exec('COMMIT'); return res.json({ok:true});
    }catch(e){try{db.exec('ROLLBACK')}catch{};console.error('Error en flujo de demostración',e.message);return res.status(500).json({error:'No se pudo completar la operación.'});}
  });
  return router;
};
