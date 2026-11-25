'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {fixture}=require('./fixture-server');
const {request}=require('./csrf-test-client');
function client(base){let cookie='';return async(url,data)=>{const {response,cookie:c}=await request(base,'/api'+url,data===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)},cookie);cookie=c;return response}}
test('nadie resuelve administrativamente la suspensión de su propio anuncio',async()=>{
 const f=await fixture();try{
  const db=new DatabaseSync(f.dbPath);db.exec('PRAGMA busy_timeout=5000');const admin=db.prepare("SELECT id,password FROM users WHERE email='admin@example.test'").get();db.prepare("INSERT INTO users(name,email,password,role) VALUES('Otra admin','other-admin@example.test',?,'admin')").run(admin.password);
  const listing=Number(db.prepare("INSERT INTO listings(owner,title,city,area,type,price,deposit,description,rooms,baths,status) VALUES(?,'Anuncio ficticio','Xela','Zona 1','Cuarto',1200,1200,'Ejemplo ficticio',1,1,'pending')").run(admin.id).lastInsertRowid);
  const owner=client(f.url),other=client(f.url),reason='Revisión administrativa de prueba';
  assert.equal((await owner('/login',{email:'admin@example.test',password:'BrowserTest123!'})).status,200);assert.equal((await other('/login',{email:'other-admin@example.test',password:'BrowserTest123!'})).status,200);
  assert.equal((await owner('/admin/listings/'+listing+'/suspension',{suspended:true,reason})).status,403);
  assert.equal((await owner('/admin/users/'+admin.id+'/suspension',{suspended:true,reason})).status,403);
  assert.equal((await other('/admin/listings/'+listing+'/suspension',{suspended:true,reason})).status,200);
  assert.equal((await owner('/admin/listings/'+listing+'/suspension',{suspended:false,reason})).status,403);
  assert.equal((await other('/admin/listings/'+listing+'/suspension',{suspended:false,reason})).status,200);
  assert.equal(db.prepare('SELECT status FROM listings WHERE id=?').get(listing).status,'pending');db.close();
 }finally{await f.close()}
});
