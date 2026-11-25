'use strict';
const {request:csrfRequest}=require('./csrf-test-client');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const {readKey, encryptEvidence, decryptEvidence} = require('../evidence-crypto');

test('AES-GCM autentica el contenido y el identificador de cada evidencia', () => {
  const key = readKey('42'.repeat(32)), data = Buffer.from('evidencia ficticia');
  const ciphertext = encryptEvidence(data, key, 'registro1');
  assert.deepEqual(decryptEvidence(ciphertext, key, 'registro1'), data);
  assert.throws(() => decryptEvidence(ciphertext, key, 'registro2'));
  const altered = Buffer.from(ciphertext);
  altered[altered.length - 1] ^= 1;
  assert.throws(() => decryptEvidence(altered, key, 'registro1'));
  assert.throws(() => decryptEvidence(ciphertext, readKey('23'.repeat(32)), 'registro1'));
  assert.throws(() => readKey('invalida'));
});

test('la evidencia cifrada persiste y solo la persona autorizada puede recuperarla', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vgt-encrypted-'));
  const port = 32000 + crypto.randomInt(10000), base = 'http://127.0.0.1:' + port;
  const env = {...process.env, NODE_ENV: 'test', DEMO_AUTH:'0', PORT:String(port),
    DB_PATH:path.join(tmp,'db.sqlite'), PHOTO_DIR:path.join(tmp,'photos'),
    PROFILE_PHOTO_DIR:path.join(tmp,'profiles'), EVIDENCE_DIR:path.join(tmp,'evidence'),
    EVIDENCE_ENCRYPTION_KEY:'42'.repeat(32)};
  const server = spawn(process.execPath, ['server.js'], {cwd:path.resolve(__dirname,'..'), env, stdio:['ignore','pipe','pipe']});
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Tiempo agotado al iniciar el servidor')), 10000);
      server.stdout.on('data', data => { if (String(data).includes('Vivienda GT en')) {clearTimeout(timer); resolve();} });
      server.on('exit', code => {clearTimeout(timer); reject(new Error('Servidor terminó: '+code));});
    });
    const json = obj => ({method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(obj)});
    async function call(url, options={}, cookie='') {
      const {response:res,cookie:updated}=await csrfRequest(base,url,options,cookie);
      return {res, cookie:updated, body:await res.json()};
    }
    const one = await call('/api/register',json({name:'Persona demo',email:'owner@example.invalid',password:'Test12345!',terms_accepted:true}));
    const two = await call('/api/register',json({name:'Otra persona',email:'other@example.invalid',password:'Test12345!',terms_accepted:true}));
    assert.equal(one.res.status,200);
    const draft = await call('/api/drafts',json({data:{title:'Borrador'}}),one.cookie);
    const img = await sharp({create:{width:8,height:8,channels:3,background:'red'}}).png().toBuffer();
    const form = new FormData(); form.append('evidence',new Blob([img],{type:'image/png'}),'test.png');
    const upload = await call('/api/listings/'+draft.body.id+'/evidence',{method:'POST',body:form},one.cookie);
    assert.equal(upload.res.status,201);
    const stored = fs.readFileSync(path.join(tmp,'evidence',upload.body.id+'.enc'));
    assert.equal(stored.includes(Buffer.from('WEBP')),false);
    assert.equal(fs.existsSync(path.join(tmp,'evidence',upload.body.id+'.webp')),false);
    const unauthorized = await fetch(base+'/api/evidence/'+upload.body.id,{headers:{cookie:two.cookie}});
    assert.equal(unauthorized.status,404);
    const authorized = await fetch(base+'/api/evidence/'+upload.body.id,{headers:{cookie:one.cookie}});
    assert.equal(authorized.status,200);
    assert.equal(authorized.headers.get('cache-control'),'no-store');
    const decoded = Buffer.from(await authorized.arrayBuffer());
    assert.equal(decoded.toString('ascii',8,12),'WEBP');
  } finally {
    server.kill();
    await new Promise(resolve => {if (server.exitCode !== null || server.signalCode !== null) resolve(); else server.once('exit',resolve);});
    fs.rmSync(tmp,{recursive:true,force:true});
  }
});
