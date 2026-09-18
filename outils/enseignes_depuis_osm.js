/* Les enseignes des commerces, depuis les noms d'OpenStreetMap.

   Ce qui fait reconnaître une rue, ce n'est pas seulement la hauteur des
   façades : c'est ce qui est écrit dessus. À Saint-Maixent, les sept
   enseignes de la 3D ont été relevées une à une sur les photos, avec leurs
   couleurs et leur position au lancer de rayon — un travail à la main que
   l'on ne recommence pas pour chaque bourg.

   Or OpenStreetMap porte déjà l'essentiel : le nom du commerce et sa nature.
   Ce script en fabrique les enseignes, posées sur le bon mur du bon bâtiment.
   Il ne remplace pas la photo — il ne connaît ni la vraie couleur du
   bandeau, ni la vraie police — mais « PHARMACIE » en vert sur la pharmacie
   et « LA POSTE » en jaune sur la poste valent mieux qu'une façade muette.

   Le mur choisi est celui qui donne sur la rue : pour chaque côté de
   l'emprise, on mesure la distance de son milieu à la chaussée la plus
   proche, et on garde le plus proche dont la normale sorte du bâtiment. Sans
   ce dernier test, une enseigne sur deux se retrouvait à l'intérieur, donc
   invisible.

   Usage :
     node outils/enseignes_depuis_osm.js village/export-osm.geojson \
          --page village/index.html --sortie village/enseignes.html

   Écrit un bloc <script>window.CARTE_ENSEIGNES=[…]</script> à inclure dans
   la page, que actifs/code3d.js lit à la place de sa table de Saint-Maixent. */

const fs=require('fs'), path=require('path');
const ARG=process.argv.slice(2);
function opt(n,d){ const i=ARG.indexOf('--'+n); return i<0?d:ARG[i+1]; }
const OSM=ARG.find(a=>!a.startsWith('--'));
const PAGE=opt('page','village/index.html');
const SORTIE=opt('sortie','village/enseignes.html');
if(!OSM){ console.error('usage : node outils/enseignes_depuis_osm.js <export.geojson> --page <page> --sortie <fichier>'); process.exit(1); }

const C=require('./carte.js').charger({page:PAGE, silence:true});
const {BATS, VOIES, pX, pZ, loDeX, laDeZ}=C;

/* ------------------------------------------- ce qu'on sait mettre en toile
   Un bandeau de commerce français : fond, encre, et le mot juste quand OSM
   ne donne pas de nom. Les couleurs sont celles de l'usage, pas celles du
   relevé : une photo les corrigera. */
const MODELES={
  pharmacy:      {t:'PHARMACIE',    fond:'#f4f6f3', encre:'#0f8a4a'},
  bakery:        {t:'BOULANGERIE',  fond:'#f1e4c9', encre:'#6b3b12'},
  pastry:        {t:'PÂTISSERIE',   fond:'#f1e4c9', encre:'#6b3b12'},
  butcher:       {t:'BOUCHERIE',    fond:'#f6f1ef', encre:'#a3172a'},
  hairdresser:   {t:'COIFFURE',     fond:'#1f1f24', encre:'#efe7dd'},
  bank:          {t:'BANQUE',       fond:'#ffffff', encre:'#0a4a8c'},
  post_office:   {t:'LA POSTE',     fond:'#ffd200', encre:'#00447c'},
  pub:           {t:'CAFÉ',         fond:'#1e2a1e', encre:'#e8dfc0'},
  bar:           {t:'CAFÉ',         fond:'#1e2a1e', encre:'#e8dfc0'},
  cafe:          {t:'CAFÉ',         fond:'#1e2a1e', encre:'#e8dfc0'},
  restaurant:    {t:'RESTAURANT',   fond:'#2b2118', encre:'#e9d9b8'},
  supermarket:   {t:'ALIMENTATION', fond:'#f4f4f2', encre:'#1b5e20'},
  convenience:   {t:'ALIMENTATION', fond:'#f4f4f2', encre:'#1b5e20'},
  tobacco:       {t:'TABAC',        fond:'#c8102e', encre:'#ffffff'},
  newsagent:     {t:'PRESSE',       fond:'#f4f4f2', encre:'#1b3f8c'},
  florist:       {t:'FLEURS',       fond:'#f6f3ee', encre:'#2f6b3a'},
  hardware:      {t:'QUINCAILLERIE',fond:'#f2f2ef', encre:'#3a3a3a'},
  car_repair:    {t:'GARAGE',       fond:'#20242a', encre:'#e8e8e8'},
  insurance:     {t:'ASSURANCES',   fond:'#ffffff', encre:'#123f88'},
  estate_agent:  {t:'IMMOBILIER',   fond:'#1b7cb0', encre:'#ffffff'},
  pharmacy_veto: {t:'VÉTÉRINAIRE',  fond:'#ffffff', encre:'#0f6a8a'}
};
/* la mairie porte une plaque gravée, pas un bandeau */
const PLAQUES={townhall:'MAIRIE', library:'MÉDIATHÈQUE', community_centre:'SALLE DES FÊTES',
               school:'ÉCOLE', college:'COLLÈGE', doctors:'MAISON DE SANTÉ',
               fire_station:'CENTRE DE SECOURS', theatre:'THÉÂTRE',
               social_facility:'EHPAD', veterinary:'VÉTÉRINAIRE'};

