'use strict';
const {test,expect}=require('@playwright/test');
const {mkdir}=require('node:fs/promises');
const path=require('node:path');
const {fixture}=require('./fixture-server');

test('notificaciones accesibles y marcadas como leídas en cuatro tamaños',async({page})=>{
  const site=await fixture(), dir=path.resolve(__dirname,'../output/screenshots/notificaciones');
  await mkdir(dir,{recursive:true});
  try {
    await page.goto(site.url);
    await page.locator('.nav-actions [data-action="account"]').click();
    await page.getByLabel('Correo electrónico').fill('owner@example.test');
    await page.getByLabel('Contraseña').fill('BrowserTest123!');
    await page.locator('#login-form').getByRole('button',{name:'Ingresar'}).click();
    await expect(page.getByRole('heading',{name:'Tu espacio'})).toBeVisible();
    for(const width of [390,768,1024,1440]){
      await page.setViewportSize({width,height:900});
      await page.getByRole('button',{name:/Notificaciones/}).click();
      await expect(page.getByRole('dialog',{name:'Notificaciones'})).toBeVisible();
      await expect(page.getByText('Recibiste un mensaje nuevo.')).toBeVisible();
      const bounds=await page.locator('.notifications-dialog').boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x+bounds.width).toBeLessThanOrEqual(width+1);
      await page.screenshot({path:path.join(dir,'recibidas-'+width+'.png'),fullPage:true});
      await page.getByRole('button',{name:'Cerrar',exact:true}).last().click();
    }
    await page.getByRole('button',{name:/Notificaciones/}).click();
    await page.getByRole('button',{name:'Marcar todas como leídas'}).click();
    await expect(page.getByRole('button',{name:'Marcar leída'})).toHaveCount(0);
    await expect(page.locator('.notification-count')).toBeHidden();
  } finally {await site.close();}
});
