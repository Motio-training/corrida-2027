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
/* Sur des panoramas de synthèse, la position est exacte : le contrôle serait
   flatteur, puisque c'est elle qui donne la distance et donc la hauteur. Un
   GPS de téléphone ou de GoPro se trompe de quelques mètres. --bruit-gps
   déplace chaque prise de vue d'autant, pour chiffrer ce que cette erreur
   coûte sur la hauteur relevée avant d'aller sur le terrain. */
const BRUIT=+opt('bruit-gps',0);
/* Étalonnage des couleurs. Une photo ne donne pas la couleur d'un enduit,
   elle donne celle que la lumière du jour en a faite : sur ces panoramas de
   synthèse, la façade mesurée vaut 0,70 / 0,65 / 0,61 fois la couleur de
   base donnée au matériau, et de 0,47 à 0,80 selon qu'elle est au soleil ou
   à l'ombre. Reporter la couleur mesurée telle quelle dans le moteur la
   ferait éclairer une seconde fois, et la ville s'assombrirait à chaque
   passe.
   D'où --etalon : un second lot de panoramas, rendu du modèle courant aux
   mêmes points par rendre_equirect.js. La même bande y est mesurée, et c'est
   le rapport des deux mesures qui corrige la couleur de base — la lumière,
   commune aux deux, s'élimine. */
const ETALON=opt('etalon');

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

/* --------------------------------------------------- lecture des images ---
   Le navigateur est le seul ici à savoir décoder un JPEG. On y fait donc
   deux passes. La première classe les pixels et remonte la silhouette, ce
   qui tient en deux nombres par colonne. La seconde, une fois qu'on connaît
   par la géométrie quel bâtiment occupe quelle colonne et à quelle distance,
   relève la couleur sur des bandes calculées pour ce bâtiment-là.

   C'est l'ordre inverse qui m'a coûté un essai : en renvoyant d'abord des
   couleurs par tranches fixes de l'image, les tranches valaient près de
   treize degrés — plus de quatre mètres de façade à vingt mètres — et celle
   du bas mordait sur la chaussée. Les murs de la vieille ville ressortaient
   gris sombre alors qu'ils sont crème.                                    */