/* --------------------------------------------------------- géométrie ----- */
function dansPoly(p,x,z){
  let d=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++){
    const xi=p[i][0], zi=p[i][1], xj=p[j][0], zj=p[j][1];
    if(((zi>z)!==(zj>z)) && (x<(xj-xi)*(z-zi)/(zj-zi)+xi)) d=!d;
  }
  return d;
}
function distSeg(x,z,a,b){
  const dx=b[0]-a[0], dz=b[1]-a[1], L2=dx*dx+dz*dz;
  let t=L2?((x-a[0])*dx+(z-a[1])*dz)/L2:0;
  t=Math.max(0,Math.min(1,t));
  return Math.hypot(x-(a[0]+t*dx), z-(a[1]+t*dz));
}
/* les chaussées, pour savoir de quel côté est la rue */
const CHAUSSEES=VOIES.filter(v=>v.k==='r'||v.k==='v').map(v=>v.p);
function distRue(x,z){
  let m=1e9;
  for(const p of CHAUSSEES) for(let i=1;i<p.length;i++){
    const d=distSeg(x,z,p[i-1],p[i]);
    if(d<m) m=d;
  }
  return m;
}
/* le mur qui donne sur la rue : le plus proche de la chaussée, normale sortante */
function murDeVitrine(b){
  let best=null;
  const n=b.p.length;
  for(let i=0;i<n;i++){
    const a=b.p[i], c=b.p[(i+1)%n];
    const dx=c[0]-a[0], dz=c[1]-a[1], L=Math.hypot(dx,dz);
    if(L<2.5) continue;                       /* trop court pour une enseigne */
    const mx=(a[0]+c[0])/2, mz=(a[1]+c[1])/2;
    /* les deux normales possibles ; on garde celle qui sort de l'emprise */
    for(const s of [1,-1]){
      const nx=s*dz/L, nz=-s*dx/L;
      if(dansPoly(b.p, mx+nx*0.6, mz+nz*0.6)) continue;
      const d=distRue(mx+nx*1.2, mz+nz*1.2);
      if(!best || d<best.d) best={d, mx, mz, nx, nz, L};
    }
  }
  return best;
}

