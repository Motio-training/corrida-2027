/* Une mélodie, depuis un enregistrement.

   Je n'entends pas les fichiers qu'on m'envoie : je peux en revanche les
   mesurer. Le navigateur décode l'audio, on suit la hauteur image par image
   par autocorrélation, on découpe en notes là où la hauteur change ou le son
   s'interrompt, et on quantifie sur une grille de doubles croches. Il en sort
   la partition au format du lecteur — « NOTE/durée » — prête à coller dans
   actifs/musique.js.

   Ça marche sur un chant a cappella, un sifflement, un clavier ou une
   trompette : une voix à la fois. Sur un enregistrement de chœur avec
   accompagnement, la basse et les harmoniques brouillent la piste et il faut
   relire la sortie plutôt que la croire.

   Usage :
     node outils/melodie_depuis_audio.js chant.m4a [--tempo 112]
          [--min-note 0.09] [--seuil 0.02] [--transposer 0] [--sortie part.txt]

   Sans --tempo, il est estimé sur les durées de notes ; le résultat s'en
   ressent, donc autant le donner quand on le connaît.                      */

const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path'), http=require('http');
const RACINE=path.resolve(__dirname,'..');
const ARG=process.argv.slice(2);
function opt(n,d){ const i=ARG.indexOf('--'+n); return i<0?d:ARG[i+1]; }
const FICHIER=ARG.find(a=>!a.startsWith('--'));
/* --essai : pas de fichier, on rend la voix de chant du lecteur et on
   vérifie qu'on la retrouve note pour note */
const ESSAI=ARG.includes('--essai')?+opt('essai-secondes',-1):0;
if(!ESSAI && (!FICHIER || !fs.existsSync(FICHIER))){
  console.error('usage : node outils/melodie_depuis_audio.js <enregistrement> [--tempo 112]');
  console.error('   ou : node outils/melodie_depuis_audio.js --essai   (auto-contrôle)');
  process.exit(1);
}
const TEMPO=opt('tempo')?+opt('tempo'):null;
const MIN_NOTE=+opt('min-note',0.09);
const SEUIL=+opt('seuil',0.02);
const TRANSPOSER=+opt('transposer',0);
const SORTIE=opt('sortie');

const NOMS=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const nomDe=midi=>NOMS[((midi%12)+12)%12]+(Math.floor(midi/12)-1);

