/* Relevé des bâtiments depuis des photos 360°.

   Ce que la GoPro Max rapporte d'une sortie à pied : une image
   équirectangulaire tous les dix mètres, avec sa position GPS. Ce qu'il
   faut en tirer : pour chaque emprise OpenStreetMap, sa hauteur réelle, le
   nombre de niveaux, la couleur de son mur et celle de son toit — les trois
   choses que la 3D devine aujourd'hui à partir de la seule surface au sol.

   Le principe est géométrique. Depuis le point GPS, les emprises OSM
   disent déjà quel bâtiment occupe quel azimut et à quelle distance : c'est
   un lancer de rayon, avec occultation, sur des données qu'on possède. Il
   ne reste à lire dans l'image que ce qu'elle seule sait — à quelle
   élévation s'arrête le bâti, et de quelle couleur il est. La hauteur suit :
     hauteur = hauteur de la caméra + distance × tan(élévation du faîte).

   Deux difficultés, et leur traitement :

   1. L'orientation de la caméra. Une image 360° n'a pas de « devant » connu :
      la colonne zéro tombe où le boîtier regardait. Si l'EXIF porte un cap
      (GPSImgDirection), on le prend. Sinon on résout un décalage unique pour
      tout le lot, en cherchant l'angle qui aligne au mieux la silhouette
      mesurée (là où le ciel s'arrête) sur la silhouette prédite par les
      emprises. Un décalage unique, et non un par photo : la caméra est
      portée de la même façon d'un bout à l'autre de la sortie, et un
      paramètre partagé par cent photos est cent fois mieux contraint.

   2. Ce qui n'est pas un mur. Un arbre devant une façade, une voiture, une
      vitre, un ciel couvert : le premier essai de relevé sur photos plates
      s'était fait piéger deux fois — le bitume et les ombres tiraient la
      palette vers le gris, puis le ciel couvert, lisse et clair, se faisait
      compter comme enduit. On écarte donc la verdure à la teinte, le sombre
      à la clarté, et le ciel au contraste local autant qu'à la couleur.

   Usage :
     node outils/relever_360.js <dossier des panoramas> \
          [--page index.html] [--sortie <dossier>/releve.json]
          [--cap 137.5]        cap imposé de la colonne zéro, en degrés
          [--verite]           compare au d-bats existant et chiffre l'écart

   Écrit <dossier>/releve.json et affiche le bloc RELEVE à coller.        */

const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path'), http=require('http');
const RACINE=path.resolve(__dirname,'..');

const ARG=process.argv.slice(2);
const DOSSIER=ARG.find(a=>!a.startsWith('--'));
function opt(n,d){ const i=ARG.indexOf('--'+n); return i<0?d:ARG[i+1]; }
if(!DOSSIER){ console.error('usage : node outils/relever_360.js <dossier> [--page index.html]'); process.exit(1); }
const PAGE=opt('page','index.html');
const SORTIE=opt('sortie', path.join(DOSSIER,'releve.json'));
const CAP_IMPOSE=opt('cap')!==undefined?+opt('cap'):null;
const VERITE=ARG.includes('--verite');

/* grille de travail : 0,25° par pixel, en azimut comme en élévation */
const GW=1440, GH=720, BINS=28;
const PORTEE=70;           /* au-delà, un mur fait moins de 2 px de large */

/* ---------------------------------------------------------------- données */
const PI=Math.PI;
const src=fs.readFileSync(path.join(RACINE,PAGE),'utf8');
function blocTexte(id){
  const m=src.indexOf('id="'+id+'"');
  if(m<0) return '';
  const a=src.indexOf('>',m)+1, b=src.indexOf('</script>',a);
  return src.slice(a,b).trim();
}
/* l'origine du repère : celle de la page si elle en pose une */
let LA0=46.4136975, LO0=-0.2096655;
const mo=src.match(/window\.CARTE_ORIGINE\s*=\s*\{([^}]*)\}/);
if(mo){
  const g=t=>{ const r=mo[1].match(new RegExp(t+'\\s*:\\s*(-?[0-9.]+)')); return r?+r[1]:null; };
  if(g('la')!==null) LA0=g('la');
  if(g('lo')!==null) LO0=g('lo');
}
const f0=LA0*PI/180;
const MLAT=111132.92-559.82*Math.cos(2*f0)+1.175*Math.cos(4*f0)-0.0023*Math.cos(6*f0);
const MLON=111412.84*Math.cos(f0)-93.5*Math.cos(3*f0)+0.118*Math.cos(5*f0);
const pX=lo=>(lo-LO0)*MLON, pZ=la=>(LA0-la)*MLAT;
const loDeX=x=>LO0+x/MLON, laDeZ=z=>LA0-z/MLAT;

