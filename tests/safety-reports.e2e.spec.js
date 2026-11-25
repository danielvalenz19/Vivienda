'use strict';
const {test,expect}=require('@playwright/test');
const {DatabaseSync}=require('node:sqlite');
const {fixture}=require('./fixture-server');
test('reportar mensaje, consultar estado y moderar solo ese contenido',async({page})=>{
 const f=await fixture();try{
  const db=new DatabaseSync(f.dbPath),password=db.prepare("SELECT password FROM users WHERE email='owner@example.test'").get().password;
  db.prepare("INSERT INTO users(name,email,password,role) VALUES('Moderación','mod@example.test',?,'moderator')").run(password);db.close();
  await page.setViewportSize({width:390,height:844});await page.goto(f.url);
  async function login(email,name){await page.evaluate(async({email})=>window.Vivienda.api('/login',{email,password:'BrowserTest123!'}),{email});await page.reload();await expect(page.locator('#nav-user')).toContainText(name)}
  await login('owner@example.test','Dueña');await page.goto(f.url+'/#/cuenta/mensajes');await expect(page.locator('.chat-layout')).toBeVisible();await page.locator('.chat-list-item').first().click();
  await page.getByRole('button',{name:'Reportar mensaje'}).click();const dialog=page.getByRole('dialog',{name:'Reportar mensaje'});await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'Categoría'}).click();await page.getByRole('option',{name:'Acoso'}).click();await dialog.getByLabel('¿Qué ocurrió?').fill('Este mensaje de prueba resulta ofensivo.');await dialog.getByRole('button',{name:'Enviar reporte'}).click();await expect(page.getByRole('status').filter({hasText:'Recibimos tu reporte'})).toBeVisible();
  await page.goto(f.url+'/#/cuenta/reportes');await expect(page.getByText('Este mensaje de prueba resulta ofensivo.')).toBeVisible();await expect(page.getByText('Estado: Recibido',{exact:false})).toBeVisible();
  await login('mod@example.test','Moderación');await page.goto(f.url+'/#/administracion');await expect(page.getByRole('heading',{name:'Reportes de seguridad'})).toBeVisible();await expect(page.getByText('Este mensaje de prueba resulta ofensivo.')).toBeVisible();
  page.once('dialog',d=>d.accept('Revisar el mensaje reportado'));await page.getByRole('button',{name:'Revisar contenido reportado'}).click();const context=page.getByRole('dialog',{name:'Contenido reportado'});await expect(context.getByText(/Mensaje ficticio de prueba/)).toBeVisible();await context.getByRole('button',{name:'Cerrar'}).click();
  page.once('dialog',d=>d.accept('El equipo revisó este caso.'));await page.getByRole('button',{name:'Resolver caso'}).click();await expect(page.getByText('No hay reportes de seguridad pendientes.')).toBeVisible();
 }finally{await f.close()}
});
