'use strict';
const {test,expect}=require('@playwright/test');
const {DatabaseSync}=require('node:sqlite');
const {mkdir,writeFile}=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');
const {fixture}=require('./fixture-server');
for(const width of [390,1440])test(`galería accesible y desglose de costos en ${width}px`,async({page})=>{
 const f=await fixture();try{
  const db=new DatabaseSync(f.dbPath),dir=path.join(f.dir,'photos');await mkdir(dir,{recursive:true});
  for(let i=0;i<4;i++){const id=String(i+1).padStart(32,'0'),image=await sharp({create:{width:20,height:20,channels:3,background:i%2?'red':'green'}}).webp().toBuffer();await writeFile(path.join(dir,id+'.webp'),image);db.prepare('INSERT INTO listing_photos(id,listing,position) VALUES(?,?,?)').run(id,f.listing,i)}db.close();
  await page.setViewportSize({width,height:844});await page.goto(f.url+'/#/vivienda/'+f.listing);await expect(page.locator('.gallery [data-view-photo]')).toHaveCount(4);
  const open=page.getByRole('button',{name:'Ver las 4 fotos'});await open.click();const modal=page.getByRole('dialog',{name:'Fotos de la vivienda'});await expect(modal).toBeVisible();await expect(modal.getByText('1 de 4')).toBeVisible();
  await page.keyboard.press('ArrowRight');await expect(modal.getByText('2 de 4')).toBeVisible();await modal.getByRole('button',{name:'Siguiente'}).click();await modal.getByRole('button',{name:'Siguiente'}).click();await expect(modal.getByText('4 de 4')).toBeVisible();await expect(modal.getByRole('button',{name:'Siguiente'})).toBeDisabled();await expect(modal.getByRole('button',{name:'Anterior'})).toBeFocused();await page.keyboard.press('ArrowLeft');await expect(modal.getByText('3 de 4')).toBeVisible();await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);await expect(open).toBeFocused();
  await expect(page.locator('.price-box')).toContainText('Renta + depósito inicial');await expect(page.locator('.price-box')).toContainText('Q4,600');await expect(page.locator('.price-box')).toContainText('No informados');await expect(page.locator('.price-box')).toContainText('Confirmá los cargos adicionales');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 }finally{await f.close()}
});
