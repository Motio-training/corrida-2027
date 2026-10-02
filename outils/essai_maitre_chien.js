/* Les épreuves du Maître chien tiennent-elles dans la ville ?

   Le Maître chien se pose n'importe où : sur un trottoir, face à une
   façade, au bord d'un carrefour. Ses épreuves doivent alors trouver leur
   place dans la 3D telle qu'elle est — pas de plot dans un mur, pas de
   coureur téléporté dans une maison, pas de haie qui flotte au-dessus d'un
   trottoir. Je ne vois pas la 3D : le banc pose le Maître chien à plusieurs
   endroits du parcours, lance chaque épreuve, mesure ce qui tombe dans un
   bâtiment et photographie la scène telle qu'on la voit au téléphone.

   Usage : node outils/essai_maitre_chien.js [--jeux balle,slalom] [--lieux 2]
           SORTIE_MC=/tmp/mc pour l'emplacement des images                    */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path'), http=require('http');
const RACINE=path.resolve(__dirname,'..');
const ARG=process.argv.slice(2);
const opt=(n,d)=>{ const i=ARG.indexOf('--'+n); return i<0?d:ARG[i+1]; };
const JEUX=opt('jeux','balle,slalom,perdu,sprint,agility').split(',');
const NLIEUX=+opt('lieux',3);
const SORTIE=process.env.SORTIE_MC||'/tmp/maitre_chien';
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
  /* téléphone à l'horizontale : c'est ainsi que les épreuves se jouent */
  const ctx=await nav.newContext({viewport:{width:740,height:360}, hasTouch:true, isMobile:true, deviceScaleFactor:1});
  const page=await ctx.newPage();
  await page.addInitScript(()=>{ window.CONSULTATION=true; try{ localStorage.setItem('corrida3d-accueil','1'); }catch(e){} });
  const soucis=[];
  page.on('pageerror',e=>soucis.push('page: '+e.message));
  page.on('console',m=>{ const t=m.text();
    if(m.type()==='error' && !/Failed to load resource|ERR_(TUNNEL|CERT|NAME|INTERNET)/.test(t))
      soucis.push('console: '+t.slice(0,200)); });
  console.log('=== les épreuves du Maître chien ===');
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
  const etat=()=>page.evaluate(()=>window.ESPACE3D.etat());
  const TEMPS=()=>etat().then(s=>s.temps);
  const attendre=async(sec,cap)=>{ const t0=await TEMPS(), m=Date.now();
    while((await TEMPS())-t0<sec){ if(Date.now()-m>(cap||240)*1000) break; await page.waitForTimeout(150); } };
  const photo=async nom=>{ await page.screenshot({path:path.join(SORTIE,nom+'.jpg'),quality:80,type:'jpeg'}); };

  /* les lieux : le long du parcours, le Maître chien sur le bord, regard
     tantôt le long de la rue, tantôt vers une façade */
  const seul=opt('lieu',null);
  let lieux=await page.evaluate(n=>window.ESPACE3D.maitreChien.lieuxEssai(n),NLIEUX);
  if(seul && lieux) lieux=[lieux[+seul-1]].filter(Boolean);
  dit(lieux && lieux.length>=1,(lieux?lieux.length:0)+' lieu(x) d’essai');
  for(let k=0;k<(lieux||[]).length;k++){
    const L=lieux[k];
    console.log('\n--- lieu '+(k+1)+' : x '+L.x.toFixed(0)+', z '+L.z.toFixed(0)+', regard '+L.cap.toFixed(0)+'° ('+L.quoi+')');
    await page.evaluate(L=>{ window.ESPACE3D.maitreChien.retirer(); window.ESPACE3D.maitreChien.poser(L.x,L.z,L.cap); },L);
    await attendre(1.5);
    for(const id of JEUX){
      const ok=await page.evaluate(id=>window.ESPACE3D.maitreChien.jouer(id),id);
      if(!ok){ dit(false,id+' : ne démarre pas'); continue; }
      await attendre(2.5);
      const b=await page.evaluate(()=>window.ESPACE3D.maitreChien.bilan());
      if(!b){ dit(false,id+' : pas de bilan (épreuve finie trop tôt ?)'); continue; }
      console.log('   '+id+' : terrain '+(b.terrain||'—')+', '+b.objets+' objets, '+b.dansMur+' dans un mur, '+
        b.enLAir+' en l’air, coureur '+(b.joueurLibre?'libre':'DANS UN MUR')+', caméra '+(b.cameraLibre?'dégagée':'DANS UN MUR'));
      if(b.fautifs && b.fautifs.length) console.log('      gênés : '+b.fautifs.slice(0,8).map(f=>'s '+f.s+' t '+f.t+' ('+f.quoi+')').join(' · ')+
        '  — bande '+(b.longueur!==null?b.longueur+' m':'—'));
      dit(b.dansMur===0,id+' : rien de l’épreuve dans un bâtiment');
      dit(b.enLAir===0,id+' : rien ne flotte ni ne s’enfonce');
      dit(b.joueurLibre,id+' : le coureur est dehors');
      await photo('lieu'+(k+1)+'-'+id);
      /* une balle lancée, des haies en course : l'épreuve en mouvement */
      if(id==='balle'){
        const bx=await page.evaluate(()=>{ const g=document.getElementById('e3-jeu-glisse'); const r=g.getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height*0.8, r.height]; });
        await page.mouse.move(bx[0],bx[1]); await page.mouse.down();
        await page.mouse.move(bx[0]+10,bx[1]-bx[2]*0.32,{steps:4}); await page.mouse.up();
        await attendre(0.7);
        const ph=await page.evaluate(()=>{ const b=window.ESPACE3D.maitreChien.bilan(); return b && b.phase; });
        dit(ph && ph!=='vise','balle : le geste lance la balle ('+ph+')');
        await photo('lieu'+(k+1)+'-'+id+'-lancer');
      }
      if(id==='agility'){ await attendre(1.2); await photo('lieu'+(k+1)+'-'+id+'-course'); }
      if(id==='sprint'){ await attendre(3); await photo('lieu'+(k+1)+'-'+id+'-course'); }
      await page.evaluate(()=>window.ESPACE3D.maitreChien.abandonner());
      await attendre(0.5);
    }
  }
  if(soucis.length){ faux++; console.log('\nPROBLÈMES :\n  '+soucis.slice(0,8).join('\n  ')); }
  else console.log('\naucune erreur de page');
  console.log('images dans '+SORTIE);
  console.log(faux?('\n=== '+faux+' point(s) en défaut ==='):'\n=== les épreuves tiennent dans la ville ===');
  await nav.close(); srv.close();
  process.exit(faux?1:0);
})();
