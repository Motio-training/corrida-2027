/* Musique 8 bits pour l'espace 3D.

   Pas de fichier audio : tout est synthétisé par l'API Web Audio, comme le
   reste du projet fabrique ses textures au lieu de les télécharger. Une page
   déjà lourde de quatre-vingts mégaoctets de modèles n'a pas besoin d'un MP3
   de plus, et une puce de console des années 80 ne sait de toute façon rien
   faire d'autre : deux voies d'impulsion, une basse, un bruit blanc pour la
   batterie. C'est exactement ce qu'on veut entendre.

   La partition est du texte, une note par jeton, « NOTE/durée » en doubles
   croches : elle se relit, se corrige et se vérifie. outils/verifier_musique.js
   la rejoue hors ligne et contrôle que chaque note sort à la bonne fréquence.

   window.MUSIQUE :
     pret()              l'API audio est-elle disponible
     actif()             la musique joue-t-elle
     basculer()          allume ou éteint, et retient le choix
     demarrer() arreter()
     choisir(nom)        change de morceau
     morceaux()          la liste
     planifier(ctx,dest,t0,de,a)   pour les contrôles hors navigateur      */
(function(){
'use strict';

/* ------------------------------------------------------------- partitions
   Durées en doubles croches ; à 2/4 une mesure fait huit pas.
   « - » est un silence, et la durée d'un silence compte comme les autres.  */
var PARTITIONS={

  /* « Jeune chef », relevé sur l'enregistrement que Nicolas m'a envoyé.

     La mélodie n'est pas écrite d'oreille : elle est mesurée. Le fichier est
     un chœur d'hommes sans accompagnement, coupé sous 120 Hz — donc avec un
     fondamental affaibli, ce qui trompe tous les détecteurs de hauteur
     ordinaires d'une octave. Le relevé passe par une saillance harmonique
     (l'énergie de dix harmoniques de chaque candidat) puis par un Viterbi qui
     interdit à la piste de sauter d'octave d'une trame à l'autre.

     Ce qui est mesuré : la tonalité (si bémol majeur, corrélation 0,66 contre
     0,55 pour la suivante), le tempo (112 à la noire), la structure — deux
     fois 68 secondes, couplet puis refrain — et la suite des notes du
     refrain, dont les deux passages du fichier s'accordent à 79 %. Éprouvée
     contre le chromagramme du fichier — calculé sur le spectre, donc
     indépendant de tout ce qui précède —, cette suite est à 9,9 écarts-types
     au-dessus d'un mélange de ses propres notes, et devant ses onze
     transpositions.

     Ce qui est arrangé : l'octave du chant (monté d'une octave, le registre
     de la puce), le calage des durées sur la double croche, les respirations
     allongées pour finir la mesure, et les trois voix d'accompagnement —
     basse, contrechant, batterie —, déduites des accords que porte la
     mélodie mesure par mesure. Un chœur a cappella n'en a aucune.

     Tout ce bloc se régénère :
       python3 outils/melodie_depuis_chant.py <fichier> \
               --de 36.7 --a 67.5 --octave 12 --tempo 112                   */
  'jeunechef': {
    nom:'Jeune chef (refrain)',
    tempo:112,
    /* une phrase par ligne, respiration comprise */
    lead:'G4/4 G4/2 G4/2 G4/4 G4/1 A#4/1 A#4/6 A#4/2 A#4/2 A#4/3 -/5  '+
         'F4/1 F4/2 F4/1 G4/2 G4/3 F4/1 F4/2 F4/1 D4/4 D4/2 D4/6 -/7  '+
         'G4/4 G4/2 G4/2 F4/2 F4/3 F4/2 -/1  '+
         'D#4/2 D#4/3 D4/1 D4/4 D4/3 D4/2 C4/2 C4/2 -/5  '+
         'F4/3 G4/3 G4/1 F4/2 F4/3 F4/2 F4/2 F4/1 F4/4 -/3  '+
         'F4/2 F4/2 G4/4 F4/1 F4/2 F4/1 A#4/1 A#4/3 A#4/4 A#4/2 A#4/3 -/7  '+
         'F4/4 G4/2 G4/2 F4/4 F4/2 -/2  '+
         'G4/3 G4/2 G4/3 F4/3 D#4/1 D#4/1 D4/4 C4/6 -/9',
    /* le contrechant, tierce et quinte de l'accord sur les temps faibles,
       dans le registre du ténor : entre la basse et le chant, là où il ne
       masque ni l'un ni l'autre */
    harmonie:'-/4 G3/2 A#3/2 -/4 G3/2 A#3/2  -/4 D3/2 F3/2 -/4 D3/2 F3/2  '+
             '-/4 D3/2 F3/2 -/4 D3/2 F3/2  -/4 D3/2 F3/2 -/4 D3/2 F3/2  '+
             '-/4 G3/2 A#3/2 -/4 G3/2 A#3/2  -/4 D3/2 F3/2 -/4 D3/2 F3/2  '+
             '-/4 A3/2 C4/2 -/4 A3/2 C4/2  -/4 D3/2 F3/2 -/4 D3/2 F3/2  '+
             '-/4 D3/2 F3/2 -/4 D3/2 F3/2  -/4 D3/2 F3/2 -/4 D3/2 F3/2  '+
             '-/4 D3/2 F3/2 -/4 D3/2 F3/2  -/4 A#3/2 D4/2 -/4 A#3/2 D4/2  '+
             '-/4 A3/2 C4/2 -/4 A3/2 C4/2',
    /* les accords que porte la mélodie, mesure par mesure : D# A# A# A# D# A# F A# A# A# A# Gm F ;
       fondamentale et quinte en alternance, au pas */
    basse:'D#2/4 A#2/4 D#2/4 A#2/4  A#2/4 F2/4 A#2/4 F2/4  '+
          'A#2/4 F2/4 A#2/4 F2/4  A#2/4 F2/4 A#2/4 F2/4  '+
          'D#2/4 A#2/4 D#2/4 A#2/4  A#2/4 F2/4 A#2/4 F2/4  '+
          'F2/4 C3/4 F2/4 C3/4  A#2/4 F2/4 A#2/4 F2/4  '+
          'A#2/4 F2/4 A#2/4 F2/4  A#2/4 F2/4 A#2/4 F2/4  '+
          'A#2/4 F2/4 A#2/4 F2/4  G2/4 D2/4 G2/4 D2/4  '+
          'F2/4 C3/4 F2/4 C3/4',
    /* K grosse caisse, S caisse claire, H charleston */
    perc:'K/2 H/2 S/2 H/2'
  },

  /* Marche d'attente, composée pour l'occasion : deux mesures d'appel, une
     période claire puis une période plus sombre, et une cadence. Elle a tenu
     la place du « Jeune chef » tant que je n'avais pas la mélodie ; elle
     reste comme second morceau. */
  'marche': {
    nom:'Marche',
    tempo:112,
    lead:'G4/2 G4/2 C5/4  E5/2 E5/2 G5/4  F5/2 E5/2 D5/4  C5/6 -/2 '+
         'G4/2 G4/2 C5/4  E5/2 G5/2 C6/4  B5/2 A5/2 G5/4  G5/6 -/2 '+
         'A5/2 A5/2 G5/2 F5/2  E5/4 D5/4  F5/2 F5/2 E5/2 D5/2  C5/6 -/2 '+
         'G4/2 B4/2 D5/2 F5/2  E5/4 C5/4  D5/2 D5/2 G4/2 B4/2  C5/8',
    harmonie:'-/8  C5/2 C5/2 E5/4  A4/2 G4/2 F4/4  E4/6 -/2 '+
             '-/8  G4/2 E5/2 G5/4  G5/2 F5/2 E5/4  E5/6 -/2 '+
             'C5/2 C5/2 B4/2 A4/2  G4/4 F4/4  A4/2 A4/2 G4/2 F4/2  E4/6 -/2 '+
             '-/8  G4/4 E4/4  F4/2 F4/2 -/4  E4/8',
    basse:'C2/4 G2/4  C2/4 G2/4  F2/4 G2/4  C2/4 C3/4 '+
          'C2/4 G2/4  C2/4 E2/4  G2/4 G2/4  C2/4 C3/4 '+
          'F2/4 F2/4  C2/4 G2/4  D2/4 D2/4  C2/4 G2/4 '+
          'G2/4 G2/4  C2/4 C2/4  G2/4 G2/4  C2/8',
    /* K grosse caisse, S caisse claire, H charleston */
    perc:'K/2 H/2 S/2 H/2'
  }
};

/* ------------------------------------------------------------- les notes */
var DEMI={C:0, 'C#':1, Db:1, D:2, 'D#':3, Eb:3, E:4, F:5, 'F#':6, Gb:6,
          G:7, 'G#':8, Ab:8, A:9, 'A#':10, Bb:10, B:11};
function frequence(nom){
  var m=/^([A-G][#b]?)(-?\d)$/.exec(nom);
  if(!m) return 0;
  var d=DEMI[m[1]];
  if(d===undefined) return 0;
  /* A4 = 440 Hz, le la du diapason ; MIDI 69 */
  var midi=(+m[2]+1)*12+d;
  return 440*Math.pow(2,(midi-69)/12);
}
function lire(texte){
  var out=[], pas=0;
  (texte||'').split(/\s+/).forEach(function(t){
    if(!t) return;
    var p=t.split('/'), duree=+(p[1]||1);
    if(!(duree>0)) duree=1;
    if(p[0]!=='-') out.push({pas:pas, duree:duree, note:p[0]});
    pas+=duree;
  });
  out.longueur=pas;
  return out;
}

/* ---------------------------------------------------------- les timbres -
   Une onde d'impulsion de rapport cyclique d se développe en harmoniques
   a(n) = 2/(nπ)·sin(nπd). À d = 1/2 c'est le carré ; à 1/4 et 1/8 on
   retrouve les deux autres timbres de la puce, plus nasillards.          */
var ondes={};
function onde(ctx,duty){
  var cle=duty.toFixed(3);
  if(ondes[cle] && ondes[cle].ctx===ctx) return ondes[cle].w;
  var N=28, re=new Float32Array(N+1), im=new Float32Array(N+1);
  for(var k=1;k<=N;k++) im[k]=2/(k*Math.PI)*Math.sin(Math.PI*k*duty);
  var w=ctx.createPeriodicWave(re,im);
  ondes[cle]={ctx:ctx, w:w};
  return w;
}
function voix(ctx,dest,t,duree,freq,duty,vol){
  if(!(freq>0)) return;
  var o=ctx.createOscillator(), g=ctx.createGain();
  o.setPeriodicWave(onde(ctx,duty));
  o.frequency.setValueAtTime(freq,t);
  /* attaque franche, extinction nette : c'est ce qui fait le « bip » */
  g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(vol,t+0.006);
  g.gain.setValueAtTime(vol,t+Math.max(0.02,duree*0.55));
  g.gain.exponentialRampToValueAtTime(0.0008,t+Math.max(0.05,duree*0.92));
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t+duree+0.05);
}
/* la basse : triangle adouci, comme la troisième voie de la puce */
function basse(ctx,dest,t,duree,freq,vol){
  if(!(freq>0)) return;
  var o=ctx.createOscillator(), g=ctx.createGain();
  o.type='triangle';
  o.frequency.setValueAtTime(freq,t);
  g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(vol,t+0.008);
  g.gain.exponentialRampToValueAtTime(0.0008,t+Math.max(0.06,duree*0.9));
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t+duree+0.05);
}
/* la batterie : bruit filtré, court pour la caisse claire, sourd pour la
   grosse caisse — une seule voie de bruit, comme sur la puce */
var tampon=null, tamponCtx=null;
function bruit(ctx){
  if(tampon && tamponCtx===ctx) return tampon;
  var n=Math.floor(ctx.sampleRate*0.5), b=ctx.createBuffer(1,n,ctx.sampleRate), d=b.getChannelData(0);
  /* suite pseudo-aléatoire fixe : deux rendus successifs doivent coïncider,
     sinon le contrôle hors ligne ne peut rien comparer */
  var x=1234567;
  for(var i=0;i<n;i++){ x=(x*1103515245+12345)&0x7fffffff; d[i]=(x/0x3fffffff)-1; }
  tampon=b; tamponCtx=ctx;
  return b;
}
function frappe(ctx,dest,t,sorte,vol){
  var s=ctx.createBufferSource(); s.buffer=bruit(ctx);
  var f=ctx.createBiquadFilter(), g=ctx.createGain();
  if(sorte==='K'){ f.type='lowpass'; f.frequency.setValueAtTime(140,t); }
  else if(sorte==='S'){ f.type='bandpass'; f.frequency.setValueAtTime(1900,t); f.Q.setValueAtTime(0.8,t); }
  else { f.type='highpass'; f.frequency.setValueAtTime(7000,t); }
  var duree=(sorte==='K')?0.13:(sorte==='S'?0.10:0.045);
  g.gain.setValueAtTime(vol,t);
  g.gain.exponentialRampToValueAtTime(0.0008,t+duree);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t); s.stop(t+duree+0.02);
  if(sorte==='K'){
    /* un peu de corps sous le bruit, sinon la grosse caisse ne s'entend pas */
    var o=ctx.createOscillator(), go=ctx.createGain();
    o.type='sine';
    o.frequency.setValueAtTime(150,t);
    o.frequency.exponentialRampToValueAtTime(48,t+0.11);
    go.gain.setValueAtTime(vol*1.1,t);
    go.gain.exponentialRampToValueAtTime(0.0008,t+0.14);
    o.connect(go); go.connect(dest);
    o.start(t); o.stop(t+0.16);
  }
}

/* ---------------------------------------------------------- la partition */
var courant='jeunechef', compile=null;
function compiler(nom){
  var p=PARTITIONS[nom];
  if(!p) return null;
  var lead=lire(p.lead), harmonie=lire(p.harmonie), bs=lire(p.basse), pc=lire(p.perc);
  var longueur=Math.max(lead.longueur,harmonie.longueur,bs.longueur);
  /* la percussion est une cellule courte, répétée jusqu'au bout */
  var perc=[];
  if(pc.longueur>0) for(var d=0; d<longueur; d+=pc.longueur)
    pc.forEach(function(n){ if(d+n.pas<longueur) perc.push({pas:d+n.pas, duree:n.duree, note:n.note}); });
  return {nom:nom, titre:p.nom, tempo:p.tempo, longueur:longueur,
          pasSec:60/p.tempo/4, lead:lead, harmonie:harmonie, basse:bs, perc:perc};
}
function partition(){
  if(!compile || compile.nom!==courant) compile=compiler(courant);
  return compile;
}

/* Planifie tout ce qui tombe dans [de, a[, en secondes depuis le début de la
   boucle. Le même code sert au direct et au rendu hors ligne : un contrôle
   qui n'écouterait pas exactement ce que la page joue ne vaudrait rien.   */
/* « voies » restreint ce qu'on planifie : {lead:true} ne pose que le chant.
   C'est ce qui rend le contrôle possible — sur le mélange des quatre voies,
   aucun détecteur de hauteur ne retrouverait la note du chant. */
function planifier(ctx,dest,t0,de,a,voies){
  var P=partition();
  if(!P) return 0;
  var v=voies||{lead:1,harmonie:1,basse:1,perc:1};
  var duree=P.longueur*P.pasSec;
  var tour=Math.floor(de/duree);
  for(; tour*duree<a; tour++){
    var base=tour*duree;
    var pose=function(liste,jouer){
      for(var i=0;i<liste.length;i++){
        var n=liste[i], t=base+n.pas*P.pasSec;
        if(t<de || t>=a) continue;
        jouer(n, t0+t, n.duree*P.pasSec);
      }
    };
    if(v.lead) pose(P.lead, function(n,t,d){ voix(ctx,dest,t,d,frequence(n.note),0.5,0.085); });
    if(v.harmonie) pose(P.harmonie, function(n,t,d){ voix(ctx,dest,t,d,frequence(n.note),0.25,0.05); });
    if(v.basse) pose(P.basse, function(n,t,d){ basse(ctx,dest,t,d,frequence(n.note),0.12); });
    if(v.perc) pose(P.perc, function(n,t,d){ frappe(ctx,dest,t,n.note,n.note==='H'?0.035:0.09); });
  }
  return duree;
}

/* ------------------------------------------------------------- le direct */
var ctx=null, maitre=null, minuteur=0, debut=0, jusqu=0, enMarche=false;
var CLE='corrida-musique';
function souvenir(v){ try{ localStorage.setItem(CLE, v?'1':'0'); }catch(e){} }
function voulu(){ try{ return localStorage.getItem(CLE)==='1'; }catch(e){ return false; } }

function contexte(){
  if(ctx) return ctx;
  var C=window.AudioContext||window.webkitAudioContext;
  if(!C) return null;
  ctx=new C();
  maitre=ctx.createGain();
  maitre.gain.value=0;
  maitre.connect(ctx.destination);
  return ctx;
}
function boucle(){
  if(!enMarche) return;
  var t=ctx.currentTime-debut;
  /* on planifie une seconde d'avance : assez pour que rien ne manque même
     si l'onglet est occupé à construire le monde, assez peu pour que
     l'arrêt soit immédiat */
  if(jusqu < t+1){
    planifier(ctx,maitre,debut,jusqu,t+1);
    jusqu=t+1;
  }
}
function demarrer(){
  if(enMarche) return true;
  if(!contexte()) return false;
  if(ctx.state==='suspended'){ try{ ctx.resume(); }catch(e){} }
  enMarche=true;
  debut=ctx.currentTime+0.08;
  jusqu=0;
  maitre.gain.cancelScheduledValues(ctx.currentTime);
  maitre.gain.setValueAtTime(0.0001,ctx.currentTime);
  maitre.gain.exponentialRampToValueAtTime(0.5,ctx.currentTime+0.5);
  boucle();
  minuteur=setInterval(boucle,180);
  return true;
}
function arreter(){
  if(!enMarche) return;
  enMarche=false;
  clearInterval(minuteur); minuteur=0;
  if(maitre && ctx){
    var t=ctx.currentTime;
    maitre.gain.cancelScheduledValues(t);
    maitre.gain.setValueAtTime(maitre.gain.value||0.0001,t);
    maitre.gain.exponentialRampToValueAtTime(0.0001,t+0.25);
  }
  /* les notes déjà planifiées s'éteignent d'elles-mêmes ; on coupe le
     volume plutôt que de courir après chaque oscillateur */
}

/* Le navigateur refuse de faire du son avant un geste de l'utilisateur.
   Si la musique était allumée à la visite précédente, on attend donc le
   premier clic ou la première touche — sinon elle resterait muette sans que
   personne comprenne pourquoi.

   Deux conditions avant de lancer quoi que ce soit : que la musique soit
   voulue, et qu'on soit bien dans la vue 3D. Sans la seconde, ouvrir la page
   principale déclencherait la fanfare dès le premier clic sur la carte, là
   où l'on n'a rien demandé. Sur la page du village, où la 3D s'ouvre seule
   sans geste préalable, c'est au contraire ce guet qui la démarre.        */
var arme=false;
function enTroisD(){
  try{ return !!(document.body && document.body.classList.contains('en-3d')); }
  catch(e){ return false; }
}
function armer(){
  if(arme) return;
  arme=true;
  var lance=function(){
    if(!voulu() || !enTroisD()) return;   /* on continue à guetter */
    retirer();
    demarrer();
  };
  var retirer=function(){
    arme=false;
    ['pointerdown','keydown','touchstart'].forEach(function(e){
      window.removeEventListener(e,lance,true);
    });
  };
  ['pointerdown','keydown','touchstart'].forEach(function(e){
    window.addEventListener(e,lance,true);
  });
}

window.MUSIQUE={
  pret:function(){ return !!(window.AudioContext||window.webkitAudioContext); },
  actif:function(){ return enMarche; },
  voulu:voulu,
  demarrer:function(){ var ok=demarrer(); souvenir(ok); return ok; },
  arreter:function(){ arreter(); souvenir(false); },
  /* Quitter la vue 3D coupe le son sans changer le choix : arreter() le
     mettrait à « non » et la musique ne reviendrait pas en rouvrant. */
  pause:function(){ arreter(); },
  /* Rouvrir la 3D : on relance si c'était allumé, et on arme de toute façon
     — le clic d'ouverture n'existe pas sur la page du village, où la vue
     s'ouvre d'elle-même. */
  reprendre:function(){
    armer();
    return voulu() ? demarrer() : false;
  },
  basculer:function(){
    if(enMarche){ arreter(); souvenir(false); return false; }
    var ok=demarrer(); souvenir(ok); return ok;
  },
  /* Poser un morceau depuis l'extérieur : la page de relevé s'en sert pour
     faire écouter ce qu'elle vient de transcrire, avec le même timbre que
     la 3D — sinon on juge la mélodie sur un autre son que celui qu'on aura. */
  definir:function(cle,p){
    if(!cle || !p || !p.lead) return false;
    PARTITIONS[cle]={nom:p.nom||cle, tempo:p.tempo||112, lead:p.lead,
                     harmonie:p.harmonie||'', basse:p.basse||'',
                     perc:(p.perc!==undefined)?p.perc:'K/2 H/2 S/2 H/2'};
    if(courant===cle) compile=null;
    return true;
  },
  choisir:function(nom){
    if(!PARTITIONS[nom]) return false;
    var jouait=enMarche;
    if(jouait) arreter();
    courant=nom; compile=null;
    if(jouait) setTimeout(demarrer,300);
    return true;
  },
  morceaux:function(){
    return Object.keys(PARTITIONS).map(function(k){
      return {cle:k, nom:PARTITIONS[k].nom, tempo:PARTITIONS[k].tempo};
    });
  },
  titre:function(){ var P=partition(); return P?P.titre:''; },
  /* de quoi voir depuis l'extérieur pourquoi rien ne sort : le navigateur
     suspend le contexte audio tant qu'aucun geste n'a eu lieu */
  etat:function(){
    return {contexte:ctx?ctx.state:'aucun', enMarche:enMarche, voulu:voulu(),
            morceau:courant, titre:this.titre()};
  },
  /* pour outils/verifier_musique.js : rejouer la même chose hors ligne */
  planifier:planifier,
  partition:partition,
  frequence:frequence,
  armer:armer
};
armer();
})();
