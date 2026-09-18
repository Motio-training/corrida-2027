/* Monte la page du banc d'essai du village à partir de la page principale.

   Le but n'est pas un deuxième site : c'est un terrain d'essai pour le
   relevé 360. On reprend donc de index.html ce qui fait la vue 3D (les
   styles et le bloc « e3 »), on y branche les données du village, et on
   remplace tout le reste — carte 2D, synchronisation, jalonneurs, tracé
   de la Corrida — par le strict minimum que code3d.js attend.

   Usage :
     node outils/page_village.js \
          --page index.html --donnees village/donnees.html \
          --osm export.geojson --sortie village/index.html \
          --titre "La Mothe-Saint-Héray" [--sans-boucle]

   --osm sert seulement à tracer une boucle de démonstration le long des
   rues réelles : sans lui (ou avec --sans-boucle), la page s'ouvre sans
   parcours et on se déplace librement.                                   */

const fs=require('fs'), path=require('path');
const args=process.argv.slice(2);
function opt(n,d){ const i=args.indexOf('--'+n); return i<0?d:args[i+1]; }
const drapeau=n=>args.indexOf('--'+n)>=0;

const PAGE=opt('page','index.html');
const DONNEES=opt('donnees','village/donnees.html');
const ENSEIGNES=opt('enseignes','village/enseignes.html');
const SORTIE=opt('sortie','village/index.html');
const TITRE=opt('titre','La Mothe-Saint-Héray');
const OSM=opt('osm');

/* ------------------------------------------- morceaux de la page principale */
const src=fs.readFileSync(PAGE,'utf8');

function blocsStyle(s){
  const r=[]; let i=0;
  for(;;){
    const a=s.indexOf('<style>',i); if(a<0) break;
    const b=s.indexOf('</style>',a); if(b<0) break;
    r.push(s.slice(a,b+8)); i=b+8;
  }
  return r;
}
function bloc(s,ouverture,fin){
  const a=s.indexOf(ouverture); if(a<0) throw new Error('bloc introuvable : '+ouverture);
  const b=s.indexOf(fin,a);     if(b<0) throw new Error('fin introuvable : '+fin);
  return s.slice(a,b+fin.length);
}
const styles=blocsStyle(src);
if(!styles.length) throw new Error('aucun <style> dans '+PAGE);
/* le conteneur 3D : de <div id="e3" hidden> jusqu'au </div> de fin de bloc */
const iE3=src.indexOf('<div id="e3" hidden>');
if(iE3<0) throw new Error('bloc 3D introuvable dans '+PAGE);
const finE3=src.indexOf('\n</div>\n', iE3);
let e3=src.slice(iE3, finE3+8);
/* la liste des fichiers 3D à télécharger, telle quelle */
const chargement=bloc(src,'window.CHARGEMENT_3D=',';\n');

/* en-tête adapté au village */
e3=e3.replace(/CORRIDA 2027 <span>ENSOA<\/span>/, TITRE.toUpperCase().replace(/ /g,' ')+' <span>banc d’essai</span>')
     .replace(/Vue 3D du parcours/, 'Carte OpenStreetMap — essai du relevé 360');

