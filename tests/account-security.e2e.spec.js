'use strict';
const {test,expect}=require('@playwright/test');
const {fixture}=require('./fixture-server');
const {mkdir}=require('node:fs/promises');
const path=require('node:path');
const {codeAt}=require('../mfa-routes');
async function login(page,url,email='guest@example.test',password='BrowserTest123!'){
 await page.goto(url);await page.locator('.nav-actions [data-action="account"]').click();await page.getByLabel('Correo electrónico').fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.locator('#login-form').getByRole('button',{name:'Ingresar'}).click();await expect(page.getByRole('heading',{name:'Tu espacio'})).toBeVisible();
}
test('seguridad de cuenta: errores, contraseña y cierre de todas las sesiones',async({browser})=>{
 const site=await fixture(),context=await browser.newContext({viewport:{width:390,height:844}}),other=await browser.newContext();const page=await context.newPage(),otherPage=await other.newPage();
 try{
  await login(page,site.url);await login(otherPage,site.url);await page.goto(site.url+'/#/cuenta/seguridad-cuenta');await expect(page.getByRole('heading',{name:'Seguridad de tu cuenta'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const dir=path.resolve(__dirname,'../output/screenshots');await mkdir(dir,{recursive:true});await page.screenshot({path:path.join(dir,'seguridad-cuenta-390.png'),fullPage:true});
  await page.getByLabel('Contraseña actual').fill('incorrecta');await page.getByLabel('Nueva contraseña',{exact:true}).fill('NuevaClave123!');await page.getByLabel('Confirmar nueva contraseña').fill('Diferente123!');await page.getByRole('button',{name:'Cambiar contraseña'}).click();await expect(page.locator('#change-password-form [role=alert]')).toContainText('no coinciden');
  await page.getByLabel('Confirmar nueva contraseña').fill('NuevaClave123!');await page.getByRole('button',{name:'Cambiar contraseña'}).click();await expect(page.locator('#change-password-form [role=alert]')).toContainText('contraseña actual no es correcta');
  await page.getByLabel('Contraseña actual').fill('BrowserTest123!');await page.getByRole('button',{name:'Cambiar contraseña'}).click();await expect(page.getByRole('status')).toContainText('Contraseña actualizada');await expect.poll(async()=>otherPage.evaluate(async()=>await (await fetch('/api/me')).json())).toBeNull();
  await login(page,site.url,'guest@example.test','NuevaClave123!');await login(otherPage,site.url,'guest@example.test','NuevaClave123!');await page.goto(site.url+'/#/cuenta/seguridad-cuenta');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Cerrar todas las sesiones'}).click();await expect(page.getByRole('status')).toContainText('Se cerraron todas tus sesiones');await expect.poll(async()=>otherPage.evaluate(async()=>await (await fetch('/api/me')).json())).toBeNull();
 }finally{await context.close();await other.close();await site.close()}
});
test('registro pide aceptación y aclara el nombre público',async({page})=>{
 const site=await fixture();try{
  await page.goto(site.url);await page.locator('.nav-actions [data-action="account"]').click();await page.getByRole('button',{name:'Crear cuenta'}).click();
  await expect(page.getByText('Este nombre podrá aparecer públicamente junto a tus anuncios y perfil.')).toBeVisible();await expect(page.getByRole('link',{name:/términos y la política/})).toHaveAttribute('href','/politicas-borrador.html');
  await page.getByLabel('Nombre público').fill('Nombre ficticio');await page.getByLabel('Correo electrónico').fill('consentimiento@example.test');await page.getByLabel('Contraseña',{exact:true}).fill('Prueba12345!');
  const checkbox=page.locator('input[name=terms_accepted]');await expect(checkbox).not.toBeChecked();await page.locator('#login-form').getByRole('button',{name:'Crear cuenta'}).click();await expect(checkbox).toBeFocused();
  await checkbox.check();await page.locator('#login-form').getByRole('button',{name:'Crear cuenta'}).click();await expect(page.getByRole('heading',{name:'Tu espacio'})).toBeVisible();
 }finally{await site.close()}
});
test('la interfaz ofrece recuperación por correo solo cuando está configurada',async({page})=>{
 const site=await fixture();try{
  await page.goto(site.url);await page.locator('.nav-actions [data-action="account"]').click();await expect(page.getByRole('button',{name:'Recuperar contraseña por correo'})).toHaveCount(0);
  await page.route('**/api/auth/mail-status',route=>route.fulfill({json:{enabled:true}}));
  let sent;await page.route('**/api/auth/request-reset',async route=>{sent=route.request().postDataJSON();await route.fulfill({json:{ok:true}})});
  await page.goto(site.url);await page.locator('.nav-actions [data-action="account"]').click();await page.getByRole('button',{name:'Recuperar contraseña por correo'}).click();
  await expect(page.getByText('Si la cuenta existe, se enviarán instrucciones al correo indicado.')).toBeVisible();await page.getByLabel('Correo',{exact:true}).fill('persona@example.test');await page.getByRole('button',{name:'Enviar',exact:true}).click();await expect(page.getByRole('heading',{name:'Ingresá tu código'})).toBeVisible();assertEmail(sent.email);
 }finally{await site.close()}
});
function assertEmail(value){expect(value).toBe('persona@example.test')}
test('administrador activa MFA y usa un código de recuperación al volver a ingresar',async({page})=>{
 const site=await fixture();try{
  await page.setViewportSize({width:390,height:844});await login(page,site.url,'admin@example.test');await page.goto(site.url+'/#/cuenta/seguridad-cuenta');
  const setup=page.locator('#mfa-setup-form');await setup.getByLabel('Contraseña actual').fill('BrowserTest123!');await setup.getByRole('button',{name:'Configurar verificación'}).click();await expect(page.getByRole('heading',{name:'Vinculá tu aplicación'})).toBeVisible();
  const secret=await page.locator('.mfa-secret').textContent();await page.getByLabel('Código de seis dígitos').fill(codeAt(secret,Math.floor(Date.now()/30000)));await page.getByRole('button',{name:'Activar verificación'}).click();await expect(page.getByRole('heading',{name:'Guardá tus códigos de recuperación'})).toBeVisible();
  const code=(await page.locator('.mfa-recovery-codes').textContent()).split('\n')[0];await page.context().clearCookies();await login(page,site.url,'admin@example.test');await page.goto(site.url+'/#/cuenta/administracion');await expect(page.getByRole('heading',{name:'Verificación en dos pasos'})).toBeVisible();await page.getByLabel('Código de verificación o recuperación').fill(code);await page.getByRole('button',{name:'Verificar y continuar'}).click();await expect(page.getByRole('heading',{name:'Moderación',exact:true})).toBeVisible();
 }finally{await site.close()}
});
