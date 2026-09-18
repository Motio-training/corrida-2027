/* La carte du moteur, lue depuis une page, et qui voit quoi depuis un point.

   Deux outils en ont besoin — relever_360.js pour mesurer les bâtiments sur
   les photos, plan_360.js pour décider où il faut passer — et c'est du code
   qu'il ne faut surtout pas écrire deux fois : le lancer de rayon en azimut
   est la pièce dont dépendent toutes les hauteurs relevées, et une de ses
   deux copies finirait par dériver. Le projet a déjà payé deux fois le prix
   d'une fonction dupliquée sous le même nom (triOriente, panneau).

   Usage :
     const {charger}=require('./carte.js');
     const C=charger({page:'village/index.html', gw:1440, portee:70});
     C.BATS, C.VOIES, C.pX, C.pZ, C.loDeX, C.laDeZ
     C.visibilite(x,z)  →  {bat:Int16Array(gw), dist:Float32Array(gw)}
                           pour chaque colonne d'azimut, l'emprise la plus
                           proche et sa distance ; -1 s'il n'y a rien.     */

const fs=require('fs'), path=require('path');
const RACINE=path.resolve(__dirname,'..');

function charger(o){
  const PAGE=(o&&o.page)||'index.html';
  const GW=(o&&o.gw)||1440;
  const PORTEE=(o&&o.portee)||70;
  const silence=!!(o&&o.silence);
  /* ---------------------------------------------------------------- données */
  const PI=Math.PI;
  const src=fs.readFileSync(path.isAbsolute(PAGE)?PAGE:path.join(RACINE,PAGE),'utf8');
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
  if(!silence) console.log('emprises lues : '+BATS.length+'   origine '+LA0.toFixed(6)+', '+LO0.toFixed(6));

  /* une grille pour ne tester que les emprises proches */
  const CASE=40, GRILLE=new Map();
  BATS.forEach(b=>{
    for(let gx=Math.floor(b.bb[0]/CASE);gx<=Math.floor(b.bb[1]/CASE);gx++)
      for(let gz=Math.floor(b.bb[2]/CASE);gz<=Math.floor(b.bb[3]/CASE);gz++){
        const k=gx+'_'+gz; if(!GRILLE.has(k)) GRILLE.set(k,[]); GRILLE.get(k).push(b);
      }
  });
  /* Remplacer les emprises par un jeu d'essai, pour les auto-contrôles :
     ils vérifient le lancer de rayon sur un cas calculable à la main, et
     doivent pouvoir le faire sans toucher à l'indexation. */
  function remplacerBatiments(liste){
    BATS.length=0; GRILLE.clear();
    liste.forEach(b=>{
      BATS.push(b);
      for(let gx=Math.floor(b.bb[0]/CASE);gx<=Math.floor(b.bb[1]/CASE);gx++)
        for(let gz=Math.floor(b.bb[2]/CASE);gz<=Math.floor(b.bb[3]/CASE);gz++){
          const k=gx+'_'+gz; if(!GRILLE.has(k)) GRILLE.set(k,[]); GRILLE.get(k).push(b);
        }
    });
  }
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

  /* les voies, pour qui doit choisir un itinéraire */
  const VOIES=blocTexte('d-voies').split('\n').filter(l=>l.trim()).map((l,i)=>{
    const c=l.split('\t');
    if(c.length<4) return null;
    const p=pointsDe(c[3]);
    if(p.length<2) return null;
    return {i, k:c[0], larg:(+c[1])/10, sens:+c[2], p, hw:c[5]||''};
  }).filter(Boolean);

  return {BATS, VOIES, GW, PORTEE, LA0, LO0, MLAT, MLON,
          pX, pZ, loDeX, laDeZ, visibilite, proches, azDe, blocTexte,
          remplacerBatiments};
}
module.exports={charger};
