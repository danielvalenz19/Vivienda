'use strict';
const {request:csrfRequest}=require('./csrf-test-client');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const availability=require('../availability');
const {fixture}=require('./fixture-server');

test('recordatorios y vencimientos son idempotentes por ciclo de confirmación',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE listings(id INTEGER PRIMARY KEY,owner INTEGER,status TEXT,confirmed TEXT);
    CREATE TABLE notifications(id INTEGER PRIMARY KEY,user INTEGER,kind TEXT,entity INTEGER,text TEXT);
    CREATE TRIGGER notify_listing AFTER UPDATE OF status ON listings WHEN NEW.status != OLD.status BEGIN
      INSERT INTO notifications(user,kind,entity,text) VALUES(NEW.owner,'listing',NEW.id,'Cambió el estado.');
    END;
    INSERT INTO listings VALUES(1,10,'active','2026-01-01 12:00:00'),(2,10,'active','2026-01-12 12:00:00'),(3,10,'paused','2026-01-01 12:00:00');`);
  availability.setup(db);availability.setup(db);
  const at=(now)=>availability.run(db,{now,days:14,reminderDays:2});
  assert.deepEqual(at('2026-01-13T12:00:00Z'),{reminders:1,expired:0});
  assert.deepEqual(at('2026-01-13T12:00:00Z'),{reminders:0,expired:0});
  assert.equal(db.prepare("SELECT COUNT(*) n FROM notifications WHERE kind='availability_reminder'").get().n,1);
  assert.deepEqual(at('2026-01-15T12:00:00Z'),{reminders:0,expired:0});
  assert.deepEqual(at('2026-01-15T12:00:01Z'),{reminders:0,expired:1});
  assert.deepEqual(at('2026-01-15T12:00:01Z'),{reminders:0,expired:0});
  assert.equal(db.prepare("SELECT COUNT(*) n FROM notifications WHERE kind='listing'").get().n,1);
  assert.equal(db.prepare('SELECT status FROM listings WHERE id=3').get().status,'paused');
  db.prepare("UPDATE listings SET status='active',confirmed='2026-01-16 12:00:00' WHERE id=1").run();
  assert.deepEqual(at('2026-01-28T12:00:00Z'),{reminders:1,expired:1});
  assert.equal(db.prepare("SELECT COUNT(*) n FROM notifications WHERE kind='availability_reminder' AND entity=1").get().n,2);
  db.close();
});

test('la configuración rechaza períodos y horas inválidos',()=>{
  assert.deepEqual(availability.config({}),{days:14,reminderDays:2});
  assert.deepEqual(availability.config({AVAILABILITY_DAYS:'7',AVAILABILITY_REMINDER_DAYS:'1'}),{days:7,reminderDays:1});
  assert.throws(()=>availability.config({AVAILABILITY_DAYS:'0'}));
  assert.throws(()=>availability.config({AVAILABILITY_DAYS:'7',AVAILABILITY_REMINDER_DAYS:'8'}));
  assert.throws(()=>availability.config({AVAILABILITY_DAYS:'14 days'}));
  const db=new DatabaseSync(':memory:');assert.throws(()=>availability.run(db,{now:'fecha inválida'}));db.close();
});

test('período configurable oculta un anuncio y permite reactivarlo solo al dueño aprobado',async t=>{
  const previous=process.env.AVAILABILITY_DAYS;process.env.AVAILABILITY_DAYS='7';
  let site;try{site=await fixture()}finally{if(previous===undefined)delete process.env.AVAILABILITY_DAYS;else process.env.AVAILABILITY_DAYS=previous}
  t.after(()=>site.close());
  const db=new DatabaseSync(site.dbPath);
  db.prepare("UPDATE listings SET confirmed=datetime('now','-6 days') WHERE id=?").run(site.listing);
  assert.equal(availability.run(db,{days:7,reminderDays:2}).reminders,1);
  assert.equal(availability.run(db,{days:7,reminderDays:2}).reminders,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM notifications WHERE kind='availability_reminder' AND entity=?").get(site.listing).n,1);
  db.prepare("UPDATE listings SET confirmed=datetime('now','-8 days') WHERE id=?").run(site.listing);
  assert.equal((await (await fetch(site.url+'/api/search')).json()).length,0);
  assert.equal((await (await fetch(site.url+'/api/listings')).json()).length,0);
  assert.equal((await fetch(site.url+'/api/listings/'+site.listing+'/detail')).status,404);
  assert.equal(availability.run(db,{days:7,reminderDays:2}).expired,1);
  assert.equal(db.prepare('SELECT status FROM listings WHERE id=?').get(site.listing).status,'expired');
  const login=async email=>(await csrfRequest(site.url,'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'BrowserTest123!'})})).cookie;
  const confirm=async cookie=>(await csrfRequest(site.url,'/api/listings/'+site.listing+'/confirm',{method:'POST',headers:{'content-type':'application/json'},body:'{}'},cookie)).response;
  assert.equal((await confirm(await login('guest@example.test'))).status,404);
  assert.equal((await confirm(await login('owner@example.test'))).status,200);
  assert.equal(db.prepare('SELECT status FROM listings WHERE id=?').get(site.listing).status,'active');
  assert.equal((await (await fetch(site.url+'/api/search')).json()).length,1);
  assert.equal((await fetch(site.url+'/api/listings/'+site.listing+'/detail')).status,200);
  db.close();
});
