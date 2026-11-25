'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const express=require('express');

test('métricas agregadas son privadas, cuentan respuestas exitosas y no almacenan búsquedas',async()=>{
 const db=new DatabaseSync(':memory:');db.function('vgt_availability_days',()=>14);
 db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,suspended INTEGER);
 CREATE TABLE listings(id INTEGER PRIMARY KEY,owner INTEGER,status TEXT,confirmed TEXT);
 CREATE TABLE verifications(user INTEGER,status TEXT,requested TEXT,reviewed TEXT);
 CREATE TABLE favorites(user INTEGER,listing INTEGER);
 CREATE TABLE messages(id INTEGER,listing INTEGER,sender INTEGER,recipient INTEGER);
 CREATE TABLE reports(id INTEGER);
 INSERT INTO users VALUES(1,0);
 INSERT INTO listings VALUES(1,1,'active',CURRENT_TIMESTAMP),(2,1,'rented',CURRENT_TIMESTAMP);
 INSERT INTO verifications VALUES(1,'approved','2026-01-01 10:00:00','2026-01-01 12:00:00');
 INSERT INTO favorites VALUES(1,1);
 INSERT INTO messages VALUES(1,1,1,2),(2,1,2,1);`);
 const app=express(),admin=(req,res,next)=>req.get('x-role')==='admin'?next():res.sendStatus(403);
 require('../metrics-routes')(app,db,admin);
 app.get('/api/search',(req,res)=>res.json([]));
 app.get('/api/listings/:id/detail',(req,res)=>req.params.id==='1'?res.json({id:1}):res.sendStatus(404));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))}),base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base+'/api/admin/metrics')).status,403);
  await fetch(base+'/api/search?query=texto-privado');
  await fetch(base+'/api/listings/1/detail');
  await fetch(base+'/api/listings/999/detail');
  const response=await fetch(base+'/api/admin/metrics',{headers:{'x-role':'admin'}}),v=await response.json();
  assert.equal(v.counts.searches,1);assert.equal(v.counts.listing_views,1);
  assert.equal(v.counts.available_listings,1);assert.equal(v.counts.conversations,1);
  assert.equal(v.mean_identity_review_hours,2);
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM metrics_daily').all()).includes('texto-privado'),false);
 }finally{await new Promise(resolve=>server.close(resolve));db.close()}
});
