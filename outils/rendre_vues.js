/* Vignettes 3D du relevé photo.

   Pour chaque photo à prendre, fabrique l'image que la 3D donne du même
   point et du même angle : sur le terrain, on compare et on cadre pareil.

   Ouvre la page dans un Chromium sans écran, construit le monde une fois,
   puis saute de point en point avec ESPACE3D.vueDepuis() / .cliche().

   Usage :
     node outils/rendre_vues.js                 tout le plan
     node outils/rendre_vues.js --lot           seulement le lot de validation
     node outils/rendre_vues.js --refaire       réécrit les vues déjà là
     node outils/rendre_vues.js --pause 2500    attente par vue, en ms
     node outils/rendre_vues.js --index        réécrit seulement index.json

   Écrit releve/vues/*.jpg et releve/vues/index.json.
   Les vues déjà présentes sont sautées : un long rendu se reprend.        */

const fs=require('fs'), path=require('path'), http=require('http');
const RACINE=path.resolve(__dirname,'..');
const VUES=path.join(RACINE,'releve','vues');
const PLAN=JSON.parse(fs.readFileSync(path.join(RACINE,'releve','plan.json'),'utf8'));

const ARG=process.argv.slice(2);
const SEUL_LOT=ARG.includes('--lot');
const REFAIRE=ARG.includes('--refaire');
const PAUSE=(()=>{ const i=ARG.indexOf('--pause'); return i>=0?+ARG[i+1]:2200; })();
const SEUL_INDEX=ARG.includes('--index');

/* format de la vignette : proche du cadre d'un téléphone tenu à l'horizontale */
const LARG=520, HAUT=340, CHAMP=68, QUALITE=0.7;

/* ---------- combien de photos par arrêt, et sous quels angles ---------- */
/* Un téléphone voit environ 1,4 × le recul en largeur. Une façade plus large
   se prend en plusieurs photos, en balayant : chacune a son propre angle. */
function anglesFacade(a){
  const vue=Math.max(6,a.r*1.4);
  const n=Math.max(1,Math.min(4,Math.ceil(a.l/vue)));
  if(n===1) return [a.az];
  /* largeur angulaire de la façade vue du point de prise de vue */
  const total=2*Math.atan((a.l/2)/Math.max(4,a.r))*180/Math.PI;
  const pas=Math.min(CHAMP*0.85, total/n);
  const A=[];
  for(let k=0;k<n;k++) A.push((a.az+(k-(n-1)/2)*pas+360)%360);
  return A;
}
/* Un poste de jalonneur : gauche, face, droite de ce qu'il regarde. */
function anglesPoste(j){ return [(j.az+320)%360, j.az, (j.az+40)%360]; }

const TACHES=[];
PLAN.arrets.forEach(a=>{
  if(SEUL_LOT && !a.v) return;
  anglesFacade(a).forEach((az,k)=>{
    TACHES.push({nom:'facade-'+String(a.i).padStart(3,'0')+'-'+(k+1)+'.jpg',
                 la:a.la, lo:a.lo, az:az, sujet:a.n||('km '+a.km), lot:a.v||0});
  });
});
PLAN.jalons.forEach(j=>{
  if(SEUL_LOT && !j.v) return;
  anglesPoste(j).forEach((az,k)=>{
    TACHES.push({nom:'poste-'+String(j.n).padStart(3,'0')+'-'+(k+1)+'.jpg',
                 la:j.la, lo:j.lo, az:az, sujet:'poste n°'+j.n, lot:j.v||0});
  });
});

/* ---------- serveur local : la page a besoin d'être servie en UTF-8 ---------- */
const TYPES={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8',
  '.jpg':'image/jpeg','.png':'image/png'};
function servir(){
  return new Promise(ok=>{
    const s=http.createServer((rq,rs)=>{
      let u=decodeURIComponent(rq.url.split('?')[0]);
      if(u.endsWith('/')) u+='index.html';
      const f=path.join(RACINE,u);
      if(!f.startsWith(RACINE)){ rs.writeHead(403); rs.end(); return; }
      fs.readFile(f,(e,d)=>{
        if(e){ rs.writeHead(404); rs.end('absent'); return; }
        rs.writeHead(200,{'Content-Type':TYPES[path.extname(f).toLowerCase()]||'application/octet-stream',
                          'Cache-Control':'no-store'});
        rs.end(d);
      });
    });
    s.listen(0,()=>ok({serveur:s, port:s.address().port}));
  });
}

