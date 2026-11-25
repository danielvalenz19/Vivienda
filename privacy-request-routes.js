'use strict';

// Los plazos y reglas definitivas de conservación requieren revisión legal.
// Ninguna transición de estos expedientes borra ni modifica datos de cuenta.
const schema = `
  CREATE TABLE IF NOT EXISTS privacy_requests (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK(kind IN ('access','correction','deletion')),
    detail TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','in_review','resolved','rejected')),
    response TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_privacy_requests_user ON privacy_requests(user_id,id DESC);
  CREATE INDEX IF NOT EXISTS idx_privacy_requests_status ON privacy_requests(status,id DESC);
`;

function register(app, db, auth, admin, audit) {
  const kinds = new Set(['access', 'correction', 'deletion']);
  const fields = 'id,kind,detail,status,response,created_at,updated_at';
  app.get('/api/privacy/requests', auth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(db.prepare(`SELECT ${fields} FROM privacy_requests WHERE user_id=? ORDER BY id DESC LIMIT 100`).all(req.session.user.id));
  });
  app.post('/api/privacy/requests', auth, (req, res) => {
    const kind = req.body?.kind;
    const detail = typeof req.body?.detail === 'string' ? req.body.detail.trim() : '';
    if (!kinds.has(kind) || detail.length < 10 || detail.length > 1000) {
      return res.status(400).json({error:'Seleccioná una solicitud y describila con entre 10 y 1000 caracteres.'});
    }
    const user = req.session.user.id;
    // One pending request of each type; preserve the record when rejected/resolved.
    if (db.prepare("SELECT 1 FROM privacy_requests WHERE user_id=? AND kind=? AND status IN ('received','in_review')").get(user,kind)) {
      return res.status(409).json({error:'Ya tenés una solicitud de este tipo en revisión.'});
    }
    if (db.prepare("SELECT count(*) n FROM privacy_requests WHERE user_id=? AND datetime(created_at)>datetime('now','-1 hour')").get(user).n >= 3) {
      return res.status(429).json({error:'Alcanzaste el límite de solicitudes. Intentá más tarde.'});
    }
    const result = db.prepare('INSERT INTO privacy_requests(user_id,kind,detail) VALUES(?,?,?)').run(user,kind,detail);
    res.status(201).json({id:Number(result.lastInsertRowid),status:'received'});
  });
  app.get('/api/admin/privacy/requests', admin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(db.prepare(`SELECT p.${fields.replaceAll(',',',p.')},p.user_id,u.name,u.email
      FROM privacy_requests p JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 200`).all());
  });
  app.post('/api/admin/privacy/requests/:id', admin, (req, res) => {
    const id = Number(req.params.id), status = req.body?.status;
    const response = typeof req.body?.response === 'string' ? req.body.response.trim() : '';
    if (!Number.isSafeInteger(id) || id < 1 || !['in_review','resolved','rejected'].includes(status) || response.length > 1000) {
      return res.status(400).json({error:'Revisá el estado y la respuesta.'});
    }
    const request = db.prepare('SELECT id,user_id,status FROM privacy_requests WHERE id=?').get(id);
    if (!request) return res.sendStatus(404);
    if (request.user_id === req.session.user.id) return res.status(403).json({error:'No podés resolver tu propia solicitud.'});
    const transitions = {received:['in_review'],in_review:['resolved','rejected'],resolved:[],rejected:[]};
    if (!transitions[request.status]?.includes(status)) return res.status(409).json({error:'La transición solicitada no está disponible.'});
    if (status !== 'in_review' && response.length < 10) return res.status(400).json({error:'Agregá una respuesta de al menos 10 caracteres.'});
    db.exec('BEGIN IMMEDIATE');
    try {
      const changed = db.prepare('UPDATE privacy_requests SET status=?,response=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=?').run(status,response,id,request.status);
      if (!changed.changes) { db.exec('ROLLBACK'); return res.status(409).json({error:'La solicitud ya cambió. Actualizá la página.'}); }
      audit(req.session.user.id,status,'privacy_request',id);
      if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='notifications'").get()) {
        db.prepare("INSERT INTO notifications(user,kind,entity,text) VALUES(?,'privacy_request',?,'Hay una actualización de tu solicitud de privacidad.')").run(request.user_id,id);
      }
      db.exec('COMMIT');
      res.json({ok:true,status});
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  });
}
module.exports = {schema, register};
