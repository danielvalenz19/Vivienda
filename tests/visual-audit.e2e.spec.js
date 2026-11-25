'use strict';
const {test,expect}=require('@playwright/test');
const {fixture}=require('./fixture-server');
const fs=require('node:fs/promises');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'../output/screenshots/mvp-2026-11-25');

for(const size of [{width:390,height:844},{width:768,height:1024},{width:1024,height:768},{width:1440,height:900}]){
 test(`revisión visual: ${size.width}px`,async({page})=>{
  const site=await fixture(),dir=path.join(root,String(size.width));
  await fs.mkdir(dir,{recursive:true});await page.setViewportSize(size);
  const observations=[],pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  async function capture(name,viewportOnly=false){
   await page.screenshot({path:path.join(dir,name+'.png'),fullPage:!viewportOnly,animations:'disabled'});
   const dimensions=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
   observations.push({name,...dimensions,overflow:Math.max(dimensions.document,dimensions.body)>dimensions.viewport});
  }
  async function visit(hash,selector){await page.goto(site.url+'/'+hash);await expect(page.locator(selector).first()).toBeVisible();}
  async function login(email){const r=await page.request.post(site.url+'/api/login',{headers:{origin:site.url,'x-csrf-token':(await (await page.request.get(site.url+'/api/csrf')).json()).token},data:{email,password:'BrowserTest123!'}});expect(r.ok()).toBeTruthy();await page.reload();await expect(page.locator('#nav-user')).toContainText(email.startsWith('owner')?'Dueña':email.startsWith('pending')?'Pendiente':'Admin');}
  try{
   await visit('#/','.catalog');await capture('01-catalogo');
   await page.getByRole('button',{name:'Filtros',exact:true}).click();await expect(page.getByRole('heading',{name:'Filtros de búsqueda'})).toBeVisible();await capture('02-filtros',true);await page.locator('dialog [data-action="close"]').click();
   await visit('#/vivienda/'+site.listing,'.detail-layout');await capture('03-detalle');
   await visit('#/perfil/'+site.owner,'#main h1');await capture('04-perfil-publico');
   await visit('#/seguridad','#main h1');await capture('05-seguridad');
   await page.locator('.nav-actions [data-action="account"]').click();await expect(page.getByRole('heading',{name:'Bienvenido de nuevo'})).toBeVisible();await capture('05b-acceso',true);await page.getByLabel('Correo electrónico').fill('owner@example.test');await page.getByLabel('Contraseña').fill('incorrecta123');await page.locator('#login-form').getByRole('button',{name:'Ingresar'}).click();await expect(page.locator('#login-form [role="alert"]')).toContainText('Correo o contraseña incorrectos');await capture('05d-acceso-error',true);await page.getByRole('button',{name:'Crear cuenta'}).click();await expect(page.getByRole('heading',{name:'Creá tu cuenta'})).toBeVisible();await capture('05c-registro',true);await page.locator('dialog [data-action="close"]').click();
   await login('owner@example.test');
   await visit('#/cuenta/anuncios','.my-listings');await capture('06-mis-anuncios');
   await visit('#/cuenta/favoritos','#workspace-panel');await expect(page.getByRole('heading',{name:'Favoritos',exact:true})).toBeVisible();await capture('07-favoritos-vacios');
   await visit('#/cuenta/mensajes','.chat-layout');await capture('08-chat-lista');await page.locator('.chat-list-item').first().click();await expect(page.locator('.chat-history')).toBeVisible();await capture('08b-chat-conversacion',true);
   await visit('#/cuenta/verificacion','#workspace-panel');await capture('09-verificacion-aprobada');
   await visit('#/cuenta/visitas','#workspace-panel');await capture('09b-resenas-estado-vacio');
   await page.getByRole('button',{name:/^Notificaciones/}).click();await expect(page.getByRole('heading',{name:'Notificaciones',exact:true})).toBeVisible();await capture('09c-notificaciones',true);await page.locator('.notifications-dialog .notification-close').click();
   await visit('#/cuenta/anuncios','.my-listings');await page.getByRole('button',{name:'Editar anuncio'}).click();await expect(page.getByRole('heading',{name:'Editar vivienda'})).toBeVisible();await capture('10-edicion-superior',true);await page.locator('.wizard-page').evaluate(el=>{el.scrollTop=el.scrollHeight});await capture('10b-edicion-inferior',true);await page.getByRole('button',{name:'Volver a mis anuncios'}).click();
   await visit('#/cuenta/anuncios','.my-listings');await page.getByRole('button',{name:'Publicar vivienda',exact:true}).last().click();await expect(page.getByRole('region',{name:'Asistente para publicar vivienda'})).toBeVisible();await capture('11-publicacion',true);await page.getByRole('button',{name:'Salir y guardar'}).click();
   await login('admin@example.test');await visit('#/administracion','#workspace-panel');await expect(page.getByRole('heading',{name:'Moderación',exact:true})).toBeVisible();await capture('12-administracion');
   await login('pending@example.test');await visit('#/cuenta/verificacion','#workspace-panel');await capture('13-verificacion-pendiente');
   const db=new DatabaseSync(site.dbPath);db.prepare("UPDATE verifications SET status='rejected',note='Ejemplo ficticio: corregí la información enviada.' WHERE user=(SELECT id FROM users WHERE email=?)").run('pending@example.test');db.close();
   await page.reload();await expect(page.getByText('Ejemplo ficticio: corregí la información enviada.')).toBeVisible();await capture('14-verificacion-rechazada');
   await fs.writeFile(path.join(dir,'resultados.json'),JSON.stringify({size,observations,pageErrors},null,2));
   const overflow=observations.filter(x=>x.overflow);expect(overflow,JSON.stringify(overflow)).toEqual([]);expect(pageErrors).toEqual([]);
  }finally{await site.close()}
 });
}