/* -------------------------------------------------------------- le tri --- */
const geo=JSON.parse(fs.readFileSync(OSM,'utf8'));
const trouve=[], sans=[];
for(const f of geo.features||[]){
  const t=f.properties||{}, g=f.geometry;
  if(!g) continue;
  const genre=t.shop||t.amenity||t.office||t.craft;
  if(!genre) continue;
  const modele=MODELES[genre];
  let plaque=PLAQUES[genre];
  /* « school » couvre l'école comme le collège : le nom tranche */
  if(genre==='school' && /coll[eè]ge/i.test(t.name||'')) plaque='COLLÈGE';
  if(genre==='school' && /lyc[eé]e/i.test(t.name||'')) plaque='LYCÉE';
  if(!modele && !plaque){ if(t.name) sans.push(genre+' « '+t.name+' »'); continue; }
  /* le centre de l'objet, puis le bâtiment qui le porte */
  let sx=0, sz=0, n=0;
  (function s(c){ if(typeof c[0]==='number'){ sx+=pX(c[0]); sz+=pZ(c[1]); n++; } else c.forEach(s); })(g.coordinates);
  const x=sx/n, z=sz/n;
  let bat=null;
  for(const b of BATS) if(dansPoly(b.p,x,z)){ bat=b; break; }
  if(!bat){
    let bd=18;
    for(const b of BATS){ const d=Math.hypot(b.cx-x,b.cz-z); if(d<bd){ bd=d; bat=b; } }
  }
  if(!bat){ sans.push(genre+' (aucun bâtiment)'); continue; }
  const mur=murDeVitrine(bat);
  if(!mur){ sans.push(genre+' (aucun mur assez long)'); continue; }
  const az=((Math.atan2(mur.nx,-mur.nz)*180/Math.PI)+360)%360;
  const e={la:+laDeZ(mur.mz).toFixed(6), lo:+loDeX(mur.mx).toFixed(6), az:+az.toFixed(1), dec:0};
  if(plaque){
    e.bas=2.55; e.l=Math.min(mur.L*0.5, 1.9); e.ht=0.6; e.plaque=[plaque];
  } else {
    const nom=(t.name||'').trim();
    /* le nom quand il y a un nom, la nature sinon ; et la nature en second
       ligne quand le nom ne dit pas ce que c'est */
    const majuscule=nom && nom.length<=16 && nom===nom.toUpperCase();
    e.bas=3.15;
    e.l=Math.min(mur.L*0.72, 4.6);
    e.ht=0.9;
    e.texte=nom || modele.t;
    if(nom && modele.t!=='BANQUE' && nom.toUpperCase().indexOf(modele.t)<0) e.sous=modele.t.toLowerCase();
    if(!nom && modele.t==='BANQUE'){ e.texte='BANQUE'; }
    e.fond=modele.fond; e.encre=modele.encre;
    if(majuscule) e.espace=true;
  }
  e._quoi=genre; e._nom=t.name||'';
  trouve.push(e);
}
/* un même bâtiment peut porter deux objets : on garde le mieux nommé et on
   décale le second le long du mur plutôt que de superposer les deux */
const parMur=new Map();
for(const e of trouve){
  const k=e.la.toFixed(5)+'_'+e.lo.toFixed(5)+'_'+Math.round(e.az);
  if(!parMur.has(k)) parMur.set(k,[]);
  parMur.get(k).push(e);
}
for(const [,liste] of parMur){
  if(liste.length<2) continue;
  liste.sort((a,b)=>(b._nom?1:0)-(a._nom?1:0));
  liste.forEach((e,i)=>{ if(i) e.dec=+( (i%2?1:-1) * Math.ceil(i/2) * (e.l+0.4) ).toFixed(2); });
}

/* ------------------------------------------------------------- écriture -- */
const lignes=trouve.map(e=>{
  const o={la:e.la, lo:e.lo, az:e.az, dec:e.dec, bas:e.bas, l:+e.l.toFixed(2), ht:e.ht};
  if(e.plaque) o.plaque=e.plaque;
  else { o.texte=e.texte; if(e.sous) o.sous=e.sous; o.fond=e.fond; o.encre=e.encre; if(e.espace) o.espace=true; }
  return '  '+JSON.stringify(o)+',   /* '+e._quoi+(e._nom?' — '+e._nom:'')+' */';
});
const out='<!-- Enseignes fabriquées par outils/enseignes_depuis_osm.js depuis '+
  path.basename(OSM)+'.\n     Les couleurs sont celles de l’usage, pas d’un relevé : une photo les corrigera. -->\n'+
  '<script>window.CARTE_ENSEIGNES=[\n'+lignes.join('\n').replace(/,(\s*\/\*[^*]*\*\/)$/,'$1')+'\n];</script>\n';
fs.mkdirSync(path.dirname(path.resolve(SORTIE)),{recursive:true});
fs.writeFileSync(SORTIE,out);
console.log('=== '+trouve.length+' enseignes → '+SORTIE+' ===');
trouve.forEach(e=>console.log('  '+(e.plaque?('plaque '+e.plaque[0]):('« '+e.texte+(e.sous?' / '+e.sous:'')+' »')).padEnd(34)+
  ' az '+String(Math.round(e.az)).padStart(3)+'°  '+e._quoi+(e._nom?'  ('+e._nom+')':'')));
if(sans.length) console.log('  laissés de côté : '+[...new Set(sans)].join(', '));
