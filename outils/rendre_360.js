/* Panoramas 360° du relevé photo.

   Pour chaque arrêt, fabrique une bande cylindrique qui fait le tour de
   l'horizon depuis le point de prise de vue. Sur le terrain, l'application
   la fait défiler avec la boussole : ce que montre l'écran est ce que tu as
   devant toi, et il n'y a plus qu'à tourner jusqu'au repère.

   Méthode : douze vues perspectives de 30° de champ, prises tous les 30°,
   mises bout à bout. Sur un champ aussi étroit, l'écart entre la projection
   perspective et la projection cylindrique est inférieur à 1 % de la largeur
   d'une tranche — la bande se lit comme un panorama continu, sans avoir à
   reprojeter quoi que ce soit.

   La tranche k couvre les azimuts [30k, 30k+30], donc x = 0 dans la bande
   correspond exactement au nord : dans l'application, azimut = x / largeur × 360.

   Usage :
     node outils/rendre_360.js              le lot de validation (défaut)
     node outils/rendre_360.js --prio1      aussi les façades de priorité 1
     node outils/rendre_360.js --refaire    réécrit les panoramas déjà là
     node outils/rendre_360.js --index      réécrit seulement 360/index.json

   Écrit releve/vues/360/*.jpg et releve/vues/360/index.json.              */

const fs=require('fs'), path=require('path'), http=require('http');
const RACINE=path.resolve(__dirname,'..');
const DOSSIER=path.join(RACINE,'releve','vues','360');
const PLAN=JSON.parse(fs.readFileSync(path.join(RACINE,'releve','plan.json'),'utf8'));

const ARG=process.argv.slice(2);
const PRIO1=ARG.includes('--prio1');
const REFAIRE=ARG.includes('--refaire');
const SEUL_INDEX=ARG.includes('--index');
const PAUSE=(()=>{ const i=ARG.indexOf('--pause'); return i>=0?+ARG[i+1]:1500; })();

/* douze tranches de 30° : bande de 2880 × 320 */
const TRANCHES=12, CHAMP=360/TRANCHES, LARG=240, HAUT=320, QUALITE=0.68;

const CIBLES=[];
PLAN.arrets.forEach(a=>{
  if(!a.v && !(PRIO1 && a.p===1 && !a.m)) return;
  CIBLES.push({nom:'facade-'+String(a.i).padStart(3,'0')+'.jpg', la:a.la, lo:a.lo,
               az:a.az, lot:a.v||0, sujet:a.n||('km '+a.km)});
});

const TYPES={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png'};
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

function ecrireIndex(){
  const dispo=CIBLES.filter(c=>fs.existsSync(path.join(DOSSIER,c.nom)));
  const index={
    genere:new Date().toISOString().slice(0,10),
    /* la bande part du nord et fait le tour complet */
    format:[LARG*TRANCHES,HAUT], tranches:TRANCHES, champ:CHAMP,
    panos:dispo.map(c=>c.nom),
    lot:dispo.filter(c=>c.lot).map(c=>c.nom)
  };
  fs.mkdirSync(DOSSIER,{recursive:true});
  fs.writeFileSync(path.join(DOSSIER,'index.json'),JSON.stringify(index));
  console.log('360/index.json : '+index.panos.length+' panoramas, dont '+index.lot.length+' pour le lot');
}

if(SEUL_INDEX){ ecrireIndex(); }
else (async()=>{
  let chromium;
  try{ chromium=require('playwright').chromium; }
  catch(e){ chromium=require('/opt/node22/lib/node_modules/playwright').chromium; }

  fs.mkdirSync(DOSSIER,{recursive:true});
  const aFaire=CIBLES.filter(c=>REFAIRE||!fs.existsSync(path.join(DOSSIER,c.nom)));
  console.log(CIBLES.length+' panoramas au plan, '+aFaire.length+' à rendre ('+TRANCHES+' vues chacun)');
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
  }
  if(!pret){ console.log('le monde ne s’est pas construit'); await nav.close(); serveur.close(); process.exit(1); }
  console.log('monde construit en '+Math.round((Date.now()-t0)/1000)+' s\n');

  /* la bande est assemblée dans la page : une toile de 2880 × 320 où chaque
     cliché est collé à sa place, puis relue en un seul JPEG */
  await page.evaluate(d=>{
    window.__bande=document.createElement('canvas');
    window.__bande.width=d[0]; window.__bande.height=d[1];
    window.__ctx=window.__bande.getContext('2d');
  },[LARG*TRANCHES,HAUT]);

  let n=0, poids=0, ratés=0;
  for(const c of aFaire){
    n++;
    let complet=true;
    for(let k=0;k<TRANCHES;k++){
      const az=(k*CHAMP+CHAMP/2)%360;    /* centre de la tranche k */
      const ok=await page.evaluate(v=>window.ESPACE3D.vueDepuis({la:v.la,lo:v.lo,az:v.az,champ:v.champ}),
                                   {la:c.la,lo:c.lo,az:az,champ:CHAMP});
      if(!ok){ complet=false; break; }
      await page.waitForTimeout(k===0?PAUSE:Math.round(PAUSE*0.45));
      const collé=await page.evaluate(a=>{
        const img=window.ESPACE3D.cliche(0.92);
        if(!img) return false;
        return new Promise(res=>{
          const im=new Image();
          im.onload=()=>{ window.__ctx.drawImage(im,a[0],0,a[1],a[2]); res(true); };
          im.onerror=()=>res(false);
          im.src=img;
        });
      },[k*LARG,LARG,HAUT]);
      if(!collé){ complet=false; break; }
    }
    if(!complet){ console.log('  '+c.nom+' : incomplet'); ratés++; continue; }
    const data=await page.evaluate(q=>window.__bande.toDataURL('image/jpeg',q),QUALITE);
    const buf=Buffer.from(data.split(',')[1],'base64');
    fs.writeFileSync(path.join(DOSSIER,c.nom),buf);
    poids+=buf.length;
    const ecoule=(Date.now()-t0)/1000;
    console.log('  '+n+'/'+aFaire.length+' '+c.nom+' ('+Math.round(buf.length/1024)+' Ko) · '+
                c.sujet+' · reste ~'+Math.round((ecoule/n)*(aFaire.length-n)/60)+' min');
  }
  await nav.close(); serveur.close();
  console.log('\n'+(n-ratés)+' panoramas, '+Math.round(poids/1048576*10)/10+' Mo'+(ratés?', '+ratés+' ratés':''));
  ecrireIndex();
})();
