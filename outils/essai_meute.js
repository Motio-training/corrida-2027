/* La meute : les spitz qu'on promène, ceux qui suivent, celui qu'on vole.

   Ce qui a été demandé, et ce que le banc vérifie :
     - toutes les laisses dans la main droite, les chiens à côté du coureur
       ou un peu devant quand il avance, et qui changent de place entre
       eux (ils se croisent) ;
     - à l'arrêt, des chiens qui s'occupent : assis, à renifler, à flâner,
       à tourner sur eux-mêmes ;
     - le bouton des chiens dans « Afficher », seulement quand on en a ;
     - un spitz posé, touché, suit sans laisse ; touché encore, il gagne le
       trottoir le plus proche ;
     - toucher un passant qui promène un spitz ouvre « Voler son chien ».
   Les touchers sont de vrais touchers d'écran, au format téléphone.
   La pose assise, elle, se juge à l'œil : --vues en écrit les images.

   Usage : node outils/essai_meute.js [--vues]   (SORTIE_MEUTE=/tmp/meute)   */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path'), http=require('http');
const RACINE=path.resolve(__dirname,'..');
const ARG=process.argv.slice(2);
const SORTIE=process.env.SORTIE_MEUTE||'/tmp/meute';
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
  console.log('=== la meute ===');
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
  /* toucher un point de la vue 3D, pas un bouton posé dessus : sinon, on
     avance un peu et on recommence */
  const toucherVue=async(lire)=>{
    for(let i=0;i<8;i++){
      const p=await M(lire);
      if(p && await M(p=>{ const e=document.elementFromPoint(p[0],p[1]); return !!(e && e.tagName==='CANVAS'); },p)){
        await page.touchscreen.tap(Math.round(p[0]),Math.round(p[1])); return true; }
      await auto(true); await attendre(1); await auto(false); await attendre(1.5);
    }
    return false;
  };
  const auto=on=>M(on=>{ const e=window.ESPACE3D.etat(); if(e.auto!==on) document.getElementById('e3-auto').click(); },on);
  /* les spitz arrivent avec les piétons */
  for(let i=0;i<90 && !(await M(()=>!!window.ESPACE3D.meute.poser({x:0,z:0})));i++) await page.waitForTimeout(1000);

  /* ---- la pose assise, à l'œil ---- */
  if(ARG.includes('--vues')){
    for(const [nom,assis] of [['debout',0],['assis',1]]){
      const d=await M(a=>{ const s=window.ESPACE3D.etat(); return window.ESPACE3D.meute.poser({x:s.joueur[0]+6, z:s.joueur[1]+3, assis:a}); },assis);
      for(const [cote,vers,dist,haut] of [['profil',0,1.6,0.25],['trois-quarts',50,1.5,0.45],['face',90,1.3,0.3]]){
        const a=vers*Math.PI/180, cx=d.xz[0]+Math.sin(a)*dist, cz=d.xz[1]-Math.cos(a)*dist;
        const vx=d.xz[0]-cx, vz=d.xz[1]-cz, az=Math.atan2(vx,-vz)*180/Math.PI, cy=d.y+haut;
        const img=await M(o=>{ const c=window.ESPACE3D.clicheLibre(o,0.9); return c&&c.image; },
          {x:cx,z:cz,y:cy,az:az,el:Math.atan2(d.y+0.18-cy,Math.hypot(vx,vz))*180/Math.PI,champ:40});
        if(img) fs.writeFileSync(path.join(SORTIE,'pose-'+nom+'-'+cote+'.jpg'),Buffer.from(img.split(',')[1],'base64'));
      }
    }
    await M(()=>window.ESPACE3D.meute.poser({x:-1e4,z:-1e4}));
    console.log('  vues de la pose dans '+SORTIE);
  }

  /* ---- le bouton n'existe pas tant qu'on n'a pas de chien ---- */
  let e=await M(()=>window.ESPACE3D.meute.etat());
  dit(!e.bouton || !e.bouton.visible,'sans chien, pas de bouton des spitz');
  await M(()=>{ window.ESPACE3D.meute.donner('roux'); window.ESPACE3D.meute.donner('blanc'); window.ESPACE3D.meute.donner('noir'); });
  await attendre(1);
  e=await M(()=>window.ESPACE3D.meute.etat());
  dit(e.bouton && e.bouton.visible && e.bouton.dansAfficher,'trois chiens : le bouton est dans « Afficher » ('+(e.bouton&&e.bouton.texte)+')');
  dit(e.chiens.length===3,'les trois chiens sont là');

  /* ---- en course ---- */
  await auto(true);
  await attendre(2);
  const ech=[];
  for(let i=0;i<16;i++){ await attendre(0.6); ech.push(await M(()=>window.ESPACE3D.meute.etat())); }
  await photo('course');
  const pts=ech.flatMap(s=>s.chiens);
  const aDroite=pts.filter(c=>c.droite>0.2).length/pts.length;
  const placés=pts.filter(c=>c.devant>-0.5 && c.devant<1.9).length/pts.length;
  console.log('   vitesse du coureur '+(ech[ech.length-1].vCoureur*3.6).toFixed(1)+' km/h ; devant '+
    Math.min(...pts.map(c=>c.devant)).toFixed(2)+' à '+Math.max(...pts.map(c=>c.devant)).toFixed(2)+' m, à droite '+
    Math.min(...pts.map(c=>c.droite)).toFixed(2)+' à '+Math.max(...pts.map(c=>c.droite)).toFixed(2)+' m');
  dit(aDroite>=0.95,'en marche, les chiens restent du côté de la main droite ('+Math.round(aDroite*100)+' %)');
  dit(placés>=0.9,'à côté du coureur ou un peu devant ('+Math.round(placés*100)+' %)');
  /* se croiser : l'ordre de gauche à droite change en route */
  const ordre=s=>s.chiens.map((c,i)=>[c.droite,i]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join('');
  let croisements=0; for(let i=1;i<ech.length;i++) if(ordre(ech[i])!==ordre(ech[i-1])) croisements++;
  dit(croisements>=1,'ils changent de place entre eux ('+croisements+' fois en 10 s)');
  dit(pts.every(c=>c.v>0.5),'aucun ne reste planté pendant la course');

  /* ---- à l'arrêt ---- */
  await auto(false);
  const vus=new Set(); let assis=0;
  for(let i=0;i<24;i++){ await attendre(0.75); const s=await M(()=>window.ESPACE3D.meute.etat());
    s.chiens.forEach(c=>{ vus.add(c.comp); if(c.assis>0.9) assis++; }); if(i===10) await photo('arret'); }
  await photo('arret-2');
  console.log('   occupations vues : '+[...vus].join(', '));
  dit(assis>0,'à l’arrêt, des chiens s’assoient');
  dit(vus.size>=3,'et s’occupent de plusieurs façons');

  /* ---- le bouton rentre et ressort les chiens ---- */
  await M(()=>document.getElementById('e3-meute').click());
  await attendre(0.5);
  e=await M(()=>window.ESPACE3D.meute.etat());
  dit(e.chiens.length===0 && /chenil/.test(e.bouton.texte),'« Afficher » → les chiens rentrent au chenil');
  await M(()=>document.getElementById('e3-meute').click());
  await attendre(0.5);
  e=await M(()=>window.ESPACE3D.meute.etat());
  dit(e.chiens.length===3,'et reviennent');

  /* ---- voler le chien d'un passant ---- */
  let pp=null;
  for(let i=0;i<15 && !pp;i++){
    if(await M(()=>window.ESPACE3D.meute.chienAuPieton())){ await attendre(0.3); pp=await M(()=>window.ESPACE3D.meute.pietonAvecChien()); }
    if(!pp){ await auto(true); await attendre(2); await auto(false); await attendre(0.5); }
  }
  dit(!!pp,'un passant promène un spitz à l’écran');
  if(pp){
    const avant=(await M(()=>window.ESPACE3D.meute.etat())).chiens.length;
    pp=await M(()=>window.ESPACE3D.meute.pietonAvecChien());
    await page.touchscreen.tap(Math.round(pp.x),Math.round(pp.y));
    await attendre(0.4);
    const panneau=await M(()=>{ const p=document.getElementById('e3-vol'); return p && !p.hidden ? p.textContent : null; });
    dit(!!panneau && /Voler son chien/.test(panneau),'le toucher ouvre « Voler son chien »');
    await photo('vol-panneau');
    if(panneau){
      await M(()=>document.querySelector('#e3-vol button[data-a="voler"]').click());
      await attendre(0.3);
      let apres=await M(()=>window.ESPACE3D.meute.etat());
      dit(apres.chiens.length===avant+1,'le chien volé rejoint la meute ('+avant+' → '+apres.chiens.length+')');
      dit(apres.chiens.some(c=>c.rejoint),'il accourt depuis là où il était, sans téléportation');
      await attendre(8);
      apres=await M(()=>window.ESPACE3D.meute.etat());
      dit(apres.chiens.every(c=>!c.rejoint),'il est arrivé, la laisse à la main');
      await photo('vol-apres');
    }
  }

  /* ---- un spitz posé, touché, suit ; touché encore, va au trottoir ---- */
  await M(()=>{ const s=window.ESPACE3D.etat(), a=s.cap*Math.PI/180;
    /* devant la caméra, à 3 m du coureur */
    const f=[Math.sin(a),-Math.cos(a)]; return window.ESPACE3D.meute.poserSpitz(s.joueur[0]+f[0]*3.5,s.joueur[1]+f[1]*3.5,0); });
  for(let i=0;i<20 && !(await M(()=>window.ESPACE3D.meute.ecranSpitzPose()));i++) await attendre(0.5);
  if(await toucherVue(()=>window.ESPACE3D.meute.ecranSpitzPose())) await attendre(0.6);
  let sv=await M(()=>window.ESPACE3D.meute.suiveur());
  dit(!!sv && /suit/.test(sv.etat),'toucher un spitz posé : il suit'+(sv?' ('+sv.etat+')':''));
  await auto(true); await attendre(5); await auto(false); await attendre(2);
  sv=await M(()=>window.ESPACE3D.meute.suiveur());
  dit(!!sv && sv.dJ<4,'il a suivi le coureur'+(sv?' (à '+sv.dJ+' m)':''));
  await photo('suiveur');
  if(await toucherVue(()=>window.ESPACE3D.meute.ecranSuiveur())) await attendre(0.6);
  sv=await M(()=>window.ESPACE3D.meute.suiveur());
  dit(!!sv && (sv.etat==='va'||sv.etat==='seul'),'touché encore : il s’arrête de suivre'+(sv?' ('+sv.etat+')':''));
  await attendre(10);
  sv=await M(()=>window.ESPACE3D.meute.suiveur());
  dit(!!sv && sv.etat==='seul' && !sv.surChaussee,'il est sur le trottoir'+(sv?' ('+sv.etat+(sv.surChaussee?', sur la chaussée':'')+')':''));

  if(soucis.length){ faux++; console.log('\nPROBLÈMES :\n  '+soucis.slice(0,8).join('\n  ')); }
  else console.log('\naucune erreur de page');
  console.log('images dans '+SORTIE);
  console.log(faux?('\n=== '+faux+' point(s) en défaut ==='):'\n=== la meute fait ce qu’on lui demande ===');
  await nav.close(); srv.close();
  process.exit(faux?1:0);
})();
