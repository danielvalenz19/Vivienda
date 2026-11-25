'use strict';

// Expiration is also enforced in public queries; this worker only persists the
// state and reminders. Run after the notifications module has created its table
// and status trigger. No user-visible text contains an address or message.
function positiveInteger(value, fallback, name, maximum) {
  if (value === undefined || value === '') return fallback;
  const raw=String(value);
  if (!/^\d+$/.test(raw) || Number(raw)<1 || Number(raw)>maximum)
    throw new Error(`${name} debe ser un entero entre 1 y ${maximum}.`);
  return Number(raw);
}
function config(env=process.env) {
  const days=positiveInteger(env.AVAILABILITY_DAYS,14,'AVAILABILITY_DAYS',365);
  const reminderDays=positiveInteger(env.AVAILABILITY_REMINDER_DAYS,Math.min(2,days),'AVAILABILITY_REMINDER_DAYS',365);
  if(reminderDays>days)throw new Error('AVAILABILITY_REMINDER_DAYS no puede superar AVAILABILITY_DAYS.');
  return {days,reminderDays};
}
function setup(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS availability_events(
    listing INTEGER NOT NULL REFERENCES listings(id),
    confirmed TEXT NOT NULL,
    kind TEXT NOT NULL,
    created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(listing,confirmed,kind)
  );`);
}
function run(db,options={}) {
  const values=config({AVAILABILITY_DAYS:options.days??process.env.AVAILABILITY_DAYS,AVAILABILITY_REMINDER_DAYS:options.reminderDays??process.env.AVAILABILITY_REMINDER_DAYS});
  const clock=options.now===undefined?new Date():new Date(options.now);
  if(!Number.isFinite(clock.getTime()))throw new Error('Fecha inválida para el proceso de disponibilidad.');
  const now=clock.toISOString(),expiry=`-${values.days} days`,reminder=`-${values.days-values.reminderDays} days`;
  let reminders=0,expired=0;
  db.exec('BEGIN IMMEDIATE');
  try {
    // All timestamps are compared by SQLite in UTC. At the exact deadline a
    // listing remains visible, matching the public >= comparison.
    const due=db.prepare("SELECT id,owner,confirmed FROM listings WHERE status='active' AND datetime(confirmed)<datetime(?,?)").all(now,expiry);
    const expire=db.prepare("UPDATE listings SET status='expired' WHERE id=? AND status='active' AND confirmed=?");
    const recordExpiry=db.prepare("INSERT OR IGNORE INTO availability_events(listing,confirmed,kind) VALUES(?,?,'expired')");
    for(const listing of due){const changed=Number(expire.run(listing.id,listing.confirmed).changes);if(changed){recordExpiry.run(listing.id,listing.confirmed);expired+=changed}}
    const upcoming=db.prepare("SELECT id,owner,confirmed FROM listings WHERE status='active' AND datetime(confirmed)<=datetime(?,?) AND datetime(confirmed)>=datetime(?,?)").all(now,reminder,now,expiry);
    const mark=db.prepare("INSERT OR IGNORE INTO availability_events(listing,confirmed,kind) VALUES(?,?,'reminder')");
    const notify=db.prepare("INSERT INTO notifications(user,kind,entity,text) VALUES(?,'availability_reminder',?,'Confirmá la disponibilidad de tu anuncio antes de que venza.')");
    for(const listing of upcoming){
      if(mark.run(listing.id,listing.confirmed).changes){notify.run(listing.owner,listing.id);reminders++}
    }
    db.exec('COMMIT');
  } catch(error) {db.exec('ROLLBACK');throw error}
  return {reminders,expired};
}
module.exports={config,setup,run};
