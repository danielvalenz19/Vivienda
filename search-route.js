'use strict';

// Public search reads only currently available homes. Values are always bound;
// the sort expression is selected from a fixed allowlist.
module.exports = function searchRoute(db) {
  const duration=require('./availability').config().days;
  return (req, res) => {
    const p = req.query;
    const allowed = new Set(['city','department','municipality','sector','type','minPrice','maxPrice','rooms','baths','parking','furnished','pets','service','deposit','availability','sort','page','limit']);
    for (const [key,value] of Object.entries(p)) {
      if (!allowed.has(key) || typeof value !== 'string' || value.length > 100)
        return res.status(400).json({error:'Filtro no válido.'});
    }
    for (const key of ['minPrice','maxPrice','rooms','baths','page','limit']) {
      if (p[key] !== undefined && (!/^\d+$/.test(p[key]) || Number(p[key]) > (key === 'page' ? 100000 : key === 'limit' ? 100 : 10000000) || (['page','limit'].includes(key) && Number(p[key]) < 1)))
        return res.status(400).json({error:'Filtro numérico inválido.'});
    }
    if (p.minPrice && p.maxPrice && Number(p.minPrice)>Number(p.maxPrice))
      return res.status(400).json({error:'El precio mínimo no puede superar el máximo.'});
    const enums = {type:['Apartamento','Cuarto'],parking:['Sí','No'],furnished:['Sí','No'],pets:['Sí','No','Consultar'],deposit:['required','none'],availability:['available'],sort:['newest','price_asc','price_desc','updated','confirmed']};
    for (const [key,values] of Object.entries(enums))
      if (p[key] && !values.includes(p[key])) return res.status(400).json({error:'Opción de filtro no válida.'});
    const where = ["l.status='active'",'u.suspended=0',`datetime(l.confirmed)>=datetime('now','-${duration} days')`];
    const args = [];
    for (const [key,column] of Object.entries({city:'l.city',department:'l.department',municipality:'l.municipality',type:'l.type',parking:'l.parking',furnished:'l.furnished',pets:'l.pets'})) {
      if (p[key]) { where.push(`${column}=?`); args.push(key==='municipality' && p[key].toLocaleLowerCase('es')==='quetzaltenango'?'Xela':p[key]); }
    }
    for (const [key,column,op] of [['minPrice','l.price','>='],['maxPrice','l.price','<='],['rooms','l.rooms','>='],['baths','l.baths','>=']]) {
      if (p[key]) { where.push(`${column}${op}?`); args.push(Number(p[key])); }
    }
    // Escape wildcard characters: a search term must be treated as text.
    for (const [key,column] of [['sector','l.area'],['service','l.services']]) {
      if (p[key]) { where.push(`lower(${column}) LIKE lower(?) ESCAPE '\\'`); args.push('%'+p[key].replace(/[\\%_]/g,'\\$&')+'%'); }
    }
    if (p.deposit==='required') where.push('l.deposit>0');
    if (p.deposit==='none') where.push('l.deposit=0');
    const from = ` FROM listings l JOIN users u ON u.id=l.owner LEFT JOIN user_profiles p ON p.user=u.id LEFT JOIN verifications v ON v.user=u.id WHERE ${where.join(' AND ')}`;
    const order = {newest:'l.created DESC,l.id DESC',price_asc:'l.price ASC,l.id DESC',price_desc:'l.price DESC,l.id DESC',updated:'l.updated DESC,l.id DESC',confirmed:'l.confirmed DESC,l.id DESC'}[p.sort] || "CASE WHEN l.city='Xela' THEN 0 ELSE 1 END,l.created DESC,l.id DESC";
    const select = `SELECT l.id,l.owner,l.title,l.city,l.department,l.municipality,l.area,l.type,l.price,l.deposit,l.description,l.rooms,l.baths,l.image,l.status,l.created,l.updated,l.confirmed,l.services,l.parking,l.furnished,l.pets,l.extra_costs,l.conditions,l.authorization,COALESCE(NULLIF(p.public_name,''),u.name) owner_name,COALESCE(v.status,'not_requested') verification_status`;
    if (p.page || p.limit) {
      const page=Number(p.page||1),limit=Number(p.limit||24);
      const total=db.prepare('SELECT COUNT(*) n'+from).get(...args).n;
      const listings=db.prepare(select+from+' ORDER BY '+order+' LIMIT ? OFFSET ?').all(...args,limit,(page-1)*limit);
      return res.json({listings,total,page,limit});
    }
    return res.json(db.prepare(select+from+' ORDER BY '+order).all(...args));
  };
};
