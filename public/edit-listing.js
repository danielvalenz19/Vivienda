'use strict';
(function () {
  const {api,esc,toast}=window.Vivienda;
  const val=(x)=>esc(x??'');
  const field=(item,name,label,type='text',attrs='')=>`<label>${label}<input type="${type}" name="${name}" value="${val(item[name])}" ${attrs}></label>`;
  const choices=(item,name,label,options)=>`<label>${label}<select name="${name}">${options.map(v=>`<option value="${val(v)}" ${item[name]===v?'selected':''}>${val(v)}</option>`).join('')}</select></label>`;
  async function upload(url,name,files){
    const data=new FormData();for(const file of files)data.append(name,file);
    const response=await fetch('/api'+url,{method:'POST',body:data});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.error||'No se pudo subir el archivo.');
    return result;
  }
  window.editListing=async function(id){
    const item=(await api('/mine')).find(x=>Number(x.id)===Number(id));
    if(!item)throw Error('Anuncio no encontrado.');
    const host=document.createElement('section');host.className='wizard-page';host.setAttribute('aria-label','Editar vivienda');
    host.innerHTML=`<div class="wizard-shell"><header class="wizard-header"><strong>vivienda<span class="brand-accent">gt</span></strong><button type="button" class="btn outline" data-edit-close>Volver a mis anuncios</button></header><div class="wizard-content"><h1>Editar vivienda</h1><p>Los cambios de ubicación, tipo o fotografías pueden requerir una nueva revisión. Los cambios de fotos se guardan al hacerlos.</p><form id="edit-listing-form">
      ${field(item,'title','Título','text','required maxlength="120"')}
      ${choices(item,'type','Tipo de vivienda',['Apartamento','Cuarto'])}
      ${choices(item,'city','Municipio',['Xela','Ciudad de Guatemala'])}
      ${field(item,'area','Zona o sector aproximado','text','required maxlength="80"')}
      ${field(item,'price','Renta mensual (Q)','number','required min="1" max="10000000"')}
      ${field(item,'deposit','Depósito (Q)','number','required min="0" max="10000000"')}
      ${field(item,'rooms','Habitaciones','number','required min="0" max="100"')}
      ${field(item,'baths','Baños','number','required min="0" max="100"')}
      ${choices(item,'parking','Parqueo',['No informado','Sí','No'])}
      ${choices(item,'furnished','Amueblado',['No informado','Sí','No'])}
      ${choices(item,'pets','Mascotas',['No informado','Sí','No','Consultar'])}
      ${field(item,'services','Servicios incluidos','text','maxlength="500"')}
      ${field(item,'extra_costs','Cargos adicionales','text','maxlength="500"')}
      <label>Descripción<textarea name="description" required maxlength="3000" rows="5">${val(item.description)}</textarea></label>
      <label>Condiciones del alquiler<textarea name="conditions" maxlength="1000" rows="3">${val(item.conditions)}</textarea></label>
      <h2>Fotografías</h2><p>Podés subir hasta ocho fotos, escoger la portada o quitar imágenes. Al cambiar fotos se puede solicitar una nueva revisión.</p><div class="wizard-photos" data-edit-photos></div><label>Seleccionar fotos<input type="file" accept="image/jpeg,image/png,image/webp" multiple data-edit-files></label><button class="btn outline" type="button" data-edit-upload>Subir fotos</button>
      <h2>Autorización</h2><p>La evidencia es privada y se revisa por separado de tu identidad. Si el anuncio está activo o pausado, primero enviá un cambio para revisión antes de adjuntar una evidencia nueva.</p><label>Evidencia de autorización<input type="file" accept="image/jpeg,image/png,image/webp" data-edit-evidence></label><button class="btn outline" type="button" data-edit-evidence-upload>Subir evidencia</button>
      <p class="error" role="alert" tabindex="-1" data-edit-error></p><div class="wizard-actions"><button type="button" class="btn outline" data-edit-close>Cancelar</button><button class="btn" type="submit">Guardar cambios</button></div></form></div></div>`;
    document.body.append(host);const form=host.querySelector('form');
    const fail=e=>{const box=host.querySelector('[data-edit-error]');box.textContent=e.message||'No se pudo completar la acción.';box.focus()};
    const done=()=>{host.remove();window.dispatchEvent(new HashChangeEvent('hashchange'))};
    async function photos(){
      const rows=await api('/listings/'+id+'/photos');const box=host.querySelector('[data-edit-photos]');box.replaceChildren();
      if(!rows.length){box.textContent='Todavía no hay fotos.';return}
      rows.forEach((p,index)=>{const div=document.createElement('div');div.className='wizard-photo';
        div.innerHTML=`<img src="/api/photos/${encodeURIComponent(p.id)}" alt="Foto ${index+1} de la vivienda"><button type="button" class="btn outline" data-cover="${val(p.id)}" ${index===0?'disabled':''}>${index===0?'Portada actual':'Usar como portada'}</button><button type="button" class="btn outline" data-move-photo="${val(p.id)}" data-direction="-1" ${index===0?'disabled':''}>Mover antes</button><button type="button" class="btn outline" data-move-photo="${val(p.id)}" data-direction="1" ${index===rows.length-1?'disabled':''}>Mover después</button><button type="button" class="btn outline" data-remove-photo="${val(p.id)}">Quitar foto</button>`;box.append(div)});
    }
    host.addEventListener('click',async event=>{const el=event.target.closest('button');if(!el)return;
      try{
        if(el.hasAttribute('data-edit-close'))return done();
        if(el.dataset.removePhoto){await api('/photos/'+el.dataset.removePhoto+'/delete',{});await photos()}
        if(el.dataset.cover){const rows=await api('/listings/'+id+'/photos');await api('/listings/'+id+'/photos/order',{ids:[el.dataset.cover,...rows.map(p=>p.id).filter(x=>x!==el.dataset.cover)]});await photos()}
        if(el.dataset.movePhoto){const rows=await api('/listings/'+id+'/photos'),ids=rows.map(p=>p.id),index=ids.indexOf(el.dataset.movePhoto),target=index+Number(el.dataset.direction);if(index>=0&&target>=0&&target<ids.length){[ids[index],ids[target]]=[ids[target],ids[index]];await api('/listings/'+id+'/photos/order',{ids});await photos()}}
        if(el.hasAttribute('data-edit-upload')){const files=host.querySelector('[data-edit-files]').files;if(!files.length)throw Error('Seleccioná al menos una foto.');await upload('/listings/'+id+'/photos','photos',files);host.querySelector('[data-edit-files]').value='';await photos()}
        if(el.hasAttribute('data-edit-evidence-upload')){const files=host.querySelector('[data-edit-evidence]').files;if(!files.length)throw Error('Seleccioná la evidencia de autorización.');await upload('/listings/'+id+'/evidence','evidence',files);host.querySelector('[data-edit-evidence]').value='';toast('Evidencia subida para revisión.')}
      }catch(error){fail(error)}
    });
    form.addEventListener('submit',async event=>{event.preventDefault();try{const result=await api('/listings/'+id+'/edit',Object.fromEntries(new FormData(form)));done();toast(result.status==='pending'?'Cambios guardados. El anuncio está pendiente de revisión.':'Cambios guardados.')}catch(error){fail(error)}});
    await photos();form.querySelector('input').focus();
  };
})();