/* --------------------------------------------- boucle de démonstration */
let TRACE=[];
if(OSM && !drapeau('sans-boucle')){
  const geo=JSON.parse(fs.readFileSync(OSM,'utf8'));
  const PIED=new Set(['residential','unclassified','tertiary','secondary','primary','living_street',
                      'pedestrian','service','footway','path','track','tertiary_link','secondary_link']);
  const noeuds=new Map(), voisins=new Map();
  const cle=p=>p[1].toFixed(7)+','+p[0].toFixed(7);
  const MLAT=111132.92, MLON=111412.84*Math.cos(46.358*Math.PI/180);
  const dist=(a,b)=>Math.hypot((a[0]-b[0])*MLAT,(a[1]-b[1])*MLON);   /* [la,lo] */
  function noeud(p){
    const k=cle(p);
    if(!noeuds.has(k)){ noeuds.set(k,[p[1],p[0]]); voisins.set(k,[]); }
    return k;
  }
  for(const f of geo.features){
    const h=f.properties&&f.properties.highway;
    if(!h||!PIED.has(h)||!f.geometry||f.geometry.type!=='LineString') continue;
    const c=f.geometry.coordinates;
    for(let i=1;i<c.length;i++){
      const a=noeud(c[i-1]), b=noeud(c[i]);
      if(a===b) continue;
      const d=dist(noeuds.get(a),noeuds.get(b));
      voisins.get(a).push([b,d]); voisins.get(b).push([a,d]);
    }
  }
  /* les points de passage de la boucle, dans l'ordre : mairie, église,
     temple, Orangerie, lavoir de la Chamoiserie, retour mairie */
  const ETAPES=[[46.360453,-0.112819],[46.360807,-0.111190],[46.356899,-0.110900],
                [46.355430,-0.110956],[46.356461,-0.113474],[46.360453,-0.112819]];
  const proche=(p,ok)=>{ let m=null,md=1e9; for(const [k,q] of noeuds){ if(ok&&!ok.has(k)) continue; const d=dist(q,p); if(d<md){md=d;m=k;} } return m; };
  function chemin(a,b){
    const d=new Map([[a,0]]), prec=new Map(), vus=new Set();
    const file=[[0,a]];
    while(file.length){
      file.sort((x,y)=>x[0]-y[0]);
      const [du,u]=file.shift();
      if(vus.has(u)) continue;
      vus.add(u);
      if(u===b) break;
      for(const [v,w] of (voisins.get(u)||[])){
        const nd=du+w;
        if(nd<(d.has(v)?d.get(v):1e18)){ d.set(v,nd); prec.set(v,u); file.push([nd,v]); }
      }
    }
    if(!vus.has(b)) return null;
    const r=[]; let u=b;
    while(u!==undefined){ r.unshift(u); u=prec.get(u); }
    return r;
  }
  /* Le réseau piéton d'OSM est parfois coupé (allée privée, chemin non
     raccordé) : on ne garde que la composante la plus étendue et on y
     accroche les étapes, plutôt que d'interrompre la boucle. */
  const vu=new Set(); let grande=null;
  for(const k of noeuds.keys()){
    if(vu.has(k)) continue;
    const pile=[k], comp=[]; vu.add(k);
    while(pile.length){
      const u=pile.pop(); comp.push(u);
      for(const [v] of (voisins.get(u)||[])) if(!vu.has(v)){ vu.add(v); pile.push(v); }
    }
    if(!grande || comp.length>grande.length) grande=comp;
  }
  const dansGrande=new Set(grande);
  console.log('  réseau : '+noeuds.size+' nœuds, composante principale '+grande.length);
  const sommets=ETAPES.map(p=>proche(p,dansGrande));
  const pts=[];
  for(let i=1;i<sommets.length;i++){
    const c=chemin(sommets[i-1],sommets[i]);
    if(!c){ console.log('  ⚠ étape '+i+' non reliée au réseau : boucle interrompue'); break; }
    for(let k=(i===1?0:1);k<c.length;k++) pts.push(noeuds.get(c[k]));
  }
  TRACE=pts;
  let L=0; for(let i=1;i<TRACE.length;i++) L+=dist(TRACE[i-1],TRACE[i]);
  console.log('  boucle de démonstration : '+TRACE.length+' points, '+(L/1000).toFixed(2)+' km');
}

/* -------------------------------------------------------------- écriture */
const donnees=fs.readFileSync(DONNEES,'utf8');
/* Les enseignes, si elles ont été fabriquées : code3d.js lit
   window.CARTE_ENSEIGNES à la place de sa table de Saint-Maixent. */
const enseignes=fs.existsSync(ENSEIGNES)?fs.readFileSync(ENSEIGNES,'utf8'):'';
const trace=JSON.stringify(TRACE.map(p=>[+p[0].toFixed(7),+p[1].toFixed(7)]));

