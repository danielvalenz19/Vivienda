'use strict';
window.ViviendaReports={
 async render(box,{api,esc}){
  box.innerHTML='<h2>Mis reportes</h2><p>Consultá aquí el estado de los avisos que nos enviaste.</p><div data-my-reports>Cargando…</div>';
  try{const rows=await api('/safety-reports/mine');box.querySelector('[data-my-reports]').innerHTML=rows.length?rows.map(row=>`<article class="panel-row"><strong>Reporte #${row.id}</strong><p>${esc(row.description)}</p><p>Estado: ${esc(({pending:'Recibido',resolved:'Revisado',dismissed:'Revisado'})[row.status]||row.status)} · ${esc(row.created)}</p></article>`).join(''):'<p>Todavía no enviaste reportes.</p>'}catch(e){box.querySelector('[data-my-reports]').textContent='No pudimos cargar los reportes. '+e.message}
 },
 open(kind,id){
  return window.Vivienda.requireUser(()=>{
   const dialog=document.createElement('dialog');dialog.className='safety-report-dialog';dialog.setAttribute('aria-labelledby','safety-report-title');
   const labels={listing:'anuncio',user:'persona',message:'mensaje',review:'reseña'};
   dialog.innerHTML=`<h2 id="safety-report-title">Reportar ${labels[kind]||'contenido'}</h2><p>Tu identidad no se comparte con la persona reportada. El equipo revisará el caso.</p><form class="auth-form"><div class="field"><label>Categoría<select name="category" required><option value="">Seleccioná una opción</option><option value="fraud">Posible estafa o dinero sospechoso</option><option value="harassment">Acoso</option><option value="threat">Amenaza</option><option value="impersonation">Suplantación</option><option value="spam">Contenido no deseado</option><option value="other">Otro motivo</option></select></label></div><div class="field"><label>¿Qué ocurrió?<textarea name="description" minlength="10" maxlength="1000" rows="5" required></textarea></label></div><p class="error" role="alert" tabindex="-1"></p><div class="dialog-actions"><button type="button" class="button secondary" data-report-close>Cancelar</button><button class="button" type="submit">Enviar reporte</button></div></form>`;
   document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.querySelector('[data-report-close]').onclick=()=>dialog.close();
   dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]'),error=form.querySelector('[role=alert]');button.disabled=true;error.textContent='';try{const data=Object.fromEntries(new FormData(form));await window.Vivienda.api('/safety-reports',{kind,id,...data});dialog.close();window.Vivienda.toast('Recibimos tu reporte. Gracias por avisarnos.')}catch(e){error.textContent=e.message||'No se pudo enviar el reporte.';error.focus();button.disabled=false}};
   dialog.showModal();
  });
 }
};
