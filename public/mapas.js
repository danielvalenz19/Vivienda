'use strict';
/* The app stores only text city/sector, not a verifiable geographic location.
   These coordinates represent city reference centers, NOT homes or zone boundaries. */
(function(){
  const places={Xela:{name:'Quetzaltenango (Xela)',center:[14.8446,-91.5232]},'Ciudad de Guatemala':{name:'Ciudad de Guatemala',center:[14.6407,-90.5133]}};
  const description='El mapa muestra la ciudad como referencia, no la ubicación de las viviendas. El sector indicado en cada anuncio es aproximado. Los conteos corresponden a los anuncios de esta página.';
  const main=document.getElementById('main');if(!main)return;
  let activeMap=null, loadingTimer=null;
  function clearMap(){if(loadingTimer){clearTimeout(loadingTimer);loadingTimer=null}if(activeMap){activeMap.remove();activeMap=null}}
  function el(tag,className,text){let node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
  function makeView(parent,kind){
    const toggle=kind==='catalog'?el('button','vgt-map-toggle','Ver mapa de ciudades'):null;if(toggle){toggle.type='button';toggle.setAttribute('aria-expanded','false')}
    const view=el('section','vgt-map-view');view.hidden=kind==='catalog';view.setAttribute('aria-label',kind==='detail'?'Mapa orientativo de la ciudad':'Mapa de ciudades de los resultados');
    const copy=el('p','vgt-map-copy',description+' El mapa carga teselas de OpenStreetMap por internet.');
    const mapNode=el('div','vgt-map');mapNode.setAttribute('role','region');mapNode.setAttribute('aria-label','Mapa interactivo orientativo');
    const summary=el('ul','vgt-map-list');summary.setAttribute('aria-label','Resumen de resultados por ciudad');
    const status=el('p','vgt-map-error');status.hidden=true;status.setAttribute('role','status');
    view.append(copy,mapNode,summary,status);if(toggle)parent.append(toggle);parent.append(view);
    function openMap(){
      const groups=kind==='detail'?detailGroups(parent):catalogGroups();summary.replaceChildren();status.hidden=true;
      for(const g of groups)summary.append(el('li','',kind==='detail'?`${g.place.name} · ciudad de referencia`:`${g.place.name} · ${g.count} ${g.count===1?'vivienda':'viviendas'}`));
      if(!groups.length){mapNode.hidden=true;status.hidden=false;status.textContent='No hay una ciudad con referencia cartográfica disponible para estos resultados.';return}
      if(typeof L==='undefined'){mapNode.hidden=true;status.hidden=false;status.textContent='No se pudo cargar el mapa. Podés seguir viendo los resultados en la lista.';return}
      clearMap();mapNode.hidden=false;activeMap=L.map(mapNode,{scrollWheelZoom:false,maxZoom:14,minZoom:7,keyboard:true});
      let failed=0, loaded=0;const unavailable=()=>{if(!loaded&&view.isConnected){status.hidden=false;status.textContent='No se pudo cargar el fondo del mapa. Revisá tu conexión; la ciudad de referencia se muestra debajo.'}};const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:14,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'});
      tiles.on('tileerror',()=>{failed++;if(failed>=3)unavailable()});tiles.on('tileload',()=>{loaded++;status.hidden=true;if(loadingTimer){clearTimeout(loadingTimer);loadingTimer=null}});tiles.addTo(activeMap);loadingTimer=setTimeout(unavailable,10000);
      const bounds=[];for(const g of groups){bounds.push(g.place.center);const label=kind==='detail'?'●':String(g.count);const marker=L.marker(g.place.center,{keyboard:true,title:kind==='detail'?`Centro de referencia de ${g.place.name}`:`${g.count} viviendas en ${g.place.name}`,icon:L.divIcon({className:'',html:`<div class="vgt-map-city-label">${label}</div>`,iconSize:[38,38],iconAnchor:[19,19]})}).addTo(activeMap);const info=el('div','');info.append(el('strong','',g.place.name),el('p','',kind==='detail'?'Centro de ciudad de referencia. No indica dónde está la vivienda.':`${g.count} ${g.count===1?'resultado':'resultados'} en esta ciudad. Los puntos no indican ubicaciones de viviendas.`));marker.bindPopup(info)}
      if(bounds.length===1)activeMap.setView(bounds[0],11);else activeMap.fitBounds(bounds,{padding:[28,28],maxZoom:11});requestAnimationFrame(()=>activeMap?.invalidateSize());
    }
    if(toggle)toggle.addEventListener('click',()=>{const opening=view.hidden;view.hidden=!opening;toggle.setAttribute('aria-expanded',String(opening));toggle.textContent=opening?'Ocultar mapa':'Ver mapa de ciudades';if(opening)openMap();else clearMap()});else openMap();
  }
  function catalogGroups(){const counts=new Map();for(const row of document.querySelectorAll('.listing-card .card-location')){const text=row.textContent.trim();const key=Object.keys(places).find(city=>text.endsWith('· '+city));if(key)counts.set(key,(counts.get(key)||0)+1)}return [...counts].map(([key,count])=>({place:places[key],count}))}
  function detailGroups(parent){const key=parent.dataset.city;return places[key]?[{place:places[key],count:1}]:[]}
  function install(){
    const catalog=main.querySelector('.catalog');if(catalog&&!catalog.dataset.mapInstalled){catalog.dataset.mapInstalled='true';const grid=catalog.querySelector('.results-grid');const holder=el('div','vgt-map-holder');catalog.insertBefore(holder,grid);makeView(holder,'catalog')}
    const match=location.hash.match(/^#\/vivienda\/(\d+)/);const detail=main.querySelector('.detail-layout>div');if(match&&detail&&!detail.dataset.mapInstalled){detail.dataset.mapInstalled='loading';const id=match[1];fetch('/api/listings/'+encodeURIComponent(id)+'/detail').then(r=>r.ok?r.json():null).then(home=>{if(!home||!detail.isConnected||!location.hash.startsWith('#/vivienda/'+id))return;detail.dataset.mapInstalled='true';const section=el('section','detail-section');section.dataset.city=home.city;section.append(el('h2','','Ubicación de referencia'),el('p','vgt-map-copy',`${home.area || 'Sector no informado'} · ${home.city}. La ubicación es aproximada. Todavía no contamos con datos geográficos confiables para mostrar este sector en un mapa.`));detail.append(section)}).catch(()=>{if(detail.isConnected)detail.dataset.mapInstalled='failed'})}
  }
  const observer=new MutationObserver(()=>{if(activeMap&&!document.body.contains(activeMap.getContainer()))clearMap();install()});observer.observe(main,{childList:true,subtree:true});window.addEventListener('hashchange',()=>{clearMap();requestAnimationFrame(install)});install();
})();