const page=`<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${TITRE} — banc d’essai 3D</title>
<!-- Page fabriquée par outils/page_village.js : ne pas modifier à la main. -->
${styles.join('\n')}
<style>
  /* la 3D occupe toute la page : il n'y a pas de carte 2D ici */
  body{margin:0;overflow:hidden;background:var(--nuit)}
  #e3{position:fixed;inset:0}
  #e3-carte{display:none}
</style>

${e3}

${donnees}
${enseignes}
<script>
/* Les blocs sont lus une seule fois puis vidés, comme sur la page principale. */
var DONNEES_CACHE={};
function donnee(id){
  if(!Object.prototype.hasOwnProperty.call(DONNEES_CACHE,id)){
    var e=document.getElementById(id);
    DONNEES_CACHE[id]= e ? e.textContent.replace(/^\\s+|\\s+$/g,'') : '';
    if(e) e.textContent='';
  }
  return DONNEES_CACHE[id];
}
/* Mode consultation, comme sur la page principale : écran tactile et petit
   écran, ou ?consultation=1 ; ?edition=1 force l'autre. Il allège l'interface
   3D et laisse de côté les modèles de piétons les plus lourds — sur le
   terrain, en données mobiles, cela fait une vingtaine de mégaoctets de
   moins à télécharger. */
window.CONSULTATION=(function(){
  try{
    var q=String(location.search||'')+String(location.hash||'');
    if(/edition=1/.test(q)) return false;
    if(/consultation=1/.test(q)) return true;
  }catch(e){}
  try{
    var tactile=!!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    var petit=Math.min(screen.width,screen.height)<=820;
    return tactile && petit;
  }catch(e){ return false; }
})();

/* Tracé de démonstration le long des rues : remplacé par le relevé GPS
   de la sortie 360 dès qu'il sera là. */
var TRACE_VILLAGE=${trace}.map(function(p){ return {la:p[0], lo:p[1]}; });

/* code3d.js dialogue avec la carte 2D de la page principale ; ici il n'y en
   a pas. On lui présente la même surface, vide, pour qu'il n'ait rien à
   deviner : chaque fonction rend la forme attendue et ne fait rien. */
(function(){
  var rien=function(){}, liste=function(){ return []; };
  window.CARTE={
    X:0, Y:0,
    traceDense:function(){ return TRACE_VILLAGE; },
    equip:function(){ return {barrieres:[], rubalises:[]}; },
    ancrages:liste, equipModifie:rien, bilanEquip:function(){ return {}; },
    annulerEquip:function(){ return false; }, retablirEquip:function(){ return false; },
    estModifie:function(){ return false; }, enregistrer:rien,
    ajouterBarrieres:rien, supprimerBarriere:rien, supprimerBarrieres:rien,
    ajouterRubalise:rien, supprimerRubalise:rien, nouveauGroupe:function(){ return 0; },
    jalons:liste, ajouterJalon:rien, supprimerJalon:rien, jalonsModifies:rien,
    passagesJalon:liste, modifierRole:rien, forcerPassage:rien,
    progression:function(){ return false; }, orientation:function(){ return 0; },
    pois:liste, parcoursActif:function(){ return {couleur:'#F2B33D', nom:${JSON.stringify(TITRE)}}; },
    parcoursListe:liste, autresParcours:liste, activerParcours:rien, afficherParcours:rien,
    vehicules:liste, ajouterVehicule:rien, supprimerVehicule:rien, vehiculeModifie:rien,
    pisteObstacles:liste, pisteModifiee:rien, pisteRemise:rien,
    zonesSansVoiture:liste
  };
})();
</script>

<script>
${chargement}
/* La 3D est la seule vue de cette page : on la charge tout de suite. */
(function(){
  var C=window.CHARGEMENT_3D||{fichiers:[]};
  var voile=null, txt=null, jauge=null;
  function charger(f){
    return new Promise(function(ok,ko){
      var s=document.createElement('script');
      s.src='../actifs/'+f; s.async=false;
      s.onload=function(){ ok(); };
      s.onerror=function(){ ko(new Error('téléchargement impossible ('+f+')')); };
      document.head.appendChild(s);
    });
  }
  document.addEventListener('DOMContentLoaded', function(){
    var e3=document.getElementById('e3');
    voile=document.getElementById('e3-voile');
    txt=document.getElementById('e3-vtxt');
    jauge=document.getElementById('e3-jauge');
    document.body.classList.add('en-3d');
    if(e3) e3.hidden=false;
    if(voile){ voile.hidden=false; voile.classList.remove('parti'); }
    var n=0;
    var L=C.fichiers.filter(function(f){
      return !(window.CONSULTATION && (C.mobiles_sans||[]).indexOf(f)>=0);
    });
    L.reduce(function(p,f){
      return p.then(function(){
        n++;
        if(txt) txt.textContent='Téléchargement de la 3D ('+n+' / '+L.length+')…';
        if(jauge) jauge.style.width=Math.round(n/L.length*100)+'%';
        return charger(f);
      });
    },Promise.resolve()).then(function(){
      if(!window.ESPACE3D || !window.ESPACE3D.ouvrir) throw new Error('la bibliothèque 3D ne s’est pas initialisée');
      window.ESPACE3D.ouvrir();
    }).catch(function(err){
      if(txt) txt.textContent='Erreur : '+err.message;
    });
  });
})();
</script>
`;
fs.mkdirSync(path.dirname(path.resolve(SORTIE)),{recursive:true});
fs.writeFileSync(SORTIE,page);
console.log('=== '+SORTIE+' ===');
console.log('  '+styles.length+' blocs de style repris, bloc 3D de '+e3.length+' octets');
console.log('  données : '+(donnees.length/1024).toFixed(0)+' Ko   page : '+(page.length/1024).toFixed(0)+' Ko'+
            (enseignes?('   enseignes : '+(enseignes.match(/\{/g)||[]).length):'   (pas d’enseignes)'));