const pointsDe=s=>{
  const t=s.split(' '), r=[];
  for(const q of t){ const c=q.split(','); r.push([(+c[0])/10,(+c[1])/10]); }
  return r;
};
const BATS=blocTexte('d-bats').split('\n').filter(l=>l.trim()).map((l,i)=>{
  const c=l.split('\t'); if(c.length<11) return null;
  const p=pointsDe(c[10]); if(p.length<3) return null;
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
  for(const q of p){ x0=Math.min(x0,q[0]); x1=Math.max(x1,q[0]); z0=Math.min(z0,q[1]); z1=Math.max(z1,q[1]); }
  return {i, k:c[0], cx:(+c[3])/10, cz:(+c[4])/10, ow:(+c[5])/10, ol:(+c[6])/10,
          aire:+c[7], lv:+c[8], ht:(+c[9])/10, p, bb:[x0,x1,z0,z1]};
}).filter(Boolean);
console.log('emprises lues : '+BATS.length+'   origine '+LA0.toFixed(6)+', '+LO0.toFixed(6));

/* une grille pour ne tester que les emprises proches */
const CASE=40, GRILLE=new Map();
BATS.forEach(b=>{
  for(let gx=Math.floor(b.bb[0]/CASE);gx<=Math.floor(b.bb[1]/CASE);gx++)
    for(let gz=Math.floor(b.bb[2]/CASE);gz<=Math.floor(b.bb[3]/CASE);gz++){
      const k=gx+'_'+gz; if(!GRILLE.has(k)) GRILLE.set(k,[]); GRILLE.get(k).push(b);
    }
});
function proches(x,z,r){
  const out=new Set();
  for(let gx=Math.floor((x-r)/CASE);gx<=Math.floor((x+r)/CASE);gx++)
    for(let gz=Math.floor((z-r)/CASE);gz<=Math.floor((z+r)/CASE);gz++)
      for(const b of (GRILLE.get(gx+'_'+gz)||[])) out.add(b);
  return [...out];
}

/* -------------------------------- qui occupe quel azimut, vu d'un point ---
   Un rayon par colonne de la grille. On retient le mur le plus proche : les
   bâtiments derrière sont occultés, et c'est justement ce qu'il faut, sinon
   on mesurerait la hauteur du premier sur la silhouette du second.        */
function visibilite(x,z){
  const bat=new Int16Array(GW).fill(-1), dist=new Float32Array(GW).fill(1e9);
  const cand=proches(x,z,PORTEE);
  for(const b of cand){
    const n=b.p.length;
    for(let j=0;j<n;j++){
      const a=b.p[j], c=b.p[(j+1)%n];
      /* le segment vu du point : bornes d'azimut, puis distance par rayon */
      const a1=azDe(a[0]-x,a[1]-z), a2=azDe(c[0]-x,c[1]-z);
      /* Le mur occupe le plus court des deux arcs entre a1 et a2 : un mur de
         quelques mètres vu de dix ne peut pas couvrir un demi-tour. On ordonne
         donc les bornes pour que l'arc croissant d1 → d2 soit le court. Pris
         à l'envers, chaque mur balayait tout le reste de l'horizon et occultait
         le village entier derrière lui. */
      let d1=a1, d2=a2;
      if(((d2-d1+540)%360)<180){ const t=d1; d1=d2; d2=t; }
      const arc=((d2-d1)+360)%360;
      if(arc>150) continue;              /* point posé sur le mur : on s'abstient */
      const u0=Math.ceil(d1/360*GW), u1=Math.floor((d1+arc)/360*GW);
      for(let u=u0;u<=u1;u++){
        const uu=((u%GW)+GW)%GW;
        const az=(uu+0.5)/GW*2*PI;
        const rx=Math.sin(az), rz=-Math.cos(az);
        const sx=c[0]-a[0], sz=c[1]-a[1];
        const den=rx*sz-rz*sx;
        if(Math.abs(den)<1e-9) continue;
        const t=((a[0]-x)*sz-(a[1]-z)*sx)/den;
        const s=((a[0]-x)*rz-(a[1]-z)*rx)/den;
        if(t<=0.5 || s<-0.001 || s>1.001) continue;
        if(t<dist[uu]){ dist[uu]=t; bat[uu]=b.i; }
      }
    }
  }
  return {bat,dist};
}
function azDe(dx,dz){ return ((Math.atan2(dx,-dz)*180/PI)+360)%360; }

