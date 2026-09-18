/* Le relief du village, depuis les altitudes GPS de la sortie.

   La carte du bourg sort du convertisseur sur une nappe plate : aucune
   source d'altitude n'est joignable depuis l'environnement de développement
   — ni EU-DEM, ni SRTM, ni aucune API d'élévation. Pour un bourg de vallée
   comme La Mothe-Saint-Héray, ça se voit : la Sèvre, les neuf lavoirs et le
   coteau sont posés sur une table.

   Ce que la sortie 360 rapporte comble ce trou. Chaque photo porte sa
   position et son altitude, et une trace GPX en donne bien davantage. Cela
   ne vaut pas un modèle numérique de terrain — c'est une altitude par point
   de passage, bruitée, et seulement le long des rues — mais un profil de
   vallée approché vaut mieux qu'une table.

   Méthode. On lisse d'abord l'altitude le long de la trace : le bruit d'un
   GPS en altitude est de haute fréquence, quelques mètres d'une seconde à
   l'autre, alors que le terrain varie lentement. Médiane glissante, puis
   moyenne. On interpole ensuite sur la grille du moteur par pondération en
   1/(d² + s²), avec s de vingt-cinq mètres : loin de toute mesure
   l'estimation tend doucement vers la moyenne générale, sans le plateau à
   bord franc qu'une distance de coupure produirait.

   Un décalage constant est invisible : le moteur n'utilise que des altitudes
   relatives entre elles. Que le GPS donne la hauteur sur l'ellipsoïde ou sur
   le géoïde ne change donc rien.

   Usage :
     node outils/relief_depuis_gps.js trace.gpx [photos/] \
          --donnees village/donnees.html [--lissage 25]

   Remplace les blocs d-ele et d-ele5 du fichier de données.              */

const fs=require('fs'), path=require('path');
const ARG=process.argv.slice(2);
function opt(n,d){ const i=ARG.indexOf('--'+n); return i<0?d:ARG[i+1]; }
const ENTREES=ARG.filter(a=>!a.startsWith('--')).filter((a,i,t)=>{
  /* les valeurs d'option ne sont pas des entrées */
  const j=ARG.indexOf(a); return j===0 || !String(ARG[j-1]||'').startsWith('--');
});
const DONNEES=opt('donnees','village/donnees.html');
const LISSAGE=+opt('lissage',12);
if(!ENTREES.length){
  console.error('usage : node outils/relief_depuis_gps.js <trace.gpx|dossier de photos> --donnees <fichier>');
  process.exit(1);
}

/* ------------------------------------------------------- les échantillons */
const pts=[];     /* {la, lo, ele, t} */
function lireGpx(f){
  const s=fs.readFileSync(f,'utf8');
  const re=/<trkpt[^>]*lat="([-0-9.]+)"[^>]*lon="([-0-9.]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
  let m, n=0;
  while((m=re.exec(s))){
    const dedans=m[3];
    const e=dedans.match(/<ele>([-0-9.]+)<\/ele>/);
    const t=dedans.match(/<time>([^<]+)<\/time>/);
    if(!e) continue;
    pts.push({la:+m[1], lo:+m[2], ele:+e[1], t:t?Date.parse(t[1]):null});
    n++;
  }
  /* certaines applis écrivent <trkpt .../> sans contenu : sans altitude, rien à faire */
  console.log('  '+path.basename(f)+' : '+n+' points avec altitude');
}
function lireManifeste(d){
  const f=path.join(d,'manifeste.json');
  if(!fs.existsSync(f)) return 0;
  const m=JSON.parse(fs.readFileSync(f,'utf8'));
  let n=0;
  for(const p of (m.photos||[])){
    if(p.la===undefined || p.alt===undefined || p.alt===null) continue;
    pts.push({la:p.la, lo:p.lo, ele:+p.alt, t:p.t?Date.parse(p.t):null});
    n++;
  }
  console.log('  '+path.basename(d)+'/manifeste.json : '+n+' photos avec altitude');
  return n;
}
for(const e of ENTREES){
  if(!fs.existsSync(e)){ console.error('introuvable : '+e); process.exit(1); }
  if(fs.statSync(e).isDirectory()) lireManifeste(e);
  else if(/\.gpx$/i.test(e)) lireGpx(e);
  else console.error('  ignoré (ni .gpx ni dossier) : '+e);
}
if(pts.length<20){ console.error('trop peu d’altitudes ('+pts.length+') pour en tirer un relief'); process.exit(1); }

