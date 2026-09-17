/* Comparaison photo / 3D, au même endroit et sous le même angle.

   Pour chaque photo du relevé, replace la caméra 3D à la position GPS et au
   cap de la boussole notés dans le manifeste, au format d'un téléphone tenu
   à la verticale, et enregistre le rendu à côté de la photo. Fabrique une
   planche photo-au-dessus / 3D-au-dessous, et mesure sur les deux la teinte
   des murs pour dire l'écart en clair.

   C'est ce qui permet de régler les couleurs de la 3D sur mesure au lieu de
   les juger à l'œil : on vise un écart nul sur la teinte éclairée.

   Usage : node outils/comparer_photos.js <dossier des photos>
   Écrit <dossier>/rendus/*.jpg et <dossier>/comparaison.jpg              */

const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path'), http=require('http');

const RACINE=path.resolve(__dirname,'..');
const DOSSIER=process.argv[2];
if(!DOSSIER){ console.error('usage : node outils/comparer_photos.js <dossier>'); process.exit(1); }
const RENDUS=path.join(DOSSIER,'rendus');
const meta=JSON.parse(fs.readFileSync(path.join(DOSSIER,'manifeste.json'),'utf8'));

/* format portrait d'un téléphone : 3 sur 4, champ horizontal d'environ 55° */
const LARG=480, HAUT=640, CHAMP=55, QUALITE=0.86;

const TYPES={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png'};
function servir(racine){
  return new Promise(ok=>{
    const s=http.createServer((rq,rs)=>{
      let u=decodeURIComponent(rq.url.split('?')[0]);
      if(u.endsWith('/')) u+='index.html';
      const f=path.join(racine,u);
      if(!f.startsWith(racine)){ rs.writeHead(403); rs.end(); return; }
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

(async()=>{
  fs.mkdirSync(RENDUS,{recursive:true});
  /* on ne compare que ce qui a un cap : sans lui on ne sait pas où viser */
  const cibles=meta.photos.filter(p=>p.az_boussole!==null && p.la!==null);
  console.log(cibles.length+' photos avec position et cap\n');

  const {serveur,port}=await servir(RACINE);
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

  for(const p of cibles){
    const ok=await page.evaluate(v=>window.ESPACE3D.vueDepuis({la:v.la,lo:v.lo,az:v.az,champ:v.champ,pitch:v.pitch}),
      {la:p.la, lo:p.lo, az:p.az_boussole, champ:CHAMP, pitch:0.06});
    if(!ok){ console.log('  '+p.fichier+' : caméra refusée'); continue; }
    await page.waitForTimeout(2600);
    const img=await page.evaluate(q=>window.ESPACE3D.cliche(q),QUALITE);
    if(!img||img.length<4000){ console.log('  '+p.fichier+' : rendu vide'); continue; }
    fs.writeFileSync(path.join(RENDUS,p.fichier),Buffer.from(img.split(',')[1],'base64'));
    console.log('  rendu : '+p.fichier+'  (cap '+p.az_boussole+'°)');
  }
  await nav.close(); serveur.close();
  console.log('\nrendus écrits dans '+RENDUS);

  /* planche : photo au-dessus, 3D au-dessous */
  const noms=cibles.map(p=>p.fichier).filter(n=>fs.existsSync(path.join(RENDUS,n)));
  const {serveur:s2,port:p2}=await servir(DOSSIER);
  const nav2=await chromium.launch();
  const pg=await (await nav2.newContext()).newPage();
  await pg.goto('http://localhost:'+p2+'/manifeste.json');
  await pg.goto('http://localhost:'+p2+'/');
  const data=await pg.evaluate(async(a)=>{
    const [noms,CELL,COL]=a;
    const H=Math.round(CELL*4/3);
    const lignes=Math.ceil(noms.length/COL);
    const c=document.createElement('canvas');
    c.width=COL*CELL; c.height=lignes*(H*2+30);
    const g=c.getContext('2d');
    g.fillStyle='#11161f'; g.fillRect(0,0,c.width,c.height);
    async function charge(u){ return new Promise(r=>{ const o=new Image(); o.onload=()=>r(o); o.onerror=()=>r(null); o.src=u; }); }
    for(let i=0;i<noms.length;i++){
      const x=(i%COL)*CELL, y=Math.floor(i/COL)*(H*2+30);
      const ph=await charge('/'+noms[i]);
      const re=await charge('/rendus/'+noms[i]);
      if(ph) g.drawImage(ph,x+2,y+24,CELL-4,H-4);
      if(re) g.drawImage(re,x+2,y+H+24,CELL-4,H-4);
      g.fillStyle='#EAE4D8'; g.font='600 15px monospace'; g.textAlign='left';
      g.fillText(noms[i].replace('.jpg',''),x+6,y+16);
      g.fillStyle='#F2B33D'; g.font='600 12px monospace';
      g.fillText('photo',x+8,y+40);
      g.fillText('3D',x+8,y+H+40);
    }
    return c.toDataURL('image/jpeg',0.84);
  },[noms,300,Math.min(5,noms.length)]);
  fs.writeFileSync(path.join(DOSSIER,'comparaison.jpg'),Buffer.from(data.split(',')[1],'base64'));
  await nav2.close(); s2.close();
  console.log('planche : '+path.join(DOSSIER,'comparaison.jpg'));
  console.log('\nmesure des teintes : node outils/relever_photos.js '+RENDUS);
})();
