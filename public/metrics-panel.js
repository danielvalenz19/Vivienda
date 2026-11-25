'use strict';
window.ViviendaMetrics={
 async render(box,api){
  box.innerHTML='<h3>Métricas operativas</h3><p class="subtle">Cargando métricas…</p>';
  try{
   const data=await api('/admin/metrics'), c=data.counts;
   const items=[['Anunciantes con publicaciones',c.advertisers_with_listings],['Anunciantes con identidad revisada',c.verified_advertisers],['Viviendas disponibles',c.available_listings],['Búsquedas',c.searches],['Fichas consultadas',c.listing_views],['Favoritos guardados',c.favorites],['Conversaciones iniciadas',c.conversations],['Anuncios marcados alquilados',c.rented_listings],['Reportes',c.reports],['Promedio de revisión de identidad',data.mean_identity_review_hours===null?'Sin datos':data.mean_identity_review_hours+' h']];
   box.innerHTML='<h3>Métricas operativas</h3><p class="subtle"></p><div class="metrics-grid"></div><p class="subtle">Las conversaciones no representan alquileres concretados.</p>';
   box.querySelector('.subtle').textContent=data.scope==='demo'?'Datos de demostración acumulados desde la activación de métricas.':'Datos acumulados desde la activación de métricas.';
   const grid=box.querySelector('.metrics-grid');
   for(const [label,value] of items){const card=document.createElement('div'),name=document.createElement('span'),number=document.createElement('strong');card.className='metric-card';name.textContent=label;number.textContent=String(value);card.append(name,number);grid.append(card)}
  }catch{box.innerHTML='<h3>Métricas operativas</h3><p role="alert">No pudimos cargar las métricas.</p>'}
 }
};
