'use strict';
const {test,expect}=require('@playwright/test');
const {fixture}=require('./fixture-server');

for (const width of [390,1440]) test(`mostrar contraseñas en ingreso, registro y seguridad a ${width}px`,async({page})=>{
  const site=await fixture();
  try {
    await page.setViewportSize({width,height:900});
    await page.goto(site.url);
    await page.locator('.nav-actions [data-action="account"]').click();

    const password=page.getByLabel('Contraseña',{exact:true});
    await password.fill('BrowserTest123!');
    const reveal=page.getByRole('button',{name:'Mostrar contraseña',exact:true});
    await expect(reveal).toBeVisible();
    await reveal.click();
    await expect(password).toHaveAttribute('type','text');
    await expect(password).toHaveValue('BrowserTest123!');
    await expect(page.getByRole('button',{name:'Ocultar contraseña'})).toHaveAttribute('aria-pressed','true');
    await page.getByRole('button',{name:'Ocultar contraseña'}).press('Space');
    await expect(password).toHaveAttribute('type','password');

    await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Creá tu cuenta'})).toBeVisible();
    await page.getByRole('button',{name:'Mostrar contraseña',exact:true}).click();
    await expect(page.getByLabel('Contraseña',{exact:true})).toHaveAttribute('type','text');
    await page.locator('[data-auth-toggle=login]').click();

    await page.getByLabel('Correo electrónico').fill('guest@example.test');
    await page.getByLabel('Contraseña',{exact:true}).fill('BrowserTest123!');
    await page.getByRole('button',{name:'Mostrar contraseña',exact:true}).click();
    await page.locator('#login-form').getByRole('button',{name:'Ingresar',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Tu espacio'})).toBeVisible();
    await page.goto(site.url+'/#/cuenta/seguridad-cuenta');
    await expect(page.getByRole('heading',{name:'Seguridad de tu cuenta'})).toBeVisible();

    const current=page.getByLabel('Contraseña actual',{exact:true});
    const next=page.getByLabel('Nueva contraseña',{exact:true});
    const confirm=page.getByLabel('Confirmar nueva contraseña',{exact:true});
    await current.fill('actual-de-prueba');
    await next.fill('nueva-de-prueba');
    await confirm.fill('nueva-de-prueba');
    await page.getByRole('button',{name:'Mostrar contraseña actual'}).click();
    await expect(current).toHaveAttribute('type','text');
    await expect(next).toHaveAttribute('type','password');
    await page.getByRole('button',{name:'Mostrar nueva contraseña',exact:true}).click();
    await expect(next).toHaveAttribute('type','text');
    await expect(confirm).toHaveAttribute('type','password');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  } finally {await site.close()}
});

test('el campo de recuperación conserva su etiqueta y permite mostrar la contraseña',async({page})=>{
  const site=await fixture();
  try {
    await page.route('**/api/demo/auth/enabled',route=>route.fulfill({json:{enabled:true}}));
    await page.route('**/api/demo/auth/request-reset',route=>route.fulfill({json:{ok:true}}));
    await page.goto(site.url);
    await page.locator('.nav-actions [data-action="account"]').click();
    await page.getByRole('button',{name:'Recuperar contraseña (demo)'}).click();
    await page.getByLabel('Correo').fill('guest@example.test');
    await page.locator('#simple-form').getByRole('button',{name:'Enviar'}).click();
    const next=page.getByLabel('Nueva contraseña',{exact:true});
    await expect(next).toBeVisible();
    await next.fill('NuevaClave123!');
    await page.getByRole('button',{name:'Mostrar nueva contraseña'}).click();
    await expect(next).toHaveAttribute('type','text');
    await expect(next).toHaveValue('NuevaClave123!');
  } finally {await site.close()}
});
