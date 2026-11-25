'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {readdir}=require('node:fs/promises');
const sharp=require('sharp');
const {fixture}=require('./fixture-server');
const {request}=require('./csrf-test-client');
const json=data=>({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});

test('subidas concurrentes respetan límites y no borran archivos legítimos',async()=>{
 const f=await fixture();try{
  const db=new DatabaseSync(f.dbPath);db.exec('PRAGMA busy_timeout=5000');db.prepare("UPDATE listings SET status='pending' WHERE id=?").run(f.listing);
  const login=await request(f.url,'/api/login',json({email:'owner@example.test',password:'BrowserTest123!'}));const cookie=login.cookie;
  await request(f.url,'/api/csrf',{},cookie);
  const bytes=await sharp({create:{width:64,height:64,channels:3,background:'#559977'}}).png().toBuffer();
  async function upload(kind){const form=new FormData();form.append(kind==='photos'?'photos':'evidence',new Blob([bytes],{type:'image/png'}),'demo.png');return (await request(f.url,`/api/listings/${f.listing}/${kind}`,{method:'POST',body:form},cookie)).response}
  const photoResults=await Promise.all(Array.from({length:10},()=>upload('photos')));assert.equal(photoResults.filter(r=>r.status===200).length,8);assert.equal(photoResults.filter(r=>r.status===400).length,2);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM listing_photos WHERE listing=?').get(f.listing).n,8);assert.equal((await readdir(f.dir+'/photos')).length,8);
  const evidenceResults=await Promise.all(Array.from({length:5},()=>upload('evidence')));assert.equal(evidenceResults.filter(r=>r.status===201).length,3);assert.equal(evidenceResults.filter(r=>r.status===400).length,2);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM listing_evidence WHERE listing=?').get(f.listing).n,3);assert.equal((await readdir(f.dir+'/evidence')).length,3);db.close();
 }finally{await f.close()}
});

test('una carga simultánea nunca levanta la suspensión administrativa',async()=>{
 const f=await fixture();try{
  const owner=await request(f.url,'/api/login',json({email:'owner@example.test',password:'BrowserTest123!'}));const admin=await request(f.url,'/api/login',json({email:'admin@example.test',password:'BrowserTest123!'}));
  const tokenReply=await fetch(f.url+'/api/csrf',{headers:{cookie:owner.cookie}});const token=(await tokenReply.json()).token;
  const bytes=await sharp({create:{width:1800,height:1800,channels:3,background:'#668899'}}).png().toBuffer();const form=new FormData();form.append('photos',new Blob([bytes],{type:'image/png'}),'demo.png');
  const uploading=fetch(f.url+`/api/listings/${f.listing}/photos`,{method:'POST',headers:{cookie:owner.cookie,origin:f.url,'x-csrf-token':token},body:form});
  const suspended=await request(f.url,`/api/admin/listings/${f.listing}/suspension`,json({suspended:true,reason:'Revisión preventiva de prueba'}),admin.cookie);assert.equal(suspended.response.status,200);
  const result=await uploading;assert.ok([200,404].includes(result.status));
  const db=new DatabaseSync(f.dbPath);assert.equal(db.prepare('SELECT status FROM listings WHERE id=?').get(f.listing).status,'suspended');db.close();
 }finally{await f.close()}
});
