/* Quel bâtiment chaque photo montre-t-elle ?

   Depuis le point GPS et le cap de la boussole notés dans le manifeste, on
   lance un rayon dans les emprises OSM et on prend la première touchée. On
   en sort l'identité du bâtiment, sa taille, la famille de façade que la 3D
   lui donne aujourd'hui, et le mur visé — de quoi remplir la table
   d'exception avec ce que les photos montrent réellement.

   Usage : node outils/relever_batiments.js <dossier des photos>          */

const fs=require('fs'), path=require('path');
const RACINE=path.resolve(__dirname,'..');
const DOSSIER=process.argv[2];
if(!DOSSIER){ console.error('usage : node outils/relever_batiments.js <dossier>'); process.exit(1); }
const meta=JSON.parse(fs.readFileSync(path.join(DOSSIER,'manifeste.json'),'utf8'));

const S=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
const L=S.split('\n');
const PI=Math.PI, LA0=46.4136975, LO0=-0.2096655, f0=LA0*PI/180;
const MLAT=111132.92-559.82*Math.cos(2*f0)+1.175*Math.cos(4*f0)-0.0023*Math.cos(6*f0);
const MLON=111412.84*Math.cos(f0)-93.5*Math.cos(3*f0)+0.118*Math.cos(5*f0);
const pX=lo=>(lo-LO0)*MLON, pZ=la=>(LA0-la)*MLAT;

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
  return {i, k:c[0], rect:+c[1], ang:(+c[2])/10, cx:(+c[3])/10, cz:(+c[4])/10,
          ow:(+c[5])/10, ol:(+c[6])/10, aire:+c[7], lv:+c[8], ht:(+c[9])/10, p, bb:[x0,x1,z0,z1]};
}).filter(Boolean);

const ZONES_M=bloc('d-zones').map(l=>l.split('\t')).filter(c=>c.length>=3&&c[0]==='M').map(c=>pointsDe(c[2]));
function dansPoly(p,x,z){
  let d=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++){
    const xi=p[i][0],zi=p[i][1],xj=p[j][0],zj=p[j][1];
    if(((zi>z)!==(zj>z)) && (x<(xj-xi)*(z-zi)/(zj-zi)+xi)) d=!d;
  }
  return d;
}
const militaire=(x,z)=>ZONES_M.some(p=>dansPoly(p,x,z));

/* intersection d'un rayon avec les murs : on prend le mur le plus proche
   dont la face regarde vers nous */
function viser(x0,z0,az,portee){
  const a=az*PI/180, ux=Math.sin(a), uz=-Math.cos(a);
  let best=null;
  for(const b of BATS){
    /* rejet rapide par la boîte englobante élargie */
    if(Math.hypot(b.cx-x0,b.cz-z0)>portee+Math.max(b.ow,b.ol)) continue;
    const n=b.p.length;
    for(let i=0;i<n;i++){
      const A=b.p[i], B=b.p[(i+1)%n];
      const ex=B[0]-A[0], ez=B[1]-A[1];
      const den=ux*ez-uz*ex;
      if(Math.abs(den)<1e-9) continue;
      const t=((A[0]-x0)*ez-(A[1]-z0)*ex)/den;      /* le long du rayon */
      const s=((A[0]-x0)*uz-(A[1]-z0)*ux)/den;      /* le long du mur */
      if(t<1.5 || t>portee || s<0 || s>1) continue;
      if(!best || t<best.t){
        const Lm=Math.hypot(ex,ez);
        best={t, bat:b, mur:{A,B,L:+Lm.toFixed(1),
              az:+(((Math.atan2(ez,-ex)*180/PI)+360)%360).toFixed(0)}};
      }
    }
  }
  return best;
}

/* la famille que la 3D attribue aujourd'hui : même calcul que construireBatis */
function alea(a,b){
  let s=(a*374761393+b*668265263)|0;
  s=Math.imul(s^(s>>13),1274126177);
  s=s^(s>>16);
  return ((s>>>0)%100000)/100000;
}
function familleActuelle(b){
  const r2=alea(Math.round(b.cz*7),Math.round(b.cx*7));
  const milit=militaire(b.cx,b.cz);
  if(milit) return 3;
  const h=b.ht||0;
  if(b.aire>220||h>8.5) return r2<0.34?1:(r2<0.67?0:2);
  return r2<0.18?1:(r2<0.36?0:(r2<0.50?2:(r2<0.75?4:5)));
}
const NOMS_FAM=['0 enduit clair','1 pierre de taille','2 enduit ocre','3 militaire',
                '4 moellons enduits','5 pavillon'];

console.log('photo            | bâtiment                              | mur visé        | famille 3D actuelle');
console.log('-'.repeat(112));
const table=[];
for(const p of meta.photos){
  if(p.la===null || p.az_boussole===null){ console.log(p.fichier.padEnd(16)+' | (sans cap)'); continue; }
  const x=pX(p.lo), z=pZ(p.la);
  const h=viser(x,z,p.az_boussole,90);
  if(!h){ console.log(p.fichier.replace('.jpg','').padEnd(16)+' | rien dans l’axe à moins de 90 m'); continue; }
  const b=h.bat, fam=familleActuelle(b);
  console.log(p.fichier.replace('.jpg','').padEnd(16)+' | #'+String(b.i).padEnd(5)+
    ' aire '+String(Math.round(b.aire)).padStart(5)+' m²  '+
    String(Math.round(b.ow)).padStart(3)+'×'+String(Math.round(b.ol)).padEnd(3)+' m'+
    '  niv '+(b.lv||'?')+'  h '+(b.ht||'?')+
    ' | à '+String(Math.round(h.t)).padStart(2)+' m, '+String(h.mur.L).padStart(5)+' m'+
    ' | '+NOMS_FAM[fam]);
  table.push({photo:p.fichier, bat:b.i, cx:+b.cx.toFixed(1), cz:+b.cz.toFixed(1),
              la:+(LA0-b.cz/MLAT).toFixed(6), lo:+(LO0+b.cx/MLON).toFixed(6),
              aire:Math.round(b.aire), ow:Math.round(b.ow), ol:Math.round(b.ol),
              lv:b.lv, ht:b.ht, recul:Math.round(h.t), mur_m:h.mur.L, fam_actuelle:fam});
}
fs.writeFileSync(path.join(DOSSIER,'batiments.json'),JSON.stringify(table,null,1));
console.log('\nbatiments.json écrit — '+table.length+' bâtiments identifiés, '+
            new Set(table.map(t=>t.bat)).size+' distincts');