/* ------------------------------------------------------------- lissage ---
   Le bruit du GPS en altitude est de haute fréquence : médiane glissante
   pour écarter les sauts francs, puis moyenne pour le reste. On mesure au
   passage ce qu'on a retiré — c'est l'indicateur de confiance du relief. */
pts.sort((a,b)=>(a.t||0)-(b.t||0));
const brut=pts.map(p=>p.ele);
const med=(a)=>{ const b=a.slice().sort((x,y)=>x-y); return b[b.length>>1]; };
const m1=brut.map((_,i)=>med(brut.slice(Math.max(0,i-4),Math.min(brut.length,i+5))));
const liss=m1.map((_,i)=>{ const f=m1.slice(Math.max(0,i-2),Math.min(m1.length,i+3));
  return f.reduce((s,v)=>s+v,0)/f.length; });
pts.forEach((p,i)=>{ p.ele=liss[i]; });
const residus=brut.map((v,i)=>v-liss[i]);
const ecart=Math.sqrt(residus.reduce((s,v)=>s+v*v,0)/residus.length);
console.log('altitudes : '+Math.min(...liss).toFixed(1)+' à '+Math.max(...liss).toFixed(1)+
            ' m, dénivelé '+(Math.max(...liss)-Math.min(...liss)).toFixed(1)+' m');
console.log('bruit retiré par le lissage : '+ecart.toFixed(2)+' m d’écart type'+
            (ecart>6?'   ⚠ beaucoup : le relief obtenu sera grossier':''));

/* ------------------------------------------------- la grille du moteur --- */
const src=fs.readFileSync(DONNEES,'utf8');
const mo=src.match(/window\.CARTE_ORIGINE\s*=\s*\{([^}]*)\}/);
if(!mo){ console.error('pas de window.CARTE_ORIGINE dans '+DONNEES); process.exit(1); }
const g=t=>{ const r=mo[1].match(new RegExp(t+'\\s*:\\s*(-?[0-9.]+)')); return r?+r[1]:null; };
const LA0=g('la'), LO0=g('lo');
const GLA0=g('gla0'), GLA1=g('gla1'), GLO0=g('glo0'), GLO1=g('glo1');
const GROWS=g('grows'), GCOLS=g('gcols');
const PI=Math.PI, f0=LA0*PI/180;
const MLAT=111132.92-559.82*Math.cos(2*f0)+1.175*Math.cos(4*f0)-0.0023*Math.cos(6*f0);
const MLON=111412.84*Math.cos(f0)-93.5*Math.cos(3*f0)+0.118*Math.cos(5*f0);
const pX=lo=>(lo-LO0)*MLON, pZ=la=>(LA0-la)*MLAT;
const XMIN=pX(GLO0), XMAX=pX(GLO1), ZMAX=pZ(GLA0), ZMIN=pZ(GLA1);
const PASX=(XMAX-XMIN)/(GCOLS-1), PASZ=(ZMAX-ZMIN)/(GROWS-1);
console.log('grille : '+GROWS+' × '+GCOLS+' nœuds, pas '+PASX.toFixed(1)+' × '+PASZ.toFixed(1)+' m');

pts.forEach(p=>{ p.x=pX(p.lo); p.z=pZ(p.la); });
const moyenne=liss.reduce((s,v)=>s+v,0)/liss.length;

