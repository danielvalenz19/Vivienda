'use strict';
// A thread is a listing and the other participant, not just the listing.
window.ViviendaChat = (() => {
  let selectedKey = null, mobileThreadOpen = false, refreshTimer = null;
  const clean = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const photoUrl = value => /^\/(?:api\/profile-photos\/[a-f0-9]{32}|api\/photos\/[a-f0-9]{32}|assets\/demo\/vivienda-\d+\.jpg)$/.test(value||'') ? value : '';
  const initials = name => String(name||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0].toLocaleUpperCase('es')).join('') || '?';
  const date = value => { let parsed=new Date(String(value||'').replace(' ','T')+'Z'); if(Number.isNaN(parsed.getTime()))return ''; return new Intl.DateTimeFormat('es-GT',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(parsed); };
  const avatar = (name,photo,variant='') => `<span class="chat-avatar ${variant}" aria-hidden="true">${photoUrl(photo)?`<img src="${clean(photoUrl(photo))}" alt="">`:clean(initials(name))}</span>`;
  function threadsFor(rows,user) {
    const threads=new Map();
    for(const m of rows){const own=m.sender===user.id,other=own?m.recipient:m.sender,key=`${m.listing}:${other}`;if(!threads.has(key))threads.set(key,{key,other,listing:m.listing,title:m.title,area:m.area,city:m.city,messages:[]});const t=threads.get(key);t.otherName=(own?m.recipient_name:m.sender_name)||'Persona usuaria';t.otherPhoto=(own?m.recipient_photo:m.sender_photo)||'';t.listingPhoto=m.listing_photo?'/api/photos/'+m.listing_photo:m.listing_image;t.messages.push(m)}
    for(const t of threads.values()){t.messages.sort((a,b)=>a.id-b.id);t.last=t.messages[t.messages.length-1];t.unread=t.messages.filter(m=>m.recipient===user.id&&!m.read_at).length}
    return [...threads.values()].sort((a,b)=>b.last.id-a.last.id);
  }
  async function render(box, rows, user, deps) {
    if(refreshTimer) clearInterval(refreshTimer);
    const threads=threadsFor(rows,user);
    if(!threads.some(t=>t.key===selectedKey))selectedKey=threads[0]?.key||null;
    let query='';
    box.classList.add('chat-panel');
    box.innerHTML=`<div class="chat-title"><div><h2>Mensajes</h2><p>Conversaciones privadas sobre tus viviendas.</p></div></div><div class="chat-layout"><section class="chat-list-pane" aria-label="Lista de conversaciones"><div class="chat-list-head"><h3>Conversaciones</h3><span>${threads.length}</span></div><label class="chat-search"><span class="sr-only">Buscar conversación</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input type="search" placeholder="Buscar por persona o vivienda"></label><div class="chat-list"></div></section><section class="chat-thread-pane" aria-label="Conversación seleccionada"></section></div>`;
    const layout=box.querySelector('.chat-layout'), list=box.querySelector('.chat-list'), pane=box.querySelector('.chat-thread-pane');
    const filtered=()=>threads.filter(t=>`${t.otherName} ${t.title}`.toLocaleLowerCase('es').includes(query));
    function drawList(){let visible=filtered();list.innerHTML=visible.length?visible.map(t=>`<button type="button" class="chat-list-item ${t.key===selectedKey?'selected':''}" data-chat-select="${clean(t.key)}" ${t.key===selectedKey?'aria-current="true"':''}>${avatar(t.otherName,t.otherPhoto)}<span class="chat-list-copy"><span class="chat-list-top"><strong>${clean(t.otherName)}</strong><time>${clean(date(t.last.created))}</time></span><span class="chat-property-title">${clean(t.title)}</span><span class="chat-preview">${t.last.sender===user.id?'Vos: ':''}${clean(t.last.body)}</span></span>${t.unread?`<span class="chat-unread" aria-label="${t.unread} ${t.unread===1?'mensaje':'mensajes'} sin leer">${t.unread}</span>`:''}</button>`).join(''):`<div class="chat-list-empty">${threads.length?'No encontramos conversaciones con ese texto.':'Todavía no tenés conversaciones. Contactá a un anunciante para comenzar.'}</div>`}
    function drawThread(){const t=threads.find(t=>t.key===selectedKey);layout.classList.toggle('chat-thread-open',mobileThreadOpen&&!!t);if(!t){pane.innerHTML='<div class="chat-welcome"><h3>Tu bandeja está lista</h3><p>Elegí una conversación para ver los mensajes.</p></div>';return}let thumb=photoUrl(t.listingPhoto);pane.innerHTML=`<header class="chat-thread-head"><button type="button" class="chat-back" data-chat-back aria-label="Volver a conversaciones"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>${avatar(t.otherName,t.otherPhoto,'chat-avatar-head')}<div class="chat-person"><h3>${clean(t.otherName)}</h3><p>${clean(t.title)}</p></div><div class="chat-actions"><button type="button" class="chat-menu-action" data-chat-block>Bloquear persona</button><button type="button" class="chat-menu-action" data-chat-report-user>Reportar persona</button></div></header><div class="chat-listing-strip">${thumb?`<img src="${clean(thumb)}" alt="">`:'<span class="chat-listing-placeholder" aria-hidden="true"></span>'}<div><strong>${clean(t.title)}</strong><span>${clean(t.area||'')} ${t.area&&t.city?'· ':''}${clean(t.city||'')}</span></div></div><div class="chat-history" aria-label="Historial de mensajes" role="log" aria-live="polite">${t.messages.map(m=>`<div class="chat-message-row ${m.sender===user.id?'is-mine':''}"><div class="chat-bubble"><p>${clean(m.body)}</p><time>${clean(date(m.created))}</time>${m.sender!==user.id?`<button type="button" class="chat-report-message" data-chat-report-message="${clean(m.id)}">Reportar mensaje</button>`:''}</div></div>`).join('')}</div><div class="chat-compose-wrap"><p class="chat-safety">No compartás datos sensibles ni enviés anticipos sin verificar la vivienda.</p><form class="chat-compose"><label class="sr-only" for="chat-message-input">Escribí tu mensaje</label><textarea id="chat-message-input" name="body" rows="1" required maxlength="2000" placeholder="Escribí tu mensaje…"></textarea><button class="button chat-send" type="submit" aria-label="Enviar mensaje"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 18-8-6 18-4-7-8-3Zm8 3 10-11"/></svg><span>Enviar</span></button></form><p class="chat-error" role="alert" aria-live="polite"></p></div>`;
      if(t.unread&&(mobileThreadOpen||window.matchMedia('(min-width: 761px)').matches)){
        deps.api('/conversations/'+t.listing+'/'+t.other+'/read',{}).then(()=>{
          for(const m of t.messages)if(m.recipient===user.id&&!m.read_at)m.read_at='read';
          t.unread=0;if(box.isConnected)drawList();
        }).catch(()=>{if(box.isConnected){const notice=pane.querySelector('.chat-error');if(notice)notice.textContent='No se pudo actualizar el estado de lectura.'}});
      }
      let history=pane.querySelector('.chat-history');history.scrollTop=history.scrollHeight;
      pane.querySelector('[data-chat-back]').onclick=()=>{mobileThreadOpen=false;layout.classList.remove('chat-thread-open');list.querySelector('[aria-current]')?.focus()};
      pane.querySelector('[data-chat-report-user]').onclick=()=>window.ViviendaReports.open('user',t.other);
      pane.querySelectorAll('[data-chat-report-message]').forEach(button=>{button.onclick=()=>window.ViviendaReports.open('message',Number(button.dataset.chatReportMessage))});
      pane.querySelector('[data-chat-block]').onclick=async()=>{if(!confirm(`¿Bloquear a ${t.otherName}? No podrán continuar la conversación.`))return;try{await deps.api('/blocks',{user:t.other});deps.toast('Persona bloqueada.');}catch(err){pane.querySelector('.chat-error').textContent=err.message}};
      let pendingAttempt=null;
      pane.querySelector('.chat-compose').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,input=form.elements.body,button=form.querySelector('button'),message=input.value.trim();if(!message)return;if(!deps.warnSensitive(message))return;if(!pendingAttempt||pendingAttempt.body!==message)pendingAttempt={body:message,id:crypto.randomUUID()};button.disabled=true;pane.querySelector('.chat-error').textContent='';try{await deps.api('/reply',{message:t.last.id,body:message,client_id:pendingAttempt.id});let nextRows=await deps.api('/messages');await render(box,nextRows,user,deps);box.querySelector('#chat-message-input')?.focus()}catch(err){pane.querySelector('.chat-error').textContent='No se pudo enviar. Podés intentar de nuevo.';button.disabled=false;input.focus()}};
    }
    list.onclick=e=>{let button=e.target.closest('[data-chat-select]');if(!button)return;selectedKey=button.dataset.chatSelect;mobileThreadOpen=true;drawList();drawThread()};
    box.querySelector('.chat-search input').addEventListener('input',e=>{query=e.target.value.trim().toLocaleLowerCase('es');drawList()});
    drawList();drawThread();
    // El sondeo solo actualiza si no hay un borrador ni una búsqueda en curso.
    // Así evita borrar texto o robar el foco mientras alguien escribe.
    refreshTimer=setInterval(async()=>{
      if(!box.isConnected){clearInterval(refreshTimer);refreshTimer=null;return}
      if(document.hidden||box.querySelector('#chat-message-input')?.value||query)return;
      try{const next=await deps.api('/messages');if(!box.isConnected||box.querySelector('#chat-message-input')?.value||box.querySelector('.chat-search input')?.value)return;
        const ids=items=>items.map(m=>m.id).join(',');
        if(ids(next)!==ids(rows))await render(box,next,user,deps);
      }catch{ /* se intentará de nuevo en el siguiente sondeo */ }
    },15000);
  }
  function openThread(listing,other){selectedKey=`${listing}:${other}`;mobileThreadOpen=true;}
  return {render,openThread};
})();
