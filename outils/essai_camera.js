/* La caméra reprend-elle l'axe de course, et le fait-elle sans à-coup ?

   Je ne vois pas la 3D bouger : il faut donc mesurer. Le banc ouvre la vraie
   page, attend que le monde soit construit, lance la visite automatique, et
   échantillonne l'écart entre l'axe de la caméra et le cap du coureur dix
   fois par seconde. Trois choses à prouver, aux deux vues :

     1. en visite automatique, l'écart tend vers zéro ;
     2. après un geste, il reste tel quel cinq secondes — la main a la
        priorité — puis revient à zéro ;
     3. le retour est fluide : pas de dépassement, et une accélération
        angulaire bornée, y compris quand le parcours tourne sec.

   Usage : node outils/essai_camera.js [--tactile] [--page village|/]        */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path'), http=require('http');
const RACINE=path.resolve(__dirname,'..');
const ARG=process.argv.slice(2);
const opt=(n,d)=>{ const i=ARG.indexOf('--'+n); return i<0?d:ARG[i+1]; };
const TACTILE=ARG.includes('--tactile');
const PAGE=opt('page','village');
const TYPES={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png',
  '.hdr':'application/octet-stream','.fbx':'application/octet-stream','.bin':'application/octet-stream',
  '.gltf':'model/gltf+json','.geojson':'application/json','.gpx':'application/xml'};

let faux=0;
const dit=(ok,t)=>{ if(!ok) faux++; console.log((ok?'  ok   ':'  FAUX ')+t); };
const ecart=a=>{ a=(a+180)%360; if(a<0) a+=360; return a-180; };

