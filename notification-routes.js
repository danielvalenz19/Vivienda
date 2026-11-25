'use strict';

// Los disparadores guardan solo textos genéricos: nunca contenido de mensajes o documentos.
module.exports = function notifications(app, db, auth) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications(
      id INTEGER PRIMARY KEY,
      user INTEGER NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL,
      entity INTEGER,
      text TEXT NOT NULL,
      created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      read_at TEXT
    );
    CREATE INDEX IF NOT EXISTS notifications_user_created ON notifications(user,id DESC);
    CREATE TRIGGER IF NOT EXISTS notify_message AFTER INSERT ON messages BEGIN
      INSERT INTO notifications(user,kind,entity,text) VALUES(NEW.recipient,'message',NEW.listing,'Recibiste un mensaje nuevo.');
    END;
    CREATE TRIGGER IF NOT EXISTS notify_verification AFTER UPDATE OF status ON verifications
    WHEN NEW.status != OLD.status BEGIN
      INSERT INTO notifications(user,kind,entity,text) VALUES(NEW.user,'verification',NEW.user,'Hay una actualización de tu revisión de identidad.');
    END;
    CREATE TRIGGER IF NOT EXISTS notify_listing AFTER UPDATE OF status ON listings
    WHEN NEW.status != OLD.status BEGIN
      INSERT INTO notifications(user,kind,entity,text) VALUES(NEW.owner,'listing',NEW.id,'Cambió el estado de uno de tus anuncios.');
    END;
    CREATE TRIGGER IF NOT EXISTS notify_review AFTER UPDATE OF status ON reviews
    WHEN NEW.status != OLD.status AND NEW.status='approved' BEGIN
      INSERT INTO notifications(user,kind,entity,text) VALUES(NEW.owner,'review',NEW.id,'Recibiste una valoración publicada.');
    END;
    CREATE TRIGGER IF NOT EXISTS notify_appeal AFTER UPDATE OF status ON appeals
    WHEN NEW.status != OLD.status AND NEW.status IN ('resolved','dismissed') BEGIN
      INSERT INTO notifications(user,kind,entity,text) VALUES(NEW.user,'appeal',NEW.id,'Tu apelación tiene una resolución.');
    END;
    CREATE TRIGGER IF NOT EXISTS notify_report AFTER UPDATE OF status ON reports
    WHEN NEW.status != OLD.status AND NEW.status IN ('resolved','dismissed') BEGIN
      INSERT INTO notifications(user,kind,entity,text) VALUES(NEW.reporter,'report',NEW.id,'Tu reporte fue revisado.');
    END;
  `);
  app.get('/api/notifications', auth, (q,s) => {
    const user = q.session.user.id;
    const items = db.prepare('SELECT id,kind,entity,text,created,read_at FROM notifications WHERE user=? ORDER BY id DESC LIMIT 100').all(user);
    const unread = db.prepare('SELECT COUNT(*) n FROM notifications WHERE user=? AND read_at IS NULL').get(user).n;
    s.json({items, unread});
  });
  app.post('/api/notifications/:id/read', auth, (q,s) => {
    const id = Number(q.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return s.sendStatus(404);
    const result = db.prepare("UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND user=?").run(id,q.session.user.id);
    if (!result.changes) return s.sendStatus(404);
    s.json({ok:true});
  });
  app.post('/api/notifications/read-all', auth, (q,s) => {
    db.prepare('UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user=? AND read_at IS NULL').run(q.session.user.id);
    s.json({ok:true});
  });
};