/* --------------------------------------------------------- lecture d'image */
const TYPES={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png',
  '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8'};

/* profils par colonne, calculés dans le navigateur (seul à savoir décoder
   un JPEG ici) : la silhouette, le sol, et des couleurs par tranche */
const LIRE=async (page,url)=>page.evaluate(async o=>{
  const {url,GW,GH,BINS}=o;
  const img=new Image();
  img.src=url;
  await img.decode();
  const cv=document.createElement('canvas');
  cv.width=GW; cv.height=GH;
  const cx=cv.getContext('2d',{willReadFrequently:true});
  cx.drawImage(img,0,0,GW,GH);
  const P=cx.getImageData(0,0,GW,GH).data;
  const lum=new Float32Array(GW*GH);
  for(let i=0,k=0;i<P.length;i+=4,k++) lum[k]=0.299*P[i]+0.587*P[i+1]+0.114*P[i+2];

  /* Classement de chaque pixel, une fois pour toute l'image : le premier
     jet reclassait les mêmes pixels neuf fois en cherchant la silhouette,
     et une photo demandait une dizaine de secondes pour rien.
       c ciel · v verdure · n sombre (vitre, ombre portée) · m matière     */
  const CL=new Uint8Array(GW*GH);
  const C_CIEL=1, C_VERT=2, C_NOIR=3, C_MAT=4;
  for(let v=0;v<GH;v++) for(let u=0;u<GW;u++){
    const k=v*GW+u, i=k*4, r=P[i], g=P[i+1], b=P[i+2], L=lum[k];
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b), sat=mx?(mx-mn)/mx:0;
    if(g>r*1.04 && g>b*1.06 && sat>0.10){ CL[k]=C_VERT; continue; }
    if(L<42){ CL[k]=C_NOIR; continue; }
    if(L>118 && (b>r*1.02 || sat<0.10)){
      /* Ce qui distingue un ciel couvert d'un enduit clair n'est ni sa
         couleur ni sa clarté — c'est qu'il est lisse. Contraste local
         vertical, sur cinq lignes : un mur en a toujours un peu. */
      let m=0;
      for(let dv=-2;dv<=2;dv++){
        const vv=v+dv; if(vv<0||vv>=GH) continue;
        const d=Math.abs(lum[vv*GW+u]-L); if(d>m) m=d;
      }
      if(m<12){ CL[k]=C_CIEL; continue; }
    }
    CL[k]=C_MAT;
  }

  /* la silhouette : en descendant du zénith, le premier non-ciel suivi de
     huit non-ciel d'affilée — un fil ou un oiseau ne la déplace pas */
  const silhouette=new Int16Array(GW).fill(-1);
  const horizon=Math.round(GH/2);
  for(let u=0;u<GW;u++){
    for(let v=2;v<horizon;v++){
      if(CL[v*GW+u]===C_CIEL) continue;
      let n=0;
      for(let k=0;k<8 && v+k<GH;k++) if(CL[(v+k)*GW+u]!==C_CIEL) n++;
      if(n>=7){ silhouette[u]=v; break; }
    }
  }
  /* couleurs par tranche verticale, matière seulement */
  const som=new Float64Array(GW*BINS*3), cnt=new Float64Array(GW*BINS);
  const veg=new Float64Array(GW*BINS), noir=new Float64Array(GW*BINS), tot=new Float64Array(GW*BINS);
  for(let v=0;v<GH;v++){
    const k=Math.min(BINS-1, Math.floor(v/GH*BINS));
    for(let u=0;u<GW;u++){
      const o=u*BINS+k, c=CL[v*GW+u];
      tot[o]++;
      if(c===C_VERT){ veg[o]++; continue; }
      if(c===C_NOIR){ noir[o]++; continue; }
      if(c===C_CIEL) continue;
      const i=(v*GW+u)*4;
      som[o*3]+=P[i]; som[o*3+1]+=P[i+1]; som[o*3+2]+=P[i+2]; cnt[o]++;
    }
  }
  return {silhouette:Array.from(silhouette), som:Array.from(som), cnt:Array.from(cnt),
          veg:Array.from(veg), noir:Array.from(noir), tot:Array.from(tot)};
},{url,GW,GH,BINS});

