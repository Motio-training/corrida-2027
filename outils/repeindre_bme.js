/* Les tenues des deux militaires en bariolage multi-environnement (BME) de
   l'armée française, avec un petit drapeau tricolore à l'épaule.

   Les avatars Rocketbox (Microsoft, licence MIT) sont livrés en camouflage
   américain ACU, drapeau des États-Unis sur la manche. Le script repart des
   textures d'origine (TGA 2048, téléchargées depuis le dépôt Rocketbox et
   gardées en cache), et pour chaque texture de tenue :
     - repère le tissu camouflé : les gris-verts ACU, peu saturés, ni trop
       sombres (sangles, boucles) ; la peau, les bottes, les insignes restent ;
     - en tire l'ombrage du tissu — la clarté moyenne alentour, qui garde
       les plis mais efface le motif ACU — et y pose le motif BME
       (outils/bme_motif.jpg, la photo du motif fournie par Nicolas) ;
     - sur la tenue, repère le drapeau américain par ses couleurs, mesure
       son inclinaison, et peint à sa place un tricolore à liseré kaki, le
       bleu côté hampe (là où étaient les étoiles).
   Écrit les textures WebP 1024 dans actifs/bin/ (*_bme.webp).

   Usage : node outils/repeindre_bme.js [échelle] [clarté]
           échelle : pixels du motif par texel (3,6 par défaut ; plus = motif plus fin)
           clarté  : 1 par défaut                                                     */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path'), https=require('https');
const RACINE=path.resolve(__dirname,'..'), CACHE=process.env.CACHE_ROCKETBOX||'/tmp/rocketbox';
const K=+(process.argv[2]||3.6), CLARTE=+(process.argv[3]||1);
const DEPOT='https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Avatars/Professions/';
/* [avatar, texture d'origine, texture écrite, décalage dans le motif, drapeau ?] */
const TEXTURES=[
  ['Military_Male_02','sm024_body_color_acu','sm024_body_color_bme',[0,0],true],
  ['Military_Male_02','sm024_head_color_acu','sm024_head_color_bme',[450,250],false],
  ['Military_Male_01','sm002_body_color_acu','sm002_body_color_bme',[150,100],true],
  ['Military_Male_01','sm002_equipment_color_acu','sm002_equipment_color_bme',[750,450],false],
  ['Military_Male_01','sm002_helmet_color_acu','sm002_helmet_color_bme',[1100,150],false]];

