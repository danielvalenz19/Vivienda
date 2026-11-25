'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {DatabaseSync}=require('node:sqlite');
const {schema,register}=require('../privacy-request-routes');

test('solicitudes de privacidad son persistentes, privadas y no eliminan la cuenta',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`PRAGMA foreign_keys=ON;
  CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,email TEXT);
  INSERT INTO users VALUES(1,'Una persona','uno@example.invalid'),(2,'Otra persona','dos@example.invalid'),(3,'Administración','admin@example.invalid');
  CREATE TABLE notifications(user INTEGER,kind TEXT,entity INTEGER,text TEXT);
  CREATE TABLE audit(actor INTEGER,action TEXT,entity TEXT,entity_id INTEGER);`);
 db.exec(schema);
 const app=express();app.use(express.json());app.use((req,res,next)=>{const id=Number(req.get('x-user'));if(id)req.session={user:{id,role:id===3?'admin':'user'}};next()});
 const auth=(req,res,next)=>req.session?.user?next():res.sendStatus(401);
 const admin=(req,res,next)=>req.session?.user?.role==='admin'?next():res.sendStatus(403);
 register(app,db,auth,admin,(actor,action,entity,id)=>db.prepare('INSERT INTO audit VALUES(?,?,?,?)').run(actor,action,entity,id));
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance))});
 const base='http://127.0.0.1:'+server.address().port;
 async function call(path,user,data){const headers={'content-type':'application/json'};if(user)headers['x-user']=String(user);const response=await fetch(base+path,{method:data===undefined?'GET':'POST',headers,body:data===undefined?undefined:JSON.stringify(data)});return {status:response.status,body:await response.json().catch(()=>null)}}
 try {
  assert.equal((await call('/api/privacy/requests',0)).status,401);
  assert.equal((await call('/api/privacy/requests',1,{kind:'deletion',detail:'corto'})).status,400);
  const created=await call('/api/privacy/requests',1,{kind:'deletion',detail:'Solicito eliminar mi cuenta de prueba.'});
  assert.equal(created.status,201);
  assert.equal((await call('/api/privacy/requests',1,{kind:'deletion',detail:'Solicitud duplicada de prueba.'})).status,409);
  assert.equal((await call('/api/privacy/requests',2)).body.length,0);
  assert.equal((await call('/api/admin/privacy/requests',1)).status,403);
  assert.equal((await call('/api/admin/privacy/requests',3)).body[0].id,created.body.id);
  assert.equal((await call('/api/admin/privacy/requests/'+created.body.id,3,{status:'resolved',response:'La solicitud se revisó.'})).status,409);
  assert.equal((await call('/api/admin/privacy/requests/'+created.body.id,3,{status:'in_review'})).status,200);
  assert.equal((await call('/api/admin/privacy/requests/'+created.body.id,3,{status:'resolved',response:'corto'})).status,400);
  assert.equal((await call('/api/admin/privacy/requests/'+created.body.id,3,{status:'resolved',response:'Revisión completada de manera manual.'})).status,200);
  assert.equal((await call('/api/admin/privacy/requests/'+created.body.id,3,{status:'in_review'})).status,409);
  const own=(await call('/api/privacy/requests',1)).body[0];assert.equal(own.status,'resolved');assert.match(own.response,/manual/);
  assert.equal(db.prepare('SELECT count(*) n FROM users WHERE id=1').get().n,1,'cambiar estado no elimina cuentas');
  assert.equal(db.prepare('SELECT count(*) n FROM notifications WHERE user=1').get().n,2);
  assert.equal(db.prepare('SELECT count(*) n FROM audit').get().n,2);
  const self=await call('/api/privacy/requests',3,{kind:'access',detail:'Solicito revisar mis datos de prueba.'});
  assert.equal((await call('/api/admin/privacy/requests/'+self.body.id,3,{status:'in_review'})).status,403);
 } finally {await new Promise(resolve=>server.close(resolve));db.close()}
});
