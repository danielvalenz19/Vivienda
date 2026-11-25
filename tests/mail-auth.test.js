'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const express=require('express');
const bcrypt=require('bcryptjs');
const {registerMailAuth,smtpConfiguration}=require('../mail-auth-routes');

test('correo transaccional de prueba: tokens de un uso, caducidad y revocación',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,password TEXT,auth_version INTEGER DEFAULT 0); INSERT INTO users(id,email,password) VALUES(1,'demo@example.invalid','old');");
  const deliveries=[],revoked=[];
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.session={user:{id:1}};next()});
  registerMailAuth(app,db,{destroyUser:id=>revoked.push(id)},{from:'ViviendaGT <test@example.invalid>',transport:{sendMail:async message=>deliveries.push(message)}});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
  const base='http://127.0.0.1:'+server.address().port;
  const post=(url,data)=>fetch(base+url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  const extract=message=>message.text.match(/[A-Za-z0-9_-]{43}/)[0];
  try{
    const unknown=await post('/api/auth/request-reset',{email:'absent@example.invalid'});
    const known=await post('/api/auth/request-reset',{email:'demo@example.invalid'});
    assert.deepEqual(await known.json(),await unknown.json());
    assert.equal(deliveries.length,1);
    const reset=extract(deliveries[0]);
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM mail_auth_tokens').all()).includes(reset),false);
    assert.equal((await post('/api/auth/use-token',{purpose:'reset',token:reset,password:'NewPassword123!'})).status,200);
    assert.equal((await post('/api/auth/use-token',{purpose:'reset',token:reset,password:'NewPassword123!'})).status,400);
    assert.equal(await bcrypt.compare('NewPassword123!',db.prepare('SELECT password FROM users').get().password),true);
    assert.deepEqual(revoked,[1]);
    await post('/api/auth/request-confirmation',{email:'demo@example.invalid'});
    const confirmation=extract(deliveries.at(-1));
    assert.equal((await post('/api/auth/use-token',{purpose:'confirm',token:confirmation})).status,200);
    assert.equal((await (await fetch(base+'/api/auth/contact-status')).json()).confirmed,true);
    await post('/api/auth/request-reset',{email:'demo@example.invalid'});
    const expired=extract(deliveries.at(-1));
    db.prepare('UPDATE mail_auth_tokens SET expires_at=0 WHERE used_at IS NULL').run();
    assert.equal((await post('/api/auth/use-token',{purpose:'reset',token:expired,password:'NewPassword123!'})).status,400);
  }finally{await new Promise(resolve=>server.close(resolve));db.close()}
});

test('SMTP requiere configuración coherente y TLS sin desactivar validación',()=>{
  assert.equal(smtpConfiguration({}),null);
  assert.throws(()=>smtpConfiguration({SMTP_HOST:'localhost'}));
  const cfg=smtpConfiguration({SMTP_HOST:'smtp.example.invalid',SMTP_FROM:'demo@example.invalid',SMTP_PORT:'587'});
  assert.equal(cfg.transport.options.requireTLS,true);
});
