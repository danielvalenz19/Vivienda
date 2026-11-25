'use strict';
const {request:csrfRequest}=require('./csrf-test-client');
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),sharp=require('sharp');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vivienda-profile-')),port=31000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,DB_PATH:path.join(tmp,'db.sqlite'),PHOTO_DIR:path.join(tmp,'listing-photos'),PROFILE_PHOTO_DIR:path.join(tmp,'profile-photos'),EVIDENCE_DIR:path.join(tmp,'evidence'),PORT:String(port),DEMO_AUTH:'0'},stdio:['ignore','pipe','pipe']});
const ready=new Promise((resolve,reject)=>{child.stdout.on('data',d=>{if(String(d).includes('Vivienda GT en'))resolve()});child.on('exit',code=>reject(Error('Server exited '+code)));setTimeout(()=>reject(Error('Server timeout')),10000).unref()});
after(()=>{child.kill();fs.rmSync(tmp,{recursive:true,force:true})});
const post=data=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
async function req(path,opts={},cookie=''){const {response,cookie:updated}=await csrfRequest(base,path,opts,cookie);return {response,data:await response.json().catch(()=>null),cookie:updated};}
test('profile photo upload, public view, persistence, and deletion',async()=>{await ready;
  const ana=await req('/api/register',post({name:'Ana',email:'ana@photo.invalid',password:'Example123!',terms_accepted:true}));assert.equal(ana.response.status,200);
  const unauthorized=await req('/api/account/profile/photo',{method:'POST'});assert.equal(unauthorized.response.status,401);
  const bad=new FormData();bad.append('photo',new Blob(['not an image'],{type:'image/png'}),'foto.png');assert.equal((await req('/api/account/profile/photo',{method:'POST',body:bad},ana.cookie)).response.status,400);
  const bytes=await sharp({create:{width:24,height:20,channels:3,background:'#26a276'}}).jpeg().withMetadata({exif:{IFD0:{Artist:'Secret'}}}).toBuffer();const body=new FormData();body.append('photo',new Blob([bytes],{type:'image/jpeg'}),'foto.jpg');
  const uploaded=await req('/api/account/profile/photo',{method:'POST',body},ana.cookie);assert.equal(uploaded.response.status,200);assert.match(uploaded.data.photo_url,/^\/api\/profile-photos\/[a-f0-9]{32}$/);
  let image=await fetch(base+uploaded.data.photo_url);assert.equal(image.status,200);const metadata=await sharp(Buffer.from(await image.arrayBuffer())).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.exif,undefined);
  assert.equal((await req('/api/account/profile',post({public_name:'Ana Casas',bio:'Hola'}),ana.cookie)).response.status,200);const profile=await req('/api/account/profile',{},ana.cookie);assert.equal(profile.data.photo_url,uploaded.data.photo_url);
  const other=await req('/api/register',post({name:'Beto',email:'beto@photo.invalid',password:'Example123!',terms_accepted:true}));assert.equal((await req('/api/account/profile',post({public_name:'Beto',photo_url:uploaded.data.photo_url}),other.cookie)).response.status,400);
  const {DatabaseSync}=require('node:sqlite'),database=new DatabaseSync(path.join(tmp,'db.sqlite'));database.prepare("INSERT INTO listings(owner,title,city,area,type,price,description,status,confirmed) VALUES(?,'Ejemplo','Xela','Zona 1','Cuarto',1000,'Ejemplo','active',CURRENT_TIMESTAMP)").run(ana.data.id);database.close();const publicProfile=await req('/api/profiles/'+ana.data.id);assert.equal(publicProfile.data.photo_url,uploaded.data.photo_url);

  assert.equal((await req('/api/account/profile/photo/delete',post({}),ana.cookie)).response.status,200);assert.equal((await fetch(base+uploaded.data.photo_url)).status,404);
});
