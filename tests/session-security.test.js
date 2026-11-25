'use strict';
const {request:csrfRequest}=require('./csrf-test-client');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
async function freePort(){const s=net.createServer();await new Promise((ok,fail)=>s.listen(0,'127.0.0.1',ok).on('error',fail));const p=s.address().port;await new Promise(ok=>s.close(ok));return p}
async function start(port,dir){
 const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,NODE_ENV:'test',PORT:String(port),DB_PATH:path.join(dir,'test.sqlite'),PHOTO_DIR:path.join(dir,'photos'),PROFILE_PHOTO_DIR:path.join(dir,'profiles'),EVIDENCE_DIR:path.join(dir,'evidence'),DEMO_AUTH:'0',SESSION_SECRET:''},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',d=>errors+=d);
 await new Promise((ok,fail)=>{const timer=setTimeout(()=>fail(new Error(errors||'Servidor no inició')),10000);child.stdout.on('data',d=>{if(String(d).includes('Vivienda GT en')){clearTimeout(timer);ok()}});child.once('exit',c=>{clearTimeout(timer);fail(new Error(`Servidor terminó ${c}: ${errors}`))})});return child;
}
async function stop(child){if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(ok=>child.once('exit',ok))}}
function client(port){let cookie='';const base=`http://127.0.0.1:${port}`;return async(url,data)=>{const options=data===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)};const {response,cookie:updated}=await csrfRequest(base,'/api'+url,options,cookie);cookie=updated;return {status:response.status,body:await response.json(),set:response.headers.get('set-cookie')}}}
test('sesiones sobreviven reinicio, vencen y se revocan al cambiar contraseña',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'vivienda-session-'));const port=await freePort();let proc;
 try{
  proc=await start(port,dir);const first=client(port),second=client(port);
  const registered=await first('/register',{name:'Cuenta ficticia',email:'session@example.test',password:'TestPass123!',terms_accepted:true});assert.equal(registered.status,200);assert.match(registered.set,/HttpOnly/);assert.match(registered.set,/SameSite=Lax/);assert.match(registered.set,/Expires=/);
  assert.equal((await second('/login',{email:'session@example.test',password:'TestPass123!',terms_accepted:true})).status,200);
  await stop(proc);proc=await start(port,dir);
  assert.equal((await first('/me')).body.id,registered.body.id);assert.equal((await second('/me')).body.id,registered.body.id);
  assert.equal((await first('/account/password',{current_password:'incorrecta',password:'NuevaClave123!'})).status,400);
  assert.equal((await first('/account/password',{current_password:'TestPass123!',password:'NuevaClave123!'})).status,200);
  assert.equal((await second('/me')).body,null);assert.equal((await first('/login',{email:'session@example.test',password:'TestPass123!',terms_accepted:true})).status,401);
  assert.equal((await first('/login',{email:'session@example.test',password:'NuevaClave123!'})).status,200);
  assert.equal((await second('/login',{email:'session@example.test',password:'NuevaClave123!'})).status,200);
  assert.equal((await first('/account/logout-all',{})).status,200);assert.equal((await second('/me')).body,null);
  assert.equal((await first('/login',{email:'session@example.test',password:'NuevaClave123!'})).status,200);
  const db=new DatabaseSync(path.join(dir,'test.sqlite'));db.prepare("UPDATE users SET role='admin' WHERE id=?").run(registered.body.id);
  assert.equal((await first('/me')).status,401,'los cambios de privilegios invalidan la sesión');
  assert.equal((await first('/login',{email:'session@example.test',password:'NuevaClave123!'})).status,200);
  db.prepare('UPDATE sessions SET expires_at=0').run();db.close();
  assert.equal((await first('/me')).body,null);
 }finally{await stop(proc);await rm(dir,{recursive:true,force:true})}
});
test('producción no inicia mientras falten controles críticos',()=>{
 const r=spawnSync(process.execPath,['server.js'],{cwd:root,env:{...process.env,NODE_ENV:'production',DEMO_AUTH:'0',SESSION_SECRET:'012345678901234567890123456789012345'},encoding:'utf8'});
 assert.notEqual(r.status,0);assert.match(r.stderr,/Producción deshabilitada/);
});
