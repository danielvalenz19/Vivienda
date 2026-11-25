'use strict';
const {spawn}=require('node:child_process');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {DatabaseSync}=require('node:sqlite');
const bcrypt=require('bcryptjs');
const root=path.resolve(__dirname,'..');
async function portAvailable(){const server=net.createServer();await new Promise((ok,fail)=>server.listen(0,'127.0.0.1',ok).on('error',fail));const port=server.address().port;await new Promise(ok=>server.close(ok));return port;}
async function fixture(){
 const dir=await mkdtemp(path.join(tmpdir(),'vivienda-browser-test-'));
 const dbPath=path.join(dir,'data.sqlite'),port=await portAvailable();
 const processHandle=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),DB_PATH:dbPath,PHOTO_DIR:path.join(dir,'photos'),PROFILE_PHOTO_DIR:path.join(dir,'profile-photos'),EVIDENCE_DIR:path.join(dir,'evidence'),DEMO_AUTH:'0',SESSION_SECRET:'a-long-test-secret-for-local-testing-only'},stdio:['ignore','pipe','pipe']});
 let errors='';processHandle.stderr.on('data',d=>errors+=d);
 try{await new Promise((ok,fail)=>{const timer=setTimeout(()=>fail(Error('Server did not start: '+errors)),10000);processHandle.stdout.on('data',d=>{if(String(d).includes('Vivienda GT en')){clearTimeout(timer);ok()}});processHandle.once('error',fail);processHandle.once('exit',c=>fail(Error('Server exited '+c+': '+errors)));});
 const db=new DatabaseSync(dbPath);db.exec('PRAGMA foreign_keys=ON');const pwd=await bcrypt.hash('BrowserTest123!',10);
 for(const [name,email,role] of [['Dueña Prueba','owner@example.test','user'],['Interesada Prueba','guest@example.test','user'],['Admin Prueba','admin@example.test','admin'],['Pendiente Prueba','pending@example.test','user']])db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(name,email,pwd,role);
 const owner=db.prepare('SELECT id FROM users WHERE email=?').get('owner@example.test').id, guest=db.prepare('SELECT id FROM users WHERE email=?').get('guest@example.test').id,pending=db.prepare('SELECT id FROM users WHERE email=?').get('pending@example.test').id;
 db.prepare("INSERT INTO verifications(user,status) VALUES(?,'approved'),(?,'pending')").run(owner,pending);
 const listing=Number(db.prepare("INSERT INTO listings(owner,title,city,area,type,price,deposit,description,rooms,baths,services,image,status,authorization,confirmed) VALUES(?,'DEMO prueba de navegador','Xela','Zona 3','Apartamento',2300,2300,'Esta vivienda es ficticia y sirve para probar la interfaz.',2,1,'Agua, internet','/assets/demo/vivienda-1.jpg','active','approved',CURRENT_TIMESTAMP)").run(owner).lastInsertRowid);
 db.prepare("INSERT INTO favorites(user,listing) VALUES(?,?)").run(guest,listing);
 db.prepare("INSERT INTO messages(listing,sender,recipient,body) VALUES(?,?,?,'Mensaje ficticio de prueba.')").run(listing,guest,owner);
 db.close();
 return {dir,dbPath,port,url:`http://127.0.0.1:${port}`,listing,owner,guest,async close(){if(processHandle.exitCode===null){processHandle.kill('SIGTERM');await new Promise(ok=>processHandle.once('exit',ok));}await rm(dir,{recursive:true,force:true});}};
 }catch(e){processHandle.kill();await rm(dir,{recursive:true,force:true});throw e}
}
module.exports={fixture};
