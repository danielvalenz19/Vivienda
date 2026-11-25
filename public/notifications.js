'use strict';
(() => {
  const header = document.querySelector('.nav-actions');
  if (!header) return;
  const button = document.createElement('button');
  button.className = 'icon-button notification-button';
  button.type = 'button';
  button.setAttribute('aria-label','Notificaciones');
  button.title = 'Notificaciones';
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 20a2 2 0 0 0 4 0"/></svg><span class="notification-count" hidden></span>';
  header.insertBefore(button, header.querySelector('[data-action="account"]'));
  const dialog = document.createElement('dialog');
  dialog.className = 'notifications-dialog';
  dialog.setAttribute('aria-labelledby','notifications-title');
  dialog.innerHTML = '<div class="notifications-head"><div><h2 id="notifications-title">Notificaciones</h2><p>Las novedades de tu cuenta, en un solo lugar.</p></div><button type="button" class="notification-close" aria-label="Cerrar">×</button></div><div class="notifications-actions"><button type="button" class="notification-read-all">Marcar todas como leídas</button></div><div class="notifications-list" aria-live="polite"></div>';
  document.body.append(dialog);
  const list=dialog.querySelector('.notifications-list'), badge=button.querySelector('.notification-count');
  async function request(url,options={}) {
    const response = await fetch('/api'+url,{credentials:'same-origin',...options});
    if (!response.ok) throw new Error(response.status===401?'Iniciá sesión para ver tus notificaciones.':'No pudimos cargar las notificaciones. Intentá de nuevo.');
    return response.json();
  }
  function date(value) {
    const parsed = new Date(String(value).replace(' ','T')+'Z');
    return Number.isNaN(parsed.getTime())?'':new Intl.DateTimeFormat('es-GT',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(parsed);
  }
  async function refresh(showErrors=false) {
    try {
      const data=await request('/notifications');
      badge.hidden=!data.unread;
      badge.textContent=data.unread>99?'99+':String(data.unread);
      button.setAttribute('aria-label', data.unread ? `Notificaciones: ${data.unread} sin leer` : 'Notificaciones');
      list.replaceChildren();
      if (!data.items.length) { const p=document.createElement('p');p.className='notifications-empty';p.textContent='Todavía no tenés notificaciones.';list.append(p);return; }
      for (const item of data.items) {
        const row=document.createElement('article');row.className='notification-item'+(item.read_at?'':' unread');
        const copy=document.createElement('div'), text=document.createElement('p'), time=document.createElement('time');
        text.textContent=item.text;time.textContent=date(item.created);copy.append(text,time);row.append(copy);
        if (!item.read_at) {
          const mark=document.createElement('button');mark.type='button';mark.textContent='Marcar leída';
          mark.onclick=async()=>{mark.disabled=true;try{await request('/notifications/'+item.id+'/read',{method:'POST'});await refresh(true)}catch(e){list.setAttribute('data-error',e.message);mark.disabled=false}};
          row.append(mark);
        }
        list.append(row);
      }
    } catch (e) {
      badge.hidden=true;
      if(showErrors) {list.replaceChildren();const p=document.createElement('p');p.className='notifications-empty';p.textContent=e.message;list.append(p);}
    }
  }
  button.addEventListener('click',()=>{dialog.showModal();refresh(true)});
  dialog.querySelector('.notification-close').onclick=()=>dialog.close();
  dialog.querySelector('.notification-read-all').onclick=async()=>{try{await request('/notifications/read-all',{method:'POST'});await refresh(true)}catch(e){list.replaceChildren();list.textContent=e.message}};
  refresh();setInterval(()=>refresh(),30000);
})();
