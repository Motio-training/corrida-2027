/* Fabrique les blocs de données du moteur à partir d'un export OpenStreetMap.

   Le moteur ne lit pas d'OSM : il lit des blocs de texte tabulés, embarqués
   dans la page, où tout est en décimètres dans un repère local. Ces blocs
   existaient pour Saint-Maixent sans qu'aucun outil ne sache les refaire —
   c'est ce trou que comble ce script, pour pouvoir monter une deuxième
   carte (La Mothe-Saint-Héray) et, plus tard, remettre à jour la première.

   Entrée : un export GeoJSON d'overpass-turbo (FeatureCollection, tags OSM
   dans « properties »). Sortie : un fichier HTML de blocs <script> prêt à
   inclure, plus un résumé de ce qui a été reconnu.

   Usage :
     node outils/carte_depuis_osm.js <export.geojson> \
          --sortie village/donnees.html \
          [--centre 46.3617,-0.0703] [--rayon 900] [--sol 90]

   --centre : origine du repère local (par défaut : le centre des données)
   --rayon  : demi-côté de la carte, en mètres (par défaut 900)
   --sol    : altitude de la nappe de relief, en mètres (par défaut : la
              médiane des altitudes trouvées, sinon 100). Le relief fin
              viendra plus tard des altitudes GPS de la sortie 360.        */

const fs=require('fs'), path=require('path');

/* ---------------------------------------------------------------- lecture */
const args=process.argv.slice(2);
const entree=args.find(a=>!a.startsWith('--'));
function opt(nom,def){ const i=args.indexOf('--'+nom); return i<0?def:args[i+1]; }
if(!entree){
  console.error('usage : node outils/carte_depuis_osm.js <export.geojson> --sortie <fichier.html> [--centre la,lo] [--rayon 900]');
  process.exit(1);
}
const sortie=opt('sortie','carte-osm.html');
const RAYON=+opt('rayon',900);
const geo=JSON.parse(fs.readFileSync(entree,'utf8'));
const feats=(geo.features||[]).filter(f=>f&&f.geometry);
if(!feats.length){ console.error('aucun objet dans '+entree); process.exit(1); }

/* ------------------------------------------------- repère local, en mètres */
let LA0, LO0;
if(opt('centre')){
  const c=opt('centre').split(','); LA0=+c[0]; LO0=+c[1];
} else {
  let la0=90, la1=-90, lo0=180, lo1=-180;
  const vus=p=>{ lo0=Math.min(lo0,p[0]); lo1=Math.max(lo1,p[0]); la0=Math.min(la0,p[1]); la1=Math.max(la1,p[1]); };
  feats.forEach(f=>parcourir(f.geometry,vus));
  LA0=(la0+la1)/2; LO0=(lo0+lo1)/2;
}
const PI=Math.PI, f0=LA0*PI/180;
const MLAT=111132.92-559.82*Math.cos(2*f0)+1.175*Math.cos(4*f0)-0.0023*Math.cos(6*f0);
const MLON=111412.84*Math.cos(f0)-93.5*Math.cos(3*f0)+0.118*Math.cos(5*f0);
const pX=lo=>(lo-LO0)*MLON, pZ=la=>(LA0-la)*MLAT;

function parcourir(g,fn){
  if(!g) return;
  if(g.type==='Point') fn(g.coordinates);
  else if(g.type==='LineString'||g.type==='MultiPoint') g.coordinates.forEach(fn);
  else if(g.type==='Polygon'||g.type==='MultiLineString') g.coordinates.forEach(a=>a.forEach(fn));
  else if(g.type==='MultiPolygon') g.coordinates.forEach(a=>a.forEach(b=>b.forEach(fn)));
  else if(g.type==='GeometryCollection') (g.geometries||[]).forEach(x=>parcourir(x,fn));
}
/* les contours d'un objet, en mètres, sans le point de fermeture */
function contours(g){
  const out=[];
  const conv=a=>{
    const p=a.map(q=>[pX(q[0]),pZ(q[1])]);
    if(p.length>2 && Math.hypot(p[0][0]-p[p.length-1][0],p[0][1]-p[p.length-1][1])<0.05) p.pop();
    return p;
  };
  if(!g) return out;
  if(g.type==='LineString') out.push(conv(g.coordinates));
  else if(g.type==='MultiLineString') g.coordinates.forEach(a=>out.push(conv(a)));
  else if(g.type==='Polygon') out.push(conv(g.coordinates[0]));
  else if(g.type==='MultiPolygon') g.coordinates.forEach(a=>out.push(conv(a[0])));
  return out.filter(p=>p.length>=2);
}
function centre(g){
  let x=0,z=0,n=0;
  parcourir(g,q=>{ x+=pX(q[0]); z+=pZ(q[1]); n++; });
  return n?[x/n,z/n]:null;
}
const dedans=p=>p && Math.abs(p[0])<=RAYON && Math.abs(p[1])<=RAYON;

