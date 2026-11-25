'use strict';
// Enhances the account profile without changing routing or the profile submit handler.
(function(){
  const photoPattern=/^\/api\/profile-photos\/[a-f0-9]{32}$/;
  let currentUrl='';
  const section=()=>document.querySelector('#workspace-panel #profile-form');
  function init(){
    const form=section();if(!form||form.dataset.photoReady)return;
    form.dataset.photoReady='yes';
    const old=form.querySelector('input[name="photo_url"]');
    if(old){currentUrl=old.value;old.closest('.field')?.remove();}
    const root=document.createElement('section');root.className='profile-photo-editor';
    root.innerHTML='<div class="profile-photo-preview" aria-hidden="true"></div><div class="profile-photo-controls"><strong>Tu fotografía</strong><p>Esta imagen puede ser visible en tu perfil. Usá una foto tuya si querés que te reconozcan.</p><label class="profile-photo-label">Elegir imagen<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Elegir foto de perfil"></label><div class="profile-photo-actions"><button type="button" class="button" data-profile-upload disabled>Subir foto</button><button type="button" class="button secondary" data-profile-remove>Quitar foto</button></div><p class="profile-photo-status" role="status" aria-live="polite"></p></div>';
    const preview=root.querySelector('.profile-photo-preview'),input=root.querySelector('input'),upload=root.querySelector('[data-profile-upload]'),remove=root.querySelector('[data-profile-remove]'),status=root.querySelector('.profile-photo-status');
    let temporary='';
    function paint(url){preview.replaceChildren();if(url){const img=document.createElement('img');img.src=url;img.alt='';preview.append(img)}else {const text=document.createElement('span');text.textContent='Foto';preview.append(text)}remove.hidden=!currentUrl;}
    paint(currentUrl);
    input.onchange=()=>{if(temporary)URL.revokeObjectURL(temporary);const file=input.files?.[0];temporary=file?URL.createObjectURL(file):'';paint(temporary||currentUrl);upload.disabled=!file;status.textContent=file?'Vista previa lista. Subí la foto para guardarla.':''};
    upload.onclick=async()=>{const file=input.files?.[0];if(!file)return;if(file.size>6*1024*1024){status.textContent='La foto debe pesar como máximo 6 MB.';return}const data=new FormData();data.append('photo',file);upload.disabled=true;try{const response=await fetch('/api/account/profile/photo',{method:'POST',body:data});const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||'No se pudo guardar la foto.');if(!photoPattern.test(result.photo_url))throw Error('No se recibió una dirección de foto válida.');currentUrl=result.photo_url;if(temporary)URL.revokeObjectURL(temporary);temporary='';input.value='';paint(currentUrl);status.textContent='Foto guardada.'}catch(err){status.textContent=err.message;upload.disabled=false}};
    remove.onclick=async()=>{remove.disabled=true;try{const response=await fetch('/api/account/profile/photo/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw Error('No se pudo quitar la foto.');currentUrl='';if(temporary)URL.revokeObjectURL(temporary);temporary='';input.value='';upload.disabled=true;paint('');status.textContent='Foto eliminada.'}catch(err){status.textContent=err.message}finally{remove.disabled=false}};
    form.prepend(root);
  }
  new MutationObserver(init).observe(document.querySelector('#main'),{childList:true,subtree:true});init();
})();
