/* Où faut-il passer avec la caméra 360 pour voir le bourg en entier ?

   Le relevé mesure un bâtiment quand il l'a vu assez large et d'assez près :
   au moins trois degrés d'azimut, à quarante-cinq mètres au plus, et de deux
   points de vue différents pour pouvoir prendre une médiane et repérer une
   erreur. Cela ne dépend que de la géométrie, qu'on possède déjà : on peut
   donc calculer l'itinéraire avant d'aller marcher, au lieu de faire le tour
   au hasard et de découvrir au dépouillement qu'une rue manque.

   Méthode. On construit le réseau piéton depuis d-voies, on l'échantillonne
   tous les quatorze mètres — le pas d'une photo toutes les dix secondes à
   cinq kilomètres-heure — et pour chaque point on lance le rayon d'azimut de
   outils/carte.js : il dit quelle emprise occupe quelle colonne et à quelle
   distance. Puis on choisit les rues une par une, en prenant chaque fois
   celle qui rapporte le plus de bâtiments neufs par mètre parcouru, détour
   pour l'atteindre compris. C'est glouton, donc pas optimal ; mais le
   problème est celui du facteur rural, et sur un bourg la différence ne vaut
   pas le temps de la chercher.

   Usage :
     node outils/plan_360.js --page village/index.html \
          --osm village/export-osm.geojson \
          --depart 46.360453,-0.112819 --budget 4500 \
          --sortie village/parcours-360

   Écrit <sortie>.gpx (à charger dans n'importe quelle appli de marche) et
   <sortie>.md (l'itinéraire écrit, rue par rue).                          */

const fs=require('fs'), path=require('path');
const RACINE=path.resolve(__dirname,'..');
const ARG=process.argv.slice(2);
function opt(n,d){ const i=ARG.indexOf('--'+n); return i<0?d:ARG[i+1]; }

const PAGE=opt('page','village/index.html');
const OSM=opt('osm');
const SORTIE=opt('sortie','village/parcours-360');
const BUDGET=+opt('budget',4500);        /* mètres */
const PAS=+opt('pas',14);                /* un point de vue tous les PAS mètres */
const PORTEE_UTILE=+opt('portee',45);    /* au-delà, une façade est trop petite */
const LARGE_MIN=+opt('largeur',3);       /* degrés d'azimut minimum */
const GW=720;                            /* colonnes d'azimut : un demi-degré */
const COL_MIN=Math.max(2,Math.round(LARGE_MIN/360*GW));

const C=require('./carte.js').charger({page:PAGE, gw:GW, portee:70});
const {BATS, VOIES, pX, pZ, loDeX, laDeZ, visibilite}=C;

/* ------------------------------------------------------- noms de rues ----
   d-voies ne porte pas les noms : le moteur n'en a pas besoin. On les relit
   donc dans l'export OSM, et on rattache chaque tronçon du réseau au nom de
   la voie OSM la plus proche. Sans cela l'itinéraire n'est qu'une trace, et
   sur le terrain on veut lire « remonte la rue de la Chamoiserie ».        */
let NOMS=[];
if(OSM && fs.existsSync(OSM)){
  const geo=JSON.parse(fs.readFileSync(OSM,'utf8'));
  for(const f of geo.features||[]){
    const t=f.properties||{}, g=f.geometry;
    if(!t.highway || !t.name || !g) continue;
    const suites=(g.type==='LineString')?[g.coordinates]
                :(g.type==='MultiLineString')?g.coordinates:[];
    for(const s of suites){
      const p=s.map(q=>[pX(q[0]),pZ(q[1])]);
      if(p.length>=2) NOMS.push({nom:t.name, p});
    }
  }
  console.log('noms de voies lus : '+new Set(NOMS.map(n=>n.nom)).size);
}
function nomProche(x,z){
  let best=null, bd=18;
  for(const n of NOMS){
    for(let i=1;i<n.p.length;i++){
      const d=distSegment(x,z,n.p[i-1],n.p[i]);
      if(d<bd){ bd=d; best=n.nom; }
    }
  }
  return best;
}
function distSegment(x,z,a,b){
  const dx=b[0]-a[0], dz=b[1]-a[1], L2=dx*dx+dz*dz;
  let t=L2?((x-a[0])*dx+(z-a[1])*dz)/L2:0;
  t=Math.max(0,Math.min(1,t));
  return Math.hypot(x-(a[0]+t*dx), z-(a[1]+t*dz));
}

