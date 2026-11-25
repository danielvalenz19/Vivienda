'use strict';
const {request:csrfRequest}=require('./csrf-test-client');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {fixture}=require('./fixture-server');
const {codeAt}=require('../mfa-routes');
function client(base){let cookie='';return async(path,data)=>{const options=data===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)};const {response,cookie:updated}=await csrfRequest(base,'/api'+path,options,cookie);cookie=updated;return {status:response.status,body:await response.json().catch(()=>({}))}}}
test('MFA TOTP protege administración y los códigos de recuperación son de un solo uso',async()=>{
 const f=await fixture();try{
  const admin=client(f.url),other=client(f.url),guest=client(f.url);const login={email:'admin@example.test',password:'BrowserTest123!'};
  await admin('/login',login);await other('/login',login);await guest('/login',{email:'guest@example.test',password:'BrowserTest123!'});
  assert.equal((await guest('/mfa/setup',{current_password:'BrowserTest123!'})).status,403);
  assert.equal((await admin('/mfa/setup',{current_password:'incorrecta'})).status,400);
  const setup=await admin('/mfa/setup',{current_password:'BrowserTest123!'});assert.equal(setup.status,200);assert.match(setup.body.secret,/^[A-Z2-7]+$/);
  const db=new DatabaseSync(f.dbPath);const saved=db.prepare('SELECT pending_secret FROM admin_mfa WHERE user_id=(SELECT id FROM users WHERE email=?)').get(login.email).pending_secret;assert.ok(!saved.includes(setup.body.secret));
  assert.equal((await admin('/mfa/activate',{code:'000000x'})).status,400);
  const usedCode=codeAt(setup.body.secret,Math.floor(Date.now()/30000));const activation=await admin('/mfa/activate',{code:usedCode});assert.equal(activation.status,200);assert.equal(activation.body.recovery_codes.length,8);
  assert.equal((await admin('/admin')).status,200);assert.equal((await other('/admin')).status,403,'se revocan otras sesiones');
  assert.equal((await other('/login',login)).status,200);let denied=await other('/admin');assert.equal(denied.status,403);assert.equal(denied.body.code,'MFA_REQUIRED');
  assert.equal((await other(`/listings/${f.listing}/evidence?reason=revision%20de%20autorizacion`)).status,404,'MFA también protege acceso excepcional a evidencia');
  assert.equal((await other('/mfa/challenge',{code:usedCode})).status,400,'no se vuelve a usar el mismo código TOTP');
  let challenge=await other('/mfa/challenge',{code:activation.body.recovery_codes[0]});assert.equal(challenge.status,200);assert.equal((await other('/admin')).status,200);
  await other('/logout',{});await other('/login',login);challenge=await other('/mfa/challenge',{code:activation.body.recovery_codes[0]});assert.equal(challenge.status,400,'un código de recuperación usado no se acepta otra vez');
  assert.equal((await other('/mfa/challenge',{code:activation.body.recovery_codes[1]})).status,200);
  const stored=db.prepare('SELECT code_hash,used_at FROM admin_mfa_recovery WHERE used_at IS NOT NULL').all();assert.equal(stored.length,2);assert.ok(stored.every(x=>!activation.body.recovery_codes.includes(x.code_hash)));db.close();
 }finally{await f.close()}
});
test('bloqueo persistente después de intentos MFA fallidos',async()=>{
 const f=await fixture();try{const c=client(f.url);await c('/login',{email:'admin@example.test',password:'BrowserTest123!'});for(let n=0;n<5;n++)assert.equal((await c('/mfa/setup',{current_password:'incorrecta'})).status,400);assert.equal((await c('/mfa/setup',{current_password:'BrowserTest123!'})).status,429)}finally{await f.close()}
});
test('reiniciar la configuración con contraseña correcta no borra intentos de MFA fallidos',async()=>{
 const f=await fixture();try{const c=client(f.url);await c('/login',{email:'admin@example.test',password:'BrowserTest123!'});const credentials={current_password:'BrowserTest123!'};assert.equal((await c('/mfa/setup',credentials)).status,200);for(let n=0;n<4;n++)assert.equal((await c('/mfa/activate',{code:'inválido'})).status,400);assert.equal((await c('/mfa/setup',credentials)).status,200);assert.equal((await c('/mfa/activate',{code:'inválido'})).status,400);assert.equal((await c('/mfa/setup',credentials)).status,429)}finally{await f.close()}
});
