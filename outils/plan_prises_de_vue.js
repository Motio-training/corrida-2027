/* Plan de prise de vue de la Corrida : ce que le coureur voit vraiment.

   Lit les données de la page (emprises OSM du bloc d-bats, tracé et jalonneurs
   de l'état embarqué), lance des rayons depuis le tracé tous les 6 m sur un
   champ de 150°, retient la première façade touchée par chaque rayon, et
   classe les bâtiments par exposition réelle (degrés vus × mètres parcourus).
   Pour chaque façade retenue, cherche le point du tracé d'où elle se
   photographie le mieux : de face, dégagée, ni trop près ni trop loin.

   Usage : node outils/plan_prises_de_vue.js
   Écrit outils/plan_prises_de_vue.json (tout) et releve/plan.json (embarqué).
   À relancer quand le tracé ou les jalonneurs changent. */
const fs=require('fs');
const RACINE=require('path').resolve(__dirname,'..');
const S=fs.readFileSync(RACINE+'/index.html','utf8');
const L=S.split('\n');

/* ---- repère local, identique à code3d.js ---- */
const PI=Math.PI, LA0=46.4136975, LO0=-0.2096655, f=LA0*PI/180;
const MLAT=111132.92-559.82*Math.cos(2*f)+1.175*Math.cos(4*f)-0.0023*Math.cos(6*f);
const MLON=111412.84*Math.cos(f)-93.5*Math.cos(3*f)+0.118*Math.cos(5*f);
const pX=lo=>(lo-LO0)*MLON, pZ=la=>(LA0-la)*MLAT;
const laDe=z=>LA0-z/MLAT, loDe=x=>LO0+x/MLON;

/* ---- blocs de données ---- */
function bloc(id){
  const i=L.findIndex(l=>l.includes('id="'+id+'"'));
  const out=[];
  for(let k=i+1;k<L.length;k++){ if(L[k].startsWith('</script>')) break; if(L[k].trim()) out.push(L[k]); }
  return out;
}
const pointsDe=s=>s.split(' ').map(t=>{const c=t.split(','); return [(+c[0])/10,(+c[1])/10];});

const BATS=bloc('d-bats').map((l,i)=>{
  const c=l.split('\t'); if(c.length<11) return null;
  const p=pointsDe(c[10]); if(p.length<3) return null;
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
  for(const q of p){ x0=Math.min(x0,q[0]); x1=Math.max(x1,q[0]); z0=Math.min(z0,q[1]); z1=Math.max(z1,q[1]); }
  return {i, k:c[0], rect:+c[1], cx:(+c[3])/10, cz:(+c[4])/10, aire:+c[7], lv:+c[8], p, bb:[x0,x1,z0,z1]};
}).filter(Boolean);

const ZONES_M=bloc('d-zones').map(l=>l.split('\t')).filter(c=>c.length>=3&&c[0]==='M').map(c=>pointsDe(c[2]));

const i0=S.indexOf('window.ETAT_EMBARQUE=');
const ETAT=JSON.parse(S.slice(i0+21,S.indexOf('</script>',i0)).replace(/;\s*$/,''));
const C=ETAT.courant;
const TRACE=C.trace.map(q=>[pX(q[1]),pZ(q[0])]);
const JALONS=C.jalons.map((j,n)=>({n:n+1, la:j[0], lo:j[1], x:pX(j[1]), z:pZ(j[0]), niv:j[2], az:j[3], bras:j[4]}));
const POIS=C.pois.map(q=>({la:q[0], lo:q[1], x:pX(q[1]), z:pZ(q[0]), nom:q[2], desc:q[3], sur:q[4]}));

function dansPoly(p,x,z){
  let d=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++){
    const xi=p[i][0],zi=p[i][1],xj=p[j][0],zj=p[j][1];
    if(((zi>z)!==(zj>z)) && (x<(xj-xi)*(z-zi)/(zj-zi)+xi)) d=!d;
  }
  return d;
}
const militaire=(x,z)=>ZONES_M.some(p=>dansPoly(p,x,z));

/* ---- grille d'occupation à 1,5 m : quel bâtiment occupe chaque case ---- */
const PAS=1.5, GX0=-1300, GZ0=-1100, GW=Math.ceil(2600/PAS), GH=Math.ceil(2200/PAS);
const G=new Uint16Array(GW*GH);
for(const b of BATS){
  const jx0=Math.max(0,Math.floor((b.bb[0]-GX0)/PAS)), jx1=Math.min(GW-1,Math.ceil((b.bb[1]-GX0)/PAS));
  const jz0=Math.max(0,Math.floor((b.bb[2]-GZ0)/PAS)), jz1=Math.min(GH-1,Math.ceil((b.bb[3]-GZ0)/PAS));
  for(let jz=jz0;jz<=jz1;jz++) for(let jx=jx0;jx<=jx1;jx++){
    const x=GX0+(jx+0.5)*PAS, z=GZ0+(jz+0.5)*PAS;
    if(dansPoly(b.p,x,z)) G[jz*GW+jx]=b.i+1;
  }
}
const caseDe=(x,z)=>{
  const jx=(x-GX0)/PAS|0, jz=(z-GZ0)/PAS|0;
  if(jx<0||jz<0||jx>=GW||jz>=GH) return 0;
  return G[jz*GW+jx];
};