/* --------------------------------------------------------- géométrie utile */
function aireSignee(p){
  let a=0;
  for(let i=0,j=p.length-1;i<p.length;j=i++) a+=p[j][0]*p[i][1]-p[i][0]*p[j][1];
  return a/2;
}
/* boîte englobante d'aire minimale : on essaie chaque côté comme direction */
function boiteMin(p){
  let best=null;
  for(let i=0;i<p.length;i++){
    const j=(i+1)%p.length;
    const dx=p[j][0]-p[i][0], dz=p[j][1]-p[i][1], L=Math.hypot(dx,dz);
    if(L<0.05) continue;
    const c=dx/L, s=dz/L;
    let u0=1e9,u1=-1e9,v0=1e9,v1=-1e9;
    for(const q of p){
      const u=q[0]*c+q[1]*s, v=-q[0]*s+q[1]*c;
      u0=Math.min(u0,u); u1=Math.max(u1,u); v0=Math.min(v0,v); v1=Math.max(v1,v);
    }
    const aire=(u1-u0)*(v1-v0);
    if(!best||aire<best.aire){
      const um=(u0+u1)/2, vm=(v0+v1)/2;
      best={aire, ang:Math.atan2(s,c)*180/PI, ow:u1-u0, ol:v1-v0,
            cx:um*c-vm*s, cz:um*s+vm*c};
    }
  }
  return best;
}
const d10=v=>Math.round(v*10);
const pts10=p=>p.map(q=>d10(q[0])+','+d10(q[1])).join(' ');

/* --------------------------------------------------------- classification */
const T=f=>f.properties||{};
const num=v=>{ const x=parseFloat(String(v||'').replace(',','.')); return isFinite(x)?x:0; };

/* largeur de chaussée par classe, en mètres — mesurée sur Saint-Maixent */
const LARG={motorway:12, trunk:10, primary:9, secondary:8, tertiary:7, unclassified:5.5,
            residential:5.5, living_street:5, service:3.8, road:5.5, pedestrian:5,
            track:3, path:2, footway:2, cycleway:2.5, steps:1.8, bridleway:2};
const VOIE_K=h=>(h==='track')?'t':(h==='path'||h==='footway'||h==='steps'||h==='bridleway'||h==='cycleway')?'s':
              (h==='pedestrian'||h==='living_street')?'v':'r';

