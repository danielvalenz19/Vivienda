'use strict';
const {request:csrfRequest}=require('./csrf-test-client');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {fixture}=require('./fixture-server');
function client(base){let cookie='';return async(path,data)=>{const options=data===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)};const {response,cookie:updated}=await csrfRequest(base,'/api'+path,options,cookie);cookie=updated;return {status:response.status,body:await response.json().catch(()=>({}))}}}
test('edición protegida, cambios sensibles y máquina de estados',async()=>{
 const f=await fixture();try{const owner=client(f.url),guest=client(f.url);await owner('/login',{email:'owner@example.test',password:'BrowserTest123!'});await guest('/login',{email:'guest@example.test',password:'BrowserTest123!'});
  assert.equal((await guest(`/listings/${f.listing}/edit`,{price:100})).status,404);
  let result=await owner(`/listings/${f.listing}/edit`,{price:2500});assert.equal(result.status,200);assert.equal(result.body.status,'active');assert.equal(result.body.review_required,false);
  assert.equal((await owner(`/listings/${f.listing}/edit`,{image:'/assets/otra-foto.jpg'})).status,400,'no se permite introducir una nueva ruta local');
  assert.equal((await owner(`/listings/${f.listing}/status`,{status:'paused'})).status,200);
  assert.equal((await owner(`/listings/${f.listing}/status`,{status:'active'})).status,200);
  result=await owner(`/listings/${f.listing}/edit`,{area:'Zona 5'});assert.equal(result.status,200);assert.equal(result.body.status,'pending');assert.equal(result.body.review_required,true);
  assert.equal((await owner(`/listings/${f.listing}/status`,{status:'active'})).status,400,'el dueño no puede aprobar');
  const db=new DatabaseSync(f.dbPath);const l=db.prepare('SELECT department,municipality,status,authorization FROM listings WHERE id=?').get(f.listing);assert.deepEqual({...l},{department:'Quetzaltenango',municipality:'Xela',status:'pending',authorization:'pending'});assert.ok(db.prepare('SELECT COUNT(*) n FROM listing_changes WHERE listing=?').get(f.listing).n>=4);db.close();
 }finally{await f.close()}
});
test('los reintentos de mensajes son idempotentes por emisor y contenido',async()=>{
 const f=await fixture();try{const owner=client(f.url),guest=client(f.url);await owner('/login',{email:'owner@example.test',password:'BrowserTest123!'});await guest('/login',{email:'guest@example.test',password:'BrowserTest123!'});
  const key=randomUUID(),payload={listing:f.listing,body:'¿Sigue disponible?',client_id:key};const first=await guest('/messages',payload),retry=await guest('/messages',payload);
  assert.equal(first.status,200);assert.equal(first.body.duplicate,false);assert.equal(retry.status,200);assert.equal(retry.body.duplicate,true);assert.equal(retry.body.id,first.body.id);
  assert.equal((await guest('/messages',{...payload,body:'Otro contenido'})).status,409);assert.equal((await guest('/messages',{...payload,client_id:'no válido'})).status,400);
  const reply={message:first.body.id,body:'Sí, está disponible.',client_id:randomUUID()};const a=await owner('/reply',reply),b=await owner('/reply',reply);assert.equal(a.status,200);assert.equal(b.body.id,a.body.id);assert.equal(b.body.duplicate,true);
  const db=new DatabaseSync(f.dbPath);assert.equal(db.prepare('SELECT COUNT(*) n FROM messages WHERE client_id IS NOT NULL').get().n,2);db.close();
 }finally{await f.close()}
});