/* --------------------------------------------------------- le réseau ----- */
const MARCHABLE=new Set(['r','v','s','t']);
const noeuds=new Map(), voisins=new Map();
const cle=(x,z)=>Math.round(x*5)+'_'+Math.round(z*5);
function noeud(x,z){
  const k=cle(x,z);
  if(!noeuds.has(k)){ noeuds.set(k,[x,z]); voisins.set(k,[]); }
  return k;
}
const aretes=[];
for(const v of VOIES){
  if(!MARCHABLE.has(v.k)) continue;
  for(let i=1;i<v.p.length;i++){
    const a=noeud(v.p[i-1][0],v.p[i-1][1]), b=noeud(v.p[i][0],v.p[i][1]);
    if(a===b) continue;
    const A=noeuds.get(a), B=noeuds.get(b);
    const L=Math.hypot(B[0]-A[0],B[1]-A[1]);
    const id=aretes.length;
    aretes.push({id, a, b, L, hw:v.hw});
    voisins.get(a).push([b,L,id]); voisins.get(b).push([a,L,id]);
  }
}
/* on ne garde que la composante la plus étendue : une allée non raccordée
   ferait échouer les itinéraires sans rien apporter */
{
  const vu=new Set(); let grande=null;
  for(const k of noeuds.keys()){
    if(vu.has(k)) continue;
    const pile=[k], comp=[]; vu.add(k);
    while(pile.length){ const u=pile.pop(); comp.push(u);
      for(const [w] of voisins.get(u)) if(!vu.has(w)){ vu.add(w); pile.push(w); } }
    if(!grande || comp.length>grande.length) grande=comp;
  }
  const dans=new Set(grande);
  for(const k of [...noeuds.keys()]) if(!dans.has(k)){ noeuds.delete(k); voisins.delete(k); }
  aretes.forEach(e=>{ e.mort=!dans.has(e.a)||!dans.has(e.b); });
  console.log('réseau marchable : '+noeuds.size+' nœuds, '+
              aretes.filter(e=>!e.mort).length+' tronçons, '+
              (aretes.filter(e=>!e.mort).reduce((s,e)=>s+e.L,0)/1000).toFixed(2)+' km');
}

/* ------------------------------------- ce que chaque point de vue apporte - */
const t0=Date.now();
let nPoints=0;
for(const e of aretes){
  if(e.mort){ e.vues=[]; continue; }
  const A=noeuds.get(e.a), B=noeuds.get(e.b);
  const n=Math.max(1,Math.ceil(e.L/PAS));
  e.vues=[];
  for(let k=0;k<n;k++){
    const t=(k+0.5)/n;
    const x=A[0]+(B[0]-A[0])*t, z=A[1]+(B[1]-A[1])*t;
    const V=visibilite(x,z);
    const compte=new Map(), dmin=new Map();
    for(let u=0;u<GW;u++){
      const bi=V.bat[u]; if(bi<0) continue;
      const d=V.dist[u]; if(d>PORTEE_UTILE) continue;
      compte.set(bi,(compte.get(bi)||0)+1);
      if(!dmin.has(bi)||d<dmin.get(bi)) dmin.set(bi,d);
    }
    const bons=[], dbons=[];
    for(const [bi,c] of compte) if(c>=COL_MIN){ bons.push(bi); dbons.push(dmin.get(bi)); }
    e.vues.push({x,z,bons,dbons});
    nPoints++;
  }
}
console.log('points de vue évalués : '+nPoints+' en '+((Date.now()-t0)/1000).toFixed(0)+' s');

/* combien de bâtiments sont visibles depuis quelque part sur le réseau :
   c'est le seul denominateur honnête, une remise au fond d'un jardin ne se
   voit d'aucune rue */
const atteignables=new Set();
aretes.forEach(e=>(e.vues||[]).forEach(v=>v.bons.forEach(b=>atteignables.add(b))));
console.log('bâtiments visibles depuis une rue : '+atteignables.size+' sur '+BATS.length);

