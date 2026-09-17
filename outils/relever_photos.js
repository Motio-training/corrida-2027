/* Relevé des couleurs réelles, depuis les photos du terrain.

   Chaque photo est classée pixel par pixel — ciel, végétation, sol, façade —
   puis les pixels de façade sont regroupés par couleur. On en sort la palette
   qu'il faut donner à la 3D, au lieu de celle que j'ai inventée.

   Le classement est géométrique et colorimétrique, pas savant. Le piège, et
   j'y suis tombé au premier essai : en prenant « tout ce qui n'est ni ciel ni
   verdure », on ramasse le bitume et les ombres, et la palette sort grise
   alors que la ville est beige. On ne retient donc comme mur que le haut de
   l'image, hors ciel et verdure, dans une plage de clarté qui exclut les
   ombres et les vitres, et peu saturé — l'enduit et la pierre le sont peu,
   contrairement aux enseignes et aux voitures.

   Deuxième piège : un ciel couvert n'est ni bleu ni éclatant, il passe donc
   les tests de couleur et se fait compter comme enduit clair — la palette
   sort alors gris-bleu. Ce qui le trahit, c'est qu'il est lisse : on écarte
   les zones claires sans contraste local, là où un mur en a toujours un peu.

   Usage : node outils/relever_photos.js <dossier des photos>
   Écrit <dossier>/couleurs.json et affiche le relevé.                     */

const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path'), http=require('http');

const DOSSIER=process.argv[2];
if(!DOSSIER){ console.error('usage : node outils/relever_photos.js <dossier>'); process.exit(1); }

const MANIF=path.join(DOSSIER,'manifeste.json');
const meta=fs.existsSync(MANIF)?JSON.parse(fs.readFileSync(MANIF,'utf8')):{photos:[]};
const parNom={};
meta.photos.forEach(p=>{ parNom[p.fichier]=p; });

