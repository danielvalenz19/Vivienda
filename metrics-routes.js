'use strict';

// Solo conteos agregados por día; no guardamos IP, búsqueda ni identificadores
// de visitantes. Los conteos de cuentas/listados salen de datos persistidos.
module.exports=function metricsRoutes(app,db,admin){
  db.exec(`CREATE TABLE IF NOT EXISTS metrics_daily(
    day TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('search','detail')),
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(day,kind)
  )`);
  app.use((req,res,next)=>{
    if(req.method!=='GET')return next();
    const kind=req.path==='/api/search'?'search':/^\/api\/listings\/\d+\/detail$/.test(req.path)?'detail':null;
    if(!kind)return next();
    res.on('finish',()=>{
      if(res.statusCode!==200)return;
      try{db.prepare("INSERT INTO metrics_daily(day,kind,count) VALUES(date('now'),?,1) ON CONFLICT(day,kind) DO UPDATE SET count=count+1").run(kind)}
      catch{console.error('No se pudo guardar una métrica agregada.')}
    });
    next();
  });
  app.get('/api/admin/metrics',admin,(req,res)=>{
    const scalar=(sql)=>db.prepare(sql).get().n;
    const counts={
      advertisers_with_listings:scalar('SELECT COUNT(DISTINCT owner) n FROM listings'),
      verified_advertisers:scalar("SELECT COUNT(DISTINCT l.owner) n FROM listings l JOIN verifications v ON v.user=l.owner WHERE v.status='approved'"),
      available_listings:scalar("SELECT COUNT(*) n FROM listings l JOIN users u ON u.id=l.owner WHERE l.status='active' AND u.suspended=0 AND datetime(l.confirmed)>=datetime('now','-' || vgt_availability_days() || ' days')"),
      searches:scalar("SELECT COALESCE(SUM(count),0) n FROM metrics_daily WHERE kind='search'"),
      listing_views:scalar("SELECT COALESCE(SUM(count),0) n FROM metrics_daily WHERE kind='detail'"),
      favorites:scalar('SELECT COUNT(*) n FROM favorites'),
      conversations:scalar('SELECT COUNT(*) n FROM (SELECT DISTINCT listing,MIN(sender,recipient),MAX(sender,recipient) FROM messages)'),
      rented_listings:scalar("SELECT COUNT(*) n FROM listings WHERE status='rented'"),
      reports:scalar('SELECT COUNT(*) n FROM reports')
    };
    const avg=db.prepare("SELECT AVG((julianday(reviewed)-julianday(requested))*24) n FROM verifications WHERE reviewed IS NOT NULL AND requested IS NOT NULL").get().n;
    res.json({counts,mean_identity_review_hours:avg===null?null:Math.round(avg*10)/10,
      scope:process.env.DEMO_AUTH==='1'?'demo':'local',note:'Las conversaciones no representan alquileres concretados.'});
  });
};