/* --------------------------------------------------------- Dijkstra ------ */
function chemin(depuis, poidsArete){
  const d=new Map([[depuis,0]]), prec=new Map(), fait=new Set();
  const file=[[0,depuis]];
  while(file.length){
    file.sort((a,b)=>a[0]-b[0]);
    const [du,u]=file.shift();
    if(fait.has(u)) continue;
    fait.add(u);
    for(const [w,L,id] of voisins.get(u)){
      const nd=du+poidsArete(id,L);
      if(nd<(d.has(w)?d.get(w):1e18)){ d.set(w,nd); prec.set(w,[u,id]); file.push([nd,w]); }
    }
  }
  return {d,prec};
}
function remonter(prec,jusqu){
  const r=[]; let u=jusqu;
  while(prec.has(u)){ const [p,id]=prec.get(u); r.unshift({de:p,vers:u,id}); u=p; }
  return r;
}

/* ------------------------------ ou bien : suivre la trace telle quelle ----
   Pour un parcours de course, la question n'est pas « où faut-il passer »
   mais « que rapporte le parcours lui-même ». On échantillonne alors la
   trace au pas de la photo et on compte, sans rien choisir.               */
if(ARG.includes('--suivre')){
  const F=opt('trace');
  if(!F || !fs.existsSync(F)){ console.error('--suivre demande --trace <fichier.gpx>'); process.exit(1); }
  const t=fs.readFileSync(F,'utf8'), tp=[];
  const re=/<trkpt[^>]*lat="([-0-9.]+)"[^>]*lon="([-0-9.]+)"/g;
  let m;
  while((m=re.exec(t))) tp.push([pX(+m[2]),pZ(+m[1])]);
  let L=0;
  for(let i=1;i<tp.length;i++) L+=Math.hypot(tp[i][0]-tp[i-1][0],tp[i][1]-tp[i-1][1]);
  const compteur=new Map();
  let reste=0, nPts=0;
  for(let i=1;i<tp.length;i++){
    const dx=tp[i][0]-tp[i-1][0], dz=tp[i][1]-tp[i-1][1];
    const d=Math.hypot(dx,dz);
    for(let s2=reste; s2<d; s2+=PAS){
      const x=tp[i-1][0]+dx*s2/d, z=tp[i-1][1]+dz*s2/d;
      const V=visibilite(x,z);
      const c=new Map();
      for(let u=0;u<GW;u++){
        const bi=V.bat[u]; if(bi<0 || V.dist[u]>PORTEE_UTILE) continue;
        c.set(bi,(c.get(bi)||0)+1);
      }
      for(const [bi,n] of c) if(n>=COL_MIN) compteur.set(bi,(compteur.get(bi)||0)+1);
      nPts++;
    }
    reste=(reste-d)%PAS; if(reste<0) reste+=PAS;
  }
  const u1=[...compteur.values()].filter(v=>v>=1).length;
  const u2=[...compteur.values()].filter(v=>v>=2).length;
  console.log('');
  console.log('=== la trace telle quelle : '+(L/1000).toFixed(2)+' km, '+nPts+' points de vue ===');
  console.log('  bâtiments vus au moins une fois : '+u1);
  console.log('  vus de deux points de vue ou plus : '+u2);
  console.log('  à une photo tous les '+PAS+' m : environ '+nPts+' images, '+
              Math.round(L/1000/4.8*60)+' min de marche à 4,8 km/h');
  process.exit(0);
}

const ETAPES_F=opt('etapes');

/* ------------------------------------------------- construction gloutonne - */
const DEPART=(opt('depart')||'').split(',');
let noeudCourant;
if(DEPART.length===2){
  const dx=pX(+DEPART[1]), dz=pZ(+DEPART[0]);
  let bd=1e9;
  for(const [k,q] of noeuds){ const d=Math.hypot(q[0]-dx,q[1]-dz); if(d<bd){ bd=d; noeudCourant=k; } }
} else noeudCourant=noeuds.keys().next().value;

const vus=new Map();                 /* bâtiment → nombre de points de vue retenus */
const marchees=new Set();
const itineraire=[];                 /* suite d'arêtes parcourues */
let longueur=0;