if(SEUL_INDEX){ ecrireIndex(); }
else (async()=>{
  let chromium;
  try{ chromium=require('playwright').chromium; }
  catch(e){ chromium=require('/opt/node22/lib/node_modules/playwright').chromium; }

  fs.mkdirSync(VUES,{recursive:true});
  const aFaire=TACHES.filter(t=>REFAIRE||!fs.existsSync(path.join(VUES,t.nom)));
  console.log(TACHES.length+' vues au plan, '+aFaire.length+' à rendre'+(SEUL_LOT?' (lot de validation)':''));
  if(!aFaire.length){ ecrireIndex(); return; }

  const {serveur,port}=await servir();
  const nav=await chromium.launch({args:[
    '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'
  ]});
  const page=await (await nav.newContext({viewport:{width:LARG,height:HAUT}})).newPage();
  page.on('pageerror',e=>console.log('  erreur page :',e.message));

  console.log('construction du monde…');
  const t0=Date.now();
  await page.goto('http://localhost:'+port+'/?edition=1',{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForTimeout(2000);
  await page.click('#b-3d');
  let pret=false;
  for(let i=0;i<180;i++){
    await page.waitForTimeout(2000);
    pret=await page.evaluate(()=>!!(window.ESPACE3D&&window.ESPACE3D.construit&&window.ESPACE3D.construit()));
    if(pret) break;
    const txt=await page.evaluate(()=>(document.getElementById('e3-vtxt')||{}).textContent||'');
    if(/Erreur/.test(txt)){ console.log('échec :',txt); break; }
  }
  if(!pret){ console.log('le monde ne s’est pas construit'); await nav.close(); serveur.close(); process.exit(1); }
  console.log('monde construit en '+Math.round((Date.now()-t0)/1000)+' s\n');

  let n=0, poids=0, ratés=0;
  for(const t of aFaire){
    n++;
    const ok=await page.evaluate(v=>window.ESPACE3D.vueDepuis({la:v.la,lo:v.lo,az:v.az,champ:v.champ}),
                                 {la:t.la,lo:t.lo,az:t.az,champ:CHAMP});
    if(!ok){ console.log('  '+t.nom+' : caméra refusée'); ratés++; continue; }
    await page.waitForTimeout(PAUSE);
    const img=await page.evaluate(q=>window.ESPACE3D.cliche(q),QUALITE);
    if(!img||img.length<4000){ console.log('  '+t.nom+' : image vide'); ratés++; continue; }
    const buf=Buffer.from(img.split(',')[1],'base64');
    fs.writeFileSync(path.join(VUES,t.nom),buf);
    poids+=buf.length;
    if(n%20===0||n===aFaire.length){
      const pc=Math.round(n/aFaire.length*100), ecoule=(Date.now()-t0)/1000;
      const reste=Math.round((ecoule/n)*(aFaire.length-n)/60);
      console.log('  '+n+'/'+aFaire.length+' ('+pc+'%) · '+Math.round(poids/1024)+' Ko · reste ~'+reste+' min');
    }
  }
  await nav.close(); serveur.close();
  console.log('\n'+(n-ratés)+' vues écrites, '+Math.round(poids/1048576*10)/10+' Mo'+(ratés?', '+ratés+' ratées':''));
  ecrireIndex();
})();

/* index.json : ce que l'application lit pour savoir quelle vue afficher */
function ecrireIndex(){
  const dispo={};
  TACHES.forEach(t=>{ if(fs.existsSync(path.join(VUES,t.nom))) dispo[t.nom]=1; });
  const index={
    genere:new Date().toISOString().slice(0,10),
    format:[LARG,HAUT], champ:CHAMP,
    angles:{}, vues:Object.keys(dispo),
    /* les vues du lot de validation : ce sont celles que le téléphone
       garde hors ligne, les autres se chargent au besoin */
    lot:TACHES.filter(t=>t.lot&&dispo[t.nom]).map(t=>t.nom)
  };
  PLAN.arrets.forEach(a=>{ index.angles['f'+a.i]=anglesFacade(a).map(z=>Math.round(z)); });
  PLAN.jalons.forEach(j=>{ index.angles['p'+j.n]=anglesPoste(j).map(z=>Math.round(z)); });
  fs.writeFileSync(path.join(VUES,'index.json'),JSON.stringify(index));
  console.log('index.json : '+index.vues.length+' vues disponibles');
}
