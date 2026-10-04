/* Les surprises de la ville : ce que le banc vérifie.
     - le code secret : sur le joystick, un tour complet dans le sens
       inverse des aiguilles d'une montre en partant du haut, puis on
       redescend tout droit ; le tour dans l'autre sens ne fait rien ;
     - le lever des couleurs au mât de la place d'armes ;
     - le char qui tourne sa tourelle vers le coureur, tire, et revient ;
     - les canards de la Sèvre qui s'envolent, le canard d'or ;
     - les six insignes cachés hors du parcours, le compteur ;
     - le record sous les trente minutes (feu d'artifice et « Jeunes Chefs ») ;
     - le spitz au dossard qui court la Corrida.
   Rien de tout cela n'apparaît dans l'aide : c'est voulu.

   Usage : node outils/essai_surprises.js   (SORTIE_SURPRISES=/tmp/surprises)   */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path'), http=require('http');
const RACINE=path.resolve(__dirname,'..');
const ARG=process.argv.slice(2);
const SORTIE=process.env.SORTIE_SURPRISES||'/tmp/surprises';
const TYPES={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png',
  '.hdr':'application/octet-stream','.fbx':'application/octet-stream','.bin':'application/octet-stream',
  '.glb':'model/gltf-binary','.gltf':'model/gltf+json','.geojson':'application/json','.gpx':'application/xml'};
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
    '--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
  const ctx=await nav.newContext({viewport:{width:740,height:360}, hasTouch:true, isMobile:true, deviceScaleFactor:1});
  const page=await ctx.newPage();
  await page.addInitScript(()=>{ window.CONSULTATION=true; try{ localStorage.setItem('corrida3d-accueil','1'); }catch(e){} });
  const soucis=[];
  page.on('pageerror',e=>soucis.push('page: '+e.message));
  page.on('console',m=>{ const t=m.text();
    if(m.type()==='error' && !/Failed to load resource|ERR_(TUNNEL|CERT|NAME|INTERNET)/.test(t))
      soucis.push('console: '+t.slice(0,200)); });
  console.log('=== les surprises ===');
  await page.goto('http://localhost:'+srv.address().port+'/',{waitUntil:'domcontentloaded',timeout:240000});
  let pret=false;
  for(let i=0;i<200;i++){
    await page.waitForTimeout(2000);
    pret=await page.evaluate(()=>!!(window.ESPACE3D&&window.ESPACE3D.construit&&window.ESPACE3D.construit()));
    if(pret) break;
    if(i===2) await page.evaluate(()=>{ if(window.ESPACE3D && !document.body.classList.contains('en-3d')) window.ESPACE3D.ouvrir(); });
  }
  dit(pret,'le monde est construit');
  if(!pret){ await nav.close(); srv.close(); process.exit(1); }
  await page.evaluate(()=>{
    const d=document.getElementById('e3-detail'); if(d && /Détails/.test(d.textContent)) d.click();
    const c=document.getElementById('e3-dist'); if(c){ c.value=Math.max(+c.min||60,120); c.dispatchEvent(new Event('input',{bubbles:true})); }
  });
  await page.waitForTimeout(4000);
  const M=(f,a)=>page.evaluate(f,a);
  const TEMPS=()=>M(()=>window.ESPACE3D.etat().temps);
  const attendre=async(sec,cap)=>{ const t0=await TEMPS(), m=Date.now();
    while((await TEMPS())-t0<sec){ if(Date.now()-m>(cap||300)*1000) break; await page.waitForTimeout(150); } };
  const photo=nom=>page.screenshot({path:path.join(SORTIE,nom+'.jpg'),quality:80,type:'jpeg'});
  const E=()=>M(()=>window.ESPACE3D.surprises.etat());
  /* un geste au doigt dans le coin du joystick : une suite de points
     autour du centre, en pixels (y vers le bas) */
  const geste=pts=>M(pts=>{
    const v=document.getElementById('e3-vue'), r=v.getBoundingClientRect(), cx=r.left+95, cy=r.bottom-95;
    const ev=(t,x,y)=>v.dispatchEvent(new PointerEvent(t,{pointerId:41,pointerType:'touch',isPrimary:true,bubbles:true,cancelable:true,clientX:cx+x,clientY:cy+y}));
    ev('pointerdown',0,0); pts.forEach(p=>ev('pointermove',p[0],p[1])); const d=pts[pts.length-1]; ev('pointerup',d[0],d[1]);
    return window.ESPACE3D.surprises.etat().geste;
  },pts);
  const cercle=(sens)=>{ const p=[[0,-20],[0,-45]];
    for(let k=1;k<=24;k++){ const a=Math.PI/2+sens*k/24*2*Math.PI; p.push([Math.cos(a)*50,-Math.sin(a)*50]); }
    return p; };

  /* 1. le code secret */
  await M(()=>window.ESPACE3D.surprises.parcours(400)); await attendre(1);
  let g=await geste(cercle(-1).concat([[0,60]]));
  let e=await E();
  dit(g!=='fait' && e.salut===0,'le tour dans le sens des aiguilles d\'une montre ne fait rien ('+g+')');
  g=await geste(cercle(1).concat([[0,-10],[0,20],[0,45]]));
  await attendre(1.2);
  e=await E();
  dit(g==='fait','le tour à l\'envers, puis on abaisse : le geste est reconnu');
  dit(e.salut>0.5 && e.saluent>0,'tout le monde salue ('+e.saluent+' personnes)');
  await photo('salut');

  /* 2. le lever des couleurs */
  await M(()=>window.ESPACE3D.surprises.hisser());
  e=await E(); const h0=e.drapeau;
  await attendre(5);
  e=await E();
  dit(h0!==null && e.drapeau>h0+0.3,'le drapeau monte au mât ('+h0+' → '+e.drapeau+' m)');

  /* 3. le char */
  let ch=await M(()=>window.ESPACE3D.surprises.saluerChar());
  if(!ch){ const s=await M(()=>window.ESPACE3D.etat()); const a=s.cap*Math.PI/180;
    await M(([x,z])=>window.ESPACE3D.surprises.poserChar(x,z,0),[s.joueur[0]+Math.sin(a)*14+Math.cos(a)*6,s.joueur[1]-Math.cos(a)*14+Math.sin(a)*6]);
    await attendre(1); ch=await M(()=>window.ESPACE3D.surprises.saluerChar()); }
  dit(ch,'un char à saluer');
  if(ch){
    await attendre(2.1);
    const t1=await M(()=>window.ESPACE3D.surprises.tourelle());
    dit(t1 && Math.abs(t1.applique)>0.05 && t1.tire,'la tourelle s\'est tournée et le canon a tiré');
    await attendre(5.5);
    const t2=await M(()=>window.ESPACE3D.surprises.tourelle());
    dit(t2 && Math.abs(t2.applique)<0.02,'la tourelle est revenue dans l\'axe');
  }

  /* 4. les canards */
  e=await E();
  const C=e.canards.filter(c=>c.sorte!=='or')[0], O=e.canards.filter(c=>c.sorte==='or')[0];
  dit(e.canards.length>=7 && !!O,'des canards sur la Sèvre ('+e.canards.length+'), dont un d\'or');
  if(C){
    await M(([x,z])=>window.ESPACE3D.surprises.aller(x+3,z,Math.PI),[C.x,C.z]); await attendre(1.2);
    e=await E();
    dit(e.canards.some(c=>c.etat==='vol'),'ils s\'envolent quand on approche');
  }

  /* 5. les insignes */
  await M(()=>window.ESPACE3D.surprises.oublierInsignes());
  e=await E();
  const L=e.insignes.liste;
  dit(L.length===6,'six insignes cachés');
  dit(L.every(I=>!I.dansMur && (I.ecart===null || I.ecart>=12)),'tous hors du parcours, aucun dans un mur');
  if(L[0]){
    await M(([x,z])=>window.ESPACE3D.surprises.aller(x+0.4,z,Math.PI),[L[0].x,L[0].z]); await attendre(1.2);
    e=await E();
    const chip=await M(()=>{ const c=document.getElementById('e3-insignes30'); return c ? c.textContent : ''; });
    dit(e.insignes.trouves===1 && /1\/6/.test(chip),'un insigne trouvé, le compteur l\'affiche ('+chip+')');
    await M(()=>window.ESPACE3D.surprises.oublierInsignes());
  }

  /* 6. le record */
  await M(()=>window.ESPACE3D.surprises.finCourse(25*60)); await attendre(1.5);
  e=await E();
  const rec=await M(()=>{ const x=document.querySelector('#e3-arrivee .rec30'); return x ? x.textContent : ''; });
  dit(e.feux>0 && e.musique && /Record/.test(rec),'sous les 30 minutes : feu d\'artifice et « Jeunes Chefs »');
  await M(()=>window.ESPACE3D.surprises.finCourse(40*60)); await attendre(0.5);
  const rec2=await M(()=>{ const x=document.querySelector('#e3-arrivee .rec30'); return x ? x.textContent : ''; });
  dit(!rec2,'au-delà, pas de record');

  /* 7. le spitz au dossard */
  await M(()=>window.ESPACE3D.surprises.parcours(300)); await attendre(1);
  const lance=await M(()=>window.ESPACE3D.surprises.lancerSpitz());
  e=await E(); const d0=e.spitzCoureur && e.spitzCoureur.d;
  await attendre(2);
  e=await E();
  dit(lance && e.spitzCoureur && e.spitzCoureur.d>d0+3,'un spitz au dossard court le parcours');
  await photo('spitz-coureur');

  console.log(soucis.length ? soucis.map(s=>'  ! '+s).join('\n') : '  aucune erreur dans la page');
  dit(!soucis.length,'pas d\'erreur JavaScript');
  console.log(faux ? faux+' vérification(s) en échec' : 'tout est bon');
  await nav.close(); srv.close();
  process.exit(faux?1:0);
})();