function gainArete(e){
  if(!e.vues || !e.vues.length) return 0;
  const neufs=new Set(), seconds=new Set();
  for(const v of e.vues) for(const b of v.bons){
    const n=vus.get(b)||0;
    if(n===0) neufs.add(b); else if(n===1) seconds.add(b);
  }
  /* le premier point de vue vaut plein tarif, le deuxième un peu moins : il
     n'apporte pas le bâtiment mais la médiane et la détection d'erreur */
  return neufs.size + 0.6*seconds.size;
}
const distances=new Map();        /* bâtiment → distances de tous ses points de vue */
function encaisser(e){
  if(!e.vues) return;
  for(const v of e.vues) v.bons.forEach((b,i)=>{
    vus.set(b,(vus.get(b)||0)+1);
    if(!distances.has(b)) distances.set(b,[]);
    distances.get(b).push(v.dbons[i]);
  });
  marchees.add(e.id);
}
/* La distance qui renseigne n'est pas la plus courte — collée à un mur on ne
   voit qu'une lichette de façade — mais celle du gros des vues. */
const medDist=b=>{ const a=(distances.get(b)||[]).slice().sort((x,y)=>x-y);
  return a.length?a[a.length>>1]:null; };

/* On peut borner les rues candidates sans borner le réseau : traverser reste
   permis, mais on ne va pas chercher des bâtiments à un kilomètre tant que
   le bourg n'est pas fait. Sans cette borne, le glouton part sur le chemin
   des Fontaines et la route de Pamproux — un kilomètre pour quelques fermes
   — alors qu'il reste des ruelles du centre à faire. */
const RAYON=+opt('rayon',0);
/* Ou bien on borne le long d'un tracé, quand ce qu'on veut relever est un
   parcours et non un bourg : les rues à moins de « corridor » mètres de la
   trace sont candidates, les autres non. C'est la forme qu'il faudra pour
   le parcours de Saint-Maixent. */
const CORRIDOR=+opt('corridor',80);
const TRACE_F=opt('trace');
if(TRACE_F && fs.existsSync(TRACE_F)){
  const t=fs.readFileSync(TRACE_F,'utf8');
  const tp=[];
  const re=/<trkpt[^>]*lat="([-0-9.]+)"[^>]*lon="([-0-9.]+)"/g;
  let m;
  while((m=re.exec(t))) tp.push([pX(+m[2]),pZ(+m[1])]);
  if(!tp.length){
    try{ JSON.parse(t).forEach(q=>tp.push([pX(q[1]||q.lo),pZ(q[0]||q.la)])); }catch(e){}
  }
  if(tp.length<2){ console.error('trace illisible : '+TRACE_F); process.exit(1); }
  let hors=0;
  for(const e of aretes){
    if(e.mort) continue;
    const A=noeuds.get(e.a), B=noeuds.get(e.b);
    const mx=(A[0]+B[0])/2, mz=(A[1]+B[1])/2;
    let d=1e9;
    for(let i=1;i<tp.length;i++) d=Math.min(d,distSegment(mx,mz,tp[i-1],tp[i]));
    if(d>CORRIDOR){ e.horsCadre=true; hors++; }
  }
  console.log('rues candidates bornées au corridor de '+CORRIDOR+' m autour de la trace ('+
              tp.length+' points) : '+hors+' tronçons écartés');
}
if(RAYON>0 && DEPART.length===2){
  const rx=pX(+DEPART[1]), rz=pZ(+DEPART[0]);
  let hors=0;
  for(const e of aretes){
    if(e.mort) continue;
    const A=noeuds.get(e.a), B=noeuds.get(e.b);
    const d=Math.min(Math.hypot(A[0]-rx,A[1]-rz), Math.hypot(B[0]-rx,B[1]-rz));
    if(d>RAYON){ e.horsCadre=true; hors++; }
  }
  console.log('rues candidates bornées à '+RAYON+' m du départ : '+hors+' tronçons écartés');
}

/* ------------------------- ou bien : passer par des points imposés --------
   Pour un essai court, ce qu'on veut n'est pas la couverture maximale mais
   quelques bâtiments remarquables relevés proprement. On donne alors la liste
   des points à visiter, dans l'ordre, et l'itinéraire les relie par le
   réseau : la boucle passe où il faut au lieu d'aller chercher des maisons
   anonymes au fond d'une ruelle parce qu'elles rapportent un point de plus. */
