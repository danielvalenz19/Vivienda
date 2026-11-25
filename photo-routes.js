'use strict';
const multer = require('multer');
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const upload = multer({storage: multer.memoryStorage(),limits:{files:8,fileSize:6*1024*1024,parts:8}}).array('photos',8);
module.exports = function photoRoutes(app,db,auth,adminAllowed = () => true) {
 const availabilityDays=require('./availability').config().days;
 const root = process.env.PHOTO_DIR || path.join(__dirname,'uploads');
 db.exec('CREATE TABLE IF NOT EXISTS listing_photos(id TEXT PRIMARY KEY,listing INTEGER NOT NULL REFERENCES listings(id),created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
 if (!db.prepare('PRAGMA table_info(listing_photos)').all().some(c=>c.name==='position')) db.exec('ALTER TABLE listing_photos ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
 function canView(l,q){const u=q.session.user;return l && ((l.status==='active' && !l.owner_suspended && l.confirmed && Date.parse(l.confirmed.replace(' ','T')+'Z')>=Date.now()-availabilityDays*86400000) || u?.id===l.owner || (u?.role==='admin' && adminAllowed(q)));}
 app.get('/api/photo-index',(q,s)=>{const rows=db.prepare("SELECT p.id,p.listing FROM listing_photos p JOIN listings l ON l.id=p.listing JOIN users u ON u.id=l.owner WHERE l.status='active' AND u.suspended=0 AND datetime(l.confirmed)>=datetime('now',?) ORDER BY p.position,p.rowid").all('-'+availabilityDays+' days');s.json(rows)});
 app.get('/api/listings/:id/photos',(q,s)=>{const l=db.prepare('SELECT l.owner,l.status,l.confirmed,u.suspended owner_suspended FROM listings l JOIN users u ON u.id=l.owner WHERE l.id=?').get(q.params.id);if(!canView(l,q))return s.sendStatus(404);s.json(db.prepare('SELECT id FROM listing_photos WHERE listing=? ORDER BY position,rowid').all(q.params.id));});
 app.get('/api/photos/:id',async(q,s)=>{if(!/^[a-f0-9]{32}$/.test(q.params.id))return s.sendStatus(404);let p=db.prepare('SELECT l.owner,l.status,l.confirmed,u.suspended owner_suspended FROM listing_photos p JOIN listings l ON l.id=p.listing JOIN users u ON u.id=l.owner WHERE p.id=?').get(q.params.id);if(!canView(p,q))return s.sendStatus(404);s.set('X-Content-Type-Options','nosniff').type('image/webp');try{s.sendFile(path.join(root,q.params.id+'.webp'));}catch{return s.sendStatus(404)}});
 app.post('/api/listings/:id/photos',auth,(q,s)=>{
  const initial=db.prepare('SELECT owner,status FROM listings WHERE id=?').get(q.params.id);
  if(!initial||initial.owner!==q.session.user.id||initial.status==='suspended')return s.sendStatus(404);
  upload(q,s,async err=>{
   if(err)return s.status(400).json({error:'Máximo 8 fotos de 6 MB cada una.'});
   if(!q.files?.length)return s.status(400).json({error:'Seleccioná fotos JPEG, PNG o WebP.'});
   const ready=[],written=[];let transaction=false;
   try{
    for(const file of q.files){const img=sharp(file.buffer,{limitInputPixels:40000000,failOn:'error'}),meta=await img.metadata();if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1)throw Error('invalid');const data=await img.rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();ready.push({id:crypto.randomBytes(16).toString('hex'),data})}
    await fs.mkdir(root,{recursive:true,mode:0o700});
    for(const photo of ready){await fs.writeFile(path.join(root,photo.id+'.webp'),photo.data,{mode:0o600,flag:'wx'});written.push(photo.id)}
    db.exec('BEGIN IMMEDIATE');transaction=true;
    const current=db.prepare('SELECT l.owner,l.status,u.suspended owner_suspended FROM listings l JOIN users u ON u.id=l.owner WHERE l.id=?').get(q.params.id);
    if(!current||current.owner!==q.session.user.id||current.owner_suspended||current.status==='suspended'){const e=Error('state');e.publicStatus=404;throw e}
    let n=db.prepare('SELECT COUNT(*) n FROM listing_photos WHERE listing=?').get(q.params.id).n;
    if(n+ready.length>8){const e=Error('limit');e.publicStatus=400;e.publicMessage='Cada anuncio admite hasta 8 fotos.';throw e}
    for(const photo of ready)db.prepare('INSERT INTO listing_photos(id,listing,position) VALUES(?,?,?)').run(photo.id,q.params.id,n++);
    if(['active','paused','rented','expired'].includes(current.status))db.prepare("UPDATE listings SET status='pending',authorization='pending' WHERE id=?").run(q.params.id);
    db.exec('COMMIT');transaction=false;s.json({photos:ready.map(photo=>photo.id)});
   }catch(e){if(transaction)try{db.exec('ROLLBACK')}catch{}await Promise.all(written.map(id=>fs.rm(path.join(root,id+'.webp'),{force:true}).catch(()=>{})));if(e.publicStatus===404)return s.sendStatus(404);s.status(400).json({error:e.publicMessage||'Una foto no es válida o no pudo procesarse. Usá JPEG, PNG o WebP.'})}
  });
 });
 app.post('/api/listings/:id/photos/order',auth,(q,s)=>{const l=db.prepare('SELECT owner,status FROM listings WHERE id=?').get(q.params.id);if(!l||l.owner!==q.session.user.id||l.status==='suspended')return s.sendStatus(404);const current=db.prepare('SELECT id FROM listing_photos WHERE listing=?').all(q.params.id).map(x=>x.id);const ids=q.body?.ids;if(!Array.isArray(ids)||ids.length!==current.length||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!current.includes(id)))return s.status(400).json({error:'La lista de fotografías no coincide con el anuncio.'});db.exec('BEGIN');try{const set=db.prepare('UPDATE listing_photos SET position=? WHERE listing=? AND id=?');ids.forEach((id,i)=>set.run(i,q.params.id,id));if(['active','paused','rented','expired'].includes(l.status))db.prepare("UPDATE listings SET status='pending',authorization='pending' WHERE id=?").run(q.params.id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}s.json({ok:true})});
 app.post('/api/photos/:id/delete',auth,async(q,s)=>{let p=db.prepare('SELECT p.id,l.owner,l.status,l.id listing FROM listing_photos p JOIN listings l ON l.id=p.listing WHERE p.id=?').get(q.params.id);if(!p||p.owner!==q.session.user.id||p.status==='suspended')return s.sendStatus(404);db.prepare('DELETE FROM listing_photos WHERE id=?').run(p.id);if(['active','paused','rented','expired'].includes(p.status))db.prepare("UPDATE listings SET status='pending',authorization='pending' WHERE id=?").run(p.listing);await fs.rm(path.join(root,p.id+'.webp'),{force:true});s.json({ok:true});});
};