const PASSE_A=async (page,url,nom)=>page.evaluate(async o=>{
  const {url,nom,GW,GH}=o;
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

  /* Ce qu'est le ciel ne se décide pas à un seuil de clarté. Mon premier
     essai demandait une luminance supérieure à 118 : le ciel bleu franc de
     ces rendus vaut 117, il passait donc pour de la matière, la silhouette
     se lisait au zénith dans toutes les colonnes et 6 828 colonnes sur
     8 640 étaient rejetées pour « hauteur hors bornes ». Un ciel couvert,
     un ciel de fin de journée ou un ciel d'orage auraient chacun demandé
     un autre seuil.

     Ce qu'on sait à coup sûr d'une image équirectangulaire prise dehors,
     c'est que le zénith est du ciel. On apprend donc la couleur du ciel
     dans la bande haute — six pour cent, soit au-dessus de 79° d'élévation,
     qu'aucun bâtiment n'atteint depuis la rue — en remplissant une grille
     grossière du cube RVB, dilatée d'une case pour suivre le dégradé du
     bleu vers l'horizon.                                                 */
  const Q=4, NB=1<<(8-Q);                        /* 16 cases par axe, larges de 16 */
  const modele=new Uint8Array(NB*NB*NB), dilate=new Uint8Array(NB*NB*NB);
  const seau=(r,g,b)=>(((r>>Q)*NB)+(g>>Q))*NB+(b>>Q);
  const bande=Math.max(4,Math.round(GH*0.06));
  for(let v=0;v<bande;v++) for(let u=0;u<GW;u++){
    const i=(v*GW+u)*4; modele[seau(P[i],P[i+1],P[i+2])]=1;
  }
  for(let r=0;r<NB;r++) for(let g=0;g<NB;g++) for(let b=0;b<NB;b++){
    if(!modele[(r*NB+g)*NB+b]) continue;
    for(let dr=-1;dr<=1;dr++) for(let dg=-1;dg<=1;dg++) for(let db=-1;db<=1;db++){
      const rr=r+dr, gg=g+dg, bb=b+db;
      if(rr<0||rr>=NB||gg<0||gg>=NB||bb<0||bb>=NB) continue;
      dilate[(rr*NB+gg)*NB+bb]=1;
    }
  }
  const CL=new Uint8Array(GW*GH);
  const C_CIEL=1, C_VERT=2, C_NOIR=3, C_MAT=4;
  function lisse(u,v,L){
    let m=0;
    for(let dv=-2;dv<=2;dv++){
      const vv=v+dv; if(vv<0||vv>=GH) continue;
      const d=Math.abs(lum[vv*GW+u]-L); if(d>m) m=d;
    }
    return m<14;
  }
  /* Trois façons d'être du ciel, et la finesse des cases y est décisive.

     Au deuxième essai les cases faisaient trente-deux niveaux de large et
     la dilatation portait donc à ±32 : un blanc de nuage (230, 235, 245) et
     un enduit crème (238, 233, 222) tombaient dans la même case. Toutes les
     façades claires passaient pour du ciel, la silhouette descendait jusqu'à
     une fenêtre et les hauteurs relevées tombaient à trois mètres. À seize
     niveaux, les deux sont à deux cases l'une de l'autre et ne se confondent
     plus.

     Le bleu franc, lui, n'a besoin d'aucun modèle : aucune maçonnerie n'est
     à ce point dominée par le bleu. Et pour le pâle — nuage appris ou nuage
     bas que la bande haute n'a pas vu — on exige en plus la douceur : un mur
     porte des bords de fenêtre, un nuage n'en a pas.

     Ce qui rattrape le cas limite, c'est qu'entre le ciel et le mur il y a
     un toit. Tuile ou ardoise, il n'est ni bleu franc ni pâle et lisse : la
     silhouette s'arrête donc sur lui, ce qui est bien ce qu'on cherche.   */
  for(let v=0;v<GH;v++) for(let u=0;u<GW;u++){
    const k=v*GW+u, i=k*4, r=P[i], g=P[i+1], b=P[i+2], L=lum[k];
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b), sat=mx?(mx-mn)/mx:0;
    if(g>r*1.04 && g>b*1.06 && sat>0.10){ CL[k]=C_VERT; continue; }
    if(L<42){ CL[k]=C_NOIR; continue; }
    if(b>r*1.15 && b>=g*0.98){ CL[k]=C_CIEL; continue; }
    if(dilate[seau(r,g,b)] && sat<0.20 && lisse(u,v,L)){ CL[k]=C_CIEL; continue; }
    if(L>150 && sat<0.12 && lisse(u,v,L)){ CL[k]=C_CIEL; continue; }
    CL[k]=C_MAT;
  }

  /* La silhouette, colonne par colonne, en descendant du zénith.

     Le modèle de couleur seul ne suffit pas : les nuages sont blancs, un
     enduit crème l'est presque, et la dilatation d'une case suffit à les
     confondre. Le deuxième essai a ainsi mangé les façades claires — la
     silhouette descendait jusqu'à une fenêtre et les hauteurs relevées
     tombaient à trois ou quatre mètres. Ce qui sépare les deux, ce n'est
     pas la couleur, c'est la marche : un bord de toiture est plus sombre
     que le ciel qui le surmonte, même quand les deux sont pâles. On
     descend donc en comparant chaque pixel à la moyenne des six qui le
     précèdent dans la même colonne, et on s'arrête au premier décrochement
     confirmé sur huit lignes — un fil ou un oiseau ne l'arrête pas.      */
  const silhouette=new Int16Array(GW).fill(-1);
  const silVerdure=new Uint8Array(GW);
  const horizon=Math.round(GH/2);
  for(let u=0;u<GW;u++){
    for(let v=2;v<horizon;v++){
      if(CL[v*GW+u]===C_CIEL) continue;
      /* confirmé sur huit lignes : un fil, un oiseau ou un bord de nuage
         mal classé ne déplacent pas la silhouette */
      let n=0, vv=0;
      for(let j=0;j<8;j++){
        const w=v+j; if(w>=GH) break;
        const kk=w*GW+u;
        if(CL[kk]!==C_CIEL) n++;
        if(CL[kk]===C_VERT) vv++;
      }
      if(n>=7){ silhouette[u]=v; silVerdure[u]=(vv>=5)?1:0; break; }
    }
  }
  /* on garde les pixels pour la seconde passe : six images tiennent en une
     vingtaine de mégaoctets */
  window.__IMG=window.__IMG||{};
  window.__IMG[nom]={P,CL,GW,GH};
  return {large:img.naturalWidth, haut:img.naturalHeight,
          silhouette:Array.from(silhouette), silVerdure:Array.from(silVerdure)};
},{url,nom,GW,GH});