if(ETAPES_F){
  const cibles=ETAPES_F.split(';').map(t=>t.split(',')).filter(c=>c.length===2)
    .map(c=>({x:pX(+c[1]), z:pZ(+c[0])}));
  if(cibles.length<2){ console.error('--etapes demande au moins deux points « la,lo » séparés par ;'); process.exit(1); }
  const proche=q=>{ let m=null, bd=1e9;
    for(const [k,p] of noeuds){ const d=Math.hypot(p[0]-q.x,p[1]-q.z); if(d<bd){ bd=d; m=k; } }
    return m; };
  const sommets=cibles.map(proche);
  sommets.push(sommets[0]);                     /* refermer la boucle */
  const suite=[];
  for(let i=1;i<sommets.length;i++){
    const {prec}=chemin(sommets[i-1],(id,L)=>L);
    const r=remonter(prec,sommets[i]);
    if(!r.length && sommets[i]!==sommets[i-1]){
      console.error('étape '+i+' non reliée au réseau'); process.exit(1);
    }
    for(const pas of r) suite.push(pas);
  }
  let L=0;
  for(const pas of suite){ itineraire.push(pas); L+=aretes[pas.id].L; encaisser(aretes[pas.id]); }
  longueur=L;
  console.log('itinéraire imposé : '+cibles.length+' étapes, '+(L/1000).toFixed(2)+' km');
}


if(!ETAPES_F) for(;;){
  /* les tronçons déjà parcourus ne coûtent presque rien : repasser dans une
     rue déjà faite est le prix normal d'un aller-retour en cul-de-sac */
  const {d,prec}=chemin(noeudCourant,(id,L)=>marchees.has(id)?L*0.35:L);
  let meilleur=null;
  for(const e of aretes){
    if(e.mort || e.horsCadre || marchees.has(e.id)) continue;
    const g=gainArete(e);
    if(g<=0) continue;
    const da=d.has(e.a)?d.get(e.a):1e18, db=d.has(e.b)?d.get(e.b):1e18;
    const acces=Math.min(da,db);
    if(acces>1e17) continue;
    const cout=acces+e.L;
    const r=g/Math.max(1,cout);
    if(!meilleur || r>meilleur.r) meilleur={e,r,g,acces,fin:(da<=db?e.b:e.a),debut:(da<=db?e.a:e.b)};
  }
  if(!meilleur) break;
  if(longueur+meilleur.acces+meilleur.e.L>BUDGET) break;
  /* rejoindre puis parcourir */
  const route=remonter(prec,meilleur.debut);
  for(const pas of route){
    itineraire.push(pas);
    longueur+=aretes[pas.id].L;
    if(!marchees.has(pas.id)) encaisser(aretes[pas.id]);
  }
  itineraire.push({de:meilleur.debut,vers:meilleur.fin,id:meilleur.e.id});
  longueur+=meilleur.e.L;
  encaisser(meilleur.e);
  noeudCourant=meilleur.fin;
}

/* retour au départ, pour boucler */
if(DEPART.length===2 && !ETAPES_F){
  const dx=pX(+DEPART[1]), dz=pZ(+DEPART[0]);
  let cible=null, bd=1e9;
  for(const [k,q] of noeuds){ const d=Math.hypot(q[0]-dx,q[1]-dz); if(d<bd){ bd=d; cible=k; } }
  const {prec}=chemin(noeudCourant,(id,L)=>marchees.has(id)?L*0.35:L);
  for(const pas of remonter(prec,cible)){ itineraire.push(pas); longueur+=aretes[pas.id].L; }
}

/* ------------------------------------------------------------- résultats - */
const couverts1=[...vus.keys()].filter(b=>vus.get(b)>=1).length;
const couverts2=[...vus.keys()].filter(b=>vus.get(b)>=2).length;
/* Le bourg d'abord. Le carré de la carte fait 1 800 m de côté et contient
   des fermes et des chemins de campagne : mesurée sur tout, la couverture
   paraît médiocre alors que le centre est fait. On la donne donc aussi sur
   un disque autour du départ, qui est ce qu'on cherche à relever. */