/* Pondération en 1/(d² + s²) sur les vingt-quatre mesures les plus proches,
   plus un terme de fond qui ne pèse qu'au loin.

   Le premier jet prenait toutes les mesures et donnait au fond un poids
   calculé sur quatre fois la longueur de lissage : sur trois cents points, la
   somme des contributions lointaines et ce terme de fond portaient à eux deux
   la moitié du poids partout, et le relief sortait écrasé vers la moyenne —
   trois mètres d'écart sur la trace elle-même, là où l'on connaît l'altitude
   à un mètre près. En ne gardant que le voisinage et en plaçant le terme de
   fond à cent cinquante mètres, il ne pèse plus que là où il n'y a vraiment
   rien.                                                                  */
const s2=LISSAGE*LISSAGE;
const VOISINS=+opt('voisins',24);
const FOND=+opt('fond',150);
const w0=1/(FOND*FOND+s2);
/* seaux de 50 m pour ne pas balayer toutes les mesures à chaque nœud */
const SEAU=50, cases=new Map();
pts.forEach(p=>{
  const k=Math.floor(p.x/SEAU)+'_'+Math.floor(p.z/SEAU);
  if(!cases.has(k)) cases.set(k,[]);
  cases.get(k).push(p);
});
function voisinage(x,z){
  const gx=Math.floor(x/SEAU), gz=Math.floor(z/SEAU);
  for(let r=1;r<=12;r++){
    const out=[];
    for(let a=-r;a<=r;a++) for(let b=-r;b<=r;b++){
      const c=cases.get((gx+a)+'_'+(gz+b));
      if(c) for(const p of c) out.push(p);
    }
    if(out.length>=VOISINS || r===12) return out;
  }
  return [];
}
const ELE=new Float64Array(GROWS*GCOLS);
let contraints=0;
for(let i=0;i<GROWS;i++){
  const z=ZMAX-i*PASZ;
  for(let j=0;j<GCOLS;j++){
    const x=XMIN+j*PASX;
    const cand=voisinage(x,z);
    const avec=cand.map(p=>[(p.x-x)*(p.x-x)+(p.z-z)*(p.z-z), p.ele]).sort((a,b)=>a[0]-b[0]);
    const pris=avec.slice(0,VOISINS);
    let sw=w0, sv=w0*moyenne;
    for(const [d2,e] of pris){ const w=1/(d2+s2); sw+=w; sv+=w*e; }
    ELE[i*GCOLS+j]=sv/sw;
    if(pris.length && Math.sqrt(pris[0][0])<40) contraints++;
  }
}
console.log('nœuds à moins de 40 m d’une mesure : '+contraints+' sur '+(GROWS*GCOLS)+
            '  ('+(contraints/(GROWS*GCOLS)*100).toFixed(0)+' %)');

/* --------------------------------------------------------- écriture ------ */
function remplacer(s,id,contenu){
  const m=s.indexOf('id="'+id+'"');
  if(m<0) return s;
  const a=s.indexOf('>',m)+1, b=s.indexOf('</script>',a);
  return s.slice(0,a)+'\n'+contenu+'\n'+s.slice(b);
}
const fin5=new Array(GROWS*GCOLS);
for(let k=0;k<ELE.length;k++) fin5[k]=Math.round(ELE[k]*100);
/* le moteur lit d'abord l'ancien relief 25 m, grille fixe de 33 × 41 nœuds
   en décimètres, avant de le remplacer par le relief fin : on le rééchantillonne */
const AR=33, AC=41, anc=new Array(AR*AC);
for(let i=0;i<AR;i++) for(let j=0;j<AC;j++){
  const ii=Math.round(i/(AR-1)*(GROWS-1)), jj=Math.round(j/(AC-1)*(GCOLS-1));
  anc[i*AC+j]=Math.round(ELE[ii*GCOLS+jj]*10);
}
let out=remplacer(src,'d-ele',anc.join('\n'));
out=remplacer(out,'d-ele5',fin5.join('\n'));
fs.writeFileSync(DONNEES,out);
console.log('=== relief écrit dans '+DONNEES+' ===');
console.log('    pense à refaire la page : node outils/page_village.js --osm village/export-osm.geojson');
