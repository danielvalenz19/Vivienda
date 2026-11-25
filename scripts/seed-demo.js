'use strict';
// Seeds only the dedicated demo database. Never point this script at real user data.
const path=require('path');
const {spawn}=require('child_process');
const {DatabaseSync}=require('node:sqlite');
const bcrypt=require('bcryptjs');
const fs=require('node:fs');
const crypto=require('node:crypto');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const dbPath=path.join(root,'demo.sqlite');
async function initialize(){
  // Let the application own its schema and migrations, then shut down before writing.
  const port=31000+Math.floor(Math.random()*20000);
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,DB_PATH:dbPath,PHOTO_DIR:path.join(root,'demo-uploads'),EVIDENCE_DIR:path.join(root,'demo-private-evidence'),PORT:String(port)},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{
    let errors='';const timer=setTimeout(()=>{child.kill();reject(new Error('Tiempo de espera al inicializar la base demo. '+errors));},15000);
    child.stderr.on('data',d=>errors+=d.toString());
    child.on('error',e=>{clearTimeout(timer);reject(e)});
    child.on('exit',code=>{clearTimeout(timer);if(code!==null&&code!==0)reject(new Error('No se pudo inicializar la base demo: '+errors));});
    child.stdout.on('data',d=>{if(d.toString().includes('Vivienda GT en')){clearTimeout(timer);child.once('exit',()=>resolve());child.kill('SIGTERM');}});
  });
}
async function main(){
 await initialize(); const db=new DatabaseSync(dbPath);db.exec('PRAGMA foreign_keys=ON');
 const password=await bcrypt.hash('Demo2026!',12);
 const accounts=[['Administración Demo','admin@demo.vivienda.gt','admin'],['Moderación Demo','moderador@demo.vivienda.gt','moderator'],['Verificación Demo','verificador@demo.vivienda.gt','verifier'],['Cuenta suspendida Demo','suspendido@demo.vivienda.gt','user'],['Ana Demo · Anunciante','anunciante@demo.vivienda.gt','user'],['Luis Demo · Interesado','inquilino@demo.vivienda.gt','user'],['María Demo · Pendiente','pendiente@demo.vivienda.gt','user'],['Carlos Demo · Rechazado','rechazado@demo.vivienda.gt','user'],['Sofía Demo · Anunciante','anunciante2@demo.vivienda.gt','user']];
 let createdEvidencePath;
 db.exec('BEGIN');try{
  for(const [name,email,role] of accounts){const created=db.prepare('INSERT OR IGNORE INTO users(name,email,password,role) VALUES(?,?,?,?)').run(name,email,password,role);if(email==='suspendido@demo.vivienda.gt'&&created.changes)db.prepare('UPDATE users SET suspended=1 WHERE email=?').run(email);}
  const id=email=>db.prepare('SELECT id FROM users WHERE email=?').get(email).id;
  const owner=id('anunciante@demo.vivienda.gt'),guest=id('inquilino@demo.vivienda.gt'),pending=id('pendiente@demo.vivienda.gt'),rejected=id('rechazado@demo.vivienda.gt');
  db.prepare("INSERT OR IGNORE INTO verifications(user,status,note,reviewed) VALUES(?,'approved','Registro ficticio para demostración',CURRENT_TIMESTAMP)").run(owner);
  const secondOwner=id('anunciante2@demo.vivienda.gt');
  db.prepare("INSERT OR IGNORE INTO verifications(user,status,note,reviewed) VALUES(?,'approved','Registro ficticio para demostración',CURRENT_TIMESTAMP)").run(secondOwner);
  db.prepare("INSERT OR IGNORE INTO verifications(user,status,note) VALUES(?,'pending','Solicitud ficticia para demostración')").run(pending);
  db.prepare("INSERT OR IGNORE INTO verifications(user,status,note,reviewed) VALUES(?,'rejected','DEMO: La evidencia necesita una corrección.',CURRENT_TIMESTAMP)").run(rejected);
  const entries=[
   ['DEMO · Apartamento en zona 10','Ciudad de Guatemala','Zona 10','Apartamento',4700,4700,2,2,'/assets/demo/vivienda-1.jpg','active','approved','Agua, internet','Sí','Sí','Consultar'],
   ['DEMO · Estudio en zona 4','Ciudad de Guatemala','Zona 4','Apartamento',3200,3200,1,1,'/assets/demo/vivienda-2.jpg','active','approved','Agua','No','Sí','No'],
   ['DEMO · Apartamento en zona 11','Ciudad de Guatemala','Zona 11','Apartamento',3900,3900,2,1,'/assets/demo/vivienda-3.jpg','active','approved','Agua, extracción de basura','Sí','No','Consultar'],
   ['DEMO · Cuarto en zona 15','Ciudad de Guatemala','Zona 15','Cuarto',1800,1800,1,1,'/assets/demo/vivienda-4.jpg','active','approved','Agua, internet, electricidad','No','Sí','No'],
   ['DEMO · Apartamento en Xela','Xela','Zona 3','Apartamento',2500,2500,2,1,'/assets/demo/vivienda-5.jpg','active','approved','Agua, internet','Sí','No','Consultar'],
   ['DEMO · Cuarto en el centro','Xela','Zona 1','Cuarto',1200,1200,1,1,'/assets/demo/vivienda-4.jpg','active','approved','Agua, electricidad','No','Sí','No'],
   ['DEMO · Apartamento cerca de zona 9','Xela','Zona 9','Apartamento',2900,2900,2,1,'/assets/demo/vivienda-3.jpg','active','approved','Agua','Sí','No','Sí'],
   ['DEMO · Apartamento pausado','Xela','Zona 3','Apartamento',2200,2200,1,1,'','paused','approved','Agua','No','No','Consultar'],
   ['DEMO · Solicitud pendiente de revisión','Ciudad de Guatemala','Zona 5','Cuarto',1400,1400,1,1,'','pending','pending','Agua','No','No','Consultar']
  ];
  // Additional varied sample records: the majority are in Quetzaltenango.
  const xelaZones=['Zona 1','Zona 2','Zona 3','Zona 5','Zona 7','Zona 8','Zona 9','Zona 10'];
  const capitalZones=['Zona 1','Zona 4','Zona 10','Zona 14'];
  for(let i=1;i<=28;i++){
    const xela=i<=24, type=i%3===0?'Cuarto':'Apartamento';
    const area=xela?xelaZones[(i-1)%xelaZones.length]:capitalZones[(i-25)%capitalZones.length];
    const price=(type==='Cuarto'?850:1750)+(i%8)*250;
    entries.push([`DEMO · ${type} ${area} ${String(i).padStart(2,'0')}`,xela?'Xela':'Ciudad de Guatemala',area,type,price,price,type==='Cuarto'?1:1+i%3,1+i%2,`/assets/demo/vivienda-${1+i%5}.jpg`,'active','approved',i%2?'Agua, internet':'Agua, electricidad',i%2?'Sí':'No',i%3?'No':'Sí',i%2?'Consultar':'Sí']);
  }
  const find=db.prepare('SELECT id FROM listings WHERE owner=? AND title=?');
  const insert=db.prepare('INSERT INTO listings(owner,title,city,area,type,price,deposit,rooms,baths,image,status,authorization,services,parking,furnished,pets,description,conditions,confirmed) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)');
  for(const [title,city,area,type,price,deposit,rooms,baths,image,status,auth,services,parking,furnished,pets] of entries){const who=status==='pending'?pending:owner;if(!find.get(who,title))insert.run(who,title,city,area,type,price,deposit,rooms,baths,image,status,auth,services,parking,furnished,pets,'Datos ficticios para demostración. Esta vivienda no está disponible para alquiler.','Condiciones ficticias para probar la aplicación.');}
  const otherOwnerTitle='DEMO · Habitación de Sofía en Xela';
  if(!find.get(secondOwner,otherOwnerTitle))insert.run(secondOwner,otherOwnerTitle,'Xela','Zona 1','Cuarto',1450,1450,1,1,'/assets/demo/vivienda-4.jpg','active','approved','Agua, internet','No','Sí','Consultar','Vivienda ficticia para probar conversaciones entre anunciantes.','Condiciones ficticias.');
  const rejectionTitle='DEMO · Anuncio rechazado';
  if(!find.get(rejected,rejectionTitle)) insert.run(rejected,rejectionTitle,'Xela','Zona 3','Cuarto',1200,1200,1,1,'','rejected','rejected','Agua','No','No','Consultar','Anuncio ficticio para demostrar una revisión rechazada.','Condiciones ficticias.');
  const first=find.get(owner,entries[0][0]).id,other=find.get(owner,entries[4][0]).id,paused=find.get(owner,entries[7][0]).id;
  for(const listing of [first,other,paused])db.prepare('INSERT OR IGNORE INTO favorites(user,listing) VALUES(?,?)').run(guest,listing);
  const msg='DEMO: Hola, ¿podemos conversar sobre este espacio ficticio?';
  if(!db.prepare('SELECT id FROM messages WHERE listing=? AND sender=? AND recipient=? AND body=?').get(first,guest,owner,msg))db.prepare('INSERT INTO messages(listing,sender,recipient,body) VALUES(?,?,?,?)').run(first,guest,owner,msg);
  const response='DEMO: Claro, este mensaje es solo para probar la conversación.';
  if(!db.prepare('SELECT id FROM messages WHERE listing=? AND sender=? AND recipient=? AND body=?').get(first,owner,guest,response))db.prepare('INSERT INTO messages(listing,sender,recipient,body) VALUES(?,?,?,?)').run(first,owner,guest,response);
  const reason='DEMO: Reporte de ejemplo para probar moderación.';
  if(!db.prepare('SELECT id FROM reports WHERE listing=? AND reporter=? AND reason=?').get(other,guest,reason))db.prepare('INSERT INTO reports(listing,reporter,reason) VALUES(?,?,?)').run(other,guest,reason);
  // Confirmed fictitious interactions demonstrate published and pending reviews.
  for(const [listing,rating,body,status] of [[first,5,'DEMO: La comunicación de ejemplo fue clara y respetuosa.','approved'],[other,4,'DEMO: La visita ficticia sirvió para conocer las condiciones.','pending']]){
    db.prepare('INSERT OR IGNORE INTO visits(listing,interested,owner,interested_confirmed,owner_confirmed) VALUES(?,?,?,?,?)').run(listing,guest,owner,1,1);
    const visit=db.prepare('SELECT id FROM visits WHERE listing=? AND interested=?').get(listing,guest).id;
    db.prepare('INSERT OR IGNORE INTO reviews(visit,reviewer,owner,rating,body,status) VALUES(?,?,?,?,?,?)').run(visit,guest,owner,rating,body,status);
  }
  const rejectedListing=find.get(rejected,rejectionTitle).id;
  if(!db.prepare("SELECT id FROM appeals WHERE user=? AND entity='listing' AND entity_id=?").get(rejected,rejectedListing)) db.prepare("INSERT INTO appeals(user,entity,entity_id,reason) VALUES(?,'listing',?,'DEMO: Solicito una nueva revisión de la decisión ficticia.')").run(rejected,rejectedListing);
  // A fake authorization document lets moderators exercise the pending demo listing.
  // The marker prevents a later seed run from recreating evidence deliberately removed during testing.
  db.exec('CREATE TABLE IF NOT EXISTS demo_seed_markers (key TEXT PRIMARY KEY)');
  if(!db.prepare('SELECT 1 FROM demo_seed_markers WHERE key=?').get('pending-evidence-v1')){
    const demoEvidenceDir=path.join(root,'demo-private-evidence');fs.mkdirSync(demoEvidenceDir,{recursive:true,mode:0o700});
    const evidenceId=crypto.randomBytes(16).toString('hex');createdEvidencePath=path.join(demoEvidenceDir,evidenceId+'.webp');
    const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="white"/><text x="55" y="120" font-family="sans-serif" font-size="38" fill="#1b392c">DOCUMENTO FICTICIO</text><text x="55" y="195" font-family="sans-serif" font-size="27" fill="#1b392c">Solo para pruebas de ViviendaGT</text><text x="55" y="270" font-family="sans-serif" font-size="23" fill="#1b392c">No representa autorización real.</text></svg>');
    const bytes=await sharp(svg).webp({quality:80}).toBuffer();fs.writeFileSync(createdEvidencePath,bytes,{mode:0o600,flag:'wx'});
    const pendingListing=find.get(pending,'DEMO · Solicitud pendiente de revisión').id;
    db.prepare("INSERT INTO listing_evidence(id,listing,owner,expires) VALUES(?,?,?,datetime('now','+30 days'))").run(evidenceId,pendingListing,pending);
    db.prepare('INSERT INTO demo_seed_markers(key) VALUES(?)').run('pending-evidence-v1');
  }
  db.exec('COMMIT'); console.log('Base de demostración lista: '+dbPath);console.log('Cuentas y contraseña: DEMO.md');
 }catch(e){db.exec('ROLLBACK');if(createdEvidencePath)try{fs.unlinkSync(createdEvidencePath)}catch{}throw e}finally{db.close()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
