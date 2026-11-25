'use strict';
// Integration clients exercise the same origin/token contract as a browser.
async function request(base,url,options={},cookie=''){
 const method=(options.method||'GET').toUpperCase(),headers={...(options.headers||{})};
 let currentCookie=cookie||headers.cookie||'';
 if(['POST','PUT','PATCH','DELETE'].includes(method)){
  const pre=await fetch(base+'/api/csrf',{headers:currentCookie?{cookie:currentCookie}:{}});
  if(!pre.ok)throw new Error('No se pudo obtener CSRF de prueba: '+pre.status);
  currentCookie=pre.headers.get('set-cookie')?.split(';')[0]||currentCookie;
  const data=await pre.json();
  if(!Object.hasOwn(headers,'origin'))headers.origin=base;
  headers['x-csrf-token']=data.token;
 }
 if(currentCookie)headers.cookie=currentCookie;
 const response=await fetch(base+url,{...options,headers});
 return {response,cookie:response.headers.get('set-cookie')?.split(';')[0]||currentCookie};
}
module.exports={request};
