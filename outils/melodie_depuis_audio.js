/* Une mélodie, depuis un enregistrement.

   Je n'entends pas les fichiers qu'on m'envoie : je peux en revanche les
   mesurer. Le navigateur décode l'audio, actifs/releve_melodie.js suit la
   hauteur par autocorrélation, découpe en notes et quantifie sur une grille
   de doubles croches ; il en sort la partition au format du lecteur, prête à
   coller dans actifs/musique.js.

   Le relevé lui-même vit dans actifs/releve_melodie.js, partagé avec la page
   de saisie melodie/ : une seule copie de la partie qui décide des notes.

   Ça marche sur une voix à la fois — chant a cappella, sifflement, clavier,
   trompette. Sur un chœur avec accompagnement, la basse et les harmoniques
   brouillent la piste et il faut relire la sortie plutôt que la croire.

   Usage :
     node outils/melodie_depuis_audio.js chant.m4a [--tempo 112]
          [--min-note 0.09] [--seuil 0.02] [--transposer 0] [--sortie part.txt]
     node outils/melodie_depuis_audio.js --essai      (auto-contrôle)         */

const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path'), http=require('http');
const RACINE=path.resolve(__dirname,'..');
const ARG=process.argv.slice(2);
function opt(n,d){ const i=ARG.indexOf('--'+n); return i<0?d:ARG[i+1]; }
const FICHIER=ARG.find(a=>!a.startsWith('--'));
/* --essai : pas de fichier, on rend la voix de chant du lecteur et on
   vérifie qu'on la retrouve note pour note */
const ESSAI=ARG.includes('--essai');
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

(async()=>{
  const srv=http.createServer((rq,rs)=>{
    const u=decodeURIComponent(rq.url.split('?')[0]);
    if(u==='/'){ rs.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      rs.end('<!doctype html><meta charset=utf-8><title>mélodie</title>'); return; }
    if(u==='/son' && FICHIER){ rs.writeHead(200,{'Content-Type':'application/octet-stream'});
      rs.end(fs.readFileSync(FICHIER)); return; }
    if(/^\/actifs\/[a-z_0-9]+\.js$/.test(u)){
      const f=path.join(RACINE,u);
      if(fs.existsSync(f)){ rs.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
        rs.end(fs.readFileSync(f)); return; }
    }
    rs.writeHead(404); rs.end();
  });
  await new Promise(ok=>srv.listen(0,ok));
  const base='http://localhost:'+srv.address().port;
  const nav=await chromium.launch();
  const page=await (await nav.newContext({viewport:{width:200,height:200}})).newPage();
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.addScriptTag({url:base+'/actifs/releve_melodie.js'});
  if(ESSAI) await page.addScriptTag({url:base+'/actifs/musique.js'});

  const R=await page.evaluate(async o=>{
    let sr, d, attendu=null;
    if(o.essai){
      /* Auto-contrôle : on rend la voix de chant du lecteur et on se demande
         si on la retrouve. La partition est connue, donc la réponse aussi —
         seul moyen d'éprouver l'extracteur sans disposer d'un enregistrement
         dont on connaîtrait déjà les notes. Exactement une boucle : couper à
         dix-sept secondes rondes laisserait la dernière note à cheval,
         entendue mais non comptée. */
      sr=44100;
      const P=MUSIQUE.partition();
      const sec=P.longueur*P.pasSec;
      const octx=new OfflineAudioContext(1,Math.ceil(sr*sec),sr);
      MUSIQUE.planifier(octx,octx.destination,0,0,sec,{lead:1});
      d=(await octx.startRendering()).getChannelData(0);
      attendu=P.lead.filter(x=>(x.pas+x.duree)*P.pasSec<=sec+1e-6).map(x=>x.note);
    } else {
      const buf=await (await fetch(o.url)).arrayBuffer();
      const C=window.AudioContext||window.webkitAudioContext;
      const ctx=new C();
      let audio;
      try{ audio=await ctx.decodeAudioData(buf); }
      catch(e){ return {erreur:'format audio non décodé : '+(e&&e.message||e)}; }
      sr=audio.sampleRate;
      const n=audio.length;
      d=new Float32Array(n);
      for(let c=0;c<audio.numberOfChannels;c++){
        const v=audio.getChannelData(c);
        for(let i=0;i<n;i++) d[i]+=v[i]/audio.numberOfChannels;
      }
    }
    const A=RELEVE_MELODIE.analyser(d,sr,{seuil:o.seuil, minNote:o.minNote});
    const tempo=o.tempo||RELEVE_MELODIE.tempoEstime(A.notes);
    const P=RELEVE_MELODIE.enPartition(A.notes,tempo,{transposer:o.transposer});
    return {duree:A.duree, sr:A.sr, notes:A.notes, attendu:attendu,
            tempo:tempo, estime:!o.tempo, partition:P.texte, jetons:P.jetons};
  },{url:base+'/son', minNote:MIN_NOTE, seuil:SEUIL, essai:ESSAI,
     tempo:TEMPO, transposer:TRANSPOSER});

  await nav.close(); srv.close();
  if(R.erreur){ console.error(R.erreur); process.exit(1); }
  if(!R.notes.length){ console.error('aucune note trouvée : essayer --seuil plus bas, ou un enregistrement plus net'); process.exit(1); }

  console.log((ESSAI?'voix de chant du lecteur':path.basename(FICHIER))+
              ' : '+R.duree+' s, '+R.sr+' Hz, '+R.notes.length+' notes');
  const just=R.notes.map(x=>Math.abs(x.cents)).sort((a,b)=>a-b);
  const jm=just[just.length>>1];
  console.log('écart médian à la note juste : '+jm+' cents'+
              (jm>35?'   ⚠ chanté loin du tempérament, la transcription sera approximative':''));

  if(R.estime) console.log('tempo estimé : '+R.tempo+
    ' à la noire (donner --tempo si on le connaît)');
  const partition=R.partition, jetons=R.jetons;
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
