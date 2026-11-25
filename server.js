'use strict';
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const crypto = require('crypto');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
if (process.env.NODE_ENV === 'production' && (process.env.DEMO_AUTH === '1' || path.basename(process.env.DB_PATH || '') === 'demo.sqlite')) throw new Error('La base y autenticación de demostración están prohibidas en producción.');
if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) throw new Error('SESSION_SECRET debe tener al menos 32 caracteres en producción.');
// No production traffic until the controls below are actually implemented and audited.
if (process.env.NODE_ENV === 'production') throw new Error('Producción deshabilitada: faltan MFA administrativo, correo verificado y cifrado de evidencia.');
const extended = require('./extended-routes');
const suspension = require('./suspension-routes');
const availability = require('./availability');
const availabilitySettings = availability.config();
const app = express();
const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, 'vivienda.sqlite'));
db.function('vgt_availability_days', () => availabilitySettings.days);
db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user');
CREATE TABLE IF NOT EXISTS listings(id INTEGER PRIMARY KEY,owner INTEGER NOT NULL REFERENCES users(id),title TEXT NOT NULL,city TEXT NOT NULL,area TEXT NOT NULL,type TEXT NOT NULL,price INTEGER NOT NULL,deposit INTEGER NOT NULL DEFAULT 0,description TEXT NOT NULL,rooms INTEGER NOT NULL DEFAULT 1,baths INTEGER NOT NULL DEFAULT 1,image TEXT,status TEXT NOT NULL DEFAULT 'pending',created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS favorites(user INTEGER REFERENCES users(id),listing INTEGER REFERENCES listings(id),PRIMARY KEY(user,listing));
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY,listing INTEGER REFERENCES listings(id),sender INTEGER REFERENCES users(id),recipient INTEGER REFERENCES users(id),body TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY,listing INTEGER REFERENCES listings(id),reporter INTEGER REFERENCES users(id),reason TEXT NOT NULL,status TEXT DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS blocks(blocker INTEGER REFERENCES users(id),blocked INTEGER REFERENCES users(id),created TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(blocker,blocked));
CREATE TABLE IF NOT EXISTS verifications(user INTEGER PRIMARY KEY REFERENCES users(id),status TEXT NOT NULL DEFAULT 'pending',note TEXT NOT NULL DEFAULT '',requested TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor INTEGER REFERENCES users(id),action TEXT NOT NULL,entity TEXT NOT NULL,entity_id INTEGER NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`);
function addColumns(table, additions) { const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r=>r.name)); for (const [name,definition] of Object.entries(additions)) if(!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`); }
addColumns('listings',{confirmed:"TEXT",services:"TEXT NOT NULL DEFAULT ''",parking:"TEXT NOT NULL DEFAULT 'No informado'",furnished:"TEXT NOT NULL DEFAULT 'No informado'",pets:"TEXT NOT NULL DEFAULT 'No informado'",extra_costs:"TEXT NOT NULL DEFAULT ''",conditions:"TEXT NOT NULL DEFAULT ''",authorization:"TEXT NOT NULL DEFAULT 'pending'"});
addColumns('users',{auth_version:'INTEGER NOT NULL DEFAULT 0'});
addColumns('audit',{reason:"TEXT NOT NULL DEFAULT ''"});
addColumns('messages',{client_id:'TEXT'});
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS messages_sender_client ON messages(sender,client_id) WHERE client_id IS NOT NULL');
db.exec("UPDATE listings SET confirmed=COALESCE(confirmed,created) WHERE confirmed IS NULL");
extended.setup(db);
suspension.setup(db);
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:'100kb'}));
const maxSessionAge=7*24*60*60*1000;
function localSessionSecret() {
 if(process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
 const dbPath=process.env.DB_PATH||path.join(__dirname,'vivienda.sqlite');
 if(dbPath===':memory:')return crypto.randomBytes(32).toString('hex');
 const secretPath=path.resolve(dbPath)+'.session-secret';
 try { fs.writeFileSync(secretPath,crypto.randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'}); }
 catch(e) { if(e.code!=='EEXIST')throw e; }
 const secret=fs.readFileSync(secretPath,'utf8').trim();
 if(secret.length<32)throw new Error('El secreto local de sesión no es válido.');
 return secret;
}
const sessionStore=new (require('./session-store'))(db,maxSessionAge);
const sessionSecret=localSessionSecret();
const mfa=require('./mfa-routes').createMfa({db,sessionStore,secret:sessionSecret});
app.use(session({store:sessionStore,secret:sessionSecret,resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:maxSessionAge}}));
app.use((q,s,next)=>{if(!q.path.startsWith('/api/')||!q.session?.user||['/api/logout','/api/login'].includes(q.path))return next();const row=db.prepare('SELECT role FROM users WHERE id=?').get(q.session.user.id);if(row&&row.role!==q.session.user.role)return q.session.destroy(()=>s.clearCookie('connect.sid').status(401).json({error:'Tus permisos cambiaron. Iniciá sesión nuevamente.'}));next()});
app.use(suspension.sessionGuard(db));
app.use((q,s,next)=>{if(!q.path.startsWith('/api/')||!q.session?.user)return next();const row=db.prepare('SELECT auth_version FROM users WHERE id=?').get(q.session.user.id);if(!row||q.session.authVersion!==row.auth_version)return q.session.destroy(()=>s.clearCookie('connect.sid').status(401).json({error:'Tu sesión terminó. Iniciá sesión nuevamente.'}));next()});
require('./csrf').registerCsrf(app,{port:Number(process.env.PORT)||3000,publicOrigin:process.env.PUBLIC_ORIGIN});
if (process.env.DEMO_AUTH === '1') app.use(require('./auth-demo-routes')({db, dbPath: process.env.DB_PATH,sessionStore}));
const mailAuth = require('./mail-auth-routes');
mailAuth.registerMailAuth(app,db,sessionStore,mailAuth.smtpConfiguration());
app.use(express.static(path.join(__dirname,'public')));
const auth=(q,s,next)=>q.session.user?next():s.status(401).json({error:'Iniciá sesión para continuar.'});
const admin=(q,s,next)=>{if(q.session.user?.role!=='admin')return s.status(403).json({error:'Acceso restringido.'});if(mfa.required(q))return s.status(403).json({error:'Completá la verificación en dos pasos.',code:'MFA_REQUIRED'});next()};
require('./metrics-routes')(app,db,admin);
const clean=u=>({id:u.id,name:u.name,email:u.email,role:u.role});
const audit=(actor,action,entity,id,reason='')=>db.prepare('INSERT INTO audit(actor,action,entity,entity_id,reason) VALUES(?,?,?,?,?)').run(actor,action,entity,id,reason);
const error=(s,status,message)=>s.status(status).json({error:message});
const limited=new Map();
function throttle(key,max,windowMs){let now=Date.now(),item=limited.get(key);if(!item||item.until<now)item={count:0,until:now+windowMs};item.count++;limited.set(key,item);return item.count<=max;}
function userOf(id){return db.prepare('SELECT id,name,suspended FROM users WHERE id=?').get(id)}
function blocked(a,b){return !!db.prepare('SELECT 1 FROM blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?)').get(a,b,b,a)}
function parseListing(x,existingImage=null){
 const title=String(x.title||'').trim(),city=String(x.city||''),area=String(x.area||'').trim(),type=String(x.type||''),description=String(x.description||'').trim(),image=String(x.image||'').trim();
 const price=Number(x.price),deposit=Number(x.deposit||0),rooms=Number(x.rooms??1),baths=Number(x.baths??1);
 let imageValid=true; if(image){try {const u=new URL(image); imageValid=u.protocol==='https:' && !u.username && !u.password && !/[\s\"'<>\\]/.test(image);} catch {imageValid=image===existingImage&&/^\/assets\/[a-zA-Z0-9_./-]+$/.test(image)&&!image.includes('..');}}
 if(!title||title.length>120||!['Ciudad de Guatemala','Xela'].includes(city)||!area||area.length>80||!['Apartamento','Cuarto'].includes(type)||!Number.isSafeInteger(price)||price<=0||price>10000000||!Number.isSafeInteger(deposit)||deposit<0||deposit>10000000||!description||description.length>3000||![rooms,baths].every(v=>Number.isInteger(v)&&v>=0&&v<=100)||image.length>2048||!imageValid) return null;
 let optional=(v,n)=>String(v||'').trim().slice(0,n);
 return {title,city,area,type,price,deposit,description,rooms,baths,image,services:optional(x.services,500),parking:optional(x.parking,80)||'No informado',furnished:optional(x.furnished,80)||'No informado',pets:optional(x.pets,80)||'No informado',extra_costs:optional(x.extra_costs,500),conditions:optional(x.conditions,1000)};
}
const POLICY_VERSION='demo-borrador-2026-11-25';
app.get('/api/policies/current',(q,s)=>s.json({version:POLICY_VERSION,preliminary:true,url:'/politicas-borrador.html'}));
app.get('/api/me',(q,s)=>s.json(q.session.user||null));
app.post('/api/register',async(q,s)=>{
 const name=String(q.body?.name||'').trim(),email=String(q.body?.email||'').trim().toLowerCase(),password=String(q.body?.password||'');
 if(!throttle('register:'+q.ip,10,3600000))return error(s,429,'Demasiados intentos. Intentá más tarde.');
 if(q.body?.terms_accepted!==true)return error(s,400,'Para crear tu cuenta aceptá las condiciones de la demostración.');
 if(!name||name.length>80||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||password.length<8||password.length>128)return error(s,400,'Ingresá nombre, correo válido y contraseña de al menos 8 caracteres.');
 try{
  const hash=await bcrypt.hash(password,12);
  let id;
  db.exec('BEGIN IMMEDIATE');
  try{
   id=Number(db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(name,email,hash).lastInsertRowid);
   db.prepare('INSERT INTO legal_acceptances(user,version) VALUES(?,?)').run(id,POLICY_VERSION);
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}
  const u=clean(db.prepare('SELECT * FROM users WHERE id=?').get(id));
  q.session.regenerate(e=>{if(e)return error(s,500,'No se pudo iniciar la sesión.');q.session.user=u;q.session.authVersion=0;s.json(u)});
 }catch(e){if(e.code==='ERR_SQLITE_ERROR'&&String(e.message).includes('UNIQUE'))return error(s,400,'Este correo ya está registrado.');console.error(e);return error(s,500,'No se pudo crear la cuenta.')}
});
app.post('/api/login',async(q,s)=>{if(!throttle('login:'+q.ip,30,900000))return error(s,429,'Demasiados intentos. Intentá más tarde.');let u=db.prepare('SELECT * FROM users WHERE email=?').get(String(q.body.email||'').toLowerCase().trim());if(!u||u.suspended||(process.env.NODE_ENV==='production'&&u.email.endsWith('@demo.vivienda.gt'))||!await bcrypt.compare(String(q.body.password||''),u.password))return error(s,401,'Correo o contraseña incorrectos.');q.session.regenerate(e=>{if(e)return error(s,500,'No se pudo iniciar la sesión.');q.session.user=clean(u);q.session.authVersion=u.auth_version;s.json(q.session.user)})});
app.post('/api/logout',auth,(q,s)=>q.session.destroy(()=>s.clearCookie('connect.sid').json({ok:true})));
app.post('/api/account/logout-all',auth,(q,s)=>{const id=q.session.user.id;db.exec('BEGIN');try{db.prepare('UPDATE users SET auth_version=auth_version+1 WHERE id=?').run(id);sessionStore.destroyUser(id);audit(id,'revoke_sessions','user',id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}q.session.destroy(()=>s.clearCookie('connect.sid').json({ok:true}))});
app.post('/api/account/password',auth,async(q,s)=>{const oldPassword=String(q.body.current_password||''),password=String(q.body.password||'');if(!throttle('password:'+q.session.user.id,10,900000))return error(s,429,'Demasiados intentos. Intentá más tarde.');if(password.length<8||password.length>128)return error(s,400,'La contraseña debe tener entre 8 y 128 caracteres.');const user=db.prepare('SELECT password FROM users WHERE id=?').get(q.session.user.id);if(!user||!await bcrypt.compare(oldPassword,user.password))return error(s,400,'La contraseña actual no es correcta.');const hash=await bcrypt.hash(password,12),id=q.session.user.id;db.exec('BEGIN');try{db.prepare('UPDATE users SET password=?,auth_version=auth_version+1 WHERE id=?').run(hash,id);sessionStore.destroyUser(id);audit(id,'change_password','user',id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}q.session.destroy(()=>s.clearCookie('connect.sid').json({ok:true}))});
app.post('/api/admin/users/:id/sessions/revoke',admin,(q,s)=>{const id=Number(q.params.id),reason=String(q.body.reason||'').trim();if(!Number.isSafeInteger(id)||id<=0||reason.length<10||reason.length>500)return error(s,400,'Indicá una cuenta y un motivo de al menos 10 caracteres.');if(!db.prepare('SELECT id FROM users WHERE id=?').get(id))return error(s,404,'Cuenta no encontrada.');db.exec('BEGIN');try{db.prepare('UPDATE users SET auth_version=auth_version+1 WHERE id=?').run(id);sessionStore.destroyUser(id);audit(q.session.user.id,'admin_revoke_sessions','user',id,reason);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}if(id===q.session.user.id)return q.session.destroy(()=>s.clearCookie('connect.sid').json({ok:true}));s.json({ok:true})});
app.get('/api/verification',auth,(q,s)=>s.json(db.prepare('SELECT status,note,user_note,requested,reviewed FROM verifications WHERE user=?').get(q.session.user.id)||{status:'not_requested'}));
app.post('/api/verification',auth,(q,s)=>{
 const previous=db.prepare('SELECT status FROM verifications WHERE user=?').get(q.session.user.id);
 const userNote=typeof q.body?.user_note==='string'?q.body.user_note.trim():'';
 if(userNote.length>500)return error(s,400,'La explicación debe tener como máximo 500 caracteres.');
 if(previous?.status==='approved')return error(s,400,'Tu identidad ya fue revisada.');
 if(previous?.status==='pending')return error(s,409,'Tu solicitud ya está pendiente de revisión.');
 if(previous&&!['needs_correction','rejected','revoked'].includes(previous.status))return error(s,409,'Esta solicitud no se puede reenviar todavía.');
 if(previous?.status==='needs_correction'&&userNote.length<10)return error(s,400,'Explicá en al menos 10 caracteres qué corregiste.');
 db.exec('BEGIN IMMEDIATE');
 try{
  db.prepare("INSERT INTO verifications(user,status,note,user_note) VALUES(?,'pending','',?) ON CONFLICT(user) DO UPDATE SET status='pending',note='',user_note=excluded.user_note,requested=CURRENT_TIMESTAMP,reviewed=NULL").run(q.session.user.id,userNote);
  audit(q.session.user.id,'request','verification',q.session.user.id);
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
 s.json({status:'pending'});
});
const publicRows=()=>db.prepare(`SELECT l.id,l.owner,l.title,l.city,l.area,l.type,l.price,l.deposit,l.description,l.rooms,l.baths,l.image,l.status,l.created,l.confirmed,l.services,l.parking,l.furnished,l.pets,l.extra_costs,l.conditions,l.authorization,COALESCE(NULLIF(p.public_name,''),u.name) owner_name,COALESCE(v.status,'not_requested') verification_status FROM listings l JOIN users u ON u.id=l.owner LEFT JOIN user_profiles p ON p.user=u.id LEFT JOIN verifications v ON v.user=u.id WHERE l.status='active' AND u.suspended=0 AND datetime(l.confirmed)>=datetime('now','-' || vgt_availability_days() || ' days') ORDER BY l.id DESC`).all();
app.get('/api/listings',(q,s)=>s.json(publicRows()));
app.get('/api/mine',auth,(q,s)=>s.json(db.prepare('SELECT * FROM listings WHERE owner=? ORDER BY id DESC').all(q.session.user.id)));
app.post('/api/listings',auth,(q,s)=>{let x=parseListing(q.body);if(!x)return error(s,400,'Completá los campos obligatorios con valores válidos. Las imágenes deben usar HTTPS.');let r=db.prepare('INSERT INTO listings(owner,title,city,area,type,price,deposit,description,rooms,baths,image,services,parking,furnished,pets,extra_costs,conditions,confirmed) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)').run(q.session.user.id,x.title,x.city,x.area,x.type,x.price,x.deposit,x.description,x.rooms,x.baths,x.image,x.services,x.parking,x.furnished,x.pets,x.extra_costs,x.conditions);audit(q.session.user.id,'create','listing',Number(r.lastInsertRowid));s.json({id:r.lastInsertRowid,status:'pending'})});
db.exec(`CREATE TABLE IF NOT EXISTS listing_changes(id INTEGER PRIMARY KEY,listing INTEGER NOT NULL REFERENCES listings(id),actor INTEGER NOT NULL REFERENCES users(id),fields TEXT NOT NULL,previous_status TEXT NOT NULL,new_status TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
app.post('/api/listings/:id/edit',auth,(q,s)=>{
 const l=db.prepare('SELECT * FROM listings WHERE id=?').get(q.params.id);
 if(!l||l.owner!==q.session.user.id||!['active','paused','pending','rejected','rented'].includes(l.status))return error(s,404,'Anuncio no encontrado.');
 const x=parseListing({...l,...q.body},l.image);if(!x)return error(s,400,'Revisá los datos del anuncio.');
 const fields=Object.keys(x).filter(k=>String(x[k]??'')!==String(l[k]??''));
 const sensitive=fields.some(k=>['city','area','type','image'].includes(k));
 const review=sensitive||l.status==='rejected';
 if(review&&l.status==='rejected'){
   if(!db.prepare("SELECT 1 FROM verifications WHERE user=? AND status='approved'").get(l.owner)||!db.prepare('SELECT 1 FROM listing_photos WHERE listing=?').get(l.id)||!db.prepare("SELECT 1 FROM listing_evidence WHERE listing=? AND datetime(expires)>datetime('now')").get(l.id))return error(s,400,'Para reenviar necesitás identidad revisada, fotografía y evidencia vigente.');
 }
 const status=review?'pending':l.status,authorization=review?'pending':l.authorization;
 const department=x.city==='Xela'?'Quetzaltenango':'Guatemala';
 db.exec('BEGIN');try{
  db.prepare('UPDATE listings SET title=?,city=?,department=?,municipality=?,area=?,type=?,price=?,deposit=?,description=?,rooms=?,baths=?,image=?,services=?,parking=?,furnished=?,pets=?,extra_costs=?,conditions=?,status=?,authorization=?,updated=CURRENT_TIMESTAMP WHERE id=?').run(x.title,x.city,department,x.city,x.area,x.type,x.price,x.deposit,x.description,x.rooms,x.baths,x.image,x.services,x.parking,x.furnished,x.pets,x.extra_costs,x.conditions,status,authorization,l.id);
  db.prepare('INSERT INTO listing_changes(listing,actor,fields,previous_status,new_status) VALUES(?,?,?,?,?)').run(l.id,l.owner,JSON.stringify(fields),l.status,status);
  audit(l.owner,'edit','listing',l.id);db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
 s.json({ok:true,status,review_required:review});
});
app.post('/api/listings/:id/status',auth,(q,s)=>{
 const l=db.prepare('SELECT * FROM listings WHERE id=?').get(q.params.id);
 if(!l||l.owner!==q.session.user.id||l.status==='suspended')return error(s,404,'Anuncio no encontrado.');
 const next=q.body.status,allowed={active:['paused','rented'],paused:['pending','active','rented'],pending:['rented'],rented:['pending']};
 if(!allowed[l.status]?.includes(next))return error(s,400,'Esta transición no está permitida para el estado actual.');
 if(next==='active'&&(l.authorization!=='approved'||!db.prepare("SELECT 1 FROM verifications WHERE user=? AND status='approved'").get(l.owner)))return error(s,400,'El anuncio necesita una revisión vigente.');
 db.exec('BEGIN');try{
  db.prepare("UPDATE listings SET status=?,confirmed=CASE WHEN ?='active' THEN CURRENT_TIMESTAMP ELSE confirmed END,updated=CURRENT_TIMESTAMP WHERE id=?").run(next,next,l.id);
  db.prepare('INSERT INTO listing_changes(listing,actor,fields,previous_status,new_status) VALUES(?,?,?,?,?)').run(l.id,l.owner,'[]',l.status,next);
  audit(l.owner,next,'listing',l.id);db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
 s.json({ok:true,status:next});
});
app.post('/api/listings/:id/confirm',auth,(q,s)=>{
 const l=db.prepare('SELECT * FROM listings WHERE id=?').get(q.params.id);
 if(!l||l.owner!==q.session.user.id)return error(s,404,'Anuncio no encontrado.');
 if(!['active','expired'].includes(l.status))return error(s,400,'Solo podés confirmar un anuncio disponible o vencido.');
 if(l.authorization!=='approved'||userOf(l.owner)?.suspended||!db.prepare("SELECT 1 FROM verifications WHERE user=? AND status='approved'").get(l.owner))return error(s,400,'El anuncio necesita identidad y autorización aprobadas para confirmar disponibilidad.');
 db.prepare("UPDATE listings SET confirmed=CURRENT_TIMESTAMP,status='active',updated=CURRENT_TIMESTAMP WHERE id=?").run(l.id);
 audit(q.session.user.id,'confirm','listing',l.id);
 s.json({ok:true,status:'active'});
});
app.get('/api/favorites',auth,(q,s)=>s.json(db.prepare('SELECT listing FROM favorites WHERE user=?').all(q.session.user.id).map(x=>x.listing)));
app.get('/api/favorite-listings',auth,(q,s)=>s.json(db.prepare("SELECT l.id,l.title,l.city,l.area,l.type,l.price,l.image,CASE WHEN u.suspended=1 THEN 'suspended' WHEN l.status='active' AND datetime(l.confirmed)<datetime('now','-' || vgt_availability_days() || ' days') THEN 'expired' ELSE l.status END status FROM favorites f JOIN listings l ON l.id=f.listing JOIN users u ON u.id=l.owner WHERE f.user=? ORDER BY l.id DESC").all(q.session.user.id)));
app.post('/api/favorites/:id',auth,(q,s)=>{let l=db.prepare('SELECT id,owner,status,confirmed FROM listings WHERE id=?').get(q.params.id);if(!l)return error(s,404,'Anuncio no encontrado.');let exists=db.prepare('SELECT 1 FROM favorites WHERE user=? AND listing=?').get(q.session.user.id,l.id);if(exists)db.prepare('DELETE FROM favorites WHERE user=? AND listing=?').run(q.session.user.id,l.id);else {if(l.status!=='active'||userOf(l.owner)?.suspended||!db.prepare("SELECT 1 FROM listings WHERE id=? AND datetime(confirmed)>=datetime('now','-' || vgt_availability_days() || ' days')").get(l.id))return error(s,400,'Este anuncio ya no está disponible.');db.prepare('INSERT INTO favorites VALUES(?,?)').run(q.session.user.id,l.id)}s.json({saved:!exists})});
app.get('/api/messages',auth,(q,s)=>s.json(db.prepare(`SELECT m.*, l.title, l.area, l.city, l.image listing_image, l.status listing_status,
  COALESCE(NULLIF(sp.public_name,''),su.name) sender_name, COALESCE(NULLIF(rp.public_name,''),ru.name) recipient_name,
  COALESCE(sp.photo_url,'') sender_photo, COALESCE(rp.photo_url,'') recipient_photo,
  (SELECT id FROM listing_photos WHERE listing=l.id ORDER BY position,rowid LIMIT 1) listing_photo
  FROM messages m JOIN listings l ON l.id=m.listing JOIN users su ON su.id=m.sender JOIN users ru ON ru.id=m.recipient
  LEFT JOIN user_profiles sp ON sp.user=su.id LEFT JOIN user_profiles rp ON rp.user=ru.id
  WHERE m.sender=? OR m.recipient=? ORDER BY m.id DESC`).all(q.session.user.id,q.session.user.id)));
function clientMessageId(q,s){const id=q.body.client_id;if(id===undefined||id===null)return null;if(typeof id!=='string'||!/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(id)){error(s,400,'Identificador de mensaje inválido.');return false}return id.toLowerCase()}
function duplicateMessage(q,s,id,listing,recipient,body){if(!id)return false;const old=db.prepare('SELECT id,listing,recipient,body FROM messages WHERE sender=? AND client_id=?').get(q.session.user.id,id);if(!old)return false;if(old.listing!==listing||old.recipient!==recipient||old.body!==body){error(s,409,'El identificador ya corresponde a otro mensaje.');return true}s.json({ok:true,id:old.id,duplicate:true});return true}
function saveMessage(q,s,id,listing,recipient,body){try{const result=db.prepare('INSERT INTO messages(listing,sender,recipient,body,client_id) VALUES(?,?,?,?,?)').run(listing,q.session.user.id,recipient,body,id);s.json({ok:true,id:Number(result.lastInsertRowid),duplicate:false})}catch(e){if(id&&duplicateMessage(q,s,id,listing,recipient,body))return;throw e}}
app.post('/api/messages',auth,(q,s)=>{const clientId=clientMessageId(q,s);if(clientId===false)return;let l=db.prepare("SELECT * FROM listings WHERE id=?").get(q.body.listing);let body=String(q.body.body||'').trim();if(!l||l.owner===q.session.user.id||!body||body.length>2000)return error(s,400,'No se pudo enviar el mensaje.');if(duplicateMessage(q,s,clientId,l.id,l.owner,body))return;if(l.status!=='active'||!db.prepare("SELECT 1 FROM listings WHERE id=? AND datetime(confirmed)>=datetime('now','-' || vgt_availability_days() || ' days')").get(l.id)||blocked(q.session.user.id,l.owner)||userOf(l.owner)?.suspended)return error(s,400,'No se pudo enviar el mensaje.');if(!throttle('message:'+q.session.user.id,40,3600000))return error(s,429,'Alcanzaste el límite de mensajes. Intentá más tarde.');saveMessage(q,s,clientId,l.id,l.owner,body)});
app.post('/api/reply',auth,(q,s)=>{const clientId=clientMessageId(q,s);if(clientId===false)return;let m=db.prepare('SELECT * FROM messages WHERE id=?').get(q.body.message);let body=String(q.body.body||'').trim();if(!m||![m.sender,m.recipient].includes(q.session.user.id)||!body||body.length>2000)return error(s,400,'No se pudo enviar el mensaje.');let recipient=m.sender===q.session.user.id?m.recipient:m.sender;if(duplicateMessage(q,s,clientId,m.listing,recipient,body))return;if(blocked(q.session.user.id,recipient)||userOf(recipient)?.suspended)return error(s,403,'La conversación no está disponible.');if(!throttle('message:'+q.session.user.id,40,3600000))return error(s,429,'Alcanzaste el límite de mensajes.');saveMessage(q,s,clientId,m.listing,recipient,body)});
app.post('/api/blocks',auth,(q,s)=>{let target=Number(q.body.user);if(!Number.isSafeInteger(target)||target===q.session.user.id||!userOf(target))return error(s,400,'Usuario no válido.');let interacted=db.prepare('SELECT 1 FROM messages WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)').get(q.session.user.id,target,target,q.session.user.id);if(!interacted)return error(s,403,'Solo podés bloquear a alguien con quien conversaste.');db.prepare('INSERT OR IGNORE INTO blocks(blocker,blocked) VALUES(?,?)').run(q.session.user.id,target);audit(q.session.user.id,'block','user',target);s.json({ok:true})});
app.post('/api/reports',auth,(q,s)=>{let l=db.prepare('SELECT id FROM listings WHERE id=?').get(q.body.listing);let reason=String(q.body.reason||'').trim();if(!l||!reason||reason.length>1000)return error(s,400,'Indicá el motivo del reporte.');if(!throttle('report:'+q.session.user.id,20,3600000))return error(s,429,'Alcanzaste el límite de reportes.');db.prepare('INSERT INTO reports(listing,reporter,reason) VALUES(?,?,?)').run(l.id,q.session.user.id,reason);s.json({ok:true})});
app.get('/api/admin',admin,(q,s)=>s.json({listings:db.prepare("SELECT l.*,u.name owner_name,COALESCE(v.status,'not_requested') verification_status FROM listings l JOIN users u ON l.owner=u.id LEFT JOIN verifications v ON v.user=u.id WHERE l.status='pending'").all(),reports:db.prepare('SELECT r.id,r.listing,r.reason,r.status,l.title FROM reports r JOIN listings l ON l.id=r.listing WHERE r.reporter<>? AND l.owner<>? ORDER BY r.id DESC').all(q.session.user.id,q.session.user.id),verifications:db.prepare("SELECT v.user,v.status,v.requested,v.user_note,u.name,u.email FROM verifications v JOIN users u ON u.id=v.user WHERE v.status='pending' AND v.user<>?").all(q.session.user.id),audit:db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 100').all()}));
app.get('/api/admin/verified-users',admin,(q,s)=>s.json(db.prepare("SELECT u.id,u.name,u.email,v.reviewed FROM verifications v JOIN users u ON u.id=v.user WHERE v.status='approved' AND u.id<>? ORDER BY u.id DESC LIMIT 200").all(q.session.user.id)));
app.post('/api/admin/verifications/:id',admin,(q,s)=>{
 const status=q.body?.status,note=typeof q.body?.note==='string'?q.body.note.trim():'';
 if(!['approved','rejected','needs_correction','revoked'].includes(status)||note.length>500)return error(s,400,'Estado u observaciones no válidos.');
 if(['needs_correction','revoked'].includes(status)&&note.length<10)return error(s,400,'Indicá un motivo de al menos 10 caracteres.');
 const v=db.prepare('SELECT user,status FROM verifications WHERE user=?').get(q.params.id);
 if(!v)return error(s,404,'Solicitud no encontrada.');
 if(v.user===q.session.user.id)return error(s,403,'No podés revisar tu propia identidad.');
 if((status==='revoked'&&v.status!=='approved')||(status!=='revoked'&&v.status!=='pending'))return error(s,409,'La solicitud ya no está en el estado esperado.');
 db.exec('BEGIN IMMEDIATE');
 try{
  const changed=db.prepare('UPDATE verifications SET status=?,note=?,reviewed=CURRENT_TIMESTAMP WHERE user=? AND status=?').run(status,note,v.user,v.status);
  if(!changed.changes){db.exec('ROLLBACK');return error(s,409,'La solicitud ya cambió.')}
  if(status==='revoked'){
   const affected=db.prepare("SELECT id FROM listings WHERE owner=? AND status='active'").all(v.user);
   db.prepare("UPDATE listings SET status='paused',updated=CURRENT_TIMESTAMP WHERE owner=? AND status='active'").run(v.user);
   for(const listing of affected)audit(q.session.user.id,'pause_identity_revoked','listing',listing.id);
  }
  audit(q.session.user.id,status,'verification',v.user,note);
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
 s.json({ok:true,status});
});
app.post('/api/admin/listings/:id',admin,(q,s)=>{if(!['active','rejected'].includes(q.body.status))return error(s,400,'Estado no válido.');let l=db.prepare('SELECT * FROM listings WHERE id=?').get(q.params.id);if(!l||l.status!=='pending')return error(s,404,'Anuncio pendiente no encontrado.');if(l.owner===q.session.user.id)return error(s,403,'No podés revisar tu propio anuncio.');if(q.body.status==='active'){if(userOf(l.owner)?.suspended)return error(s,400,'La cuenta del anunciante está suspendida.');let v=db.prepare('SELECT status FROM verifications WHERE user=?').get(l.owner);if(v?.status!=='approved')return error(s,400,'Primero debe revisarse la identidad del anunciante.');if(q.body.authorization!==true)return error(s,400,'Confirmá que se revisó la autorización de este inmueble.');if(!db.prepare("SELECT 1 FROM listing_evidence WHERE listing=? AND datetime(expires)>datetime('now')").get(l.id))return error(s,400,'El anuncio necesita evidencia de autorización vigente para revisarse.');}db.prepare("UPDATE listings SET status=?,authorization=?,confirmed=CURRENT_TIMESTAMP WHERE id=?").run(q.body.status,q.body.status==='active'?'approved':'rejected',l.id);audit(q.session.user.id,q.body.status,'listing',l.id);s.json({ok:true})});
app.post('/api/admin/reports/:id',admin,(q,s)=>{if(!['resolved','dismissed'].includes(q.body.status))return error(s,400,'Estado no válido.');let r=db.prepare('SELECT r.id,r.reporter,l.owner FROM reports r JOIN listings l ON l.id=r.listing WHERE r.id=?').get(q.params.id);if(!r)return error(s,404,'Reporte no encontrado.');if([r.reporter,r.owner].includes(q.session.user.id))return error(s,403,'No podés resolver un reporte en el que participás.');db.prepare('UPDATE reports SET status=? WHERE id=?').run(q.body.status,r.id);audit(q.session.user.id,q.body.status,'report',r.id);s.json({ok:true})});
// Review eligibility records confirmations from both parties; they are not proof of a rental.
db.exec(`CREATE TABLE IF NOT EXISTS visits(id INTEGER PRIMARY KEY, listing INTEGER NOT NULL REFERENCES listings(id), interested INTEGER NOT NULL REFERENCES users(id), owner INTEGER NOT NULL REFERENCES users(id), interested_confirmed INTEGER NOT NULL DEFAULT 0, owner_confirmed INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(listing,interested));
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, visit INTEGER UNIQUE NOT NULL REFERENCES visits(id), reviewer INTEGER NOT NULL REFERENCES users(id), owner INTEGER NOT NULL REFERENCES users(id), rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), body TEXT NOT NULL, response TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS appeals(id INTEGER PRIMARY KEY, user INTEGER NOT NULL REFERENCES users(id), entity TEXT NOT NULL, entity_id INTEGER NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', resolution TEXT NOT NULL DEFAULT '', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
addColumns('reviews',{communication:'INTEGER',accuracy:'INTEGER',treatment:'INTEGER'});
app.get('/api/profiles/:id',(q,s)=>{const id=Number(q.params.id);if(!Number.isSafeInteger(id)||id<=0)return error(s,400,'Perfil no válido.');const u=db.prepare("SELECT u.id,u.name,COALESCE(v.status,'not_requested') verification_status FROM users u LEFT JOIN verifications v ON v.user=u.id WHERE u.id=? AND u.suspended=0 AND EXISTS(SELECT 1 FROM listings l WHERE l.owner=u.id AND l.status='active' AND datetime(l.confirmed)>=datetime('now','-' || vgt_availability_days() || ' days'))").get(id);if(!u)return error(s,404,'Perfil no disponible.');const reviews=db.prepare("SELECT id,rating,communication,accuracy,treatment,body,response,created FROM reviews WHERE owner=? AND status='approved' ORDER BY id DESC").all(id);const profile=db.prepare('SELECT public_name,bio,photo_url FROM user_profiles WHERE user=?').get(id)||{};const available=publicRows().filter(x=>x.owner===id);s.json({...u,name:profile.public_name||u.name,bio:profile.bio||'',photo_url:profile.photo_url||'',listings:available,reviews,review_count:reviews.length,average:reviews.length?Math.round(reviews.reduce((n,r)=>n+r.rating,0)/reviews.length*10)/10:null});});
app.get('/api/visits',auth,(q,s)=>s.json(db.prepare('SELECT v.*,l.title,u.name interested_name,o.name owner_name, r.id review_id,r.status review_status FROM visits v JOIN listings l ON l.id=v.listing JOIN users u ON u.id=v.interested JOIN users o ON o.id=v.owner LEFT JOIN reviews r ON r.visit=v.id WHERE v.interested=? OR v.owner=? ORDER BY v.id DESC').all(q.session.user.id,q.session.user.id)));
app.post('/api/visits',auth,(q,s)=>{const l=db.prepare("SELECT * FROM listings WHERE id=? AND status='active' AND datetime(confirmed)>=datetime('now','-' || vgt_availability_days() || ' days')").get(q.body.listing);if(!l||l.owner===q.session.user.id||userOf(l.owner)?.suspended)return error(s,400,'Anuncio no disponible.');if(blocked(q.session.user.id,l.owner))return error(s,403,'La conversación no está disponible.');const contact=db.prepare('SELECT 1 FROM messages WHERE listing=? AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?))').get(l.id,q.session.user.id,l.owner,l.owner,q.session.user.id);if(!contact)return error(s,400,'Primero contactá al anunciante.');let v=db.prepare('SELECT id FROM visits WHERE listing=? AND interested=?').get(l.id,q.session.user.id);if(!v){let r=db.prepare('INSERT INTO visits(listing,interested,owner) VALUES(?,?,?)').run(l.id,q.session.user.id,l.owner);v={id:Number(r.lastInsertRowid)};audit(q.session.user.id,'request','visit',v.id);}s.json(v);});
app.post('/api/visits/:id/confirm',auth,(q,s)=>{const v=db.prepare('SELECT * FROM visits WHERE id=?').get(q.params.id);if(!v||![v.interested,v.owner].includes(q.session.user.id))return error(s,404,'Interacción no encontrada.');if(blocked(v.interested,v.owner))return error(s,403,'La interacción no está disponible.');const column=q.session.user.id===v.interested?'interested_confirmed':'owner_confirmed';db.prepare(`UPDATE visits SET ${column}=1 WHERE id=?`).run(v.id);audit(q.session.user.id,'confirm','visit',v.id);s.json({ok:true});});
app.post('/api/reviews',auth,(q,s)=>{const v=db.prepare('SELECT * FROM visits WHERE id=?').get(q.body.visit),rating=Number(q.body.rating),body=String(q.body.body||'').trim();if(!v||v.interested!==q.session.user.id||v.owner===q.session.user.id)return error(s,403,'No podés valorar esta interacción.');if(!v.interested_confirmed||!v.owner_confirmed)return error(s,400,'Ambas personas deben confirmar la visita.');if(blocked(v.interested,v.owner))return error(s,403,'La interacción no está disponible.');if(!Number.isInteger(rating)||rating<1||rating>5||body.length<10||body.length>1000)return error(s,400,'Elegí de 1 a 5 estrellas y escribí una reseña de 10 a 1000 caracteres.');const dimensions=['communication','accuracy','treatment'].map(k=>q.body[k]===undefined||q.body[k]===''||q.body[k]===null?null:Number(q.body[k]));if(dimensions.some(n=>n!==null&&(!Number.isInteger(n)||n<1||n>5)))return error(s,400,'Cada aspecto debe tener entre 1 y 5 estrellas.');if(db.prepare('SELECT 1 FROM reviews WHERE visit=?').get(v.id))return error(s,409,'Esta interacción ya tiene una reseña.');const r=db.prepare('INSERT INTO reviews(visit,reviewer,owner,rating,body,communication,accuracy,treatment) VALUES(?,?,?,?,?,?,?,?)').run(v.id,q.session.user.id,v.owner,rating,body,...dimensions);audit(q.session.user.id,'create','review',Number(r.lastInsertRowid));s.json({ok:true,status:'pending'});});
app.post('/api/reviews/:id/reply',auth,(q,s)=>{const r=db.prepare('SELECT * FROM reviews WHERE id=?').get(q.params.id),body=String(q.body.body||'').trim();if(!r||r.owner!==q.session.user.id||r.status!=='approved')return error(s,404,'Reseña no encontrada.');if(!body||body.length>1000)return error(s,400,'Escribí una respuesta de hasta 1000 caracteres.');db.prepare('UPDATE reviews SET response=? WHERE id=?').run(body,r.id);audit(q.session.user.id,'reply','review',r.id);s.json({ok:true});});
app.post('/api/appeals',auth,(q,s)=>{const entity=String(q.body.entity||''),id=Number(q.body.id),reason=String(q.body.reason||'').trim();if(!['listing','verification'].includes(entity)||!Number.isSafeInteger(id)||!reason||reason.length>1000)return error(s,400,'Indicá la decisión y el motivo de la apelación.');if(entity==='listing'){const l=db.prepare('SELECT owner,status FROM listings WHERE id=?').get(id);if(!l||l.owner!==q.session.user.id||l.status!=='rejected')return error(s,403,'No podés apelar esta decisión.');}else{const v=db.prepare('SELECT user,status FROM verifications WHERE user=?').get(id);if(!v||v.user!==q.session.user.id||v.status!=='rejected')return error(s,403,'No podés apelar esta decisión.');}if(db.prepare("SELECT 1 FROM appeals WHERE user=? AND entity=? AND entity_id=? AND status='pending'").get(q.session.user.id,entity,id))return error(s,409,'Ya tenés una apelación pendiente.');const r=db.prepare('INSERT INTO appeals(user,entity,entity_id,reason) VALUES(?,?,?,?)').run(q.session.user.id,entity,id,reason);audit(q.session.user.id,'create','appeal',Number(r.lastInsertRowid));s.json({ok:true});});
app.get('/api/appeals',auth,(q,s)=>s.json(db.prepare('SELECT id,entity,entity_id,reason,status,resolution,created FROM appeals WHERE user=? ORDER BY id DESC').all(q.session.user.id)));
app.get('/api/admin/review-queue',admin,(q,s)=>s.json({reviews:db.prepare("SELECT r.id,r.rating,r.communication,r.accuracy,r.treatment,r.body,r.response,r.status,r.created,l.title FROM reviews r JOIN visits v ON v.id=r.visit JOIN listings l ON l.id=v.listing WHERE r.status='pending' AND r.reviewer<>? AND r.owner<>? ORDER BY r.id DESC").all(q.session.user.id,q.session.user.id),appeals:db.prepare("SELECT a.id,a.user,a.entity,a.entity_id,a.reason,a.status,a.resolution,a.created,u.name FROM appeals a JOIN users u ON u.id=a.user WHERE a.status='pending' AND a.user<>? ORDER BY a.id DESC").all(q.session.user.id)}));
app.post('/api/admin/reviews/:id',admin,(q,s)=>{if(!['approved','rejected'].includes(q.body.status))return error(s,400,'Estado no válido.');const r=db.prepare("SELECT id,reviewer,owner FROM reviews WHERE id=? AND status='pending'").get(q.params.id);if(!r)return error(s,404,'Reseña no encontrada.');if([r.reviewer,r.owner].includes(q.session.user.id))return error(s,403,'No podés moderar tu propia reseña.');db.prepare('UPDATE reviews SET status=? WHERE id=?').run(q.body.status,r.id);audit(q.session.user.id,q.body.status,'review',r.id);s.json({ok:true});});
app.post('/api/admin/appeals/:id',admin,(q,s)=>{if(!['resolved','dismissed'].includes(q.body.status))return error(s,400,'Estado no válido.');const a=db.prepare("SELECT * FROM appeals WHERE id=? AND status='pending'").get(q.params.id),resolution=String(q.body.resolution||'').trim();if(!a)return error(s,404,'Apelación no encontrada.');if(a.user===q.session.user.id)return error(s,403,'No podés resolver tu propia apelación.');if(!resolution||resolution.length>1000)return error(s,400,'Indicá la resolución.');db.prepare('UPDATE appeals SET status=?,resolution=? WHERE id=?').run(q.body.status,resolution,a.id);audit(q.session.user.id,q.body.status,'appeal',a.id);s.json({ok:true});});

extended.routes(app, db, auth, audit);
suspension.routes(app, db, admin, audit);
require('./photo-routes')(app, db, auth,q=>!mfa.required(q));
require('./profile-photo-routes')(app, db, auth, audit);
require('./evidence-routes')(app, db, auth, audit,q=>!mfa.required(q));
require('./migrations').migrate(db);
mfa.register(app,auth,audit);
require('./chat-read-routes')(app,db,auth);
require('./notification-routes')(app, db, auth);
require('./safety-report-routes')(app,db,auth,audit,mfa);
require('./privacy-request-routes').register(app,db,auth,admin,audit);
require('./staff-routes')(app, db, mfa, audit);
availability.setup(db);
function runAvailability(){
 try { availability.run(db,availabilitySettings); }
 catch(err) { console.error('No se pudo procesar la disponibilidad:',err); }
}
runAvailability();
setInterval(runAvailability,60*60*1000).unref();
app.use((err,q,s,next)=>{console.error(err);if(!s.headersSent)error(s,500,'Ocurrió un error.');});
const port=Number(process.env.PORT)||3000;app.listen(port,'127.0.0.1',()=>console.log(`Vivienda GT en http://localhost:${port}`));
