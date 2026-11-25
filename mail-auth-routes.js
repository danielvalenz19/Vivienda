'use strict';
const crypto=require('node:crypto');
const bcrypt=require('bcryptjs');
const nodemailer=require('nodemailer');

function smtpConfiguration(env=process.env){
  const host=env.SMTP_HOST, port=Number(env.SMTP_PORT||587), from=env.SMTP_FROM;
  if(!host&&!from&&!env.SMTP_USER&&!env.SMTP_PASSWORD)return null;
  if(!host||!from||/[\r\n]/.test(from)||!Number.isInteger(port)||port<1||port>65535)throw new Error('Configuración SMTP incompleta.');
  if(Boolean(env.SMTP_USER)!==Boolean(env.SMTP_PASSWORD))throw new Error('SMTP_USER y SMTP_PASSWORD deben configurarse juntos.');
  return {from,transport:nodemailer.createTransport({host,port,secure:port===465,requireTLS:port!==465,...(env.SMTP_USER?{auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD}}:{})})};
}

// Tokens aleatorios, solo hash persistido, un único uso y vigencia limitada.
// El envío real solo existe si se configura SMTP o se inyecta un transporte de prueba.
function registerMailAuth(app,db,sessionStore,configuration){
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_auth_tokens(
      token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),purpose TEXT NOT NULL,
      expires_at INTEGER NOT NULL,used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS email_confirmations(user_id INTEGER PRIMARY KEY REFERENCES users(id),confirmed_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mail_auth_limits(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
  `);
  const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
  function withinLimit(kind,ip){
    const now=Date.now(),bucket=hash(kind+':'+String(ip||'unknown'));
    db.prepare('DELETE FROM mail_auth_limits WHERE expires_at<=?').run(now);
    db.prepare('INSERT INTO mail_auth_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1').run(bucket,now+15*60*1000);
    return db.prepare('SELECT count FROM mail_auth_limits WHERE bucket=?').get(bucket).count<=10;
  }
  app.get('/api/auth/mail-status',(req,res)=>res.json({enabled:!!configuration}));
  function request(purpose){return async(req,res)=>{
    if(!withinLimit('request-'+purpose,req.ip))return res.status(429).json({error:'Demasiados intentos. Probá más tarde.'});
    if(!configuration)return res.status(503).json({error:'El servicio de correo no está configurado.'});
    const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
    const user=email.length<=254?db.prepare('SELECT id,email FROM users WHERE email=?').get(email):null;
    if(user){
      const token=crypto.randomBytes(32).toString('base64url'), now=Date.now();
      db.exec('BEGIN IMMEDIATE');
      try{
        db.prepare('UPDATE mail_auth_tokens SET used_at=? WHERE user_id=? AND purpose=? AND used_at IS NULL').run(now,user.id,purpose);
        db.prepare('INSERT INTO mail_auth_tokens(token_hash,user_id,purpose,expires_at) VALUES(?,?,?,?)').run(hash(token),user.id,purpose,now+15*60*1000);
        db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e}
      // No esperar al proveedor antes de responder: evita que el tiempo de red
      // revele directamente si la dirección existe en la base.
      Promise.resolve().then(() => configuration.transport.sendMail({from:configuration.from,to:user.email,
          subject:purpose==='reset'?'Recuperar tu acceso a ViviendaGT':'Confirmar tu correo en ViviendaGT',
          text:`Tu código de ${purpose==='reset'?'recuperación':'confirmación'} es: ${token}\n\nEs válido durante 15 minutos y se puede usar una sola vez. Si no solicitaste este código, ignorá este correo.`}))
        .catch(()=>console.error('No se pudo entregar un correo de autenticación. Revisá la configuración SMTP.'));
    }
    res.json({ok:true,message:'Si la cuenta existe, recibirás un correo con instrucciones.'});
  };}
  app.post('/api/auth/request-reset',request('reset'));
  app.post('/api/auth/request-confirmation',request('confirm'));
  app.get('/api/auth/contact-status',(req,res)=>{
    if(!req.session?.user)return res.sendStatus(401);
    res.json({confirmed:!!db.prepare('SELECT user_id FROM email_confirmations WHERE user_id=?').get(req.session.user.id)});
  });
  app.post('/api/auth/use-token',async(req,res)=>{
    if(!withinLimit('use',req.ip))return res.status(429).json({error:'Demasiados intentos. Probá más tarde.'});
    const {purpose,token,password}=req.body||{};
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||!['reset','confirm'].includes(purpose))return res.status(400).json({error:'Código inválido o vencido.'});
    if(purpose==='reset'&&(typeof password!=='string'||password.length<8||password.length>128))return res.status(400).json({error:'La contraseña debe tener entre 8 y 128 caracteres.'});
    const digest=hash(token), passwordHash=purpose==='reset'?await bcrypt.hash(password,12):null, now=Date.now();
    db.exec('BEGIN IMMEDIATE');
    try{
      const row=db.prepare('SELECT user_id FROM mail_auth_tokens WHERE token_hash=? AND purpose=? AND used_at IS NULL AND expires_at>?').get(digest,purpose,now);
      if(!row){db.exec('ROLLBACK');return res.status(400).json({error:'Código inválido o vencido.'})}
      db.prepare('UPDATE mail_auth_tokens SET used_at=? WHERE token_hash=?').run(now,digest);
      if(purpose==='reset'){
        db.prepare('UPDATE users SET password=?,auth_version=auth_version+1 WHERE id=?').run(passwordHash,row.user_id);
        sessionStore.destroyUser(row.user_id);
      }else db.prepare('INSERT INTO email_confirmations(user_id,confirmed_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET confirmed_at=excluded.confirmed_at').run(row.user_id,now);
      db.exec('COMMIT');res.json({ok:true});
    }catch{try{db.exec('ROLLBACK')}catch{}res.status(500).json({error:'No se pudo completar la operación.'})}
  });
}
module.exports={smtpConfiguration,registerMailAuth};
