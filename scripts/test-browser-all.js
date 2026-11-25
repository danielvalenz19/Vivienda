'use strict';
const {readdirSync}=require('node:fs');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const configs=readdirSync(path.join(root,'tests')).filter(name=>name==='playwright.config.js'||name.endsWith('.playwright.config.js')||name.endsWith('-visual.config.js')).sort();
let failed=false;
for(const config of configs){
  console.log('\nPruebas de navegador: '+config);
  const result=spawnSync(process.execPath,[require.resolve('@playwright/test/cli'),'test','--config','tests/'+config],{cwd:root,stdio:'inherit'});
  if(result.status!==0)failed=true;
}
console.log('\nConfiguraciones revisadas: '+configs.length+'.');
process.exitCode=failed?1:0;