function telecharger(url,dest){
  return new Promise((ok,ko)=>{
    https.get(url,r=>{
      if(r.statusCode!==200){ ko(new Error(url+' : '+r.statusCode)); r.resume(); return; }
      const f=fs.createWriteStream(dest); r.pipe(f); f.on('finish',()=>f.close(ok));
    }).on('error',ko);
  });
}
/* TGA 24/32 bits, brut ou RLE -> {w,h,rgba} (origine en haut à gauche) */
function lireTGA(f){
  const b=fs.readFileSync(f), idl=b[0], type=b[2], w=b.readUInt16LE(12), h=b.readUInt16LE(14), bpp=b[16]>>3, desc=b[17];
  let p=18+idl; const n=w*h, px=Buffer.alloc(n*4);
  let i=0;
  const lire=(o)=>{ px[o]=b[p+2]; px[o+1]=b[p+1]; px[o+2]=b[p]; px[o+3]=bpp===4?b[p+3]:255; p+=bpp; };
  if(type===2){ for(i=0;i<n;i++) lire(i*4); }
  else if(type===10){
    while(i<n){ const c=b[p++], k=(c&127)+1;
      if(c&128){ const s=p; for(let j=0;j<k;j++){ p=s; lire((i++)*4); } }
      else for(let j=0;j<k;j++) lire((i++)*4); }
  } else throw new Error('type TGA '+type);
  if(!(desc&32)){ const r=Buffer.alloc(n*4); for(let y=0;y<h;y++) px.copy(r,(h-1-y)*w*4,y*w*4,(y+1)*w*4); return {w,h,rgba:r}; }
  return {w,h,rgba:px};
}
/* réduit de moitié (moyenne 2x2) */
function moitie(I){
  const w=I.w>>1, h=I.h>>1, r=Buffer.alloc(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) for(let c=0;c<4;c++){
    const a=((2*y)*I.w+2*x)*4+c, b2=a+4, d=a+I.w*4, e=d+4;
    r[(y*w+x)*4+c]=(I.rgba[a]+I.rgba[b2]+I.rgba[d]+I.rgba[e]+2)>>2; }
  return {w,h,rgba:r};
}
(async()=>{
  fs.mkdirSync(CACHE,{recursive:true});
  const nav=await chromium.launch(), page=await nav.newPage();
  /* le navigateur sert à décoder et encoder les images */
  const lire=async f=>{ const r=await page.evaluate(async d=>{ const i=new Image(); i.src=d; await i.decode(); const c=document.createElement('canvas'); c.width=i.width; c.height=i.height; const g=c.getContext('2d'); g.drawImage(i,0,0); const a=g.getImageData(0,0,c.width,c.height).data; let s=''; for(let k=0;k<a.length;k+=32768) s+=String.fromCharCode.apply(null,a.subarray(k,k+32768)); return [c.width,c.height,btoa(s)]; },
      'data:image/jpeg;base64,'+fs.readFileSync(f).toString('base64')); return {w:r[0],h:r[1],rgba:Buffer.from(r[2],'base64')}; };
  const ecrire=async(I,f)=>{ const d=await page.evaluate(({w,h,b64})=>{ const bin=atob(b64), a=new Uint8ClampedArray(bin.length); for(let i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i);
      const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').putImageData(new ImageData(a,w,h),0,0); return c.toDataURL('image/webp',0.82); },{w:I.w,h:I.h,b64:I.rgba.toString('base64')});
    const b=Buffer.from(d.split(',')[1],'base64'); fs.writeFileSync(f,b); return b.length; };
  const M=await lire(path.join(__dirname,'bme_motif.jpg'));
  /* le motif, lu en miroir pour couvrir la texture sans couture franche */
  const motif=(x,y)=>{ const W=M.w, H=M.h; x=Math.abs(x)%(2*W); y=Math.abs(y)%(2*H); if(x>=W) x=2*W-1-x; if(y>=H) y=2*H-1-y;
    const i=((y|0)*W+(x|0))*4; return [M.rgba[i],M.rgba[i+1],M.rgba[i+2]]; };
  function flou(A,w,h,r){
    let a=A; const t=new Float32Array(w*h);
    for(let pass=0;pass<2;pass++){
      for(let y=0;y<h;y++){ let s=0; for(let x=-r;x<=r;x++) s+=a[y*w+Math.min(w-1,Math.max(0,x))];
        for(let x=0;x<w;x++){ t[y*w+x]=s/(2*r+1); s+=a[y*w+Math.min(w-1,x+r+1)]-a[y*w+Math.max(0,x-r)]; } }
      const u=new Float32Array(w*h);
      for(let x=0;x<w;x++){ let s=0; for(let y=-r;y<=r;y++) s+=t[Math.min(h-1,Math.max(0,y))*w+x];
        for(let y=0;y<h;y++){ u[y*w+x]=s/(2*r+1); s+=t[Math.min(h-1,y+r+1)*w+x]-t[Math.max(0,y-r)*w+x]; } }
      a=u;
    }
    return a;
  }
  function repeindre(I,decal){
    const w=I.w, h=I.h, n=w*h, masque=new Float32Array(n), L=new Float32Array(n);
    for(let i=0;i<n;i++){
      const r=I.rgba[i*4], g=I.rgba[i*4+1], b=I.rgba[i*4+2], mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(r+g+b)/3;
      const camo=l>34 && mx>0 && (mx-mn)/mx<0.24 && r-g<10;
      masque[i]=camo?1:0; L[i]=camo?l:0;
    }
    const Lf=flou(L,w,h,9), Mf=flou(masque,w,h,9);
    let somme=0, nb=0; for(let i=0;i<n;i++) if(masque[i]){ somme+=L[i]; nb++; }
    const moy=somme/nb;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const i=y*w+x; if(!masque[i]) continue;
      const lo=Mf[i]>0.05 ? Lf[i]/Mf[i] : L[i];
      /* beaucoup de l'ombrage du tissu, un peu de son grain */
      const s=Math.max(0.5,Math.min(1.4,Math.pow(lo/moy,0.85)*Math.pow(L[i]/Math.max(1,lo),0.18)))*CLARTE;
      const c=motif(x*K+decal[0],y*K+decal[1]);
      for(let k=0;k<3;k++) I.rgba[i*4+k]=Math.max(0,Math.min(255,c[k]*s));
    }
  }
  /* le drapeau est repéré sur la texture d'origine : après le repeint, des
     taches bordeaux du BME passeraient pour son rouge */
  function reperer(I){
    const w=I.w, pts=[];
    for(let y=500;y<640;y++) for(let x=100;x<260;x++){
      const i=(y*w+x)*4, r=I.rgba[i], g=I.rgba[i+1], b=I.rgba[i+2];
      const rouge=r>130&&g<100&&b<100, bleu=b>80&&b>r+30&&b>g+15, orange=r>160&&g>90&&b<90&&r-g>35;
      if(rouge||bleu||orange) pts.push([x,y]);
    }
    if(pts.length<200) return null;
    let cx=0, cy=0; pts.forEach(p=>{ cx+=p[0]; cy+=p[1]; }); cx/=pts.length; cy/=pts.length;
    let sxx=0, syy=0, sxy=0; pts.forEach(p=>{ const dx=p[0]-cx, dy=p[1]-cy; sxx+=dx*dx; syy+=dy*dy; sxy+=dx*dy; });
    const a=0.5*Math.atan2(2*sxy,sxx-syy), ux=Math.cos(a), uy=Math.sin(a), vx=-uy, vy=ux;
    const pu=pts.map(p=>(p[0]-cx)*ux+(p[1]-cy)*uy).sort((x,y)=>x-y), pv=pts.map(p=>(p[0]-cx)*vx+(p[1]-cy)*vy).sort((x,y)=>x-y);
    const u0=pu[Math.floor(pu.length*0.005)], u1=pu[Math.floor(pu.length*0.995)], v0=pv[Math.floor(pv.length*0.005)], v1=pv[Math.floor(pv.length*0.995)];
    /* le bleu côté hampe : là où étaient les étoiles */
    let bu=0, nbu=0; pts.forEach(p=>{ const i=(p[1]*w+p[0])*4, r=I.rgba[i], g=I.rgba[i+1], b=I.rgba[i+2]; if(b>80&&b>r+30&&b>g+15){ bu+=(p[0]-cx)*ux+(p[1]-cy)*uy; nbu++; } });
    return {cx, cy, ux, uy, vx, vy, u0, u1, v0, v1, a, hampe:bu/nbu>0?1:-1};
  }
  function drapeau(I,D){
    if(!D) return 'drapeau introuvable';
    const w=I.w, {cx, cy, ux, uy, vx, vy, u0, u1, v0, v1, a, hampe}=D, bord=1.6;
    for(let y=Math.floor(cy-40);y<cy+40;y++) for(let x=Math.floor(cx-70);x<cx+70;x++){
      const u=(x+0.5-cx)*ux+(y+0.5-cy)*uy, v=(x+0.5-cx)*vx+(y+0.5-cy)*vy;
      if(u<u0||u>u1||v<v0||v>v1) continue;
      const i=(y*w+x)*4;
      let c;
      if(u<u0+bord||u>u1-bord||v<v0+bord||v>v1-bord) c=[64,62,44];
      else { const t=(u-u0)/(u1-u0), q=hampe>0?1-t:t; c=q<1/3?[0,45,130]:(q<2/3?[236,236,232]:[200,24,38]); }
      for(let k=0;k<3;k++) I.rgba[i+k]=c[k];
    }
    return 'drapeau '+Math.round(u1-u0)+'×'+Math.round(v1-v0)+' px, incliné de '+(a*180/Math.PI).toFixed(1)+'°';
  }
  for(const [av,src,dst,dec,dr] of TEXTURES){
    const tga=path.join(CACHE,src+'.tga');
    if(!fs.existsSync(tga)){ console.log('  téléchargement de '+src+'.tga'); await telecharger(DEPOT+av+'/Textures/'+src+'.tga',tga); }
    const I=moitie(lireTGA(tga));
    const D=dr?reperer(I):null;
    repeindre(I,dec);
    const msg=dr?drapeau(I,D):'';
    const n=await ecrire(I,path.join(RACINE,'actifs/bin',dst+'.webp'));
    console.log(dst+'.webp  '+I.w+'×'+I.h+'  '+Math.round(n/1024)+' Ko  '+msg);
  }
  await nav.close();
  console.log('À reporter dans index.html (et village/index.html) : la taille de chaque fichier dans CHARGEMENT_3D.');
})();
