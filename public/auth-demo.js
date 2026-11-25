'use strict';
// The server exposes these controls only when the local demo mode is explicitly enabled.
(async function () {
  let response;
  try { response=await fetch('/api/demo/auth/enabled'); if(!response.ok)return; } catch { return; }
  const box=document.getElementById('modalcontent'), modal=document.getElementById('modal');
  if(!box || !modal) return;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function call(endpoint,data) { const r=await fetch('/api/demo/auth/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const out=await r.json().catch(()=>({}));if(!r.ok)throw Error(out.error||'No se pudo completar la solicitud.');return out; }
  function view(html) {box.innerHTML=html;if(!modal.open)modal.showModal();}
  function request(purpose) {
    const isReset=purpose==='reset';
    view(`<h2>${isReset?'Recuperar contraseña':'Confirmar correo'}</h2><p>En esta demostración local no se envían correos. El código aparecerá en la terminal del servidor y vence en 15 minutos.</p><form id="demo-request"><label>Correo<input type="email" name="email" autocomplete="email" required></label><p class="error" role="alert"></p><button class="btn">Solicitar código</button></form><p><button type="button" class="btn outline" id="demo-code">Ya tengo un código</button></p>`);
    document.getElementById('demo-code').onclick=()=>use(purpose);
    document.getElementById('demo-request').onsubmit=async e=>{e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;try{await call(isReset?'request-reset':'request-confirmation',{email:new FormData(e.target).get('email')});use(purpose,true)}catch(err){e.target.querySelector('.error').textContent=err.message}finally{btn.disabled=false}};
  }
  function use(purpose,requested=false) {
    const isReset=purpose==='reset';
    view(`<h2>${isReset?'Elegí una contraseña nueva':'Confirmá tu correo'}</h2><p>${requested?'Si la cuenta existe, su código aparece en la consola local. ':'Ingresá el código que aparece en la consola local. '}Este código es de un solo uso.</p><form id="demo-use"><label>Código<input name="token" required autocomplete="off" spellcheck="false"></label>${isReset?'<label>Contraseña nueva<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label>':''}<p class="error" role="alert"></p><button class="btn">${isReset?'Cambiar contraseña':'Confirmar correo'}</button></form><p><button class="btn outline" type="button" id="demo-back">Solicitar otro código</button></p>`);
    document.getElementById('demo-back').onclick=()=>request(purpose);
    document.getElementById('demo-use').onsubmit=async e=>{e.preventDefault();let btn=e.target.querySelector('button');btn.disabled=true;try{let data=Object.fromEntries(new FormData(e.target));await call('use-token',{purpose,...data});view(`<h2>${isReset?'Contraseña actualizada':'Correo confirmado'}</h2><p>${isReset?'Ya podés ingresar con tu nueva contraseña.':'La confirmación quedó registrada en esta demostración local.'}</p><button class="btn" type="button" id="demo-close">Entendido</button>`);document.getElementById('demo-close').onclick=()=>modal.close()}catch(err){e.target.querySelector('.error').textContent=err.message}finally{btn.disabled=false}};
  }
  function insertControls(){
    const form=box.querySelector('#authform');
    if(form && !box.querySelector('#demo-auth-controls')){const group=document.createElement('p');group.id='demo-auth-controls';group.innerHTML='<button type="button" class="btn outline" data-demo="reset">Recuperar contraseña (demo)</button> <button type="button" class="btn outline" data-demo="confirm">Confirmar correo (demo)</button>';form.after(group);}
    const logout=box.querySelector('#logout');
    if(logout && !box.querySelector('#demo-confirm-account')){const button=document.createElement('button');button.id='demo-confirm-account';button.type='button';button.className='btn outline';button.textContent='Confirmar correo (demo)';button.dataset.demo='confirm';logout.before(button);}
  }
  box.addEventListener('click',e=>{const button=e.target.closest('[data-demo]');if(button)request(button.dataset.demo)});
  new MutationObserver(insertControls).observe(box,{childList:true,subtree:true});insertControls();
})();
