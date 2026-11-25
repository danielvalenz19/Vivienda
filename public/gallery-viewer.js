'use strict';
window.ViviendaGallery={
 open(trigger){
  const buttons=[...document.querySelectorAll('.gallery [data-view-photo]')];
  if(!buttons.length)return;
  let index=Math.max(0,buttons.indexOf(trigger));
  const before=document.activeElement,dialog=document.createElement('dialog');
  dialog.className='gallery-viewer';dialog.setAttribute('aria-labelledby','gallery-viewer-title');
  dialog.innerHTML='<div class="gallery-viewer-header"><h2 id="gallery-viewer-title">Fotos de la vivienda</h2><button type="button" class="gallery-viewer-close" aria-label="Cerrar galería">×</button></div><div class="gallery-viewer-stage"><img alt=""></div><div class="gallery-viewer-controls"><button type="button" class="button secondary" data-gallery-previous>Anterior</button><span class="gallery-viewer-count" aria-live="polite"></span><button type="button" class="button secondary" data-gallery-next>Siguiente</button></div>';
  const image=dialog.querySelector('img'),counter=dialog.querySelector('.gallery-viewer-count'),previous=dialog.querySelector('[data-gallery-previous]'),next=dialog.querySelector('[data-gallery-next]');
  function draw(){const focused=document.activeElement,item=buttons[index],original=item.querySelector('img');image.src=item.dataset.viewPhoto;image.alt=original?.alt||`Foto ${index+1} de la vivienda`;counter.textContent=`${index+1} de ${buttons.length}`;previous.disabled=index===0;next.disabled=index===buttons.length-1;if(focused===previous&&previous.disabled&&!next.disabled)next.focus();else if(focused===next&&next.disabled&&!previous.disabled)previous.focus()}
  previous.onclick=()=>{if(index>0){index--;draw();(previous.disabled?next:previous).focus()}};next.onclick=()=>{if(index<buttons.length-1){index++;draw();(next.disabled?previous:next).focus()}};
  dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'&&index>0){event.preventDefault();index--;draw()}else if(event.key==='ArrowRight'&&index<buttons.length-1){event.preventDefault();index++;draw()}});
  dialog.querySelector('.gallery-viewer-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{dialog.remove();if(before?.isConnected)before.focus()});document.body.append(dialog);draw();dialog.showModal();dialog.querySelector('.gallery-viewer-close').focus();
 }
};
