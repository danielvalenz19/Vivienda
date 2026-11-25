'use strict';

// Minimal, separately scoped queues. Privileged roles do not inherit /api/admin.
module.exports = function staffRoutes(app, db, mfa, audit) {
  const guard = allowed => (q,s,next) => {
    if (!q.session.user || !allowed.includes(q.session.user.role)) return s.status(403).json({error:'Acceso restringido.'});
    if (mfa.required(q)) return s.status(403).json({error:'Completá la verificación en dos pasos.',code:'MFA_REQUIRED'});
    next();
  };
  const verify=guard(['admin','verifier']), moderate=guard(['admin','moderator']);
  const err=(s,code,message)=>s.status(code).json({error:message});
  const idOf=value=>/^\d+$/.test(String(value))&&Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null;

  app.get('/api/staff/verification',verify,(q,s)=>{
    const actor=q.session.user.id;
    const verifications=db.prepare("SELECT v.user,v.status,v.requested,v.note,v.user_note,u.name,u.email FROM verifications v JOIN users u ON u.id=v.user WHERE v.status='pending' AND v.user<>? ORDER BY v.requested,v.user").all(actor);
    const listings=db.prepare("SELECT l.id,l.title,l.city,l.description,l.owner,u.name owner_name,COALESCE(v.status,'not_requested') verification_status FROM listings l JOIN users u ON u.id=l.owner LEFT JOIN verifications v ON v.user=u.id WHERE l.status='pending' AND l.owner<>? ORDER BY l.id").all(actor);
    s.json({verifications,listings});
  });
  app.post('/api/staff/verifications/:id',verify,(q,s)=>{
    const id=idOf(q.params.id),status=q.body?.status,note=typeof q.body?.note==='string'?q.body.note.trim():'';
    if(!id||!['approved','rejected','needs_correction'].includes(status)||note.length>500)return err(s,400,'Revisá el estado y las observaciones.');
    if(status==='needs_correction'&&note.length<10)return err(s,400,'Explicá la corrección necesaria con al menos 10 caracteres.');
    if(id===q.session.user.id)return err(s,403,'No podés revisar tu propia identidad.');
    const v=db.prepare("SELECT user FROM verifications WHERE user=? AND status='pending'").get(id);
    if(!v)return err(s,404,'Solicitud pendiente no encontrada.');
    db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE verifications SET status=?,note=?,reviewed=CURRENT_TIMESTAMP WHERE user=? AND status=\'pending\'').run(status,note,id);audit(q.session.user.id,status,'verification',id,note);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
    s.json({ok:true});
  });
  app.post('/api/staff/listings/:id',verify,(q,s)=>{
    const id=idOf(q.params.id),status=q.body?.status;if(!id||!['active','rejected'].includes(status))return err(s,400,'Estado no válido.');
    const l=db.prepare("SELECT l.id,l.owner,u.suspended,COALESCE(v.status,'not_requested') verification_status FROM listings l JOIN users u ON u.id=l.owner LEFT JOIN verifications v ON v.user=l.owner WHERE l.id=? AND l.status='pending'").get(id);
    if(!l)return err(s,404,'Anuncio pendiente no encontrado.');if(l.owner===q.session.user.id)return err(s,403,'No podés revisar tu propio anuncio.');
    if(status==='active'){
      if(l.suspended||l.verification_status!=='approved')return err(s,400,'Primero debe revisarse la identidad del anunciante y su cuenta debe estar activa.');
      if(q.body.authorization!==true||!db.prepare("SELECT 1 FROM listing_evidence WHERE listing=? AND datetime(expires)>datetime('now')").get(id))return err(s,400,'Revisá la evidencia vigente de autorización antes de aprobar.');
    }
    db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE listings SET status=?,authorization=?,confirmed=CURRENT_TIMESTAMP WHERE id=? AND status=\'pending\'').run(status,status==='active'?'approved':'rejected',id);audit(q.session.user.id,status,'listing',id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
    s.json({ok:true});
  });

  app.get('/api/staff/moderation',moderate,(q,s)=>{
    const id=q.session.user.id;
    const reports=db.prepare("SELECT r.id,r.listing,r.reason,r.status,l.title FROM reports r JOIN listings l ON l.id=r.listing WHERE r.status='pending' AND r.reporter<>? AND l.owner<>? ORDER BY r.id DESC").all(id,id);
    const reviews=db.prepare("SELECT r.id,r.rating,r.body,l.title FROM reviews r JOIN visits v ON v.id=r.visit JOIN listings l ON l.id=v.listing WHERE r.status='pending' AND r.reviewer<>? AND r.owner<>? ORDER BY r.id DESC").all(id,id);
    s.json({reports,reviews});
  });
  app.post('/api/staff/reports/:id',moderate,(q,s)=>{
    const id=idOf(q.params.id),status=q.body?.status;if(!id||!['resolved','dismissed'].includes(status))return err(s,400,'Estado no válido.');
    const r=db.prepare("SELECT r.id,r.reporter,l.owner FROM reports r JOIN listings l ON l.id=r.listing WHERE r.id=? AND r.status='pending'").get(id);
    if(!r)return err(s,404,'Reporte pendiente no encontrado.');if([r.reporter,r.owner].includes(q.session.user.id))return err(s,403,'No podés resolver un reporte en el que participás.');
    db.exec('BEGIN IMMEDIATE');try{db.prepare("UPDATE reports SET status=? WHERE id=? AND status='pending'").run(status,id);audit(q.session.user.id,status,'report',id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
    s.json({ok:true});
  });
  app.post('/api/staff/reviews/:id',moderate,(q,s)=>{
    const id=idOf(q.params.id),status=q.body?.status;if(!id||!['approved','rejected'].includes(status))return err(s,400,'Estado no válido.');
    const r=db.prepare("SELECT id,reviewer,owner FROM reviews WHERE id=? AND status='pending'").get(id);
    if(!r)return err(s,404,'Reseña pendiente no encontrada.');if([r.reviewer,r.owner].includes(q.session.user.id))return err(s,403,'No podés moderar tu propia reseña.');
    db.exec('BEGIN IMMEDIATE');try{db.prepare("UPDATE reviews SET status=? WHERE id=? AND status='pending'").run(status,id);audit(q.session.user.id,status,'review',id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
    s.json({ok:true});
  });
};
