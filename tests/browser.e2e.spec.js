'use strict';
const {test,expect}=require('@playwright/test');
const {mkdir}=require('node:fs/promises');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {fixture}=require('./fixture-server');
let site;
const screenshots=path.resolve(__dirname,'../output/screenshots');
test.beforeAll(async()=>{site=await fixture();await mkdir(screenshots,{recursive:true});});
test.afterAll(async()=>{if(site)await site.close()});
async function shot(page,name){
 await page.screenshot({path:path.join(screenshots,name+'.png'),fullPage:true});
 if(!name.startsWith('catalogo-')){
  const prior=page.viewportSize();await page.setViewportSize({width:390,height:844});
  const sizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:window.innerWidth}));
  expect(sizes.scroll,`Desbordamiento en ${name} móvil`).toBeLessThanOrEqual(sizes.inner);
  await page.screenshot({path:path.join(screenshots,name+'-movil.png'),fullPage:true});await page.setViewportSize(prior);
 }
}
async function login(page,email){await page.goto(site.url);await page.locator('.nav-actions [data-action="account"]').click();await page.getByLabel('Correo electrónico').fill(email);await page.getByLabel('Contraseña').fill('BrowserTest123!');await page.locator('#login-form').getByRole('button',{name:'Ingresar'}).click();await expect(page.getByRole('heading',{name:'Tu espacio'})).toBeVisible();}
test('catálogo, filtros, detalle y perfil con cuatro tamaños',async({page})=>{
 for(const width of [1440,1024,768,390]){await page.setViewportSize({width,height:900});await page.goto(site.url);await expect(page.getByRole('heading',{name:'Viviendas disponibles'})).toBeVisible();await expect(page.getByText('DEMO prueba de navegador').first()).toBeVisible();await shot(page,`catalogo-${width}`);const scrollWidth=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:window.innerWidth}));expect(scrollWidth.scroll).toBeLessThanOrEqual(scrollWidth.inner);}
 await page.setViewportSize({width:1440,height:900});await page.locator('#search-city').selectOption('Xela');await page.locator('#search-form').getByRole('button',{name:'Buscar',exact:true}).click();await expect(page).toHaveURL(/city=Xela/);await expect(page.getByText('1 resultado')).toBeVisible();
 await page.getByRole('button',{name:'Filtros',exact:true}).click();await expect(page.getByRole('heading',{name:'Filtros de búsqueda'})).toBeVisible();await shot(page,'filtros');await page.getByRole('button',{name:'Habitaciones',exact:true}).click();await page.getByRole('option',{name:'2',exact:true}).click();await page.getByRole('button',{name:'Ver resultados'}).click();await expect(page).toHaveURL(/rooms=2/);
 await page.getByRole('link',{name:'DEMO prueba de navegador',exact:true}).click();await expect(page.getByRole('heading',{name:'DEMO prueba de navegador'})).toBeVisible();await shot(page,'detalle');await page.getByRole('link',{name:'Ver perfil'}).click();await expect(page.getByRole('heading',{name:'Dueña Prueba'})).toBeVisible();await shot(page,'perfil');
 await page.getByRole('link',{name:'Volver a explorar'}).click();await expect(page).toHaveURL(/city=Xela/);await expect(page).toHaveURL(/rooms=2/);
 await page.goto(site.url+'/#/seguridad');await expect(page.getByRole('heading',{name:'Alquilá con más tranquilidad'})).toBeVisible();await shot(page,'seguridad');
});
test('acceso, favoritos, conversaciones y acciones de interesado',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto(site.url);await page.locator('.nav-actions [data-action="account"]').click();await expect(page.getByRole('heading',{name:'Bienvenido de nuevo'})).toBeVisible();await shot(page,'acceso');await page.getByRole('button',{name:'Crear cuenta'}).click();await expect(page.getByRole('heading',{name:'Creá tu cuenta'})).toBeVisible();await shot(page,'registro');await page.locator('[data-auth-toggle=login]').click();await page.getByLabel('Correo electrónico').fill('guest@example.test');await page.getByLabel('Contraseña').fill('BrowserTest123!');await page.locator('#login-form').getByRole('button',{name:'Ingresar'}).click();await expect(page.getByRole('heading',{name:'Tu espacio'})).toBeVisible();
 await page.goto(site.url+'/#/cuenta/favoritos');await expect(page.getByRole('heading',{name:'Favoritos',exact:true})).toBeVisible();await expect(page.getByText('DEMO prueba de navegador')).toBeVisible();await shot(page,'favoritos');
 const db=new DatabaseSync(site.dbPath);const other=db.prepare("SELECT id FROM users WHERE email='pending@example.test'").get().id;const otherListing=Number(db.prepare("INSERT INTO listings(owner,title,city,area,type,price,deposit,description,rooms,baths,status,authorization,confirmed) VALUES(?,'DEMO otro propietario','Xela','Zona 2','Cuarto',1000,1000,'Anuncio de prueba',1,1,'active','approved',CURRENT_TIMESTAMP)").run(other).lastInsertRowid);db.prepare("INSERT INTO messages(listing,sender,recipient,body) VALUES(?,?,?,'Hola, segunda persona')").run(otherListing,site.guest,other);db.close();
 await page.goto(site.url+'/#/cuenta/mensajes');await expect(page.getByRole('heading',{name:'Mensajes',exact:true})).toBeVisible();await expect(page.locator('.chat-list-item').filter({hasText:'Pendiente Prueba'})).toBeVisible();await expect(page.locator('.chat-list-item').filter({hasText:'Dueña Prueba'})).toBeVisible();await page.locator('.chat-list-item').filter({hasText:'Dueña Prueba'}).click();await expect(page.getByText('Mensaje ficticio de prueba.',{exact:true})).toBeVisible();await expect(page.locator('.chat-person')).toContainText('Dueña Prueba');await page.getByLabel('Escribí tu mensaje').fill('¿Sigue disponible?');await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await expect(page.getByText('¿Sigue disponible?',{exact:true})).toBeVisible();await page.locator('.chat-list-item').filter({hasText:'Pendiente Prueba'}).click();await expect(page.locator('.chat-person')).toContainText('Pendiente Prueba');await expect(page.getByText('Hola, segunda persona',{exact:true})).toBeVisible();await shot(page,'mensajeria');
 await page.goto(site.url+'/#/cuenta/verificacion');await expect(page.getByRole('heading',{name:'Revisión de identidad'})).toBeVisible();await shot(page,'verificacion');
});
test('anunciante, asistente y administración con cuentas separadas',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await login(page,'owner@example.test');await shot(page,'panel-anunciante');await page.locator('.nav-actions [data-action="publish"]').click();await expect(page.getByRole('region',{name:'Asistente para publicar vivienda'})).toBeVisible();await shot(page,'publicacion');
 await page.getByRole('button',{name:'¿Qué tipo de vivienda ofrecés?',exact:true}).click();await page.getByRole('option',{name:'Apartamento',exact:true}).click();await page.getByRole('button',{name:'Guardar y continuar'}).click();await expect(page.getByRole('heading',{name:'Ubicación'})).toBeVisible();await page.getByLabel('Zona o sector aproximado').fill('Zona 7 de prueba');await page.getByRole('button',{name:'Salir y guardar'}).click();await expect(page.getByRole('button',{name:'Continuar borrador'})).toBeVisible();await page.getByRole('button',{name:'Continuar borrador'}).click();await page.getByRole('button',{name:'Guardar y continuar'}).click();await expect(page.getByLabel('Zona o sector aproximado')).toHaveValue('Zona 7 de prueba');
 await page.getByRole('button',{name:'Guardar y continuar'}).click();await expect(page.getByRole('heading',{name:'Características'})).toBeVisible();await page.getByRole('button',{name:'Guardar y continuar'}).click();
 await expect(page.getByRole('heading',{name:'Precio y condiciones'})).toBeVisible();await page.getByLabel('Título del anuncio').fill('DEMO nuevo anuncio E2E');await page.getByLabel('Renta mensual en quetzales').fill('2100');await page.getByLabel('Descripción').fill('Esta publicación es ficticia para pruebas automatizadas.');await page.getByRole('button',{name:'Guardar y continuar'}).click();
 await expect(page.getByRole('heading',{name:'Fotografías',exact:true})).toBeVisible();await page.locator('#wizard-photos').setInputFiles(path.resolve(__dirname,'../public/assets/demo/vivienda-1.jpg'));await page.getByRole('button',{name:'Subir fotos'}).click();await expect(page.getByAltText('Foto de la vivienda')).toBeVisible();await shot(page,'publicacion-fotos');await page.getByRole('button',{name:'Guardar y continuar'}).click();
 await expect(page.getByRole('heading',{name:'Autorización',exact:true})).toBeVisible();await page.locator('#wizard-evidence').setInputFiles(path.resolve(__dirname,'../public/assets/demo/vivienda-1.jpg'));await page.getByRole('button',{name:'Subir evidencia'}).click();await expect(page.getByText('1 evidencia(s) guardada(s) para revisión privada.')).toBeVisible();await page.getByRole('button',{name:'Guardar y continuar'}).click();
 await expect(page.getByRole('heading',{name:'Vista previa'})).toBeVisible();await shot(page,'publicacion-vista-previa');await page.getByRole('button',{name:'Guardar y continuar'}).click();await page.getByRole('button',{name:'Enviar a revisión'}).click();await expect(page.getByText('DEMO nuevo anuncio E2E')).toBeVisible();await expect(page.getByText('En revisión').first()).toBeVisible();
 await page.context().clearCookies();await login(page,'admin@example.test');await page.goto(site.url+'/#/cuenta/administracion');await expect(page.getByRole('heading',{name:'Moderación',exact:true})).toBeVisible();await expect(page.getByText('DEMO nuevo anuncio E2E').first()).toBeVisible();await shot(page,'administracion');const row=page.locator('.panel-row').filter({hasText:'DEMO nuevo anuncio E2E'}).filter({has:page.getByRole('button',{name:'Aprobar anuncio'})});page.once('dialog',d=>d.accept());await row.getByRole('button',{name:'Aprobar anuncio'}).click();await expect(page.locator('.panel-row').filter({hasText:'DEMO nuevo anuncio E2E'}).filter({has:page.getByRole('button',{name:'Aprobar anuncio'})})).toHaveCount(0);await page.goto(site.url);await expect(page.getByRole('heading',{name:'DEMO nuevo anuncio E2E'})).toBeVisible();
});
test('cuenta y chat adaptables en cuatro anchuras',async({page})=>{
 const isolated=await fixture();
 try{
  await page.setViewportSize({width:1440,height:900});
  await page.goto(isolated.url);await page.locator('.nav-actions [data-action="account"]').click();
  await page.getByLabel('Correo electrónico').fill('owner@example.test');await page.getByLabel('Contraseña').fill('BrowserTest123!');
  await page.locator('#login-form').getByRole('button',{name:'Ingresar'}).click();
  await expect(page.getByRole('heading',{name:'Tu espacio'})).toBeVisible();
  for(const width of [390,768,1024,1440]){
   await page.setViewportSize({width,height:900});
   await page.goto(isolated.url+'/#/cuenta/anuncios');
   await expect(page.getByRole('heading',{name:'Mis anuncios',exact:true})).toBeVisible();
   await expect(page.locator('.my-listing').first()).toBeVisible();
   let measure=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:innerWidth,panel:document.querySelector('#workspace-panel').getBoundingClientRect().toJSON()}));
   expect(measure.scroll,`Cuenta desborda en ${width}px`).toBeLessThanOrEqual(measure.inner);
   expect(measure.panel.left,`Panel fuera de pantalla en ${width}px`).toBeGreaterThanOrEqual(-1);
   expect(measure.panel.right,`Panel fuera de pantalla en ${width}px`).toBeLessThanOrEqual(measure.inner+1);
   await page.screenshot({path:path.join(screenshots,`cuenta-responsive-${width}.png`),fullPage:true});
   await page.goto(isolated.url+'/#/cuenta/mensajes');
   await expect(page.getByRole('heading',{name:'Mensajes',exact:true})).toBeVisible();
   await expect(page.locator('.chat-list-item').first()).toBeVisible();
   if(width<=760){await expect(page.locator('.chat-thread-pane')).toBeHidden();await page.locator('.chat-list-item').first().click();}
   await expect(page.locator('.chat-thread-pane')).toBeVisible();
   await expect(page.getByLabel('Escribí tu mensaje')).toBeVisible();
   await expect(page.getByRole('button',{name:'Enviar mensaje',exact:true})).toBeVisible();
   if(width===390){await page.getByLabel('Escribí tu mensaje').fill('Respuesta móvil de prueba');await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click({timeout:5000});await expect(page.getByText('Respuesta móvil de prueba',{exact:true})).toBeVisible();}
   measure=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:innerWidth,panel:document.querySelector('.chat-layout').getBoundingClientRect().toJSON()}));
   expect(measure.scroll,`Chat desborda en ${width}px`).toBeLessThanOrEqual(measure.inner);
   expect(measure.panel.left,`Chat fuera de pantalla en ${width}px`).toBeGreaterThanOrEqual(-1);
   expect(measure.panel.right,`Chat fuera de pantalla en ${width}px`).toBeLessThanOrEqual(measure.inner+1);
   await page.screenshot({path:path.join(screenshots,`chat-responsive-${width}.png`),fullPage:true});
   if(width<=760){await page.getByRole('button',{name:'Volver a conversaciones'}).click();await expect(page.locator('.chat-list-item').first()).toBeVisible();await expect(page.locator('.chat-thread-pane')).toBeHidden();}
  }
 }finally{await isolated.close()}
});