/* ------------------------------------------------------------- manifeste */
function lireManifeste(){
  const f=path.join(DOSSIER,'manifeste.json');
  if(fs.existsSync(f)){
    const m=JSON.parse(fs.readFileSync(f,'utf8'));
    return {h:m.hauteurCamera||1.9, photos:(m.photos||[]).filter(p=>p.la&&p.lo)};
    /* solCamera, s'il est là, porte le niveau du sol sous la caméra : il
       permet de rendre une altitude de faîte absolue au lieu d'une hauteur
       comptée depuis les pieds de l'observateur. */
  }
  /* sinon, l'EXIF de chaque JPEG */
  const L=fs.readdirSync(DOSSIER).filter(n=>/\.jpe?g$/i.test(n)).sort();
  const photos=[];
  for(const n of L){
    const e=exif(path.join(DOSSIER,n));
    if(e && e.la!==null) photos.push({fichier:n, la:e.la, lo:e.lo, alt:e.alt, t:e.t, cap:e.cap});
    else console.log('  '+n+' : pas de position GPS dans l’EXIF');
  }
  return {h:+opt('hauteur-camera',1.9), photos};
}

/* --------------------- EXIF : position, heure, cap ; lecture minimale ---- */
function exif(fichier){
  const b=fs.readFileSync(fichier);
  if(b.length<4 || b[0]!==0xFF || b[1]!==0xD8) return null;
  let i=2, app1=-1, fin=0;
  while(i+4<b.length){
    if(b[i]!==0xFF) { i++; continue; }
    const mk=b[i+1];
    if(mk===0xD8||mk===0x01||(mk>=0xD0&&mk<=0xD7)){ i+=2; continue; }
    const len=b.readUInt16BE(i+2);
    if(mk===0xE1 && b.toString('ascii',i+4,i+10)==='Exif\0\0'){ app1=i+10; fin=i+2+len; break; }
    if(mk===0xDA) break;
    i+=2+len;
  }
  if(app1<0) return null;
  const be=b.toString('ascii',app1,app1+2)==='MM';
  const u16=o=>be?b.readUInt16BE(o):b.readUInt16LE(o);
  const u32=o=>be?b.readUInt32BE(o):b.readUInt32LE(o);
  const TAILLE={1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8};
  function ifd(off){
    const out={};
    if(app1+off+2>b.length) return out;
    const n=u16(app1+off);
    for(let k=0;k<n;k++){
      const e=app1+off+2+k*12;
      if(e+12>b.length) break;
      const tag=u16(e), typ=u16(e+2), cnt=u32(e+4);
      const oct=(TAILLE[typ]||1)*cnt;
      const val=(oct<=4)?(e+8):(app1+u32(e+8));
      out[tag]={typ,cnt,val};
    }
    return out;
  }
  const rat=(o,n)=>{ const r=[]; for(let k=0;k<n;k++){ const a=u32(o+k*8), d=u32(o+k*8+4); r.push(d?a/d:0); } return r; };
  const zero=ifd(u32(app1+4));
  const g=zero[0x8825]?ifd(u32(zero[0x8825].val)):null;
  const ex=zero[0x8769]?ifd(u32(zero[0x8769].val)):null;
  let la=null, lo=null, alt=null, cap=null, t=null;
  if(g){
    const deg=e=>{ const v=rat(e.val,3); return v[0]+v[1]/60+v[2]/3600; };
    if(g[2]&&g[4]){
      la=deg(g[2]); lo=deg(g[4]);
      if(g[1] && b.toString('ascii',g[1].val,g[1].val+1)==='S') la=-la;
      if(g[3] && b.toString('ascii',g[3].val,g[3].val+1)==='W') lo=-lo;
    }
    if(g[6]){ alt=rat(g[6].val,1)[0]; if(g[5] && b[g[5].val]===1) alt=-alt; }
    if(g[17]) cap=rat(g[17].val,1)[0];
  }
  if(ex && ex[0x9003]) t=b.toString('ascii',ex[0x9003].val,ex[0x9003].val+19);
  return {la,lo,alt,cap,t};
}

