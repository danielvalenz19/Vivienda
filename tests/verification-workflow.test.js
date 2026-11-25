'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {fixture}=require('./fixture-server');

function client(url){
 let cookie='';
 async function request(route,data){
  let token;
  if(data!==undefined){const csrf=await request('/csrf');token=csrf.body.token}
  const headers={};if(cookie)headers.cookie=cookie;
  if(data!==undefined){headers['content-type']='application/json';headers.origin=url;headers['x-csrf-token']=token}
  const r=await fetch(url+'/api'+route,{method:data===undefined?'GET':'POST',headers,body:data===undefined?undefined:JSON.stringify(data)});
  const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
  return {status:r.status,body:await r.json().catch(()=>null)};
 }
 return request;
}

test('identidad manual: corrección, reenvío, revocación y nombre público',async t=>{
 const f=await fixture();t.after(()=>f.close());const db=new DatabaseSync(f.dbPath);
 const password=db.prepare("SELECT password FROM users WHERE id=?").get(f.owner).password;
 const verifier=Number(db.prepare("INSERT INTO users(name,email,password,role) VALUES('Persona verificadora','verifier@example.invalid',?,'verifier')").run(password).lastInsertRowid);
 const pending=db.prepare("SELECT id FROM users WHERE email='pending@example.test'").get().id;
 db.prepare("INSERT INTO user_profiles(user,public_name,bio) VALUES(?,'Residencias de ejemplo','Presentación ficticia')").run(f.owner);
 const owner=client(f.url),person=client(f.url),staff=client(f.url),admin=client(f.url),guest=client(f.url);
 for(const [c,email] of [[owner,'owner@example.test'],[person,'pending@example.test'],[staff,'verifier@example.invalid'],[admin,'admin@example.test']])assert.equal((await c('/login',{email,password:'BrowserTest123!'})).status,200);
 const publicList=(await guest('/listings')).body;
 assert.equal(publicList[0].owner_name,'Residencias de ejemplo');
 const profile=(await guest('/profiles/'+f.owner)).body;assert.equal(profile.name,'Residencias de ejemplo');
 assert.equal(JSON.stringify(profile).includes('Dueña Prueba'),false);
 assert.equal((await staff('/staff/verifications/'+pending,{status:'needs_correction',note:'corto'})).status,400);
 assert.equal((await staff('/staff/verifications/'+pending,{status:'needs_correction',note:'Aclarar los datos del perfil público.'})).status,200);
 let state=(await person('/verification')).body;assert.equal(state.status,'needs_correction');assert.match(state.note,/Aclarar/);
 assert.equal((await person('/verification',{})).status,400);
 assert.equal((await person('/verification',{user_note:'Ya corregí la información solicitada.'})).status,200);
 const queue=(await staff('/staff/verification')).body;assert.match(queue.verifications.find(v=>v.user===pending).user_note,/Ya corregí/);
 assert.equal((await staff('/staff/verifications/'+pending,{status:'approved'})).status,200);
 assert.equal((await person('/verification')).body.status,'approved');
 assert.equal((await staff('/staff/verifications/'+f.owner,{status:'revoked',note:'Motivo de revocación suficiente'})).status,400);
 assert.equal((await admin('/admin/verifications/'+f.owner,{status:'revoked',note:'corto'})).status,400);
 assert.equal((await admin('/admin/verifications/'+f.owner,{status:'revoked',note:'Revisión manual de autorización pendiente.'})).status,200);
 assert.equal((await owner('/verification')).body.status,'revoked');
 assert.equal(db.prepare('SELECT status FROM listings WHERE id=?').get(f.listing).status,'paused');
 assert.equal((await guest('/listings')).body.length,0);
 assert.equal((await owner('/listings/'+f.listing+'/status',{status:'active'})).status,400);
 assert.ok(db.prepare("SELECT 1 FROM audit WHERE actor=? AND action='needs_correction' AND entity_id=?").get(verifier,pending));
 assert.ok(db.prepare("SELECT 1 FROM audit WHERE action='revoked' AND entity_id=? AND length(reason)>=10").get(f.owner));
 assert.ok(db.prepare("SELECT count(*) n FROM notifications WHERE user=? AND kind='verification'").get(f.owner).n>=1);
 db.close();
});

