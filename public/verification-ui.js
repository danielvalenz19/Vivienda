'use strict';
window.ViviendaVerification=(()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={not_requested:'Sin iniciar',pending:'Pendiente de revisión',needs_correction:'Necesita correcciones',approved:'Revisada',rejected:'Rechazada',revoked:'Revocada'};
 async function renderUser(box,{api,toast}){
  box.innerHTML='<h2>Revisión de identidad</h2><p>Cargando tu solicitud…</p>';
  let state;try{state=await api('/verification')}catch(error){box.textContent='No pudimos cargar tu solicitud. '+error.message;return}
  const canSend=['not_requested','needs_correction','rejected','revoked'].includes(state.status);
  const correction=state.status==='needs_correction';
  box.innerHTML=`<section class="verification-area"><h2>Revisión de identidad</h2>
   <p>Estado: <strong class="verification-status">${esc(labels[state.status]||state.status)}</strong></p>
   <div class="verification-note">Esta revisión es manual y se realiza por un canal acordado. No ingresés DPI ni documentos sensibles en esta demostración. La revisión no garantiza titularidad ni seguridad.</div>
   ${state.note?`<div class="verification-observation"><strong>Observaciones del equipo</strong><p>${esc(state.note)}</p></div>`:''}
   ${state.status==='pending'&&state.user_note?`<p><strong>Tu explicación:</strong> ${esc(state.user_note)}</p>`:''}
   ${canSend?`<form class="auth-form verification-form">
    ${state.status!=='not_requested'?`<div class="field"><label for="verification-user-note">Explicá ${correction?'qué corregiste':'tu solicitud'}${correction?'':' (opcional)'}</label><textarea id="verification-user-note" name="user_note" maxlength="500" ${correction?'minlength="10" required':''} aria-describedby="verification-help"></textarea><small id="verification-help">No incluyás documentos ni información sensible.</small></div>`:''}
    <p class="error" role="alert" tabindex="-1"></p><button class="button" type="submit">${state.status==='not_requested'?'Solicitar revisión':'Enviar nuevamente'}</button></form>`:''}
   </section>`;
  const form=box.querySelector('.verification-form');if(!form)return;
  form.onsubmit=async event=>{event.preventDefault();const alert=form.querySelector('[role=alert]'),button=form.querySelector('button[type=submit]'),data=new FormData(form);alert.textContent='';button.disabled=true;button.textContent='Enviando…';try{await api('/verification',{user_note:data.get('user_note')||''});toast('Solicitud enviada para revisión manual.');await renderUser(box,{api,toast})}catch(error){alert.textContent=error.message;alert.focus();button.disabled=false;button.textContent=state.status==='not_requested'?'Solicitar revisión':'Enviar nuevamente'}};
 }
 async function askCorrection(id,{api,role}){
  return new Promise(resolve=>{
   const dialog=document.createElement('dialog');dialog.className='verification-dialog';dialog.setAttribute('aria-labelledby','verification-dialog-title');
   dialog.innerHTML=`<form class="auth-form"><h2 id="verification-dialog-title">Solicitar correcciones</h2><p>Explicá qué necesita aclarar la persona. No solicités documentos por este formulario.</p><div class="field"><label for="verification-correction">Observaciones</label><textarea id="verification-correction" minlength="10" maxlength="500" required></textarea></div><p class="error" role="alert" tabindex="-1"></p><div class="verification-dialog-actions"><button class="button secondary" type="button" data-cancel>Cancelar</button><button class="button" type="submit">Enviar observaciones</button></div></form>`;
   document.body.append(dialog);let result=false;dialog.onclose=()=>{dialog.remove();resolve(result)};dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
   const form=dialog.querySelector('form');form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button[type=submit]'),alert=form.querySelector('[role=alert]');button.disabled=true;alert.textContent='';try{await api((role==='admin'?'/admin/verifications/':'/staff/verifications/')+id,{status:'needs_correction',note:dialog.querySelector('textarea').value});result=true;dialog.close()}catch(error){alert.textContent=error.message;alert.focus();button.disabled=false}};
   dialog.showModal();dialog.querySelector('textarea').focus();
  });
 }
 async function renderRevocations(box,{api,toast}){
  box.innerHTML='<h3>Identidades revisadas</h3><p>Cargando…</p>';
  async function refresh(){
   try{
    const rows=await api('/admin/verified-users');
    box.innerHTML=`<section class="verification-area"><h3>Identidades revisadas</h3><p>Una revocación requiere motivo y pausará los anuncios activos de esa cuenta.</p><p class="error" role="alert" tabindex="-1"></p>${rows.length?rows.map(row=>`<article class="panel-row"><strong>${esc(row.name)}</strong><p>${esc(row.email)}</p><form data-revoke-identity="${esc(row.id)}" class="auth-form"><div class="field"><label for="revoke-reason-${esc(row.id)}">Motivo de revocación</label><textarea id="revoke-reason-${esc(row.id)}" name="note" minlength="10" maxlength="500" required></textarea></div><button class="button secondary" type="submit">Revocar revisión</button></form></article>`).join(''):'<p>No hay identidades revisadas disponibles.</p>'}</section>`;
   }catch(error){box.textContent='No pudimos cargar las identidades. '+error.message}
  }
  box.onsubmit=async event=>{const form=event.target.closest('[data-revoke-identity]');if(!form)return;event.preventDefault();const button=form.querySelector('button[type=submit]'),alert=box.querySelector('[role=alert]'),note=new FormData(form).get('note');button.disabled=true;alert.textContent='';try{await api('/admin/verifications/'+form.dataset.revokeIdentity,{status:'revoked',note});toast('Revisión revocada.');await refresh()}catch(error){alert.textContent=error.message;alert.focus();button.disabled=false}};
  await refresh();
 }
 return {renderUser,askCorrection,renderRevocations};
})();