const RCOEUR=+opt('coeur',400);
let coeur=0, coeurVus=0, coeurVus2=0;
if(DEPART.length===2){
  const ccx=pX(+DEPART[1]), ccz=pZ(+DEPART[0]);
  BATS.forEach(b=>{
    if(Math.hypot(b.cx-ccx,b.cz-ccz)>RCOEUR) return;
    if(!atteignables.has(b.i)) return;
    coeur++;
    const n=vus.get(b.i)||0;
    if(n>=1) coeurVus++;
    if(n>=2) coeurVus2++;
  });
}
console.log('');
console.log('=== itinéraire : '+(longueur/1000).toFixed(2)+' km, '+itineraire.length+' tronçons ===');
console.log('  bâtiments vus au moins une fois : '+couverts1+'  ('+
            (couverts1/atteignables.size*100).toFixed(0)+' % des visibles depuis la rue)');
console.log('  vus de deux points de vue ou plus : '+couverts2+'  ('+
            (couverts2/atteignables.size*100).toFixed(0)+' %)');
if(coeur) console.log('  dans les '+RCOEUR+' m du départ : '+coeurVus+' vus et '+coeurVus2+
  ' de deux points de vue, sur '+coeur+' visibles  ('+
  (coeurVus/coeur*100).toFixed(0)+' % et '+(coeurVus2/coeur*100).toFixed(0)+' %)');
const photos=Math.round(longueur/PAS);
console.log('  à une photo tous les '+PAS+' m : environ '+photos+' images, '+
            Math.round(longueur/1000/4.8*60)+' min de marche à 4,8 km/h');

/* ------------------------------------------- les points remarquables ----
   Sur un essai court, le chiffre qui compte n'est pas un pourcentage sur
   quatre cents maisons : c'est de savoir si la mairie, l'église et les
   commerces sont vus, et de combien de points de vue. On relit donc les
   objets nommés de l'export et on regarde le bâtiment qui les porte. */
const POIS=[];
if(OSM && fs.existsSync(OSM)){
  const geo=JSON.parse(fs.readFileSync(OSM,'utf8'));
  const INTERESSANT=t=>t.shop||t.office||t.craft||
    (t.amenity && !['parking','bench','waste_basket','bicycle_parking','recycling',
                    'post_box','crossing','drinking_water','atm'].includes(t.amenity))||
    t.tourism||t.historic||(t.building && ['church','chapel','public','civic'].includes(t.building));
  for(const f of geo.features||[]){
    const t=f.properties||{}, g=f.geometry;
    if(!g || !INTERESSANT(t)) continue;
    let sx=0,sz=0,n=0;
    (function s(c){ if(typeof c[0]==='number'){ sx+=pX(c[0]); sz+=pZ(c[1]); n++; } else c.forEach(s); })(g.coordinates);
    const x=sx/n, z=sz/n;
    /* le bâtiment qui le porte : le plus proche à moins de vingt mètres */
    let bi=-1, bd=20;
    for(const b of BATS){ const d=Math.hypot(b.cx-x,b.cz-z); if(d<bd){ bd=d; bi=b.i; } }
    if(bi<0) continue;
    const quoi=t.shop||t.amenity||t.tourism||t.historic||t.office||t.craft||t.building;
    const ds=(distances.get(bi)||[]).slice().sort((x,y)=>x-y);
    POIS.push({bi, quoi, nom:t.name||'', vues:vus.get(bi)||0,
               dmed:ds.length?Math.round(ds[ds.length>>1]):null,
               dmin:ds.length?Math.round(ds[0]):null,
               dmax:ds.length?Math.round(ds[ds.length-1]):null});
  }
}
if(POIS.length){
  /* un bâtiment peut porter plusieurs objets : on garde le plus parlant */
  const parBat=new Map();
  for(const o of POIS){
    const v=parBat.get(o.bi);
    if(!v || (o.nom && !v.nom)) parBat.set(o.bi,o);
  }
  const liste=[...parBat.values()].sort((a,b)=>b.vues-a.vues);
  const dedans=liste.filter(o=>o.vues>0);
  console.log('');
  console.log('points remarquables relevés : '+dedans.length+' sur '+liste.length+' dans la carte');
  dedans.slice(0,+opt('combien',30)).forEach(o=>console.log('  '+String(o.vues).padStart(3)+
    ' vues   de '+String(o.dmin).padStart(2)+' à '+String(o.dmax).padStart(2)+
    ' m, médiane '+String(o.dmed).padStart(2)+' m   '+o.quoi.padEnd(18)+o.nom));
}

