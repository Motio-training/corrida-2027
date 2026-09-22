/* À quoi ressemble le chien, et se comporte-t-il comme demandé ?

   Deux moitiés. La première est visuelle : je ne vois pas la 3D bouger, et
   un quadrupède mal articulé ne se corrige qu'en le regardant. On fixe la
   pose, on rend des vues rapprochées sous plusieurs angles, et on juge sur
   l'image. La seconde est mesurée : on lance la visite guidée, on change
   d'allure, et on relève la distance à laquelle le chien se tient — elle
   doit croître avec la vitesse du coureur, et tomber au talon à l'arrêt.

   Usage : node outils/essai_chien.js [--vues] [--suite]                   */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path'), http=require('http');
const RACINE=path.resolve(__dirname,'..');
const ARG=process.argv.slice(2);
const SORTIE=process.env.SORTIE_CHIEN||'/tmp/chien';
const TYPES={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png',
  '.hdr':'application/octet-stream','.fbx':'application/octet-stream','.bin':'application/octet-stream',
  '.gltf':'model/gltf+json','.geojson':'application/json','.gpx':'application/xml'};
let faux=0;
const dit=(ok,t)=>{ if(!ok) faux++; console.log((ok?'  ok   ':'  FAUX ')+t); };

(async()=>{
  fs.mkdirSync(SORTIE,{recursive:true});
  const srv=http.createServer((rq,rs)=>{
    let u=decodeURIComponent(rq.url.split('?')[0]);
    if(u.endsWith('/')) u+='index.html';
    const f=path.join(RACINE,u);
    if(!f.startsWith(RACINE)){ rs.writeHead(403); rs.end(); return; }
    fs.readFile(f,(e,d)=>{ if(e){ rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200,{'Content-Type':TYPES[path.extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
      rs.end(d); });
  });
  await new Promise(ok=>srv.listen(0,ok));
  const nav=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader',
    '--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const ctx=await nav.newContext({viewport:{width:960,height:640}});
  const page=await ctx.newPage();
  const soucis=[];
  page.on('pageerror',e=>soucis.push('page: '+e.message));
  page.on('console',m=>{ const t=m.text();
    if(m.type()==='error' && !/Failed to load resource|ERR_(TUNNEL|CERT|NAME|INTERNET)/.test(t))
      soucis.push('console: '+t.slice(0,160)); });
  console.log('=== le chien ===');
  await page.goto('http://localhost:'+srv.address().port+'/',{waitUntil:'domcontentloaded',timeout:240000});
  await page.waitForSelector('#b-3d',{timeout:120000});
  await page.click('#b-3d');
  let pret=false;
  for(let i=0;i<200;i++){
    await page.waitForTimeout(2000);
    pret=await page.evaluate(()=>!!(window.ESPACE3D&&window.ESPACE3D.construit&&window.ESPACE3D.construit()));
    if(pret) break;
  }
  dit(pret,'le monde est construit');
  if(!pret){ await nav.close(); srv.close(); process.exit(1); }
  const etat=()=>page.evaluate(()=>window.ESPACE3D.etat());
  let e=await etat();
  dit(!!(e.chien && e.chien.pose),'le chien est posé dans le monde');

  /* ---- les vues ---- */
  const oeil=async(nom,vers,dist,haut,champ,pose)=>{
    const r=await page.evaluate(({vers,dist,haut,champ,pose})=>{
      const d=window.ESPACE3D.chienEssai(pose);
      if(!d) return null;
      const a=vers*Math.PI/180;
      const cx=d.xz[0]+Math.sin(a)*dist, cz=d.xz[1]-Math.cos(a)*dist;
      /* viser le chien : az tel que (sin az, -cos az) pointe vers lui */
      const vx=d.xz[0]-cx, vz=d.xz[1]-cz;
      const az=Math.atan2(vx,-vz)*180/Math.PI;
      const cy=d.y+haut, el=Math.atan2((d.y+0.45)-cy, Math.hypot(vx,vz))*180/Math.PI;
      const c=window.ESPACE3D.clicheLibre({x:cx,z:cz,y:cy,az:az,el:el,champ:champ},0.9);
      return c?c.image:null;
    },{vers,dist,haut,champ,pose});
    if(!r) return false;
    fs.writeFileSync(path.join(SORTIE,nom+'.jpg'), Buffer.from(r.split(',')[1],'base64'));
    return true;
  };
  const base=await page.evaluate(()=>{ const s=window.ESPACE3D.etat();
    return {x:s.joueur[0]+14, z:s.joueur[1]-6}; });
  const pose=q=>Object.assign({x:base.x,z:base.z,cap:0,v:3.4,phase:q,mode:'suit',d:4},{});
  let n=0;
  for(const [nom,vers,dist,haut,champ,ph] of [
      /* le chien vise l'est (cap 0) : la caméra au nord ou au sud en donne
         le profil, à l'est la face, à l'ouest l'arrière */
      ['profil',         0, 2.4, 0.45, 42, 0.8],
      ['trois-quarts',  45, 2.3, 0.60, 42, 2.0],
      ['face',          90, 2.0, 0.50, 42, 0.0],
      ['arriere',      270, 2.2, 0.60, 42, 1.4],
      ['tete',          60, 1.0, 0.62, 30, 0.4],
      ['dessus',        20, 2.0, 1.70, 45, 0.8]]){
    if(await oeil(nom,vers,dist,haut,champ,pose(ph))) n++;
  }
  /* la charge et la morsure, gueule ouverte */
  if(await oeil('charge',35,1.8,0.85,38,{x:base.x,z:base.z,cap:0,v:8,phase:1.1,mode:'charge',d:2,oreille:1})) n++;
  if(await oeil('morsure',30,1.3,0.95,34,{x:base.x,z:base.z,cap:0,v:9,phase:0.6,mode:'mord',d:1.2,tMode:0.1,oreille:1})) n++;
  if(await oeil('galop',90,3.0,0.70,42,{x:base.x,z:base.z,cap:0,v:8.5,phase:1.9,mode:'suit',d:8})) n++;
  dit(n>=9,n+' vues rendues dans '+SORTIE);

  /* ---- le comportement ---- */
  if(ARG.includes('--suite')){
    await page.evaluate(()=>{
      const d=document.getElementById('e3-detail'); if(d && /Détails/.test(d.textContent)) d.click();
      const c=document.getElementById('e3-dist'); if(c){ c.value=c.min||60; c.dispatchEvent(new Event('input',{bubbles:true})); }
    });
    await page.waitForTimeout(4000);
    const TEMPS=()=>etat().then(s=>s.temps);
    const attendre=async(sec,cap)=>{ const t0=await TEMPS(), m=Date.now();
      while((await TEMPS())-t0<sec){ if(Date.now()-m>(cap||300)*1000) break; await page.waitForTimeout(150); } };
    console.log('\n--- la distance selon l’allure ---');
    const mesure=async(kmh)=>{
      await page.evaluate(v=>{ const c=document.getElementById('e3-vitesse');
        c.value=v; c.dispatchEvent(new Event('input',{bubbles:true})); },kmh);
      await attendre(14);
      const s=await etat();
      return {d:s.chien.d, v:s.chien.v, mode:s.chien.mode};
    };
    if(!(await etat()).auto) await page.evaluate(()=>document.getElementById('e3-auto').click());
    await attendre(3);
    const lent=await mesure(6), moyen=await mesure(13), vite=await mesure(25);
    console.log('   marche 6 km/h  : chien à '+lent.d.toFixed(1)+' m, '+lent.v.toFixed(1)+' m/s');
    console.log('   course 13 km/h : chien à '+moyen.d.toFixed(1)+' m, '+moyen.v.toFixed(1)+' m/s');
    console.log('   25 km/h        : chien à '+vite.d.toFixed(1)+' m, '+vite.v.toFixed(1)+' m/s');
    dit(moyen.d>lent.d+1.5,'plus on va vite, plus il est loin');
    dit(vite.d>moyen.d+1.5,'et cela continue à 25 km/h');
    /* à l'arrêt il doit venir au talon */
    await page.evaluate(()=>document.getElementById('e3-auto').click());
    await attendre(10);
    const arret=await etat();
    console.log('   à l’arrêt      : chien à '+arret.chien.d.toFixed(1)+' m ('+arret.chien.mode+')');
    dit(arret.chien.d<3.2,'à l’arrêt il vient au talon');
  }

  if(soucis.length){ faux++; console.log('\nPROBLÈMES :\n  '+soucis.slice(0,6).join('\n  ')); }
  else console.log('\naucune erreur de page');
  console.log(faux?('\n=== '+faux+' point(s) en défaut ==='):'\n=== le chien est là ===');
  await nav.close(); srv.close();
  process.exit(faux?1:0);
})();
