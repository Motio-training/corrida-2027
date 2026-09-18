/* Panoramas équirectangulaires depuis la 3D.

   La GoPro Max rend une image 360° × 180° en projection équirectangulaire :
   la colonne donne l'azimut, la ligne l'élévation. Pour éprouver l'outil de
   relevé sans attendre le terrain, il faut les mêmes images, mais prises
   d'un monde dont on connaît déjà chaque hauteur et chaque couleur — c'est
   ce que fabrique ce script.

   Méthode : le moteur ne sait rendre que des vues perspectives. On en prend
   donc dix-huit (six azimuts × trois élévations), et on les reprojette dans
   la grille équirectangulaire. Chaque pixel de sortie choisit la tranche
   dont l'axe est le plus proche de sa direction, puis y est échantillonné
   bilinéairement : les raccords ne se voient pas, et la géométrie est
   exacte, pas approchée.

   Le piège, et c'est pour cela que le moteur a reçu clicheLibre() : la vue
   subjective pose l'oeil à 15 cm devant le coureur, dans la direction du
   regard. En tournant, le centre de projection décrirait un cercle de 30 cm
   et les toits se décaleraient de près d'un degré à dix mètres — soit 16 cm
   sur la hauteur relevée, ce que l'outil cherche justement à mesurer.

   Usage :
     node outils/rendre_equirect.js <points.json> --sortie <dossier>
          [--page /village/] [--large 2880] [--hauteur-oeil 1.9]

   points.json : [{"nom":"p001","la":46.3608,"lo":-0.1112}, …]
   Écrit <dossier>/<nom>.jpg et <dossier>/manifeste.json (la vérité GPS,
   dans le même format que celui attendu d'un lot de photos).             */

const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path'), http=require('http');
const RACINE=path.resolve(__dirname,'..');

const ARG=process.argv.slice(2);
const ENTREE=ARG.find(a=>!a.startsWith('--'));
function opt(n,d){ const i=ARG.indexOf('--'+n); return i<0?d:ARG[i+1]; }
if(!ENTREE){ console.error('usage : node outils/rendre_equirect.js <points.json> --sortie <dossier>'); process.exit(1); }
const POINTS=JSON.parse(fs.readFileSync(ENTREE,'utf8'));
const SORTIE=path.resolve(opt('sortie','releve/pano'));
const PAGE=opt('page','/village/');
const LARGE=+opt('large',2880), HAUTE=LARGE/2;
const OEIL=+opt('hauteur-oeil',1.9);      /* perche au-dessus de la tête */
const QUALITE=+opt('qualite',0.86);
const REFAIRE=ARG.includes('--refaire');

/* Tranches : six azimuts, trois élévations. Le champ horizontal est de 70°
   pour six tranches espacées de 60° — dix degrés de recouvrement, voulus.
   Au premier essai il valait 60° : les tranches se touchaient tout juste,
   et comme on écarte le dernier pour cent de chaque bord (là où l'image
   perspective est la plus étirée), il restait un trou d'un degré à chaque
   raccord. Cela donnait six barres noires verticales dans le panorama, une
   tous les 60°, visibles seulement près de l'horizon — au-dessus et en
   dessous, les tranches inclinées s'élargissent en azimut et bouchaient le
   trou. Sur une barre noire, la silhouette se lit en haut de l'image et la
   hauteur relevée part à quarante mètres.

   Fenêtre de 768 × 960 : à 70° de champ horizontal, 82,2° de champ vertical,
   soit ±41°. Avec les élévations à ±58°, les trois bandes couvrent le zénith
   et le nadir avec du recouvrement là aussi.                              */
const TRANCHE_L=768, TRANCHE_H=960, CHAMP=70;
const AZIMUTS=[0,60,120,180,240,300], ELEVATIONS=[58,0,-58];

const TYPES={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png',
  '.hdr':'application/octet-stream','.fbx':'application/octet-stream',
  '.gltf':'model/gltf+json','.bin':'application/octet-stream'};

