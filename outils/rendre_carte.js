/* Fond de carte du relevé photo.

   Extrait de la page les rues, la rivière et les emprises de bâtiments
   autour du parcours, et les écrit en mètres dans le repère local — le
   même que celui du plan de prise de vue. L'application les dessine sur
   une toile, avec le tracé, les arrêts et la position du téléphone.

   Usage : node outils/rendre_carte.js
   Écrit releve/carte.json.                                              */

const fs=require('fs'), path=require('path');
const RACINE=path.resolve(__dirname,'..');
const S=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
const L=S.split('\n');

const PI=Math.PI, LA0=46.4136975, LO0=-0.2096655, f=LA0*PI/180;
const MLAT=111132.92-559.82*Math.cos(2*f)+1.175*Math.cos(4*f)-0.0023*Math.cos(6*f);
const MLON=111412.84*Math.cos(f)-93.5*Math.cos(3*f)+0.118*Math.cos(5*f);
const pX=lo=>(lo-LO0)*MLON, pZ=la=>(LA0-la)*MLAT;

function bloc(id){
  const i=L.findIndex(l=>l.includes('id="'+id+'"'));
  const out=[];
  for(let k=i+1;k<L.length;k++){ if(L[k].startsWith('</script>')) break; if(L[k].trim()) out.push(L[k]); }
  return out;
}
const pointsDe=s=>{
  const t=s.split(' '), r=[];
  for(const q of t){ const c=q.split(','); r.push([(+c[0])/10,(+c[1])/10]); }
  return r;
};

/* ---- le tracé, pour savoir ce qui est « autour du parcours » ---- */
const i0=S.indexOf('window.ETAT_EMBARQUE=');
const ETAT=JSON.parse(S.slice(i0+21,S.indexOf('</script>',i0)).replace(/;\s*$/,''));
const C=ETAT.courant;
const TRACE=C.trace.map(q=>[pX(q[1]),pZ(q[0])]);

/* grille de proximité au tracé : une case de 40 m est « proche » si le
   tracé passe à moins de MARGE d'elle */
const MARGE=170, CASE=40;
const proche=new Set();
function marquer(x,z){
  const r=Math.ceil(MARGE/CASE);
  const cx=Math.round(x/CASE), cz=Math.round(z/CASE);
  for(let i=-r;i<=r;i++) for(let j=-r;j<=r;j++){
    if(Math.hypot(i*CASE,j*CASE)<=MARGE) proche.add((cx+i)+':'+(cz+j));
  }
}
for(let i=0;i<TRACE.length-1;i++){
  const a=TRACE[i], b=TRACE[i+1], d=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const n=Math.max(1,Math.ceil(d/20));
  for(let k=0;k<=n;k++) marquer(a[0]+(b[0]-a[0])*k/n, a[1]+(b[1]-a[1])*k/n);
}
const estProche=(x,z)=>proche.has(Math.round(x/CASE)+':'+Math.round(z/CASE));

/* ---- simplification : on jette les points qui ne changent rien ---- */
function simplifier(p,tol){
  if(p.length<3) return p;
  const garde=[p[0]];
  for(let i=1;i<p.length-1;i++){
    const a=garde[garde.length-1], b=p[i], c=p[i+1];
    /* distance de b au segment a-c */
    const dx=c[0]-a[0], dz=c[1]-a[1], l2=dx*dx+dz*dz;
    let d;
    if(l2<1e-9) d=Math.hypot(b[0]-a[0],b[1]-a[1]);
    else {
      const t=Math.max(0,Math.min(1,((b[0]-a[0])*dx+(b[1]-a[1])*dz)/l2));
      d=Math.hypot(b[0]-(a[0]+dx*t), b[1]-(a[1]+dz*t));
    }
    if(d>tol) garde.push(b);
  }
  garde.push(p[p.length-1]);
  return garde;
}
const plat=p=>{ const r=[]; for(const q of p){ r.push(Math.round(q[0]),Math.round(q[1])); } return r; };

