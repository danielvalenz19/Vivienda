'use strict';
const {test,expect}=require('@playwright/test');
const {fixture}=require('./fixture-server');

test('el contador móvil se conserva hasta abrir la conversación y se guarda como leído',async({page})=>{
 const site=await fixture();
 try{
  await page.setViewportSize({width:390,height:844});await page.goto(site.url);
  await page.locator('.nav-actions [data-action="account"]').click();
  await page.getByLabel('Correo electrónico').fill('owner@example.test');
  await page.getByLabel('Contraseña').fill('BrowserTest123!');
  await page.locator('#login-form').getByRole('button',{name:'Ingresar'}).click();
  await expect(page.getByRole('heading',{name:'Tu espacio'})).toBeVisible();
  await page.goto(site.url+'/#/cuenta/mensajes');
  await expect(page.getByLabel('1 mensaje sin leer')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('1 mensaje sin leer')).toBeVisible();
  await page.locator('.chat-list-item').first().click();
  await expect(page.getByLabel('1 mensaje sin leer')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.chat-list-item').first()).toBeVisible();
  await expect(page.getByLabel('1 mensaje sin leer')).toHaveCount(0);
 }finally{await site.close()}
});
