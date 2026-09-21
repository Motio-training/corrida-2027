/* La caméra au gyroscope fait-elle ce qu'elle annonce ?

   Je n'ai pas de téléphone à tourner : on en simule un. Le banc ouvre la
   vraie page dans un contexte tactile, allume l'option, puis envoie des
   événements « deviceorientation » comme le ferait un appareil qu'on tourne
   — et mesure ce que la caméra en fait.

   Quatre choses à prouver :
     1. l'appareil tourne de 40°, la caméra aussi, et dans le bon sens ;
     2. écran en paysage, le même mouvement donne le même résultat — c'est
        là que la naïveté (lire alpha seul) échoue ;
     3. une dérive lente est ignorée, et n'empêche pas la caméra de
        reprendre l'axe de course ;
     4. tout cela vaut aux deux vues.

   Usage : node outils/essai_gyro.js [--page /]                            */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path'), http=require('http');
const RACINE=path.resolve(__dirname,'..');
const ARG=process.argv.slice(2);
const opt=(n,d)=>{ const i=ARG.indexOf('--'+n); return i<0?d:ARG[i+1]; };
const PAGE=opt('page','/');
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
  const base='http://localhost:'+srv.address().port+(PAGE==='village'?'/village/':'/');
  const nav=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader',
    '--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const ctx=await nav.newContext({viewport:{width:380,height:720}, hasTouch:true, isMobile:true, deviceScaleFactor:1});
  const page=await ctx.newPage();
  /* un écran que l'on peut dire tourné : l'angle est en lecture seule */
  await page.addInitScript(()=>{
    window.__angleEcran=0;
    try{
      Object.defineProperty(screen.orientation,'angle',{get:()=>window.__angleEcran, configurable:true});
    }catch(e){ window.orientation=0; }
  });
  const soucis=[];
  page.on('pageerror',e=>soucis.push('page: '+e.message));
  page.on('console',m=>{ const t=m.text();
    if(m.type()==='error' && !/Failed to load resource|ERR_(TUNNEL|CERT|NAME|INTERNET)/.test(t))
      soucis.push('console: '+t.slice(0,160)); });
  console.log('=== caméra au gyroscope — '+base+' ===');
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:240000});
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
    const c=document.getElementById('e3-dist');
    if(c){ c.value=c.min||60; c.dispatchEvent(new Event('input',{bubbles:true})); }
  });
  await page.waitForTimeout(5000);

  const etat=()=>page.evaluate(()=>window.ESPACE3D.etat());
  /* envoyer une attitude d'appareil */
  const poser=(a,b,g)=>page.evaluate(({a,b,g})=>{
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha:a,beta:b,gamma:g}));
  },{a,b,g});
  /* un mouvement continu : n pas, en temps réel */
  async function tourner(de,vers,beta,gamma,pas,msParPas){
    for(let i=0;i<=pas;i++){
      await poser(de+(vers-de)*i/pas, beta, gamma);
      await page.waitForTimeout(msParPas);
    }
  }

  const cad=await (async()=>{ const a=await etat(); await page.waitForTimeout(4000); const b=await etat();
    return (b.images-a.images)/4; })();
  console.log('  cadence du banc : '+cad.toFixed(1)+' image/s');
  let e=await etat();
  dit(e.gyro && e.gyro.dispo,'l’appareil est reconnu comme capable (tactile)');
  const bouton=await page.evaluate(()=>{ const b=document.getElementById('e3-gyro');
    return b?{existe:true, cache:b.hidden}:{existe:false}; });
  dit(bouton.existe && !bouton.cache,'le bouton Gyroscope est présent et visible');

  await page.evaluate(()=>document.getElementById('e3-gyro').click());
  await page.waitForTimeout(400);
  e=await etat();
  dit(e.gyro.actif,'un clic l’allume');

  for(const [vue,nom] of [['fp','première personne'],['tp','troisième personne']]){
    console.log('\n--- '+nom+' ---');
    for(let i=0;i<4;i++){
      if((await etat()).vue===vue) break;
      await page.evaluate(()=>document.getElementById('e3-vuep').click());
      await page.waitForTimeout(300);
    }
    dit((await etat()).vue===vue,'la vue est bien la '+nom);

    for(const [angle,lab,beta,gamma] of [[0,'portrait',90,0],[90,'paysage',0,-90]]){
      await page.evaluate(a=>{ window.__angleEcran=a;
        window.dispatchEvent(new Event('orientationchange'));
        try{ screen.orientation.dispatchEvent(new Event('change')); }catch(e){}
      },angle);
      /* poser l'attitude de départ et laisser le lissage s'établir */
      await poser(0,beta,gamma); await page.waitForTimeout(500);
      await poser(0,beta,gamma); await page.waitForTimeout(500);
      const av=(await etat()).axe.camera;
      /* l'appareil tourne de 40° vers la droite : alpha décroît */
      /* 40° en 1,2 s : l'allure d'un vrai geste, et assez d'images pour
         que le banc, qui rend lentement, en voie plusieurs */
      await tourner(0,-40,beta,gamma,12,100);
      await page.waitForTimeout(600);
      const ap=(await etat()).axe.camera;
      const d=ecart(ap-av);
      console.log('  '+lab+' : appareil tourné de 40° à droite → caméra '+d.toFixed(0)+'°');
      dit(d>25 && d<55,'la caméra suit l’appareil, du bon côté et de la bonne quantité ('+lab+')');
    }

    /* la dérive : 1°/s pendant 6 s, elle doit être ignorée */
    await page.evaluate(a=>{ window.__angleEcran=a;
      window.dispatchEvent(new Event('orientationchange')); },0);
    await poser(0,90,0); await page.waitForTimeout(600);
    const d0=(await etat()).axe.camera;
    for(let i=1;i<=12;i++){ await poser(-i*0.5,90,0); await page.waitForTimeout(500); }
    const d1=await etat();
    const derive=Math.abs(ecart(d1.axe.camera-d0));
    console.log('  dérive de 6° en 6 s : la caméra a bougé de '+derive.toFixed(1)+'° (seuil '+d1.gyro.seuil+' °/s)');
    dit(derive<4,'une dérive lente ne bouge pas la caméra');
    dit(d1.axe.libre<1,'et n’empêche pas le compte à rebours de descendre');
  }

  if(soucis.length){ faux++; console.log('\nPROBLÈMES :\n  '+soucis.slice(0,6).join('\n  ')); }
  else console.log('\naucune erreur de page');
  console.log(faux ? ('\n=== '+faux+' point(s) en défaut ===') : '\n=== la caméra suit le téléphone ===');
  await nav.close(); srv.close();
  process.exit(faux?1:0);
})();
