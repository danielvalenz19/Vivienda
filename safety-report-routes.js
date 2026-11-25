'use strict';

// A report describes a single resource, never a whole conversation.
module.exports=function safetyReportRoutes(app,db,auth,audit,mfa){
 const fail=(s,status,message)=>s.status(status).json({error:message});
 const idOf=x=>/^\d+$/.test(String(x))&&Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):null;
 const types=new Set(['listing','user','message','review']);
 const categories=new Set(['fraud','harassment','threat','impersonation','spam','other']);
 const staff=(q,s,next)=>{
  if(!['admin','moderator'].includes(q.session.user?.role))return fail(s,403,'Acceso restringido.');
  if(mfa.required(q))return s.status(403).json({error:'Completá la verificación en dos pasos.',code:'MFA_REQUIRED'});
  next();
 };
 const involved=(q,row)=>row.reporter===q.session.user.id||row.target_user===q.session.user.id||
  (row.subject_kind==='review'&&!!db.prepare('SELECT 1 FROM reviews WHERE id=? AND owner=?').get(row.subject_id,q.session.user.id));
 const queueRow=(id)=>db.prepare('SELECT * FROM safety_reports WHERE id=?').get(id);
 const days=require('./availability').config().days;
 app.post('/api/safety-reports',auth,(q,s)=>{
  const actor=q.session.user.id,kind=q.body?.kind,id=idOf(q.body?.id),category=q.body?.category;
  const description=typeof q.body?.description==='string'?q.body.description.trim():'';
  if(!types.has(kind)||!id||!categories.has(category)||description.length<10||description.length>1000)return fail(s,400,'Elegí una categoría y describí lo ocurrido en 10 a 1000 caracteres.');
  let target;
  if(kind==='message'){
   const row=db.prepare('SELECT sender,recipient FROM messages WHERE id=?').get(id);
   if(row?.recipient===actor&&row.sender!==actor)target=row.sender;
  }else if(kind==='review'){
   const row=db.prepare("SELECT reviewer FROM reviews WHERE id=? AND status='approved'").get(id);
   if(row&&row.reviewer!==actor)target=row.reviewer;
  }else if(kind==='listing'){
   const row=db.prepare(`SELECT l.owner FROM listings l JOIN users u ON u.id=l.owner WHERE l.id=? AND ((l.status='active' AND u.suspended=0 AND datetime(l.confirmed)>=datetime('now','-${days} days')) OR EXISTS(SELECT 1 FROM messages m WHERE m.listing=l.id AND (m.sender=? OR m.recipient=?)))`).get(id,actor,actor);
   if(row&&row.owner!==actor)target=row.owner;
  }else{
   const row=db.prepare(`SELECT u.id FROM users u WHERE u.id=? AND u.id<>? AND (EXISTS(SELECT 1 FROM messages m WHERE (m.sender=? AND m.recipient=u.id) OR (m.recipient=? AND m.sender=u.id)) OR EXISTS(SELECT 1 FROM listings l WHERE l.owner=u.id AND l.status='active' AND u.suspended=0 AND datetime(l.confirmed)>=datetime('now','-${days} days')))`).get(id,actor,actor,actor);
   if(row)target=row.id;
  }
  if(!target)return fail(s,404,'No se encontró el recurso que querés reportar.');
  if(db.prepare("SELECT COUNT(*) n FROM safety_reports WHERE reporter=? AND datetime(created)>=datetime('now','-1 hour')").get(actor).n>=20)return fail(s,429,'Alcanzaste el límite de reportes. Intentá más tarde.');
  if(db.prepare("SELECT 1 FROM safety_reports WHERE reporter=? AND subject_kind=? AND subject_id=? AND status='pending'").get(actor,kind,id))return fail(s,409,'Ya tenés un reporte pendiente sobre este contenido.');
  db.exec('BEGIN IMMEDIATE');try{const result=db.prepare('INSERT INTO safety_reports(reporter,subject_kind,subject_id,target_user,category,description,priority) VALUES(?,?,?,?,?,?,?)').run(actor,kind,id,target,category,description,category==='threat'?'high':'normal');audit(actor,'submit','safety_report',Number(result.lastInsertRowid));db.exec('COMMIT');s.status(201).json({id:Number(result.lastInsertRowid),status:'pending'})}catch(e){db.exec('ROLLBACK');throw e}
 });
 app.get('/api/safety-reports/mine',auth,(q,s)=>s.json(db.prepare('SELECT id,subject_kind,category,description,status,created,updated FROM safety_reports WHERE reporter=? ORDER BY id DESC LIMIT 100').all(q.session.user.id)));
 app.get('/api/staff/safety-reports',auth,staff,(q,s)=>s.json(db.prepare("SELECT id,subject_kind,category,description,priority,status,created FROM safety_reports WHERE status='pending' AND reporter<>? AND target_user<>? AND NOT (subject_kind='review' AND EXISTS(SELECT 1 FROM reviews r WHERE r.id=safety_reports.subject_id AND r.owner=?)) ORDER BY CASE priority WHEN 'high' THEN 0 ELSE 1 END,id DESC LIMIT 100").all(q.session.user.id,q.session.user.id,q.session.user.id)));
 app.post('/api/staff/safety-reports/:id/context',auth,staff,(q,s)=>{
  const id=idOf(q.params.id),reason=typeof q.body?.reason==='string'?q.body.reason.trim():'';
  if(!id||reason.length<10||reason.length>500)return fail(s,400,'Indicá un motivo de acceso de 10 a 500 caracteres.');
  const report=queueRow(id);if(!report||report.status!=='pending')return fail(s,404,'Reporte pendiente no encontrado.');
  if(involved(q,report))return fail(s,403,'No podés revisar un reporte en el que participás.');
  let resource=null;
  if(report.subject_kind==='message')resource=db.prepare('SELECT id,body,created FROM messages WHERE id=?').get(report.subject_id);
  else if(report.subject_kind==='review')resource=db.prepare('SELECT id,rating,body,status FROM reviews WHERE id=?').get(report.subject_id);
  else if(report.subject_kind==='listing')resource=db.prepare('SELECT id,title,city,area,status FROM listings WHERE id=?').get(report.subject_id);
  else resource=db.prepare("SELECT u.id,COALESCE(NULLIF(p.public_name,''),u.name) name FROM users u LEFT JOIN user_profiles p ON p.user=u.id WHERE u.id=?").get(report.subject_id);
  audit(q.session.user.id,'view_context','safety_report',id,reason);
  s.set('Cache-Control','no-store').json({kind:report.subject_kind,resource:resource||null});
 });
 app.post('/api/staff/safety-reports/:id/resolve',auth,staff,(q,s)=>{
  const id=idOf(q.params.id),status=q.body?.status,resolution=typeof q.body?.resolution==='string'?q.body.resolution.trim():'';
  if(!id||!['resolved','dismissed'].includes(status)||resolution.length<10||resolution.length>500)return fail(s,400,'Indicá una resolución de 10 a 500 caracteres.');
  const row=queueRow(id);if(!row||row.status!=='pending')return fail(s,404,'Reporte pendiente no encontrado.');
  if(involved(q,row))return fail(s,403,'No podés resolver un reporte en el que participás.');
  db.exec('BEGIN IMMEDIATE');try{const updated=db.prepare("UPDATE safety_reports SET status=?,resolver=?,resolution=?,updated=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").run(status,q.session.user.id,resolution,id);if(!updated.changes){db.exec('ROLLBACK');return fail(s,409,'El reporte ya fue revisado.')};db.prepare("INSERT INTO notifications(user,kind,entity,text) VALUES(?,'report',?,'Tu reporte fue revisado.')").run(row.reporter,id);audit(q.session.user.id,status,'safety_report',id,resolution);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}s.json({ok:true});
 });
};
