'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const express=require('express');

test('lectura de conversaciones solo afecta mensajes propios y conserva otros hilos',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE messages(id INTEGER PRIMARY KEY,listing INTEGER,sender INTEGER,recipient INTEGER,body TEXT);
    INSERT INTO messages(listing,sender,recipient,body) VALUES(1,2,1,'hola'),(1,1,2,'respuesta'),(1,3,1,'otro'),(2,2,1,'otro inmueble');`);
  const app=express(),auth=(req,res,next)=>{req.session={user:{id:Number(req.get('x-user'))}};next()};
  require('../chat-read-routes')(app,db,auth);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))}),base='http://127.0.0.1:'+server.address().port;
  try{
    const mark=(user,listing,other)=>fetch(base+`/api/conversations/${listing}/${other}/read`,{method:'POST',headers:{'x-user':String(user)}});
    assert.equal((await mark(4,1,2)).status,404);
    const result=await mark(1,1,2);assert.equal(result.status,200);assert.equal((await result.json()).updated,1);
    const rows=db.prepare('SELECT read_at FROM messages ORDER BY id').all();
    assert.ok(rows[0].read_at);assert.equal(rows[1].read_at,null);assert.equal(rows[2].read_at,null);assert.equal(rows[3].read_at,null);
    assert.equal((await (await mark(1,1,2)).json()).updated,0);
  }finally{await new Promise(resolve=>server.close(resolve));db.close()}
});