(async()=>{
  const noms=fs.readdirSync(DOSSIER).filter(f=>f.endsWith('.jpg')).sort();
  const srv=http.createServer((rq,rs)=>{
    const u=decodeURIComponent(rq.url.split('?')[0]);
    if(u==='/'){ rs.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); rs.end('<!doctype html><meta charset=utf-8>'); return; }
    fs.readFile(path.join(DOSSIER,u.slice(1)),(e,d)=>{
      if(e){ rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200,{'Content-Type':'image/jpeg'}); rs.end(d);
    });
  });
  await new Promise(ok=>srv.listen(0,ok));
  const port=srv.address().port;

  const nav=await chromium.launch();
  const page=await (await nav.newContext()).newPage();
  await page.goto('http://localhost:'+port+'/');

  const releve=await page.evaluate(async(noms)=>{
    function rgbVersHsl(r,g,b){
      r/=255; g/=255; b/=255;
      const max=Math.max(r,g,b), min=Math.min(r,g,b), l=(max+min)/2;
      let h=0, s=0;
      if(max!==min){
        const d=max-min;
        s=l>0.5?d/(2-max-min):d/(max+min);
        if(max===r) h=((g-b)/d+(g<b?6:0))/6;
        else if(max===g) h=((b-r)/d+2)/6;
        else h=((r-g)/d+4)/6;
      }
      return [h*360, s, l];
    }
    const sortie=[];
    for(const nom of noms){
      const im=await new Promise(res=>{ const o=new Image(); o.onload=()=>res(o); o.onerror=()=>res(null); o.src='/'+nom; });
      if(!im){ sortie.push({nom, erreur:'illisible'}); continue; }
      /* on travaille sur une réduction : 320 px de large suffisent */
      const L=320, H=Math.round(im.naturalHeight*L/im.naturalWidth);
      const c=document.createElement('canvas'); c.width=L; c.height=H;
      const g=c.getContext('2d'); g.drawImage(im,0,0,L,H);
      const d=g.getImageData(0,0,L,H).data;

      /* clarté et contraste local, calculés une fois pour toute l'image */
      const lum=new Float32Array(L*H);
      for(let i=0,j=0;i<d.length;i+=4,j++) lum[j]=(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])/255;
      const contraste=new Float32Array(L*H);
      for(let y=1;y<H-1;y++) for(let x=1;x<L-1;x++){
        let mn=1, mx=0;
        for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
          const v=lum[(y+dy)*L+(x+dx)];
          if(v<mn) mn=v; if(v>mx) mx=v;
        }
        contraste[y*L+x]=mx-mn;
      }
      const classes={ciel:0, vegetation:0, sol:0, facade:0, toit:0, ombre:0, couleur:0};
      /* regroupement grossier : cases de 16 niveaux par canal */
      const seaux=new Map(), seauxToit=new Map(), pxMur=[];
      for(let y=0;y<H;y++){
        for(let x=0;x<L;x++){
          const i=(y*L+x)*4, r=d[i], v=d[i+1], b=d[i+2];
          const [h,s,l]=rgbVersHsl(r,v,b);
          const haut=y/H;
          let cl;
          const ct=contraste[y*L+x];
          if(h>175 && h<255 && s>0.12 && l>0.45 && haut<0.62) cl='ciel';
          /* lisse et clair, dans le haut de l'image : c'est le ciel, même
             couvert — un mur n'est jamais aussi uni */
          else if(haut<0.62 && l>0.52 && ct<0.055) cl='ciel';
          else if(h>62 && h<170 && s>0.14) cl='vegetation';
          else if(haut>0.55) cl='sol';                              /* bitume, pavés, trottoir */
          else if(h>=8 && h<=42 && s>0.26 && l>0.20 && l<0.58) cl='toit';
          else if(l<0.22) cl='ombre';                               /* ombres, vitres, portes */
          else if(s>0.34) cl='couleur';                             /* enseignes, véhicules */
          else cl='facade';
          classes[cl]++;
          if(cl==='facade') pxMur.push([r,v,b,l]);
          if(cl==='facade'||cl==='toit'){
            const k=((r>>4)<<8)|((v>>4)<<4)|(b>>4);
            const m=(cl==='toit')?seauxToit:seaux;
            const e=m.get(k)||[0,0,0,0];
            e[0]+=r; e[1]+=v; e[2]+=b; e[3]++;
            m.set(k,e);
          }
        }
      }
      function dominantes(m,n){
        return [...m.values()].sort((a,b)=>b[3]-a[3]).slice(0,n).map(e=>({
          rvb:[Math.round(e[0]/e[3]),Math.round(e[1]/e[3]),Math.round(e[2]/e[3])],
          part:e[3]
        }));
      }
      /* La 3D éclaire elle-même les façades : ce qu'il lui faut, c'est la
         couleur propre du matériau, pas son apparence du jour. Une façade à
         contre-jour sort bien plus sombre que son enduit. On prend donc la
         teinte des pixels de mur les plus clairs (75e centile de clarté),
         qui approche la couleur au soleil, et on garde celle du 25e centile
         pour mémoire. */
      function centile(px,q){
        if(!px.length) return null;
        const t=px.slice().sort((a,b)=>a[3]-b[3]);
        const i0=Math.max(0,Math.floor(t.length*(q-0.10))), i1=Math.min(t.length,Math.ceil(t.length*(q+0.10)));
        let r=0,v=0,b=0,n=0;
        for(let i=i0;i<i1;i++){ r+=t[i][0]; v+=t[i][1]; b+=t[i][2]; n++; }
        return n?[Math.round(r/n),Math.round(v/n),Math.round(b/n)]:null;
      }
      const total=L*H;
      sortie.push({
        nom, taille:[im.naturalWidth,im.naturalHeight],
        parts:Object.fromEntries(Object.entries(classes).map(([k,v])=>[k,+(v/total*100).toFixed(1)])),
        eclaire:centile(pxMur,0.78), ombre:centile(pxMur,0.25),
        facade:dominantes(seaux,5).map(o=>({rvb:o.rvb, part:+(o.part/Math.max(1,classes.facade)*100).toFixed(1)})),
        toit:dominantes(seauxToit,3).map(o=>({rvb:o.rvb, part:+(o.part/Math.max(1,classes.toit)*100).toFixed(1)}))
      });
    }
    return sortie;
  },noms);

  await nav.close(); srv.close();

  const hex=v=>'#'+v.map(n=>n.toString(16).padStart(2,'0')).join('');
  console.log('=== couleurs relevées sur les photos ===\n');
  console.log('photo            | mur% | au soleil          | à l’ombre          | toiture');
  console.log('-'.repeat(88));
  for(const r of releve){
    if(r.erreur){ console.log(r.nom+' : '+r.erreur); continue; }
    const p=r.parts;
    const toi=r.toit.length&&p.toit>0.6?r.toit.slice(0,2).map(o=>hex(o.rvb)).join(' '):'—';
    const mo=v=>v?(hex(v)+' rvb('+v.join(',')+')').padEnd(18):'—'.padEnd(18);
    console.log(r.nom.replace('.jpg','').padEnd(16)+' | '+String(p.facade).padStart(4)+' | '+
                mo(r.eclaire)+' | '+mo(r.ombre)+' | '+toi);
  }

  /* La palette : une voix par photo, et non une voix par pixel — sinon les
     images les plus sombres ou les plus larges décident pour les autres.
     On regroupe les teintes éclairées proches. */
  const voix=releve.filter(r=>r.eclaire).map(r=>({nom:r.nom, c:r.eclaire}));
  const groupes=[];
  for(const v of voix){
    let g=groupes.find(g=>Math.hypot(g.c[0]-v.c[0],g.c[1]-v.c[1],g.c[2]-v.c[2])<26);
    if(!g){ g={c:v.c.slice(), n:0, somme:[0,0,0], photos:[]}; groupes.push(g); }
    g.somme[0]+=v.c[0]; g.somme[1]+=v.c[1]; g.somme[2]+=v.c[2]; g.n++;
    g.photos.push(v.nom.replace('.jpg',''));
    g.c=[Math.round(g.somme[0]/g.n),Math.round(g.somme[1]/g.n),Math.round(g.somme[2]/g.n)];
  }
  groupes.sort((a,b)=>b.n-a.n);
  const palette=groupes.map(g=>({rvb:g.c, photos:g.photos}));
  console.log('\n=== palette de façades relevée à Saint-Maixent ===');
  palette.forEach((c,i)=>console.log('  '+(i+1)+'. '+hex(c.rvb)+'  rvb('+c.rvb.join(', ').padEnd(13)+
              ')  '+c.photos.length+' photo(s) : '+c.photos.join(', ')));

  fs.writeFileSync(path.join(DOSSIER,'couleurs.json'),JSON.stringify({releve,palette},null,1));
  console.log('\ncouleurs.json écrit');
})();