/* zones : le code que le moteur attend pour chaque nature de terrain */
function zoneK(t){
  if(t.natural==='water'||t.waterway==='riverbank'||t.landuse==='reservoir'||t.natural==='wetland') return 'w';
  if(t.landuse==='forest'||t.natural==='wood') return 'f';
  if(t.landuse==='industrial'||t.landuse==='commercial'||t.landuse==='retail') return 'i';
  if(t.landuse==='military') return 'M';
  if(t.leisure==='park'||t.leisure==='garden'||t.leisure==='playground') return 'p';
  if(t.landuse==='cemetery'||t.amenity==='grave_yard') return 'c';
  if(t.landuse==='grass'||t.landuse==='meadow'||t.natural==='grassland'||t.natural==='scrub'
     ||t.leisure==='pitch'||t.leisure==='sports_centre') return 'g';
  if(t.amenity==='parking'||t.landuse==='farmyard'||t.highway==='pedestrian') return 'k';
  if(t.landuse==='orchard'||t.landuse==='vineyard'||t.landuse==='farmland'||t.landuse==='allotments') return 'a';
  return null;
}
/* bâtiments : lettre de nature, puis indice de fonction pour d-types */
function batK(t){
  const b=(t.building||'').toLowerCase();
  if(b==='church'||b==='chapel'||t.amenity==='place_of_worship') return 'e';
  if(b==='industrial'||b==='warehouse'||b==='factory') return 'i';
  if(b==='garage'||b==='garages'||b==='shed'||b==='hut'||b==='carport'||b==='roof') return 'g';
  return 'y';
}
function fonction(t){
  if(t.amenity==='townhall'||t.building==='civic'&&/mairie/i.test(t.name||'')) return 'M';
  if(t.building==='church'||t.building==='chapel'||t.amenity==='place_of_worship') return 'E';
  if(t.amenity==='school'||t.amenity==='college'||t.amenity==='kindergarten'||t.building==='school') return 'S';
  if(t.amenity==='post_office'||t.amenity==='police'||t.amenity==='fire_station'
     ||t.amenity==='hospital'||t.building==='public') return 'P';
  if(t.tourism==='hotel'||t.building==='hotel') return 'H';
  if(t.building==='industrial'||t.building==='warehouse'||t.man_made==='works') return 'I';
  if(t.building==='garages'||t.building==='barn'||t.building==='farm_auxiliary') return 'G';
  if(t.shop||t.amenity==='restaurant'||t.amenity==='cafe'||t.amenity==='bar'||t.amenity==='bank'
     ||t.amenity==='pharmacy'||t.amenity==='bakery'||t.building==='retail'||t.building==='commercial') return 'C';
  return null;
}
/* mobilier urbain : la lettre attendue par construireMobilier */
function mobK(t){
  if(t.highway==='crossing'||t.footway==='crossing') return 'C';
  if(t.highway==='street_lamp') return 'L';
  if(t.highway==='stop') return 'S';
  if(t.highway==='give_way') return 'Y';
  if(t.highway==='traffic_signals') return 'F';
  if(t.amenity==='bench') return 'B';
  if(t.amenity==='waste_basket') return 'P';
  if(t.natural==='tree') return 'T';
  if(t.historic==='memorial'||t.historic==='monument'||t.tourism==='artwork') return 'M';
  if(t.amenity==='fountain') return 'W';
  if(t.amenity==='drinking_water') return 'E';
  if(t.barrier==='gate'||t.barrier==='bollard') return 'G';
  if(t.amenity==='recycling'||t.amenity==='post_box'||t.amenity==='telephone') return 'V';
  return null;
}
const LIGNE_K=t=>(t.barrier==='wall'||t.barrier==='city_wall'||t.barrier==='retaining_wall')?'m'
               :(t.barrier==='hedge'||t.natural==='hedge')?'h'
               :(t.barrier==='fence'||t.barrier==='railing'||t.barrier==='guard_rail')?'f'
               :(t.barrier)?'t':null;

/* --------------------------------------------------------------- tri */
const bats=[], voies=[], zones=[], lgn=[], mob=[], types=[], topo=[];
const compte={};
const plus=k=>{ compte[k]=(compte[k]||0)+1; };

for(const f of feats){
  const t=T(f), g=f.geometry;
  const c=centre(g);
  if(!dedans(c)) { plus('hors cadre'); continue; }

  if(t.building && g.type!=='Point'){
    for(const p of contours(g)){
      if(p.length<3) continue;
      const b=boiteMin(p);
      if(!b||b.ow<1||b.ol<1) continue;
      const aire=Math.abs(aireSignee(p));
      if(aire<4) continue;
      const rect=Math.max(1,Math.min(100,Math.round(100*aire/(b.ow*b.ol))));
      const lv=Math.round(num(t['building:levels']));
      const ht=num(t.height)||num(t['building:height']);
      /* sens direct, comme les emprises de Saint-Maixent */
      const q=(aireSignee(p)<0)?p.slice().reverse():p;
      bats.push([batK(t), rect, d10(b.ang), d10(b.cx), d10(b.cz), d10(b.ow), d10(b.ol),
                 Math.round(aire), lv, d10(ht), pts10(q)].join('\t'));
      const fn=fonction(t);
      if(fn) types.push([fn,'p',d10(b.cx)+','+d10(b.cz)].join('\t'));
      plus('bâtiment');
    }
    continue;
  }
  if(t.highway && (g.type==='LineString'||g.type==='MultiLineString')){
    const k=VOIE_K(t.highway);
    let w=LARG[t.highway]||4;
    if(t.lanes && num(t.lanes)>2) w=Math.max(w,num(t.lanes)*3.2);
    if(t.width && num(t.width)>1) w=num(t.width);
    for(const p of contours(g)){
      if(p.length<2) continue;
      voies.push([k, d10(w), t.oneway==='yes'?1:0, pts10(p), 0, t.highway].join('\t'));
      plus('voie');
    }
    continue;
  }
  if(t.waterway && (g.type==='LineString'||g.type==='MultiLineString')){
    for(const p of contours(g)){ topo.push(['RIV','',0,pts10(p)].join('\t')); plus('cours d’eau'); }
    continue;
  }
  const zk=zoneK(t);
  if(zk && (g.type==='Polygon'||g.type==='MultiPolygon')){
    for(const p of contours(g)){
      if(p.length<3) continue;
      zones.push([zk, Math.round(Math.abs(aireSignee(p))), pts10(p)].join('\t'));
      plus('zone '+zk);
    }
    continue;
  }
  const lk=LIGNE_K(t);
  if(lk && (g.type==='LineString'||g.type==='MultiLineString')){
    for(const p of contours(g)){ lgn.push([lk,pts10(p)].join('\t')); plus('clôture/mur'); }
    continue;
  }
  const mk=mobK(t);
  if(mk && g.type==='Point'){
    mob.push([mk, g.coordinates[1].toFixed(7), g.coordinates[0].toFixed(7)].join('\t'));
    plus('mobilier '+mk);
    continue;
  }
  plus('ignoré');
}

