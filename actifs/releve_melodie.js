/* Relever une mélodie dans un signal audio.

   Le cœur du procédé, partagé par l'outil en ligne de commande
   (outils/melodie_depuis_audio.js) et par la page de saisie (melodie/).
   Une seule copie : c'est la troisième fois dans ce projet qu'une fonction
   dupliquée finit par diverger de son jumeau, et celle-ci décide de chaque
   note qu'on entendra.

   On suit la hauteur image par image par autocorrélation, on découpe en
   notes aux changements de demi-ton et aux attaques, puis on quantifie sur
   une grille de doubles croches au format du lecteur — « NOTE/durée ».

   window.RELEVE_MELODIE :
     analyser(d, sr, o)      → {notes, trames, duree}
     enPartition(notes, tempo, o) → {texte, jetons}
     tempoEstime(notes)      → noires par minute
     nomDe(midi)             → « C5 »                                      */
(function(){
'use strict';

var NOMS=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function nomDe(midi){ return NOMS[((midi%12)+12)%12]+(Math.floor(midi/12)-1); }

function analyser(d,sr,o){
  o=o||{};
  var seuil=(o.seuil!==undefined)?o.seuil:0.02;
  var minNote=(o.minNote!==undefined)?o.minNote:0.09;
  var n=d.length;
  var FEN=Math.round(sr*0.046), SAUT=Math.round(sr*0.0116);
  var lagMin=Math.floor(sr/1200), lagMax=Math.floor(sr/70);
  var trames=[], i0, i, lag;
  for(i0=0; i0+FEN<n; i0+=SAUT){
    var moy=0;
    for(i=i0;i<i0+FEN;i++) moy+=d[i];
    moy/=FEN;
    var e=0;
    for(i=i0;i<i0+FEN;i++){ var v=d[i]-moy; e+=v*v; }
    var rms=Math.sqrt(e/FEN);
    if(rms<seuil){ trames.push({t:i0/sr, f:0, rms:rms, clarte:0}); continue; }
    var best=-1, bl=0;
    var r=new Float64Array(lagMax+2);
    for(lag=lagMin; lag<=lagMax && i0+FEN+lag<n; lag++){
      var s=0;
      for(i=i0;i<i0+FEN;i++) s+=(d[i]-moy)*(d[i+lag]-moy);
      r[lag]=s;
      if(s>best){ best=s; bl=lag; }
    }
    var clarte=best/(e||1);
    if(!bl || clarte<0.42){ trames.push({t:i0/sr, f:0, rms:rms, clarte:clarte}); continue; }
    /* L'erreur d'octave est la faute classique de l'autocorrélation : le
       décalage d'une période double corrèle presque aussi bien que celui
       d'une période, et parfois mieux. Le premier jet la faisait à chaque
       attaque de note et rendait soixante-dix-sept notes là où il y en a
       quarante-deux, farcies de graves inventés. On reprend donc le plus
       petit décalage qui atteint 88 % du maximum, et non le maximum. */
    for(lag=lagMin+1; lag<bl; lag++){
      if(r[lag]>=0.88*best && r[lag]>=r[lag-1] && r[lag]>=r[lag+1]){ bl=lag; break; }
    }
    var a=r[bl-1]||0, b=r[bl], c2=r[bl+1]||0, den=(a-2*b+c2);
    var dl=den?0.5*(a-c2)/den:0;
    trames.push({t:i0/sr, f:sr/(bl+dl), rms:rms, clarte:clarte});
  }
  /* médiane glissante sur cinq trames : elle enlève les sauts d'octave
     isolés qui restent */
  var midi=trames.map(function(x){ return x.f>0 ? 69+12*Math.log2(x.f/440) : null; });
  var liss=midi.map(function(_,k){
    var f=midi.slice(Math.max(0,k-2),k+3).filter(function(v){ return v!==null; });
    if(f.length<2) return midi[k];
    f.sort(function(p,q){ return p-q; });
    return f[f.length>>1];
  });
  /* Découpage : même demi-ton, sans trou — et une attaque coupe. Sans ce
     dernier point, deux notes identiques qui se suivent n'en font qu'une :
     « G4/2 G4/2 » ressortait en « G4/4 ». Une attaque se voit à l'énergie,
     qui remonte franchement après avoir creusé. */
  var notes=[], cour=null;
  for(var k=0;k<liss.length;k++){
    var m=liss[k], dt=trames[k].t;
    if(m===null||m===undefined){ if(cour){ cour.fin=dt; notes.push(cour); cour=null; } continue; }
    var demi=Math.round(m);
    if(cour && cour.n>=4 && k>=3){
      var creux=Math.min(trames[k-1].rms,trames[k-2].rms,trames[k-3].rms);
      if(trames[k].rms>creux*1.5 && trames[k].rms>seuil*1.6){
        cour.fin=dt; notes.push(cour);
        cour={demi:demi, debut:dt, fin:dt, somme:0, n:1, n2:0};
        continue;
      }
    }
    if(cour && Math.abs(demi-cour.demi)<0.5){
      cour.fin=dt;
      /* on laisse passer l'attaque : les deux premières trames portent le
         transitoire, pas encore la hauteur */
      if(cour.n>=2){ cour.somme+=m; cour.n2=(cour.n2||0)+1; }
      cour.n++;
    }
    else { if(cour){ cour.fin=dt; notes.push(cour); } cour={demi:demi, debut:dt, fin:dt, somme:0, n:1, n2:0}; }
  }
  if(cour && trames.length){ cour.fin=trames[trames.length-1].t; notes.push(cour); }
  var gardees=notes.filter(function(x){ return x.fin-x.debut>=minNote && x.n2>0; })
    .map(function(x){
      return {midi:x.demi, moyen:x.somme/x.n2, debut:+x.debut.toFixed(3),
              duree:+(x.fin-x.debut).toFixed(3), trames:x.n,
              cents:Math.round((x.somme/x.n2-x.demi)*100)};
    });
  return {duree:+(n/sr).toFixed(2), sr:sr, trames:trames.length, notes:gardees};
}

/* Sans indication, on prend la plus courte durée fréquente comme double
   croche : grossier, mais ça place les notes sur une grille. */
function tempoEstime(notes){
  if(!notes.length) return 112;
  var d=notes.map(function(x){ return x.duree; }).sort(function(a,b){ return a-b; });
  var court=d[Math.floor(d.length*0.15)]||d[0];
  return Math.max(60,Math.min(200,Math.round(60/(court*4))));
}

function enPartition(notes,tempo,o){
  o=o||{};
  var transposer=o.transposer||0;
  if(!notes.length) return {texte:'', jetons:[]};
  var pas=60/tempo/4, jetons=[], fin=notes[0].debut, dernier=-1;
  notes.forEach(function(x){
    var silence=Math.round((x.debut-fin)/pas);
    var duree=Math.max(1,Math.round(x.duree/pas));
    /* Un silence d'un seul pas entre deux notes n'est pas un silence : c'est
       la chute du son qui passe sous le seuil avant la fin de la note. On le
       rend à la note qui précède, sinon la partition est criblée de « -/1 ». */
    if(silence===1 && dernier>=0){
      var m=/^(.+)\/(\d+)$/.exec(jetons[dernier]);
      jetons[dernier]=m[1]+'/'+((+m[2])+1);
      silence=0;
    }
    if(silence>0) jetons.push('-/'+silence);
    jetons.push(nomDe(x.midi+transposer)+'/'+duree);
    dernier=jetons.length-1;
    fin=x.debut+x.duree;
  });
  return {texte:jetons.join(' '), jetons:jetons};
}

window.RELEVE_MELODIE={analyser:analyser, enPartition:enPartition,
                       tempoEstime:tempoEstime, nomDe:nomDe};
})();
