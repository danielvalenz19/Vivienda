'use strict';
// Runs before application scripts and covers JSON and multipart requests.
(() => {
 const original=window.fetch.bind(window);let token=null,pending=null;
 async function getToken(refresh=false){
  if(refresh)token=null;
  if(token)return token;
  if(!pending)pending=original('/api/csrf',{credentials:'same-origin',cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('No se pudo iniciar la protección de sesión.');const data=await r.json();if(!/^[a-f0-9]{64}$/.test(data.token||''))throw new Error('No se pudo iniciar la protección de sesión.');token=data.token;return token}).finally(()=>{pending=null});
  return pending;
 }
 window.fetch=async(input,options)=>{
  const request=new Request(input,options),url=new URL(request.url,location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/')||!['POST','PUT','PATCH','DELETE'].includes(request.method.toUpperCase()))return original(input,options);
  const attempt=async(requestCopy,value)=>{const headers=new Headers(requestCopy.headers);headers.set('X-CSRF-Token',value);return original(new Request(requestCopy,{headers}))};
  const first=request.clone(),retry=request.clone();let response=await attempt(first,await getToken());
  if(response.status===403){const body=await response.clone().json().catch(()=>null);if(body?.code==='CSRF_INVALID')response=await attempt(retry,await getToken(true))}
  return response;
 };
})();