(async()=>{
  const srv=http.createServer((rq,rs)=>{
    let u=decodeURIComponent(rq.url.split('?')[0]);
    if(u.endsWith('/')) u+='index.html';
    const f=path.join(RACINE,u);
    if(!f.startsWith(RACINE)){ rs.writeHead(403); rs.end(); return; }
    fs.readFile(f,(e,d)=>{ if(e){ rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200,{'Content-Type':TYPES[path.extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
      rs.end(d); });
  });
  await new Promise(ok=>srv.listen(0,ok));
  const base='http://localhost:'+srv.address().port;
  const nav=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader',
    '--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--js-flags=--max-old-space-size=3072']});
  const page=await (await nav.newContext({viewport:{width:TRANCHE_L,height:TRANCHE_H}})).newPage();
  const soucis=[];
  page.on('pageerror',e=>soucis.push(e.message));
  await page.goto(base+PAGE,{waitUntil:'domcontentloaded',timeout:180000});
  if(PAGE==='/' || PAGE==='/index.html'){ await page.waitForTimeout(2500); await page.click('#b-3d'); }
  let pret=false;
  for(let i=0;i<180;i++){ await page.waitForTimeout(2000);
    pret=await page.evaluate(()=>!!(window.ESPACE3D&&window.ESPACE3D.construit&&window.ESPACE3D.construit())); if(pret) break; }
  if(!pret){ console.error('le monde ne s’est pas construit : '+soucis.slice(0,3).join(' | ')); await nav.close(); srv.close(); process.exit(1); }
  if(!await page.evaluate(()=>!!(window.ESPACE3D&&window.ESPACE3D.clicheLibre))){
    console.error('ce moteur n’a pas clicheLibre() : mettre actifs/code3d.js à jour'); await nav.close(); srv.close(); process.exit(1);
  }

  fs.mkdirSync(SORTIE,{recursive:true});
  const manif={projection:'equirectangulaire', large:LARGE, haut:HAUTE, hauteurCamera:OEIL,
               source:'rendre_equirect.js', page:PAGE, photos:[]};
  for(const p of POINTS){
    const fichier=path.join(SORTIE,p.nom+'.jpg');
    if(fs.existsSync(fichier) && !REFAIRE){
      /* Image déjà rendue : on refait tout de même le déplacement et une vue
         pour relever le niveau du sol sous la caméra. Sans lui le manifeste
         est incomplet, et la comparaison à la vérité mesure la pente du
         terrain au lieu de la justesse du relevé. */
      const e=entree(p);
      if(await page.evaluate(o=>window.ESPACE3D.vueDepuis(o),{la:p.la,lo:p.lo,az:0,champ:CHAMP})){
        const r=await page.evaluate(o=>window.ESPACE3D.clicheLibre(o,0),{la:p.la,lo:p.lo,h:OEIL,az:0,el:0,champ:CHAMP});
        if(r && r.oeil) e.solCamera=+(r.oeil[1]-OEIL).toFixed(2);
      }
      manif.photos.push(e);
      console.log('  '+p.nom+' : déjà là'+(e.solCamera!==undefined?'  (sol '+e.solCamera+' m)':''));
      continue;
    }
    /* d'abord amener le monde autour du point : le décor se charge par
       morceaux autour du coureur, pas autour de la caméra */
    const ok=await page.evaluate(o=>window.ESPACE3D.vueDepuis(o),{la:p.la,lo:p.lo,az:0,champ:CHAMP});
    if(!ok){ console.log('  '+p.nom+' : vue refusée'); continue; }
    await page.waitForTimeout(+opt('pause',3200));
    const t0=Date.now();
    const img=await page.evaluate(async o=>{
      const {la,lo,h,W,H,L,Ht,champ,azimuts,elevations,qualite}=o;
      const R=Math.PI/180;
      const cv=document.querySelector('#e3-vue canvas');
      if(!cv) return {erreur:'toile du moteur introuvable'};
      /* --- les dix-huit tranches, pixels bruts, sans réencodage --- */
      const scratch=document.createElement('canvas');
      scratch.width=L; scratch.height=Ht;
      const sctx=scratch.getContext('2d',{willReadFrequently:true});
      const tranches=[];
      for(const el of elevations) for(const az of azimuts){
        const r=window.ESPACE3D.clicheLibre({la,lo,h,az,el,champ},0);   /* rend */
        sctx.drawImage(cv,0,0,L,Ht);                                     /* recopie */
        const px=sctx.getImageData(0,0,L,Ht).data;                       /* lit */
        if(!r) return {erreur:'clicheLibre a refusé'};
        const a=az*R, e=el*R;
        const f=[Math.sin(a)*Math.cos(e), Math.sin(e), -Math.cos(a)*Math.cos(e)];
        const zc=[-f[0],-f[1],-f[2]];
        /* xc = up × zc avec up = (0,1,0) */
        let xc=[zc[2],0,-zc[0]];
        const nx=Math.hypot(xc[0],xc[2])||1; xc=[xc[0]/nx,0,xc[2]/nx];
        const yc=[zc[1]*xc[2]-zc[2]*xc[1], zc[2]*xc[0]-zc[0]*xc[2], zc[0]*xc[1]-zc[1]*xc[0]];
        const tanV=Math.tan(r.fovV*R/2), tanH=tanV*r.aspect;
        tranches.push({f,xc,yc,zc,tanV,tanH,px});
        tranches.oeil=r.oeil;
      }
      /* --- la grille équirectangulaire --- */
      const out=document.createElement('canvas');
      out.width=W; out.height=H;
      const octx=out.getContext('2d');
      const dest=octx.createImageData(W,H), D=dest.data;
      for(let v=0;v<H;v++){
        const el=(90-(v+0.5)/H*180)*R, ce=Math.cos(el), se=Math.sin(el);
        for(let u=0;u<W;u++){
          const az=((u+0.5)/W*360)*R;
          const dx=Math.sin(az)*ce, dy=se, dz=-Math.cos(az)*ce;
          let best=-1, bd=-2, bu=0, bv=0;
          for(let k=0;k<tranches.length;k++){
            const t=tranches[k];
            const pr=dx*t.f[0]+dy*t.f[1]+dz*t.f[2];
            if(pr<=bd || pr<=0.05) continue;
            const Z=dx*t.zc[0]+dy*t.zc[1]+dz*t.zc[2];
            if(Z>=-1e-6) continue;
            const X=dx*t.xc[0]+dy*t.xc[1]+dz*t.xc[2];
            const Y=dx*t.yc[0]+dy*t.yc[1]+dz*t.yc[2];
            const ndx=(X/-Z)/t.tanH, ndy=(Y/-Z)/t.tanV;
            if(ndx<-0.985||ndx>0.985||ndy<-0.985||ndy>0.985) continue;
            best=k; bd=pr; bu=(ndx+1)/2*(L-1); bv=(1-ndy)/2*(Ht-1);
          }
          /* Repli : si aucune tranche ne prend ce pixel dans sa zone sûre,
             on reprend la meilleure en acceptant son bord, plutôt que de
             laisser du noir — un pixel noir se lit comme du bâti. */
          if(best<0){
            let bp=-2;
            for(let k=0;k<tranches.length;k++){
              const t=tranches[k];
              const pr=dx*t.f[0]+dy*t.f[1]+dz*t.f[2];
              if(pr<=bp || pr<=0.05) continue;
              const Z=dx*t.zc[0]+dy*t.zc[1]+dz*t.zc[2];
              if(Z>=-1e-6) continue;
              const X=dx*t.xc[0]+dy*t.xc[1]+dz*t.xc[2];
              const Y=dx*t.yc[0]+dy*t.yc[1]+dz*t.yc[2];
              let ndx=(X/-Z)/t.tanH, ndy=(Y/-Z)/t.tanV;
              if(ndx<-1||ndx>1||ndy<-1||ndy>1) continue;
              best=k; bp=pr;
              bu=(Math.max(-1,Math.min(1,ndx))+1)/2*(L-1);
              bv=(1-Math.max(-1,Math.min(1,ndy)))/2*(Ht-1);
            }
          }
          const o4=(v*W+u)*4;
          if(best<0){ D[o4]=0; D[o4+1]=0; D[o4+2]=0; D[o4+3]=255; continue; }
          const px=tranches[best].px;
          const x0=Math.floor(bu), y0=Math.floor(bv);
          const x1=Math.min(L-1,x0+1), y1=Math.min(Ht-1,y0+1);
          const fx=bu-x0, fy=bv-y0;
          const i00=(y0*L+x0)*4, i10=(y0*L+x1)*4, i01=(y1*L+x0)*4, i11=(y1*L+x1)*4;
          for(let c=0;c<3;c++){
            const a0=px[i00+c]*(1-fx)+px[i10+c]*fx;
            const a1=px[i01+c]*(1-fx)+px[i11+c]*fx;
            D[o4+c]=a0*(1-fy)+a1*fy;
          }
          D[o4+3]=255;
        }
      }
      octx.putImageData(dest,0,0);
      return {image:out.toDataURL('image/jpeg',qualite), oeil:tranches.oeil};
    },{la:p.la,lo:p.lo,h:OEIL,W:LARGE,H:HAUTE,L:TRANCHE_L,Ht:TRANCHE_H,
       champ:CHAMP,azimuts:AZIMUTS,elevations:ELEVATIONS,qualite:QUALITE});
    if(img.erreur || !img.image){ console.log('  '+p.nom+' : '+(img.erreur||'image vide')); continue; }
    fs.writeFileSync(fichier, Buffer.from(img.image.split(',')[1],'base64'));
    /* Le niveau du sol sous la caméra : une hauteur lue par l'élévation du
       faîte est comptée depuis les pieds de l'observateur, pas depuis la
       base du bâtiment. Sur un terrain en pente les deux diffèrent, et sans
       cette note la comparaison à la vérité mesurerait la pente. */
    const e=entree(p);
    if(img.oeil) e.solCamera=+(img.oeil[1]-OEIL).toFixed(2);
    manif.photos.push(e);
    console.log('  '+p.nom+'  '+(fs.statSync(fichier).size/1024).toFixed(0)+' Ko  '+((Date.now()-t0)/1000).toFixed(1)+' s');
  }
  const verite=await page.evaluate(()=>window.ESPACE3D.batisPoses?window.ESPACE3D.batisPoses():null);
  if(verite){
    fs.writeFileSync(path.join(SORTIE,'verite.json'), JSON.stringify(verite));
    console.log('  vérité : '+verite.length+' bâtiments bâtis notés dans verite.json');
  } else console.log('  ⚠ ce moteur n’expose pas batisPoses() : pas de vérité de référence');
  fs.writeFileSync(path.join(SORTIE,'manifeste.json'), JSON.stringify(manif,null,1));
  console.log('=== '+manif.photos.length+' panoramas dans '+SORTIE+' ===');
  if(soucis.length) console.log('soucis : '+[...new Set(soucis)].slice(0,4).join(' | '));
  await nav.close(); srv.close();

  function entree(p){ return {fichier:p.nom+'.jpg', la:p.la, lo:p.lo, alt:p.alt, t:p.t||null, hauteurCamera:OEIL}; }
})();
