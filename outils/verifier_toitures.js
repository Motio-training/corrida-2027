/* Les toitures couvrent-elles le bâti, et rien que le bâti ?

   Une toiture posée sur la boîte englobante du bâtiment dépasse dans le
   vide dès que l'emprise n'est pas rectangulaire — et à Saint-Maixent, où
   les rangées suivent des rues obliques, deux emprises sur cinq laissent
   plus d'un dixième de leur boîte hors du bâti. De la rue, on voyait un pan
   de toit suspendu en plein ciel : c'est la « zone de vide » relevée sur le
   terrain. La toiture est donc découpée sur l'emprise (toitTente dans
   actifs/code3d.js), et ce contrôle vérifie les quatre invariants qui
   rendent ce découpage juste :

     1. toute l'emprise est couverte — pas de trou dans le toit ;
     2. rien ne dépasse de plus d'un mètre du contour — pas de pan suspendu
        (le débord de toit vaut 38 cm) ;
     3. chaque triangle de pan a une normale franche, tournée vers le haut,
        et tourne dans le sens de cette normale — sinon le moteur l'efface
        ou l'éclaire par en dessous, et il apparaît en noir ;
     4. chaque bande de pignon ferme l'écart entre le haut du mur et le
        rampant, et tourne elle aussi dans le bon sens — c'est ce qui
        manquait : une bande sur deux était effacée, et le toit paraissait
        flotter alors qu'il était bien posé.

   Le contrôle tourne hors du navigateur : on extrait les fonctions de
   géométrie du moteur et on les appelle sur les 4546 emprises embarquées.
   Une seconde, là où un rendu en demande deux minutes.

   Usage : node outils/verifier_toitures.js [--details]                    */

const fs=require('fs'), path=require('path');
const RACINE=path.resolve(__dirname,'..');
const DETAILS=process.argv.includes('--details');
const S=fs.readFileSync(path.join(RACINE,'actifs/code3d.js'),'utf8');

/* --- extraction des fonctions à éprouver --------------------------------- */
function extrait(nom){
  const i=S.indexOf('function '+nom+'(');
  if(i<0) throw new Error('fonction introuvable dans code3d.js : '+nom);
  let d=0;
  for(let k=S.indexOf('{',i);k<S.length;k++){
    if(S[k]==='{') d++;
    else if(S[k]==='}'){ d--; if(!d) return S.slice(i,k+1); }
  }
  throw new Error('accolades déséquilibrées : '+nom);
}
function extraitAffect(nom){
  const i=S.indexOf(nom+'=function(');
  if(i<0) throw new Error('réaffectation introuvable dans code3d.js : '+nom);
  let d=0;
  for(let k=S.indexOf('{',i);k<S.length;k++){
    if(S[k]==='{') d++;
    else if(S[k]==='}'){ d--; if(!d) return S.slice(i,k+1)+';'; }
  }
  throw new Error('accolades déséquilibrées : '+nom);
}

const PI=Math.PI;
const TOP=80, BASE=71;                     /* un bâtiment de neuf mètres */
let pans=[], pignons=[], faitieres=0, gouttieres=0;
const TAS={ tri:(ax,ay,az,bx,by,bz,cx,cy,cz,nx,ny,nz)=>
  pans.push([[ax,ay,az],[bx,by,bz],[cx,cy,cz],[nx,ny,nz]]) };
const MUR={ tri:(ax,ay,az,bx,by,bz,cx,cy,cz,nx,ny,nz)=>
  pignons.push([[ax,ay,az],[bx,by,bz],[cx,cy,cz],[nx,ny,nz]]) };
/* doublures du moteur : seules comptent la géométrie des pans et des pignons */
var CTX_TOIT=null, toitDeuxPentes;
function pan(){ throw new Error('la tente ne doit plus passer par pan()'); }
function tube(tas){ if(tas===TAS) faitieres++; }
function gouttiere(){ gouttieres++; }
function assombrir(c){ return c; }
function melange(a){ return a; }
function teinte(){ return [0,0,0]; }
function boiteQuad(){}
const BAT={ zinc:{}, chem:{} };
eval([extrait('normSort'),extrait('empriseToit'),extrait('coupesU'),extrait('vSurArete'),
      extrait('panRogne'),extrait('triFace'),extrait('axeToit'),extrait('toitTente'),
      extraitAffect('toitDeuxPentes')].join('\n'));

