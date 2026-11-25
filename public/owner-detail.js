'use strict';
// Owner-only summary uses messages already scoped to the authenticated participant.
window.ViviendaOwner=(()=>{
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function summary(rows,user,listing){
    if(!rows)return '<section class="detail-section owner-interest"><h2>Interesados en tu vivienda</h2><p>No pudimos cargar las conversaciones. Volvé a intentar en Mensajes.</p></section>';
    const relevant=rows.filter(m=>Number(m.listing)===Number(listing));const conversations=new Map();
    for(const m of relevant){const other=m.sender===user.id?m.recipient:m.sender;if(!conversations.has(other))conversations.set(other,{id:other,name:(m.sender===user.id?m.recipient_name:m.sender_name)||'Persona interesada',last:m});}
    const received=relevant.filter(m=>m.recipient===user.id).length;
    const list=[...conversations.values()];
    return `<section class="detail-section owner-interest"><div class="owner-interest-head"><div><h2>Interesados en tu vivienda</h2><p>Conversaciones vinculadas a este anuncio.</p></div><div class="owner-metrics"><span><strong>${list.length}</strong> ${list.length===1?'conversación':'conversaciones'}</span><span><strong>${received}</strong> ${received===1?'mensaje recibido':'mensajes recibidos'}</span></div></div>${list.length?`<div class="owner-threads">${list.map(t=>`<button type="button" class="owner-thread" data-owner-thread="${esc(t.id)}" data-owner-listing="${esc(listing)}"><span class="owner-thread-avatar">${esc(t.name.trim().charAt(0).toLocaleUpperCase('es'))}</span><span class="owner-thread-body"><strong>${esc(t.name)}</strong><span>${esc(t.last.body)}</span></span><span class="owner-thread-action">Abrir chat</span></button>`).join('')}</div>`:'<p class="owner-no-threads">Todavía no hay conversaciones para esta vivienda.</p>'}</section>`;
  }
  document.addEventListener('click',e=>{const button=e.target.closest('[data-owner-thread]');if(!button)return;window.ViviendaChat?.openThread(Number(button.dataset.ownerListing),Number(button.dataset.ownerThread));window.Vivienda?.navigate('#/cuenta/mensajes')});
  return {summary};
})();
