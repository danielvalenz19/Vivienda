'use strict';
const {test,expect}=require('@playwright/test');
const {DatabaseSync}=require('node:sqlite');
const {fixture}=require('./fixture-server');
test('moderador y verificador usan colas separadas y toman decisiones',async({page})=>{
 const f=await fixture();try{
  const db=new DatabaseSync(f.dbPath),password=db.prepare("SELECT password FROM users WHERE email='owner@example.test'").get().password;
  for(const [name,email,role] of [['Moderación','moderator@example.test','moderator'],['Verificación','verifier@example.test','verifier']])db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(name,email,password,role);
  db.prepare("INSERT INTO reports(listing,reporter,reason) VALUES(?,?,'Reporte ficticio para moderar')").run(f.listing,f.guest);db.close();
  await page.setViewportSize({width:390,height:844});
  await page.goto(f.url);async function login(email){expect((await page.request.post(f.url+'/api/login',{headers:{origin:f.url,'x-csrf-token':(await (await page.request.get(f.url+'/api/csrf')).json()).token},data:{email,password:'BrowserTest123!'}})).ok()).toBeTruthy();await page.goto(f.url+'/#/');await page.reload();await expect(page.locator('#nav-user')).toContainText(email.startsWith('moderator')?'Moderación':'Verificación');}
  await login('moderator@example.test');await page.goto(f.url+'/#/administracion');await expect(page.getByRole('heading',{name:'Moderación',exact:true})).toBeVisible();await expect(page.getByText('Reporte ficticio para moderar')).toBeVisible();await expect(page.getByRole('heading',{name:'Identidades pendientes'})).toHaveCount(0);
  await page.getByRole('button',{name:'Resolver',exact:true}).click();await expect(page.getByText('No hay reportes pendientes.')).toBeVisible();
  await login('verifier@example.test');await page.goto(f.url+'/#/administracion');await expect(page.getByRole('heading',{name:'Verificación',exact:true})).toBeVisible();await expect(page.getByText('Pendiente Prueba')).toBeVisible();await expect(page.getByRole('heading',{name:'Reportes pendientes'})).toHaveCount(0);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Aprobar identidad'}).click();await expect(page.getByText('No hay solicitudes pendientes.')).toBeVisible();
 }finally{await f.close()}
});
test('administración muestra métricas operativas',async({page})=>{
 const f=await fixture();try{await page.goto(f.url);await page.evaluate(()=>window.Vivienda.api('/login',{email:'admin@example.test',password:'BrowserTest123!'}));await page.reload();await expect(page.locator('#nav-user')).toContainText('Admin');await expect(page.locator('.catalog')).toBeVisible();await page.goto(f.url+'/#/administracion');await expect(page.getByRole('heading',{name:'Métricas operativas'})).toBeVisible();await expect(page.getByText('Viviendas disponibles',{exact:true})).toBeVisible();}finally{await f.close()}
});
