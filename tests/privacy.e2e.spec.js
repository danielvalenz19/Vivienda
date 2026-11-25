'use strict';
const {test,expect}=require('@playwright/test');
const {fixture}=require('./fixture-server');
const {mkdir}=require('node:fs/promises');
const path=require('node:path');

async function login(page,url,email){
 await page.goto(url);await page.locator('.nav-actions [data-action="account"]').click();
 await page.getByLabel('Correo electrónico').fill(email);await page.getByLabel('Contraseña',{exact:true}).fill('BrowserTest123!');
 await page.locator('#login-form').getByRole('button',{name:'Ingresar'}).click();
 await expect(page.getByRole('heading',{name:'Tu espacio'})).toBeVisible();
}
test('solicitud de privacidad llega a administración y no borra la cuenta',async({browser})=>{
 const site=await fixture(),userContext=await browser.newContext({viewport:{width:390,height:844}}),adminContext=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await userContext.newPage(),admin=await adminContext.newPage();
 try{
  await login(page,site.url,'guest@example.test');
  await page.goto(site.url+'/#/cuenta/privacidad');
  await expect(page.getByRole('heading',{name:'Privacidad y datos'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByText(/no elimina la cuenta ni los datos automáticamente/)).toBeVisible();
  await page.getByLabel('Contanos qué necesitás').fill('Solicito la eliminación de mi cuenta de prueba.');
  await page.getByRole('button',{name:'Enviar solicitud'}).click();
  await expect(page.locator('#privacy-request-form [role=alert]')).toContainText('Elegí un tipo');
  await expect(page.locator('#privacy-request-form [role=alert]')).toBeFocused();
  await page.getByRole('button',{name:'Tipo de solicitud'}).click();
  await page.getByRole('option',{name:'Eliminación de cuenta'}).click();
  await page.getByRole('button',{name:'Enviar solicitud'}).click();
  await expect(page.locator('.privacy-success')).toContainText('Solicitud recibida');
  await page.reload();await expect(page.locator('.privacy-list')).toContainText('Recibida');
  const screenshots=path.resolve(__dirname,'../output/screenshots');await mkdir(screenshots,{recursive:true});
  await page.screenshot({path:path.join(screenshots,'privacidad-solicitud-390.png'),fullPage:true});

  await login(admin,site.url,'admin@example.test');await admin.goto(site.url+'/#/administracion');
  await expect(admin.getByRole('heading',{name:'Solicitudes de privacidad'})).toBeVisible();
  const request=admin.locator('.privacy-request').filter({hasText:'Solicito la eliminación de mi cuenta de prueba.'});
  await request.getByRole('button',{name:'Iniciar revisión'}).click();await expect(request).toContainText('En revisión');
  await admin.screenshot({path:path.join(screenshots,'privacidad-revision-1440.png'),fullPage:true});
  await request.getByLabel('Respuesta para la persona').fill('La revisión manual quedó registrada.');
  await request.getByRole('button',{name:'Guardar resultado'}).click();await expect(request).toContainText('Finalizada');
  await page.reload();await expect(page.locator('.privacy-list')).toContainText('Finalizada');
  await expect(page.locator('.privacy-list')).toContainText('La revisión manual quedó registrada.');
  const current=await page.evaluate(async()=>await(await fetch('/api/me')).json());expect(current.id).toBe(site.guest);
 }finally{await userContext.close();await adminContext.close();await site.close()}
});
