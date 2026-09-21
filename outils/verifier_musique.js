/* La musique joue-t-elle les bonnes notes ?

   Je n'entends rien de ce que je fabrique : il faut donc mesurer. Le lecteur
   sait planifier dans n'importe quel contexte audio, on lui en donne un hors
   ligne — un OfflineAudioContext rend le son dans un tableau au lieu de le
   jouer — et on retrouve la hauteur de chaque note par autocorrélation. Si
   une note tombe à côté, ou si le mélange sature, ça se voit ici et pas
   après coup dans le casque de quelqu'un d'autre.

   C'est le même code de planification qu'en direct : un contrôle qui
   n'écouterait pas exactement ce que la page joue ne vaudrait rien.

   Usage : node outils/verifier_musique.js [--morceau marche] [--secondes 20] */

const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path'), http=require('http');
const RACINE=path.resolve(__dirname,'..');
const ARG=process.argv.slice(2);
function opt(n,d){ const i=ARG.indexOf('--'+n); return i<0?d:ARG[i+1]; }
const MORCEAU=opt('morceau','jeuneschefs');
const SECONDES=+opt('secondes',20);

const TYPES={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8'};

(async()=>{
  const srv=http.createServer((rq,rs)=>{
    const u=decodeURIComponent(rq.url.split('?')[0]);
    if(u==='/'){ rs.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      rs.end('<!doctype html><meta charset=utf-8><title>contrôle musique</title>'); return; }
    const f=path.join(RACINE,u);
    if(!f.startsWith(RACINE)){ rs.writeHead(403); rs.end(); return; }
    fs.readFile(f,(e,d)=>{ if(e){ rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200,{'Content-Type':TYPES[path.extname(f).toLowerCase()]||'application/octet-stream'});
      rs.end(d); });
  });
  await new Promise(ok=>srv.listen(0,ok));
  const base='http://localhost:'+srv.address().port;
  const nav=await chromium.launch();
  const page=await (await nav.newContext({viewport:{width:200,height:200}})).newPage();
  const soucis=[];
  page.on('pageerror',e=>soucis.push(e.message));
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.addScriptTag({url:base+'/actifs/musique.js'});

  const R=await page.evaluate(async o=>{
    const {morceau, secondes}=o;
    if(!window.MUSIQUE) return {erreur:'MUSIQUE absent'};
    if(!MUSIQUE.choisir(morceau)) return {erreur:'morceau inconnu : '+morceau};
    const P=MUSIQUE.partition();
    const sr=44100;

    /* --- rendu hors ligne d'une voie donnée --- */
    async function rendre(voies){
      const ctx=new OfflineAudioContext(1, Math.ceil(sr*secondes), sr);
      MUSIQUE.planifier(ctx, ctx.destination, 0, 0, secondes, voies);
      const b=await ctx.startRendering();
      return b.getChannelData(0);
    }
    /* --- hauteur par autocorrélation, sur une fenêtre --- */
    function hauteur(d, i0, i1){
      const n=i1-i0;
      if(n<600) return 0;
      let moy=0;
      for(let i=i0;i<i1;i++) moy+=d[i];
      moy/=n;
      let e=0;
      for(let i=i0;i<i1;i++){ const v=d[i]-moy; e+=v*v; }
      if(e/n<1e-9) return 0;                    /* silence */
      const lagMin=Math.floor(sr/2000), lagMax=Math.min(Math.floor(sr/60), n-2);
      let best=-1, bl=0;
      const r=new Float64Array(lagMax+1);
      for(let lag=lagMin; lag<=lagMax; lag++){
        let s=0;
        for(let i=i0;i+lag<i1;i++) s+=(d[i]-moy)*(d[i+lag]-moy);
        r[lag]=s;
        if(s>best){ best=s; bl=lag; }
      }
      if(bl<=lagMin || bl>=lagMax) return sr/Math.max(1,bl);
      /* sommet affiné par parabole sur les trois points voisins */
      const a=r[bl-1], b=r[bl], c=r[bl+1], den=(a-2*b+c);
      const dl=den?0.5*(a-c)/den:0;
      return sr/(bl+dl);
    }

    const lead=await rendre({lead:1});
    const tout=await rendre({lead:1,harmonie:1,basse:1,perc:1});

    /* crête du mélange complet : au-delà de 1, le son sature */
    let crete=0, energie=0;
    for(let i=0;i<tout.length;i++){ const v=Math.abs(tout[i]); if(v>crete) crete=v; energie+=tout[i]*tout[i]; }
    const rms=Math.sqrt(energie/tout.length);

    /* chaque note du chant, mesurée au milieu de sa durée */
    const notes=[];
    for(const n of P.lead){
      const t0=n.pas*P.pasSec, dur=n.duree*P.pasSec;
      if(t0+dur>secondes) break;
      const i0=Math.floor((t0+dur*0.15)*sr), i1=Math.floor((t0+dur*0.55)*sr);
      const f=hauteur(lead,i0,i1);
      const att=MUSIQUE.frequence(n.note);
      const cents=(f>0&&att>0)?1200*Math.log2(f/att):9999;
      notes.push({note:n.note, attendu:+att.toFixed(1), mesure:+f.toFixed(1), cents:+cents.toFixed(0)});
    }
    return {titre:P.titre, tempo:P.tempo, longueur:P.longueur, pasSec:P.pasSec,
            duree:P.longueur*P.pasSec, crete:+crete.toFixed(3), rms:+rms.toFixed(4), notes:notes};
  },{morceau:MORCEAU, secondes:SECONDES});

  await nav.close(); srv.close();

  if(R.erreur){ console.error(R.erreur); process.exit(1); }
  console.log('« '+R.titre+' »   '+R.tempo+' à la noire, '+R.longueur+' pas, boucle de '+
              R.duree.toFixed(2)+' s');
  console.log('mélange : crête '+R.crete+'   efficace '+R.rms);

  let faux=0;
  const dit=(ok,texte)=>{ if(!ok) faux++; console.log((ok?'  ok   ':'  FAUX ')+texte); };
  dit(R.notes.length>0, R.notes.length+' notes de chant mesurées dans les '+SECONDES+' premières secondes');
  dit(R.rms>0.004, 'le mélange n’est pas silencieux (efficace '+R.rms+')');
  dit(R.crete<1.0, 'pas de saturation (crête '+R.crete+' < 1)');

  /* une note juste tombe à moins d'un demi-ton ; on vise bien mieux */
  const ecarts=R.notes.map(n=>Math.abs(n.cents)).sort((a,b)=>a-b);
  const med=ecarts.length?ecarts[ecarts.length>>1]:9999;
  const pires=R.notes.filter(n=>Math.abs(n.cents)>25);
  dit(med<10, 'écart médian à la note juste : '+med.toFixed(1)+' cents');
  dit(pires.length===0, (pires.length||'aucune')+' note'+(pires.length>1?'s':'')+' au-delà de 25 cents');
  if(pires.length) pires.slice(0,8).forEach(n=>console.log('        '+n.note+
    ' : attendu '+n.attendu+' Hz, mesuré '+n.mesure+' Hz  ('+n.cents+' cents)'));
  if(soucis.length) console.log('  soucis de page : '+[...new Set(soucis)].join(' | '));

  if(faux){ console.log('=== '+faux+' contrôle(s) en défaut ==='); process.exit(1); }
  console.log('=== la musique joue ce qui est écrit ===');
})();