/* ---- échantillonnage du tracé ---- */
const PASE=6, ECH=[];
let reste=0, cum=0;
for(let i=0;i<TRACE.length-1;i++){
  const a=TRACE[i], b=TRACE[i+1];
  const dx=b[0]-a[0], dz=b[1]-a[1], seg=Math.hypot(dx,dz);
  if(seg<0.01) continue;
  const cap=Math.atan2(dx,-dz); /* azimut : 0 = nord (-z), 90 = est (+x) */
  for(let t=reste;t<seg;t+=PASE){
    ECH.push({x:a[0]+dx*t/seg, z:a[1]+dz*t/seg, cap, d:cum+t});
  }
  const n=Math.floor((seg-reste)/PASE)+ (reste<seg?1:0);
  reste=Math.max(0,reste+n*PASE-seg);
  cum+=seg;
}

/* ---- lancer de rayons : ce que l'on voit depuis le tracé ---- */
const PORTEE=110, PASR=1.0, OUV=75, PASA=1.5;
const EXPO=new Float64Array(BATS.length);     /* degrés x mètres parcourus */
const VUES=new Map();                          /* bâtiment -> meilleures visées */
for(const e of ECH){
  for(let a=-OUV;a<=OUV;a+=PASA){
    const ang=e.cap+a*PI/180;
    const ux=Math.sin(ang), uz=-Math.cos(ang);
    for(let r=4;r<PORTEE;r+=PASR){
      const x=e.x+ux*r, z=e.z+uz*r;
      const c=caseDe(x,z);
      if(!c) continue;
      const bi=c-1;
      /* largeur angulaire vue : un rayon couvre PASA degrés, pondéré par la marche */
      EXPO[bi]+=PASA*PASE;
      let v=VUES.get(bi); if(!v){ v=[]; VUES.set(bi,v); }
      v.push({e, ang, r, x, z, a});
      break;
    }
  }
}

/* ---- pour chaque bâtiment exposé : le meilleur point de vue sur sa plus belle façade ---- */
function murs(b){
  const M=[];
  for(let i=0;i<b.p.length;i++){
    const A=b.p[i], B=b.p[(i+1)%b.p.length];
    const dx=B[0]-A[0], dz=B[1]-A[1], L=Math.hypot(dx,dz);
    if(L<4) continue;
    const mx=(A[0]+B[0])/2, mz=(A[1]+B[1])/2;
    /* normale sortante : celle qui s'éloigne du centre */
    let nx=dz/L, nz=-dx/L;
    if(nx*(mx-b.cx)+nz*(mz-b.cz)<0){ nx=-nx; nz=-nz; }
    M.push({A,B,L,mx,mz,nx,nz});
  }
  return M;
}
function degage(x0,z0,x1,z1,bi){
  const dx=x1-x0, dz=z1-z0, D=Math.hypot(dx,dz);
  for(let r=2;r<D-1.2;r+=1.0){
    const c=caseDe(x0+dx*r/D, z0+dz*r/D);
    if(c && c-1!==bi) return false;
  }
  return true;
}
const CANDIDATS=[];
for(const [bi,v] of VUES){
  const b=BATS[bi];
  if(EXPO[bi]<260) continue;                       /* trop peu vu */
  if(b.aire<45 && !POIS.some(p=>Math.hypot(p.x-b.cx,p.z-b.cz)<18)) continue;
  const M=murs(b); if(!M.length) continue;
  const points=[...new Set(v.map(h=>h.e))];
  let best=null;
  for(const m of M){
    for(const e of points){
      const vx=e.x-m.mx, vz=e.z-m.mz, D=Math.hypot(vx,vz);
      if(D<7||D>75) continue;
      const front=(vx*m.nx+vz*m.nz)/D;             /* 1 = pile en face */
      if(front<0.45) continue;
      if(!degage(e.x,e.z,m.mx,m.mz,bi)) continue;
      /* une façade se photographie bien de face, ni trop près ni trop loin */
      const dist=Math.exp(-Math.pow((D-Math.max(14,m.L*0.9))/18,2));
      const note=front*front*Math.min(m.L,26)*dist;
      if(!best||note>best.note) best={note, m, e, D, front};
    }
  }
  if(!best) continue;
  const az=(Math.atan2(best.m.mx-best.e.x, -(best.m.mz-best.e.z))*180/PI+360)%360;
  const poi=POIS.map(p=>({p, d:Math.hypot(p.x-b.cx,p.z-b.cz)})).sort((a,b)=>a.d-b.d)[0];
  CANDIDATS.push({
    bi, expo:Math.round(EXPO[bi]), aire:Math.round(b.aire), lv:b.lv,
    km:+(best.e.d/1000).toFixed(3),
    la:+laDe(best.e.z).toFixed(6), lo:+loDe(best.e.x).toFixed(6),
    az:Math.round(az), dist:+best.D.toFixed(1), larg:+best.m.L.toFixed(1),
    front:+best.front.toFixed(2), note:+best.note.toFixed(1),
    milit:militaire(b.cx,b.cz),
    poi: poi && poi.d<28 ? poi.p.nom : null
  });
}

