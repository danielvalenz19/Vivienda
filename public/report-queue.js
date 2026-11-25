'use strict';
window.ViviendaReportQueue={
 async render(box,{api,esc}){
  box.innerHTML='<h3>Reportes de seguridad</h3><p>Cargando casos…</p>';
  try{
   const rows=await api('/staff/safety-reports');
   box.innerHTML=`<h3>Reportes de seguridad</h3><p class="subtle">El contexto de un mensaje requiere un motivo y se registra en auditoría.</p><p class="error" role="alert" tabindex="-1"></p>${rows.map(row=>`<article class="panel-row"><strong>Caso #${row.id} · ${esc(row.subject_kind)} · ${esc(row.category)}</strong><p>${esc(row.description)}</p><p>${row.priority==='high'?'Prioridad alta':'Prioridad normal'} · ${esc(row.created)}</p><button type="button" class="button secondary" data-safety-context="${row.id}">Revisar contenido reportado</button> <button type="button" class="button secondary" data-safety-resolve="${row.id}" data-value="resolved">Resolver caso</button> <button type="button" class="button secondary" data-safety-resolve="${row.id}" data-value="dismissed">Descartar caso</button></article>`).join('')||'<p>No hay reportes de seguridad pendientes.</p>'}`;
   box.onclick=async event=>{const button=event.target.closest('button');if(!button)return;const alert=box.querySelector('[role=alert]');alert.textContent='';try{
    if(button.dataset.safetyContext){const reason=prompt('Indicá el motivo de acceso (10 a 500 caracteres).');if(!reason)return;const data=await api('/staff/safety-reports/'+button.dataset.safetyContext+'/context',{reason});const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Contenido reportado');const heading=document.createElement('h2');heading.textContent='Contenido reportado';const note=document.createElement('p');note.textContent='Este acceso quedó registrado.';const pre=document.createElement('pre');pre.className='safety-context';pre.textContent=data.resource?JSON.stringify(data.resource,null,2):'El contenido ya no está disponible.';const close=document.createElement('button');close.className='button secondary';close.textContent='Cerrar';close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());dialog.append(heading,note,pre,close);document.body.append(dialog);dialog.showModal();return}
    if(button.dataset.safetyResolve){const resolution=prompt('Motivo interno de la decisión (10 a 500 caracteres).');if(!resolution)return;await api('/staff/safety-reports/'+button.dataset.safetyResolve+'/resolve',{status:button.dataset.value,resolution});await this.render(box,{api,esc})}
   }catch(e){alert.textContent=e.message||'No se pudo completar la acción.';alert.focus()}};
  }catch(e){box.innerHTML='<h3>Reportes de seguridad</h3><p role="alert">No pudimos cargar los reportes.</p>'}
 }
};
