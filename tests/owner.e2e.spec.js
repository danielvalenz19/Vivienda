'use strict';
const {test,expect}=require('@playwright/test');
const {DatabaseSync}=require('node:sqlite');
const {fixture}=require('./fixture-server');
let site;
test.beforeEach(async()=>{site=await fixture()});test.afterEach(async()=>site.close());
test('un anunciante gestiona su anuncio y puede contactar a otro anunciante',async({page})=>{
 const db=new DatabaseSync(site.dbPath);const other=db.prepare("SELECT id FROM users WHERE email='pending@example.test'").get().id;
 const otherListing=Number(db.prepare("INSERT INTO listings(owner,title,city,area,type,price,deposit,description,rooms,baths,status,authorization,confirmed) VALUES(?,'Vivienda de otra anunciante','Xela','Zona 2','Cuarto',1200,1200,'Vivienda ficticia de prueba',1,1,'active','approved',CURRENT_TIMESTAMP)").run(other).lastInsertRowid);db.close();
 await page.goto(site.url);await page.locator('.nav-actions [data-action="account"]').click();await page.getByLabel('Correo electrónico').fill('owner@example.test');await page.getByLabel('Contraseña').fill('BrowserTest123!');await page.locator('#login-form').getByRole('button',{name:'Ingresar'}).click();await expect(page.getByRole('heading',{name:'Tu espacio'})).toBeVisible();
 await page.goto(site.url+'/#/vivienda/'+site.listing);await expect(page.getByRole('heading',{name:'Interesados en tu vivienda'})).toBeVisible();await expect(page.getByText('1 conversación',{exact:false})).toBeVisible();await expect(page.getByText('1 mensaje recibido',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Enviar mensaje',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:/Interesada Prueba/})).toBeVisible();await page.getByRole('button',{name:/Interesada Prueba/}).click();await expect(page.locator('.chat-person')).toContainText('Interesada Prueba');await expect(page.getByRole('log',{name:'Historial de mensajes'}).getByText('Mensaje ficticio de prueba.',{exact:true})).toBeVisible();
 await page.goto(site.url+'/#/vivienda/'+otherListing);await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await page.getByLabel('Mensaje',{exact:true}).fill('Hola, quisiera consultar esta vivienda.');await page.locator('dialog').getByRole('button',{name:'Enviar',exact:true}).click();await expect(page.getByText('Mensaje enviado.',{exact:true})).toBeVisible();
 const check=new DatabaseSync(site.dbPath);expect(check.prepare('SELECT count(*) n FROM messages WHERE listing=? AND sender=? AND recipient=?').get(otherListing,site.owner,other).n).toBe(1);check.close();
});
