'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./fixture-server');

test('CSRF exige origen confiable y token de la sesión incluso en login y multipart',async()=>{
 const f=await fixture();try{
  async function issue(cookie=''){const r=await fetch(f.url+'/api/csrf',{headers:cookie?{cookie}:{}});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');return {cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie,token:(await r.json()).token}}
  async function post(url,cookie,token,extra={},body=JSON.stringify({email:'guest@example.test',password:'BrowserTest123!'})){return fetch(f.url+url,{method:'POST',headers:{cookie,'content-type':'application/json',...(token?{'x-csrf-token':token}:{}),...extra},body})}
  const a=await issue(),b=await issue();
  assert.equal((await post('/api/login',a.cookie,a.token,{})).status,403,'sin Origin ni Referer');
  assert.equal((await post('/api/login',a.cookie,a.token,{origin:'https://ataque.invalid'})).status,403);
  assert.equal((await post('/api/login',a.cookie,a.token,{origin:'null'})).status,403);
  assert.equal((await post('/api/login',a.cookie,a.token,{origin:f.url,'sec-fetch-site':'cross-site'})).status,403);
  assert.equal((await post('/api/login',a.cookie,'',{origin:f.url})).status,403);
  assert.equal((await post('/api/demo/auth/request-reset',a.cookie,'',{origin:f.url})).status,403,'la capa CSRF precede también a los endpoints demo');
  assert.equal((await post('/api/login',a.cookie,b.token,{origin:f.url})).status,403,'el token de otra sesión no sirve');
  const login=await post('/api/login',a.cookie,a.token,{origin:f.url});assert.equal(login.status,200);const loggedIn=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/api/favorites/'+f.listing,loggedIn,a.token,{origin:f.url},'{}')).status,403,'la rotación de sesión invalida el token anterior');
  const current=await issue(loggedIn);assert.notEqual(current.token,a.token);
  const form=new FormData();form.append('photos',new Blob(['ficticio'],{type:'image/png'}),'prueba.png');
  assert.equal((await fetch(f.url+'/api/listings/'+f.listing+'/photos',{method:'POST',headers:{cookie:current.cookie,origin:'https://ataque.invalid','x-csrf-token':current.token},body:form})).status,403);
  assert.equal((await post('/api/favorites/'+f.listing,current.cookie,current.token,{referer:f.url+'/cuenta'},'{}')).status,200,'se admite Referer exacto si Origin no existe');
 }finally{await f.close()}
});