/* ------------------------------------------------- nappe de relief, à plat */
const SOL=+opt('sol', 100);
const GCOLS=Math.round(2*RAYON/5)+1, GROWS=GCOLS;
const ele=new Array(GROWS*GCOLS).fill(Math.round(SOL*100)).join('\n');
/* Le moteur lit d'abord l'ancien relief 25 m (« d-ele », grille fixe de
   33 × 41 nœuds en décimètres) avant d'être écrasé par le relief fin.
   Sans ce bloc, ELE serait un tableau vide et les premières lectures de
   hauteur() rendraient NaN : on le remplit de la même nappe. */
const ANC_ROWS=33, ANC_COLS=41;
const eleAnc=new Array(ANC_ROWS*ANC_COLS).fill(Math.round(SOL*10)).join('\n');

/* ------------------------------------------------------------- écriture */
function bloc(id,lignes){
  return '<script type="text/plain" id="'+id+'">\n'+lignes.join('\n')+'\n</script>\n';
}
const GLA0=LA0-RAYON/MLAT, GLA1=LA0+RAYON/MLAT, GLO0=LO0-RAYON/MLON, GLO1=LO0+RAYON/MLON;
const entete='<!-- Carte fabriquée par outils/carte_depuis_osm.js depuis '+path.basename(entree)+'\n'+
  '     origine '+LA0.toFixed(7)+', '+LO0.toFixed(7)+'  rayon '+RAYON+' m -->\n'+
  '<script>window.CARTE_ORIGINE={la:'+LA0.toFixed(7)+', lo:'+LO0.toFixed(7)+
  ', gla0:'+GLA0.toFixed(7)+', gla1:'+GLA1.toFixed(7)+', glo0:'+GLO0.toFixed(7)+', glo1:'+GLO1.toFixed(7)+
  ', grows:'+GROWS+', gcols:'+GCOLS+'};</script>\n';
fs.mkdirSync(path.dirname(path.resolve(sortie)),{recursive:true});
fs.writeFileSync(sortie, entete+
  bloc('d-bats',bats)+bloc('d-voies',voies)+bloc('d-zones',zones)+
  bloc('d-lignes',lgn)+bloc('d-types',types)+bloc('d-topo',topo)+
  bloc('d-mobilier',mob)+bloc('d-ele',[eleAnc])+bloc('d-ele5',[ele]));

console.log('=== '+path.basename(entree)+' → '+sortie+' ===');
console.log('  origine ('+LA0.toFixed(6)+', '+LO0.toFixed(6)+'), carte de '+(2*RAYON)+' × '+(2*RAYON)+' m');
console.log('  bâtiments '+bats.length+'   voies '+voies.length+'   zones '+zones.length+
            '   clôtures '+lgn.length+'   mobilier '+mob.length+'   cours d’eau '+topo.length);
console.log('  relief : nappe plate de '+GROWS+' × '+GCOLS+' nœuds à '+SOL+' m');
const det=Object.entries(compte).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+v).join(', ');
console.log('  détail : '+det);
if(!bats.length) console.log('  ⚠ aucun bâtiment : vérifier que l’export contient bien les tags (Overpass « out geom »)');
