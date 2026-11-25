'use strict';
const {request:csrfRequest}=require('./csrf-test-client');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {fixture}=require('./fixture-server');
const sharp=require('sharp');

test('búsqueda valida filtros y pagina sin incluir publicaciones no disponibles',async t=>{
  const site=await fixture();t.after(()=>site.close());const db=new DatabaseSync(site.dbPath);
  const insert=db.prepare(`INSERT INTO listings(owner,title,city,department,municipality,area,type,price,deposit,description,rooms,baths,services,parking,furnished,pets,status,authorization,confirmed) VALUES(?,?,?,?,?,?,?,?,?,'Ejemplo ficticio',2,1,'Agua, internet','Sí','No','Sí',?,'approved',?)`);
  for(let i=0;i<28;i++) insert.run(site.owner,`Xela ${i}`,'Xela','Quetzaltenango','Xela','Zona 3','Apartamento',1000+i,0,'active','2099-01-01 00:00:00');
  insert.run(site.owner,'Capital','Ciudad de Guatemala','Guatemala','Ciudad de Guatemala','Zona 4','Cuarto',1500,1500,'active','2099-01-01 00:00:00');
  insert.run(site.owner,'Pausado','Xela','Quetzaltenango','Xela','Zona 3','Apartamento',1000,0,'paused','2099-01-01 00:00:00');
  insert.run(site.owner,'Vencido','Xela','Quetzaltenango','Xela','Zona 3','Apartamento',1000,0,'active','2000-01-01 00:00:00');db.close();
  async function get(path){const r=await fetch(site.url+'/api/search'+path);return {status:r.status,body:await r.json()}}
  let a=await get('?city=Xela&department=Quetzaltenango&sector=Zona%203&deposit=none&parking=S%C3%AD&rooms=2&sort=price_asc&page=1&limit=10');
  assert.equal(a.status,200);assert.equal(a.body.total,28);assert.equal(a.body.listings.length,10);assert.equal(a.body.listings[0].price,1000);
  let b=await get('?city=Xela&deposit=none&sort=price_asc&page=2&limit=10');assert.equal(b.body.total,28);assert.equal(b.body.listings[0].price,1010);
  let c=await get('?city=Ciudad%20de%20Guatemala');assert.equal(c.body.length,1);assert.equal(c.body[0].title,'Capital');
  assert.equal((await get('?minPrice=2000&maxPrice=1000')).status,400);
  assert.equal((await get('?deposit=anything')).status,400);
  assert.equal((await get('?page=0')).status,400);
  assert.equal((await get('?sector=%25')).body.length,0);
});

test('las fotos no cambian anuncios suspendidos y requieren revisión de anuncios pausados',async t=>{
  const site=await fixture();t.after(()=>site.close());
  const login=await csrfRequest(site.url,'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@example.test',password:'BrowserTest123!'})});
  const cookie=login.cookie;
  const photo=await sharp({create:{width:8,height:8,channels:3,background:'green'}}).png().toBuffer();
  let db=new DatabaseSync(site.dbPath);db.prepare("UPDATE listings SET status='suspended' WHERE id=?").run(site.listing);db.close();
  const send=async()=>{const form=new FormData();form.append('photos',new Blob([photo],{type:'image/png'}),'demo.png');return (await csrfRequest(site.url,'/api/listings/'+site.listing+'/photos',{method:'POST',body:form},cookie)).response};
  assert.equal((await send()).status,404);
  db=new DatabaseSync(site.dbPath);db.prepare("UPDATE listings SET status='paused' WHERE id=?").run(site.listing);db.close();
  assert.equal((await send()).status,200);
  db=new DatabaseSync(site.dbPath);const row=db.prepare('SELECT status,authorization FROM listings WHERE id=?').get(site.listing);db.close();
  assert.equal(row.status,'pending');assert.equal(row.authorization,'pending');
});

test('cambiar fotos de anuncio vencido obliga revisión e impide reactivación directa',async t=>{
  const site=await fixture();t.after(()=>site.close());
  const login=await csrfRequest(site.url,'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@example.test',password:'BrowserTest123!'})});const cookie=login.cookie;
  const db=new DatabaseSync(site.dbPath);db.exec('PRAGMA busy_timeout=5000');
  const expire=()=>db.prepare("UPDATE listings SET status='expired',authorization='approved' WHERE id=?").run(site.listing);
  const assertReview=()=>{const l=db.prepare('SELECT status,authorization FROM listings WHERE id=?').get(site.listing);assert.equal(l.status,'pending');assert.equal(l.authorization,'pending')};
  const photo=await sharp({create:{width:8,height:8,channels:3,background:'green'}}).png().toBuffer();
  const upload=async()=>{const form=new FormData();form.append('photos',new Blob([photo],{type:'image/png'}),'demo.png');return (await csrfRequest(site.url,'/api/listings/'+site.listing+'/photos',{method:'POST',body:form},cookie)).response};
  const post=async(url,data)=>(await csrfRequest(site.url,url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)},cookie)).response;
  expire();let r=await upload();assert.equal(r.status,200);const id=(await r.json()).photos[0];assertReview();
  assert.equal((await post('/api/listings/'+site.listing+'/confirm',{})).status,400);
  expire();assert.equal((await post('/api/listings/'+site.listing+'/photos/order',{ids:[id]})).status,200);assertReview();
  expire();assert.equal((await post('/api/photos/'+id+'/delete',{})).status,200);assertReview();db.close();
});