/* ------------------------------------------------- auto-contrôle géométrie
   Le lancer de rayon en azimut est la pièce dont tout le reste dépend : une
   hauteur se lit à la distance près, et la distance vient de là. On la
   vérifie donc sur un cas calculable à la main plutôt que sur le terrain.
   Un carré de 10 m dont la face nord est à 15 m occupe ±atan(5/15) = ±18,43°
   et se tient à 15 m droit devant.                                        */
if(ARG.includes('--essai-geometrie')){
  BATS.length=0;
  const c=[[-5,-25],[5,-25],[5,-15],[-5,-15]];    /* z négatif = vers le nord */
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
  for(const q of c){ x0=Math.min(x0,q[0]); x1=Math.max(x1,q[0]); z0=Math.min(z0,q[1]); z1=Math.max(z1,q[1]); }
  BATS.push({i:0,k:'y',cx:0,cz:-20,ow:10,ol:10,aire:100,lv:0,ht:0,p:c,bb:[x0,x1,z0,z1]});
  GRILLE.clear();
  for(let gx=Math.floor(x0/CASE);gx<=Math.floor(x1/CASE);gx++)
    for(let gz=Math.floor(z0/CASE);gz<=Math.floor(z1/CASE);gz++){
      const k=gx+'_'+gz; if(!GRILLE.has(k)) GRILLE.set(k,[]); GRILLE.get(k).push(BATS[0]);
    }
  const V=visibilite(0,0);
  let n=0, aMin=1e9, aMax=-1e9, dAvant=null;
  for(let u=0;u<GW;u++){
    if(V.bat[u]<0) continue;
    n++;
    const az=((u+0.5)/GW*360+180)%360-180;        /* centré sur le nord */
    aMin=Math.min(aMin,az); aMax=Math.max(aMax,az);
    if(Math.abs(az)<0.2) dAvant=V.dist[u];
  }
  const large=n/GW*360, att=2*Math.atan(5/15)*180/Math.PI;
  const ecarts=[['largeur angulaire',large,att,0.5],
                ['borne gauche',aMin,-att/2,0.5],
                ['borne droite',aMax,att/2,0.5],
                ['distance droit devant',dAvant,15,0.05]];
  let faux=0;
  for(const [nom,eu,at,tol] of ecarts){
    const ok=eu!==null && Math.abs(eu-at)<=tol;
    if(!ok) faux++;
    console.log((ok?'  ok   ':'  FAUX ')+nom.padEnd(24)+' mesuré '+(eu===null?'—':eu.toFixed(2))+'   attendu '+at.toFixed(2));
  }
  /* et derrière le mur, plus rien : le bâtiment s'occulte lui-même */
  const arriere=[];
  for(let u=0;u<GW;u++) if(V.bat[u]>=0 && V.dist[u]>20) arriere.push(u);
  const ok2=arriere.length===0;
  if(!ok2) faux++;
  console.log((ok2?'  ok   ':'  FAUX ')+'faces arrière occultées'.padEnd(24)+' '+arriere.length+' colonne(s) au-delà de 20 m');
  console.log(faux?('=== '+faux+' contrôle(s) en défaut ==='):'=== géométrie conforme ===');
  process.exit(faux?1:0);
}

