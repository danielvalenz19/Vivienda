'use strict';

// Leer solo mensajes dirigidos al usuario actual, dentro del par vivienda/persona.
module.exports=function chatReadRoutes(app,db,auth){
  const cols=new Set(db.prepare('PRAGMA table_info(messages)').all().map(x=>x.name));
  if(!cols.has('read_at'))db.exec('ALTER TABLE messages ADD COLUMN read_at TEXT');
  app.post('/api/conversations/:listing/:other/read',auth,(req,res)=>{
    const listing=Number(req.params.listing),other=Number(req.params.other),user=req.session.user.id;
    if(!Number.isSafeInteger(listing)||listing<1||!Number.isSafeInteger(other)||other<1||other===user)return res.sendStatus(404);
    const ownThread=db.prepare('SELECT 1 FROM messages WHERE listing=? AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?)) LIMIT 1').get(listing,user,other,other,user);
    if(!ownThread)return res.sendStatus(404);
    const result=db.prepare("UPDATE messages SET read_at=CURRENT_TIMESTAMP WHERE listing=? AND sender=? AND recipient=? AND read_at IS NULL").run(listing,other,user);
    res.json({ok:true,updated:Number(result.changes)});
  });
};