/* --- les emprises embarquées --------------------------------------------- */
const L=fs.readFileSync(path.join(RACINE,'index.html'),'utf8').split('\n');
const i0=L.findIndex(l=>l.includes('id="d-bats"'));
const LIGNES=[];
for(let k=i0+1;k<L.length;k++){
  if(L[k].startsWith('</script>')) break;
  if(L[k].trim()) LIGNES.push(L[k]);
}

function dansPoly(p,n,x,z){
  let d=false;
  for(let i=0,j=n-1;i<n;j=i++){
    const xi=p[i*2], zi=p[i*2+1], xj=p[j*2], zj=p[j*2+1];
    if(((zi>z)!==(zj>z)) && (x<(xj-xi)*(z-zi)/(zj-zi)+xi)) d=!d;
  }
  return d;
}
function distContour(p,n,x,z){
  let dm=1e9;
  for(let i=0,j=n-1;i<n;j=i++){
    const ax=p[j*2], az=p[j*2+1], bx=p[i*2], bz=p[i*2+1];
    const dx=bx-ax, dz=bz-az, ll=dx*dx+dz*dz;
    let t=ll?((x-ax)*dx+(z-az)*dz)/ll:0;
    t=Math.max(0,Math.min(1,t));
    dm=Math.min(dm,Math.hypot(x-ax-dx*t, z-az-dz*t));
  }
  return dm;
}
/* tolérance d'un dixième de millimètre : sans elle, un point tombant pile
   sur la couture entre deux tranches échoue aux deux tests et se compte à
   tort comme un trou */
function sousLeToit(x,z){
  for(const t of pans){
    const [A,B,C]=t;
    const d1=(B[0]-A[0])*(z-A[2])-(B[2]-A[2])*(x-A[0]);
    const d2=(C[0]-B[0])*(z-B[2])-(C[2]-B[2])*(x-B[0]);
    const d3=(A[0]-C[0])*(z-C[2])-(A[2]-C[2])*(x-C[0]);
    if((d1>=-1e-4&&d2>=-1e-4&&d3>=-1e-4)||(d1<=1e-4&&d2<=1e-4&&d3<=1e-4)) return true;
  }
  return false;
}
function normaleDe(A,B,C){
  const ux=B[0]-A[0], uy=B[1]-A[1], uz=B[2]-A[2];
  const vx=C[0]-A[0], vy=C[1]-A[1], vz=C[2]-A[2];
  return [uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx];
}