(async()=>{
  const srv=http.createServer((rq,rs)=>{
    const u=decodeURIComponent(rq.url.split('?')[0]);
    if(u==='/'){ rs.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      rs.end('<!doctype html><meta charset=utf-8><title>mélodie</title>'); return; }
    if(u==='/son' && FICHIER){ rs.writeHead(200,{'Content-Type':'application/octet-stream'});
      rs.end(fs.readFileSync(FICHIER)); return; }
    if(u==='/actifs/musique.js'){ rs.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
      rs.end(fs.readFileSync(path.join(RACINE,'actifs','musique.js'))); return; }
    rs.writeHead(404); rs.end();
  });
  await new Promise(ok=>srv.listen(0,ok));
  const base='http://localhost:'+srv.address().port;
  const nav=await chromium.launch();
  const page=await (await nav.newContext({viewport:{width:200,height:200}})).newPage();
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  if(ESSAI) await page.addScriptTag({url:base+'/actifs/musique.js'});

  const R=await page.evaluate(async o=>{
    const {url, minNote, seuil}=o;
    let sr, n, d, attendu=null;
    if(o.essai!==0){
      /* auto-contrôle : on rend la voix de chant du lecteur et on se
         demande si on la retrouve. La partition est connue, donc la
         réponse aussi — c'est le seul moyen d'éprouver l'extracteur sans
         disposer d'un enregistrement dont on connaîtrait les notes. */
      sr=44100;
      /* exactement une boucle : couper à dix-sept secondes rondes laisserait
         la dernière note à cheval, entendue mais non comptée, et l'auto-
         contrôle échouerait sur une faute qui n'en est pas une */
      const P0=MUSIQUE.partition();
      const sec=(o.essai>0)?o.essai:P0.longueur*P0.pasSec;
      const octx=new OfflineAudioContext(1,Math.ceil(sr*sec),sr);
      MUSIQUE.planifier(octx,octx.destination,0,0,sec,{lead:1});
      const b=await octx.startRendering();
      d=b.getChannelData(0); n=d.length;
      const P=MUSIQUE.partition();
      attendu=P.lead.filter(x=>(x.pas+x.duree)*P.pasSec<=sec+1e-6).map(x=>x.note);
    } else {
      const buf=await (await fetch(url)).arrayBuffer();
      const C=window.AudioContext||window.webkitAudioContext;
      const ctx=new C();
      let audio;
      try{ audio=await ctx.decodeAudioData(buf); }
      catch(e){ return {erreur:'format audio non décodé : '+(e&&e.message||e)}; }
      sr=audio.sampleRate;
      n=audio.length; d=new Float32Array(n);
      for(let c=0;c<audio.numberOfChannels;c++){
        const v=audio.getChannelData(c);
        for(let i=0;i<n;i++) d[i]+=v[i]/audio.numberOfChannels;
      }
    }
    const FEN=Math.round(sr*0.046), SAUT=Math.round(sr*0.0116);
    const lagMin=Math.floor(sr/1200), lagMax=Math.floor(sr/70);
    const trames=[];
    for(let i0=0; i0+FEN<n; i0+=SAUT){
      let moy=0;
      for(let i=i0;i<i0+FEN;i++) moy+=d[i];
      moy/=FEN;
      let e=0;
      for(let i=i0;i<i0+FEN;i++){ const v=d[i]-moy; e+=v*v; }
      const rms=Math.sqrt(e/FEN);
      if(rms<seuil){ trames.push({t:i0/sr, f:0, rms:rms, clarte:0}); continue; }
      let best=-1, bl=0, hautLag=lagMax;
      const r=new Float64Array(lagMax+2);
      for(let lag=lagMin; lag<=lagMax && i0+FEN+lag<n; lag++){
        let s=0;
        for(let i=i0;i<i0+FEN;i++) s+=(d[i]-moy)*(d[i+lag]-moy);
        r[lag]=s;
        if(s>best){ best=s; bl=lag; }
        hautLag=lag;
      }
      const clarte=best/(e||1);
      if(!bl || clarte<0.42){ trames.push({t:i0/sr, f:0, rms:rms, clarte:clarte}); continue; }
      /* L'erreur d'octave est la faute classique de l'autocorrélation : le
         décalage d'une période double corrèle presque aussi bien que celui
         d'une période, et parfois mieux. Le premier jet la faisait à chaque
         attaque de note et rendait soixante-dix-sept notes là où il y en a
         quarante-deux, farcies de graves inventés. On reprend donc le plus
         petit décalage qui atteint 88 % du maximum, et non le maximum. */
      for(let lag=lagMin+1; lag<bl; lag++){
        if(r[lag]>=0.88*best && r[lag]>=r[lag-1] && r[lag]>=r[lag+1]){ bl=lag; break; }
      }
      const a=r[bl-1]||0, b=r[bl], c2=r[bl+1]||0, den=(a-2*b+c2);
      const dl=den?0.5*(a-c2)/den:0;
      trames.push({t:i0/sr, f:sr/(bl+dl), rms:rms, clarte:clarte});
    }
    /* médiane glissante sur cinq trames : elle enlève les sauts d'octave
       isolés, qui sont la faute la plus fréquente de l'autocorrélation */
    const midi=trames.map(x=>x.f>0?69+12*Math.log2(x.f/440):null);
    const liss=midi.map((_,i)=>{
      const f=midi.slice(Math.max(0,i-2),i+3).filter(v=>v!==null);
      if(f.length<2) return midi[i];
      f.sort((a,b)=>a-b);
      return f[f.length>>1];
    });
    /* Découpage en notes : même demi-ton, sans trou — et une attaque coupe.

       Sans ce dernier point, deux notes identiques qui se suivent n'en font
       qu'une : « G4/2 G4/2 » ressortait en « G4/4 ». Une attaque se voit à
       l'énergie, qui remonte franchement après avoir creusé. On coupe donc
       quand le niveau dépasse de moitié le creux des trois trames
       précédentes, à condition d'être déjà à quatre trames dans la note. */
    const notes=[];
    let cour=null;
    for(let i=0;i<liss.length;i++){
      const m=liss[i];
      const dt=trames[i].t;
      if(m===null||m===undefined){ if(cour){ cour.fin=dt; notes.push(cour); cour=null; } continue; }
      const demi=Math.round(m);
      if(cour && cour.n>=4 && i>=3){
        const creux=Math.min(trames[i-1].rms,trames[i-2].rms,trames[i-3].rms);
        if(trames[i].rms>creux*1.5 && trames[i].rms>seuil*1.6){
          cour.fin=dt; notes.push(cour);
          cour={demi:demi, debut:dt, fin:dt, somme:0, n:1, n2:0};
          continue;
        }
      }
      /* on laisse passer l'attaque : les deux premières trames d'une note
         portent le transitoire, pas encore la hauteur */
      if(cour && Math.abs(demi-cour.demi)<0.5){ cour.fin=dt; if(cour.n>=2){ cour.somme+=m; cour.n2=(cour.n2||0)+1; } cour.n++; }
      else { if(cour){ cour.fin=dt; notes.push(cour); } cour={demi:demi, debut:dt, fin:dt, somme:0, n:1, n2:0}; }
    }
    if(cour){ cour.fin=trames[trames.length-1].t; notes.push(cour); }
    const gardees=notes.filter(x=>x.fin-x.debut>=minNote && x.n2>0).map(x=>({
      midi:x.demi, moyen:x.somme/x.n2, debut:+x.debut.toFixed(3), duree:+(x.fin-x.debut).toFixed(3),
      trames:x.n, cents:Math.round((x.somme/x.n2-x.demi)*100)
    }));
    return {duree:+(n/sr).toFixed(2), sr:sr, trames:trames.length, notes:gardees, attendu:attendu};
  },{url:base+'/son', minNote:MIN_NOTE, seuil:SEUIL, essai:ESSAI});

  await nav.close(); srv.close();
  if(R.erreur){ console.error(R.erreur); process.exit(1); }
  if(!R.notes.length){ console.error('aucune note trouvée : essayer --seuil plus bas, ou un enregistrement plus net'); process.exit(1); }

  console.log((ESSAI?'voix de chant du lecteur':path.basename(FICHIER))+
              ' : '+R.duree+' s, '+R.sr+' Hz, '+R.notes.length+' notes');
  const just=R.notes.map(x=>Math.abs(x.cents)).sort((a,b)=>a-b);
  console.log('écart médian à la note juste : '+just[just.length>>1]+' cents'+
              (just[just.length>>1]>35?'   ⚠ chanté loin du tempérament, la transcription sera approximative':''));

  /* tempo : sans indication, on prend la plus courte durée fréquente comme
     double croche — grossier, mais ça place les notes sur une grille */
  let tempo=TEMPO;
  if(!tempo){
    const d=R.notes.map(x=>x.duree).sort((a,b)=>a-b);
    const court=d[Math.floor(d.length*0.15)];
    tempo=Math.round(60/(court*4));
    tempo=Math.max(60,Math.min(200,tempo));
    console.log('tempo estimé : '+tempo+' à la noire (donner --tempo si on le connaît)');
  }
  const pas=60/tempo/4;
  /* Un silence d'un seul pas entre deux notes n'est pas un silence : c'est
     la chute du son qui passe sous le seuil avant la fin de la note. On le
     rend à la note qui précède, sinon la partition est criblée de « -/1 ». */
  const jetons=[];
  let fin=R.notes[0].debut, dernier=-1;
  for(const x of R.notes){
    let silence=Math.round((x.debut-fin)/pas);
    let d=Math.max(1,Math.round(x.duree/pas));
    if(silence===1 && dernier>=0){ const m=/^(.+)\/(\d+)$/.exec(jetons[dernier]);
      jetons[dernier]=m[1]+'/'+(+m[2]+1); silence=0; }
    if(silence>0) jetons.push('-/'+silence);
    jetons.push(nomDe(x.midi+TRANSPOSER)+'/'+d);
    dernier=jetons.length-1;
    fin=x.debut+x.duree;
  }
  const partition=jetons.join(' ');
  console.log('');
  console.log('--- à coller dans actifs/musique.js ---');
  console.log("    lead:'"+partition.replace(/(.{88}\S*)\s/g,"$1 '+\n         '")+"',");
  if(SORTIE){ fs.writeFileSync(SORTIE,partition+'\n'); console.log('\nécrit dans '+SORTIE); }

  if(R.attendu){
    const trouve=jetons.filter(t=>t.charAt(0)!=='-').map(t=>t.split('/')[0]);
    const att=R.attendu;
    let bons=0;
    for(let i=0;i<Math.min(att.length,trouve.length);i++) if(att[i]===trouve[i]) bons++;
    console.log('');
    console.log('auto-contrôle : '+att.length+' notes écrites, '+trouve.length+' retrouvées, '+
                bons+' à la bonne place');
    if(att.length!==trouve.length || bons!==att.length){
      const n=Math.max(att.length,trouve.length);
      for(let i=0;i<n && i<60;i++) if(att[i]!==trouve[i])
        console.log('   rang '+i+' : écrit '+(att[i]||'—')+', retrouvé '+(trouve[i]||'—'));
      console.log('=== la mélodie retrouvée ne correspond pas ===');
      process.exit(1);
    }
    console.log('=== la mélodie est retrouvée note pour note ===');
  }
})();