/* Deuxième passe : la couleur de la matière sur des bandes demandées.
   bandes : [{u, v0, v1}] en lignes de la grille de travail.
   rend   : [[r,g,b,n,fractionDeVerdure], …] dans le même ordre.          */
const PASSE_B=async (page,nom,bandes)=>page.evaluate(o=>{
  const {nom,bandes}=o;
  const I=window.__IMG&&window.__IMG[nom];
  if(!I) return null;
  const {P,CL,GW,GH}=I, C_VERT=2, C_MAT=4;
  const out=new Array(bandes.length);
  for(let b=0;b<bandes.length;b++){
    const {u,v0,v1}=bandes[b];
    let sr=0,sg=0,sb=0,n=0,veg=0,tot=0;
    for(let v=Math.max(0,v0);v<Math.min(GH,v1);v++){
      const k=v*GW+u; tot++;
      if(CL[k]===C_VERT){ veg++; continue; }
      if(CL[k]!==C_MAT) continue;
      const i=k*4; sr+=P[i]; sg+=P[i+1]; sb+=P[i+2]; n++;
    }
    out[b]=n?[sr/n,sg/n,sb/n,n,tot?veg/tot:0]:[0,0,0,0,tot?veg/tot:0];
  }
  return out;
},{nom,bandes});

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
  if(BRUIT>0){
    /* tirage reproductible : la même graine donne le même bruit d'un essai
       à l'autre, sinon on comparerait deux hasards */
    let g=12345;
    const uni=()=>{ g=(g*1103515245+12345)&0x7fffffff; return g/0x7fffffff; };
    const normal=()=>Math.sqrt(-2*Math.log(1-uni()))*Math.cos(2*PI*uni());
    let som=0;
    M.photos.forEach(p=>{ const dx=normal()*BRUIT/Math.SQRT2, dz=normal()*BRUIT/Math.SQRT2;
      p.x+=dx; p.z+=dz; som+=Math.hypot(dx,dz); });
    console.log('bruit GPS simulé : '+BRUIT.toFixed(1)+' m visé, '+
      (som/M.photos.length).toFixed(2)+' m de déplacement moyen');
  }
  if(M.photos.every(p=>p.t)) M.photos.sort((a,b)=>String(a.t).localeCompare(String(b.t)));

  const srv=http.createServer((rq,rs)=>{
    const u=decodeURIComponent(rq.url.split('?')[0]);
    /* Une page d'accueil en HTML, et rien d'autre : le navigateur ne sert ici
       qu'à décoder les JPEG et à lire leurs pixels. Elle doit être servie
       depuis la même origine que les images, sinon getImageData() se heurte
       à une toile marquée d'origine croisée. */
    if(u==='/'){ rs.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      rs.end('<!doctype html><meta charset=utf-8><title>relevé 360</title>'); return; }
    const f=u.startsWith('/img/')?path.join(path.resolve(DOSSIER),u.slice(5))
           :u.startsWith('/etalon/')?path.join(path.resolve(ETALON||DOSSIER),u.slice(8))
           :path.join(RACINE,u);
    const permis=[path.resolve(DOSSIER), RACINE].concat(ETALON?[path.resolve(ETALON)]:[]);
    if(!permis.some(d=>f.startsWith(d))){ rs.writeHead(403); rs.end(); return; }
    fs.readFile(f,(e,d)=>{ if(e){ rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200,{'Content-Type':TYPES[path.extname(f).toLowerCase()]||'application/octet-stream'});
      rs.end(d); });
  });
  await new Promise(ok=>srv.listen(0,ok));
  const base='http://localhost:'+srv.address().port;
  const nav=await chromium.launch({args:['--js-flags=--max-old-space-size=3072']});
  const page=await (await nav.newContext({viewport:{width:200,height:200}})).newPage();
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});

  /* --- première passe : profils d'image et visibilité prédite --- */
  const lots=[];
  let malCadrees=0;
  for(const p of M.photos){
    const prof=await PASSE_A(page, base+'/img/'+encodeURIComponent(p.fichier), p.fichier);
    /* Une image équirectangulaire fait exactement deux fois plus large que
       haute : 360° d'azimut pour 180° d'élévation. Si le rapport n'y est
       pas, ce n'est pas un panoramique — c'est une vue recadrée exportée
       depuis l'application, et toute la correspondance colonne → azimut
       s'effondre sans rien signaler. On le dit ici plutôt que de rendre
       des hauteurs fausses. */
    const rap=prof.large/prof.haut;
    if(rap<1.94 || rap>2.06){
      malCadrees++;
      if(malCadrees<=3) console.log('\n  ⚠ '+p.fichier+' : '+prof.large+' × '+prof.haut+
        ' (rapport '+rap.toFixed(2)+'), ce n’est pas une image équirectangulaire');
    }
    const vis=visibilite(p.x,p.z);
    lots.push({p,prof,vis});
    process.stdout.write('\r  lu '+lots.length+'/'+M.photos.length+'   ');
  }
  console.log('');
  if(malCadrees){
    console.error('  '+malCadrees+' image(s) sur '+M.photos.length+' ne sont pas en projection '+
      'équirectangulaire : réexporter le lot en « 360 / équirectangulaire », sans recadrage.');
    if(malCadrees>M.photos.length/2) process.exit(1);
  }

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
          if(l.prof.silVerdure[u]) continue;   /* un arbre ne dit rien du bâti */
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

  /* --- deuxième passe : hauteurs, puis couleurs sur bandes mesurées --- */
  const par=new Map();
  const rejet={'colonnes vues':0,'sans emprise prédite':0,'hors portée':0,'sans silhouette':0,
               'silhouette de verdure':0,'élévation nulle':0,'hauteur hors bornes':0,'retenues':0};
  for(const l of lots){
    const d=(decal===null? l.p.cap : decal);
    const dU=Math.round(d/360*GW);
    const bandesMur=[], bandesToit=[], quiMur=[], quiToit=[];
    for(let u=0;u<GW;u++){
      rejet['colonnes vues']++;
      const uv=((u+dU)%GW+GW)%GW;            /* colonne du monde */
      const bi=l.vis.bat[uv], dist=l.vis.dist[uv];
      if(bi<0){ rejet['sans emprise prédite']++; continue; }
      if(dist>PORTEE){ rejet['hors portée']++; continue; }
      const sv=l.prof.silhouette[u];
      if(sv<0){ rejet['sans silhouette']++; continue; }   /* pas de ciel au-dessus */
      if(l.prof.silVerdure[u]){ rejet['silhouette de verdure']++; continue; }
      /* élévation du haut de la silhouette, au centre du pixel */
      const el=(90-(sv+0.5)/GH*180)*PI/180;
      if(el<=0.02){ rejet['élévation nulle']++; continue; }
      const haut=M.h+dist*Math.tan(el);
      if(haut<2 || haut>42){ rejet['hauteur hors bornes']++; continue; }
      rejet['retenues']++;
      if(!par.has(bi)) par.set(bi,{h:[], abs:[], mur:[], toit:[], vues:0, d:[]});
      const e=par.get(bi);
      e.h.push(haut); e.d.push(dist); e.vues++;
      if(l.p.solCamera!==undefined) e.abs.push(l.p.solCamera+haut);

      /* Bas de la façade : là où le mur rencontre le sol, à une élévation de
         -atan(hauteur de caméra / distance). Je l'avais posé à -9° pour
         toutes les distances, ce qui ne vaut que vers douze mètres : à
         quarante, le pied du mur est à -2,7° et la bande de couleur mordait
         sur la chaussée. */
      const vSol=Math.min(GH-1, Math.round(GH/2 + Math.atan(M.h/dist)/PI*GH));
      const hautPx=vSol-sv;
      if(hautPx>=6){
        bandesMur.push({u:u, v0:Math.round(sv+hautPx*0.10), v1:Math.round(sv+hautPx*0.45)});
        quiMur.push(bi);
      }
      /* Couleur de toit : le rampant n'est visible que d'assez loin. Depuis
         la rue, à quinze mètres d'une maison de dix, on voit la façade jusqu'à
         la corniche puis le ciel — le pan est de l'autre côté du faîte. Au-delà
         de deux fois la hauteur, la bande juste sous la silhouette est du toit.
         Plus près, on s'abstient plutôt que de relever la corniche en croyant
         relever l'ardoise. */
      if(dist>2.2*haut && hautPx>=8){
        bandesToit.push({u:u, v0:sv+1, v1:Math.round(sv+Math.max(3,hautPx*0.22))});
        quiToit.push(bi);
      }
    }
    /* un seul aller-retour par photo et par usage, plutôt qu'un par colonne */
    if(bandesMur.length){
      const c=await PASSE_B(page,l.p.fichier,bandesMur);
      if(c) c.forEach((v,i)=>{ if(v[3]>=3 && v[4]<0.30) par.get(quiMur[i]).mur.push([v[0],v[1],v[2]]); });
    }
    if(bandesToit.length){
      const c=await PASSE_B(page,l.p.fichier,bandesToit);
      if(c) c.forEach((v,i)=>{ if(v[3]>=2 && v[4]<0.25) par.get(quiToit[i]).toit.push([v[0],v[1],v[2]]); });
    }
    l.bandes={mur:bandesMur, quiMur:quiMur, toit:bandesToit, quiToit:quiToit};
  }

  /* --- étalonnage : les mêmes bandes sur les panoramas du modèle courant ---
     La lumière est commune aux deux lots : c'est le rapport des deux mesures
     qui porte l'information, pas la mesure brute. */
  const etalons=new Map();
  if(ETALON){
    let vus=0;
    for(const l of lots){
      const f=path.join(ETALON,l.p.fichier);
      if(!fs.existsSync(f)){ continue; }
      await PASSE_A(page, base+'/etalon/'+encodeURIComponent(l.p.fichier), 'E:'+l.p.fichier);
      vus++;
      if(l.bandes.mur.length){
        const c=await PASSE_B(page,'E:'+l.p.fichier,l.bandes.mur);
        if(c) c.forEach((v,i)=>{
          if(v[3]<3 || v[4]>=0.30) return;
          const bi=l.bandes.quiMur[i];
          if(!etalons.has(bi)) etalons.set(bi,[]);
          etalons.get(bi).push([v[0],v[1],v[2]]);
        });
      }
    }
    console.log('étalon : '+vus+' panoramas du modèle courant relus dans '+ETALON);
  }
  await nav.close(); srv.close();
  console.log('tri des colonnes :');
  Object.entries(rejet).forEach(([k,v])=>console.log('  '+String(v).padStart(7)+'  '+k));

  /* Les couleurs de base que le modèle donne aujourd'hui, pour y appliquer
     le gain. Elles viennent de verite.json quand il est là — c'est-à-dire
     quand les panoramas d'étalonnage ont été rendus par rendre_equirect.js. */
  const BASE_MUR=new Map();
  {
    const fv=path.join(ETALON||DOSSIER,'verite.json');
    if(fs.existsSync(fv)){
      const V=JSON.parse(fs.readFileSync(fv,'utf8'));
      const cle=o=>Math.round(pX(o.lo))+'_'+Math.round(pZ(o.la));
      const idx=new Map(); V.forEach(v=>idx.set(cle(v),v));
      BATS.forEach(b=>{ const v=idx.get(Math.round(b.cx)+'_'+Math.round(b.cz));
        if(v&&v.mur){ const n=parseInt(v.mur.slice(2),16);
          BASE_MUR.set(b.i,[n>>16&255,n>>8&255,n&255]); } });
    }
  }

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
    /* La silhouette donne le faîte de la toiture, pas le haut des murs, et
       c'est le haut des murs qui compte les niveaux. Le moteur monte son
       faîte de min(L × 0,72 ; 3,4) où L est la demi-largeur du petit côté
       augmentée du débord : on connaît ces côtés par l'emprise OSM, on peut
       donc retrancher la même chose au lieu de compter un étage de trop. */
    const rise=Math.min((Math.min(b.ow,b.ol)/2+0.38)*0.72, 3.4);
    const hMurs=Math.max(2.4, h-rise);
    /* dispersion : si les colonnes ne s'accordent pas, on ne publie pas */
    const tri=e.h.slice().sort((x,y)=>x-y);
    const q1=tri[Math.floor(tri.length*0.25)], q3=tri[Math.floor(tri.length*0.75)];
    const etal=q3-q1;
    /* Couleur corrigée : couleur de base actuelle × (photo / rendu). Faute
       d'étalon on rend la mesure brute, en le disant dans le fichier. */
    let murCor=medC(e.mur), gain=null;
    if(ETALON && etalons.has(bi) && etalons.get(bi).length>=3 && murCor){
      const ref=medC(etalons.get(bi));
      if(ref && ref.every(v=>v>10)){
        gain=[0,1,2].map(c=>Math.max(0.25,Math.min(4, murCor[c]/ref[c])));
        const base=BASE_MUR.get(bi);
        if(base) murCor=[0,1,2].map(c=>Math.round(Math.max(0,Math.min(255,base[c]*gain[c]))));
      }
    }
    releve.push({
      i:bi, la:+laDeZ(b.cz).toFixed(6), lo:+loDeX(b.cx).toFixed(6),
      haut:+h.toFixed(1), murs:+hMurs.toFixed(1), etalement:+etal.toFixed(1),
      faite:(e.abs.length? +med(e.abs).toFixed(1) : null),
      niv:Math.max(1,Math.round((hMurs-1.1)/3.15)),
      mur:hex(murCor), murMesure:hex(medC(e.mur)),
      gain:gain?gain.map(v=>+v.toFixed(2)):null,
      toit:hex(medC(e.toit)),
      colonnes:e.h.length, vues:e.vues, dist:+med(e.d).toFixed(0),
      aire:b.aire, ow:+b.ow.toFixed(1), ol:+b.ol.toFixed(1)
    });
  }
  releve.sort((a,b)=>b.colonnes-a.colonnes);
  fs.writeFileSync(SORTIE, JSON.stringify({page:PAGE, decalage:decal, photos:M.photos.length,
      hauteurCamera:M.h, batiments:releve},null,1));
  console.log('=== '+releve.length+' bâtiments relevés sur '+BATS.length+' → '+SORTIE+' ===');
  /* Ce qu'on publie : les bâtiments vus assez large, d'assez près, et dont
     les colonnes s'accordent. Les fautifs du contrôle étaient tous des
     façades vues en biais à cinquante ou soixante mètres sur six à dix
     colonnes — une lichette de mur, où une erreur d'un pixel de silhouette
     vaut un mètre de hauteur. */
  const sur=releve.filter(r=>r.etalement<2.5 && r.colonnes>=12 && r.dist<=45);
  console.log('    dont '+sur.length+' retenus (étalement < 2,5 m, 12 colonnes, 45 m)');

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
      const bons=paires.filter(([r,v])=>r.faite!==null&&r.etalement<2.5&&r.colonnes>=12&&r.dist<=45);
      ligne('faîte, tous', paires.filter(([r,v])=>r.faite!==null).map(([r,v])=>Math.abs(r.faite-v.faite)));
      ligne('faîte, retenus', bons.map(([r,v])=>Math.abs(r.faite-v.faite)));
      /* le haut des murs : le faîte moins le relèvement estimé de la toiture */
      ligne('haut des murs, retenus', bons.map(([r,v])=>Math.abs((r.faite-(r.haut-r.murs))-v.murs)));
      const nv=bons.map(([r,v])=>Math.abs(r.niv-Math.max(1,Math.round((v.murs-v.sol-1.1)/3.15))));
      if(nv.length) console.log('    niveaux justes               '+
        (nv.filter(x=>x===0).length/nv.length*100).toFixed(0)+' %   à un près '+
        (nv.filter(x=>x<=1).length/nv.length*100).toFixed(0)+' %   ('+nv.length+' bâtiments)');
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
      ', note:\'relevé 360, murs '+r.murs.toFixed(1)+' m, faîte '+r.haut.toFixed(1)+
      ' m sur '+r.colonnes+' colonnes\'},');
  });
})();