const PAS=0.5;                             /* pas d'échantillonnage, en m */
let nToit=0, nPan=0, nPignon=0;
const defauts={trou:[], debord:[], normale:[], sens:[], pignon:[]};
const t0=Date.now();
for(let idx=0;idx<LIGNES.length;idx++){
  const c=LIGNES[idx].split('\t');
  if(c.length<11) continue;
  const p=[];
  c[10].split(' ').forEach(t=>{ const q=t.split(','); p.push((+q[0])/10,(+q[1])/10); });
  const n=p.length/2;
  if(n<3) continue;
  const rect=+c[1], ang=(+c[2])/10*PI/180;
  const cx=(+c[3])/10, cz=(+c[4])/10, ow=(+c[5])/10, ol=(+c[6])/10, aire=+c[7];
  /* même filtre que construireBatis : seules ces emprises reçoivent une
     toiture à deux pentes ; les autres ont un toit plat posé sur le contour */
  if(!(rect>=72 && Math.min(ow,ol)>2.4)) continue;
  nToit++;
  pans=[]; pignons=[];
  CTX_TOIT={ mur:MUR, col:[0,0,0], base:BASE, h:TOP-BASE, p:p, n:n };
  toitDeuxPentes(TAS,cx,cz,ang,ow,ol,TOP,[0,0,0],1.25,aire,0.5,[0,0,0]);
  CTX_TOIT=null;
  nPan+=pans.length; nPignon+=pignons.length;

  /* 1 et 2 : couverture et débord */
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
  for(let i=0;i<n;i++){
    x0=Math.min(x0,p[i*2]); x1=Math.max(x1,p[i*2]);
    z0=Math.min(z0,p[i*2+1]); z1=Math.max(z1,p[i*2+1]);
  }
  let trous=0, debords=0;
  for(let x=x0+PAS/2;x<=x1;x+=PAS) for(let z=z0+PAS/2;z<=z1;z+=PAS){
    const dedans=dansPoly(p,n,x,z), couvert=sousLeToit(x,z);
    if(dedans && !couvert) trous++;
    else if(!dedans && couvert && distContour(p,n,x,z)>1.2) debords++;
  }
  if(trous*PAS*PAS>0.6) defauts.trou.push('#'+idx+' : '+(trous*PAS*PAS).toFixed(1)+' m² de toit manquant');
  if(debords*PAS*PAS>0.6) defauts.debord.push('#'+idx+' : '+(debords*PAS*PAS).toFixed(1)+' m² de toit hors emprise');

  /* 3 : normales et sens de rotation des pans */
  for(const t of pans){
    const [A,B,C,N]=t;
    if(N[1]<0){ defauts.normale.push('#'+idx+' : pan tourné vers le bas'); break; }
    const g=normaleDe(A,B,C);
    if(Math.hypot(g[0],g[1],g[2])<1e-4) continue;
    if(g[0]*N[0]+g[1]*N[1]+g[2]*N[2]<0){ defauts.sens.push('#'+idx+' : pan à rotation contraire'); break; }
  }

  /* 4 : les pignons ferment jusqu'au rampant, et dans le bon sens */
  let hautToit=0, hautPignon=TOP, mauvaisSens=false;
  for(const t of pans) for(const P of t.slice(0,3)) hautToit=Math.max(hautToit,P[1]);
  for(const t of pignons){
    for(const P of t.slice(0,3)) hautPignon=Math.max(hautPignon,P[1]);
    const g=normaleDe(t[0],t[1],t[2]);
    if(Math.hypot(g[0],g[1],g[2])>1e-6 && g[0]*t[3][0]+g[1]*t[3][1]+g[2]*t[3][2]<0) mauvaisSens=true;
  }
  if(mauvaisSens) defauts.pignon.push('#'+idx+' : bande de pignon à rotation contraire');
  else if(hautToit-hautPignon>0.05)
    defauts.pignon.push('#'+idx+' : pignon à '+hautPignon.toFixed(2)+' m sous un rampant à '+hautToit.toFixed(2)+' m');
}
const secondes=((Date.now()-t0)/1000).toFixed(1);

console.log('=== toitures à deux pentes : '+nToit+' emprises éprouvées en '+secondes+' s ===\n');
console.log('  triangles de pans     : '+nPan);
console.log('  triangles de pignons  : '+nPignon);
console.log('  faîtières             : '+faitieres);
console.log('  tronçons de gouttière : '+gouttieres+'\n');
const ETIQ={ trou:'emprises avec un trou dans le toit',
             debord:'emprises avec un pan suspendu hors du bâti',
             normale:'pans à la normale tournée vers le bas',
             sens:'pans à rotation contraire à leur normale',
             pignon:'pignons manquants, trop bas ou à l’envers' };
let total=0;
for(const cle of Object.keys(ETIQ)){
  const d=defauts[cle];
  total+=d.length;
  console.log((d.length?'  ✗ ':'  ✓ ')+String(d.length).padStart(4)+'  '+ETIQ[cle]);
  if(d.length && DETAILS) d.slice(0,12).forEach(m=>console.log('          '+m));
}
console.log('');
if(total){
  console.log(total+' défaut(s). Relancer avec --details pour les emprises concernées.');
  process.exit(1);
}
console.log('Aucun défaut : les '+nToit+' toitures couvrent leur emprise et rien de plus.');
