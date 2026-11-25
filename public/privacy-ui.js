'use strict';
window.ViviendaPrivacy = (() => {
 const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const kindLabel = value => ({access:'Acceso a mis datos',correction:'Corrección de datos',deletion:'Eliminación de cuenta'}[value] || value);
 const statusLabel = value => ({received:'Recibida',in_review:'En revisión',resolved:'Finalizada',rejected:'No procede'}[value] || value);
 function record(row, isAdmin=false) {
  return `<article class="privacy-request"><div class="privacy-request-top"><div><h4>${escape(kindLabel(row.kind))}</h4><small>Solicitud #${escape(row.id)} · ${escape(row.created_at)}</small></div><span class="privacy-status">${escape(statusLabel(row.status))}</span></div>
   ${isAdmin?`<p><strong>Cuenta:</strong> ${escape(row.name)} · ${escape(row.email)}</p>`:''}
   <p>${escape(row.detail)}</p>${row.response?`<p class="privacy-response"><strong>Respuesta:</strong> ${escape(row.response)}</p>`:''}
   ${isAdmin&&row.status==='received'?`<button type="button" class="button secondary" data-privacy-start="${escape(row.id)}">Iniciar revisión</button>`:''}
   ${isAdmin&&row.status==='in_review'?`<form class="privacy-admin-form auth-form" data-privacy-resolve="${escape(row.id)}"><div class="field"><label for="privacy-status-${escape(row.id)}">Resultado</label><select id="privacy-status-${escape(row.id)}" name="status"><option value="resolved">Finalizada</option><option value="rejected">No procede</option></select></div><div class="field"><label for="privacy-response-${escape(row.id)}">Respuesta para la persona</label><textarea id="privacy-response-${escape(row.id)}" name="response" minlength="10" maxlength="1000" required></textarea></div><button class="button secondary" type="submit">Guardar resultado</button></form>`:''}
  </article>`;
 }
 function dateNotice() {
  return 'La solicitud se revisa manualmente: enviarla no elimina la cuenta ni los datos automáticamente. Algunas evidencias o registros podrían conservarse por motivos justificados, sujetos a revisión legal. No incluyás DPI, contraseñas ni datos financieros.';
 }
 async function render(box, {api}) {
  box.innerHTML=`<section class="privacy-area"><div class="privacy-heading"><div><h2>Privacidad y datos</h2><p>Solicitá acceso, corrección o eliminación y consultá el estado aquí.</p></div></div>
   <div class="privacy-notice">${dateNotice()}</div>
   <form id="privacy-request-form" class="auth-form privacy-form">
    <div class="field"><label for="privacy-kind">Tipo de solicitud</label><select id="privacy-kind" name="kind"><option value="">Elegí una opción</option><option value="access">Acceso a mis datos</option><option value="correction">Corrección de datos</option><option value="deletion">Eliminación de cuenta</option></select></div>
    <div class="field"><label for="privacy-detail">Contanos qué necesitás</label><textarea id="privacy-detail" name="detail" minlength="10" maxlength="1000" required aria-describedby="privacy-help"></textarea><small id="privacy-help">Entre 10 y 1000 caracteres; no compartás información sensible.</small></div>
    <p class="error" role="alert" tabindex="-1"></p><p class="privacy-success" role="status" aria-live="polite"></p>
    <button class="button" type="submit">Enviar solicitud</button>
   </form><div class="privacy-list-heading"><h3>Mis solicitudes</h3><p>Te avisaremos aquí cuando haya una actualización.</p></div><div class="privacy-list" aria-live="polite"><p>Cargando solicitudes…</p></div></section>`;
  const list=box.querySelector('.privacy-list'), form=box.querySelector('form'), alert=form.querySelector('[role=alert]'), success=form.querySelector('[role=status]');
  async function refresh(){
   try {const rows=await api('/privacy/requests');if(!box.isConnected)return;list.innerHTML=rows.length?rows.map(row=>record(row)).join(''):'<p class="privacy-empty">Todavía no tenés solicitudes.</p>';}
   catch(error){list.textContent='No pudimos cargar tus solicitudes. '+error.message}
  }
  form.onsubmit=async event=>{
   event.preventDefault();alert.textContent='';success.textContent='';
   const button=form.querySelector('button[type=submit]'),data=new FormData(form);button.disabled=true;button.textContent='Enviando…';
   if(!data.get('kind')){alert.textContent='Elegí un tipo de solicitud.';alert.focus();button.disabled=false;button.textContent='Enviar solicitud';return}
   try{await api('/privacy/requests',{kind:data.get('kind'),detail:data.get('detail')});form.reset();success.textContent='Solicitud recibida. Te avisaremos cuando se revise.';await refresh()}
   catch(error){alert.textContent=error.message;alert.focus()}
   finally{button.disabled=false;button.textContent='Enviar solicitud'}
  };
  await refresh();
 }
 async function renderAdmin(box, {api}) {
  box.innerHTML='<section class="privacy-area"><div class="privacy-list-heading"><h3>Solicitudes de privacidad</h3><p>Revisá cada caso manualmente. Cambiar el estado no elimina datos ni cuentas.</p></div><p class="error" role="alert" tabindex="-1"></p><div class="privacy-admin-list" aria-live="polite"><p>Cargando solicitudes…</p></div></section>';
  const list=box.querySelector('.privacy-admin-list'), alert=box.querySelector('[role=alert]');
  async function refresh(){
   try {const rows=await api('/admin/privacy/requests');if(!box.isConnected)return;list.innerHTML=rows.length?rows.map(row=>record(row,true)).join(''):'<p class="privacy-empty">No hay solicitudes de privacidad.</p>';}
   catch(error){list.textContent='No pudimos cargar las solicitudes. '+error.message}
  }
  list.onclick=async event=>{
   const button=event.target.closest('[data-privacy-start]');if(!button)return;
   button.disabled=true;alert.textContent='';
   try{await api('/admin/privacy/requests/'+button.dataset.privacyStart,{status:'in_review'});await refresh()}
   catch(error){alert.textContent=error.message;alert.focus();button.disabled=false}
  };
  list.onsubmit=async event=>{
   const form=event.target.closest('[data-privacy-resolve]');if(!form)return;
   event.preventDefault();const data=new FormData(form),button=form.querySelector('button[type=submit]');button.disabled=true;alert.textContent='';
   try{await api('/admin/privacy/requests/'+form.dataset.privacyResolve,{status:data.get('status'),response:data.get('response')});await refresh()}
   catch(error){alert.textContent=error.message;alert.focus();button.disabled=false}
  };
  await refresh();
 }
 return {render, renderAdmin};
})();
