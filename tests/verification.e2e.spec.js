'use strict';
const {test,expect}=require('@playwright/test');
const {DatabaseSync}=require('node:sqlite');
const {fixture}=require('./fixture-server');
const {mkdir}=require('node:fs/promises');
const path=require('node:path');
async function login(page,url,email){
 await page.goto(url);await page.locator('.nav-actions [data-action="account"]').click();
 await page.getByLabel('Correo electrónico').fill(email);await page.getByLabel('Contraseña',{exact:true}).fill('BrowserTest123!');
 await page.locator('#login-form').getByRole('button',{name:'Ingresar'}).click();await expect(page.getByRole('heading',{name:'Tu espacio'})).toBeVisible();
}
test('identidad permite observaciones, corrección y revocación con revisión manual',async({browser})=>{
 const site=await fixture(),userContext=await browser.newContext({viewport:{width:390,height:844}}),staffContext=await browser.newContext({viewport:{width:1440,height:900}}),adminContext=await browser.newContext({viewport:{width:1440,height:900}});
 const user=await userContext.newPage(),staff=await staffContext.newPage(),admin=await adminContext.newPage();
 try{
  const db=new DatabaseSync(site.dbPath),password=db.prepare('SELECT password FROM users WHERE id=?').get(site.owner).password;
  db.prepare("INSERT INTO users(name,email,password,role) VALUES('Verificador Prueba','verifier@example.test',?,'verifier')").run(password);db.close();
  await login(staff,site.url,'verifier@example.test');await staff.goto(site.url+'/#/administracion');
  const pending=staff.locator('.panel-row').filter({hasText:'Pendiente Prueba'});
  await pending.getByRole('button',{name:'Solicitar correcciones'}).click();
  const modal=staff.getByRole('dialog',{name:'Solicitar correcciones'});
  await modal.getByLabel('Observaciones').fill('Aclarar el nombre que mostrás en tu perfil.');
  await modal.getByRole('button',{name:'Enviar observaciones'}).click();await expect(modal).toHaveCount(0);
  await login(user,site.url,'pending@example.test');await user.goto(site.url+'/#/cuenta/verificacion');
  await expect(user.getByText('Necesita correcciones')).toBeVisible();
  await expect(user.getByText('Aclarar el nombre que mostrás en tu perfil.')).toBeVisible();
  expect(await user.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const out=path.resolve(__dirname,'../output/screenshots');await mkdir(out,{recursive:true});await user.screenshot({path:path.join(out,'identidad-correccion-390.png'),fullPage:true});
  await user.getByLabel('Explicá qué corregiste').fill('Actualicé el nombre público de mi perfil.');
  await user.getByRole('button',{name:'Enviar nuevamente'}).click();await expect(user.getByText('Pendiente de revisión')).toBeVisible();
  await staff.goto(site.url+'/#/administracion');const renewed=staff.locator('.panel-row').filter({hasText:'Pendiente Prueba'});
  await expect(renewed).toContainText('Actualicé el nombre público de mi perfil.');
  staff.once('dialog',dialog=>dialog.accept());await renewed.getByRole('button',{name:'Aprobar identidad'}).click();
  await user.reload();await expect(user.locator('.verification-status')).toHaveText('Revisada');
  await login(admin,site.url,'admin@example.test');await admin.goto(site.url+'/#/administracion');
  const owner=admin.locator('#admin-verification-reviewed .panel-row').filter({hasText:'Dueña Prueba'});
  await owner.getByLabel('Motivo de revocación').fill('Se requiere una nueva revisión manual.');
  await owner.getByRole('button',{name:'Revocar revisión'}).click();await expect(owner).toHaveCount(0);
  const check=new DatabaseSync(site.dbPath);assertListingPaused(check,site.listing);check.close();
 }finally{await userContext.close();await staffContext.close();await adminContext.close();await site.close()}
});
function assertListingPaused(db,id){expect(db.prepare('SELECT status FROM listings WHERE id=?').get(id).status).toBe('paused')}
