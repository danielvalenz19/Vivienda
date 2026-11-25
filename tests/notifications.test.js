'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {DatabaseSync} = require('node:sqlite');

test('notificaciones persistentes son privadas, genéricas y marcables como leídas', async () => {
  const db=new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY);
    CREATE TABLE messages(id INTEGER PRIMARY KEY,listing INTEGER,sender INTEGER,recipient INTEGER,body TEXT);
    CREATE TABLE listings(id INTEGER PRIMARY KEY,owner INTEGER,status TEXT);
    CREATE TABLE verifications(user INTEGER,status TEXT);
    CREATE TABLE reviews(id INTEGER PRIMARY KEY,owner INTEGER,status TEXT);
    CREATE TABLE appeals(id INTEGER PRIMARY KEY,user INTEGER,status TEXT);
    CREATE TABLE reports(id INTEGER PRIMARY KEY,reporter INTEGER,status TEXT);
    INSERT INTO users VALUES(1),(2);
    INSERT INTO listings VALUES(3,1,'pending');
    INSERT INTO verifications VALUES(1,'pending');
    INSERT INTO reviews VALUES(1,1,'pending');
    INSERT INTO appeals VALUES(1,1,'pending');
    INSERT INTO reports VALUES(1,2,'pending');
  `);
  const app=express();
  const auth=(req,res,next)=>{const id=Number(req.headers['x-test-user']);if(!id)return res.sendStatus(401);req.session={user:{id}};next()};
  require('../notification-routes')(app,db,auth);
  db.exec(`INSERT INTO messages(listing,sender,recipient,body) VALUES(3,2,1,'contenido privado');
    UPDATE listings SET status='active' WHERE id=3;
    UPDATE verifications SET status='approved' WHERE user=1;
    UPDATE reviews SET status='approved' WHERE id=1;
    UPDATE appeals SET status='resolved' WHERE id=1;
    UPDATE reports SET status='resolved' WHERE id=1;`);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
  const base='http://127.0.0.1:'+server.address().port;
  try {
    const call=(url,user,method='GET')=>fetch(base+url,{method,headers:user?{'x-test-user':String(user)}:{}});
    assert.equal((await call('/api/notifications',0)).status,401);
    const first=await (await call('/api/notifications',1)).json();
    assert.equal(first.unread,5);
    assert.equal(JSON.stringify(first).includes('contenido privado'),false);
    assert.equal((await (await call('/api/notifications',2)).json()).unread,1);
    const id=first.items[0].id;
    assert.equal((await call('/api/notifications/'+id+'/read',2,'POST')).status,404);
    assert.equal((await call('/api/notifications/'+id+'/read',1,'POST')).status,200);
    assert.equal((await (await call('/api/notifications',1)).json()).unread,4);
    assert.equal((await call('/api/notifications/read-all',1,'POST')).status,200);
    assert.equal((await (await call('/api/notifications',1)).json()).unread,0);
    assert.equal((await (await call('/api/notifications',2)).json()).unread,1);
  } finally {await new Promise(resolve=>server.close(resolve));db.close();}
});