/* la trace, en points géographiques */
const trace=[];
for(const pas of itineraire){
  const A=noeuds.get(pas.de), B=noeuds.get(pas.vers);
  if(!trace.length) trace.push(A);
  trace.push(B);
}
const gpx='<?xml version="1.0" encoding="UTF-8"?>\n'+
 '<gpx version="1.1" creator="plan_360.js" xmlns="http://www.topografix.com/GPX/1/1">\n'+
 ' <metadata><name>Relevé 360 — '+path.basename(SORTIE)+'</name>\n'+
 '  <desc>'+(longueur/1000).toFixed(2)+' km, '+couverts2+' bâtiments vus de deux points de vue</desc>\n'+
 ' </metadata>\n <trk><name>Relevé 360</name><trkseg>\n'+
 trace.map(q=>'  <trkpt lat="'+laDeZ(q[1]).toFixed(7)+'" lon="'+loDeX(q[0]).toFixed(7)+'"/>').join('\n')+
 '\n </trkseg></trk>\n</gpx>\n';
fs.writeFileSync(SORTIE+'.gpx',gpx);

/* l'itinéraire écrit : on regroupe les tronçons consécutifs de même nom */
const etapes=[];
for(const pas of itineraire){
  const A=noeuds.get(pas.de), B=noeuds.get(pas.vers);
  const nom=nomProche((A[0]+B[0])/2,(A[1]+B[1])/2) || '(sans nom)';
  const L=aretes[pas.id].L;
  if(etapes.length && etapes[etapes.length-1].nom===nom) etapes[etapes.length-1].L+=L;
  else etapes.push({nom,L});
}
const fusion=etapes.filter(e=>e.L>=25);
/* l'intervalle qui correspond au pas d'échantillonnage, à 4,8 km/h */
const SECONDES=Math.round(PAS/(4.8/3.6));
let md='# Relevé 360 — itinéraire\n\n'+
 '**'+(longueur/1000).toFixed(2)+' km**, environ '+photos+' photos à une toutes les '+
 SECONDES+' secondes, '+Math.round(longueur/1000/4.8*60)+' minutes de marche sans les arrêts.\n\n'+
 'Couverture : '+couverts1+' bâtiments vus au moins une fois et '+couverts2+
 ' de deux points de vue, sur '+atteignables.size+' visibles depuis une rue ('+BATS.length+
 ' emprises au total — les remises de fond de jardin ne se voient d’aucune rue).\n\n'+
 (coeur? ('Dans les '+RCOEUR+' m du départ, c’est-à-dire le bourg : **'+
   (coeurVus2/coeur*100).toFixed(0)+' %** des '+coeur+' bâtiments visibles sont vus de deux '+
   'points de vue ('+(coeurVus/coeur*100).toFixed(0)+' % au moins une fois).\n\n') : '')+
 '## Dans l’ordre\n\n';
fusion.forEach((e,i)=>{ md+=(i+1)+'. **'+e.nom+'** — '+Math.round(e.L)+' m\n'; });
if(typeof POIS!=='undefined' && POIS.length){
  const parBat2=new Map();
  for(const o of POIS){ const v=parBat2.get(o.bi); if(!v || (o.nom && !v.nom)) parBat2.set(o.bi,o); }
  const d2=[...parBat2.values()].filter(o=>o.vues>0).sort((a,b)=>b.vues-a.vues);
  if(d2.length){
    md+='\n## Points remarquables relevés\n\n'+
        '| objet | nom | points de vue | distances |\n|---|---|---|---|\n';
    d2.forEach(o=>{ md+='| '+o.quoi+' | '+(o.nom||'—')+' | '+o.vues+' | '+
      o.dmin+' à '+o.dmax+' m (médiane '+o.dmed+') |\n'; });
  }
}
md+='\nLes tronçons de moins de 25 m (traversées, raccords) ne sont pas listés ; '+
    'la trace GPX les contient.\n';
fs.writeFileSync(SORTIE+'.md',md);
console.log('  écrit '+SORTIE+'.gpx et '+SORTIE+'.md');
