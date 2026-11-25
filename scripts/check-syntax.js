'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const excluded=new Set(['node_modules','vendor','dist','output','test-results','.git','.agents']);
function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    if(excluded.has(entry.name))return [];
    const p=path.join(dir,entry.name);
    if(entry.isDirectory())return walk(p);
    return entry.isFile()&&entry.name.endsWith('.js')?[p]:[];
  });
}
const files=walk(root);
let failed=false;
for(const file of files){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0){failed=true;process.stderr.write(result.stderr||'Error de sintaxis: '+file+'\n');}
}
console.log(`Sintaxis JavaScript: ${files.length} archivos revisados.`);
process.exitCode=failed?1:0;