(async()=>{
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
  const base='http://localhost:'+srv.address().port+'/'+(PAGE==='village'?'village/':'');
  const nav=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader',
    '--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
  /* Petite fenêtre, et rendu allégé plus bas : sans carte graphique le coût
     est au pixel, et un banc à une image par seconde ne mesure plus rien. */
  const ctx=await nav.newContext(TACTILE
    ? {viewport:{width:360,height:740}, hasTouch:true, isMobile:true, deviceScaleFactor:1}
    : {viewport:{width:520,height:340}});
  const page=await ctx.newPage();
  if(TACTILE) await page.addInitScript(()=>{ window.CONSULTATION=true; });
  const soucis=[];
  page.on('pageerror',e=>soucis.push('page: '+e.message));
  /* les échecs de chargement réseau viennent du bac à sable, pas de la page :
     rien ici ne va chercher quoi que ce soit dehors */
  page.on('console',m=>{ const t=m.text();
    if(m.type()==='error' && !/Failed to load resource|ERR_(TUNNEL|CERT|NAME|INTERNET)/.test(t))
      soucis.push('console: '+t.slice(0,160)); });
  console.log('=== caméra, '+(TACTILE?'tactile (téléphone)':'souris (ordinateur)')+' — '+base+' ===');
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:240000});

  let pret=false;
  for(let i=0;i<200;i++){
    await page.waitForTimeout(2000);
    pret=await page.evaluate(()=>!!(window.ESPACE3D&&window.ESPACE3D.construit&&window.ESPACE3D.construit()));
    if(pret) break;
    if(i===2) await page.evaluate(()=>{ if(window.ESPACE3D && !document.body.classList.contains('en-3d')) window.ESPACE3D.ouvrir(); });
  }
  dit(pret,'le monde est construit');
  if(!pret){ console.log('  (abandon)'); await nav.close(); srv.close(); process.exit(1); }

  const etat=()=>page.evaluate(()=>window.ESPACE3D.etat());
  /* alléger : ombres coupées, portée réduite. Le recentrage ne dépend pas du
     décor, et la boucle passe de moins d'une image par seconde à plusieurs. */
  await page.evaluate(()=>{
    const d=document.getElementById('e3-detail'); if(d && /Détails/.test(d.textContent)) d.click();
    const c=document.getElementById('e3-dist');
    if(c){ c.value=Math.max(+c.min||60,120); c.dispatchEvent(new Event('input',{bubbles:true})); }
  });
  /* laisser retomber la poussière : basculer en rendu fluide reconstruit les
     ombres et bloque la boucle quelques secondes — mesurer la cadence pendant
     cette pause ne mesure que la pause */
  await page.waitForTimeout(5000);
  const cadence=await (async()=>{
    const a=await etat(); await page.waitForTimeout(5000); const b=await etat();
    return {img:(b.images-a.images)/5, sim:(b.temps-a.temps)/5};
  })();
  console.log('  cadence du banc : '+cadence.img.toFixed(1)+' image/s, soit '+
    (cadence.sim*100).toFixed(0)+' % du temps réel');
  dit(cadence.img>0.8,'la boucle tourne assez vite pour mesurer quelque chose');
  /* l'arrondi des virages, mesuré par le moteur lui-même à la construction */
  const V=(await etat()).virages;
  if(V){
    console.log('  virages arrondis : rayon le plus serré '+V.rayon+' m, le coureur coupe au plus '+
      V.ecart+' m ; rotation du cap à 13 km/h '+V.tauxAvant+' °/s avant, '+V.tauxApres+' °/s après');
    dit(V.rayon>=2,'le virage le plus sec garde un rayon d’au moins 2 m');
    dit(V.tauxApres<V.tauxAvant*0.75,'la rotation du cap est nettement adoucie');
    dit(V.ecart<=2.5,'le coureur ne coupe pas de plus de 2,5 m');
  } else dit(false,'le moteur rend son bilan de virages');

  /* tout ce qui suit se compte en secondes de simulation, pas de montre */
  const TEMPS=()=>etat().then(e=>e.temps);
  async function attendre(sec, cap){
    const t0=await TEMPS(), mur=Date.now();
    while((await TEMPS())-t0 < sec){
      if(Date.now()-mur > (cap||420)*1000) break;
      await page.waitForTimeout(120);
    }
  }
  const clic=id=>page.evaluate(i=>{ const b=document.getElementById(i); if(b) b.click(); },id);
  const dire=t=>console.log(t);

  /* échantillonnage : l'écart caméra/coureur, dix fois par seconde */
  async function suivre(secondes,cap){
    const pts=[]; const mur=Date.now();
    const e0=await etat(); const t0=e0.temps;
    let e=e0;
    while(e.temps-t0<secondes){
      if(e && e.axe) pts.push({t:+(e.temps-t0).toFixed(3), auto:e.auto, x:e.joueur[0], z:e.joueur[1], ...e.axe});
      /* e.axe apporte camera, coureur, ecart, taux, tangage, libre, main */
      if(Date.now()-mur > (cap||420)*1000) break;
      await page.waitForTimeout(110);
      e=await etat();
    }
    return pts;
  }
  const toast=()=>page.evaluate(()=>{ const t=document.getElementById('e3-toast'); return t&&!t.hidden?t.textContent:''; });
  function tracer(pts,pas){
    for(let i=0;i<pts.length;i+=(pas||5)){
      const p=pts[i];
      console.log('    t='+p.t.toFixed(1)+'s  écart '+String(p.ecart.toFixed(1)).padStart(7)+
        '°  libre '+p.libre.toFixed(1)+'  auto '+(p.auto?'oui':'non')+
        '  coureur '+p.x.toFixed(0)+','+p.z.toFixed(0));
    }
  }
  /* vitesse angulaire entre échantillons, en degrés par seconde */
  function vitesses(pts){
    const v=[];
    for(let i=1;i<pts.length;i++){
      const dt=pts[i].t-pts[i-1].t;
      if(dt>0.01) v.push({t:pts[i].t, w:ecart(pts[i].camera-pts[i-1].camera)/dt});
    }
    return v;
  }

  for(const vue of ['fp','tp']){
    const nom = vue==='fp' ? 'première personne' : 'troisième personne';
    console.log('\n--- '+nom+' ---');
    /* se mettre dans la vue voulue */
    for(let i=0;i<4;i++){
      const e=await etat();
      if(e && e.vue===vue) break;
      await page.evaluate(()=>{ const b=document.getElementById('e3-vuep'); if(b) b.click(); });
      await page.waitForTimeout(300);
    }
    let e=await etat();
    dit(e && e.vue===vue, 'la vue est bien la '+nom);

    /* lancer la visite automatique */
    if(!(await etat()).auto) await clic('e3-auto');
    await page.waitForTimeout(500);
    const ea=await etat();
    dit(ea.auto,'la visite automatique tourne'+(ea.auto?'':'  [message : '+(await toast())+']'));
    const p0=(await etat()).joueur;
    await attendre(1.2);
    const p1=(await etat()).joueur;
    const avance=Math.hypot(p1[0]-p0[0],p1[1]-p0[1]);
    dire('  le coureur a parcouru '+avance.toFixed(1)+' m en 1,2 s de simulation');
    dit(avance>1,'le coureur avance vraiment');

    /* 1. l'écart doit tomber à zéro tout seul */
    let pts=await suivre(9);
    const finAuto=pts.slice(-25).map(p=>Math.abs(p.ecart));
    const medFin=finAuto.slice().sort((a,b)=>a-b)[finAuto.length>>1];
    const tauxMax=Math.max(...pts.slice(-25).map(p=>Math.abs(p.taux||0)));
    dire('  suivi libre : écart médian '+medFin.toFixed(1)+'° (le coureur tourne jusqu’à '+tauxMax.toFixed(0)+' °/s)');
    dit(medFin<12,'la caméra suit l’axe de course sans qu’on y touche (< 12°)');

    /* 2. un geste : on tourne la caméra d'environ 80° */
    const avant=(await etat()).axe.camera;
    const r=await page.evaluate(()=>{ const v=document.getElementById('e3-vue').getBoundingClientRect();
      return {x:v.left+v.width*0.62, y:v.top+v.height*0.5, w:v.width}; });
    const dx = vue==='fp' ? 310 : 255;   /* ≈ 80° selon la sensibilité de la vue */
    if(TACTILE){
      await page.evaluate(({x,y,dx})=>{
        const el=document.getElementById('e3-vue');
        const cible=el.querySelector('canvas')||el;
        const env=(t,cx)=>cible.dispatchEvent(new PointerEvent(t,{pointerId:7,pointerType:'touch',
          clientX:cx, clientY:y, bubbles:true, cancelable:true, isPrimary:true}));
        env('pointerdown',x);
        for(let i=1;i<=10;i++) env('pointermove',x+dx*i/10);
        return true;
      },{x:r.x,y:r.y,dx});
    } else {
      await page.mouse.move(r.x,r.y);
      await page.mouse.down();
      for(let i=1;i<=10;i++){ await page.mouse.move(r.x+dx*i/10, r.y); await page.waitForTimeout(16); }
    }
    let pendant=await etat();
    const tourne=Math.abs(ecart(pendant.axe.camera-avant));
    dire('  geste : la caméra a tourné de '+tourne.toFixed(0)+'°, écart à l’axe '+pendant.axe.ecart.toFixed(0)+'°');
    dit(tourne>25,'le geste fait bien tourner la caméra');
    dit(pendant.axe.main===true,'tant que le doigt est posé, la caméra se sait tenue');

    /* le doigt reste posé trois secondes : rien ne doit bouger tout seul */
    await attendre(3);
    const tenu=await etat();
    dit(Math.abs(ecart(tenu.axe.camera-pendant.axe.camera))<6,
        'doigt posé et immobile : la caméra ne reprend pas la main d’elle-même');

    /* relâcher */
    if(TACTILE){
      await page.evaluate(({x,y,dx})=>{
        const el=document.getElementById('e3-vue');
        const cible=el.querySelector('canvas')||el;
        cible.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,pointerType:'touch',
          clientX:x+dx, clientY:y, bubbles:true, cancelable:true, isPrimary:true}));
      },{x:r.x,y:r.y,dx});
    } else {
      await page.mouse.up();
    }
    const lache=await etat();
    dit(lache.axe.main===false,'au relâchement, la caméra se sait libre');
    dire('  compte à rebours annoncé : '+lache.axe.libre.toFixed(1)+' s');
    dit(Math.abs(lache.axe.libre-5)<0.3,'le compte à rebours part bien de 5 s');

    /* 3. la tenue pendant 5 s, puis le retour */
    pts=await suivre(12);
    const e4=pts.filter(p=>p.t<4).map(p=>Math.abs(p.ecart));
    const garde=e4.length?e4.reduce((a,b)=>a+b,0)/e4.length:0;
    dire('  écart moyen pendant les 4 premières secondes : '+garde.toFixed(0)+'°');
    dit(garde>20,'l’angle choisi est conservé pendant l’attente');

    const t50=pts.find(p=>p.t>1 && Math.abs(p.ecart)<Math.abs(pts[0].ecart)*0.5);
    dire('  moitié du chemin reprise à t = '+(t50?t50.t.toFixed(1):'jamais')+' s');
    dit(!!t50 && t50.t>4.6 && t50.t<9,'le retour commence après les 5 s, et aboutit');

    if(vue==='fp'){ console.log('  trace du retour :'); tracer(pts,12); }
    const reste=pts.filter(p=>p.t>10).map(p=>Math.abs(p.ecart));
    const medR=reste.length?reste.sort((a,b)=>a-b)[reste.length>>1]:99;
    dire('  écart médian après retour : '+medR.toFixed(1)+'°');
    dit(medR<8,'la caméra est revenue dans l’axe');

    /* Dépassement — et il faut le mesurer proprement. L'écart change aussi
       de signe quand le coureur entre dans un virage : c'est du retard de
       poursuite, pas un dépassement. On ne regarde donc que les moments où
       le cap du coureur est stable, après la reprise. */
    const signe=Math.sign(pts[0].ecart)||1;
    const stables=[];
    for(let i=1;i<pts.length;i++){
      const dt=pts[i].t-pts[i-1].t;
      if(dt<=0.01 || pts[i].t<5) continue;
      const w=Math.abs(ecart(pts[i].coureur-pts[i-1].coureur))/dt;
      if(w<5) stables.push(pts[i]);
    }
    const depasse=stables.length?Math.max(0,...stables.map(p=>-signe*p.ecart)):0;
    dire('  dépassement de l’axe, cap du coureur stable : '+depasse.toFixed(1)+
         '° (sur '+stables.length+' points)');
    dit(depasse<10,'le retour ne dépasse pas l’axe (< 10°)');

    /* fluidité : accélération angulaire bornée, pas de saut d'image à image */
    const V=vitesses(pts.filter(p=>p.t>4.5));
    let accMax=0, wMax=0;
    for(let i=1;i<V.length;i++){
      const dt=V[i].t-V[i-1].t;
      wMax=Math.max(wMax,Math.abs(V[i].w));
      if(dt>0.01) accMax=Math.max(accMax,Math.abs(V[i].w-V[i-1].w)/dt);
    }
    dire('  vitesse angulaire maximale '+wMax.toFixed(0)+' °/s, accélération '+accMax.toFixed(0)+' °/s²');
    dit(wMax<200,'la caméra ne fouette pas (< 200 °/s)');
    dit(accMax<900,'pas d’à-coup : l’accélération reste bornée (< 900 °/s²)');

    await clic('e3-auto');
    await page.waitForTimeout(300);
  }

  if(soucis.length){ faux++; console.log('\nPROBLÈMES :\n  '+soucis.slice(0,6).join('\n  ')); }
  else console.log('\naucune erreur de page');
  console.log(faux ? ('\n=== '+faux+' point(s) en défaut ===') : '\n=== la caméra tient l’axe, en main et en douceur ===');
  await nav.close(); srv.close();
  process.exit(faux?1:0);
})();