/* ================================================================ mesure */
(async()=>{
  const M=lireManifeste();
  if(!M.photos.length){ console.error('aucune photo géolocalisée dans '+DOSSIER); process.exit(1); }
  console.log('photos : '+M.photos.length+'   hauteur de caméra : '+M.h.toFixed(2)+' m');

  /* la trace, pour le cap de marche et pour ordonner les photos */
  M.photos.forEach(p=>{ p.x=pX(p.lo); p.z=pZ(p.la); });
  if(M.photos.every(p=>p.t)) M.photos.sort((a,b)=>String(a.t).localeCompare(String(b.t)));

  const srv=http.createServer((rq,rs)=>{
    const u=decodeURIComponent(rq.url.split('?')[0]);
    const f=u.startsWith('/img/')?path.join(path.resolve(DOSSIER),u.slice(5)):path.join(RACINE,u);
    if(!f.startsWith(path.resolve(DOSSIER)) && !f.startsWith(RACINE)){ rs.writeHead(403); rs.end(); return; }
    fs.readFile(f,(e,d)=>{ if(e){ rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200,{'Content-Type':TYPES[path.extname(f).toLowerCase()]||'application/octet-stream'});
      rs.end(d); });
  });
  await new Promise(ok=>srv.listen(0,ok));
  const base='http://localhost:'+srv.address().port;
  const nav=await chromium.launch({args:['--js-flags=--max-old-space-size=3072']});
  const page=await (await nav.newContext({viewport:{width:200,height:200}})).newPage();
  await page.goto(base+'/outils/README.md',{waitUntil:'domcontentloaded'}).catch(()=>{});
  await page.setContent('<!doctype html><meta charset=utf-8><title>relevé</title>');

  /* --- première passe : profils d'image et visibilité prédite --- */
  const lots=[];
  for(const p of M.photos){
    const prof=await LIRE(page, base+'/img/'+encodeURIComponent(p.fichier));
    const vis=visibilite(p.x,p.z);
    lots.push({p,prof,vis});
    process.stdout.write('\r  lu '+lots.length+'/'+M.photos.length+'   ');
  }
  console.log('');

  /* --- décalage d'orientation : un seul angle pour tout le lot --- */
  let decal=0;
  if(CAP_IMPOSE!==null){ decal=CAP_IMPOSE; console.log('cap imposé : '+decal.toFixed(1)+'°'); }
  else if(M.photos.every(p=>p.cap!==undefined && p.cap!==null)){
    decal=null; console.log('cap lu dans l’EXIF de chaque photo');
  } else {
    let meilleur=-1;
    for(let d=0;d<GW;d++){
      let s=0, n=0;
      for(const l of lots){
        for(let u=0;u<GW;u+=2){
          const bat=l.vis.bat[(u+d)%GW]>=0;
          const vue=l.prof.silhouette[u]>=0;
          s+=(bat===vue)?1:-1; n++;
        }
      }
      const q=s/n;
      if(q>meilleur){ meilleur=q; decal=d/GW*360; }
    }
    console.log('décalage résolu : '+decal.toFixed(1)+'°   (accord silhouette '+((meilleur+1)/2*100).toFixed(1)+' %)');
  }

  /* --- deuxième passe : hauteurs et couleurs --- */
  const par=new Map();
  for(const l of lots){
    const d=(decal===null? l.p.cap : decal);
    const dU=Math.round(d/360*GW);
    for(let u=0;u<GW;u++){
      const uv=((u+dU)%GW+GW)%GW;            /* colonne du monde */
      const bi=l.vis.bat[uv], dist=l.vis.dist[uv];
      if(bi<0 || dist>PORTEE) continue;
      const sv=l.prof.silhouette[u];
      if(sv<0) continue;                     /* pas de ciel au-dessus : toit caché */
      /* élévation du haut de la silhouette, au centre du pixel */
      const el=(90-(sv+0.5)/GH*180)*PI/180;
      if(el<=0.02) continue;
      const haut=M.h+dist*Math.tan(el);
      if(haut<2 || haut>42) continue;
      if(!par.has(bi)) par.set(bi,{h:[], abs:[], mur:[], toit:[], vues:0, d:[]});
      const e=par.get(bi);
      e.h.push(haut); e.d.push(dist); e.vues++;
      if(l.p.solCamera!==undefined) e.abs.push(l.p.solCamera+haut);
      /* couleur de mur : les tranches entre le tiers bas du bâti et le haut
         de la façade, sans verdure ni vitre */
      const vFaite=sv, vSol=Math.round(GH/2+ (GH/2)*0.10);
      const k0=Math.min(BINS-1,Math.floor((vFaite+(vSol-vFaite)*0.35)/GH*BINS));
      const k1=Math.min(BINS-1,Math.floor((vFaite+(vSol-vFaite)*0.85)/GH*BINS));
      for(let k=k0;k<=k1;k++){
        const o=u*BINS+k;
        if(!l.prof.cnt[o]) continue;
        if(l.prof.veg[o]>l.prof.tot[o]*0.30) continue;
        e.mur.push([l.prof.som[o*3]/l.prof.cnt[o], l.prof.som[o*3+1]/l.prof.cnt[o], l.prof.som[o*3+2]/l.prof.cnt[o]]);
      }
      /* couleur de toit : la tranche juste sous la silhouette, seulement si
         on est assez loin pour voir le rampant (au-delà de la hauteur) */
      if(dist>haut*1.1){
        const k=Math.min(BINS-1,Math.floor((vFaite+3)/GH*BINS)), o=u*BINS+k;
        if(l.prof.cnt[o] && l.prof.veg[o]<l.prof.tot[o]*0.25)
          e.toit.push([l.prof.som[o*3]/l.prof.cnt[o], l.prof.som[o*3+1]/l.prof.cnt[o], l.prof.som[o*3+2]/l.prof.cnt[o]]);
      }
    }
  }
  await nav.close(); srv.close();

  /* --- agrégation : médiane par bâtiment --- */
  const med=a=>{ if(!a.length) return null; const b=a.slice().sort((x,y)=>x-y); return b[b.length>>1]; };
  const medC=a=>{ if(a.length<3) return null;
    return [0,1,2].map(c=>Math.round(med(a.map(v=>v[c])))); };
  const hex=c=>c?('0x'+c.map(v=>Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')).join('')):null;

  const releve=[];
  for(const [bi,e] of par){
    if(e.h.length<6) continue;                 /* trop peu de colonnes : on s'abstient */
    const b=BATS[bi];
    const h=med(e.h);
    /* dispersion : si les colonnes ne s'accordent pas, on ne publie pas */
    const tri=e.h.slice().sort((x,y)=>x-y);
    const q1=tri[Math.floor(tri.length*0.25)], q3=tri[Math.floor(tri.length*0.75)];
    const etal=q3-q1;
    releve.push({
      i:bi, la:+laDeZ(b.cz).toFixed(6), lo:+loDeX(b.cx).toFixed(6),
      haut:+h.toFixed(1), etalement:+etal.toFixed(1),
      faite:(e.abs.length? +med(e.abs).toFixed(1) : null),
      niv:Math.max(1,Math.round((h-1.1)/3.15)),
      mur:hex(medC(e.mur)), toit:hex(medC(e.toit)),
      colonnes:e.h.length, vues:e.vues, dist:+med(e.d).toFixed(0),
      aire:b.aire, ow:+b.ow.toFixed(1), ol:+b.ol.toFixed(1)
    });
  }
  releve.sort((a,b)=>b.colonnes-a.colonnes);
  fs.writeFileSync(SORTIE, JSON.stringify({page:PAGE, decalage:decal, photos:M.photos.length,
      hauteurCamera:M.h, batiments:releve},null,1));
  console.log('=== '+releve.length+' bâtiments relevés sur '+BATS.length+' → '+SORTIE+' ===');
  const sur=releve.filter(r=>r.etalement<2.5);
  console.log('    dont '+sur.length+' avec un étalement inférieur à 2,5 m');

  if(VERITE){
    const fv=path.join(DOSSIER,'verite.json');
    if(!fs.existsSync(fv)){
      console.log('    pas de verite.json : rendre les panoramas avec rendre_equirect.js pour l’obtenir');
    } else {
      /* Les panoramas de synthèse viennent d'un monde qu'on connaît : on
         compare le faîte relevé au faîte bâti, bâtiment par bâtiment, en
         appariant par la position du centre de l'emprise. */
      const V=JSON.parse(fs.readFileSync(fv,'utf8'));
      const cle=o=>Math.round(pX(o.lo))+'_'+Math.round(pZ(o.la));
      const idx=new Map();
      V.forEach(v=>idx.set(cle(v),v));
      const paires=[];
      for(const r of releve){
        let v=idx.get(cle(r));
        if(!v){                                  /* tolérance d'un mètre */
          const rx=pX(r.lo), rz=pZ(r.la);
          for(const w of V) if(Math.hypot(pX(w.lo)-rx, pZ(w.la)-rz)<1.5){ v=w; break; }
        }
        if(v) paires.push([r,v]);
      }
      console.log('    appariés à la vérité : '+paires.length+' / '+releve.length);
      const ligne=(nom,ec)=>{
        if(!ec.length){ console.log('    '+nom+' : rien à comparer'); return; }
        const a=ec.slice().sort((x,y)=>x-y);
        const q=f=>a[Math.min(a.length-1,Math.floor(a.length*f))];
        console.log('    '+nom.padEnd(26)+' médiane '+q(0.5).toFixed(2)+' m   '+
          'q90 '+q(0.9).toFixed(2)+' m   max '+a[a.length-1].toFixed(2)+' m   ('+a.length+' bâtiments)');
      };
      ligne('écart de hauteur', paires.filter(([r,v])=>r.faite!==null).map(([r,v])=>Math.abs(r.faite-v.faite)));
      ligne('écart, étalement < 2,5 m', paires.filter(([r,v])=>r.faite!==null&&r.etalement<2.5).map(([r,v])=>Math.abs(r.faite-v.faite)));
      /* couleurs : distance dans le cube RVB, en pas de 0 à 255 */
      const dc=(a,b)=>{ const x=parseInt(a.slice(2),16), y=parseInt(b.slice(2),16);
        return Math.hypot((x>>16&255)-(y>>16&255), (x>>8&255)-(y>>8&255), (x&255)-(y&255)); };
      const em=paires.filter(([r,v])=>r.mur&&v.mur).map(([r,v])=>dc(r.mur,v.mur));
      if(em.length){ const a=em.slice().sort((x,y)=>x-y);
        console.log('    écart de couleur de mur    médiane '+a[a.length>>1].toFixed(0)+
          ' / 442   ('+em.length+' bâtiments)'); }
      /* les cinq pires, pour aller regarder */
      const pires=paires.filter(([r,v])=>r.faite!==null)
        .sort((A,B)=>Math.abs(B[0].faite-B[1].faite)-Math.abs(A[0].faite-A[1].faite)).slice(0,5);
      if(pires.length){
        console.log('    les plus fautifs :');
        pires.forEach(([r,v])=>console.log('      '+r.la.toFixed(6)+','+r.lo.toFixed(6)+
          '  relevé '+r.faite.toFixed(1)+' m  bâti '+v.faite.toFixed(1)+' m  '+
          '('+r.colonnes+' colonnes, '+r.dist+' m, étalement '+r.etalement+' m)'));
      }
    }
  }
  console.log('');
  console.log('--- bloc RELEVE à coller dans code3d.js ---');
  sur.slice(0,+opt('combien',40)).forEach(r=>{
    console.log('  {la:'+r.la.toFixed(6)+', lo:'+r.lo.toFixed(6)+', niv:'+r.niv+
      ', mur:'+r.mur+(r.toit?', toit:'+r.toit:'')+
      ', note:\'relevé 360, '+r.haut.toFixed(1)+' m sur '+r.colonnes+' colonnes\'},');
  });
})();