/* ---- rues ----
   Une route qui passe près du parcours peut filer à des kilomètres :
   on ne garde que les portions proches, découpées en tronçons. */
function troncons(p){
  const out=[];
  let cour=null;
  for(let i=0;i<p.length;i++){
    if(estProche(p[i][0],p[i][1])){
      if(!cour){ cour=[]; if(i>0) cour.push(p[i-1]); }   /* un point de marge */
      cour.push(p[i]);
    } else if(cour){
      cour.push(p[i]);
      out.push(cour); cour=null;
    }
  }
  if(cour) out.push(cour);
  return out.filter(t=>t.length>1);
}
const VOIES=[];
bloc('d-voies').forEach(l=>{
  const c=l.split('\t');
  if(c.length<4) return;
  const p=pointsDe(c[3]);
  if(p.length<2) return;
  /* la largeur sert à distinguer les grandes voies des ruelles */
  const larg=Math.max(2,Math.min(14,Math.round((+c[1]||30)/10)));
  troncons(p).forEach(t=>VOIES.push({l:larg, p:plat(simplifier(t,1.2))}));
});

/* ---- rivière et ruisseaux ---- */
const EAU=[];
bloc('d-lignes').forEach(l=>{
  const c=l.split('\t');
  if(c[0]!=='R') return;
  const p=pointsDe(c[1]);
  if(p.length<2) return;
  troncons(p).forEach(t=>EAU.push(plat(simplifier(t,1.5))));
});

/* ---- emprises de bâtiments ---- */
const BATIS=[];
bloc('d-bats').forEach(l=>{
  const c=l.split('\t');
  if(c.length<11) return;
  const p=pointsDe(c[10]);
  if(p.length<3) return;
  const cx=(+c[3])/10, cz=(+c[4])/10;
  if(!estProche(cx,cz)) return;
  if((+c[7])<20) return;                    /* les cabanes n'aident pas à se repérer */
  BATIS.push(plat(simplifier(p,0.8)));
});

/* ---- cadre ---- */
let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
function etendre(r){ for(let i=0;i<r.length;i+=2){
  if(r[i]<x0)x0=r[i]; if(r[i]>x1)x1=r[i];
  if(r[i+1]<z0)z0=r[i+1]; if(r[i+1]>z1)z1=r[i+1];
} }
VOIES.forEach(v=>etendre(v.p)); EAU.forEach(etendre); BATIS.forEach(etendre);

const CARTE={
  genere:new Date().toISOString().slice(0,10),
  /* de quoi convertir une position GPS en mètres, comme la 3D */
  ref:{la0:LA0, lo0:LO0, mlat:+MLAT.toFixed(3), mlon:+MLON.toFixed(3)},
  cadre:[x0,x1,z0,z1],
  /* cadre du seul parcours : c'est là que l'application se cale au départ */
  cadreTrace:(function(){
    let a=1e9,b=-1e9,c=1e9,d=-1e9;
    TRACE.forEach(q=>{ a=Math.min(a,q[0]); b=Math.max(b,q[0]); c=Math.min(c,q[1]); d=Math.max(d,q[1]); });
    return [Math.round(a),Math.round(b),Math.round(c),Math.round(d)];
  })(),
  trace:plat(simplifier(TRACE,1.0)),
  voies:VOIES, eau:EAU, batis:BATIS
};
const fichier=path.join(RACINE,'releve','carte.json');
fs.writeFileSync(fichier,JSON.stringify(CARTE));
const ko=Math.round(fs.statSync(fichier).size/1024);
console.log('carte.json : '+ko+' Ko');
console.log('  '+VOIES.length+' rues, '+EAU.length+' cours d’eau, '+BATIS.length+' bâtiments');
console.log('  cadre des données : '+Math.round(x1-x0)+' × '+Math.round(z1-z0)+' m');
console.log('  cadre du parcours : '+(CARTE.cadreTrace[1]-CARTE.cadreTrace[0])+' × '+(CARTE.cadreTrace[3]-CARTE.cadreTrace[2])+' m');
console.log('  tracé : '+(CARTE.trace.length/2)+' points');
