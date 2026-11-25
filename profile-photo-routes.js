'use strict';
const multer = require('multer');
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const upload = multer({storage:multer.memoryStorage(), limits:{files:1,fileSize:6*1024*1024,parts:1}}).single('photo');

// Profile photos are intentionally public after upload. They contain no private account data.
module.exports = function profilePhotoRoutes(app, db, auth, audit) {
  const root = process.env.PROFILE_PHOTO_DIR || path.join(__dirname, 'profile-photos');
  const keyPattern = /^[a-f0-9]{32}$/;
  const nameFromUrl = url => /^\/api\/profile-photos\/([a-f0-9]{32})$/.exec(url || '')?.[1] || null;
  app.get('/api/profile-photos/:id', async (q,s) => {
    if (!keyPattern.test(q.params.id)) return s.sendStatus(404);
    const profile = db.prepare('SELECT p.user FROM user_profiles p JOIN users u ON u.id=p.user WHERE p.photo_url=? AND u.suspended=0').get('/api/profile-photos/'+q.params.id);
    if (!profile) return s.sendStatus(404);
    s.set('X-Content-Type-Options','nosniff').set('Cache-Control','public, max-age=3600').type('image/webp');
    try { await fs.access(path.join(root,q.params.id+'.webp')); return s.sendFile(path.resolve(root,q.params.id+'.webp')); }
    catch { return s.sendStatus(404); }
  });
  app.post('/api/account/profile/photo', auth, (q,s) => upload(q,s,async err => {
    if (err || !q.file) return s.status(400).json({error:'Seleccioná una imagen JPEG, PNG o WebP de hasta 6 MB.'});
    let fileId=null;
    try {
      const photo=sharp(q.file.buffer,{limitInputPixels:40000000,failOn:'error'});
      const metadata=await photo.metadata();
      if (!['jpeg','png','webp'].includes(metadata.format)||metadata.pages>1) throw new Error('invalid');
      const data=await photo.rotate().resize({width:800,height:800,fit:'cover',position:'attention',withoutEnlargement:true}).webp({quality:82}).toBuffer();
      fileId=crypto.randomBytes(16).toString('hex');
      await fs.mkdir(root,{recursive:true,mode:0o700});
      await fs.writeFile(path.join(root,fileId+'.webp'),data,{mode:0o600,flag:'wx'});
      const previous=db.prepare('SELECT photo_url FROM user_profiles WHERE user=?').get(q.session.user.id);
      const name=db.prepare('SELECT name FROM users WHERE id=?').get(q.session.user.id)?.name || '';
      const url='/api/profile-photos/'+fileId;
      db.prepare('INSERT INTO user_profiles(user,public_name,photo_url) VALUES(?,?,?) ON CONFLICT(user) DO UPDATE SET photo_url=excluded.photo_url,updated=CURRENT_TIMESTAMP').run(q.session.user.id,name,url);
      audit(q.session.user.id,'update_photo','profile',q.session.user.id);
      const oldId=nameFromUrl(previous?.photo_url);
      if(oldId) await fs.rm(path.join(root,oldId+'.webp'),{force:true}).catch(()=>{});
      return s.json({photo_url:url});
    } catch {
      if(fileId) await fs.rm(path.join(root,fileId+'.webp'),{force:true}).catch(()=>{});
      return s.status(400).json({error:'No se pudo procesar la imagen. Usá JPEG, PNG o WebP de hasta 6 MB.'});
    }
  }));
  app.post('/api/account/profile/photo/delete', auth, async (q,s) => {
    const old=db.prepare('SELECT photo_url FROM user_profiles WHERE user=?').get(q.session.user.id);
    db.prepare("UPDATE user_profiles SET photo_url='',updated=CURRENT_TIMESTAMP WHERE user=?").run(q.session.user.id);
    audit(q.session.user.id,'remove_photo','profile',q.session.user.id);
    const oldId=nameFromUrl(old?.photo_url);
    if(oldId) await fs.rm(path.join(root,oldId+'.webp'),{force:true}).catch(()=>{});
    s.json({ok:true});
  });
};
