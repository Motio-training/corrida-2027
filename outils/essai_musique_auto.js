/* La musique part-elle avec la 3D, et se tait-elle quand on la coupe ?

   Trois choses à prouver, et la première n'est pas la plus évidente :

     1. sur la carte, rien ne joue — et pour cause, musique.js n'est même pas
        chargé avant qu'on demande la 3D ;
     2. le clic qui ouvre la 3D suffit à faire partir le son : c'est le geste
        que le navigateur attend, et le contexte audio doit finir « running »
        et non « suspended » ;
     3. qui coupe le son le retrouve coupé à la visite suivante — c'est le
        refus qui est retenu, pas l'accord.

   Le monde n'a pas besoin d'être construit : la musique part dans ouvrir(),
   bien avant. Le banc est donc rapide.

   Usage : node outils/essai_musique_auto.js                                */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path'), http=require('http');
const RACINE=path.resolve(__dirname,'..');
const TYPES={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png',
  '.hdr':'application/octet-stream','.fbx':'application/octet-stream','.bin':'application/octet-stream',
  '.gltf':'model/gltf+json','.geojson':'application/json','.gpx':'application/xml'};
let faux=0;
const dit=(ok,t)=>{ if(!ok) faux++; console.log((ok?'  ok   ':'  FAUX ')+t); };

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
  const base='http://localhost:'+srv.address().port+'/';
  /* Aucun assouplissement de la politique d'autoplay : on veut savoir si le
     clic d'ouverture suffit pour de vrai. */
  const nav=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const ctx=await nav.newContext({viewport:{width:900,height:600}});
  const page=await ctx.newPage();
  const soucis=[];
  page.on('pageerror',e=>soucis.push('page: '+e.message));
  page.on('console',m=>{ const t=m.text();
    if(m.type()==='error' && !/Failed to load resource|ERR_(TUNNEL|CERT|NAME|INTERNET)/.test(t))
      soucis.push('console: '+t.slice(0,160)); });
  console.log('=== la musique part-elle avec la 3D ? ===');

  const etatMus=()=>page.evaluate(()=>window.MUSIQUE?window.MUSIQUE.etat():null);
  async function entrer(){
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:180000});
    await page.waitForSelector('#b-3d',{timeout:120000});
    const avant=await etatMus();
    await page.click('#b-3d');                       /* vrai clic : le geste */
    for(let i=0;i<120;i++){
      await page.waitForTimeout(500);
      const e=await etatMus();
      if(e && e.enMarche) return {avant, apres:e, attente:i*0.5};
      if(e && i>40) return {avant, apres:e, attente:i*0.5};
    }
    return {avant, apres:await etatMus(), attente:60};
  }

  /* 1 & 2 : première visite, rien de retenu */
  let r=await entrer();
  dit(r.avant===null,'sur la carte, le lecteur n’est même pas chargé');
  console.log('  après le clic : contexte « '+(r.apres&&r.apres.contexte)+' », morceau « '+
    (r.apres&&r.apres.titre)+' », au bout de '+r.attente+' s');
  dit(!!(r.apres && r.apres.enMarche),'la musique part toute seule en ouvrant la 3D');
  dit(!!(r.apres && r.apres.contexte==='running'),'le contexte audio tourne vraiment (pas « suspended »)');
  dit(!!(r.apres && r.apres.voulu),'et elle est voulue par défaut');
  const bouton=await page.evaluate(()=>{ const b=document.getElementById('e3-son');
    return b?{visible:!b.hidden, allume:b.classList.contains('on')}:null; });
  dit(!!(bouton && bouton.allume),'le bouton ♪ Musique est bien en surbrillance');

  /* 3 : on coupe, et le refus doit être retenu */
  await page.evaluate(()=>document.getElementById('e3-son').click());
  await page.waitForTimeout(600);
  let e=await etatMus();
  dit(!e.enMarche && !e.voulu,'un clic coupe le son et retient le refus');

  r=await entrer();
  console.log('  visite suivante : enMarche='+(r.apres&&r.apres.enMarche)+', voulu='+(r.apres&&r.apres.voulu));
  dit(!!(r.apres && !r.apres.enMarche && !r.apres.voulu),'à la visite suivante, le son reste coupé');

  /* et on peut le rallumer, qui reste allumé */
  await page.evaluate(()=>document.getElementById('e3-son').click());
  await page.waitForTimeout(800);
  e=await etatMus();
  dit(!!(e && e.enMarche),'un clic le rallume');
  r=await entrer();
  dit(!!(r.apres && r.apres.enMarche),'et il repart tout seul à la visite d’après');

  if(soucis.length){ faux++; console.log('\nPROBLÈMES :\n  '+soucis.slice(0,6).join('\n  ')); }
  else console.log('\naucune erreur de page');
  console.log(faux ? ('\n=== '+faux+' point(s) en défaut ===') : '\n=== la musique part avec la 3D, et se tait si on le lui dit ===');
  await nav.close(); srv.close();
  process.exit(faux?1:0);
})();