/* ---- regroupement : un arrêt = plusieurs façades vues du même endroit ---- */
CANDIDATS.sort((a,b)=>a.km-b.km);
const ARRETS=[];
for(const c of CANDIDATS){
  const a=ARRETS.find(a=>Math.abs(a.km-c.km)<0.022 && Math.abs(((a.az-c.az+540)%360)-180)<26);
  if(a){ a.sujets.push(c); a.expo+=c.expo; }
  else ARRETS.push({km:c.km, la:c.la, lo:c.lo, az:c.az, expo:c.expo, sujets:[c]});
}
for(const a of ARRETS){
  a.az=Math.round(a.sujets.reduce((s,c)=>s+c.az,0)/a.sujets.length);
  a.dist=Math.round(a.sujets.reduce((s,c)=>s+c.dist,0)/a.sujets.length);
  a.milit=a.sujets.some(c=>c.milit);
  a.poi=a.sujets.map(c=>c.poi).filter(Boolean)[0]||null;
  a.note=+a.sujets.reduce((s,c)=>s+c.note,0).toFixed(1);
}
ARRETS.sort((a,b)=>b.note-a.note);
ARRETS.forEach((a,i)=>{ a.rang=i+1; a.prio = a.poi ? 1 : (i<40?1:(i<90?2:3)); });
ARRETS.sort((a,b)=>a.km-b.km);
ARRETS.forEach((a,i)=>{ a.id=i+1; });

const SORTIE={
  source:'corrida-2027, parcours actif ('+(C.distance_m/1000).toFixed(2)+' km, '+C.denivele_m+' m D+)',
  batiments_osm:BATS.length, echantillons:ECH.length,
  arrets:ARRETS.length,
  panoramas:JALONS.length,
  arrets_photo:ARRETS.map(a=>({
    id:a.id, prio:a.prio, km:a.km, la:a.la, lo:a.lo, az:a.az, recul_m:a.dist,
    facades:a.sujets.length, largeur_m:+a.sujets.reduce((s,c)=>s+c.larg,0).toFixed(1),
    exposition:a.expo, ensoa:a.milit, repere:a.poi
  })),
  panoramas_jalonneurs:JALONS.map(j=>({n:j.n, la:j.la, lo:j.lo, az:j.az, niveau:j.niv==='r'?'indispensable':'facultatif'}))
};
fs.writeFileSync(RACINE+'/outils/plan_prises_de_vue.json',JSON.stringify(SORTIE,null,1));
/* le plan embarqué sur le téléphone : uniquement ce qui sert au relevé */
fs.writeFileSync(RACINE+'/releve/plan.json',JSON.stringify({
  genere:new Date().toISOString().slice(0,10),
  source:SORTIE.source,
  arrets:SORTIE.arrets_photo.map(a=>({i:a.id,p:a.prio,km:a.km,la:a.la,lo:a.lo,az:a.az,r:a.recul_m,
                                      f:a.facades,l:a.largeur_m,e:a.exposition,m:a.ensoa?1:0,n:a.repere||''})),
  jalons:SORTIE.panoramas_jalonneurs.map(j=>({n:j.n,la:j.la,lo:j.lo,az:j.az,r:j.niveau==='indispensable'?1:0}))
}));

console.log('bâtiments OSM            :',BATS.length);
console.log('points de tracé examinés :',ECH.length,'(tous les',PASE,'m)');
console.log('bâtiments réellement vus :',VUES.size);
console.log('façades retenues         :',CANDIDATS.length);
console.log('arrêts photo             :',ARRETS.length, '| prio 1 :',ARRETS.filter(a=>a.prio===1).length,
            '| prio 2 :',ARRETS.filter(a=>a.prio===2).length,'| prio 3 :',ARRETS.filter(a=>a.prio===3).length);
console.log('dont dans l\'enceinte ENSOA :',ARRETS.filter(a=>a.milit).length);
console.log('panoramas de jalonneurs  :',JALONS.length,'(',JALONS.filter(j=>j.niv==='r').length,'indispensables )');
console.log('\n--- 25 premiers arrêts, par ordre de marche ---');
console.log('id  km     az    recul  fac  prio  repère');
for(const a of ARRETS.slice(0,25)){
  console.log(String(a.id).padEnd(4)+String(a.km.toFixed(2)).padEnd(7)+String(a.az+'°').padEnd(6)+
    String(a.dist+' m').padEnd(7)+String(a.sujets.length).padEnd(5)+String(a.prio).padEnd(6)+(a.poi||(a.milit?'(ENSOA)':'')));
}