test('administración no ve identidades de denunciantes ni decide en casos propios',async t=>{
 const f=await fixture();t.after(()=>f.close());const db=new DatabaseSync(f.dbPath);
 const adminId=db.prepare("SELECT id FROM users WHERE email='admin@example.test'").get().id;
 const own=Number(db.prepare("INSERT INTO listings(owner,title,city,area,type,price,description,status,confirmed) VALUES(?,'Publicación admin','Xela','Zona 1','Cuarto',1000,'Descripción de prueba','active',CURRENT_TIMESTAMP)").run(adminId).lastInsertRowid);
 const reportOwn=Number(db.prepare("INSERT INTO reports(listing,reporter,reason) VALUES(?,?,'Denuncia sobre admin')").run(own,f.guest).lastInsertRowid);
 const reportByAdmin=Number(db.prepare("INSERT INTO reports(listing,reporter,reason) VALUES(?,?,'Reporte del admin')").run(f.listing,adminId).lastInsertRowid);
 const reportAllowed=Number(db.prepare("INSERT INTO reports(listing,reporter,reason) VALUES(?,?,'Reporte ajeno')").run(f.listing,f.guest).lastInsertRowid);
 const visitOwn=Number(db.prepare('INSERT INTO visits(listing,interested,owner,interested_confirmed,owner_confirmed) VALUES(?,?,?,1,1)').run(own,f.guest,adminId).lastInsertRowid);
 const reviewOwn=Number(db.prepare("INSERT INTO reviews(visit,reviewer,owner,rating,body) VALUES(?,?,?,5,'Reseña sobre admin')").run(visitOwn,f.guest,adminId).lastInsertRowid);
 const visitAllowed=Number(db.prepare('INSERT INTO visits(listing,interested,owner,interested_confirmed,owner_confirmed) VALUES(?,?,?,1,1)').run(f.listing,f.guest,f.owner).lastInsertRowid);
 const reviewAllowed=Number(db.prepare("INSERT INTO reviews(visit,reviewer,owner,rating,body) VALUES(?,?,?,5,'Reseña de otra cuenta')").run(visitAllowed,f.guest,f.owner).lastInsertRowid);
 const appealOwn=Number(db.prepare("INSERT INTO appeals(user,entity,entity_id,reason) VALUES(?,'verification',?,'Apelación del administrador')").run(adminId,adminId).lastInsertRowid);
 const admin=client(f.url);assert.equal((await admin('/login',{email:'admin@example.test',password:'BrowserTest123!'})).status,200);
 const reports=(await admin('/admin')).body.reports;
 assert.ok(reports.some(r=>r.id===reportAllowed));assert.ok(!reports.some(r=>[reportOwn,reportByAdmin].includes(r.id)));assert.ok(reports.every(r=>!('reporter' in r)));
 assert.equal((await admin('/admin/reports/'+reportOwn,{status:'resolved'})).status,403);
 assert.equal((await admin('/admin/reports/'+reportByAdmin,{status:'resolved'})).status,403);
 const queue=(await admin('/admin/review-queue')).body;
 assert.ok(queue.reviews.some(r=>r.id===reviewAllowed));assert.ok(!queue.reviews.some(r=>r.id===reviewOwn));assert.ok(queue.reviews.every(r=>!('reviewer' in r)));
 assert.ok(!queue.appeals.some(a=>a.id===appealOwn));
 assert.equal((await admin('/admin/appeals/'+appealOwn,{status:'resolved',resolution:'Resolución inválida por conflicto'})).status,403);
 db.close();
});
