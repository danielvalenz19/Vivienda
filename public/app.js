'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const list = $('#list'), modal = $('#modal'), content = $('#modalcontent');
let user = null, homes = [], saved = [], pendingAction = null;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => `Q${Number(value || 0).toLocaleString('es-GT')}`;
function safeImage(value) { if (/^\/(?:api\/photos\/[a-f0-9]{32}|assets\/demo\/vivienda-[1-9][0-9]*\.jpg)$/.test(value || '')) return value; try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } }
async function api(url, data) {
  let response;
  try { response = await fetch('/api' + url, { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) }); }
  catch { throw new Error('No pudimos conectar con el servidor. Revisá tu conexión y probá de nuevo.'); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'No pudimos completar esta acción. Probá de nuevo.');
  return payload;
}
function show(html) { content.innerHTML = html; if (!modal.open) modal.showModal(); }
function closeModal() { modal.close(); pendingAction = null; }
$('.close').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
modal.addEventListener('cancel', () => { pendingAction = null; });
function formError(error) { let el = $('.error', content); if (el) { el.textContent = error.message; el.focus(); } else show(`<h2>Algo salió mal</h2><p>${escapeHtml(error.message)}</p>`); }
function feedback(message) { show(`<h2>Listo</h2><p>${escapeHtml(message)}</p><button type="button" class="btn" data-close>Entendido</button>`); $('[data-close]',content).onclick = closeModal; }
function statusLabel(status) { return ({pending:'En revisión',active:'Disponible',paused:'Pausado',rented:'Alquilado',rejected:'Rechazado',expired:'Vencido'})[status] || status; }
async function refresh() {
  user = await api('/me');
  homes = await api('/listings');
  const photos = await api('/photo-index');
  for (const h of homes) { const photo = photos.find(p => p.listing === h.id); if (photo) h.image = '/api/photos/' + photo.id; }
  saved = user ? await api('/favorites') : [];
  $('#account').textContent = user ? user.name : 'Ingresar';
  render();
}
function makeCard(h) {
  const article = document.createElement('article'); article.className = 'card';
  article.innerHTML = `<div class="photo"><span class="tag">${escapeHtml(h.type)}</span><button class="heart" type="button" aria-label="${saved.includes(h.id) ? 'Quitar de favoritos' : 'Guardar en favoritos'}" aria-pressed="${saved.includes(h.id)}" data-save="${h.id}">${saved.includes(h.id) ? '♥' : '♡'}</button></div><div class="body"><div class="location">${escapeHtml(h.area)} · ${escapeHtml(h.city)}</div><h3>${escapeHtml(h.title)}</h3><div class="details">${escapeHtml(h.rooms)} habitaciones · ${escapeHtml(h.baths)} baños</div><div class="price">${money(h.price)} <small>/ mes</small></div><button class="btn outline more" type="button" data-detail="${h.id}">Ver detalles</button></div>`;
  const photo = $('.photo', article), url = safeImage(h.image);
  if (url) { const img = document.createElement('img'); img.src = url; img.alt = `Fotografía de ${h.title}`; img.loading = 'lazy'; img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block'; img.onerror = () => { img.remove(); photo.classList.add('photo-empty'); }; photo.prepend(img); }
  else { photo.classList.add('photo-empty'); const empty = document.createElement('span'); empty.textContent = 'Sin fotografía'; empty.style.cssText = 'display:grid;place-items:center;height:100%;color:#647b70'; photo.prepend(empty); }
  return article;
}
function render() {
  const city = $('#city').value, type = $('#type').value, budget = Number($('#budget').value);
  const rooms = Number($('#rooms-filter').value), service = $('#service-filter').value;
  const rows = homes.filter(h => (!city || h.city === city) && (!type || h.type === type) && (!budget || h.price <= budget) && (!rooms || h.rooms >= rooms) && (!service || (h.services || '').toLocaleLowerCase('es').includes(service))); 
  $('#count').textContent = `${rows.length} ${rows.length === 1 ? 'vivienda' : 'viviendas'}`;
  list.replaceChildren();
  if (rows.length) rows.forEach(h => list.append(makeCard(h)));
  else list.innerHTML = '<div class="empty"><h3>Aún no hay viviendas para estos filtros</h3><p>Probá otra búsqueda o volvé más tarde.</p></div>';
  $$('.chip[data-city]').forEach(b => b.classList.toggle('active', b.dataset.city === city));
}
['rooms-filter','service-filter'].forEach(id => document.getElementById(id).addEventListener('change', render));
$('#search').addEventListener('submit', e => { e.preventDefault(); render(); $('#explorar').scrollIntoView({behavior:'smooth'}); });
$$('.chip[data-city]').forEach(b => b.addEventListener('click', () => { $('#city').value = b.dataset.city; render(); }));
function login(register = false, after = pendingAction) {
  pendingAction = after;
  show(`<div class="eyebrow">Tu espacio en Vivienda GT</div><h2>${register ? 'Crear cuenta' : 'Bienvenido de nuevo'}</h2><p>Ingresá para guardar viviendas, publicar y conversar.</p><form id="authform">${register ? '<label>Nombre<input name="name" autocomplete="name" required maxlength="80"></label>' : ''}<label>Correo<input type="email" name="email" autocomplete="email" required></label><label>Contraseña<input type="password" name="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="8" required></label><p class="error" role="alert" tabindex="-1"></p><button class="btn">${register ? 'Crear cuenta' : 'Ingresar'}</button></form><p><button type="button" class="btn outline" id="toggleauth">${register ? 'Ya tengo cuenta' : 'Crear cuenta'}</button></p>`);
  $('#toggleauth').onclick = () => login(!register, pendingAction);
  $('#authform').onsubmit = async e => { e.preventDefault(); const button = $('button[type="submit"], button:not([type])', e.target); button.disabled = true; try { await api(register ? '/register' : '/login', Object.fromEntries(new FormData(e.target))); modal.close(); const next = pendingAction; pendingAction = null; await refresh(); if (next) await next(); } catch (error) { formError(error); } finally { button.disabled = false; } };
}
function requireUser(action) { if (user) { Promise.resolve(action()).catch(formError); return; } login(false, action); }
function detail(id) {
  const h = homes.find(x => x.id === id); if (!h) return;
  show(`<div class="eyebrow">${escapeHtml(h.type)} · ${escapeHtml(h.city)}</div><h2>${escapeHtml(h.title)}</h2><p>${escapeHtml(h.area)} · ${escapeHtml(h.owner_name)}</p><p><strong>${money(h.price)} / mes</strong> · Depósito ${money(h.deposit)}</p><div id="photo-gallery" class="photo-gallery"></div><p>${escapeHtml(h.description)}</p><p>${escapeHtml(h.rooms)} habitaciones · ${escapeHtml(h.baths)} baños</p><p>Servicios: ${escapeHtml(h.services || "No informado")}<br>Parqueo: ${escapeHtml(h.parking || "No informado")} · Amueblado: ${escapeHtml(h.furnished || "No informado")} · Mascotas: ${escapeHtml(h.pets || "No informado")}</p><p>Cargos adicionales: ${escapeHtml(h.extra_costs || "No informado")}<br>Condiciones: ${escapeHtml(h.conditions || "No informado")}</p><p>Disponibilidad confirmada: ${escapeHtml(h.confirmed || "No informado")}</p><button class="btn" type="button" id="contact">Contactar</button> <button class="btn outline" type="button" id="report">Reportar</button>`);
  api('/listings/'+id+'/photos').then(rows => { const box=$('#photo-gallery'); if(!box) return; if(!rows.length && safeImage(h.image)){const image=document.createElement('img');image.src=safeImage(h.image);image.alt='Fotografía de '+h.title;box.append(image);} rows.forEach(p=>{ const image=document.createElement('img'); image.src='/api/photos/'+p.id; image.alt='Fotografía de '+h.title; image.loading='lazy'; box.append(image); }); }).catch(()=>{});
  $('#contact').onclick = () => requireUser(() => contact(h));
  $('#report').onclick = () => requireUser(() => report(h));
}
function contact(h) {
  show(`<h2>Contactar al anunciante</h2><p>Consultá sobre ${escapeHtml(h.title)}. Evitá compartir información sensible.</p><form id="message"><label>Mensaje<textarea name="body" required maxlength="2000" rows="4"></textarea></label><p class="error" role="alert" tabindex="-1"></p><button class="btn">Enviar mensaje</button></form>`);
  $('#message').onsubmit = async e => { e.preventDefault(); const btn = $('button', e.target); btn.disabled = true; try { await api('/messages',{listing:h.id,body:new FormData(e.target).get('body')}); feedback('Tu mensaje fue enviado. Revisá tus conversaciones desde Mensajes.'); } catch(error) { formError(error); } finally { btn.disabled = false; } };
}
function report(h) {
  show(`<h2>Reportar anuncio</h2><p>Contanos qué sucede con ${escapeHtml(h.title)}.</p><form id="reportform"><label>Motivo<textarea name="reason" required maxlength="1000" rows="4"></textarea></label><p class="error" role="alert" tabindex="-1"></p><button class="btn">Enviar reporte</button></form>`);
  $('#reportform').onsubmit = async e => { e.preventDefault(); try { await api('/reports',{listing:h.id,reason:new FormData(e.target).get('reason')}); feedback('Recibimos tu reporte. Gracias por avisarnos.'); } catch(error) { formError(error); } };
}
list.addEventListener('click', e => { const s = e.target.closest('[data-save]'), d = e.target.closest('[data-detail]'); if (s) { const id = Number(s.dataset.save); requireUser(async () => { await api('/favorites/'+id,{}); saved = await api('/favorites'); render(); }); } if (d) detail(Number(d.dataset.detail)); });
async function uploadPhotos(id, files) {
  if (!files.length) return;
  if (files.length > 8 || files.some(file=>file.size>6*1024*1024)) throw Error('Podés subir hasta 8 fotos de 6 MB cada una.');
  const body=new FormData(); for(const file of files) body.append('photos',file);
  const response=await fetch('/api/listings/'+id+'/photos',{method:'POST',body});
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw Error(result.error||'No se pudieron subir las fotos.');
}
function publish() {
  show(`<h2>Publicar vivienda</h2><p>Tu anuncio pasará a revisión antes de aparecer en la búsqueda.</p><form id="publishform"><label>Título<input name="title" required maxlength="120"></label><label>Ciudad<select name="city"><option>Ciudad de Guatemala</option><option>Xela</option></select></label><label>Zona o sector<input name="area" required maxlength="80"></label><label>Tipo<select name="type"><option>Apartamento</option><option>Cuarto</option></select></label><label>Renta mensual (Q)<input name="price" type="number" min="1" required></label><label>Depósito (Q)<input name="deposit" type="number" min="0" value="0"></label><label>Habitaciones<input name="rooms" type="number" min="0" value="1"></label><label>Baños<input name="baths" type="number" min="0" value="1"></label><label>Servicios incluidos<input name="services" maxlength="500"></label><label>Parqueo<select name="parking"><option>No informado</option><option>Sí</option><option>No</option></select></label><label>Amueblado<select name="furnished"><option>No informado</option><option>Sí</option><option>No</option></select></label><label>Mascotas<select name="pets"><option>No informado</option><option>Sí</option><option>No</option></select></label><label>Cargos adicionales<input name="extra_costs" maxlength="500"></label><label>Condiciones del alquiler<input name="conditions" maxlength="1000"></label><label>Descripción<textarea name="description" required maxlength="3000" rows="4"></textarea></label><label>Fotografías (JPEG, PNG o WebP; hasta 8, de 6 MB cada una)<input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><p class="error" role="alert" tabindex="-1"></p><button class="btn">Enviar a revisión</button></form>`);
  $('#publishform').onsubmit = async e => { e.preventDefault(); const btn = $('button', e.target); btn.disabled = true; try { const data=new FormData(e.target); const files=data.getAll('photos').filter(f=>f.size); data.delete('photos'); const listing=await api('/listings',Object.fromEntries(data)); try { await uploadPhotos(listing.id,files); } catch (error) { throw Error('Tu anuncio quedó guardado, pero no se subieron las fotos. Abrí Mis anuncios para agregarlas. '+error.message); } feedback('Tu anuncio fue enviado a revisión.'); } catch(error) { formError(error); } finally { btn.disabled = false; } };
}
$('#publish').onclick = () => requireUser(publish);
async function favorites() {
  const rows = await api('/favorite-listings');
  show(`<div class="eyebrow">Tu selección</div><h2>Viviendas guardadas</h2>${!rows.length ? '<p>Aún no guardaste viviendas. Tocá el corazón en un anuncio para encontrarlo aquí.</p>' : ''}<div id="favorite-list"></div>`);
  const container = $('#favorite-list'); container.style.cssText = 'display:grid;gap:12px';
  rows.forEach(h => { let row = document.createElement('div'); row.innerHTML = `<p><strong>${escapeHtml(h.title)}</strong><br>${escapeHtml(h.area)}, ${escapeHtml(h.city)} · ${money(h.price)} / mes<br>${escapeHtml(statusLabel(h.status))}</p>${homes.some(x=>x.id===h.id)?`<button class="btn outline" type="button" data-view="${h.id}">Ver vivienda</button> `:''}<button class="btn outline" type="button" data-remove="${h.id}">Quitar</button>`; container.append(row); });
  container.onclick = async e => { const view = e.target.closest('[data-view]'), remove = e.target.closest('[data-remove]'); if(view) detail(+view.dataset.view); if(remove) { try { await api('/favorites/'+remove.dataset.remove,{}); saved = await api('/favorites'); await favorites(); render(); } catch(error) { formError(error); } } };
}
async function inbox() {
  const messages = await api('/messages');
  const groups = new Map();
  for (const m of messages) { const other = m.sender === user.id ? m.recipient : m.sender; const key = `${m.listing}:${other}`; if (!groups.has(key)) groups.set(key,[]); groups.get(key).push(m); }
  show(`<div class="eyebrow">Conversaciones privadas</div><h2>Mensajes</h2>${groups.size ? '<div id="conversations"></div>' : '<p>Aún no tenés mensajes. Contactá a un anunciante para iniciar una conversación.</p>'}`);
  const box = $('#conversations'); if (!box) return;
  for (const group of groups.values()) {
    group.sort((a,b)=>a.id-b.id); const last=group[group.length-1], otherName=group.find(m=>m.sender!==user.id)?.sender_name || 'Anunciante';
    const section=document.createElement('section'); section.innerHTML=`<h3>${escapeHtml(last.title)}</h3><p>Conversación con ${escapeHtml(otherName)}</p><button type="button" class="btn outline" data-block>Bloquear persona</button><div>${group.map(m=>`<p><strong>${m.sender===user.id?'Vos':escapeHtml(m.sender_name)}</strong><br>${escapeHtml(m.body)}</p>`).join('')}</div><form><label>Responder<textarea name="body" rows="3" maxlength="2000" required></textarea></label><p class="error" role="alert" tabindex="-1"></p><button class="btn">Enviar respuesta</button></form>`;
    const other = last.sender === user.id ? last.recipient : last.sender; $('[data-block]',section).onclick=async()=>{if(!window.confirm('¿Querés bloquear a esta persona? No podrá continuar la conversación.')) return;try{await api('/blocks',{user:other});feedback('Persona bloqueada.');}catch(error){formError(error);}}; $('form',section).onsubmit=async e=>{e.preventDefault();const btn=$('button',e.target);btn.disabled=true;try{await api('/reply',{message:last.id,body:new FormData(e.target).get('body')});await inbox();}catch(error){$('.error',section).textContent=error.message;}finally{btn.disabled=false;}};box.append(section);
  }
}
async function mine() {
  const rows = await api('/mine');
  show(`<h2>Mis anuncios</h2>${rows.length ? rows.map(x=>`<section><h3>${escapeHtml(x.title)}</h3><p>Estado: ${escapeHtml(statusLabel(x.status))}${x.confirmed ? ` · Confirmado: ${escapeHtml(x.confirmed)}` : ''}</p><button class="btn outline" data-edit="${x.id}">Editar</button> ${x.status==='active'?`<button class="btn outline" data-confirm="${x.id}">Confirmar disponibilidad</button> <button class="btn outline" data-status="${x.id}" data-value="paused">Pausar</button>`:''} ${x.status==='paused'?`<button class="btn outline" data-status="${x.id}" data-value="pending">Solicitar publicación</button>`:''} ${['active','paused','pending'].includes(x.status)?`<button class="btn outline" data-status="${x.id}" data-value="rented">Marcar alquilado</button>`:''}</section>`).join('') : '<p>Aún no has publicado anuncios.</p>'}`);
  $$('[data-status]',content).forEach(b=>b.onclick=async()=>{try{await api('/listings/'+b.dataset.status+'/status',{status:b.dataset.value});await refresh();await mine();}catch(error){formError(error);}});
  $$('[data-confirm]',content).forEach(b=>b.onclick=async()=>{try{await api('/listings/'+b.dataset.confirm+'/confirm',{});await refresh();await mine();}catch(error){formError(error);}});
  $$('[data-edit]',content).forEach(b=>b.onclick=()=>editListing(rows.find(x=>x.id===Number(b.dataset.edit))));
}
function editListing(h) {
  const field=(name,label,type='text')=>`<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(h[name]??'')}" required></label>`;
  const select=(name,label,options)=>`<label>${label}<select name="${name}">${options.map(v=>`<option${h[name]===v?' selected':''}>${escapeHtml(v)}</option>`).join('')}</select></label>`;
  show(`<h2>Editar anuncio</h2><p>Los cambios se enviarán a revisión antes de volver a publicarse.</p><form id="editform">${field('title','Título')}${select('city','Ciudad',['Ciudad de Guatemala','Xela'])}${field('area','Zona o sector')}${select('type','Tipo',['Apartamento','Cuarto'])}${field('price','Renta mensual (Q)','number')}${field('deposit','Depósito (Q)','number')}${field('rooms','Habitaciones','number')}${field('baths','Baños','number')}<label>Descripción<textarea name="description" required rows="4">${escapeHtml(h.description)}</textarea></label><label>Servicios<input name="services" value="${escapeHtml(h.services||'')}"></label>${select('parking','Parqueo',['No informado','Sí','No'])}${select('furnished','Amueblado',['No informado','Sí','No'])}${select('pets','Mascotas',['No informado','Sí','No'])}<label>Cargos adicionales<input name="extra_costs" value="${escapeHtml(h.extra_costs||'')}"></label><label>Condiciones<input name="conditions" value="${escapeHtml(h.conditions||'')}"></label><div id="existing-photos"></div><label>Agregar fotografías (hasta 8 en total)<input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><p class="error" role="alert" tabindex="-1"></p><button class="btn">Guardar y enviar a revisión</button></form>`);
  api('/listings/'+h.id+'/photos').then(rows=>{let box=$('#existing-photos');if(!box)return;box.innerHTML='<p>Fotos actuales</p>';for(const p of rows){const row=document.createElement('div');row.className='photo-manage';const img=document.createElement('img');img.src='/api/photos/'+p.id;img.alt='Foto del anuncio';const button=document.createElement('button');button.type='button';button.className='btn outline';button.textContent='Quitar foto';button.onclick=async()=>{try{await api('/photos/'+p.id+'/delete',{});row.remove();}catch(error){formError(error)}};row.append(img,button);box.append(row)}}).catch(()=>{});
  $('#editform').onsubmit=async e=>{e.preventDefault();const button=$('button[type=submit],button:not([type])',e.target);button.disabled=true;try{const data=new FormData(e.target),files=data.getAll('photos').filter(f=>f.size);data.delete('photos');await api('/listings/'+h.id+'/edit',Object.fromEntries(data));try{await uploadPhotos(h.id,files)}catch(error){throw Error('Los cambios quedaron guardados, pero no se subieron las fotos. '+error.message)}await refresh();feedback('Los cambios se enviaron a revisión.');}catch(error){formError(error);}finally{button.disabled=false}};
}
async function verification() {
  let result=await api('/verification');
  const labels={not_requested:'Aún no solicitada',pending:'Pendiente de revisión',approved:'Revisada',rejected:'No aprobada'};
  show(`<h2>Revisión de identidad</h2><p>Estado: <strong>${escapeHtml(labels[result.status]||result.status)}</strong></p><p>La solicitud inicia una revisión manual. Este sitio local no recibe ni almacena documentos de identidad. El equipo debe revisarlos por un canal acordado.</p>${result.note?`<p>Nota: ${escapeHtml(result.note)}</p>`:''}${['not_requested','rejected'].includes(result.status)?'<button class="btn" id="request-verification">Solicitar revisión</button>':''}`);
  if($('#request-verification'))$('#request-verification').onclick=async()=>{try{await api('/verification',{});await verification();}catch(error){formError(error);}};
}
async function moderation() {
  const data = await api('/admin');
  show(`<h2>Moderación</h2><p>Las revisiones de identidad y autorización son manuales y se realizan fuera de esta aplicación. Registrá una aprobación solo después de revisarlas.</p><p class="error" role="alert" tabindex="-1"></p><h3>Identidades pendientes</h3>${(data.verifications||[]).map(x=>`<section><p><strong>${escapeHtml(x.name)}</strong> · ${escapeHtml(x.email)}</p><button class="btn" data-verify="${x.user}" data-decision="approved">Confirmar revisión de identidad</button> <button class="btn outline" data-verify="${x.user}" data-decision="rejected">Rechazar</button></section>`).join('')||'<p>Sin solicitudes pendientes.</p>'}<h3>Anuncios pendientes</h3>${data.listings.map(x=>`<section><p><strong>${escapeHtml(x.title)}</strong> · ${escapeHtml(x.owner_name)}<br>Identidad: ${escapeHtml(x.verification_status)}<br>${escapeHtml(x.area)}, ${escapeHtml(x.city)} · ${money(x.price)} / mes<br>${escapeHtml(x.description)}</p><button class="btn" data-approve="${x.id}">Revisar autorización y aprobar</button> <button class="btn outline" data-reject="${x.id}">Rechazar</button></section>`).join('')||'<p>Sin anuncios pendientes.</p>'}<h3>Reportes</h3>${data.reports.map(x=>`<section><p><strong>${escapeHtml(x.title)}</strong> · ${escapeHtml(statusLabel(x.status))}<br>${escapeHtml(x.reason)}</p>${x.status==='pending'?`<button class="btn outline" data-report="${x.id}" data-decision="resolved">Marcar resuelto</button> <button class="btn outline" data-report="${x.id}" data-decision="dismissed">Descartar</button>`:''}</section>`).join('')||'<p>Sin reportes.</p>'}`);
  $$('[data-verify]',content).forEach(b=>b.onclick=async()=>{if(b.dataset.decision==='approved'&&!window.confirm('¿Revisaste la identidad de esta persona fuera de la aplicación?'))return;try{await api('/admin/verifications/'+b.dataset.verify,{status:b.dataset.decision});await moderation();}catch(error){formError(error);}});
  $$('[data-approve],[data-reject]',content).forEach(b=>b.onclick=async()=>{const approve=!!b.dataset.approve;if(approve&&!window.confirm('¿Revisaste fuera de la aplicación que esta persona está autorizada a anunciar este inmueble?'))return;try{await api('/admin/listings/'+(b.dataset.approve||b.dataset.reject),{status:approve?'active':'rejected',...(approve?{authorization:true}:{})});await refresh();await moderation();}catch(error){formError(error);}});
  $$('[data-report]',content).forEach(b=>b.onclick=async()=>{try{await api('/admin/reports/'+b.dataset.report,{status:b.dataset.decision});await moderation();}catch(error){formError(error);}});
}
function account() {
  if (!user) return login();
  show(`<h2>Hola, ${escapeHtml(user.name)}</h2><p>Administrá tu actividad en Vivienda GT.</p><p><button class="btn outline" id="mine">Mis anuncios</button> <button class="btn outline" id="inbox">Mensajes</button> <button class="btn outline" id="myfavorites">Favoritos</button> <button class="btn outline" id="verification">Revisión de identidad</button></p>${user.role==='admin'?'<p><button class="btn outline" id="admin">Moderación</button></p>':''}<button class="btn" id="logout">Cerrar sesión</button>`);
  $('#logout').onclick=async()=>{try{await api('/logout',{});modal.close();await refresh();}catch(error){formError(error);}};
  $('#verification').onclick=()=>verification().catch(formError); $('#mine').onclick=()=>mine().catch(formError); $('#inbox').onclick=()=>inbox().catch(formError); $('#myfavorites').onclick=()=>favorites().catch(formError); if($('#admin'))$('#admin').onclick=()=>moderation().catch(formError);
}
$('#account').onclick=account;
if ($('#favorites')) $('#favorites').onclick=()=>requireUser(favorites);
if ($('#messages')) $('#messages').onclick=()=>requireUser(inbox);
$('#safety').onclick=()=>show('<div class="eyebrow">Tu seguridad importa</div><h2>Antes de alquilar</h2><p>Visitá el inmueble, verificá la identidad de quien anuncia y confirmá renta, depósito y cargos antes de entregar dinero. Evitá compartir datos personales que no sean necesarios.</p>');
refresh().catch(()=>{$('#count').textContent='No se pudo conectar con el servidor.';list.innerHTML='<div class="empty"><h3>No se pudo cargar la búsqueda</h3><p>Revisá que el servidor local esté funcionando y recargá la página.</p></div>';});
