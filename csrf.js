'use strict';
const crypto=require('node:crypto');

// The token is bound to the server-side session and renewed whenever the
// session is regenerated. Origin is independently checked on every mutation.
function registerCsrf(app,{port,publicOrigin}){
 const trusted=new Set([`http://localhost:${port}`,`http://127.0.0.1:${port}`]);
 if(publicOrigin){let value;try{value=new URL(publicOrigin)}catch{throw new Error('PUBLIC_ORIGIN no es una URL válida.')};if(!['http:','https:'].includes(value.protocol)||value.origin!==publicOrigin||value.username||value.password)throw new Error('PUBLIC_ORIGIN debe ser un origen HTTP(S) exacto.');trusted.add(value.origin)}
 app.get('/api/csrf',(q,s)=>{if(!q.session.csrf)q.session.csrf=crypto.randomBytes(32).toString('hex');s.set('Cache-Control','no-store').json({token:q.session.csrf})});
 app.use((q,s,next)=>{
  if(!q.path.startsWith('/api/')||!['POST','PUT','PATCH','DELETE'].includes(q.method))return next();
  const origin=q.get('origin');let source=origin;
  if(!source&&q.get('referer')){try{source=new URL(q.get('referer')).origin}catch{source=''}}
  if(!source||!trusted.has(source)||q.get('sec-fetch-site')==='cross-site')return s.status(403).json({error:'Origen no permitido.',code:'CSRF_ORIGIN'});
  const supplied=q.get('x-csrf-token'),expected=q.session?.csrf;
  if(typeof supplied!=='string'||typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(supplied)||!/^[a-f0-9]{64}$/.test(expected)||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return s.status(403).json({error:'La sesión de seguridad venció. Intentá nuevamente.',code:'CSRF_INVALID'});
  next();
 });
}
module.exports={registerCsrf};
