(function(){
if(!window.THREE){ window.ESPACE3D={indisponible:true}; return; }
/* =================================================================
   Corrida 2027 - ENSOA : exploration 3D du parcours
   Données : OpenStreetMap (ODbL) + relief EU-DEM 25 m.
   Repère local en mètres : x vers l'est, z vers le sud, y vers le haut.
================================================================= */
var PI=Math.PI;
/* Origine du repère local et emprise de la grille de relief. Saint-Maixent
   par défaut ; une autre carte (le bourg de La Mothe-Saint-Héray, pour
   éprouver le relevé 360) pose window.CARTE_ORIGINE avant de charger ce
   fichier, et outils/carte_depuis_osm.js écrit ce bloc pour elle. */
var ORIG=(typeof window!=='undefined' && window.CARTE_ORIGINE) || {};
var LA0=(ORIG.la!==undefined)?ORIG.la:46.4136975, LO0=(ORIG.lo!==undefined)?ORIG.lo:-0.2096655;
var _f=LA0*PI/180;
var MLAT=111132.92-559.82*Math.cos(2*_f)+1.175*Math.cos(4*_f)-0.0023*Math.cos(6*_f);
var MLON=111412.84*Math.cos(_f)-93.5*Math.cos(3*_f)+0.118*Math.cos(5*_f);
function pX(lo){ return (lo-LO0)*MLON; }
function pZ(la){ return (LA0-la)*MLAT; }

/* grille de relief */
var GLA0=(ORIG.gla0!==undefined)?ORIG.gla0:46.40464, GLA1=(ORIG.gla1!==undefined)?ORIG.gla1:46.42275;
var GLO0=(ORIG.glo0!==undefined)?ORIG.glo0:-0.22524, GLO1=(ORIG.glo1!==undefined)?ORIG.glo1:-0.19409;
var GROWS=33, GCOLS=41;
var XMIN=pX(GLO0), XMAX=pX(GLO1), ZMAX=pZ(GLA0), ZMIN=pZ(GLA1);
var PASX=(XMAX-XMIN)/(GCOLS-1), PASZ=(ZMAX-ZMIN)/(GROWS-1);
var ELE=null;

function texteBrut_ancien(id){
  var e=document.getElementById(id);
  if(!e) return '';
  var s=e.textContent;
  e.textContent='';
  return s.replace(/^\s+|\s+$/g,'');
}
function lignes(s){ return s ? s.split('\n') : []; }
function pointsDe(s){
  var t=s.split(' '), r=new Array(t.length*2);
  for(var i=0;i<t.length;i++){
    var c=t[i].split(',');
    r[i*2]=(+c[0])/10; r[i*2+1]=(+c[1])/10;
  }
  return r;
}

/* ---------- relief : interpolation Catmull-Rom ---------- */
function gele(i,j){
  if(i<0)i=0; else if(i>GROWS-1)i=GROWS-1;
  if(j<0)j=0; else if(j>GCOLS-1)j=GCOLS-1;
  return ELE[i*GCOLS+j];
}
function cr1(p0,p1,p2,p3,t){
  return 0.5*((2*p1)+(p2-p0)*t+(2*p0-5*p1+4*p2-p3)*t*t+(3*p1-p0-3*p2+p3)*t*t*t);
}
var _c4=[0,0,0,0];
function hauteur(x,z){
  var fj=(x-XMIN)/PASX, fi=(ZMAX-z)/PASZ;
  var j=Math.floor(fj), i=Math.floor(fi);
  var tj=fj-j, ti=fi-i;
  for(var d=-1;d<=2;d++){
    _c4[d+1]=cr1(gele(i+d,j-1),gele(i+d,j),gele(i+d,j+1),gele(i+d,j+2),tj);
  }
  return cr1(_c4[0],_c4[1],_c4[2],_c4[3],ti);
}
function pente(x,z){
  var d=3;
  var hx=(hauteur(x+d,z)-hauteur(x-d,z))/(2*d);
  var hz=(hauteur(x,z+d)-hauteur(x,z-d))/(2*d);
  return Math.sqrt(hx*hx+hz*hz);
}

/* ---------- hasard déterministe et bruit lissé ---------- */
function alea(a,b){
  var s=(a*374761393+b*668265263)|0;
  s=(s^(s>>13))*1274126177;
  s=s^(s>>16);
  return ((s>>>0)%100000)/100000;
}
function bruit(x,z,e){
  var xi=Math.floor(x/e), zi=Math.floor(z/e);
  var tx=x/e-xi, tz=z/e-zi;
  tx=tx*tx*(3-2*tx); tz=tz*tz*(3-2*tz);
  var a=alea(xi,zi), b=alea(xi+1,zi), c=alea(xi,zi+1), d=alea(xi+1,zi+1);
  return (a+(b-a)*tx)*(1-tz)+(c+(d-c)*tx)*tz;
}

/* =================================================================
   Accumulateur de géométrie sur tableaux typés
================================================================= */
function Tas(cap){
  this.n=0;
  this.cap=cap||16384;
  this.p=new Float32Array(this.cap*3);
  this.nr=new Float32Array(this.cap*3);
  this.u=new Float32Array(this.cap*2);
  this.c=new Float32Array(this.cap*3);
}
Tas.prototype.grandir=function(){
  var nc=this.cap*2;
  var p=new Float32Array(nc*3), nr=new Float32Array(nc*3);
  var u=new Float32Array(nc*2), c=new Float32Array(nc*3);
  p.set(this.p); nr.set(this.nr); u.set(this.u); c.set(this.c);
  this.p=p; this.nr=nr; this.u=u; this.c=c; this.cap=nc;
};
Tas.prototype.tri=function(ax,ay,az,bx,by,bz,cx,cy,cz,nx,ny,nz,uv,col){
  if(this.n+3>this.cap) this.grandir();
  var i3=this.n*3, i2=this.n*2, p=this.p, nr=this.nr, u=this.u, c=this.c;
  p[i3]=ax; p[i3+1]=ay; p[i3+2]=az;
  p[i3+3]=bx; p[i3+4]=by; p[i3+5]=bz;
  p[i3+6]=cx; p[i3+7]=cy; p[i3+8]=cz;
  for(var k=0;k<3;k++){
    nr[i3+k*3]=nx; nr[i3+k*3+1]=ny; nr[i3+k*3+2]=nz;
    c[i3+k*3]=col[0]; c[i3+k*3+1]=col[1]; c[i3+k*3+2]=col[2];
  }
  u[i2]=uv[0]; u[i2+1]=uv[1]; u[i2+2]=uv[2]; u[i2+3]=uv[3]; u[i2+4]=uv[4]; u[i2+5]=uv[5];
  this.n+=3;
};
/* même chose mais avec une normale par sommet, pour les surfaces lissées */
Tas.prototype.triN=function(A,B,C,NA,NB,NC,uv,col){
  if(this.n+3>this.cap) this.grandir();
  var i3=this.n*3, i2=this.n*2, p=this.p, nr=this.nr, u=this.u, c=this.c;
  var S=[A,B,C], N=[NA,NB,NC];
  for(var k=0;k<3;k++){
    p[i3+k*3]=S[k][0]; p[i3+k*3+1]=S[k][1]; p[i3+k*3+2]=S[k][2];
    nr[i3+k*3]=N[k][0]; nr[i3+k*3+1]=N[k][1]; nr[i3+k*3+2]=N[k][2];
    c[i3+k*3]=col[0]; c[i3+k*3+1]=col[1]; c[i3+k*3+2]=col[2];
  }
  u[i2]=uv[0]; u[i2+1]=uv[1]; u[i2+2]=uv[2]; u[i2+3]=uv[3]; u[i2+4]=uv[4]; u[i2+5]=uv[5];
  this.n+=3;
};
Tas.prototype.geo=function(){
  var g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(this.p.subarray(0,this.n*3)),3));
  g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(this.nr.subarray(0,this.n*3)),3));
  g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(this.u.subarray(0,this.n*2)),2));
  g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(this.c.subarray(0,this.n*3)),3));
  g.computeBoundingSphere();
  this.p=this.nr=this.u=this.c=null;
  return g;
};
Tas.prototype.vide=function(){ return this.n===0; };

/* ---------- couleurs ---------- */
function teinte(hex){
  var c=new THREE.Color(hex);
  return [c.r,c.g,c.b];
}
function melange(c1,c2,t){
  return [c1[0]+(c2[0]-c1[0])*t, c1[1]+(c2[1]-c1[1])*t, c1[2]+(c2[2]-c1[2])*t];
}
function assombrir(c,f){ return [c[0]*f,c[1]*f,c[2]*f]; }
function nrm(a,b,c){
  var ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2];
  var vx=c[0]-a[0], vy=c[1]-a[1], vz=c[2]-a[2];
  var nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
  var L=Math.hypot(nx,ny,nz)||1;
  return [nx/L,ny/L,nz/L];
}

/* =================================================================
   Primitives : tube, boule, quadrilatère vertical
================================================================= */
/* tube de A vers B, rayons r0 et r1, normales lissées */
function tube(tas,ax,ay,az,bx,by,bz,r0,r1,seg,col,capA,capB){
  var dx=bx-ax, dy=by-ay, dz=bz-az;
  var L=Math.hypot(dx,dy,dz);
  if(L<1e-5) return;
  var ux=dx/L, uy=dy/L, uz=dz/L;
  var px,py,pz;
  if(Math.abs(uy)<0.9){ px=-uz; py=0; pz=ux; }
  else { px=1; py=0; pz=0; }
  var pl=Math.hypot(px,py,pz); px/=pl; py/=pl; pz/=pl;
  var qx=uy*pz-uz*py, qy=uz*px-ux*pz, qz=ux*py-uy*px;
  var i, ca=[], cb=[], nn=[];
  for(i=0;i<=seg;i++){
    var a=i/seg*2*PI, co=Math.cos(a), si=Math.sin(a);
    var nx=px*co+qx*si, ny=py*co+qy*si, nz=pz*co+qz*si;
    nn.push([nx,ny,nz]);
    ca.push([ax+nx*r0, ay+ny*r0, az+nz*r0]);
    cb.push([bx+nx*r1, by+ny*r1, bz+nz*r1]);
  }
  for(i=0;i<seg;i++){
    tas.triN(ca[i],cb[i],cb[i+1], nn[i],nn[i],nn[i+1], [i/seg,0,i/seg,1,(i+1)/seg,1], col);
    tas.triN(ca[i],cb[i+1],ca[i+1], nn[i],nn[i+1],nn[i+1], [i/seg,0,(i+1)/seg,1,(i+1)/seg,0], col);
  }
  if(capA) for(i=0;i<seg;i++)
    tas.tri(ax,ay,az, ca[i+1][0],ca[i+1][1],ca[i+1][2], ca[i][0],ca[i][1],ca[i][2], -ux,-uy,-uz, [0.5,0.5,1,0,0,0], col);
  if(capB) for(i=0;i<seg;i++)
    tas.tri(bx,by,bz, cb[i][0],cb[i][1],cb[i][2], cb[i+1][0],cb[i+1][1],cb[i+1][2], ux,uy,uz, [0.5,0.5,0,0,1,0], col);
}
/* boule, éventuellement aplatie sur y */
function boule(tas,cx,cy,cz,r,ky,seg,col){
  var an=Math.max(3,Math.round(seg/2));
  function P(i,j){
    var th=j/an*PI, ph=i/seg*2*PI;
    var nx=Math.sin(th)*Math.cos(ph), ny=Math.cos(th), nz=Math.sin(th)*Math.sin(ph);
    return {p:[cx+nx*r, cy+ny*r*ky, cz+nz*r], n:[nx,ny/ky,nz]};
  }
  for(var j=0;j<an;j++) for(var i=0;i<seg;i++){
    var a=P(i,j), b=P(i+1,j), c=P(i+1,j+1), d=P(i,j+1);
    tas.triN(a.p,c.p,b.p, a.n,c.n,b.n, [0,0,1,1,1,0], col);
    tas.triN(a.p,d.p,c.p, a.n,d.n,c.n, [0,0,0,1,1,1], col);
  }
}
/* boîte verticale sur un quadrilatère au sol (ordre à aire positive) */
function boiteQuad(tas,a,b,c,d,y0,y1,cm,ct,ech){
  /* Le sens de parcours du contour décide seul de l'orientation des faces,
     et rien ne le vérifiait : une boîte décrite dans l'autre sens sortait
     retournée, donc effacée par le moteur. C'est ce qui creusait la moitié
     de la Porte Chalon, dont le repère local est gaucher — « u croissant
     puis v croissant » y donne un contour rétrograde. On remet donc le
     contour dans le sens direct, à l'aire signée. */
  var sg=(a[0]*b[1]-b[0]*a[1])+(b[0]*c[1]-c[0]*b[1])+(c[0]*d[1]-d[0]*c[1])+(d[0]*a[1]-a[0]*d[1]);
  if(sg<0){ var tmp=b; b=d; d=tmp; }
  var pts=[a,b,c,d], i;
  for(i=0;i<4;i++){
    var p0=pts[i], p1=pts[(i+1)%4];
    var dx=p1[0]-p0[0], dz=p1[1]-p0[1], L=Math.hypot(dx,dz)||1;
    var nx=dz/L, nz=-dx/L;
    var u1=L/(ech||4), v1=(y1-y0)/3.2;
    tas.tri(p0[0],y0,p0[1], p1[0],y1,p1[1], p1[0],y0,p1[1], nx,0,nz, [0,0,u1,v1,u1,0], cm);
    tas.tri(p0[0],y0,p0[1], p0[0],y1,p0[1], p1[0],y1,p1[1], nx,0,nz, [0,0,0,v1,u1,v1], cm);
  }
  tas.tri(a[0],y1,a[1], c[0],y1,c[1], b[0],y1,b[1], 0,1,0, [0,0,1,1,1,0], ct);
  tas.tri(a[0],y1,a[1], d[0],y1,d[1], c[0],y1,c[1], 0,1,0, [0,0,0,1,1,1], ct);
}

/* =================================================================
   Rubans et polygones posés sur le relief
================================================================= */
function decaler(pts,off){
  var n=pts.length/2, r=[], i;
  for(i=0;i<n;i++){
    var ax,az;
    if(i===0){ ax=pts[2]-pts[0]; az=pts[3]-pts[1]; }
    else if(i===n-1){ ax=pts[i*2]-pts[(i-1)*2]; az=pts[i*2+1]-pts[(i-1)*2+1]; }
    else { ax=pts[(i+1)*2]-pts[(i-1)*2]; az=pts[(i+1)*2+1]-pts[(i-1)*2+1]; }
    var L=Math.hypot(ax,az)||1;
    r.push(pts[i*2]+az/L*off, pts[i*2+1]-ax/L*off);
  }
  return r;
}
function densifier(pts,pasMax){
  var n=pts.length/2, qx=[pts[0]], qz=[pts[1]], i;
  for(i=1;i<n;i++){
    var x0=pts[(i-1)*2], z0=pts[(i-1)*2+1], x1=pts[i*2], z1=pts[i*2+1];
    var L=Math.hypot(x1-x0,z1-z0);
    var m=Math.max(1,Math.ceil(L/pasMax));
    for(var s=1;s<=m;s++){ qx.push(x0+(x1-x0)*s/m); qz.push(z0+(z1-z0)*s/m); }
  }
  return {x:qx, z:qz};
}
function ruban(tas,pts,larg,couleur,dy,pasMax,uvEch){
  if(pts.length<4) return;
  var q=densifier(pts,pasMax), qx=q.x, qz=q.z;
  var N=qx.length, h=larg/2, du=0, i;
  var pl=[], pr=[];
  for(i=0;i<N;i++){
    var ax,az;
    if(i===0){ ax=qx[1]-qx[0]; az=qz[1]-qz[0]; }
    else if(i===N-1){ ax=qx[i]-qx[i-1]; az=qz[i]-qz[i-1]; }
    else { ax=qx[i+1]-qx[i-1]; az=qz[i+1]-qz[i-1]; }
    var L2=Math.hypot(ax,az)||1;
    var nx=az/L2, nz=-ax/L2;
    var lx=qx[i]+nx*h, lz=qz[i]+nz*h, rx=qx[i]-nx*h, rz=qz[i]-nz*h;
    pl.push([lx, hauteur(lx,lz)+dy, lz]);
    pr.push([rx, hauteur(rx,rz)+dy, rz]);
  }
  for(i=1;i<N;i++){
    var seg=Math.hypot(qx[i]-qx[i-1],qz[i]-qz[i-1]);
    var u0=du/uvEch, u1=(du+seg)/uvEch; du+=seg;
    tas.tri(pl[i-1][0],pl[i-1][1],pl[i-1][2], pr[i-1][0],pr[i-1][1],pr[i-1][2], pr[i][0],pr[i][1],pr[i][2],
            0,1,0,[u0,0,u0,1,u1,1],couleur);
    tas.tri(pl[i-1][0],pl[i-1][1],pl[i-1][2], pr[i][0],pr[i][1],pr[i][2], pl[i][0],pl[i][1],pl[i][2],
            0,1,0,[u0,0,u1,1,u1,0],couleur);
  }
}
/* bordure de trottoir : bande continue, dessus surélevé et deux joues.
   Pas de face en bout, sinon les tronçons se battent en profondeur. */
function bordure(tas,pts,larg,haut,cdessus,cjoue){
  var q=densifier(pts,7), qx=q.x, qz=q.z, i, N=qx.length;
  if(N<2) return;
  var G=[], D=[], Y=[];
  for(i=0;i<N;i++){
    var ax,az;
    if(i===0){ ax=qx[1]-qx[0]; az=qz[1]-qz[0]; }
    else if(i===N-1){ ax=qx[i]-qx[i-1]; az=qz[i]-qz[i-1]; }
    else { ax=qx[i+1]-qx[i-1]; az=qz[i+1]-qz[i-1]; }
    var L=Math.hypot(ax,az)||1;
    var nx=az/L*larg/2, nz=-ax/L*larg/2;
    G.push([qx[i]+nx, qz[i]+nz]);
    D.push([qx[i]-nx, qz[i]-nz]);
    Y.push(hauteur(qx[i],qz[i]));
  }
  var du=0;
  for(i=1;i<N;i++){
    var seg=Math.hypot(qx[i]-qx[i-1],qz[i]-qz[i-1]);
    var u0=du/2, u1=(du+seg)/2; du+=seg;
    var g0=G[i-1], g1=G[i], d0=D[i-1], d1=D[i];
    var ya=Y[i-1]+haut, yb=Y[i]+haut;
    /* dessus */
    tas.tri(g0[0],ya,g0[1], d0[0],ya,d0[1], d1[0],yb,d1[1], 0,1,0,[u0,0,u0,1,u1,1],cdessus);
    tas.tri(g0[0],ya,g0[1], d1[0],yb,d1[1], g1[0],yb,g1[1], 0,1,0,[u0,0,u1,1,u1,0],cdessus);
    /* joues */
    var ex=g1[0]-g0[0], ez=g1[1]-g0[1], eL=Math.hypot(ex,ez)||1;
    joue(tas,g0,g1,Y[i-1]+0.01,Y[i]+0.01,ya,yb, ez/eL,-ex/eL, u0,u1,cjoue);
    ex=d0[0]-d1[0]; ez=d0[1]-d1[1]; eL=Math.hypot(ex,ez)||1;
    joue(tas,d1,d0,Y[i]+0.01,Y[i-1]+0.01,yb,ya, ez/eL,-ex/eL, u0,u1,cjoue);
  }
}
function joue(tas,p0,p1,b0,b1,t0,t1,nx,nz,u0,u1,c){
  tas.tri(p0[0],b0,p0[1], p1[0],t1,p1[1], p1[0],b1,p1[1], nx,0,nz, [u0,0,u1,0.2,u1,0], c);
  tas.tri(p0[0],b0,p0[1], p0[0],t0,p0[1], p1[0],t1,p1[1], nx,0,nz, [u0,0,u0,0.2,u1,0.2], c);
}
function airePoly(p){
  var a=0, n=p.length/2;
  for(var i=0;i<n;i++){ var j=(i+1)%n; a+=p[i*2]*p[j*2+1]-p[j*2]*p[i*2+1]; }
  return a/2;
}
function dansPoly(p,x,z){
  var n=p.length/2, dedans=false;
  for(var i=0,j=n-1;i<n;j=i++){
    var xi=p[i*2], zi=p[i*2+1], xj=p[j*2], zj=p[j*2+1];
    if(((zi>z)!==(zj>z)) && (x < (xj-xi)*(z-zi)/(zj-zi)+xi)) dedans=!dedans;
  }
  return dedans;
}
function polySol(tas,pts,couleur,dy,plat){
  var n=pts.length/2;
  if(n<3) return;
  var ctr=[], i;
  for(i=0;i<n;i++) ctr.push(new THREE.Vector2(pts[i*2],pts[i*2+1]));
  var tris;
  try{ tris=THREE.ShapeUtils.triangulateShape(ctr,[]); }catch(e){ return; }
  var yfix=0;
  if(plat){
    yfix=1e9;
    for(i=0;i<n;i++){ var hh=hauteur(pts[i*2],pts[i*2+1]); if(hh<yfix) yfix=hh; }
    yfix+=dy;
  }
  for(i=0;i<tris.length;i++){
    var t=tris[i], v=[];
    for(var k=0;k<3;k++){
      var a=ctr[t[k]];
      v.push([a.x, plat?yfix:(hauteur(a.x,a.y)+dy), a.y]);
    }
    tas.tri(v[0][0],v[0][1],v[0][2], v[2][0],v[2][1],v[2][2], v[1][0],v[1][1],v[1][2],
            0,1,0,[v[0][0]/6,v[0][2]/6, v[2][0]/6,v[2][2]/6, v[1][0]/6,v[1][2]/6], couleur);
  }
}
function texteBrut(id){ return donnee(id); }
function loDeX(x){ return LO0+x/MLON; }
function laDeZ(z){ return LA0-z/MLAT; }
function capDeAz(az){ var a=az*PI/180; return Math.atan2(-Math.cos(a), Math.sin(a)); }
function azDeCap(c){ return ((Math.atan2(Math.cos(c), -Math.sin(c))*180/PI)+360)%360; }
/* triangle avec une couleur par sommet (dégradé d'occlusion au pied des murs) */
Tas.prototype.triC=function(ax,ay,az,bx,by,bz,cx,cy,cz,nx,ny,nz,uv,ca,cb,cc){
  if(this.n+3>this.cap) this.grandir();
  var i3=this.n*3, i2=this.n*2, p=this.p, nr=this.nr, u=this.u, c=this.c, C=[ca,cb,cc];
  p[i3]=ax; p[i3+1]=ay; p[i3+2]=az;
  p[i3+3]=bx; p[i3+4]=by; p[i3+5]=bz;
  p[i3+6]=cx; p[i3+7]=cy; p[i3+8]=cz;
  for(var k=0;k<3;k++){
    nr[i3+k*3]=nx; nr[i3+k*3+1]=ny; nr[i3+k*3+2]=nz;
    c[i3+k*3]=C[k][0]; c[i3+k*3+1]=C[k][1]; c[i3+k*3+2]=C[k][2];
  }
  u[i2]=uv[0]; u[i2+1]=uv[1]; u[i2+2]=uv[2]; u[i2+3]=uv[3]; u[i2+4]=uv[4]; u[i2+5]=uv[5];
  this.n+=3;
};
/* =================================================================
   Textures procédurales
================================================================= */
var MAT={};
function toile(w,h){
  var c=document.createElement('canvas'); c.width=w; c.height=h;
  return c;
}
function textureDe(c,rx,ry){
  var t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(rx||1,ry||1);
  t.anisotropy=8;
  if(t.colorSpace!==undefined) t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
function grain(g,W,H,n,a,clair,sombre){
  for(var i=0;i<n;i++){
    g.fillStyle=(Math.random()<0.5?sombre:clair);
    g.globalAlpha=a*(0.4+Math.random()*0.6);
    var s=0.8+Math.random()*1.8;
    g.fillRect(Math.random()*W,Math.random()*H,s,s);
  }
  g.globalAlpha=1;
}

/* ---------------- ciel ---------------- */
function faireCiel(nuit){
  var W=1024, H=512, c=toile(W,H), g=c.getContext('2d'), i;
  var grd=g.createLinearGradient(0,0,0,H);
  if(nuit){
    grd.addColorStop(0,'#050c1c'); grd.addColorStop(0.34,'#0a1730');
    grd.addColorStop(0.47,'#16233f'); grd.addColorStop(0.5,'#1d2a45');
    grd.addColorStop(0.55,'#101827'); grd.addColorStop(1,'#070b12');
  } else {
    grd.addColorStop(0,'#2f6ec4'); grd.addColorStop(0.26,'#5b96da');
    grd.addColorStop(0.42,'#9cc4e8'); grd.addColorStop(0.49,'#d6e6f2');
    grd.addColorStop(0.5,'#c8d6d2'); grd.addColorStop(0.62,'#8fa07a');
    grd.addColorStop(1,'#6b7a52');
  }
  g.fillStyle=grd; g.fillRect(0,0,W,H);

  if(nuit){
    for(i=0;i<900;i++){
      var sx=Math.random()*W, sy=Math.random()*H*0.48;
      g.fillStyle='rgba(255,255,255,'+(0.25+Math.random()*0.7)+')';
      g.beginPath(); g.arc(sx,sy,Math.random()<0.06?1.7:0.9,0,7); g.fill();
    }
    var mx=W*0.30, my=H*0.16;
    var lg=g.createRadialGradient(mx,my,2,mx,my,70);
    lg.addColorStop(0,'rgba(240,246,255,0.95)'); lg.addColorStop(0.16,'rgba(210,225,250,0.5)');
    lg.addColorStop(1,'rgba(150,180,230,0)');
    g.fillStyle=lg; g.beginPath(); g.arc(mx,my,70,0,7); g.fill();
    g.fillStyle='#eef3ff'; g.beginPath(); g.arc(mx,my,11,0,7); g.fill();
  } else {
    /* soleil, dans l'axe de la lumière directionnelle */
    var ux=W*0.899, uy=H*0.20;
    var sg=g.createRadialGradient(ux,uy,4,ux,uy,190);
    sg.addColorStop(0,'rgba(255,252,235,1)'); sg.addColorStop(0.06,'rgba(255,245,205,0.85)');
    sg.addColorStop(0.24,'rgba(255,238,200,0.28)'); sg.addColorStop(1,'rgba(255,238,200,0)');
    g.fillStyle=sg; g.beginPath(); g.arc(ux,uy,190,0,7); g.fill();
    g.fillStyle='#fffdf2'; g.beginPath(); g.arc(ux,uy,13,0,7); g.fill();
    for(i=0;i<26;i++){
      var cx=Math.random()*W, cy=H*(0.05+Math.random()*0.40);
      var ech=(cy/H)*2.2+0.35;
      var larg=(60+Math.random()*150)*ech, haut=(16+Math.random()*24);
      var op=0.30+Math.random()*0.42;
      for(var k=0;k<16;k++){
        var bx=cx+(Math.random()-0.5)*larg, by=cy+(Math.random()-0.5)*haut;
        var br=(14+Math.random()*30)*(0.6+ech*0.4);
        var cg=g.createRadialGradient(bx,by,1,bx,by,br);
        cg.addColorStop(0,'rgba(255,255,255,'+op+')');
        cg.addColorStop(0.55,'rgba(248,250,253,'+(op*0.5)+')');
        cg.addColorStop(1,'rgba(235,242,250,0)');
        g.fillStyle=cg; g.beginPath(); g.arc(bx,by,br,0,7); g.fill();
      }
    }
    var hz=g.createLinearGradient(0,H*0.40,0,H*0.53);
    hz.addColorStop(0,'rgba(226,238,247,0)'); hz.addColorStop(0.8,'rgba(226,238,247,0.85)');
    hz.addColorStop(1,'rgba(214,228,240,0.9)');
    g.fillStyle=hz; g.fillRect(0,H*0.40,W,H*0.13);
  }
  return c;
}

/* ---------------- façades ---------------- */
function fondPierre(g,W,H){
  g.fillStyle='#cdc3ad'; g.fillRect(0,0,W,H);
  var hb=17, y, x, dec=0;
  for(y=0;y<H;y+=hb){
    dec=(dec+37)%64;
    for(x=-64;x<W;x+=54){
      var l=205+Math.random()*36;
      g.fillStyle='rgb('+Math.round(l)+','+Math.round(l*0.965)+','+Math.round(l*0.885)+')';
      g.fillRect(x+dec+1,y+1,52,hb-2);
    }
    g.strokeStyle='rgba(120,110,92,0.35)'; g.lineWidth=1;
    g.beginPath(); g.moveTo(0,y+0.5); g.lineTo(W,y+0.5); g.stroke();
  }
  grain(g,W,H,2600,0.28,'#ffffff','#8d8471');
}
function fondEnduit(g,W,H){
  g.fillStyle='#e7ddc9'; g.fillRect(0,0,W,H);
  grain(g,W,H,5200,0.30,'#fffaf0','#b8ab93');
  for(var i=0;i<40;i++){
    g.strokeStyle='rgba(150,140,120,0.10)'; g.lineWidth=1+Math.random()*2;
    var x=Math.random()*W, y=Math.random()*H;
    g.beginPath(); g.moveTo(x,y); g.lineTo(x+(Math.random()-0.5)*40,y+(Math.random()-0.5)*40); g.stroke();
  }
}
function volet(g,x,y,w,h,coul){
  g.fillStyle=coul; g.fillRect(x,y,w,h);
  g.strokeStyle='rgba(0,0,0,0.30)'; g.lineWidth=1;
  for(var s=y+3;s<y+h-1;s+=4){ g.beginPath(); g.moveTo(x+1,s); g.lineTo(x+w-1,s); g.stroke(); }
  g.strokeStyle='rgba(255,255,255,0.16)'; g.strokeRect(x+0.5,y+0.5,w-1,h-1);
}
function fenetre(g,x,y,w,h,volets){
  g.fillStyle='rgba(90,80,66,0.55)'; g.fillRect(x-3,y-3,w+6,h+6);
  var vg=g.createLinearGradient(x,y,x+w,y+h);
  vg.addColorStop(0,'#3b4f63'); vg.addColorStop(0.45,'#22303f');
  vg.addColorStop(0.5,'#516a80'); vg.addColorStop(1,'#1b2734');
  g.fillStyle=vg; g.fillRect(x,y,w,h);
  g.fillStyle='rgba(255,255,255,0.13)';
  g.beginPath(); g.moveTo(x,y+h); g.lineTo(x+w*0.85,y); g.lineTo(x+w,y); g.lineTo(x,y+h*0.5); g.closePath(); g.fill();
  g.strokeStyle='#f2ece0'; g.lineWidth=2.4;
  g.strokeRect(x+1,y+1,w-2,h-2);
  g.beginPath(); g.moveTo(x+w/2,y); g.lineTo(x+w/2,y+h);
  g.moveTo(x,y+h*0.42); g.lineTo(x+w,y+h*0.42); g.stroke();
  g.fillStyle='#d9d1c0'; g.fillRect(x-6,y+h+2,w+12,5);
  g.fillStyle='rgba(0,0,0,0.18)'; g.fillRect(x-6,y+h+7,w+12,2);
  if(volets){
    volet(g,x-16,y-1,13,h+2,volets);
    volet(g,x+w+3,y-1,13,h+2,volets);
  }
}
function faireEtage(pierre){
  var W=256, H=205, c=toile(W,H), g=c.getContext('2d');
  if(pierre) fondPierre(g,W,H); else fondEnduit(g,W,H);
  var vol=pierre?'#6f7f6a':'#5b7386';
  fenetre(g,42,44,54,96,vol);
  fenetre(g,168,44,54,96,vol);
  g.fillStyle='rgba(255,255,255,0.14)'; g.fillRect(0,H-9,W,4);
  g.fillStyle='rgba(90,80,66,0.22)'; g.fillRect(0,H-5,W,5);
  return c;
}
function faireRdc(pierre){
  var W=256, H=205, c=toile(W,H), g=c.getContext('2d');
  if(pierre) fondPierre(g,W,H); else fondEnduit(g,W,H);
  g.fillStyle='rgba(70,64,54,0.30)'; g.fillRect(0,H-34,W,34);
  var vol=pierre?'#6f7f6a':'#5b7386';
  var dx=36, dw=52, dy=H-34-118;
  g.fillStyle='rgba(90,80,66,0.5)'; g.fillRect(dx-4,dy-18,dw+8,136);
  g.fillStyle='#2b3a49'; g.fillRect(dx,dy-14,dw,12);
  var pg=g.createLinearGradient(dx,dy,dx+dw,dy);
  pg.addColorStop(0,'#4d3a2a'); pg.addColorStop(0.5,'#6b503a'); pg.addColorStop(1,'#423224');
  g.fillStyle=pg; g.fillRect(dx,dy,dw,118);
  g.strokeStyle='rgba(0,0,0,0.35)'; g.lineWidth=2;
  g.strokeRect(dx+6,dy+8,dw-12,44); g.strokeRect(dx+6,dy+60,dw-12,48);
  g.fillStyle='#d8c48a'; g.beginPath(); g.arc(dx+dw-9,dy+64,3,0,7); g.fill();
  fenetre(g,152,H-34-116,64,100,vol);
  return c;
}
/* carte d'émission : seules les fenêtres s'allument, la nuit */
function faireFenetresLumineuses(rdc){
  var W=256, H=205, c=toile(W,H), g=c.getContext('2d');
  g.fillStyle='#000000'; g.fillRect(0,0,W,H);
  function vitre(x,y,w,h,p){
    if(Math.random()>p) return;
    var t=Math.random();
    g.fillStyle='rgb('+Math.round(232+t*23)+','+Math.round(186+t*46)+','+Math.round(110+t*50)+')';
    g.fillRect(x,y,w,h);
    g.strokeStyle='#000000'; g.lineWidth=2.4;
    g.strokeRect(x+1,y+1,w-2,h-2);
    g.beginPath(); g.moveTo(x+w/2,y); g.lineTo(x+w/2,y+h);
    g.moveTo(x,y+h*0.42); g.lineTo(x+w,y+h*0.42); g.stroke();
  }
  if(rdc){
    vitre(152,H-34-116,64,100,0.55);
    vitre(36,H-34-118-14,52,12,0.7);
  } else {
    vitre(42,44,54,96,0.5);
    vitre(168,44,54,96,0.5);
  }
  return c;
}
function faireMurNu(){
  var W=128, H=128, c=toile(W,H), g=c.getContext('2d');
  g.fillStyle='#d8d2c6'; g.fillRect(0,0,W,H);
  grain(g,W,H,2600,0.32,'#ffffff','#9d9787');
  g.strokeStyle='rgba(120,112,96,0.16)'; g.lineWidth=1;
  for(var y=0;y<H;y+=21){ g.beginPath(); g.moveTo(0,y+0.5); g.lineTo(W,y+0.5); g.stroke(); }
  return c;
}
/* tuiles canal : la texture couvre 1.28 m */
function faireTuiles(){
  var W=128, H=128, c=toile(W,H), g=c.getContext('2d');
  g.fillStyle='#a35c39'; g.fillRect(0,0,W,H);
  var hr=21, dec=0;
  for(var y=-hr;y<H;y+=hr){
    dec=(dec+16)%32;
    for(var x=-32;x<W;x+=32){
      var t=Math.random();
      g.fillStyle='rgb('+Math.round(150+t*54)+','+Math.round(76+t*34)+','+Math.round(52+t*26)+')';
      g.beginPath();
      g.moveTo(x+dec,y+hr); g.lineTo(x+dec,y+7);
      g.quadraticCurveTo(x+dec+16,y-6,x+dec+32,y+7);
      g.lineTo(x+dec+32,y+hr); g.closePath(); g.fill();
      g.strokeStyle='rgba(60,28,16,0.35)'; g.lineWidth=1.4;
      g.beginPath(); g.moveTo(x+dec+0.5,y+hr); g.lineTo(x+dec+0.5,y+7); g.stroke();
      if(Math.random()<0.05){
        g.fillStyle='rgba(96,112,64,0.5)';
        g.beginPath(); g.arc(x+dec+8+Math.random()*16,y+10+Math.random()*8,3+Math.random()*4,0,7); g.fill();
      }
    }
    g.fillStyle='rgba(0,0,0,0.22)'; g.fillRect(0,y+hr-2,W,3);
  }
  grain(g,W,H,1400,0.18,'#ffffff','#4a2415');
  return c;
}
/* ---------------- sols ---------------- */
function faireBitume(){
  var W=256, H=256, c=toile(W,H), g=c.getContext('2d'), i;
  g.fillStyle='#4c4f55'; g.fillRect(0,0,W,H);
  grain(g,W,H,14000,0.34,'#8b9098','#2c2f34');
  for(i=0;i<9;i++){
    g.strokeStyle='rgba(30,32,36,0.5)'; g.lineWidth=0.8+Math.random();
    var x=Math.random()*W, y=Math.random()*H;
    g.beginPath(); g.moveTo(x,y);
    for(var k=0;k<5;k++){ x+=(Math.random()-0.5)*46; y+=(Math.random()-0.5)*46; g.lineTo(x,y); }
    g.stroke();
  }
  for(i=0;i<7;i++){
    var px=Math.random()*W, py=Math.random()*H, pr=18+Math.random()*40;
    var pg=g.createRadialGradient(px,py,2,px,py,pr);
    pg.addColorStop(0,'rgba(88,92,99,0.30)'); pg.addColorStop(1,'rgba(88,92,99,0)');
    g.fillStyle=pg; g.beginPath(); g.arc(px,py,pr,0,7); g.fill();
  }
  return c;
}
function faireDalles(){
  var W=128, H=128, c=toile(W,H), g=c.getContext('2d');
  g.fillStyle='#9a9a96'; g.fillRect(0,0,W,H);
  for(var y=0;y<H;y+=32) for(var x=0;x<W;x+=32){
    var t=Math.random()*22;
    g.fillStyle='rgb('+Math.round(150+t)+','+Math.round(148+t)+','+Math.round(142+t)+')';
    g.fillRect(x+1,y+1,30,30);
  }
  grain(g,W,H,3000,0.24,'#ffffff','#6e6e69');
  return c;
}
function faireHerbe(){
  var W=256, H=256, c=toile(W,H), g=c.getContext('2d'), i;
  g.fillStyle='#6f8a46'; g.fillRect(0,0,W,H);
  for(i=0;i<40;i++){
    var px=Math.random()*W, py=Math.random()*H, pr=20+Math.random()*60;
    var pg=g.createRadialGradient(px,py,2,px,py,pr);
    var cl=Math.random()<0.5?'118,140,74':'88,112,56';
    pg.addColorStop(0,'rgba('+cl+',0.5)'); pg.addColorStop(1,'rgba('+cl+',0)');
    g.fillStyle=pg; g.beginPath(); g.arc(px,py,pr,0,7); g.fill();
  }
  for(i=0;i<9000;i++){
    var v=Math.random()<0.5;
    g.strokeStyle='rgba('+(v?86:132)+','+(v?108:160)+','+(v?52:76)+',0.55)';
    g.lineWidth=1;
    var x=Math.random()*W, y=Math.random()*H;
    g.beginPath(); g.moveTo(x,y); g.lineTo(x+(Math.random()-0.5)*2.6,y-2-Math.random()*3.4); g.stroke();
  }
  return c;
}
/* feuillage sur fond transparent : atlas de deux cellules,
   à gauche un houppier de feuillu, à droite un conifère */
function faireFeuillage(){
  var W=512, H=256, c=toile(W,H), g=c.getContext('2d'), i;
  g.clearRect(0,0,W,H);
  function feuille(x,y,s,rvb,op){
    g.fillStyle='rgba('+rvb+','+op+')';
    g.save(); g.translate(x,y); g.rotate(Math.random()*PI);
    g.beginPath(); g.ellipse(0,0,s,s*0.6,0,0,7); g.fill();
    g.restore();
  }
  /* feuillu : masse ronde un peu irrégulière */
  var cx=128, cy=H*0.54;
  for(i=0;i<900;i++){
    var a=Math.random()*2*PI, rr=Math.pow(Math.random(),0.48);
    if(Math.random()<rr*rr*0.85) continue;
    var x=cx+Math.cos(a)*rr*118, y=cy+Math.sin(a)*rr*116;
    var t=Math.random(), lum=1-rr*0.40-(y<cy?0:0.12);
    feuille(x,y,5+Math.random()*13,
      Math.round((54+t*76)*lum)+','+Math.round((98+t*78)*lum)+','+Math.round((38+t*50)*lum),
      (0.8+Math.random()*0.2));
  }
  /* conifère : silhouette conique */
  var bx=384;
  for(i=0;i<1000;i++){
    var v=Math.random();
    var yy=14+v*228;
    var demi=(v*v*0.9+0.06)*104;
    var xx=bx+(Math.random()*2-1)*demi;
    if(Math.random()<Math.abs(xx-bx)/(demi+1)*0.55) continue;
    var t2=Math.random(), lum2=0.72+ (1-Math.abs(xx-bx)/(demi+1))*0.4;
    feuille(xx,yy,3.5+Math.random()*7,
      Math.round((36+t2*46)*lum2)+','+Math.round((74+t2*54)*lum2)+','+Math.round((40+t2*34)*lum2),
      (0.82+Math.random()*0.18));
  }
  return c;
}
function faireEcorce(){
  var W=64, H=128, c=toile(W,H), g=c.getContext('2d');
  g.fillStyle='#6b5540'; g.fillRect(0,0,W,H);
  for(var i=0;i<70;i++){
    g.strokeStyle='rgba('+Math.round(40+Math.random()*60)+','+Math.round(32+Math.random()*46)+',26,0.5)';
    g.lineWidth=1+Math.random()*3;
    var x=Math.random()*W;
    g.beginPath(); g.moveTo(x,0);
    for(var y=0;y<H;y+=16){ x+=(Math.random()-0.5)*5; g.lineTo(x,y); }
    g.stroke();
  }
  grain(g,W,H,1200,0.3,'#a8896a','#3a2c1e');
  return c;
}

/* =================================================================
   Palette et grille de collision
================================================================= */
var monde=new THREE.Group();
var COL={
  route:teinte(0xffffff), sentier:teinte(0xcaa87e), piste:teinte(0xbba077),
  rail:teinte(0x8c8478), trottoir:teinte(0xf4f2ec), joue:teinte(0xd6d3ca),
  eau:teinte(0x27607f), foret:teinte(0x3c6234), herbe:teinte(0x7f9a52),
  terrain:teinte(0x6f8c42), champ:teinte(0xbfae72), sport:teinte(0x5f8f45),
  parking:teinte(0x8d9298), cimetiere:teinte(0x94a07c), milit:teinte(0x9aa06c),
  indus:teinte(0x9a9c9f), roche:teinte(0xa3947c), trace:teinte(0xF2B33D)
};
var MURS=[teinte(0xe2dccf),teinte(0xd6cebd),teinte(0xeae5da),teinte(0xcdc4b2),teinte(0xdfd7c6),teinte(0xc9c1b1)];
var TOITS=[teinte(0xf0e8e2),teinte(0xdccec4),teinte(0xf7ded0),teinte(0xc6ccd6),teinte(0xb8bec8),teinte(0xe6dbcc)];

var zonesM=[];
var grilleCol=null, GC_PAS=2, GC_NX=0, GC_NZ=0;
function initCollision(){
  GC_NX=Math.ceil((XMAX-XMIN)/GC_PAS);
  GC_NZ=Math.ceil((ZMAX-ZMIN)/GC_PAS);
  grilleCol=new Uint8Array(GC_NX*GC_NZ);
}
function bloquer(x,z){
  var i=Math.floor((x-XMIN)/GC_PAS), j=Math.floor((z-ZMIN)/GC_PAS);
  if(i<0||j<0||i>=GC_NX||j>=GC_NZ) return false;
  return grilleCol[j*GC_NX+i]===1;
}
function marquerPoly(pts){
  var n=pts.length/2, i;
  var x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
  for(i=0;i<n;i++){
    var x=pts[i*2], z=pts[i*2+1];
    if(x<x0)x0=x; if(x>x1)x1=x; if(z<z0)z0=z; if(z>z1)z1=z;
  }
  var ja=Math.max(0,Math.floor((z0-ZMIN)/GC_PAS)), jb=Math.min(GC_NZ-1,Math.ceil((z1-ZMIN)/GC_PAS));
  var ia=Math.max(0,Math.floor((x0-XMIN)/GC_PAS)), ib=Math.min(GC_NX-1,Math.ceil((x1-XMIN)/GC_PAS));
  for(var j=ja;j<=jb;j++){
    var zc=ZMIN+(j+0.5)*GC_PAS;
    for(i=ia;i<=ib;i++){
      var xc=XMIN+(i+0.5)*GC_PAS;
      if(dansPoly(pts,xc,zc)) grilleCol[j*GC_NX+i]=1;
    }
  }
}

/* =================================================================
   Relief
================================================================= */
var meshTerrain=null;
function construireRelief(gros){
  var SUB=4;
  var nz=(GROWS-1)*SUB+1, nx=(GCOLS-1)*SUB+1;
  var pos=new Float32Array(nx*nz*3), col=new Float32Array(nx*nz*3), uv=new Float32Array(nx*nz*2);
  var idx=[], i, j, k;
  for(j=0;j<nz;j++){
    var z=ZMAX-(ZMAX-ZMIN)*j/(nz-1);
    for(i=0;i<nx;i++){
      var x=XMIN+(XMAX-XMIN)*i/(nx-1);
      var o=(j*nx+i);
      pos[o*3]=x; pos[o*3+1]=hauteur(x,z); pos[o*3+2]=z;
      uv[o*2]=x/9; uv[o*2+1]=z/9;
      var c=COL.terrain;
      for(k=0;k<gros.length;k++){ if(dansPoly(gros[k].p,x,z)){ c=gros[k].c; break; } }
      var v=0.86+bruit(x,z,34)*0.22+bruit(x,z,9)*0.08;
      var pn=pente(x,z);
      if(pn>0.20) c=melange(c,COL.roche,Math.min(0.7,(pn-0.20)*2.1));
      col[o*3]=c[0]*v; col[o*3+1]=c[1]*v; col[o*3+2]=c[2]*v;
    }
  }
  for(j=0;j<nz-1;j++) for(i=0;i<nx-1;i++){
    var a=j*nx+i, b=a+1, c2=a+nx, d=c2+1;
    idx.push(a,b,c2, b,d,c2);
  }
  var g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.BufferAttribute(col,3));
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  g.setIndex(idx);
  g.computeVertexNormals();
  MAT.terrain=materielSol();
  meshTerrain=new THREE.Mesh(g,MAT.terrain);
  meshTerrain.receiveShadow=true;
  monde.add(meshTerrain);
  var pl=new THREE.Mesh(new THREE.PlaneGeometry(16000,16000),
        new THREE.MeshStandardMaterial({color:0x7d8f5c, roughness:1, metalness:0}));
  pl.rotation.x=-PI/2;
  pl.position.set((XMIN+XMAX)/2, 53.5, (ZMIN+ZMAX)/2);
  monde.add(pl);
}

/* =================================================================
   Zones
================================================================= */
function construireZones(zones){
  var sol=new Tas(), eau=new Tas(), dur=new Tas(), gros=[], i;
  for(i=0;i<zones.length;i++){
    var l=zones[i].split('\t');
    if(l.length<3) continue;
    var k=l[0], aire=+l[1], p=pointsDe(l[2]);
    if(airePoly(p)<0){
      var q=[]; for(var s=p.length/2-1;s>=0;s--){ q.push(p[s*2],p[s*2+1]); } p=q;
    }
    var c=COL.herbe, dy=0.10, plat=false, tas=sol;
    if(k==='w'){ c=COL.eau; dy=-0.3; plat=true; tas=eau; }
    else if(k==='f') c=COL.foret;
    else if(k==='g') c=COL.herbe;
    else if(k==='p'){ c=COL.sport; dy=0.12; }
    else if(k==='k'){ c=COL.parking; dy=0.13; tas=dur; }
    else if(k==='c') c=COL.cimetiere;
    else if(k==='a') c=COL.champ;
    else if(k==='M'){ zonesM.push(p); continue; }
    else if(k==='i'){ c=COL.indus; tas=dur; dy=0.13; }
    if(aire>9000 && k!=='w'){ gros.push({p:p,c:assombrir(c,0.97)}); continue; }
    polySol(tas,p,c,dy,plat);
  }
  for(i=0;i<zonesM.length;i++) gros.push({p:zonesM[i], c:COL.milit});
  return {sol:sol, eau:eau, dur:dur, gros:gros};
}

/* =================================================================
   Voies, trottoirs, marquage
================================================================= */
function pres(p,d){
  if(!d) return true;
  for(var i=0;i<p.length;i+=2){
    if(surLeParcours(p[i],p[i+1]).ecart<d) return true;
  }
  return false;
}
function construireVoies(voies,dpres){
  var bit=new Tas(), terre=new Tas(), trot=new Tas(), marq=new Tas();
  var blanc=teinte(0xf2f2ee);
  for(var i=0;i<voies.length;i++){
    var l=voies[i].split('\t');
    if(l.length<4) continue;
    var k=l[0], w=(+l[1])/10, p=pointsDe(l[3]);
    if(k==='r'){
      ruban(bit,p,w,COL.route,0.16,7,7);
      if(w>=5 && pres(p,dpres)){
        bordure(trot,decaler(p, w/2+0.95),1.9,0.30,COL.trottoir,COL.joue);
        bordure(trot,decaler(p,-w/2-0.95),1.9,0.30,COL.trottoir,COL.joue);
        if(w>=6.2) pointilles(marq,p,blanc);
      }
    }
    else if(k==='s') ruban(terre,p,w,COL.sentier,0.15,7,4);
    else if(k==='t') ruban(terre,p,w,COL.piste,0.15,7,4);
    else if(k==='v') ruban(terre,p,w,COL.rail,0.18,7,3);
  }
  return {bit:bit, terre:terre, trot:trot, marq:marq};
}
function pointilles(tas,pts,col){
  var q=densifier(pts,2), qx=q.x, qz=q.z, i, d=0;
  for(i=1;i<qx.length;i++){
    var ax=qx[i-1], az=qz[i-1], bx=qx[i], bz=qz[i];
    var L=Math.hypot(bx-ax,bz-az);
    d+=L;
    if(Math.floor(d/3.4)%2) continue;
    var nx=(bz-az)/L*0.09, nz=-(bx-ax)/L*0.09;
    var y0=hauteur(ax,az)+0.185, y1=hauteur(bx,bz)+0.185;
    tas.tri(ax+nx,y0,az+nz, ax-nx,y0,az-nz, bx-nx,y1,bz-nz, 0,1,0,[0,0,0,1,1,1],col);
    tas.tri(ax+nx,y0,az+nz, bx-nx,y1,bz-nz, bx+nx,y1,bz+nz, 0,1,0,[0,0,1,1,1,0],col);
  }
}

/* =================================================================
   Lignes : rivière, murs, haies, alignements d'arbres
================================================================= */
function construireLignes(lgs,tasEau,tasBati,arbres){
  for(var i=0;i<lgs.length;i++){
    var l=lgs[i].split('\t');
    if(l.length<2) continue;
    var k=l[0], p=pointsDe(l[1]);
    if(k==='R'){ ruban(tasEau,p,7,COL.eau,-0.35,8,8); continue; }
    if(k==='S'){ ruban(tasEau,p,2.2,COL.eau,-0.25,8,8); continue; }
    if(k==='t'){ semerArbresLigne(p,arbres,10,0); continue; }
    if(k==='h'){ semerArbresLigne(p,arbres,2.4,2); continue; }
    var h=2.3, larg=0.42, c=teinte(0xe7e0d0);
    if(k==='f'){ h=1.6; larg=0.14; c=teinte(0x9a958c); }
    murLigne(tasBati,p,larg,h,c);
  }
}
function murLigne(tas,pts,larg,h,c){
  var q=densifier(pts,6), qx=q.x, qz=q.z;
  for(var i=1;i<qx.length;i++){
    var ax=qx[i-1], az=qz[i-1], bx=qx[i], bz=qz[i];
    var dx=bx-ax, dz=bz-az, dl=Math.hypot(dx,dz);
    if(dl<0.2) continue;
    var nx=dz/dl*larg/2, nz=-dx/dl*larg/2;
    var y0=Math.min(hauteur(ax,az),hauteur(bx,bz))-0.2, y1=y0+h;
    boiteQuad(tas,[ax+nx,az+nz],[bx+nx,bz+nz],[bx-nx,bz-nz],[ax-nx,az-nz],y0,y1,c,c,2);
  }
}
/* =================================================================
   Textures supplémentaires : sols minéraux, bâtiments typés
================================================================= */
function faireBeton(){
  var W=256, H=256, c=toile(W,H), g=c.getContext('2d'), i;
  g.fillStyle='#c9c5bb'; g.fillRect(0,0,W,H);
  grain(g,W,H,9000,0.30,'#eeebe4','#8f8b82');
  for(i=0;i<14;i++){
    var px=Math.random()*W, py=Math.random()*H, pr=14+Math.random()*46;
    var pg=g.createRadialGradient(px,py,2,px,py,pr);
    pg.addColorStop(0,'rgba(110,104,94,0.18)'); pg.addColorStop(1,'rgba(110,104,94,0)');
    g.fillStyle=pg; g.fillRect(px-pr,py-pr,pr*2,pr*2);
  }
  g.strokeStyle='rgba(90,86,78,0.45)'; g.lineWidth=1.3;
  for(i=0;i<=W;i+=128){ g.beginPath(); g.moveTo(i+0.5,0); g.lineTo(i+0.5,H); g.moveTo(0,i+0.5); g.lineTo(W,i+0.5); g.stroke(); }
  return c;
}
function faireTerre(){
  var W=256, H=256, c=toile(W,H), g=c.getContext('2d');
  g.fillStyle='#a88c62'; g.fillRect(0,0,W,H);
  grain(g,W,H,16000,0.38,'#d2b88c','#6f5838');
  for(var i=0;i<260;i++){
    g.fillStyle='rgba('+(150+Math.random()*60|0)+','+(140+Math.random()*50|0)+','+(120+Math.random()*40|0)+',0.7)';
    g.beginPath(); g.arc(Math.random()*W,Math.random()*H,0.8+Math.random()*1.8,0,7); g.fill();
  }
  return c;
}
function faireArdoise(){
  var W=128, H=128, c=toile(W,H), g=c.getContext('2d');
  g.fillStyle='#4a5058'; g.fillRect(0,0,W,H);
  var hr=16, dec=0;
  for(var y=0;y<H;y+=hr){
    dec=(dec+13)%26;
    for(var x=-26;x<W;x+=26){
      var t=Math.random()*34;
      g.fillStyle='rgb('+Math.round(62+t)+','+Math.round(68+t)+','+Math.round(78+t)+')';
      g.fillRect(x+dec+1,y+1,24,hr-2);
    }
    g.fillStyle='rgba(0,0,0,0.32)'; g.fillRect(0,y+hr-2,W,2);
  }
  grain(g,W,H,900,0.16,'#ffffff','#22262b');
  return c;
}
function faireBardage(){
  var W=128, H=128, c=toile(W,H), g=c.getContext('2d');
  g.fillStyle='#c3c7cb'; g.fillRect(0,0,W,H);
  for(var x=0;x<W;x+=16){
    var lg=g.createLinearGradient(x,0,x+16,0);
    lg.addColorStop(0,'rgba(255,255,255,0.35)'); lg.addColorStop(0.2,'rgba(0,0,0,0.0)');
    lg.addColorStop(0.8,'rgba(0,0,0,0.12)'); lg.addColorStop(1,'rgba(0,0,0,0.30)');
    g.fillStyle=lg; g.fillRect(x,0,16,H);
  }
  grain(g,W,H,900,0.14,'#ffffff','#707478');
  return c;
}
/* église : une travée de 4 m, texture étirée sur toute la hauteur du mur */
function faireEglise(){
  var W=256, H=512, c=toile(W,H), g=c.getContext('2d');
  fondPierre(g,W,H);
  var x=96, w=64, y0=150, y1=390;
  g.fillStyle='rgba(80,70,56,0.55)';
  g.beginPath(); g.moveTo(x-6,y1+6); g.lineTo(x-6,y0); g.quadraticCurveTo(x+w/2,y0-70,x+w+6,y0); g.lineTo(x+w+6,y1+6); g.closePath(); g.fill();
  var vg=g.createLinearGradient(0,y0,0,y1);
  vg.addColorStop(0,'#2d3f5c'); vg.addColorStop(0.5,'#4b3656'); vg.addColorStop(1,'#26344a');
  g.fillStyle=vg;
  g.beginPath(); g.moveTo(x,y1); g.lineTo(x,y0+4); g.quadraticCurveTo(x+w/2,y0-58,x+w,y0+4); g.lineTo(x+w,y1); g.closePath(); g.fill();
  g.strokeStyle='rgba(20,16,12,0.8)'; g.lineWidth=2;
  for(var yy=y0+20;yy<y1;yy+=22){ g.beginPath(); g.moveTo(x,yy); g.lineTo(x+w,yy); g.stroke(); }
  g.beginPath(); g.moveTo(x+w/2,y0-30); g.lineTo(x+w/2,y1); g.stroke();
  g.fillStyle='#d4ccb8'; g.fillRect(x-10,y1+4,w+20,8);
  /* contreforts */
  g.fillStyle='rgba(60,54,44,0.22)'; g.fillRect(0,0,12,H); g.fillRect(W-12,0,12,H);
  return c;
}
function faireEcole(){
  var W=256, H=205, c=toile(W,H), g=c.getContext('2d');
  fondEnduit(g,W,H);
  g.fillStyle='rgba(255,250,235,0.35)'; g.fillRect(0,0,W,H);
  for(var k=0;k<2;k++){
    var x=12+k*128, w=104, y=40, h=112;
    g.fillStyle='rgba(90,84,74,0.55)'; g.fillRect(x-3,y-3,w+6,h+6);
    var vg=g.createLinearGradient(x,y,x+w,y+h);
    vg.addColorStop(0,'#48627a'); vg.addColorStop(0.5,'#2a3a4b'); vg.addColorStop(0.55,'#5b7890'); vg.addColorStop(1,'#223040');
    g.fillStyle=vg; g.fillRect(x,y,w,h);
    g.strokeStyle='#f4f1ea'; g.lineWidth=4; g.strokeRect(x+2,y+2,w-4,h-4);
    g.lineWidth=3; g.beginPath();
    g.moveTo(x+w/3,y); g.lineTo(x+w/3,y+h); g.moveTo(x+2*w/3,y); g.lineTo(x+2*w/3,y+h);
    g.moveTo(x,y+h*0.3); g.lineTo(x+w,y+h*0.3); g.stroke();
    g.fillStyle='#e3ddd0'; g.fillRect(x-4,y+h+3,w+8,6);
  }
  g.fillStyle='rgba(90,80,66,0.22)'; g.fillRect(0,H-6,W,6);
  return c;
}
function faireVitrine(){
  var W=256, H=205, c=toile(W,H), g=c.getContext('2d');
  fondEnduit(g,W,H);
  var cols=[['#b3342c','#f1ece2'],['#1f5b45','#e9e4d6'],['#274a78','#ece7dc'],['#6e3b63','#efe8dd']];
  var cc=cols[Math.floor(Math.random()*cols.length)];
  /* bandeau d'enseigne */
  g.fillStyle='#2b2f36'; g.fillRect(8,20,W-16,26);
  g.fillStyle='rgba(240,230,200,0.85)';
  for(var i=0;i<9;i++) g.fillRect(40+i*20,29,12,8);
  /* store banne rayé */
  for(var s=0;s<12;s++){
    g.fillStyle=cc[s%2];
    g.beginPath(); g.moveTo(8+s*20,50); g.lineTo(28+s*20,50); g.lineTo(32+s*20,76); g.lineTo(4+s*20,76); g.closePath(); g.fill();
  }
  g.fillStyle='rgba(0,0,0,0.25)'; g.fillRect(4,76,W-8,4);
  /* vitrine et porte vitrée */
  var vg=g.createLinearGradient(0,84,0,188);
  vg.addColorStop(0,'#1d2733'); vg.addColorStop(0.5,'#3b5064'); vg.addColorStop(1,'#1a222c');
  g.fillStyle='#3a3f47'; g.fillRect(10,82,W-20,110);
  g.fillStyle=vg; g.fillRect(16,88,150,98); g.fillRect(180,88,60,104);
  g.fillStyle='rgba(255,240,200,0.10)'; g.fillRect(16,88,150,98);
  g.strokeStyle='#8a9098'; g.lineWidth=3;
  g.strokeRect(16,88,150,98); g.strokeRect(180,88,60,104);
  g.beginPath(); g.moveTo(91,88); g.lineTo(91,186); g.stroke();
  g.fillStyle='rgba(70,64,54,0.40)'; g.fillRect(0,H-14,W,14);
  return c;
}
function faireFenetresRect(W,H,rects,p){
  var c=toile(W,H), g=c.getContext('2d');
  g.fillStyle='#000'; g.fillRect(0,0,W,H);
  rects.forEach(function(r){
    if(Math.random()>p) return;
    var t=Math.random();
    g.fillStyle='rgb('+Math.round(235+t*20)+','+Math.round(190+t*40)+','+Math.round(115+t*50)+')';
    g.fillRect(r[0],r[1],r[2],r[3]);
  });
  return c;
}

/* =================================================================
   Le sol réel : la photo aérienne décide où poser herbe, béton,
   terre nue et arbres.
================================================================= */
var SOL=null;
var MOS_W=2560, MOS_H=2048;
function classerPixel(r,g,b){
  var lum=(r+g+b)/3, exg=2*g-r-b, sat=Math.max(r,g,b)-Math.min(r,g,b);
  if(b>r+10 && b>=g-2) return 0;                      /* eau, reflets : pelouse par défaut */
  if(exg>9 && g>=r-3){ return (lum<96 && exg>13) ? 3 : 1; }  /* 3 arbres, 1 pelouse */
  if(g>=r-12 && g>b+18 && lum>92) return 4;          /* herbe sèche */
  if(r-b>=66) return 2;                               /* tuiles : minéral */
  if(r>g+4 && r>b+16 && lum>78 && sat<78) return 5;  /* terre nue, chemins */
  if(sat<36 && lum>=60) return 2;                     /* béton, bitume, gravillons */
  if(lum<60) return 6;                                /* ombre portée */
  return 2;
}
function preparerSolReel(){
  return new Promise(function(fini){
    var data=null;
    try{ data=JSON.parse(donnee('sat-data')); }catch(e){ data=null; }
    if(!data || !data.length || !window.CARTE){ SOL=null; fini(); return; }
    var mos=toile(MOS_W,MOS_H), g=mos.getContext('2d');
    var reste=data.length, fait=false;
    function suite(){
      reste--;
      if(reste>0 || fait) return;
      fait=true;
      try{ classer(); }catch(e){ console.error(e); SOL=null; }
      fini();
    }
    data.forEach(function(t){
      var im=new Image();
      im.onload=function(){ try{ g.drawImage(im, t[0]/120*256, (t[1]+60)/120*256, 256, 256); }catch(e){} suite(); };
      im.onerror=suite;
      im.src='data:image/jpeg;base64,'+t[2];
    });
    setTimeout(function(){ if(!fait){ reste=1; suite(); } }, 12000);

    function classer(){
      var src=g.getImageData(0,0,MOS_W,MOS_H).data;
      var W=1200, H=1008, i, j;
      var mu=new Int32Array(W), mv=new Int32Array(H);
      for(i=0;i<W;i++){
        var x=XMIN+(i+0.5)*(XMAX-XMIN)/W;
        mu[i]=Math.max(0,Math.min(MOS_W-2,Math.floor(CARTE.X(loDeX(x))/1200*MOS_W)));
      }
      for(j=0;j<H;j++){
        var z=ZMIN+(j+0.5)*(ZMAX-ZMIN)/H;
        mv[j]=Math.max(0,Math.min(MOS_H-2,Math.floor((CARTE.Y(laDeZ(z))+60)/120*256)));
      }
      var cm=toile(W,H), cg=cm.getContext('2d'), id=cg.createImageData(W,H), d=id.data;
      var canop=new Uint8Array(W*H);
      for(j=0;j<H;j++){
        var v=mv[j];
        for(i=0;i<W;i++){
          var u=mu[i];
          var o=(v*MOS_W+u)*4, o2=o+4, o3=o+MOS_W*4, o4=o3+4;
          if(src[o+3]===0){ d[(j*W+i)*4+3]=255; continue; }
          var r=(src[o]+src[o2]+src[o3]+src[o4])>>2;
          var gg=(src[o+1]+src[o2+1]+src[o3+1]+src[o4+1])>>2;
          var b=(src[o+2]+src[o2+2]+src[o3+2]+src[o4+2])>>2;
          var k=classerPixel(r,gg,b), p=(j*W+i)*4;
          var mm=0, ss=0;
          if(k===2) mm=255; else if(k===6) mm=150; else if(k===5) ss=255; else if(k===4) ss=90;
          if(k===3) canop[j*W+i]=1;
          d[p]=mm; d[p+1]=k===3?255:0; d[p+2]=ss; d[p+3]=255;
        }
      }
      cg.putImageData(id,0,0);
      var fl=toile(W,H), fg=fl.getContext('2d');
      try{ fg.filter='blur(1.4px)'; }catch(e){}
      fg.drawImage(cm,0,0);
      var tex=new THREE.CanvasTexture(fl);
      tex.flipY=false;
      tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;
      tex.anisotropy=4;
      SOL={tex:tex, W:W, H:H, canopee:canop, apercu:fl};
    }
  });
}
function materielSol(){
  var m=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(faireHerbe(),1,1), roughness:0.97, metalness:0});
  if(!SOL) return m;
  var tBeton=textureDe(faireBeton(),1,1), tTerre=textureDe(faireTerre(),1,1);
  m.onBeforeCompile=function(sh){
    sh.uniforms.tMasque={value:SOL.tex};
    sh.uniforms.tBeton={value:tBeton};
    sh.uniforms.tTerre={value:tTerre};
    sh.uniforms.uBornes={value:new THREE.Vector4(XMIN,ZMIN,1/(XMAX-XMIN),1/(ZMAX-ZMIN))};
    sh.vertexShader=sh.vertexShader
      .replace('#include <common>','#include <common>\nvarying vec3 vMonde;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvMonde=(modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader=sh.fragmentShader
      .replace('#include <common>','#include <common>\nvarying vec3 vMonde;\nuniform sampler2D tMasque;\nuniform sampler2D tBeton;\nuniform sampler2D tTerre;\nuniform vec4 uBornes;')
      .replace('#include <map_fragment>',[
        'vec3 cHerbe=texture2D(map,vMapUv).rgb*vColor;',
        'vec2 mu=vec2((vMonde.x-uBornes.x)*uBornes.z,(vMonde.z-uBornes.y)*uBornes.w);',
        'vec3 mq=texture2D(tMasque,mu).rgb;',
        'vec3 cBeton=texture2D(tBeton,vMonde.xz/3.2).rgb*vec3(0.78,0.76,0.72);',
        'vec3 cTerre=texture2D(tTerre,vMonde.xz/3.6).rgb*vec3(0.92,0.86,0.74);',
        'float mMin=smoothstep(0.30,0.70,mq.r);',
        'float mTer=smoothstep(0.20,0.70,mq.b)*(1.0-mMin);',
        'vec3 cSol=mix(cHerbe,cBeton,mMin);',
        'cSol=mix(cSol,cTerre,mTer);',
        'diffuseColor.rgb*=cSol;'
      ].join('\n'))
      .replace('#include <color_fragment>','');
  };
  return m;
}
/* arbres réels : là où la photo montre un couvert arboré */
function semerArbresCanopee(arbres,voies,max){
  if(!SOL) return;
  var W=SOL.W, H=SOL.H, cn=SOL.canopee;
  var sx=(XMAX-XMIN)/W, sz=(ZMAX-ZMIN)/H;
  /* masque des chaussées pour ne pas planter au milieu d'une rue */
  var rc=toile(W,H), rg=rc.getContext('2d');
  rg.strokeStyle='#fff'; rg.lineCap='round'; rg.lineJoin='round';
  for(var i=0;i<voies.length;i++){
    var l=voies[i].split('\t');
    if(l.length<4) continue;
    var p=pointsDe(l[3]);
    rg.lineWidth=Math.max(2,((+l[1])/10+2.5)/sx);
    rg.beginPath();
    for(var q=0;q<p.length;q+=2){
      var cx=(p[q]-XMIN)/sx, cy=(p[q+1]-ZMIN)/sz;
      if(q) rg.lineTo(cx,cy); else rg.moveTo(cx,cy);
    }
    rg.stroke();
  }
  var rd=rg.getImageData(0,0,W,H).data;
  var pas=4, n=0;
  for(var j=pas;j<H-pas;j+=pas){
    for(var k=pas;k<W-pas;k+=pas){
      var tot=0;
      for(var dj=-1;dj<=1;dj++) for(var dk=-1;dk<=1;dk++) tot+=cn[(j+dj)*W+(k+dk)];
      if(tot<6) continue;
      if(rd[(j*W+k)*4]>40) continue;
      var x=XMIN+(k+(alea(k,j)-0.5)*2.4)*sx, z=ZMIN+(j+(alea(j,k)-0.5)*2.4)*sz;
      if(bloquer(x,z) || bloquer(x+2,z) || bloquer(x-2,z) || bloquer(x,z+2) || bloquer(x,z-2)) continue;
      if(TRACE.length && surLeParcours(x,z).ecart<3.2) continue;
      arbres.push([x,z,0]);
      if(++n>=max) return;
    }
  }
}
/* =================================================================
   Seconde passe graphique : relief des surfaces (cartes de normales),
   reflets des vitres, façades plus variées, chaussées usées,
   trottoirs, herbe détaillée, eau animée.
================================================================= */
function carteNormale(src,force){
  var W=src.width, H=src.height, d=src.getContext('2d').getImageData(0,0,W,H).data;
  var h=new Float32Array(W*H), i, x, y;
  for(i=0;i<W*H;i++){ var o=i*4; h[i]=(d[o]*0.299+d[o+1]*0.587+d[o+2]*0.114)/255*(d[o+3]/255); }
  var c=toile(W,H), g=c.getContext('2d'), im=g.createImageData(W,H), q=im.data;
  for(y=0;y<H;y++){
    var ym=(y-1+H)%H, yp=(y+1)%H;
    for(x=0;x<W;x++){
      var xm=(x-1+W)%W, xp=(x+1)%W;
      var dx=h[y*W+xp]-h[y*W+xm], dy=h[yp*W+x]-h[ym*W+x];
      var nx=-dx*force, ny=dy*force, L=Math.sqrt(nx*nx+ny*ny+1);
      var o2=(y*W+x)*4;
      q[o2]=(nx/L*0.5+0.5)*255; q[o2+1]=(ny/L*0.5+0.5)*255; q[o2+2]=(1/L*0.5+0.5)*255; q[o2+3]=255;
    }
  }
  g.putImageData(im,0,0);
  return c;
}
function texNormale(src,force){
  var t=new THREE.CanvasTexture(carteNormale(src,force));
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=8;
  return t;
}
function texRugosite(W,H,rects,fond,vitre){
  var c=toile(W,H), g=c.getContext('2d');
  g.fillStyle='rgb('+fond+','+fond+','+fond+')'; g.fillRect(0,0,W,H);
  g.fillStyle='rgb('+vitre+','+vitre+','+vitre+')';
  (rects||[]).forEach(function(r){ g.fillRect(r[0],r[1],r[2],r[3]); });
  var t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

/* ---------------- façades ---------------- */
MURS=[teinte(0xe2dccf),teinte(0xd9ceb6),teinte(0xebe5d8),teinte(0xd8c9aa),teinte(0xe6d8ca),teinte(0xd5d3cb),teinte(0xe9ddc2),teinte(0xd0c4ae)];
COL.joue=teinte(0x9c998f);
var VOLETS=['#5b7386','#6f7f6a','#7b3a36'];
function fenetre(g,x,y,w,h,volets,garde){
  g.fillStyle='rgba(236,229,215,0.92)'; g.fillRect(x-8,y-12,w+16,8);
  g.fillStyle='rgba(0,0,0,0.14)'; g.fillRect(x-8,y-4,w+16,1.5);
  g.fillStyle='#3b352d'; g.fillRect(x-4,y-3,w+8,h+6);
  var vg=g.createLinearGradient(x,y,x+w,y+h);
  vg.addColorStop(0,'#5d7590'); vg.addColorStop(0.42,'#28384a'); vg.addColorStop(0.55,'#6d86a0'); vg.addColorStop(1,'#1c2734');
  g.fillStyle=vg; g.fillRect(x,y,w,h);
  g.fillStyle='rgba(236,230,220,0.16)'; g.fillRect(x+2,y+2,w*0.22,h-4); g.fillRect(x+w*0.78-2,y+2,w*0.22,h-4);
  g.fillStyle='rgba(0,0,0,0.38)'; g.fillRect(x,y,w,5); g.fillRect(x,y,4,h);
  g.fillStyle='rgba(255,255,255,0.12)';
  g.beginPath(); g.moveTo(x,y+h); g.lineTo(x+w*0.85,y); g.lineTo(x+w,y); g.lineTo(x,y+h*0.5); g.closePath(); g.fill();
  g.strokeStyle='#f1ebdf'; g.lineWidth=2.6; g.strokeRect(x+1,y+1,w-2,h-2);
  g.beginPath(); g.moveTo(x+w/2,y); g.lineTo(x+w/2,y+h);
  g.moveTo(x,y+h*0.36); g.lineTo(x+w,y+h*0.36); g.moveTo(x,y+h*0.68); g.lineTo(x+w,y+h*0.68); g.stroke();
  g.fillStyle='#e0d8c7'; g.fillRect(x-7,y+h+2,w+14,6);
  g.fillStyle='rgba(0,0,0,0.26)'; g.fillRect(x-7,y+h+8,w+14,3);
  if(garde){
    g.strokeStyle='rgba(28,28,30,0.88)'; g.lineWidth=1.6; g.beginPath();
    for(var b=x+3;b<x+w;b+=5){ g.moveTo(b,y+h*0.62); g.lineTo(b,y+h); }
    g.moveTo(x,y+h*0.62); g.lineTo(x+w,y+h*0.62); g.stroke();
  }
  if(volets){ volet(g,x-18,y-1,14,h+2,volets); volet(g,x+w+4,y-1,14,h+2,volets); }
}
function volet(g,x,y,w,h,coul){
  g.fillStyle=coul; g.fillRect(x,y,w,h);
  g.fillStyle='rgba(0,0,0,0.28)'; g.fillRect(x+w-2,y,2,h);
  g.strokeStyle='rgba(0,0,0,0.36)'; g.lineWidth=1.2;
  for(var s=y+3;s<y+h-1;s+=3.5){ g.beginPath(); g.moveTo(x+1,s); g.lineTo(x+w-1,s+1); g.stroke(); }
  g.fillStyle='rgba(255,255,255,0.14)'; g.fillRect(x,y,1.5,h);
  g.fillStyle='rgba(20,20,20,0.6)'; g.fillRect(x+w*0.5-1,y+h*0.25,2,3); g.fillRect(x+w*0.5-1,y+h*0.72,2,3);
}
function famille(f){ return f===true?1:((f===false||f===undefined)?0:f); }
function fondFamille(g,W,H,f){
  if(f===1) fondPierre(g,W,H);
  else { fondEnduit(g,W,H); if(f===2){ g.fillStyle='rgba(212,168,108,0.24)'; g.fillRect(0,0,W,H); } }
  for(var i=0;i<14;i++){
    var x=Math.random()*W, lg=g.createLinearGradient(0,0,0,H);
    lg.addColorStop(0,'rgba(60,55,45,0)'); lg.addColorStop(1,'rgba(60,55,45,0.11)');
    g.fillStyle=lg; g.fillRect(x,H*Math.random()*0.5,3+Math.random()*8,H);
  }
}
function faireEtage(f){
  f=famille(f);
  var W=256, H=205, c=toile(W,H), g=c.getContext('2d');
  fondFamille(g,W,H,f);
  fenetre(g,42,44,54,96,VOLETS[f],f!==0);
  fenetre(g,168,44,54,96,VOLETS[f],f!==0);
  g.fillStyle='rgba(242,236,224,0.72)'; g.fillRect(0,H-12,W,6);
  g.fillStyle='rgba(0,0,0,0.2)'; g.fillRect(0,H-6,W,3);
  return c;
}
function faireRdc(f){
  f=famille(f);
  var W=256, H=205, c=toile(W,H), g=c.getContext('2d');
  fondFamille(g,W,H,f);
  g.fillStyle='#9d9481'; g.fillRect(0,H-34,W,34);
  grainZone(g,0,H-34,W,34,800,0.12);
  for(var x=0;x<W;x+=40){ g.fillStyle='rgba(0,0,0,0.22)'; g.fillRect(x,H-34,1.5,34); }
  g.fillStyle='rgba(0,0,0,0.28)'; g.fillRect(0,H-34,W,2);
  var dx=36, dw=52, dy=H-34-118;
  g.fillStyle='#e6decd'; g.fillRect(dx-9,dy-23,dw+18,151);
  g.fillStyle='#35302a'; g.fillRect(dx-3,dy-17,dw+6,140);
  g.fillStyle='#2b3a49'; g.fillRect(dx,dy-14,dw,12);
  var pg=g.createLinearGradient(dx,dy,dx+dw,dy), cp=['#4d3a2a','#2e4a5c','#5a2d2a'][f];
  pg.addColorStop(0,cp); pg.addColorStop(0.5,'rgba(255,255,255,0.10)'); pg.addColorStop(1,cp);
  g.fillStyle=cp; g.fillRect(dx,dy,dw,118);
  g.fillStyle=pg; g.fillRect(dx,dy,dw,118);
  g.strokeStyle='rgba(0,0,0,0.42)'; g.lineWidth=2;
  g.strokeRect(dx+6,dy+8,dw-12,44); g.strokeRect(dx+6,dy+60,dw-12,48);
  g.strokeStyle='rgba(255,255,255,0.12)'; g.strokeRect(dx+8,dy+10,dw-16,40);
  g.fillStyle='#d8c48a'; g.beginPath(); g.arc(dx+dw-9,dy+64,3,0,7); g.fill();
  fenetre(g,152,H-34-116,64,100,VOLETS[f],false);
  return c;
}

/* ---------------- sols ---------------- */
function faireChaussee(){
  var W=256, H=256, c=toile(W,H), g=c.getContext('2d'), i;
  g.fillStyle='#4a4a4d'; g.fillRect(0,0,W,H);
  grain(g,W,H,16000,0.30,'#8a8a8c','#2a2a2c');
  for(i=0;i<1400;i++){
    g.fillStyle='rgba('+(150+Math.random()*60|0)+','+(145+Math.random()*55|0)+','+(135+Math.random()*50|0)+',0.32)';
    g.fillRect(Math.random()*W,Math.random()*H,1.2,1.2);
  }
  [0.3,0.7].forEach(function(f){
    var y=f*H, lg=g.createLinearGradient(0,y-26,0,y+26);
    lg.addColorStop(0,'rgba(0,0,0,0)'); lg.addColorStop(0.5,'rgba(8,8,10,0.18)'); lg.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=lg; g.fillRect(0,y-26,W,52);
  });
  for(i=0;i<3;i++){
    g.fillStyle='rgba(28,28,31,0.35)';
    g.fillRect(Math.random()*W,30+Math.random()*(H-80),30+Math.random()*50,14+Math.random()*26);
  }
  for(i=0;i<10;i++){
    g.strokeStyle='rgba(22,22,24,0.55)'; g.lineWidth=0.8+Math.random();
    var x=Math.random()*W, y=20+Math.random()*(H-40);
    g.beginPath(); g.moveTo(x,y);
    for(var k=0;k<5;k++){ x+=(Math.random()-0.5)*44; y+=(Math.random()-0.5)*30; g.lineTo(x,y); }
    g.stroke();
  }
  [0,H-15].forEach(function(y0){
    for(var yy=y0;yy<y0+15;yy+=7.5) for(var xx=-6;xx<W;xx+=12){
      var t=Math.random()*30;
      g.fillStyle='rgb('+(100+t|0)+','+(98+t|0)+','+(93+t|0)+')';
      g.fillRect(xx+1+((yy-y0)/7.5%2)*6,yy+1,10,5.5);
    }
    g.fillStyle='rgba(0,0,0,0.35)'; g.fillRect(0,y0===0?15:H-16,W,1.5);
  });
  return c;
}
function faireDalles(){
  var W=256, H=256, c=toile(W,H), g=c.getContext('2d');
  g.fillStyle='#74736d'; g.fillRect(0,0,W,H);
  for(var y=0;y<H;y+=64) for(var x=0;x<W;x+=64){
    var t=Math.random()*26;
    g.fillStyle='rgb('+(170+t|0)+','+(166+t|0)+','+(158+t|0)+')';
    g.fillRect(x+2,y+2,60,60);
    grainZone(g,x+2,y+2,60,60,300,0.10);
    if(Math.random()<0.25){
      g.fillStyle='rgba(60,55,45,0.10)';
      g.beginPath(); g.arc(x+10+Math.random()*44,y+10+Math.random()*44,6+Math.random()*10,0,7); g.fill();
    }
  }
  return c;
}
function faireHerbe(){
  var W=512, H=512, c=toile(W,H), g=c.getContext('2d'), i, k;
  g.fillStyle='#62803e'; g.fillRect(0,0,W,H);
  var taches=['96,122,60','74,100,46','120,138,70','88,110,50','132,130,76'];
  for(i=0;i<80;i++){
    var px=Math.random()*W, py=Math.random()*H, pr=30+Math.random()*90;
    var cl=taches[Math.floor(Math.random()*taches.length)];
    var pg=g.createRadialGradient(px,py,2,px,py,pr);
    pg.addColorStop(0,'rgba('+cl+',0.45)'); pg.addColorStop(1,'rgba('+cl+',0)');
    g.fillStyle=pg; g.fillRect(px-pr,py-pr,pr*2,pr*2);
  }
  var brins=['rgba(70,98,44,0.7)','rgba(104,134,62,0.7)','rgba(140,162,84,0.65)','rgba(52,76,34,0.7)','rgba(168,170,98,0.5)'];
  g.lineWidth=1;
  for(k=0;k<brins.length;k++){
    g.strokeStyle=brins[k]; g.beginPath();
    for(i=0;i<5600;i++){
      var x=Math.random()*W, y=Math.random()*H, l=3+Math.random()*6;
      g.moveTo(x,y); g.lineTo(x+(Math.random()-0.5)*3,y-l);
    }
    g.stroke();
  }
  for(i=0;i<50;i++){
    var cx=Math.random()*W, cy=Math.random()*H;
    g.fillStyle='rgba(66,108,52,0.55)';
    for(k=0;k<6;k++){ g.beginPath(); g.arc(cx+(Math.random()-0.5)*14,cy+(Math.random()-0.5)*14,2.2,0,7); g.fill(); }
  }
  for(i=0;i<40;i++){
    g.fillStyle=Math.random()<0.6?'rgba(245,245,235,0.8)':'rgba(236,208,70,0.8)';
    g.beginPath(); g.arc(Math.random()*W,Math.random()*H,1.1,0,7); g.fill();
  }
  return c;
}
function faireOndes(){
  var W=256, H=256, c=toile(W,H), g=c.getContext('2d');
  g.fillStyle='#808080'; g.fillRect(0,0,W,H);
  for(var i=0;i<260;i++){
    var x=Math.random()*W, y=Math.random()*H, r=5+Math.random()*22, clair=Math.random()<0.5;
    for(var ox=-W;ox<=W;ox+=W) for(var oy=-H;oy<=H;oy+=H){
      var pg=g.createRadialGradient(x+ox,y+oy,1,x+ox,y+oy,r);
      pg.addColorStop(0,clair?'rgba(255,255,255,0.18)':'rgba(0,0,0,0.18)');
      pg.addColorStop(1,'rgba(128,128,128,0)');
      g.fillStyle=pg; g.fillRect(x+ox-r,y+oy-r,r*2,r*2);
    }
  }
  return c;
}

/* ---------------- sol réel : herbe sans répétition visible ---------------- */
function materielSol(){
  var hc=faireHerbe();
  var m=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(hc,1,1), normalMap:texNormale(hc,1.5), roughness:0.97, metalness:0});
  if(!SOL){
    m.onBeforeCompile=function(sh){
      sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vMonde;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvMonde=(modelMatrix*vec4(transformed,1.0)).xyz;');
      sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vMonde;')
        .replace('#include <map_fragment>','vec4 sampledDiffuseColor=texture2D(map,vMapUv);\nsampledDiffuseColor.rgb*=0.80+0.40*texture2D(map,vMonde.xz/47.0).g;\ndiffuseColor*=sampledDiffuseColor;');
    };
    return m;
  }
  var bc=faireBeton(), tc=faireTerre();
  var tBeton=textureDe(bc,1,1), tTerre=textureDe(tc,1,1);
  m.onBeforeCompile=function(sh){
    sh.uniforms.tMasque={value:SOL.tex};
    sh.uniforms.tBeton={value:tBeton};
    sh.uniforms.tTerre={value:tTerre};
    sh.uniforms.uBornes={value:new THREE.Vector4(XMIN,ZMIN,1/(XMAX-XMIN),1/(ZMAX-ZMIN))};
    sh.vertexShader=sh.vertexShader
      .replace('#include <common>','#include <common>\nvarying vec3 vMonde;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvMonde=(modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader=sh.fragmentShader
      .replace('#include <common>','#include <common>\nvarying vec3 vMonde;\nuniform sampler2D tMasque;\nuniform sampler2D tBeton;\nuniform sampler2D tTerre;\nuniform vec4 uBornes;')
      .replace('#include <map_fragment>',[
        'vec3 cHerbe=texture2D(map,vMapUv).rgb*vColor;',
        'cHerbe*=0.80+0.40*texture2D(map,vMonde.xz/47.0).g;',
        'vec2 mu=vec2((vMonde.x-uBornes.x)*uBornes.z,(vMonde.z-uBornes.y)*uBornes.w);',
        'vec3 mq=texture2D(tMasque,mu).rgb;',
        'vec3 cBeton=texture2D(tBeton,vMonde.xz/3.2).rgb*vec3(0.78,0.76,0.72);',
        'cBeton*=0.86+0.24*texture2D(tBeton,vMonde.xz/29.0).r;',
        'vec3 cTerre=texture2D(tTerre,vMonde.xz/3.6).rgb*vec3(0.92,0.86,0.74);',
        'float mMin=smoothstep(0.30,0.70,mq.r);',
        'float mTer=smoothstep(0.20,0.70,mq.b)*(1.0-mMin);',
        'vec3 cSol=mix(cHerbe,cBeton,mMin);',
        'cSol=mix(cSol,cTerre,mTer);',
        'diffuseColor.rgb*=cSol;'
      ].join('\n'))
      .replace('#include <color_fragment>','');
  };
  return m;
}

/* ---------------- voies : trottoirs moins hauts, chemins séparés ---------------- */
function construireVoies(voies,dpres){
  var bit=new Tas(), terre=new Tas(), trot=new Tas(), marq=new Tas();
  var blanc=teinte(0xf2f2ee);
  for(var i=0;i<voies.length;i++){
    var l=voies[i].split('\t');
    if(l.length<4) continue;
    var k=l[0], w=(+l[1])/10, p=pointsDe(l[3]);
    if(k==='r'){
      ruban(bit,p,w,COL.route,0.16,6,7);
      if(w>=5 && pres(p,dpres)){
        bordure(trot,decaler(p, w/2+0.9),1.8,0.28,COL.trottoir,COL.joue);
        bordure(trot,decaler(p,-w/2-0.9),1.8,0.28,COL.trottoir,COL.joue);
        if(w>=6.2) pointilles(marq,p,blanc);
      }
    }
    else if(k==='s') ruban(terre,p,w,COL.sentier,0.15,6,4);
    else if(k==='t') ruban(terre,p,w,COL.piste,0.15,6,4);
    else if(k==='v') ruban(terre,p,w,COL.rail,0.18,6,3);
  }
  return {bit:bit, terre:terre, trot:trot, marq:marq};
}

/* ---------------- ciel en haute définition, étoiles fines ---------------- */
function faireCiel(nuit){
  var W=2048, H=1024, c=toile(W,H), g=c.getContext('2d'), i;
  var grd=g.createLinearGradient(0,0,0,H);
  if(nuit){
    grd.addColorStop(0,'#060e20'); grd.addColorStop(0.34,'#0c1a36');
    grd.addColorStop(0.47,'#1a2a4a'); grd.addColorStop(0.5,'#22324f');
    grd.addColorStop(0.55,'#131c2d'); grd.addColorStop(1,'#0a0f18');
  } else {
    grd.addColorStop(0,'#2f6ec4'); grd.addColorStop(0.26,'#5b96da');
    grd.addColorStop(0.42,'#9cc4e8'); grd.addColorStop(0.49,'#d6e6f2');
    grd.addColorStop(0.5,'#c8d6d2'); grd.addColorStop(0.62,'#8fa07a');
    grd.addColorStop(1,'#6b7a52');
  }
  g.fillStyle=grd; g.fillRect(0,0,W,H);
  if(nuit){
    for(i=0;i<3200;i++){
      var sx=Math.random()*W, sy=Math.random()*H*0.47;
      var fort=Math.random()<0.04;
      g.fillStyle='rgba(255,255,255,'+(fort?0.95:0.25+Math.random()*0.5)+')';
      g.fillRect(sx,sy,fort?1.6:0.9,fort?1.6:0.9);
    }
    var mx=W*0.30, my=H*0.16;
    var lg=g.createRadialGradient(mx,my,4,mx,my,150);
    lg.addColorStop(0,'rgba(240,246,255,0.9)'); lg.addColorStop(0.12,'rgba(210,225,250,0.4)');
    lg.addColorStop(1,'rgba(150,180,230,0)');
    g.fillStyle=lg; g.fillRect(mx-150,my-150,300,300);
    g.fillStyle='#eef3ff'; g.beginPath(); g.arc(mx,my,20,0,7); g.fill();
    g.fillStyle='rgba(180,190,210,0.35)';
    g.beginPath(); g.arc(mx-6,my-4,5,0,7); g.fill(); g.beginPath(); g.arc(mx+7,my+5,3.5,0,7); g.fill();
  } else {
    var ux=W*0.899, uy=H*0.20;
    var sg=g.createRadialGradient(ux,uy,8,ux,uy,380);
    sg.addColorStop(0,'rgba(255,252,235,1)'); sg.addColorStop(0.06,'rgba(255,245,205,0.85)');
    sg.addColorStop(0.24,'rgba(255,238,200,0.28)'); sg.addColorStop(1,'rgba(255,238,200,0)');
    g.fillStyle=sg; g.fillRect(ux-380,uy-380,760,760);
    g.fillStyle='#fffdf2'; g.beginPath(); g.arc(ux,uy,26,0,7); g.fill();
    for(i=0;i<34;i++){
      var cx=Math.random()*W, cy=H*(0.05+Math.random()*0.40);
      var ech=(cy/H)*2.2+0.35;
      var larg=(120+Math.random()*300)*ech, haut=(32+Math.random()*48);
      var op=0.28+Math.random()*0.42;
      for(var k=0;k<22;k++){
        var bx=cx+(Math.random()-0.5)*larg, by=cy+(Math.random()-0.5)*haut;
        var br=(28+Math.random()*60)*(0.6+ech*0.4);
        var cg=g.createRadialGradient(bx,by,2,bx,by,br);
        cg.addColorStop(0,'rgba(255,255,255,'+op+')');
        cg.addColorStop(0.55,'rgba(248,250,253,'+(op*0.5)+')');
        cg.addColorStop(1,'rgba(235,242,250,0)');
        g.fillStyle=cg; g.fillRect(bx-br,by-br,br*2,br*2);
      }
    }
    var hz=g.createLinearGradient(0,H*0.40,0,H*0.53);
    hz.addColorStop(0,'rgba(226,238,247,0)'); hz.addColorStop(0.8,'rgba(226,238,247,0.85)');
    hz.addColorStop(1,'rgba(214,228,240,0.9)');
    g.fillStyle=hz; g.fillRect(0,H*0.40,W,H*0.13);
  }
  return c;
}
/* =================================================================
   Bâtiments
================================================================= */
function hautBat(k,aire,lv,ht,r,milit){
  if(ht>0) return ht;
  if(lv>0) return lv*3.05+1.3;
  if(k==='g') return 2.6+r*0.7;
  if(k==='e') return 13.5;
  if(k==='i') return 7.5+r*1.5;
  if(k==='c') return 6.4+r*1.2;
  if(k==='p') return 9.5+r*2;
  if(k==='a') return 11.5+r*2.5;
  if(milit) return aire>250?(10.4+r*1.6):(6.4+r*1.2);
  if(aire<26) return 2.6+r*0.6;
  if(aire<70) return 4.3+r*1.7;
  if(aire<160) return 6.4+r*1.8;
  if(aire<400) return 7.6+r*2.2;
  if(aire<900) return 8.6+r*2.4;
  return 9.6+r*3;
}
var BAT={};
function construireBatis(bats){
  BAT={ mursE:new Tas(65536), rdcE:new Tas(65536), mursP:new Tas(32768), rdcP:new Tas(32768),
        annexes:new Tas(16384), toits:new Tas(65536), plats:new Tas(16384) };
  var oc=teinte(0xd8c99a), brique=teinte(0xb08a72);
  for(var i=0;i<bats.length;i++){
    var l=bats[i].split('\t');
    if(l.length<11) continue;
    var k=l[0], rect=+l[1], ang=(+l[2])/10*PI/180;
    var cx=(+l[3])/10, cz=(+l[4])/10, ow=(+l[5])/10, ol=(+l[6])/10;
    var aire=+l[7], lv=+l[8], ht=(+l[9])/10;
    var p=pointsDe(l[10]);
    var n=p.length/2, j;
    if(n<3) continue;
    var r=alea(Math.round(cx*3),Math.round(cz*3));
    var r2=alea(Math.round(cz*7),Math.round(cx*7));
    var milit=false, m;
    for(m=0;m<zonesM.length;m++){ if(dansPoly(zonesM[m],cx,cz)){ milit=true; break; } }
    var h=hautBat(k,aire,lv,ht,r,milit);
    var base=1e9;
    for(j=0;j<n;j++){ var hh=hauteur(p[j*2],p[j*2+1]); if(hh<base) base=hh; }
    base-=0.35;
    var top=base+h;
    var petit=(k==='g'||aire<28||h<3.2);
    var pierre=(r2<0.34 && !milit);
    var cm=MURS[Math.floor(r*6)];
    if(milit) cm=melange(cm,oc,0.55);
    if(petit) cm=melange(cm,teinte(0xd8d2c6),0.5);
    var tasBas, tasHaut, coupe=base+3.2;
    if(petit){ tasBas=BAT.annexes; tasHaut=BAT.annexes; coupe=base; }
    else if(pierre){ tasBas=BAT.rdcP; tasHaut=BAT.mursP; }
    else { tasBas=BAT.rdcE; tasHaut=BAT.mursE; }
    if(h<4.3){ coupe=top; }
    /* murs, séparés en rez-de-chaussée et étages */
    for(j=0;j<n;j++){
      var jj=(j+1)%n;
      var x0=p[j*2], z0=p[j*2+1], x1=p[jj*2], z1=p[jj*2+1];
      var dx=x1-x0, dz=z1-z0, L=Math.hypot(dx,dz);
      if(L<0.15) continue;
      var nx=dz/L, nz=-dx/L, u1=L/4;
      var cb=assombrir(cm,0.9);
      if(coupe>base+0.05) pan4(tasBas,x0,z0,x1,z1,base,Math.min(coupe,top),nx,nz,u1,(Math.min(coupe,top)-base)/3.2,0,cb,cm);
      if(top>coupe+0.05) pan4(tasHaut,x0,z0,x1,z1,coupe,top,nx,nz,u1,(top-coupe)/3.2,0,cm,cm);
    }
    /* toiture */
    var ct=TOITS[Math.floor(r2*6)];
    if(milit) ct=melange(ct,teinte(0xc8cdd4),0.5);
    if(rect>=72 && Math.min(ow,ol)>2.4 && k!=='i'){
      toitDeuxPentes(BAT.toits,cx,cz,ang,ow,ol,top,ct,k==='e'?2.4:1,aire,r,brique);
    } else {
      var q=[];
      for(j=0;j<n;j++) q.push(p[j*2],p[j*2+1]);
      polyPlat(BAT.plats,q,top+0.10,melange(ct,teinte(0x8f9298),0.55));
      for(j=0;j<n;j++){
        var j2=(j+1)%n;
        var ax=p[j*2], az=p[j*2+1], bx=p[j2*2], bz=p[j2*2+1];
        var ddx=bx-ax, ddz=bz-az, LL=Math.hypot(ddx,ddz);
        if(LL<0.15) continue;
        pan4(BAT.plats,ax,az,bx,bz,top,top+0.38,ddz/LL,-ddx/LL,LL/2,0.12,0,assombrir(cm,0.92),cm);
      }
    }
    marquerPoly(p);
  }
  return BAT;
}
/* pan de mur vertical entre deux points, avec décalage vertical de l'uv */
function pan4(tas,x0,z0,x1,z1,y0,y1,nx,nz,u1,v1,v0,cbas,chaut){
  tas.tri(x0,y0,z0, x1,y1,z1, x1,y0,z1, nx,0,nz, [0,v0,u1,v0+v1,u1,v0], cbas);
  tas.tri(x0,y0,z0, x0,y1,z0, x1,y1,z1, nx,0,nz, [0,v0,0,v0+v1,u1,v0+v1], chaut);
}
function polyPlat(tas,pts,y,c){
  var n=pts.length/2, ctr=[], i;
  for(i=0;i<n;i++) ctr.push(new THREE.Vector2(pts[i*2],pts[i*2+1]));
  var tris;
  try{ tris=THREE.ShapeUtils.triangulateShape(ctr,[]); }catch(e){ return; }
  for(i=0;i<tris.length;i++){
    var t=tris[i], a=ctr[t[0]], b=ctr[t[1]], d=ctr[t[2]];
    tas.tri(a.x,y,a.y, d.x,y,d.y, b.x,y,b.y, 0,1,0,
            [a.x/3,a.y/3, d.x/3,d.y/3, b.x/3,b.y/3], c);
  }
}
function toitDeuxPentes(tas,cx,cz,ang,w,l,top,c,fpente,aire,r,brique){
  var co=Math.cos(ang), si=Math.sin(ang), ov=0.38;
  var W=w/2+ov, L=l/2+ov;
  var faite=(w>=l);
  var rise=Math.min((faite?L:W)*0.72, 3.4)*(fpente||1);
  function P(u,v,y){ return [cx+u*co-v*si, y, cz+u*si+v*co]; }
  var A,B,C,D,E,F;
  if(faite){
    A=P(-W,-L,top); B=P(W,-L,top); C=P(W,L,top); D=P(-W,L,top);
    E=P(-W,0,top+rise); F=P(W,0,top+rise);
    pan(tas,A,B,F,E,c); pan(tas,C,D,E,F,c);
    pignon(tas,A,E,D,c,cx,cz); pignon(tas,C,F,B,c,cx,cz);
  } else {
    A=P(-W,-L,top); B=P(W,-L,top); C=P(W,L,top); D=P(-W,L,top);
    E=P(0,-L,top+rise); F=P(0,L,top+rise);
    pan(tas,B,C,F,E,c); pan(tas,D,A,E,F,c);
    pignon(tas,A,B,E,c,cx,cz); pignon(tas,C,D,F,c,cx,cz);
  }
  /* faîtière */
  var cf=assombrir(c,0.88);
  tube(tas,E[0],E[1]+0.06,E[2],F[0],F[1]+0.06,F[2],0.13,0.13,5,cf,false,false);
  /* souche de cheminée */
  if(aire>55 && r<0.72){
    var t=(r<0.36?-0.3:0.3);
    var mx=E[0]+(F[0]-E[0])*(0.5+t), mz=E[2]+(F[2]-E[2])*(0.5+t);
    var s=0.32+r*0.14, hc=top+rise+0.55+r*0.7;
    boiteQuad(tas,[mx-s,mz-s],[mx+s,mz-s],[mx+s,mz+s],[mx-s,mz+s],top+rise-0.9,hc,brique,assombrir(brique,0.7),1.2);
    var s2=s+0.09;
    boiteQuad(tas,[mx-s2,mz-s2],[mx+s2,mz-s2],[mx+s2,mz+s2],[mx-s2,mz+s2],hc,hc+0.12,assombrir(brique,0.8),assombrir(brique,0.6),1.2);
  }
}
function pan(tas,a,b,c,d,col){
  var nn=nrm(a,b,c);
  if(nn[1]<0){ var t=b; b=d; d=t; nn=nrm(a,b,c); }
  var w=Math.hypot(b[0]-a[0],b[2]-a[2]), h=Math.hypot(c[0]-b[0],c[1]-b[1],c[2]-b[2]);
  tas.tri(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2], nn[0],nn[1],nn[2], [0,0,w/1.28,0,w/1.28,h/1.28], col);
  tas.tri(a[0],a[1],a[2], c[0],c[1],c[2], d[0],d[1],d[2], nn[0],nn[1],nn[2], [0,0,w/1.28,h/1.28,0,h/1.28], col);
}
function pignon(tas,a,b,c,col,cx,cz){
  var nn=nrm(a,b,c);
  var mx=(a[0]+b[0]+c[0])/3-cx, mz=(a[2]+b[2]+c[2])/3-cz;
  if(nn[0]*mx+nn[2]*mz<0){ var t=b; b=c; c=t; nn=nrm(a,b,c); }
  tas.tri(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2], nn[0],nn[1],nn[2], [0,0,0.5,1,1,0], col);
}

/* =================================================================
   Végétation : troncs en volume, feuillage en panneaux croisés
================================================================= */
function semerArbresLigne(pts,arbres,pas,type){
  var n=pts.length/2;
  for(var i=1;i<n;i++){
    var x0=pts[(i-1)*2], z0=pts[(i-1)*2+1], x1=pts[i*2], z1=pts[i*2+1];
    var L=Math.hypot(x1-x0,z1-z0);
    var m=Math.max(1,Math.round(L/pas));
    for(var s=0;s<m;s++){
      var t=(s+0.5)/m;
      arbres.push([x0+(x1-x0)*t, z0+(z1-z0)*t, type||0]);
    }
  }
}
function semerArbresZone(pts,arbres,dens,max,type){
  var n=pts.length/2, x0=1e9,x1=-1e9,z0=1e9,z1=-1e9, i;
  for(i=0;i<n;i++){
    var x=pts[i*2], z=pts[i*2+1];
    if(x<x0)x0=x; if(x>x1)x1=x; if(z<z0)z0=z; if(z>z1)z1=z;
  }
  var pas=Math.sqrt(dens), c=0;
  for(var zz=z0;zz<z1;zz+=pas){
    for(var xx=x0;xx<x1;xx+=pas){
      var jx=xx+(alea(Math.round(xx),Math.round(zz))-0.5)*pas*0.95;
      var jz=zz+(alea(Math.round(zz),Math.round(xx))-0.5)*pas*0.95;
      if(!dansPoly(pts,jx,jz)) continue;
      arbres.push([jx,jz,type||0]);
      if(++c>max) return;
    }
  }
}
/* un panneau de feuillage, normales bombées pour éviter les faces noires */
function panneau(tas,cx,cy,cz,ang,larg,haut,u0,u1,col){
  var co=Math.cos(ang)*larg/2, si=Math.sin(ang)*larg/2;
  var A=[cx-co, cy-haut/2, cz-si], B=[cx+co, cy-haut/2, cz+si];
  var C=[cx+co, cy+haut/2, cz+si], D=[cx-co, cy+haut/2, cz-si];
  function N(p,k){
    var vx=(p[0]-cx)/(larg/2), vy=k, vz=(p[2]-cz)/(larg/2);
    var L=Math.hypot(vx,vy,vz)||1;
    return [vx/L,vy/L,vz/L];
  }
  var na=N(A,-0.2), nb=N(B,-0.2), nc=N(C,1.1), nd=N(D,1.1);
  tas.triN(A,B,C, na,nb,nc, [u0,0,u1,0,u1,1], col);
  tas.triN(A,C,D, na,nc,nd, [u0,0,u1,1,u0,1], col);
  tas.triN(B,A,C, nb,na,nc, [u1,0,u0,0,u0,1], col);
  tas.triN(A,D,C, na,nd,nc, [u0,0,u0,1,u1,1], col);
}
function construireArbres(liste){
  var feu=new Tas(32768), tronc=new Tas(16384);
  var bois=teinte(0xffffff);
  for(var i=0;i<liste.length;i++){
    var x=liste[i][0], z=liste[i][1], type=liste[i][2]|0;
    var r=alea(Math.round(x*7),Math.round(z*7));
    var r2=alea(Math.round(z*11),Math.round(x*11));
    var y=hauteur(x,z)-0.15;
    var conif=(type===0 && r2>0.76);
    var u0=conif?0.5:0, u1=conif?1:0.5;
    var teintes=[teinte(0xdcefc8),teinte(0xc8e0a8),teinte(0xe8f0d0),teinte(0xb8d49a),teinte(0xd0e4b4)];
    var col=teintes[Math.floor(r*5)];
    if(conif) col=melange(col,teinte(0x9ec090),0.6);
    if(type===2){
      /* buisson de haie */
      var hb=1.2+r*0.7, rb=0.75+r*0.45;
      panneau(feu,x,y+hb*0.5,z,r2*3.1,rb*2,hb,u0,u1,melange(col,teinte(0xb0d090),0.4));
      panneau(feu,x,y+hb*0.5,z,r2*3.1+1.05,rb*2,hb,u0,u1,melange(col,teinte(0xb0d090),0.4));
      continue;
    }
    var h=conif?(9+r*7):(6.5+r*7);
    var ray=conif?(1.7+r*1.0):(2.6+r*2.2);
    var htronc=conif?h*0.16:h*0.36;
    var rt=0.13+r*0.13;
    tube(tronc,x,y,z, x+(r-0.5)*0.3, y+htronc*1.25, z+(r2-0.5)*0.3, rt*1.35, rt*0.8, 6, bois, false, false);
    var cy=y+htronc+ (conif? h*0.42 : h*0.30);
    var hf=conif? h*0.86 : h*0.72;
    var a0=r2*3.14;
    panneau(feu,x,cy,z,a0,        ray*2,hf,u0,u1,col);
    panneau(feu,x,cy,z,a0+1.047,  ray*2,hf,u0,u1,assombrir(col,0.93));
    panneau(feu,x,cy,z,a0+2.094,  ray*2,hf,u0,u1,assombrir(col,0.87));
    if(!conif) panneau(feu,x,cy+hf*0.22,z,a0+0.5, ray*1.5,hf*0.7,u0,u1,melange(col,teinte(0xffffff),0.12));
  }
  return {feu:feu, tronc:tronc};
}

/* =================================================================
   Le parcours
================================================================= */
var TRACE=[], CUMUL=[], LONGUEUR=0;
function chargerTrace(txt){
  var l=txt.split('\n'), i;
  for(i=0;i<l.length;i++){
    var c=l[i].split(',');
    if(c.length<3) continue;
    TRACE.push([(+c[0])/10,(+c[1])/10,(+c[2])/10]);
  }
  CUMUL.push(0);
  for(i=1;i<TRACE.length;i++){
    CUMUL.push(CUMUL[i-1]+Math.hypot(TRACE[i][0]-TRACE[i-1][0],TRACE[i][1]-TRACE[i-1][1]));
  }
  LONGUEUR=CUMUL[CUMUL.length-1];
}
function construireParcours(){
  var plat=[], i;
  for(i=0;i<TRACE.length;i++) plat.push(TRACE[i][0],TRACE[i][1]);
  var tas=new Tas(16384);
  ruban(tas,plat,2.4,COL.trace,0.21,5,4);
  MAT.trace=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.72, metalness:0,
        emissive:0x3a2a06, transparent:true, opacity:0.94,
        polygonOffset:true, polygonOffsetFactor:-6, polygonOffsetUnits:-6});
  var mesh=new THREE.Mesh(tas.geo(),MAT.trace);
  mesh.renderOrder=3;
  mesh.receiveShadow=true;
  monde.add(mesh);
  /* chevrons de sens */
  var ch=new Tas(8192), noir=teinte(0x30240f);
  var d=0;
  while(d<LONGUEUR-6){
    var pt=pointSur(d), dir=capSur(d);
    var cx=Math.cos(dir), sz=Math.sin(dir);
    var ax=pt[0]+cx*1.4, az=pt[1]+sz*1.4;
    var b1x=pt[0]-cx*0.7-sz*0.85, b1z=pt[1]-sz*0.7+cx*0.85;
    var b2x=pt[0]-cx*0.7+sz*0.85, b2z=pt[1]-sz*0.7-cx*0.85;
    ch.tri(ax,hauteur(ax,az)+0.29,az, b2x,hauteur(b2x,b2z)+0.29,b2z, b1x,hauteur(b1x,b1z)+0.29,b1z,
           0,1,0,[0,0,1,0,0.5,1],noir);
    d+=14;
  }
  MAT.chevron=new THREE.MeshBasicMaterial({vertexColors:true, transparent:true, opacity:0.8,
        polygonOffset:true, polygonOffsetFactor:-9, polygonOffsetUnits:-9});
  var mch=new THREE.Mesh(ch.geo(),MAT.chevron);
  mch.renderOrder=4;
  monde.add(mch);
}
function pointSur(d){
  if(d<=0) return [TRACE[0][0],TRACE[0][1]];
  if(d>=LONGUEUR) return [TRACE[TRACE.length-1][0],TRACE[TRACE.length-1][1]];
  var a=0, b=CUMUL.length-1;
  while(b-a>1){ var m=(a+b)>>1; if(CUMUL[m]<=d) a=m; else b=m; }
  var t=(d-CUMUL[a])/((CUMUL[b]-CUMUL[a])||1);
  return [TRACE[a][0]+(TRACE[b][0]-TRACE[a][0])*t, TRACE[a][1]+(TRACE[b][1]-TRACE[a][1])*t];
}
function capSur(d){
  var p0=pointSur(Math.max(0,d-3)), p1=pointSur(Math.min(LONGUEUR,d+3));
  return Math.atan2(p1[1]-p0[1], p1[0]-p0[0]);
}
function surLeParcours(x,z){
  var best=1e18, bd=0;
  for(var i=1;i<TRACE.length;i++){
    var ax=TRACE[i-1][0], az=TRACE[i-1][1], bx=TRACE[i][0], bz=TRACE[i][1];
    var dx=bx-ax, dz=bz-az, L2=dx*dx+dz*dz;
    var t=L2>0?((x-ax)*dx+(z-az)*dz)/L2:0;
    if(t<0)t=0; else if(t>1)t=1;
    var qx=ax+t*dx, qz=az+t*dz;
    var dd=(x-qx)*(x-qx)+(z-qz)*(z-qz);
    if(dd<best){ best=dd; bd=CUMUL[i-1]+t*Math.hypot(dx,dz); }
  }
  return {d:bd, ecart:Math.sqrt(best)};
}
/* =================================================================
   Bâtiments selon leur fonction
   M mairie, E église, S école, G gymnase, H monument, P service public,
   C commerce, I industrie
================================================================= */
var TYPES_P=[], TYPES_A=[];
var PRIO={M:8,E:7,S:6,G:5,H:4,P:3,C:2,I:1};
function indexerTypes(){
  TYPES_P=[]; TYPES_A=[];
  var l=lignes(texteBrut('d-types'));
  for(var i=0;i<l.length;i++){
    var c=l[i].split('\t');
    if(c.length<3) continue;
    if(c[1]==='p'){
      var q=c[2].split(',');
      TYPES_P.push({c:c[0], x:(+q[0])/10, z:(+q[1])/10});
    } else {
      var p=pointsDe(c[2]), x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
      for(var k=0;k<p.length;k+=2){ if(p[k]<x0)x0=p[k]; if(p[k]>x1)x1=p[k]; if(p[k+1]<z0)z0=p[k+1]; if(p[k+1]>z1)z1=p[k+1]; }
      TYPES_A.push({c:c[0], p:p, x0:x0, x1:x1, z0:z0, z1:z1});
    }
  }
}
function typeDe(p,cx,cz,aire,x0,x1,z0,z1){
  var best='', bp=0, i, t;
  for(i=0;i<TYPES_P.length;i++){
    t=TYPES_P[i];
    if(t.x<x0-1||t.x>x1+1||t.z<z0-1||t.z>z1+1) continue;
    if(PRIO[t.c]>bp && dansPoly(p,t.x,t.z)){ best=t.c; bp=PRIO[t.c]; }
  }
  if(aire>=45){
    for(i=0;i<TYPES_A.length;i++){
      t=TYPES_A[i];
      if(cx<t.x0||cx>t.x1||cz<t.z0||cz>t.z1) continue;
      if(t.c==='S' && aire<90) continue;
      if(PRIO[t.c]>bp && dansPoly(t.p,cx,cz)){ best=t.c; bp=PRIO[t.c]; }
    }
  }
  return best;
}
function hautBat(k,aire,lv,ht,r,milit,type){
  if(ht>0) return ht;
  if(lv>0) return lv*3.05+1.3;
  if(type==='E') return Math.max(12, Math.min(20, 9+Math.sqrt(aire)*0.35));
  if(type==='M') return 12.5;
  if(type==='S') return aire>600 ? 10.5 : 7.4;
  if(type==='G') return 9.5;
  if(type==='I' || k==='i') return 7.5+r*1.5;
  if(k==='g') return 2.6+r*0.7;
  if(k==='c') return 6.4+r*1.2;
  if(k==='p') return 9.5+r*2;
  if(k==='a') return 11.5+r*2.5;
  if(milit) return aire>250?(10.4+r*1.6):(6.4+r*1.2);
  if(aire<26) return 2.6+r*0.6;
  if(aire<70) return 4.3+r*1.7;
  if(aire<160) return 6.4+r*1.8;
  if(aire<400) return 7.6+r*2.2;
  if(aire<900) return 8.6+r*2.4;
  return 9.6+r*3;
}
var BAT=null, NB_TYPES={};
function construireBatis(bats){
  indexerTypes();
  NB_TYPES={};
  BAT={ mursE:new Tas(65536), rdcE:new Tas(65536), mursP:new Tas(32768), rdcP:new Tas(32768),
        rdcC:new Tas(8192), mursS:new Tas(16384), mursEg:new Tas(8192), mursI:new Tas(16384),
        annexes:new Tas(16384), toits:new Tas(65536), toitsA:new Tas(16384), toitsM:new Tas(8192),
        plats:new Tas(16384), deco:new Tas(4096) };
  var oc=teinte(0xd8c99a), brique=teinte(0xb08a72), gris=teinte(0xe6e8ea);
  for(var i=0;i<bats.length;i++){
    var l=bats[i].split('\t');
    if(l.length<11) continue;
    var k=l[0], rect=+l[1], ang=(+l[2])/10*PI/180;
    var cx=(+l[3])/10, cz=(+l[4])/10, ow=(+l[5])/10, ol=(+l[6])/10;
    var aire=+l[7], lv=+l[8], ht=(+l[9])/10;
    var p=pointsDe(l[10]);
    var n=p.length/2, j;
    if(n<3) continue;
    var x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
    for(j=0;j<n;j++){ var px_=p[j*2], pz_=p[j*2+1]; if(px_<x0)x0=px_; if(px_>x1)x1=px_; if(pz_<z0)z0=pz_; if(pz_>z1)z1=pz_; }
    var r=alea(Math.round(cx*3),Math.round(cz*3));
    var r2=alea(Math.round(cz*7),Math.round(cx*7));
    var milit=false, m;
    for(m=0;m<zonesM.length;m++){ if(dansPoly(zonesM[m],cx,cz)){ milit=true; break; } }
    var type=(k==='e')?'E':typeDe(p,cx,cz,aire,x0,x1,z0,z1);
    if(!type && (k==='i')) type='I';
    if(type) NB_TYPES[type]=(NB_TYPES[type]||0)+1;
    /* Ce que les photos disent de ce bâtiment précis. À lire ici, avant la
       hauteur : je l'avais placé plus bas, après, et « rel » valait donc
       undefined au moment du remplacement de hauteur. Sans erreur visible :
       la famille de façade changeait bien, mais pas la hauteur, et le toit
       restait perché là où la hauteur devinée l'avait mis — d'où des
       toitures flottant au-dessus des commerces bas. */
    if(repriseParMonument(cx,cz)) continue;
    var rel=releveProche(cx,cz);
    var h=hautBat(k,aire,lv,ht,r,milit,type);
    /* niveaux comptés sur la photo : la 3D faisait trois étages là où
       l'avenue n'a qu'un commerce d'un seul niveau très haut */
    if(rel && rel.niv){
      h=(rel.fam===6) ? 4.9 : (rel.niv*3.15+1.1);
    }
    var base=1e9;
    for(j=0;j<n;j++){ var hh=hauteur(p[j*2],p[j*2+1]); if(hh<base) base=hh; }
    base-=0.35;
    var top=base+h;
    var petit=(k==='g'||aire<28||h<3.2) && !type;
    var pierre=(r2<0.34 && !milit) || type==='M' || type==='H' || type==='P';
    var cm=MURS[Math.floor(r*6)];
    if(milit) cm=melange(cm,oc,0.55);
    if(petit) cm=melange(cm,teinte(0xd8d2c6),0.5);

    /* style des murs */
    var tasBas, tasHaut, coupe=base+3.2, pleineHauteur=false;
    if(petit){ tasBas=tasHaut=BAT.annexes; coupe=base; }
    else if(type==='E'){ tasBas=tasHaut=BAT.mursEg; pleineHauteur=true; cm=melange(cm,teinte(0xe9e2d0),0.6); }
    else if(type==='S'){ tasBas=tasHaut=BAT.mursS; coupe=base; }
    else if(type==='G'||type==='I'){ tasBas=tasHaut=BAT.mursI; coupe=base; cm=melange(gris,cm,0.25); }
    else if(type==='C'){ tasBas=BAT.rdcC; tasHaut=pierre?BAT.mursP:BAT.mursE; }
    else if(pierre){ tasBas=BAT.rdcP; tasHaut=BAT.mursP; }
    else { tasBas=BAT.rdcE; tasHaut=BAT.mursE; }
    if(h<4.3 && !pleineHauteur) coupe=top;

    for(j=0;j<n;j++){
      var jj=(j+1)%n;
      var ax=p[j*2], az=p[j*2+1], bx=p[jj*2], bz=p[jj*2+1];
      var dx=bx-ax, dz=bz-az, L=Math.hypot(dx,dz);
      if(L<0.15) continue;
      var nx=dz/L, nz=-dx/L, u1=L/4;
      var cb=assombrir(cm,0.9);
      if(pleineHauteur){ pan4(tasHaut,ax,az,bx,bz,base,top,nx,nz,u1,1,0,cb,cm); continue; }
      if(coupe>base+0.05) pan4(tasBas,ax,az,bx,bz,base,Math.min(coupe,top),nx,nz,u1,(Math.min(coupe,top)-base)/3.2,0,cb,cm);
      if(top>coupe+0.05) pan4(tasHaut,ax,az,bx,bz,coupe,top,nx,nz,u1,(top-coupe)/3.2,0,cm,cm);
    }

    /* toiture */
    var ct=TOITS[Math.floor(r2*6)];
    var ardoise = type==='E'||type==='M'||type==='P'||type==='H'||(milit && aire>250);
    var cta = melange(teinte(0xffffff),teinte(0xd6dbe2),r2);
    if(milit && !ardoise) ct=melange(ct,teinte(0xc8cdd4),0.5);
    var riseMairie=0;
    if(type==='G'||type==='I'){
      if(rect>=70 && Math.min(ow,ol)>6) toitDeuxPentes(BAT.toitsM,cx,cz,ang,ow,ol,top,gris,0.32,0,1,brique);
      else toitPlat(BAT.plats,p,top,cm,ct);
    }
    else if(type==='M' && rect>=65){ riseMairie=toitCroupe(BAT.toitsA,cx,cz,ang,ow,ol,top,cta,4.2); }
    else if(rect>=72 && Math.min(ow,ol)>2.4 && k!=='i'){
      if(ardoise) toitDeuxPentes(BAT.toitsA,cx,cz,ang,ow,ol,top,cta,type==='E'?2.1:1.25,aire,r,brique);
      else toitDeuxPentes(BAT.toits,cx,cz,ang,ow,ol,top,ct,1,aire,r,brique);
    } else {
      toitPlat(BAT.plats,p,top,cm,ct);
    }
    if(type==='E' && aire>120) clocher(cx,cz,ang,ow,ol,base,top,cm,cta);
    if(type==='M') drapeau(cx,cz,ang,top+(riseMairie||0.4));
    marquerPoly(p);
  }
  return BAT;
}
function toitPlat(tas,p,top,cm,ct){
  FAITE_TOIT=top+0.10;
  var n=p.length/2, q=[], j;
  for(j=0;j<n;j++) q.push(p[j*2],p[j*2+1]);
  polyPlat(tas,q,top+0.10,melange(ct,teinte(0x8f9298),0.55));
  for(j=0;j<n;j++){
    var j2=(j+1)%n;
    var ax=p[j*2], az=p[j*2+1], bx=p[j2*2], bz=p[j2*2+1];
    var ddx=bx-ax, ddz=bz-az, LL=Math.hypot(ddx,ddz);
    if(LL<0.15) continue;
    pan4(tas,ax,az,bx,bz,top,top+0.38,ddz/LL,-ddx/LL,LL/2,0.12,0,assombrir(cm,0.92),cm);
  }
}
/* triangle de toiture dont la normale est forcée vers le ciel */
function triHaut(tas,a,b,c,col){
  var nn=nrm(a,b,c);
  if(nn[1]<0){ var t=b; b=c; c=t; nn=nrm(a,b,c); }
  var w=Math.hypot(b[0]-a[0],b[2]-a[2])/1.28, h=Math.hypot(c[0]-a[0],c[1]-a[1],c[2]-a[2])/1.28;
  tas.tri(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2], nn[0],nn[1],nn[2], [0,0,w,0,w*0.5,h], col);
}
/* toit à croupes : quatre versants, faîtage raccourci */
function toitCroupe(tas,cx,cz,ang,w,l,top,c,riseMax){
  if(l>w){ var t=w; w=l; l=t; ang+=PI/2; }
  var co=Math.cos(ang), si=Math.sin(ang), ov=0.4;
  var W=w/2+ov, L=l/2+ov;
  var rise=Math.min(L*0.85, riseMax);
  var f=Math.max(0, W-L*0.95);
  function P(u,v,y){ return [cx+u*co-v*si, y, cz+u*si+v*co]; }
  var A=P(-W,-L,top), B=P(W,-L,top), C=P(W,L,top), D=P(-W,L,top);
  var E=P(-f,0,top+rise), F=P(f,0,top+rise);
  pan(tas,A,B,F,E,c); pan(tas,C,D,E,F,c);
  triHaut(tas,B,C,F,c); triHaut(tas,D,A,E,c);
  tube(tas,E[0],E[1]+0.05,E[2],F[0],F[1]+0.05,F[2],0.12,0.12,5,assombrir(c,0.85),false,false);
  return rise;
}
/* clocher carré surmonté d'une flèche d'ardoise */
function clocher(cx,cz,ang,ow,ol,base,top,cm,cta){
  var co=Math.cos(ang), si=Math.sin(ang);
  var longU=(ow>=ol), Lg=longU?ow:ol, Wd=longU?ol:ow;
  var s=Math.max(4.4,Math.min(8.5,Wd*0.55))/2;
  var off=Lg/2-s*1.02;
  var u=longU?off:0, v=longU?0:off;
  var tx=cx+u*co-v*si, tz=cz+u*si+v*co;
  function P(a,b){ return [tx+a*co-b*si, tz+a*si+b*co]; }
  var hT=top+Math.max(7,(top-base)*0.75);
  var pts=[P(-s,-s),P(s,-s),P(s,s),P(-s,s)], i;
  for(i=0;i<4;i++){
    var a=pts[i], b=pts[(i+1)%4];
    var dx=b[0]-a[0], dz=b[1]-a[1], L=Math.hypot(dx,dz);
    pan4(BAT.mursEg,a[0],a[1],b[0],b[1],base,hT,dz/L,-dx/L,L/4,1,0,assombrir(cm,0.92),cm);
  }
  /* corniche */
  var s2=s*1.12, cor=[P(-s2,-s2),P(s2,-s2),P(s2,s2),P(-s2,s2)];
  boiteQuad(BAT.deco,cor[0],cor[1],cor[2],cor[3],hT-0.1,hT+0.45,teinte(0xcfc6b2),teinte(0xcfc6b2),2);
  /* flèche */
  var hF=s*4.4, som=[tx,hT+0.45+hF,tz];
  var bas=[[cor[0][0],hT+0.45,cor[0][1]],[cor[1][0],hT+0.45,cor[1][1]],[cor[2][0],hT+0.45,cor[2][1]],[cor[3][0],hT+0.45,cor[3][1]]];
  for(i=0;i<4;i++){
    var A=bas[i], B=bas[(i+1)%4];
    var nn=nrm(A,B,som);
    var mx=(A[0]+B[0])/2-tx, mz=(A[2]+B[2])/2-tz;
    if(nn[0]*mx+nn[2]*mz<0){ var T=A; A=B; B=T; nn=nrm(A,B,som); }
    var w=Math.hypot(B[0]-A[0],B[2]-A[2])/1.28, hh=Math.hypot(som[0]-A[0],som[1]-A[1],som[2]-A[2])/1.28;
    BAT.toitsA.tri(A[0],A[1],A[2], B[0],B[1],B[2], som[0],som[1],som[2], nn[0],nn[1],nn[2], [0,0,w,0,w*0.5,hh], cta);
  }
  /* croix */
  var or=teinte(0x5a5f66);
  tube(BAT.deco,tx,som[1]-0.2,tz, tx,som[1]+1.6,tz, 0.05,0.05,5,or,false,true);
  var ux=co*0.45, uz=si*0.45;
  tube(BAT.deco,tx-ux,som[1]+1.1,tz-uz, tx+ux,som[1]+1.1,tz+uz, 0.045,0.045,5,or,true,true);
}
/* drapeau tricolore au faîte de la mairie */
function drapeau(cx,cz,ang,y){
  var mat=teinte(0xd8dade);
  tube(BAT.deco,cx,y-0.3,cz, cx,y+4.2,cz, 0.045,0.035,6,mat,false,true);
  var co=Math.cos(ang), si=Math.sin(ang);
  var bands=[teinte(0x1f3e8c),teinte(0xf2f2f2),teinte(0xd7263d)];
  for(var b=0;b<3;b++){
    var a0=0.06+b*0.42, a1=a0+0.42;
    var P0=[cx+co*a0, y+3.1, cz+si*a0], P1=[cx+co*a1, y+3.15, cz+si*a1];
    var Q1=[cx+co*a1, y+4.1, cz+si*a1], Q0=[cx+co*a0, y+4.1, cz+si*a0];
    var nn=nrm(P0,P1,Q1);
    BAT.deco.tri(P0[0],P0[1],P0[2],P1[0],P1[1],P1[2],Q1[0],Q1[1],Q1[2],nn[0],nn[1],nn[2],[0,0,1,0,1,1],bands[b]);
    BAT.deco.tri(P0[0],P0[1],P0[2],Q1[0],Q1[1],Q1[2],Q0[0],Q0[1],Q0[2],nn[0],nn[1],nn[2],[0,0,1,1,0,1],bands[b]);
    BAT.deco.tri(P0[0],P0[1],P0[2],Q1[0],Q1[1],Q1[2],P1[0],P1[1],P1[2],-nn[0],-nn[1],-nn[2],[0,0,1,1,1,0],bands[b]);
    BAT.deco.tri(P0[0],P0[1],P0[2],Q0[0],Q0[1],Q0[2],Q1[0],Q1[1],Q1[2],-nn[0],-nn[1],-nn[2],[0,0,0,1,1,1],bands[b]);
  }
}

/* =================================================================
   Le parcours, lu en direct dans la carte.
   Les portions parcourues deux fois sont écartées : chaque passage
   roule à droite de son sens de marche, comme sur la carte.
================================================================= */
var TRACE=[], CUMUL=[], LONGUEUR=0, groupeParcours=null;
var DECALAGE=1.35;
function chargerTraceCarte(){
  var t=CARTE.traceDense(), raw=[], i;
  for(i=0;i<t.length;i++){
    var x=pX(t[i].lo), z=pZ(t[i].la);
    var m=raw.length;
    if(m && Math.hypot(x-raw[m-2],z-raw[m-1])<0.3) continue;
    raw.push(x,z);
  }
  if(raw.length<4){ TRACE=[]; CUMUL=[0]; LONGUEUR=0; return; }
  var q=densifier(raw,4), X_=q.x, Z_=q.z, n=X_.length;
  var cm=new Float64Array(n);
  for(i=1;i<n;i++) cm[i]=cm[i-1]+Math.hypot(X_[i]-X_[i-1],Z_[i]-Z_[i-1]);
  /* repérage des tronçons empruntés deux fois */
  var ns=n-1, flag=new Float32Array(ns), CELL=8, grille={};
  function cle(a,b){ return a+'_'+b; }
  for(i=0;i<ns;i++){
    var mx=(X_[i]+X_[i+1])/2, mz=(Z_[i]+Z_[i+1])/2;
    var kk=cle(Math.floor(mx/CELL),Math.floor(mz/CELL));
    (grille[kk]||(grille[kk]=[])).push(i);
  }
  for(i=0;i<ns;i++){
    var ax=X_[i], az=Z_[i], bx=X_[i+1], bz=Z_[i+1];
    var dx=bx-ax, dz=bz-az, L=Math.hypot(dx,dz)||1; dx/=L; dz/=L;
    var mx2=(ax+bx)/2, mz2=(az+bz)/2, cmi=(cm[i]+cm[i+1])/2;
    var gx=Math.floor(mx2/CELL), gz=Math.floor(mz2/CELL), trouve=false;
    for(var a=-1;a<=1 && !trouve;a++) for(var b=-1;b<=1 && !trouve;b++){
      var lst=grille[cle(gx+a,gz+b)];
      if(!lst) continue;
      for(var s=0;s<lst.length;s++){
        var j=lst[s];
        if(Math.abs((cm[j]+cm[j+1])/2-cmi)<35) continue;
        var ex=X_[j+1]-X_[j], ez=Z_[j+1]-Z_[j], El=Math.hypot(ex,ez)||1;
        if(Math.abs((ex*dx+ez*dz)/El)<0.72) continue;
        var tt=((mx2-X_[j])*ex+(mz2-Z_[j])*ez)/(El*El);
        if(tt<-0.2||tt>1.2) continue;
        tt=Math.max(0,Math.min(1,tt));
        var qx=X_[j]+ex*tt, qz=Z_[j]+ez*tt;
        if(Math.hypot(mx2-qx,mz2-qz)<3.4){ trouve=true; break; }
      }
    }
    flag[i]=trouve?1:0;
  }
  var f=new Float32Array(n);
  for(i=0;i<n;i++) f[i]=Math.max(i>0?flag[i-1]:0, i<ns?flag[i]:0);
  for(var passe=0;passe<4;passe++){
    var g=new Float32Array(n);
    for(i=0;i<n;i++) g[i]=0.25*f[Math.max(0,i-1)]+0.5*f[i]+0.25*f[Math.min(n-1,i+1)];
    f=g;
  }
  TRACE=[];
  for(i=0;i<n;i++){
    var i0=Math.max(0,i-1), i1=Math.min(n-1,i+1);
    var ddx=X_[i1]-X_[i0], ddz=Z_[i1]-Z_[i0], LL=Math.hypot(ddx,ddz)||1;
    var o=Math.min(1,f[i]*1.25)*DECALAGE;
    TRACE.push([X_[i]-ddz/LL*o, Z_[i]+ddx/LL*o]);
  }
  CUMUL=[0];
  for(i=1;i<TRACE.length;i++) CUMUL.push(CUMUL[i-1]+Math.hypot(TRACE[i][0]-TRACE[i-1][0],TRACE[i][1]-TRACE[i-1][1]));
  LONGUEUR=CUMUL[CUMUL.length-1];
}
function liberer(o){
  o.traverse(function(x){
    if(x.geometry) x.geometry.dispose();
    if(x.isSprite && x.material){ if(x.material.map) x.material.map.dispose(); x.material.dispose(); }
  });
}
function reconstruireParcours(){
  if(groupeParcours){ monde.remove(groupeParcours); liberer(groupeParcours); groupeParcours=null; }
  if(TRACE.length<2) return;
  groupeParcours=new THREE.Group();
  var plat=[], i;
  for(i=0;i<TRACE.length;i++) plat.push(TRACE[i][0],TRACE[i][1]);
  var tas=new Tas(16384);
  ruban(tas,plat,2.2,COL.trace,0.21,4,4);
  if(!MAT.trace) MAT.trace=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.72, metalness:0,
        emissive:0x3a2a06, transparent:true, opacity:0.94,
        polygonOffset:true, polygonOffsetFactor:-6, polygonOffsetUnits:-6});
  var mesh=new THREE.Mesh(tas.geo(),MAT.trace);
  mesh.renderOrder=3; mesh.receiveShadow=true;
  groupeParcours.add(mesh);
  var ch=new Tas(8192), noir=teinte(0x30240f), d=0;
  while(d<LONGUEUR-6){
    var pt=pointSur(d), dir=capSur(d);
    var cx=Math.cos(dir), sz=Math.sin(dir);
    var ax=pt[0]+cx*1.3, az=pt[1]+sz*1.3;
    var b1x=pt[0]-cx*0.65-sz*0.78, b1z=pt[1]-sz*0.65+cx*0.78;
    var b2x=pt[0]-cx*0.65+sz*0.78, b2z=pt[1]-sz*0.65-cx*0.78;
    ch.tri(ax,hauteur(ax,az)+0.29,az, b2x,hauteur(b2x,b2z)+0.29,b2z, b1x,hauteur(b1x,b1z)+0.29,b1z,
           0,1,0,[0,0,1,0,0.5,1],noir);
    d+=14;
  }
  if(!MAT.chevron) MAT.chevron=new THREE.MeshBasicMaterial({vertexColors:true, transparent:true, opacity:0.8,
        polygonOffset:true, polygonOffsetFactor:-9, polygonOffsetUnits:-9});
  var mch=new THREE.Mesh(ch.geo(),MAT.chevron);
  mch.renderOrder=4;
  groupeParcours.add(mch);
  construireBornes(groupeParcours);
  monde.add(groupeParcours);
  if(MAT.trace) MAT.trace.emissive=new THREE.Color(nuit?0x7a5a10:0x3a2a06);
}
function pointSur(d){
  if(!TRACE.length) return [0,0];
  if(d<=0) return [TRACE[0][0],TRACE[0][1]];
  if(d>=LONGUEUR) return [TRACE[TRACE.length-1][0],TRACE[TRACE.length-1][1]];
  var a=0, b=CUMUL.length-1;
  while(b-a>1){ var m=(a+b)>>1; if(CUMUL[m]<=d) a=m; else b=m; }
  var t=(d-CUMUL[a])/((CUMUL[b]-CUMUL[a])||1);
  return [TRACE[a][0]+(TRACE[b][0]-TRACE[a][0])*t, TRACE[a][1]+(TRACE[b][1]-TRACE[a][1])*t];
}
function capSur(d){
  var p0=pointSur(Math.max(0,d-3)), p1=pointSur(Math.min(LONGUEUR,d+3));
  return Math.atan2(p1[1]-p0[1], p1[0]-p0[0]);
}
function surLeParcours(x,z){
  var best=1e18, bd=0;
  for(var i=1;i<TRACE.length;i++){
    var ax=TRACE[i-1][0], az=TRACE[i-1][1], bx=TRACE[i][0], bz=TRACE[i][1];
    var dx=bx-ax, dz=bz-az, L2=dx*dx+dz*dz;
    var t=L2>0?((x-ax)*dx+(z-az)*dz)/L2:0;
    if(t<0)t=0; else if(t>1)t=1;
    var qx=ax+t*dx, qz=az+t*dz;
    var dd=(x-qx)*(x-qx)+(z-qz)*(z-qz);
    if(dd<best){ best=dd; bd=CUMUL[i-1]+t*Math.hypot(dx,dz); }
  }
  return {d:bd, ecart:Math.sqrt(best)};
}
/* =================================================================
   Bâtiments, seconde passe : trois familles de façades, occlusion au
   pied des murs, corniches sous les toits.
   Tracé : ruban deux fois plus étroit.
================================================================= */
DECALAGE=0.85;
function pan4g(tas,x0,z0,x1,z1,y0,y1,nx,nz,u1,v1,v0,cbas,chaut){
  tas.triC(x0,y0,z0, x1,y1,z1, x1,y0,z1, nx,0,nz, [0,v0,u1,v0+v1,u1,v0], cbas,chaut,cbas);
  tas.triC(x0,y0,z0, x0,y1,z0, x1,y1,z1, nx,0,nz, [0,v0,0,v0+v1,u1,v0+v1], cbas,chaut,chaut);
}
function corniche(tas,p,top,col){
  var n=p.length/2, off=0.24, hb=0.34, cs=assombrir(col,0.78);
  for(var j=0;j<n;j++){
    var jj=(j+1)%n, x0=p[j*2], z0=p[j*2+1], x1=p[jj*2], z1=p[jj*2+1];
    var dx=x1-x0, dz=z1-z0, L=Math.hypot(dx,dz);
    if(L<0.6) continue;
    var nx=dz/L, nz=-dx/L;
    var A=[x0,top-hb,z0], B=[x1,top-hb,z1], C=[x1+nx*off,top,z1+nz*off], D=[x0+nx*off,top,z0+nz*off];
    var E=[x0,top,z0], F=[x1,top,z1];
    var ns=[nx*0.7,-0.7,nz*0.7], nh=[0,1,0], u=L/2;
    triOriente(tas,A,B,C,ns,ns,ns,[0,0,u,0,u,0.2],cs);
    triOriente(tas,A,C,D,ns,ns,ns,[0,0,u,0.2,0,0.2],cs);
    triOriente(tas,E,F,C,nh,nh,nh,[0,0,u,0,u,0.2],col);
    triOriente(tas,E,C,D,nh,nh,nh,[0,0,u,0.2,0,0.2],col);
  }
}
/* garde-corps métallique sur les toits plats du quartier */
function gardeCorps(tas,p,top){
  var n=p.length/2, fer=teinte(0x3b4046);
  for(var j=0;j<n;j++){
    var jj=(j+1)%n, x0=p[j*2], z0=p[j*2+1], x1=p[jj*2], z1=p[jj*2+1], L=Math.hypot(x1-x0,z1-z0);
    if(L<1) continue;
    tube(tas,x0,top+1.0,z0,x1,top+1.0,z1,0.03,0.03,5,fer,false,false);
    tube(tas,x0,top+0.52,z0,x1,top+0.52,z1,0.018,0.018,4,fer,false,false);
    var m=Math.max(1,Math.round(L/1.6));
    for(var s=0;s<m;s++){ var t=s/m; tube(tas,x0+(x1-x0)*t,top,z0+(z1-z0)*t,x0+(x1-x0)*t,top+1.0,z0+(z1-z0)*t,0.022,0.022,4,fer,false,false); }
  }
}
function construireBatis(bats){
  indexerTypes();
  NB_TYPES={};
  BAT={ mursE:new Tas(65536), rdcE:new Tas(65536), mursP:new Tas(32768), rdcP:new Tas(32768),
        mursE2:new Tas(32768), rdcE2:new Tas(32768), mursM:new Tas(32768), rdcM:new Tas(32768),
        rdcC:new Tas(8192), mursS:new Tas(16384), mursEg:new Tas(8192), mursI:new Tas(16384),
        annexes:new Tas(16384), toits:new Tas(65536), toitsA:new Tas(16384), toitsM:new Tas(8192),
        plats:new Tas(16384), deco:new Tas(4096), corn:new Tas(65536) };
  var oc=teinte(0xd8c99a), brique=teinte(0xb08a72), gris=teinte(0xe6e8ea), clair=teinte(0xf4f0e6);
  for(var i=0;i<bats.length;i++){
    var l=bats[i].split('\t');
    if(l.length<11) continue;
    var k=l[0], rect=+l[1], ang=(+l[2])/10*PI/180;
    var cx=(+l[3])/10, cz=(+l[4])/10, ow=(+l[5])/10, ol=(+l[6])/10;
    var aire=+l[7], lv=+l[8], ht=(+l[9])/10;
    var p=pointsDe(l[10]);
    var n=p.length/2, j;
    if(n<3) continue;
    var x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
    for(j=0;j<n;j++){ var px_=p[j*2], pz_=p[j*2+1]; if(px_<x0)x0=px_; if(px_>x1)x1=px_; if(pz_<z0)z0=pz_; if(pz_>z1)z1=pz_; }
    var r=alea(Math.round(cx*3),Math.round(cz*3));
    var r2=alea(Math.round(cz*7),Math.round(cx*7));
    var milit=false, m;
    for(m=0;m<zonesM.length;m++){ if(dansPoly(zonesM[m],cx,cz)){ milit=true; break; } }
    var type=(k==='e')?'E':typeDe(p,cx,cz,aire,x0,x1,z0,z1);
    if(!type && k==='i') type='I';
    if(type) NB_TYPES[type]=(NB_TYPES[type]||0)+1;
    /* Ce que les photos disent de ce bâtiment précis. À lire ici, avant la
       hauteur : je l'avais placé plus bas, après, et « rel » valait donc
       undefined au moment du remplacement de hauteur. Sans erreur visible :
       la famille de façade changeait bien, mais pas la hauteur, et le toit
       restait perché là où la hauteur devinée l'avait mis — d'où des
       toitures flottant au-dessus des commerces bas. */
    if(repriseParMonument(cx,cz)) continue;
    var rel=releveProche(cx,cz);
    var h=hautBat(k,aire,lv,ht,r,milit,type);
    /* niveaux comptés sur la photo : la 3D faisait trois étages là où
       l'avenue n'a qu'un commerce d'un seul niveau très haut */
    if(rel && rel.niv){
      h=(rel.fam===6) ? 4.9 : (rel.niv*3.15+1.1);
    }
    var base=1e9;
    for(j=0;j<n;j++){ var hh=hauteur(p[j*2],p[j*2+1]); if(hh<base) base=hh; }
    base-=0.35;
    var top=base+h;
    var petit=(k==='g'||aire<28||h<3.2) && !type;
    var fam = milit ? 3 : (r2<0.34 ? 1 : (r2<0.67 ? 0 : 2));
    if(type==='M'||type==='H'||type==='P') fam=1;
    var cm=MURS[Math.floor(r*MURS.length)];
    if(milit) cm=melange(cm,teinte(0xf7f4ee),0.75);
    if(fam===2) cm=melange(cm,teinte(0xe6cfa6),0.3);
    if(petit) cm=melange(cm,teinte(0xd8d2c6),0.5);

    var tasBas, tasHaut, coupe=base+3.2, pleineHauteur=false;
    if(petit){ tasBas=tasHaut=BAT.annexes; coupe=base; }
    else if(type==='E'){ tasBas=tasHaut=BAT.mursEg; pleineHauteur=true; cm=melange(cm,teinte(0xe9e2d0),0.6); }
    else if(type==='S'){ tasBas=tasHaut=BAT.mursS; coupe=base; }
    else if(type==='G'||type==='I'){ tasBas=tasHaut=BAT.mursI; coupe=base; cm=melange(gris,cm,0.25); }
    else if(type==='C'){ tasBas=BAT.rdcC; tasHaut=(fam===1)?BAT.mursP:(fam===2?BAT.mursE2:(fam===3?BAT.mursM:BAT.mursE)); }
    else if(fam===3){ tasBas=BAT.rdcM; tasHaut=BAT.mursM; }
    else if(fam===1){ tasBas=BAT.rdcP; tasHaut=BAT.mursP; }
    else if(fam===2){ tasBas=BAT.rdcE2; tasHaut=BAT.mursE2; }
    else { tasBas=BAT.rdcE; tasHaut=BAT.mursE; }
    if(h<4.3 && !pleineHauteur) coupe=top;

    var ao=assombrir(cm,0.62), mi=assombrir(cm,0.95);
    for(j=0;j<n;j++){
      var jj=(j+1)%n;
      var ax=p[j*2], az=p[j*2+1], bx=p[jj*2], bz=p[jj*2+1];
      var dx=bx-ax, dz=bz-az, L=Math.hypot(dx,dz);
      if(L<0.15) continue;
      var nx=dz/L, nz=-dx/L, u1=L/4;
      if(pleineHauteur){ pan4g(tasHaut,ax,az,bx,bz,base,top,nx,nz,u1,1,0,ao,cm); continue; }
      var yc=Math.min(coupe,top);
      if(coupe>base+0.05) pan4g(tasBas,ax,az,bx,bz,base,yc,nx,nz,u1,(yc-base)/3.2,0,ao,mi);
      if(top>coupe+0.05) pan4g(tasHaut,ax,az,bx,bz,coupe,top,nx,nz,u1,(top-coupe)/3.2,0,(coupe<=base+0.05)?ao:mi,cm);
    }
    if(!petit && h>5 && type!=='G' && type!=='I') corniche(BAT.corn,p,top,melange(cm,clair,0.35));

    var ct=TOITS[Math.floor(r2*TOITS.length)];
    var ardoise = type==='E'||type==='M'||type==='P'||type==='H'||(milit && aire>250);
    var cta = melange(teinte(0xffffff),teinte(0xd6dbe2),r2);
    if(milit && !ardoise) ct=melange(ct,teinte(0xc8cdd4),0.5);
    var riseMairie=0;
    if(type==='G'||type==='I'){
      if(rect>=70 && Math.min(ow,ol)>6) toitDeuxPentes(BAT.toitsM,cx,cz,ang,ow,ol,top,gris,0.32,0,1,brique);
      else toitPlat(BAT.plats,p,top,cm,ct);
    }
    else if(type==='M' && rect>=65){ riseMairie=toitCroupe(BAT.toitsA,cx,cz,ang,ow,ol,top,cta,4.2); }
    else if(rect>=72 && Math.min(ow,ol)>2.4 && k!=='i'){
      if(ardoise) toitDeuxPentes(BAT.toitsA,cx,cz,ang,ow,ol,top,cta,type==='E'?2.1:1.25,aire,r,brique);
      else toitDeuxPentes(BAT.toits,cx,cz,ang,ow,ol,top,ct,1,aire,r,brique);
    } else {
      toitPlat(BAT.plats,p,top,cm,ct);
      if(milit && !petit && h>6) gardeCorps(BAT.deco,p,top);
    }
    if(type==='E' && aire>120) clocher(cx,cz,ang,ow,ol,base,top,cm,cta);
    if(type==='M') drapeau(cx,cz,ang,top+(riseMairie||0.4));
    marquerPoly(p);
  }
  return BAT;
}

/* ---------------- tracé : ruban de 1,1 m ---------------- */
function reconstruireParcours(){
  if(groupeParcours){ monde.remove(groupeParcours); liberer(groupeParcours); groupeParcours=null; }
  if(TRACE.length<2) return;
  groupeParcours=new THREE.Group();
  var plat=[], i;
  for(i=0;i<TRACE.length;i++) plat.push(TRACE[i][0],TRACE[i][1]);
  var tas=new Tas(16384);
  ruban(tas,plat,1.1,COL.trace,0.21,4,4);
  if(!MAT.trace) MAT.trace=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.65, metalness:0,
        emissive:0x3a2a06, transparent:true, opacity:0.94,
        polygonOffset:true, polygonOffsetFactor:-6, polygonOffsetUnits:-6});
  var mesh=new THREE.Mesh(tas.geo(),MAT.trace);
  mesh.renderOrder=3; mesh.receiveShadow=true;
  groupeParcours.add(mesh);
  var ch=new Tas(8192), noir=teinte(0x30240f), d=0;
  while(d<LONGUEUR-4){
    var pt=pointSur(d), dir=capSur(d);
    var cx=Math.cos(dir), sz=Math.sin(dir);
    var ax=pt[0]+cx*0.65, az=pt[1]+sz*0.65;
    var b1x=pt[0]-cx*0.33-sz*0.39, b1z=pt[1]-sz*0.33+cx*0.39;
    var b2x=pt[0]-cx*0.33+sz*0.39, b2z=pt[1]-sz*0.33-cx*0.39;
    ch.tri(ax,hauteur(ax,az)+0.29,az, b2x,hauteur(b2x,b2z)+0.29,b2z, b1x,hauteur(b1x,b1z)+0.29,b1z,
           0,1,0,[0,0,1,0,0.5,1],noir);
    d+=10;
  }
  if(!MAT.chevron) MAT.chevron=new THREE.MeshBasicMaterial({vertexColors:true, transparent:true, opacity:0.8,
        polygonOffset:true, polygonOffsetFactor:-9, polygonOffsetUnits:-9});
  var mch=new THREE.Mesh(ch.geo(),MAT.chevron);
  mch.renderOrder=4;
  groupeParcours.add(mch);
  construireBornes(groupeParcours);
  monde.add(groupeParcours);
  if(MAT.trace) MAT.trace.emissive=new THREE.Color(nuit?0x7a5a10:0x3a2a06);
}
/* =================================================================
   Étiquettes flottantes
================================================================= */
function arrondi(g,x,y,w,h,r){
  g.beginPath();
  g.moveTo(x+r,y); g.lineTo(x+w-r,y); g.quadraticCurveTo(x+w,y,x+w,y+r);
  g.lineTo(x+w,y+h-r); g.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  g.lineTo(x+r,y+h); g.quadraticCurveTo(x,y+h,x,y+h-r);
  g.lineTo(x,y+r); g.quadraticCurveTo(x,y,x+r,y); g.closePath();
}
function etiquette(txt,fond,bord,texte,large,ech){
  var pad=12, c=toile(8,8), g=c.getContext('2d');
  g.font='bold 44px system-ui, sans-serif';
  var w=Math.max(large||0, Math.ceil(g.measureText(txt).width)+pad*2+10);
  var h=72;
  c.width=w; c.height=h;
  g=c.getContext('2d');
  g.font='bold 44px system-ui, sans-serif';
  g.textAlign='center'; g.textBaseline='middle';
  g.shadowColor='rgba(0,0,0,0.45)'; g.shadowBlur=8; g.shadowOffsetY=3;
  g.fillStyle=fond;
  arrondi(g,4,4,w-8,h-14,13); g.fill();
  g.shadowColor='transparent';
  g.lineWidth=3.5; g.strokeStyle=bord; g.stroke();
  /* petite pointe vers le bas */
  g.fillStyle=fond;
  g.beginPath(); g.moveTo(w/2-8,h-10); g.lineTo(w/2+8,h-10); g.lineTo(w/2,h-1); g.closePath(); g.fill();
  g.fillStyle=texte;
  g.fillText(txt,w/2,(h-10)/2+2);
  var t=new THREE.CanvasTexture(c);
  if(t.colorSpace!==undefined) t.colorSpace=THREE.SRGBColorSpace;
  var m=new THREE.SpriteMaterial({map:t, transparent:true, depthTest:true});
  var s=new THREE.Sprite(m);
  var k=(ech||1)*1.25;
  s.scale.set(w/h*k, k, 1);
  s.center.set(0.5,0);
  return s;
}

/* =================================================================
   Personnages
================================================================= */
var PEAU=teinte(0xc99a72), PEAU2=teinte(0xb98a62);
function repere(x,z,cap){
  var co=Math.cos(cap), si=Math.sin(cap);
  return function(u,v,y){ return [x+u*co-v*si, y, z+u*si+v*co]; };
}
/* silhouette figée, pour les jalonneurs */
function bonhomme(tas,x,z,cap,maillot,short,dirBras){
  var y=hauteur(x,z);
  var P=repere(x,z,cap);
  var i, cot=melange(maillot,teinte(0x000000),0.18);
  /* jambes */
  for(i=-1;i<=1;i+=2){
    var v=i*0.105;
    var a=P(0,v,y+0.92), b=P(0.01*i,v*1.05,y+0.50), c=P(0.02,v*1.1,y+0.09);
    tube(tas,a[0],a[1],a[2], b[0],b[1],b[2], 0.088,0.062,7,short,true,false);
    tube(tas,b[0],b[1],b[2], c[0],c[1],c[2], 0.062,0.05,7,PEAU2,false,true);
    var d=P(0.09,v*1.1,y+0.045);
    tube(tas,c[0],c[1]-0.01,c[2], d[0],d[1],d[2], 0.055,0.045,6,teinte(0x22262b),true,true);
  }
  /* bassin et torse */
  var h0=P(0,0,y+0.86), h1=P(0,0,y+1.10), h2=P(0,0,y+1.46);
  tube(tas,h0[0],h0[1],h0[2], h1[0],h1[1],h1[2], 0.155,0.145,9,short,true,false);
  tube(tas,h1[0],h1[1],h1[2], h2[0],h2[1],h2[2], 0.145,0.185,9,maillot,false,false);
  boule(tas,h2[0],h2[1],h2[2],0.185,0.6,9,maillot);
  /* bras */
  for(i=-1;i<=1;i+=2){
    var ep=P(0,i*0.20,y+1.42);
    if(dirBras && i>0){
      /* bras tendu qui indique la direction */
      var cd=Math.cos(dirBras), sd=Math.sin(dirBras);
      var co2=[ep[0]+cd*0.32, ep[1]+0.06, ep[2]+sd*0.32];
      var ma=[ep[0]+cd*0.63, ep[1]+0.12, ep[2]+sd*0.63];
      tube(tas,ep[0],ep[1],ep[2], co2[0],co2[1],co2[2], 0.062,0.05,7,cot,true,false);
      tube(tas,co2[0],co2[1],co2[2], ma[0],ma[1],ma[2], 0.05,0.042,7,PEAU,false,false);
      boule(tas,ma[0],ma[1],ma[2],0.055,1,7,PEAU);
    } else {
      var cd2=P(0.03,i*0.235,y+1.16), ma2=P(0.10,i*0.225,y+0.92);
      tube(tas,ep[0],ep[1],ep[2], cd2[0],cd2[1],cd2[2], 0.062,0.05,7,cot,true,false);
      tube(tas,cd2[0],cd2[1],cd2[2], ma2[0],ma2[1],ma2[2], 0.05,0.042,7,PEAU,false,false);
      boule(tas,ma2[0],ma2[1],ma2[2],0.055,1,7,PEAU);
    }
  }
  /* cou et tête */
  var cou=P(0,0,y+1.50), te=P(0.005,0,y+1.63);
  tube(tas,h2[0],h2[1],h2[2], cou[0],cou[1],cou[2], 0.062,0.062,7,PEAU2,false,false);
  boule(tas,te[0],te[1],te[2],0.118,1.06,10,PEAU);
  /* casquette */
  var cq=P(0.005,0,y+1.685);
  boule(tas,cq[0],cq[1],cq[2],0.122,0.58,10,melange(maillot,teinte(0x222222),0.35));
  var vi=P(0.16,0,y+1.665);
  tube(tas,cq[0],cq[1]-0.01,cq[2], vi[0],vi[1],vi[2], 0.10,0.075,5,melange(maillot,teinte(0x222222),0.5),false,true);
}
/* silhouette animable du joueur */
function faireJoueur(){
  var mat=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.78, metalness:0.02});
  MAT.joueur=mat;
  function piece(fn){
    var t=new Tas(2048); fn(t);
    var m=new THREE.Mesh(t.geo(),mat);
    m.castShadow=true; m.receiveShadow=false;
    return m;
  }
  var maillot=teinte(0x2f6fd0), short=teinte(0x1e2833);
  var cot=melange(maillot,teinte(0x000000),0.2);
  var g=new THREE.Group();
  var corps=new THREE.Group();
  g.add(corps);

  corps.add(piece(function(t){
    tube(t,0,0.86,0, 0,1.10,0, 0.155,0.145,9,short,true,false);
    tube(t,0,1.10,0, 0,1.46,0, 0.145,0.185,9,maillot,false,false);
    boule(t,0,1.46,0,0.185,0.6,9,maillot);
    tube(t,0,1.46,0, 0,1.50,0, 0.062,0.062,7,PEAU2,false,false);
    boule(t,0.005,1.63,0,0.118,1.06,10,PEAU);
    boule(t,0.005,1.685,0,0.122,0.58,10,melange(maillot,teinte(0x222222),0.4));
    tube(t,0.005,1.675,0, 0.16,1.665,0, 0.10,0.075,5,melange(maillot,teinte(0x222222),0.55),false,true);
  }));

  var art={};
  function membre(nom,px,py,pz,f1,f2){
    var p1=new THREE.Group(); p1.position.set(px,py,pz);
    var p2=new THREE.Group();
    p1.add(piece(f1)); p1.add(p2); p2.add(piece(f2));
    corps.add(p1);
    art[nom]=p1; art[nom+'2']=p2;
    return p2;
  }
  for(var s=-1;s<=1;s+=2){
    var nom=s>0?'jd':'jg';
    var p2=membre(nom, 0,0.92,s*0.105,
      function(t){ tube(t,0,0,0, 0,-0.42,0, 0.088,0.062,7,short,true,false); },
      function(t){
        tube(t,0,0,0, 0,-0.41,0, 0.062,0.05,7,PEAU2,false,true);
        tube(t,0,-0.42,0, 0.09,-0.455,0, 0.055,0.045,6,teinte(0x22262b),true,true);
      });
    p2.position.set(0,-0.42,0);
    var nomb=s>0?'bd':'bg';
    var q2=membre(nomb, 0,1.42,s*0.20,
      function(t){ tube(t,0,0,0, 0,-0.27,0, 0.062,0.05,7,cot,true,false); },
      function(t){
        tube(t,0,0,0, 0,-0.25,0, 0.05,0.042,7,PEAU,false,false);
        boule(t,0,-0.27,0,0.055,1,7,PEAU);
      });
    q2.position.set(0,-0.27,0);
  }
  g.userData={corps:corps, art:art};
  return g;
}

/* =================================================================
   Jalonneurs
================================================================= */
var JAL=[];
function chargerJalons(txt){
  var l=txt.split('\n'), i;
  for(i=0;i<l.length;i++){
    var c=l[i].split('\t');
    if(c.length<3) continue;
    var x=(+c[0])/10, z=(+c[1])/10;
    var s=surLeParcours(x,z);
    JAL.push({x:x, z:z, niv:c[2].replace(/\s/g,''), d:s.d});
  }
  JAL.sort(function(a,b){ return a.d-b.d; });
  for(i=0;i<JAL.length;i++) JAL[i].n=i+1;
}
function disque(tas,x,y,z,r,c){
  var N=14;
  for(var i=0;i<N;i++){
    var a0=i/N*2*PI, a1=(i+1)/N*2*PI;
    tas.tri(x,y,z, x+Math.cos(a1)*r,y,z+Math.sin(a1)*r, x+Math.cos(a0)*r,y,z+Math.sin(a0)*r,
            0,1,0,[0.5,0.5,1,0.5,0.5,1],c);
  }
}
function construireJalons(){
  var tas=new Tas(65536), g=new THREE.Group();
  var rouge=teinte(0xd12b1e), orange=teinte(0xf3970d), short=teinte(0x22303c);
  for(var i=0;i<JAL.length;i++){
    var j=JAL[i];
    var suite=capSur(Math.min(LONGUEUR,j.d+18));
    bonhomme(tas,j.x,j.z,capSur(j.d)+PI, j.niv==='r'?rouge:orange, short, suite);
    var e=etiquette(String(j.n), j.niv==='r'?'#d12b1e':'#f3970d', '#ffffff', '#ffffff', 74, 0.78);
    e.position.set(j.x, hauteur(j.x,j.z)+1.92, j.z);
    g.add(e);
    j.etiq=e;
  }
  MAT.perso=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.78, metalness:0.02});
  var mesh=new THREE.Mesh(tas.geo(),MAT.perso);
  mesh.castShadow=true;
  g.add(mesh);
  monde.add(g);
  return g;
}

/* =================================================================
   Points remarquables, bornes, portiques
================================================================= */
var POI=[];
function construirePois(txt){
  var l=txt.split('\n'), g=new THREE.Group(), tas=new Tas(4096);
  var acier=teinte(0xb6bcc4);
  for(var i=0;i<l.length;i++){
    var c=l[i].split('\t');
    if(c.length<3) continue;
    var x=(+c[0])/10, z=(+c[1])/10, nom=c[2];
    var y=hauteur(x,z);
    tube(tas,x,y,z, x,y+2.6,z, 0.06,0.055,7,acier,false,true);
    var e=etiquette(nom,'rgba(14,28,40,0.92)','#7ec8e3','#e8f4fa',0,1.25);
    e.position.set(x,y+2.6,z);
    g.add(e);
    POI.push({x:x,z:z,nom:nom,etiq:e});
  }
  g.add(new THREE.Mesh(tas.geo(),MAT.perso));
  monde.add(g);
  return g;
}
function construireBornes(){
  var g=new THREE.Group(), tas=new Tas(8192);
  var n=Math.floor(LONGUEUR/1000);
  for(var k=1;k<=n;k++){
    var p=pointSur(k*1000);
    var y=hauteur(p[0],p[1]);
    boiteQuad(tas,[p[0]-0.11,p[1]-0.11],[p[0]+0.11,p[1]-0.11],[p[0]+0.11,p[1]+0.11],[p[0]-0.11,p[1]+0.11],
              y,y+1.5,teinte(0xF2B33D),teinte(0xfff0c8),1);
    var e=etiquette(k+' km','rgba(30,22,6,0.92)','#F2B33D','#F2B33D',0,0.95);
    e.position.set(p[0],y+1.5,p[1]);
    g.add(e);
  }
  var d=pointSur(0), a=pointSur(LONGUEUR);
  portique(tas,d,capSur(0),teinte(0x2f8f4a));
  portique(tas,a,capSur(LONGUEUR),teinte(0xc0392b));
  var ed=etiquette('DÉPART','rgba(10,40,20,0.94)','#4ade80','#dcfce7',0,1.1);
  ed.position.set(d[0],hauteur(d[0],d[1])+5.2,d[1]);
  g.add(ed);
  var ea=etiquette('ARRIVÉE','rgba(44,10,10,0.94)','#fca5a5','#fee2e2',0,1.1);
  ea.position.set(a[0],hauteur(a[0],a[1])+5.2,a[1]);
  g.add(ea);
  g.add(new THREE.Mesh(tas.geo(),MAT.perso));
  monde.add(g);
}
function portique(tas,p,cap,c){
  var co=Math.cos(cap+PI/2), si=Math.sin(cap+PI/2);
  var y=hauteur(p[0],p[1]);
  for(var s=-1;s<=1;s+=2){
    var x=p[0]+co*4*s, z=p[1]+si*4*s;
    var yy=hauteur(x,z);
    tube(tas,x,yy-0.3,z, x,yy+4.6,z, 0.14,0.11,8,c,false,true);
  }
  var a=[p[0]+co*4,p[1]+si*4], b=[p[0]-co*4,p[1]-si*4];
  var nx=-si*0.10, nz=co*0.10;
  boiteQuad(tas,[a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz],[b[0]-nx,b[1]-nz],[a[0]-nx,a[1]-nz],y+4.0,y+4.9,c,c,1);
}

/* =================================================================
   Lampadaires
================================================================= */
var lampes=[];
function construireLampes(voies){
  var tas=new Tas(16384), tetes=new Tas(4096);
  var gris=teinte(0x3d434b), verre=teinte(0xfff2cd);
  var n=0;
  for(var i=0;i<voies.length && n<420;i++){
    var l=voies[i].split('\t');
    if(l.length<4 || l[0]!=='r' || (+l[1])<50) continue;
    var p=pointsDe(l[3]);
    for(var j=1;j<p.length/2 && n<420;j++){
      var x0=p[(j-1)*2], z0=p[(j-1)*2+1], x1=p[j*2], z1=p[j*2+1];
      var L=Math.hypot(x1-x0,z1-z0);
      var m=Math.floor(L/38);
      for(var s=0;s<m;s++){
        var t=(s+0.5)/m;
        var cx=x0+(x1-x0)*t, cz=z0+(z1-z0)*t;
        var dx=(x1-x0)/L, dz=(z1-z0)/L;
        var off=(+l[1])/20+1.1;
        var lx=cx+dz*off, lz=cz-dx*off;
        if(surLeParcours(lx,lz).ecart>80) continue;
        var y=hauteur(lx,lz);
        tube(tas,lx,y,lz, lx,y+4.6,lz, 0.11,0.075,7,gris,false,false);
        var hx=lx-dz*0.85, hz=lz+dx*0.85;
        tube(tas,lx,y+4.6,lz, hx,y+4.85,hz, 0.07,0.06,6,gris,false,false);
        tube(tetes,hx,y+4.85,hz, hx,y+4.62,hz, 0.19,0.13,8,verre,true,true);
        lampes.push([hx,y+4.6,hz]);
        n++;
      }
    }
  }
  monde.add(new THREE.Mesh(tas.geo(),MAT.perso));
  MAT.verre=new THREE.MeshBasicMaterial({vertexColors:true});
  var mm=new THREE.Mesh(tetes.geo(),MAT.verre);
  monde.add(mm);
  /* halos au sol, visibles seulement de nuit */
  var halo=new Tas(16384), jaune=teinte(0xffd88a);
  for(var q=0;q<lampes.length;q++){
    var L2=lampes[q];
    disque(halo,L2[0],hauteur(L2[0],L2[2])+0.22,L2[2],7.5,jaune);
  }
  MAT.halo=new THREE.MeshBasicMaterial({vertexColors:true, transparent:true, opacity:0.26,
        blending:THREE.AdditiveBlending, depthWrite:false});
  var meshHalo=new THREE.Mesh(halo.geo(),MAT.halo);
  meshHalo.visible=false;
  monde.add(meshHalo);
  return {tetes:mm, halos:meshHalo};
}
/* =================================================================
   Personnages réalistes
   Une seule texture « atlas » : visages, tissus, peau, chaussures.
   Le corps est bâti en pièces articulées (hanches, genoux, chevilles,
   épaules, coudes, poignets), animées pour le coureur et figées puis
   fusionnées pour les jalonneurs.
================================================================= */
var AT=1024;
var CELL={
  visage:[[0,0,256,256],[256,0,256,256],[512,0,256,256],[768,0,256,256]],
  tissu:[0,256,256,256], short:[256,256,256,256], chaussette:[512,256,256,256], chaussure:[768,256,256,256],
  peau:[0,512,256,256], cheveux:[256,512,256,256], semelle:[512,512,256,256], casquette:[768,512,256,256]
};
var VISAGES=[
  {peau:'#d9a883', ph:0xd9a883, cheveux:'#3a2a1e', ch:0x3a2a1e, yeux:'#4a3322', levres:'#b0655a'},
  {peau:'#c58b61', ph:0xc58b61, cheveux:'#1c1714', ch:0x1c1714, yeux:'#2b1d14', levres:'#9a5648'},
  {peau:'#ecc4a2', ph:0xecc4a2, cheveux:'#9c7446', ch:0x9c7446, yeux:'#50707f', levres:'#c4766b'},
  {peau:'#8a5a3c', ph:0x8a5a3c, cheveux:'#120d0b', ch:0x120d0b, yeux:'#1d130d', levres:'#6a392c'}
];
function uvCell(c,u,v){ return [(c[0]+u*c[2])/AT, 1-(c[1]+v*c[3])/AT]; }

/* ---------------- peinture de l'atlas ---------------- */
function grainZone(g,x,y,w,h,n,a){
  for(var i=0;i<n;i++){
    g.fillStyle=Math.random()<0.5?'rgba(0,0,0,'+a+')':'rgba(255,255,255,'+a+')';
    g.fillRect(x+Math.random()*w,y+Math.random()*h,1.4,1.4);
  }
}
function cellule(g,cell,fond,fn){
  g.save(); g.beginPath(); g.rect(cell[0],cell[1],cell[2],cell[3]); g.clip();
  g.fillStyle=fond; g.fillRect(cell[0],cell[1],cell[2],cell[3]);
  fn(cell[0],cell[1],cell[2],cell[3]);
  g.restore();
}
function peindreVisage(g,x0,V){
  var W=256, H=256, i;
  g.save(); g.beginPath(); g.rect(x0,0,W,H); g.clip(); g.translate(x0,0);
  g.fillStyle=V.peau; g.fillRect(0,0,W,H);
  var gr=g.createLinearGradient(0,0,W,0);
  gr.addColorStop(0,'rgba(40,20,10,0.26)'); gr.addColorStop(0.28,'rgba(40,20,10,0.07)');
  gr.addColorStop(0.5,'rgba(255,232,212,0.07)'); gr.addColorStop(0.72,'rgba(40,20,10,0.07)'); gr.addColorStop(1,'rgba(40,20,10,0.26)');
  g.fillStyle=gr; g.fillRect(0,0,W,H);
  var gm=g.createLinearGradient(0,176,0,256);
  gm.addColorStop(0,'rgba(50,25,15,0)'); gm.addColorStop(1,'rgba(50,25,15,0.4)');
  g.fillStyle=gm; g.fillRect(0,176,W,80);
  [[98,150],[158,150]].forEach(function(p){
    var rg=g.createRadialGradient(p[0],p[1],1,p[0],p[1],22);
    rg.addColorStop(0,'rgba(205,95,85,0.17)'); rg.addColorStop(1,'rgba(205,95,85,0)');
    g.fillStyle=rg; g.fillRect(p[0]-22,p[1]-22,44,44);
  });
  grainZone(g,0,0,W,H,2200,0.05);
  /* cheveux : calotte, nuque, tempes */
  g.fillStyle=V.cheveux;
  g.beginPath();
  g.moveTo(0,0); g.lineTo(W,0); g.lineTo(W,160); g.lineTo(214,160);
  g.quadraticCurveTo(205,122,195,104);
  g.quadraticCurveTo(180,72,128,68);
  g.quadraticCurveTo(76,72,61,104);
  g.quadraticCurveTo(51,122,42,160);
  g.lineTo(0,160); g.closePath(); g.fill();
  for(i=0;i<900;i++){
    var x=Math.random()*W, y=Math.random()*156;
    if(y>64 && x>58 && x<198) continue;
    g.strokeStyle=Math.random()<0.5?'rgba(255,255,255,0.10)':'rgba(0,0,0,0.25)';
    g.lineWidth=1; g.beginPath(); g.moveTo(x,y); g.lineTo(x+(Math.random()-0.5)*5,y+5+Math.random()*9); g.stroke();
  }
  /* sourcils */
  g.strokeStyle=V.cheveux; g.lineCap='round';
  [-1,1].forEach(function(s){
    g.lineWidth=4.2; g.beginPath(); g.moveTo(128+s*7,110); g.quadraticCurveTo(128+s*17,102,128+s*29,108); g.stroke();
  });
  /* yeux */
  [-1,1].forEach(function(s){
    var cx=128+s*17, cy=121;
    g.fillStyle='rgba(60,30,20,0.18)'; g.beginPath(); g.ellipse(cx,cy+1,11.5,6.8,0,0,7); g.fill();
    g.fillStyle='#f3eee7'; g.beginPath(); g.ellipse(cx,cy,8.6,4.3,0,0,7); g.fill();
    g.fillStyle=V.yeux; g.beginPath(); g.arc(cx+s*0.3,cy+0.2,3.7,0,7); g.fill();
    g.fillStyle='#0b0b0b'; g.beginPath(); g.arc(cx+s*0.3,cy+0.2,1.7,0,7); g.fill();
    g.fillStyle='rgba(255,255,255,0.9)'; g.beginPath(); g.arc(cx-1,cy-1.2,0.9,0,7); g.fill();
    g.strokeStyle='rgba(35,18,12,0.9)'; g.lineWidth=1.9;
    g.beginPath(); g.ellipse(cx,cy,8.9,4.6,0,PI*1.03,PI*1.97); g.stroke();
    g.strokeStyle='rgba(60,30,20,0.25)'; g.lineWidth=1;
    g.beginPath(); g.ellipse(cx,cy+0.5,8.6,4.6,0,PI*0.1,PI*0.9); g.stroke();
  });
  /* nez */
  g.strokeStyle='rgba(70,35,25,0.2)'; g.lineWidth=2.4;
  g.beginPath(); g.moveTo(123,126); g.quadraticCurveTo(121,142,122,149); g.stroke();
  g.beginPath(); g.moveTo(133,126); g.quadraticCurveTo(135,142,134,149); g.stroke();
  g.fillStyle='rgba(60,28,20,0.55)';
  g.beginPath(); g.ellipse(123.5,151,2.3,1.4,0,0,7); g.fill();
  g.beginPath(); g.ellipse(132.5,151,2.3,1.4,0,0,7); g.fill();
  /* bouche */
  g.fillStyle=V.levres;
  g.beginPath(); g.moveTo(113,169); g.quadraticCurveTo(121,164.5,128,166.5); g.quadraticCurveTo(135,164.5,143,169); g.quadraticCurveTo(128,171.5,113,169); g.fill();
  g.globalAlpha=0.82; g.beginPath(); g.ellipse(128,172.5,10.5,3.4,0,0,7); g.fill(); g.globalAlpha=1;
  g.strokeStyle='rgba(60,20,15,0.6)'; g.lineWidth=1.2;
  g.beginPath(); g.moveTo(114,169.5); g.quadraticCurveTo(128,171.2,142,169.5); g.stroke();
  g.fillStyle='rgba(60,30,20,0.12)'; g.fillRect(56,112,14,36); g.fillRect(186,112,14,36);
  g.restore();
}
function faireAtlas(){
  var c=toile(AT,AT), g=c.getContext('2d'), v;
  g.fillStyle='#909090'; g.fillRect(0,0,AT,AT);
  for(v=0;v<4;v++) peindreVisage(g,v*256,VISAGES[v]);
  cellule(g,CELL.tissu,'#f6f6f6',function(x,y,w,h){
    for(var yy=0;yy<h;yy+=3) for(var xx=((yy/3)%2)*2;xx<w;xx+=4){ g.fillStyle='rgba(0,0,0,0.05)'; g.fillRect(x+xx,y+yy,1.5,2.2); }
    grainZone(g,x,y,w,h,1800,0.07);
    for(var i=0;i<7;i++){
      var gx=x+Math.random()*w, lg=g.createLinearGradient(gx-22,0,gx+22,0);
      lg.addColorStop(0,'rgba(0,0,0,0)'); lg.addColorStop(0.5,'rgba(0,0,0,0.08)'); lg.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=lg; g.fillRect(gx-22,y,44,h);
    }
    g.fillStyle='rgba(0,0,0,0.12)'; g.fillRect(x,y+h-14,w,3); g.fillRect(x,y,w,6);
    g.fillStyle='rgba(0,0,0,0.06)'; for(var s=x;s<x+w;s+=5) g.fillRect(s,y+h-10,2,1);
  });
  cellule(g,CELL.short,'#f1f1f1',function(x,y,w,h){
    g.strokeStyle='rgba(0,0,0,0.06)'; g.lineWidth=1;
    for(var d=-h;d<w;d+=4){ g.beginPath(); g.moveTo(x+d,y+h); g.lineTo(x+d+h,y); g.stroke(); }
    grainZone(g,x,y,w,h,1200,0.06);
    g.fillStyle='rgba(0,0,0,0.16)'; g.fillRect(x,y,w,12);
    g.fillStyle='rgba(0,0,0,0.10)'; g.fillRect(x,y+h-10,w,3);
    for(var i=0;i<5;i++){
      var gx=x+Math.random()*w, lg=g.createLinearGradient(gx-18,0,gx+18,0);
      lg.addColorStop(0,'rgba(0,0,0,0)'); lg.addColorStop(0.5,'rgba(0,0,0,0.09)'); lg.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=lg; g.fillRect(gx-18,y,36,h);
    }
  });
  cellule(g,CELL.chaussette,'#f7f7f7',function(x,y,w,h){
    for(var xx=0;xx<w;xx+=6){ g.fillStyle='rgba(0,0,0,0.09)'; g.fillRect(x+xx,y,2,h); }
    g.fillStyle='rgba(0,0,0,0.12)'; g.fillRect(x,y,w,10);
  });
  cellule(g,CELL.chaussure,'#f3f3f3',function(x,y,w,h){
    for(var yy=6;yy<h;yy+=6) for(var xx=((yy/6)%2)*3;xx<w;xx+=6){ g.fillStyle='rgba(0,0,0,0.08)'; g.fillRect(x+xx,y+yy,2,2); }
    g.fillStyle='rgba(0,0,0,0.18)'; g.fillRect(x,y+h*0.62,w,5);
    g.fillStyle='rgba(255,255,255,0.35)'; g.fillRect(x,y+h*0.66,w,8);
    g.strokeStyle='rgba(40,40,40,0.55)'; g.lineWidth=2;
    for(var l=0;l<5;l++){ var ly=y+18+l*12; g.beginPath(); g.moveTo(x+112,ly); g.lineTo(x+144,ly+6); g.moveTo(x+144,ly); g.lineTo(x+112,ly+6); g.stroke(); }
    g.fillStyle='rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(x+40,y+h*0.45,26,40,0,0,7); g.fill();
    g.beginPath(); g.ellipse(x+216,y+h*0.45,26,40,0,0,7); g.fill();
  });
  cellule(g,CELL.peau,'#f4f2f0',function(x,y,w,h){
    grainZone(g,x,y,w,h,2400,0.04);
    for(var i=0;i<20;i++){
      var px=x+Math.random()*w, py=y+Math.random()*h, rg=g.createRadialGradient(px,py,1,px,py,26);
      rg.addColorStop(0,'rgba(180,90,70,0.05)'); rg.addColorStop(1,'rgba(180,90,70,0)');
      g.fillStyle=rg; g.fillRect(px-26,py-26,52,52);
    }
  });
  cellule(g,CELL.cheveux,'#d9d9d9',function(x,y,w,h){
    for(var i=0;i<1400;i++){
      var sx=x+Math.random()*w, sy=y+Math.random()*h;
      g.strokeStyle=Math.random()<0.5?'rgba(255,255,255,0.25)':'rgba(0,0,0,0.25)';
      g.lineWidth=1; g.beginPath(); g.moveTo(sx,sy); g.lineTo(sx+(Math.random()-0.5)*6,sy+8+Math.random()*12); g.stroke();
    }
  });
  cellule(g,CELL.semelle,'#3b3e44',function(x,y,w,h){
    g.fillStyle='rgba(255,255,255,0.10)';
    for(var yy=0;yy<h;yy+=9) g.fillRect(x,y+yy,w,3);
    grainZone(g,x,y,w,h,900,0.08);
  });
  cellule(g,CELL.casquette,'#eeeeee',function(x,y,w,h){
    g.strokeStyle='rgba(0,0,0,0.18)'; g.lineWidth=2;
    for(var k=0;k<6;k++){ var sx=x+k*w/6; g.beginPath(); g.moveTo(sx,y); g.lineTo(sx,y+h); g.stroke(); }
    for(var yy=0;yy<h;yy+=4){ g.fillStyle='rgba(0,0,0,0.04)'; g.fillRect(x,y+yy,w,1.5); }
    g.fillStyle='rgba(0,0,0,0.2)'; g.fillRect(x,y,w,8);
  });
  return c;
}

/* ---------------- primitives texturées ---------------- */
function triOriente(tas,A,B,C,NA,NB,NC,uv,col){
  var ux=B[0]-A[0], uy=B[1]-A[1], uz=B[2]-A[2], vx=C[0]-A[0], vy=C[1]-A[1], vz=C[2]-A[2];
  var gx=uy*vz-uz*vy, gy=uz*vx-ux*vz, gz=ux*vy-uy*vx;
  if(gx*gx+gy*gy+gz*gz<1e-14) return;
  var mx=NA[0]+NB[0]+NC[0], my=NA[1]+NB[1]+NC[1], mz=NA[2]+NB[2]+NC[2];
  if(gx*mx+gy*my+gz*mz<0) tas.triN(A,C,B,NA,NC,NB,[uv[0],uv[1],uv[4],uv[5],uv[2],uv[3]],col);
  else tas.triN(A,B,C,NA,NB,NC,uv,col);
}
/* surface de révolution à sections elliptiques : [y, rx, rz, cx, cz] */
function loft(tas,an,seg,col,cell,fermerHaut,fermerBas){
  var n=an.length, R=[], Nn=[], a, i;
  for(a=0;a<n;a++){
    var A=an[a], y=A[0], rx=A[1], rz=A[2], cx=A[3]||0, cz=A[4]||0;
    var p=an[Math.max(0,a-1)], q=an[Math.min(n-1,a+1)];
    var dy=q[0]-p[0], dr=((q[1]+q[2])-(p[1]+p[2]))/2;
    var ny=Math.abs(dy)>1e-6?Math.max(-2,Math.min(2,-dr/dy)):0;
    var ring=[], rn=[];
    for(i=0;i<=seg;i++){
      var ph=i/seg*2*PI-PI, c=Math.cos(ph), s=Math.sin(ph);
      var nx=c/rx, nz=s/rz, L=Math.hypot(nx,nz)||1; nx/=L; nz/=L;
      var LL=Math.hypot(nx,ny,nz);
      ring.push([cx+c*rx, y, cz+s*rz]); rn.push([nx/LL,ny/LL,nz/LL]);
    }
    R.push(ring); Nn.push(rn);
  }
  for(a=0;a<n-1;a++){
    var v0=a/(n-1), v1=(a+1)/(n-1);
    for(i=0;i<seg;i++){
      var u0=i/seg, u1=(i+1)/seg;
      var t00=uvCell(cell,u0,v0), t10=uvCell(cell,u1,v0), t01=uvCell(cell,u0,v1), t11=uvCell(cell,u1,v1);
      triOriente(tas,R[a][i],R[a][i+1],R[a+1][i+1],Nn[a][i],Nn[a][i+1],Nn[a+1][i+1],[t00[0],t00[1],t10[0],t10[1],t11[0],t11[1]],col);
      triOriente(tas,R[a][i],R[a+1][i+1],R[a+1][i],Nn[a][i],Nn[a+1][i+1],Nn[a+1][i],[t00[0],t00[1],t11[0],t11[1],t01[0],t01[1]],col);
    }
  }
  function couvercle(idx,sens){
    var A=an[idx], ctr=[A[3]||0,A[0],A[4]||0], nc=[0,sens,0], tc=uvCell(cell,0.5,0.5);
    for(i=0;i<seg;i++) triOriente(tas,ctr,R[idx][i],R[idx][i+1],nc,nc,nc,[tc[0],tc[1],tc[0],tc[1],tc[0],tc[1]],col);
  }
  var descend=an[0][0]>an[n-1][0];
  if(fermerHaut) couvercle(0, descend?1:-1);
  if(fermerBas) couvercle(n-1, descend?-1:1);
}
function ellipsoide(tas,cx,cy,cz,rx,ry,rz,seg,an,col,cell,v0,v1){
  v0=v0||0; if(v1===undefined) v1=1;
  var P=[], N=[], j, i;
  for(j=0;j<=an;j++){
    var th=(v0+(v1-v0)*j/an)*PI, st=Math.sin(th), ct=Math.cos(th), row=[], nr=[];
    for(i=0;i<=seg;i++){
      var ph=i/seg*2*PI-PI, dx=st*Math.cos(ph), dy=ct, dz=st*Math.sin(ph);
      row.push([cx+dx*rx, cy+dy*ry, cz+dz*rz]);
      var nx=dx/rx, ny=dy/ry, nz=dz/rz, L=Math.hypot(nx,ny,nz)||1;
      nr.push([nx/L,ny/L,nz/L]);
    }
    P.push(row); N.push(nr);
  }
  for(j=0;j<an;j++){
    var va=v0+(v1-v0)*j/an, vb=v0+(v1-v0)*(j+1)/an;
    for(i=0;i<seg;i++){
      var a=uvCell(cell,i/seg,va), b=uvCell(cell,(i+1)/seg,va), c=uvCell(cell,(i+1)/seg,vb), d=uvCell(cell,i/seg,vb);
      triOriente(tas,P[j][i],P[j][i+1],P[j+1][i+1],N[j][i],N[j][i+1],N[j+1][i+1],[a[0],a[1],b[0],b[1],c[0],c[1]],col);
      triOriente(tas,P[j][i],P[j+1][i+1],P[j+1][i],N[j][i],N[j+1][i+1],N[j+1][i],[a[0],a[1],c[0],c[1],d[0],d[1]],col);
    }
  }
}

/* ---------------- le corps ---------------- */
function construirePersonnage(o){
  var root=new THREE.Group(), corps=new THREE.Group();
  root.add(corps);
  function piece(parent,fn){
    var t=new Tas(4096); fn(t);
    var m=new THREE.Mesh(t.geo(),MAT.atlas);
    m.castShadow=true;
    parent.add(m);
    return m;
  }
  var cPeau=teinte(o.peau), cMaillot=teinte(o.maillot), cBas=teinte(o.bas), cChaus=teinte(o.chaussures);
  var blanc=[1,1,1], cChev=teinte(o.cheveux), cChaussette=teinte(o.chaussettes||0xeeeeee);
  var V=CELL.visage[o.visage||0];
  var jambe=o.long?cBas:cPeau, celJ=o.long?CELL.short:CELL.peau;

  piece(corps,function(t){
    /* bassin */
    loft(t,[[1.04,.104,.150],[.97,.111,.160],[.88,.106,.166],[.80,.080,.140]],18,cBas,CELL.short,false,true);
    /* torse et tee-shirt */
    loft(t,[[1.492,.054,.062],[1.462,.088,.152],[1.412,.116,.197],[1.32,.129,.182,.009],[1.22,.121,.166,.006],[1.10,.111,.151],[1.005,.114,.159]],20,cMaillot,CELL.tissu,false,false);
    /* cou */
    loft(t,[[1.59,.045,.047],[1.45,.051,.053]],12,cPeau,CELL.peau,false,false);
    /* tête, nez, oreilles */
    ellipsoide(t,.012,1.665,0,.098,.118,.082,22,16,blanc,V);
    ellipsoide(t,.099,1.642,0,.020,.026,.013,10,8,cPeau,CELL.peau);
    ellipsoide(t,-.004,1.660,.083,.021,.031,.009,10,8,cPeau,CELL.peau);
    ellipsoide(t,-.004,1.660,-.083,.021,.031,.009,10,8,cPeau,CELL.peau);
    if(o.casquette){
      var cc=teinte(o.casquette);
      ellipsoide(t,.004,1.702,0,.107,.080,.091,20,10,cc,CELL.casquette,0,0.5);
      ellipsoide(t,.108,1.690,0,.076,.010,.082,14,6,cc,CELL.casquette);
    } else {
      ellipsoide(t,-.006,1.673,0,.105,.125,.089,20,10,cChev,CELL.cheveux,0,0.36);
    }
  });
  var art={};
  [-1,1].forEach(function(s){
    var hanche=new THREE.Group(); hanche.position.set(0,.93,s*.092); corps.add(hanche);
    piece(hanche,function(t){
      loft(t,[[0.02,.086,.081],[-.12,.081,.076],[-.30,.064,.060],[-.42,.050,.048]],16,jambe,celJ,false,false);
      if(!o.long) loft(t,[[.07,.099,.094],[-.20,.091,.087]],16,cBas,CELL.short,false,false);
      ellipsoide(t,.022,-.42,0,.041,.047,.045,12,8,jambe,celJ);
    });
    var genou=new THREE.Group(); genou.position.set(0,-.42,0); hanche.add(genou);
    piece(genou,function(t){
      loft(t,[[0,.049,.047],[-.10,.056,.050,-.006],[-.22,.048,.044,-.004],[-.34,.034,.032],[-.43,.031,.029]],16,jambe,celJ,false,false);
      if(!o.long) loft(t,[[-.31,.037,.035],[-.44,.034,.033]],14,cChaussette,CELL.chaussette,false,false);
      else loft(t,[[-.30,.040,.038],[-.40,.042,.040]],14,cBas,CELL.short,false,false);
    });
    var cheville=new THREE.Group(); cheville.position.set(0,-.43,0); genou.add(cheville);
    piece(cheville,function(t){
      ellipsoide(t,.052,-.042,0,.135,.053,.053,18,10,cChaus,CELL.chaussure);
      ellipsoide(t,.054,-.086,0,.143,.018,.058,18,6,blanc,CELL.semelle);
    });
    var cote=s>0?'d':'g';
    art['h'+cote]=hanche; art['g'+cote]=genou; art['c'+cote]=cheville;

    var epaule=new THREE.Group(); epaule.position.set(0,1.395,s*.186); corps.add(epaule);
    piece(epaule,function(t){
      ellipsoide(t,0,.01,0,.063,.061,.065,14,8,cMaillot,CELL.tissu);
      loft(t,[[.045,.065,.065],[-.16,.058,.058]],16,cMaillot,CELL.tissu,false,false);
      loft(t,[[0,.047,.049],[-.10,.047,.049],[-.28,.036,.036]],14,cPeau,CELL.peau,false,false);
      ellipsoide(t,-.004,-.28,0,.036,.038,.036,12,8,cPeau,CELL.peau);
    });
    var coude=new THREE.Group(); coude.position.set(0,-.28,0); epaule.add(coude);
    piece(coude,function(t){
      loft(t,[[0,.037,.038],[-.07,.041,.042],[-.25,.026,.031]],14,cPeau,CELL.peau,false,false);
    });
    var poignet=new THREE.Group(); poignet.position.set(0,-.25,0); coude.add(poignet);
    piece(poignet,function(t){
      ellipsoide(t,0,-.046,0,.041,.051,.016,14,8,cPeau,CELL.peau);
      var dx=[-.026,-.009,.008,.025], lg=[.058,.071,.067,.053];
      for(var f=0;f<4;f++){
        loft(t,[[-.086,.0098,.0092,dx[f]],[-.086-lg[f]*.5,.0089,.0083,dx[f]+.001],[-.086-lg[f],.0072,.0068,dx[f]+.002]],8,cPeau,CELL.peau,false,true);
      }
      loft(t,[[-.028,.0135,.012,.040],[-.058,.0112,.010,.051],[-.084,.0090,.008,.057]],8,cPeau,CELL.peau,false,true);
    });
    art['e'+cote]=epaule; art['o'+cote]=coude; art['p'+cote]=poignet;
  });
  root.userData={corps:corps, art:art};
  return root;
}
function fusionner(root){
  root.updateMatrixWorld(true);
  var geos=[], total=0;
  root.traverse(function(o){
    if(!o.isMesh) return;
    var g=o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
    geos.push(g); total+=g.attributes.position.count;
  });
  var P=new Float32Array(total*3), N=new Float32Array(total*3), U=new Float32Array(total*2), C=new Float32Array(total*3), off=0;
  geos.forEach(function(g){
    P.set(g.attributes.position.array,off*3); N.set(g.attributes.normal.array,off*3);
    U.set(g.attributes.uv.array,off*2); C.set(g.attributes.color.array,off*3);
    off+=g.attributes.position.count; g.dispose();
  });
  var out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.BufferAttribute(P,3));
  out.setAttribute('normal',new THREE.BufferAttribute(N,3));
  out.setAttribute('uv',new THREE.BufferAttribute(U,2));
  out.setAttribute('color',new THREE.BufferAttribute(C,3));
  out.computeBoundingSphere();
  return out;
}
/* debout, un bras le long du corps, l'autre tendu à l'horizontale sur le côté */
function poserJalonneur(rig,bras){
  var a=rig.userData.art, s=bras==='d'?1:-1;
  if(bras==='n' || bras==='x'){
    var cr=(bras==='x');
    a.ed.rotation.set(cr?0.35:-0.07,0,cr?1.25:0.03); a.eg.rotation.set(cr?-0.35:0.07,0,cr?1.25:0.03);
    a.od.rotation.set(0,0,cr?1.2:0.15); a.og.rotation.set(0,0,cr?1.2:0.15);
    a.hd.rotation.x=-0.04; a.hg.rotation.x=0.04; a.cd.rotation.x=0.04; a.cg.rotation.x=-0.04;
    return;
  }
  var ep=s>0?a.ed:a.eg, co=s>0?a.od:a.og, po=s>0?a.pd:a.pg;
  var ep2=s>0?a.eg:a.ed, co2=s>0?a.og:a.od;
  ep.rotation.set(-s*PI/2*0.97,0,0.06);
  co.rotation.set(0,0,0.03);
  po.rotation.set(0,-s*PI/2,0);
  ep2.rotation.set(s*0.07,0,0.03);
  co2.rotation.set(0,0,0.15);
  a.hd.rotation.x=-0.04; a.hg.rotation.x=0.04;
  a.cd.rotation.x=0.04; a.cg.rotation.x=-0.04;
}
var CACHE_GEO={};
function geoJalon(niv,bras,vis){
  var cle=niv+bras+vis;
  if(CACHE_GEO[cle]) return CACHE_GEO[cle];
  var V=VISAGES[vis];
  var rig=construirePersonnage({maillot:niv==='r'?0xd12b1e:0xf3970d, bas:0x2b3440, long:true,
    chaussures:0x3a3f46, peau:V.ph, visage:vis, cheveux:V.ch});
  poserJalonneur(rig,bras);
  var g=fusionner(rig);
  rig.traverse(function(o){ if(o.isMesh) o.geometry.dispose(); });
  return (CACHE_GEO[cle]=g);
}
function geoJalonSimple(niv,bras){
  var cle='s'+niv+bras;
  if(CACHE_GEO[cle]) return CACHE_GEO[cle];
  var t=new Tas(4096), m=teinte(niv==='r'?0xd12b1e:0xf3970d), pant=teinte(0x2b3440), peau=teinte(0xc99a72), s=bras==='d'?1:-1;
  tube(t,0,0.93,0.095, 0,0.03,0.105, 0.085,0.05,6,pant,true,true);
  tube(t,0,0.93,-0.095, 0,0.03,-0.105, 0.085,0.05,6,pant,true,true);
  tube(t,0,0.86,0, 0,1.46,0, 0.155,0.19,8,m,true,true);
  boule(t,0.01,1.665,0,0.11,1.08,8,peau);
  if(bras==='n'){
    tube(t,0,1.40,0.19, 0.03,0.86,0.22, 0.055,0.042,6,m,true,true);
    tube(t,0,1.40,-0.19, 0.03,0.86,-0.22, 0.055,0.042,6,m,true,true);
  } else if(bras==='x'){
    tube(t,0,1.40,0.19, 0.42,1.52,-0.14, 0.055,0.042,6,m,true,true);
    tube(t,0,1.40,-0.19, 0.40,1.50,0.14, 0.055,0.042,6,m,true,true);
  } else {
    tube(t,0,1.40,s*0.19, 0,1.43,s*0.86, 0.055,0.042,6,m,true,true);
    tube(t,0,1.40,-s*0.19, 0.03,0.86,-s*0.22, 0.055,0.042,6,m,true,true);
  }
  return (CACHE_GEO[cle]=t.geo());
}
function preparerPersonnages(){
  var tex=new THREE.CanvasTexture(faireAtlas());
  if(tex.colorSpace!==undefined) tex.colorSpace=THREE.SRGBColorSpace;
  tex.anisotropy=4;
  MAT.atlas=new THREE.MeshStandardMaterial({map:tex, vertexColors:true, roughness:0.74, metalness:0});
  MAT.persoSimple=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.8, metalness:0});
  MAT.perso=MAT.persoSimple;
}
function faireJoueur(){
  var V=VISAGES[0];
  return construirePersonnage({maillot:0x2f6fd0, bas:0x1e2833, long:false, chaussures:0xe8ebef,
    peau:V.ph, visage:0, cheveux:V.ch, casquette:0x1f2937, chaussettes:0xf2f2f2});
}

/* =================================================================
   Jalonneurs : un objet par poste, synchronisé avec la carte
================================================================= */
var JOBJ=new Map(), PROXIES=[], GEO_PROXY=null, MAT_PROXY=null;
function creerObjJalon(j){
  if(!GEO_PROXY){
    GEO_PROXY=new THREE.CylinderGeometry(0.6,0.6,2.1,8); GEO_PROXY.translate(0,1.05,0);
    MAT_PROXY=new THREE.MeshBasicMaterial({visible:false});
  }
  if(j._vis===undefined) j._vis=Math.floor(Math.random()*4);
  var o={j:j, lod:new THREE.LOD(), haut:null, bas:null, proxy:new THREE.Mesh(GEO_PROXY,MAT_PROXY),
         etiq:null, n:0, cle:'', cleEtiq:'', x:0, z:0, d:0, az:0, bras:'d'};
  o.proxy.userData.o=o;
  monde.add(o.lod); monde.add(o.proxy);
  return o;
}
function majJalonneur(o,n){
  var j=o.j, x=pX(j.lo), z=pZ(j.la), y=hauteur(x,z);
  var or=CARTE.orientation(j);
  var cle=j.niv+or.bras+j._vis;
  if(cle!==o.cle){
    if(o.haut){ o.lod.remove(o.haut); o.lod.remove(o.bas); o.lod.levels.length=0; }
    o.haut=new THREE.Mesh(geoJalon(j.niv,or.bras,j._vis),MAT.atlas); o.haut.castShadow=true;
    o.bas=new THREE.Mesh(geoJalonSimple(j.niv,or.bras),MAT.persoSimple); o.bas.castShadow=true;
    o.lod.addLevel(o.haut,0); o.lod.addLevel(o.bas,60);
    o.cle=cle;
  }
  o.lod.position.set(x,y,z);
  o.lod.rotation.y=-capDeAz(or.az);
  o.proxy.position.set(x,y,z);
  var ce=n+j.niv;
  if(ce!==o.cleEtiq){
    if(o.etiq){ monde.remove(o.etiq); o.etiq.material.map.dispose(); o.etiq.material.dispose(); }
    o.etiq=etiquette(String(n), j.niv==='r'?'#d12b1e':'#f3970d', '#ffffff', '#ffffff', 74, 0.78);
    monde.add(o.etiq); o.cleEtiq=ce;
  }
  o.etiq.position.set(x,y+2.02,z);
  o.x=x; o.z=z; o.n=n; o.az=or.az; o.bras=or.bras;
  o.d=(typeof j._km==='number') ? j._km*1000 : (TRACE.length?surLeParcours(x,z).d:0);
}
function supprimerObjJalon(o){
  monde.remove(o.lod); monde.remove(o.proxy);
  if(o.etiq){ monde.remove(o.etiq); o.etiq.material.map.dispose(); o.etiq.material.dispose(); }
}
function syncJalonneurs(){
  if(!MAT.atlas || !window.CARTE) return;
  var liste=CARTE.jalons(), vus=new Set(), i;
  for(i=0;i<liste.length;i++){
    var j=liste[i]; vus.add(j);
    var o=JOBJ.get(j);
    if(!o){ o=creerObjJalon(j); JOBJ.set(j,o); }
    majJalonneur(o,i+1);
  }
  JOBJ.forEach(function(o,j){
    if(vus.has(j)) return;
    if(VUEJAL===o) sortirVueJal();
    if(SELECTION===o) deselectionner();
    supprimerObjJalon(o); JOBJ.delete(j);
  });
  PROXIES=[];
  JOBJ.forEach(function(o){ PROXIES.push(o.proxy); });
  if(joueur) majVisibilite();
  if(SELECTION) majPanneauJalon();
  remplirListe();
}

/* =================================================================
   Points remarquables, bornes, portiques
================================================================= */
var groupePois=null;
function construirePoisCarte(){
  if(groupePois){ monde.remove(groupePois); liberer(groupePois); }
  groupePois=new THREE.Group();
  var tas=new Tas(4096), acier=teinte(0xb6bcc4), liste=CARTE.pois()||[];
  POI=[];
  liste.forEach(function(p){
    var x=pX(p.lo), z=pZ(p.la), y=hauteur(x,z);
    tube(tas,x,y,z, x,y+2.6,z, 0.06,0.055,7,acier,false,true);
    var e=etiquette(p.t,'rgba(14,28,40,0.92)','#7ec8e3','#e8f4fa',0,1.15);
    e.position.set(x,y+2.6,z);
    groupePois.add(e);
    POI.push({x:x,z:z,nom:p.t});
  });
  groupePois.add(new THREE.Mesh(tas.geo(),MAT.perso));
  monde.add(groupePois);
}
function construireBornes(groupe){
  var tas=new Tas(8192), n=Math.floor(LONGUEUR/1000), k;
  for(k=1;k<=n;k++){
    var p=pointSur(k*1000), y=hauteur(p[0],p[1]);
    boiteQuad(tas,[p[0]-0.11,p[1]-0.11],[p[0]+0.11,p[1]-0.11],[p[0]+0.11,p[1]+0.11],[p[0]-0.11,p[1]+0.11],
              y,y+1.5,teinte(0xF2B33D),teinte(0xfff0c8),1);
    var e=etiquette(k+' km','rgba(30,22,6,0.92)','#F2B33D','#F2B33D',0,0.95);
    e.position.set(p[0],y+1.5,p[1]);
    groupe.add(e);
  }
  var d=pointSur(0), a=pointSur(LONGUEUR);
  portique(tas,d,capSur(0),teinte(0x2f8f4a));
  portique(tas,a,capSur(LONGUEUR),teinte(0xc0392b));
  var ed=etiquette('DÉPART','rgba(10,40,20,0.94)','#4ade80','#dcfce7',0,1.1);
  ed.position.set(d[0],hauteur(d[0],d[1])+5.2,d[1]); groupe.add(ed);
  var ea=etiquette('ARRIVÉE','rgba(44,10,10,0.94)','#fca5a5','#fee2e2',0,1.1);
  ea.position.set(a[0],hauteur(a[0],a[1])+5.2,a[1]); groupe.add(ea);
  groupe.add(new THREE.Mesh(tas.geo(),MAT.perso));
}
/* =================================================================
   Scène, vues, commandes, interface
================================================================= */
var scene=null, camera=null, renderer=null, joueur=null, lumSol=null, lumDir=null, lampHalos=null, lampTetes=null;
var envJour=null, envNuit=null, cielJour=null, cielNuit=null, horloge=null;
var nuit=false, ombres=true, collisions=true, auto=false, detail=true;
var VUE='tp', VUEPREC='tp', VUEJAL=null, SELECTION=null;
var J={x:0, z:0, cap:0, v:0, phase:0, d:0, ecart:0};
var CAM={dist:9, yaw:0, pitch:0.30, libre:0, fpPitch:-0.05, jalYaw:0, jalPitch:-0.06};
var touches={}, VITESSE=13/3.6, dAuto=0;
var ouvert=false, boucleId=0, raycaster=null, anneauSel=null;
var GEO={bats:[], voies:[], zones:[]};
function $e(id){ return document.getElementById(id); }
/* écart d'angle ramené entre -π et π, quel que soit le nombre de tours cumulés
   (le % de JavaScript garde le signe : ((a+3π)%2π)-π faisait tourner la caméra sans fin) */
function ecartAngle(a){ a=(a+Math.PI)%(Math.PI*2); if(a<0) a+=Math.PI*2; return a-Math.PI; }

function initTrois(){
  var vue=$e('e3-vue');
  renderer=new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.8));
  renderer.setSize(Math.max(10,vue.clientWidth),Math.max(10,vue.clientHeight));
  if(renderer.outputColorSpace!==undefined) renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=0.80;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  vue.appendChild(renderer.domElement);
  scene=new THREE.Scene();
  scene.fog=new THREE.Fog(0xd6e4ef, 380, 1750);
  camera=new THREE.PerspectiveCamera(56, Math.max(10,vue.clientWidth)/Math.max(10,vue.clientHeight), 0.12, 4000);
  lumSol=new THREE.HemisphereLight(0xbcd6f2, 0x5f6a48, 0.35);
  scene.add(lumSol);
  lumDir=new THREE.DirectionalLight(0xfff0d4, 2.15);
  lumDir.position.set(-160,230,110);
  lumDir.castShadow=true;
  lumDir.shadow.mapSize.set(4096,4096);
  var sc=lumDir.shadow.camera;
  sc.left=-85; sc.right=85; sc.top=85; sc.bottom=-85; sc.near=30; sc.far=520;
  lumDir.shadow.bias=-0.0004;
  lumDir.shadow.normalBias=0.035;
  sc.updateProjectionMatrix();
  scene.add(lumDir); scene.add(lumDir.target);
  scene.add(monde);
  horloge=new THREE.Clock();
  raycaster=new THREE.Raycaster();
  anneauSel=new THREE.Mesh(new THREE.RingGeometry(0.62,0.84,40),
    new THREE.MeshBasicMaterial({color:0xF2B33D, transparent:true, opacity:0.95, depthWrite:false, side:THREE.DoubleSide}));
  anneauSel.rotation.x=-PI/2; anneauSel.visible=false; anneauSel.renderOrder=7;
  scene.add(anneauSel);
  addEventListener('resize',redimensionner);
}
function redimensionner(){
  if(!renderer) return;
  var v=$e('e3-vue'), w=Math.max(10,v.clientWidth), h=Math.max(10,v.clientHeight);
  camera.aspect=w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}
function preparerCiels(){
  var pm=new THREE.PMREMGenerator(renderer);
  pm.compileEquirectangularShader();
  cielJour=textureDe(faireCiel(false),1,1); cielJour.mapping=THREE.EquirectangularReflectionMapping;
  envJour=pm.fromEquirectangular(cielJour).texture;
  cielNuit=textureDe(faireCiel(true),1,1); cielNuit.mapping=THREE.EquirectangularReflectionMapping;
  envNuit=pm.fromEquirectangular(cielNuit).texture;
  pm.dispose();
  appliquerCiel();
}
function appliquerCiel(){
  if(!scene || !cielJour) return;
  scene.background=nuit?cielNuit:cielJour;
  scene.environment=nuit?envNuit:envJour;
  scene.environmentIntensity=nuit?0.5:0.78;
  scene.fog.color=new THREE.Color(nuit?0x0e1626:0xd6e4ef);
  scene.fog.near=nuit?70:380; scene.fog.far=nuit?620:1750;
  lumSol.intensity=nuit?0.2:0.35;
  lumSol.color=new THREE.Color(nuit?0x3a5480:0xbcd6f2);
  lumSol.groundColor=new THREE.Color(nuit?0x141a26:0x5f6a48);
  lumDir.color=new THREE.Color(nuit?0x9ab4e0:0xfff0d4);
  lumDir.intensity=nuit?0.42:2.15;
  renderer.toneMappingExposure=nuit?1.05:0.80;
  if(MAT.trace) MAT.trace.emissive=new THREE.Color(nuit?0x7a5a10:0x3a2a06);
  if(lampHalos) lampHalos.visible=nuit;
  if(MAT.fenetresNuit) MAT.fenetresNuit.forEach(function(m){ m.emissiveIntensity=nuit?1:0; });
  var b=$e('e3-nuit'); if(b) b.classList.toggle('on',nuit);
}

/* ---------------- coureur ---------------- */
function placerJoueur(d){
  var p=pointSur(d);
  J.x=p[0]; J.z=p[1]; J.cap=capSur(d); J.v=0; dAuto=d;
  CAM.yaw=J.cap; CAM.libre=0;
  if(joueur) majJoueur(0);
}
function majJoueur(dt){
  var y=hauteur(J.x,J.z), ec=J.ecart;
  if(ec<1.2) y+=0.19; else if(ec<2.2) y+=0.19*(2.2-ec);
  joueur.position.set(J.x,y,J.z);
  joueur.rotation.y=-J.cap;
  var u=joueur.userData, a=u.art;
  var vit=Math.abs(J.v);
  J.phase+=dt*(1.6+Math.min(vit,9)*1.25);
  var amp=Math.min(1,vit/4.4);
  var s=Math.sin(J.phase*2), c2=Math.cos(J.phase*2);
  a.hd.rotation.z=-s*0.72*amp;          a.hg.rotation.z=s*0.72*amp;
  a.gd.rotation.z=-Math.max(0,s-0.05)*1.6*amp-0.04;
  a.gg.rotation.z=-Math.max(0,-s-0.05)*1.6*amp-0.04;
  a.cd.rotation.z=Math.max(0,s)*0.35*amp; a.cg.rotation.z=Math.max(0,-s)*0.35*amp;
  a.ed.rotation.z=s*0.6*amp;            a.eg.rotation.z=-s*0.6*amp;
  a.ed.rotation.x=-0.09;                a.eg.rotation.x=0.09;
  a.od.rotation.z=0.22+1.15*amp;        a.og.rotation.z=0.22+1.15*amp;
  u.corps.position.y=Math.abs(c2)*0.05*amp-0.02*amp;
  u.corps.rotation.z=-0.13*amp;
}
function majVisibilite(){
  JOBJ.forEach(function(o){ o.lod.visible=!(VUE==='jal' && VUEJAL===o); });
  if(joueur) joueur.visible=(VUE!=='fp');
}

/* ---------------- collisions ---------------- */
function libre(x,z){
  if(!collisions) return true;
  var r=0.42;
  return !(bloquer(x,z)||bloquer(x+r,z)||bloquer(x-r,z)||bloquer(x,z+r)||bloquer(x,z-r));
}
function deplacer(dx,dz){
  if(libre(J.x+dx,J.z+dz)){ J.x+=dx; J.z+=dz; return; }
  if(libre(J.x+dx,J.z)){ J.x+=dx; return; }
  if(libre(J.x,J.z+dz)){ J.z+=dz; }
}
function teleporter(x,z){
  x=Math.max(XMIN+5,Math.min(XMAX-5,x)); z=Math.max(ZMIN+5,Math.min(ZMAX-5,z));
  if(bloquer(x,z)){
    var ok=false;
    for(var r=2;r<60 && !ok;r+=2) for(var k=0;k<16 && !ok;k++){
      var a=k/16*2*PI, nx=x+Math.cos(a)*r, nz=z+Math.sin(a)*r;
      if(!bloquer(nx,nz)){ x=nx; z=nz; ok=true; }
    }
  }
  if(VUE==='jal') sortirVueJal();
  auto=false; $e('e3-auto').classList.remove('on');
  J.x=x; J.z=z; J.v=0;
  var s=surLeParcours(x,z);
  dire(s.ecart<25 ? 'Te voilà au km '+(s.d/1000).toFixed(2).replace('.',',')+'.' : 'Te voilà à '+Math.round(s.ecart)+' m du parcours.');
}

/* ---------------- vues ---------------- */
function majBoutonsVue(){
  var b=$e('e3-vuep');
  b.textContent = VUE==='tp' ? '👤 3e personne' : (VUE==='fp' ? '👁 1re personne' : '👁 Jalonneur');
  b.classList.toggle('on',VUE!=='tp');
}
function basculerVue(){
  if(VUE==='jal'){ sortirVueJal(); return; }
  VUE = VUE==='tp' ? 'fp' : 'tp';
  camera.fov=(VUE==='fp')?80:56; camera.updateProjectionMatrix();
  CAM.fpPitch=-0.05;
  majVisibilite(); majBoutonsVue();
  dire(VUE==='fp' ? 'Première personne : tu vois par les yeux du coureur. F pour revenir.' : 'Troisième personne.');
}
function entrerVueJal(o){
  if(!o) return;
  if(VUE!=='jal') VUEPREC=VUE;
  VUE='jal'; VUEJAL=o; CAM.jalYaw=0; CAM.jalPitch=-0.06;
  auto=false; $e('e3-auto').classList.remove('on');
  camera.fov=80; camera.updateProjectionMatrix();
  majVisibilite(); majBoutonsVue(); majPanneauJalon();
  dire('Tu vois ce que voit le jalonneur n° '+o.n+'. Glisse pour tourner la tête, A et E pour pivoter, molette pour zoomer, Échap pour revenir.');
}
function sortirVueJal(){
  VUE=(VUEPREC==='jal')?'tp':VUEPREC; VUEJAL=null;
  camera.fov=(VUE==='fp')?80:56; camera.updateProjectionMatrix();
  majVisibilite(); majBoutonsVue(); majPanneauJalon();
}

/* ---------------- sélection d'un jalonneur ---------------- */
function pointCardinal(az){
  var n=['N','NE','E','SE','S','SO','O','NO'];
  return n[Math.round(az/45)%8];
}
function selectionner(o){
  if(!o) return;
  SELECTION=o;
  $e('e3-jp').hidden=false;
  majPanneauJalon();
}
function deselectionner(){
  if(VUE==='jal') sortirVueJal();
  SELECTION=null;
  $e('e3-jp').hidden=true;
  if(anneauSel) anneauSel.visible=false;
}
function majPanneauJalon(){
  var o=SELECTION;
  if(!o){ if(anneauSel) anneauSel.visible=false; return; }
  $e('e3-jp-n').textContent=o.n;
  $e('e3-jp-km').textContent=(o.d/1000).toFixed(2).replace('.',',');
  var r=o.j.niv==='r', bn=$e('e3-jp-niv');
  bn.textContent=r?'● Indispensable':'● Facultatif';
  bn.className='e3-niv '+(r?'r':'o');
  if(document.activeElement!==$e('e3-jp-az')) $e('e3-jp-az').value=Math.round(o.az);
  $e('e3-jp-azv').textContent=Math.round(o.az)+'° '+pointCardinal(o.az);
  ['n','g','d','x'].forEach(function(b){ $e('e3-jp-'+b).classList.toggle('on',o.bras===b); });
  $e('e3-jp-auto').textContent = (o.j.az===undefined) ? 'Orientation automatique (face aux coureurs)' : 'Remettre face aux coureurs';
  var by=$e('e3-jp-yeux');
  by.textContent=(VUE==='jal'&&VUEJAL===o)?'↩ Quitter sa vue':'👁 Voir par ses yeux';
  by.classList.toggle('on',VUE==='jal'&&VUEJAL===o);
  anneauSel.visible=true;
  anneauSel.position.set(o.x,hauteur(o.x,o.z)+0.3,o.z);
}
function placerVisuelJalon(o,x,z){
  var y=hauteur(x,z);
  o.lod.position.set(x,y,z); o.proxy.position.set(x,y,z);
  if(o.etiq) o.etiq.position.set(x,y+2.02,z);
  if(SELECTION===o){ anneauSel.position.set(x,y+0.3,z); }
}
function allerAuJalon(o){
  var d=Math.max(0,o.d-8), p=pointSur(d);
  if(VUE==='jal') sortirVueJal();
  auto=false; $e('e3-auto').classList.remove('on');
  J.x=p[0]; J.z=p[1]; J.cap=Math.atan2(o.z-p[1],o.x-p[0]); J.v=0;
  CAM.yaw=J.cap; CAM.libre=0;
  selectionner(o);
}

/* ---------------- viser dans la scène ---------------- */
function ndc(ev){
  var r=renderer.domElement.getBoundingClientRect();
  return new THREE.Vector2(((ev.clientX-r.left)/r.width)*2-1, -((ev.clientY-r.top)/r.height)*2+1);
}
function viser(ev){
  if(!PROXIES.length) return null;
  raycaster.setFromCamera(ndc(ev),camera);
  var h=raycaster.intersectObjects(PROXIES,false);
  return h.length ? h[0].object.userData.o : null;
}
function solSousPointeur(ev){
  raycaster.setFromCamera(ndc(ev),camera);
  var o=raycaster.ray.origin, d=raycaster.ray.direction, t=0.3, prev=0;
  for(var k=0;k<4000;k++){
    var x=o.x+d.x*t, y=o.y+d.y*t, z=o.z+d.z*t;
    if(x<XMIN||x>XMAX||z<ZMIN||z>ZMAX){ if(t>30) return null; }
    else if(y<=hauteur(x,z)){
      var a=prev, b=t;
      for(var q=0;q<14;q++){ var m=(a+b)/2; if(o.y+d.y*m<=hauteur(o.x+d.x*m,o.z+d.z*m)) b=m; else a=m; }
      return {x:o.x+d.x*b, z:o.z+d.z*b};
    }
    prev=t; t+= t<40 ? 0.3 : t*0.01;
    if(t>2600) break;
  }
  return null;
}

/* ---------------- commandes ---------------- */
function brancherInterface(){
  addEventListener('keydown',function(e){
    if(!ouvert) return;
    var tg=e.target;
    if(tg && ((tg.tagName==='INPUT' && tg.type!=='range') || tg.tagName==='TEXTAREA' || tg.tagName==='SELECT')) return;
    var k=e.key.toLowerCase();
    touches[k]=true;
    if(k.indexOf('arrow')===0 || k===' '){ e.preventDefault(); if(tg && tg.type==='range') tg.blur(); }
    if(e.repeat) return;
    if(k==='f') basculerVue();
    else if(k==='c'){ collisions=!collisions; dire(collisions?'Collisions activées':'Collisions désactivées : tu traverses les murs'); }
    else if(k==='n') basculerNuit();
    else if(k==='o'){ ombres=!ombres; lumDir.castShadow=ombres; dire(ombres?'Ombres activées':'Ombres désactivées'); }
    else if(k==='v') basculerAuto();
    else if(k==='r'){ if(VUE==='jal') sortirVueJal(); placerJoueur(0); dire('Retour au départ'); }
    else if(k==='h'||k==='?') basculerAide();
    else if(k==='p') basculerPanneau();
    else if(k==='g') basculerDetail();
    else if(k==='m') basculerCarteGlobale();
    else if(k==='escape') echap();
  });
  addEventListener('keyup',function(e){ touches[e.key.toLowerCase()]=false; });
  addEventListener('blur',function(){ touches={}; });

  var vue=$e('e3-vue'), glisse=null, glisseJal=null, tactile=('ontouchstart' in window);
  vue.addEventListener('pointerdown',function(e){
    if(e.button!==0) return;
    if(VUE!=='jal'){
      var o=viser(e);
      if(o){
        glisseJal={o:o, x0:e.clientX, y0:e.clientY, bouge:false, p:null, id:e.pointerId};
        try{ vue.setPointerCapture(e.pointerId); }catch(er){}
        return;
      }
    }
    glisse={x:e.clientX, y:e.clientY, x0:e.clientX, y0:e.clientY, id:e.pointerId,
            gauche: tactile && VUE!=='jal' && e.clientX<vue.clientWidth*0.38};
    try{ vue.setPointerCapture(e.pointerId); }catch(er){}
  });
  vue.addEventListener('pointermove',function(e){
    if(glisseJal && glisseJal.id===e.pointerId){
      if(!glisseJal.bouge && Math.hypot(e.clientX-glisseJal.x0,e.clientY-glisseJal.y0)<5) return;
      glisseJal.bouge=true;
      vue.style.cursor='grabbing';
      var p=solSousPointeur(e);
      if(p && !bloquer(p.x,p.z)){ glisseJal.p=p; placerVisuelJalon(glisseJal.o,p.x,p.z); }
      return;
    }
    if(!glisse){
      if(VUE!=='jal' && e.pointerType==='mouse') vue.style.cursor = viser(e) ? 'pointer' : '';
      return;
    }
    if(glisse.id!==e.pointerId) return;
    var dx=e.clientX-glisse.x, dy=e.clientY-glisse.y;
    if(glisse.gauche){
      var tx=e.clientX-glisse.x0, ty=e.clientY-glisse.y0;
      touches.__av=ty<-8; touches.__ar=ty>8; touches.__ga=tx<-8; touches.__dr=tx>8;
      return;
    }
    glisse.x=e.clientX; glisse.y=e.clientY;
    if(VUE==='tp'){ CAM.yaw+=dx*0.0055; CAM.pitch=Math.max(-0.30,Math.min(1.35,CAM.pitch+dy*0.004)); CAM.libre=2.2; }
    else if(VUE==='fp'){ CAM.yaw+=dx*0.0045; CAM.fpPitch=Math.max(-1.3,Math.min(1.3,CAM.fpPitch-dy*0.004)); }
    else { CAM.jalYaw+=dx*0.0045; CAM.jalPitch=Math.max(-1.3,Math.min(1.3,CAM.jalPitch-dy*0.004)); }
  });
  function fin(e){
    vue.style.cursor='';
    if(glisseJal && glisseJal.id===e.pointerId){
      var g=glisseJal; glisseJal=null;
      if(g.bouge && g.p){
        var j=g.o.j;
        j.la=laDeZ(g.p.z); j.lo=loDeX(g.p.x);
        CARTE.jalonsModifies();
        var o2=JOBJ.get(j);
        if(o2){ selectionner(o2); dire('Jalonneur n° '+o2.n+' déplacé. La carte est déjà à jour.'); }
      } else if(g.bouge){ majJalonneur(g.o,g.o.n); }
      else selectionner(g.o);
      return;
    }
    if(glisse && glisse.id===e.pointerId){
      var clic=!glisse.gauche && Math.hypot(e.clientX-glisse.x0,e.clientY-glisse.y0)<4;
      touches.__av=touches.__ar=touches.__ga=touches.__dr=false;
      glisse=null;
      if(clic && SELECTION && VUE!=='jal') deselectionner();
    }
  }
  vue.addEventListener('pointerup',fin);
  vue.addEventListener('pointercancel',fin);
  vue.addEventListener('wheel',function(e){
    e.preventDefault();
    if(VUE==='tp') CAM.dist=Math.max(1.8,Math.min(220,CAM.dist*(1+(e.deltaY>0?0.13:-0.13))));
    else { camera.fov=Math.max(16,Math.min(100,camera.fov*(1+(e.deltaY>0?0.08:-0.08)))); camera.updateProjectionMatrix(); }
  },{passive:false});

  var cv=$e('e3-vitesse');
  cv.addEventListener('input',function(){ VITESSE=(+cv.value)/3.6; $e('e3-kmh').textContent=cv.value; });
  cv.addEventListener('change',function(){ cv.blur(); });
  VITESSE=(+cv.value)/3.6;

  $e('e3-carte').onclick=function(){ window.ESPACE3D.fermer(); };
  $e('e3-vuep').onclick=basculerVue;
  $e('e3-auto').onclick=basculerAuto;
  $e('e3-nuit').onclick=basculerNuit;
  $e('e3-detail').onclick=basculerDetail;
  $e('e3-depart').onclick=function(){ if(VUE==='jal') sortirVueJal(); placerJoueur(0); dire('Retour au départ'); };
  $e('e3-liste').onclick=basculerPanneau;
  $e('e3-aide').onclick=basculerAide;
  $e('e3-aide-fermer').onclick=basculerAide;
  $e('e3-haute').onclick=function(){
    if(VUE!=='tp'){ if(VUE==='jal') sortirVueJal(); VUE='tp'; majVisibilite(); majBoutonsVue(); }
    CAM.dist = CAM.dist<40 ? 95 : 9; CAM.pitch = CAM.dist>40 ? 0.9 : 0.30;
  };
  $e('e3-save').onclick=function(){
    dire('Enregistrement…');
    CARTE.enregistrer().then(function(){ dire('Tracé et jalonneurs enregistrés.'); })
      .catch(function(err){ dire((err&&err.code==='indisponible')?'Enregistrement indisponible dans cette vue.':'Échec de l’enregistrement.'); });
  };
  $e('e3-ajout').onclick=function(){
    if(VUE==='jal') sortirVueJal();
    var x=J.x-Math.sin(J.cap)*2.5, z=J.z+Math.cos(J.cap)*2.5;
    if(bloquer(x,z)){ x=J.x; z=J.z; }
    var j=CARTE.ajouterJalon(laDeZ(z),loDeX(x),'r');
    var o=JOBJ.get(j);
    if(o){ selectionner(o); dire('Jalonneur n° '+o.n+' posé à côté de toi. Tire-le pour l’ajuster, oriente-le dans le panneau.'); }
  };
  /* panneau du jalonneur */
  $e('e3-jp-fermer').onclick=deselectionner;
  $e('e3-jp-niv').onclick=function(){ if(!SELECTION) return; var j=SELECTION.j; j.niv=j.niv==='r'?'o':'r'; CARTE.jalonsModifies(); };
  var az=$e('e3-jp-az');
  az.addEventListener('input',function(){
    var o=SELECTION; if(!o) return;
    if(!o.j.bras) o.j.bras=o.bras;
    o.j.az=+az.value; o.az=o.j.az;
    o.lod.rotation.y=-capDeAz(o.az);
    $e('e3-jp-azv').textContent=Math.round(o.az)+'° '+pointCardinal(o.az);
  });
  az.addEventListener('change',function(){ CARTE.jalonsModifies(); az.blur(); });
  function tourner(d){ var o=SELECTION; if(!o) return; if(!o.j.bras) o.j.bras=o.bras; o.j.az=((Math.round(o.az)+d)%360+360)%360; CARTE.jalonsModifies(); }
  $e('e3-jp-moins').onclick=function(){ tourner(-15); };
  $e('e3-jp-plus').onclick=function(){ tourner(15); };
  $e('e3-jp-auto').onclick=function(){ if(!SELECTION) return; delete SELECTION.j.az; delete SELECTION.j.bras; CARTE.jalonsModifies(); dire('Orientation recalculée : face aux coureurs, bras vers la suite du parcours.'); };
  function bras(b){ var o=SELECTION; if(!o) return; if(o.j.az===undefined) o.j.az=Math.round(o.az); o.j.bras=b; CARTE.jalonsModifies(); }
  $e('e3-jp-g').onclick=function(){ bras('g'); };
  $e('e3-jp-d').onclick=function(){ bras('d'); };
  $e('e3-jp-n').onclick=function(){ bras('n'); };
  $e('e3-jp-x').onclick=function(){ bras('x'); };
  $e('e3-jp-yeux').onclick=function(){ if(VUE==='jal') sortirVueJal(); else entrerVueJal(SELECTION); };
  $e('e3-jp-suppr').onclick=function(){
    var o=SELECTION; if(!o) return;
    var n=o.n; deselectionner(); CARTE.supprimerJalon(o.j);
    dire('Jalonneur n° '+n+' supprimé, sur la carte aussi.');
  };
  /* liste */
  $e('e3-liste-j').addEventListener('click',function(e){
    var b=e.target.closest ? e.target.closest('.e3-jl') : null;
    if(!b) return;
    var n=+b.dataset.n, cible=null;
    JOBJ.forEach(function(o){ if(o.n===n) cible=o; });
    if(cible){ allerAuJalon(cible); dire('Jalonneur n° '+n+' — km '+(cible.d/1000).toFixed(2).replace('.',',')); }
  });
  /* minicarte et carte globale */
  $e('e3-global').onclick=basculerCarteGlobale;
  $e('e3-mini').addEventListener('dblclick',function(e){
    var r=e.target.getBoundingClientRect();
    var fx=(e.clientX-r.left)/r.width-0.5, fz=(e.clientY-r.top)/r.height-0.5;
    teleporter(J.x+fx*2*MINIR, J.z+fz*2*MINIR);
  });
  brancherCarteGlobale();
}
function echap(){
  if(!$e('e3-gm').hidden){ fermerCarteGlobale(); return; }
  if(!$e('e3-aidem').hidden){ $e('e3-aidem').hidden=true; return; }
  if(VUE==='jal'){ sortirVueJal(); return; }
  if(SELECTION){ deselectionner(); return; }
  if(VUE==='fp'){ basculerVue(); }
}
function basculerAuto(){
  if(VUE==='jal') sortirVueJal();
  auto=!auto;
  if(auto) dAuto=surLeParcours(J.x,J.z).d;
  $e('e3-auto').classList.toggle('on',auto);
  dire(auto?'Visite guidée : le coureur suit le parcours':'Visite guidée arrêtée');
}
function basculerNuit(){ nuit=!nuit; appliquerCiel(); }
function basculerDetail(){
  detail=!detail; ombres=detail; lumDir.castShadow=detail;
  renderer.setPixelRatio(detail?Math.min(devicePixelRatio||1,1.8):1);
  $e('e3-detail').textContent=detail?'✦ Détails':'✦ Fluide';
  dire(detail?'Rendu détaillé : ombres et pleine résolution':'Rendu fluide : ombres coupées');
}
function basculerAide(){ var m=$e('e3-aidem'); m.hidden=!m.hidden; }
function basculerPanneau(){
  var p=$e('e3-panneau');
  p.classList.toggle('replie');
  $e('e3-liste').classList.toggle('on',!p.classList.contains('replie'));
}

/* ---------------- boucle ---------------- */
var tHud=0;
function boucle(){
  if(!ouvert){ boucleId=0; return; }
  boucleId=requestAnimationFrame(boucle);
  var dt=Math.min(0.06,horloge.getDelta());
  var av=touches['arrowup']||touches['z']||touches['w']||touches.__av;
  var ar=touches['arrowdown']||touches['s']||touches.__ar;
  var ga=touches['arrowleft']||touches['q']||touches.__ga;
  var dr=touches['arrowright']||touches['d']||touches.__dr;
  var vite=touches['shift'], lent=touches['control']||touches['alt'];
  var rot=(touches['e']?1:0)-(touches['a']?1:0);
  if(rot){
    if(VUE==='jal') CAM.jalYaw+=rot*1.9*dt;
    else { CAM.yaw+=rot*1.9*dt; CAM.libre=1.2; }
  }
  var recentrer=false;
  if(VUE==='jal'){ J.v*=0.85; }
  else if(auto){
    var vv=VITESSE*(vite?1.6:(lent?0.42:1));
    dAuto+=vv*dt;
    if(dAuto>=LONGUEUR){ dAuto=LONGUEUR; auto=false; $e('e3-auto').classList.remove('on'); dire('Arrivée !'); }
    var p=pointSur(dAuto);
    J.x=p[0]; J.z=p[1]; J.cap=capSur(dAuto); J.v=vv;
    recentrer=true;
    if(av||ar||ga||dr) basculerAuto();
  } else {
    var fx=(av?1:0)-(ar?1:0), sx=(dr?1:0)-(ga?1:0), cible=0;
    if(fx||sx){
      var nn=Math.hypot(fx,sx); fx/=nn; sx/=nn;
      var dx=Math.cos(CAM.yaw)*fx-Math.sin(CAM.yaw)*sx, dz=Math.sin(CAM.yaw)*fx+Math.cos(CAM.yaw)*sx;
      var vise=Math.atan2(dz,dx), ecart=ecartAngle(vise-J.cap);
      J.cap+=ecart*Math.min(1,dt*10);
      cible=VITESSE*(vite?1.6:(lent?0.42:1));
      if(fx>0 && sx===0) recentrer=true;
    }
    J.v+=(cible-J.v)*Math.min(1,dt*6);
    if(J.v>0.01) deplacer(Math.cos(J.cap)*J.v*dt, Math.sin(J.cap)*J.v*dt);
  }
  var sp=surLeParcours(J.x,J.z); J.d=sp.d; J.ecart=sp.ecart;
  majJoueur(dt);

  var cx0, cz0;
  if(VUE==='jal' && VUEJAL){
    var o=VUEJAL, yaw=capDeAz(o.az)+CAM.jalYaw, pt=CAM.jalPitch;
    var ey=hauteur(o.x,o.z)+1.66;
    camera.position.set(o.x+Math.cos(yaw)*0.13, ey, o.z+Math.sin(yaw)*0.13);
    camera.lookAt(camera.position.x+Math.cos(yaw)*Math.cos(pt), ey+Math.sin(pt), camera.position.z+Math.sin(yaw)*Math.cos(pt));
    cx0=o.x; cz0=o.z;
  } else if(VUE==='fp'){
    var ey2=joueur.position.y+1.63+Math.abs(Math.sin(J.phase*2))*0.035*Math.min(1,J.v/4.4);
    var yw=CAM.yaw, pp=CAM.fpPitch;
    camera.position.set(J.x+Math.cos(yw)*0.15, ey2, J.z+Math.sin(yw)*0.15);
    camera.lookAt(camera.position.x+Math.cos(yw)*Math.cos(pp), ey2+Math.sin(pp), camera.position.z+Math.sin(yw)*Math.cos(pp));
    cx0=J.x; cz0=J.z;
  } else {
    if(CAM.libre>0) CAM.libre-=dt;
    else if(recentrer){ var d2=ecartAngle(J.cap-CAM.yaw); CAM.yaw+=d2*Math.min(1,dt*1.4); }
    /* la caméra garde sa distance et son angle même derrière un bâtiment :
       le coureur reste visible en silhouette à travers les murs */
    var hy=joueur.position.y+1.35, cd=CAM.dist, cp=CAM.pitch;
    var ccx=J.x-Math.cos(CAM.yaw)*Math.cos(cp)*cd, ccz=J.z-Math.sin(CAM.yaw)*Math.cos(cp)*cd;
    var ccy=hy+Math.sin(cp)*cd+0.55, sol=hauteur(ccx,ccz)+1.3;
    if(ccy<sol) ccy=sol;
    camera.position.set(ccx,ccy,ccz);
    camera.lookAt(J.x,hy+0.25,J.z);
    cx0=J.x; cz0=J.z;
  }
  if(ombres){
    var hb=hauteur(cx0,cz0);
    lumDir.target.position.set(cx0,hb,cz0);
    lumDir.position.set(cx0-150,hb+215,cz0+105);
    lumDir.target.updateMatrixWorld();
  }
  animerDecor(dt,cx0,cz0);
  renderer.render(scene,camera);
  tHud+=dt;
  if(tHud>0.12){ tHud=0; majHud(); dessinerMini(); if(!$e('e3-gm').hidden) dessinerGM(); }
}

/* ---------------- affichage ---------------- */
function majHud(){
  $e('e3-km').textContent=(J.d/1000).toFixed(2);
  $e('e3-alt').textContent=Math.round(hauteur(J.x,J.z));
  $e('e3-vit').textContent=(Math.abs(J.v)*3.6).toFixed(1);
  $e('e3-ecart').textContent=Math.round(J.ecart);
  $e('e3-ecart').parentNode.classList.toggle('loin',J.ecart>25);
  $e('e3-total').textContent=(LONGUEUR/1000).toFixed(2);
  var best=null, bd=1e9;
  JOBJ.forEach(function(o){ var dd=Math.hypot(o.x-J.x,o.z-J.z); if(dd<bd){ bd=dd; best=o; } });
  var hj=$e('e3-jal');
  if(best){ hj.textContent='n° '+best.n+' à '+Math.round(bd)+' m'; hj.className=best.j.niv==='r'?'rouge':'orange'; }
  else { hj.textContent='—'; hj.className=''; }
  var mod=CARTE.estModifie(), bs=$e('e3-save');
  bs.classList.toggle('modifie',mod);
  bs.textContent=mod?'Enregistrer':'Enregistré';
}
var MINIR=260;
function dessinerMini(){
  var c=$e('e3-mini'), g=c.getContext('2d'), S=220, ech=S/(MINIR*2), i;
  if(c.width!==S){ c.width=c.height=S; }
  g.clearRect(0,0,S,S);
  g.fillStyle=nuit?'rgba(8,14,26,0.86)':'rgba(16,22,32,0.80)';
  g.beginPath(); g.arc(S/2,S/2,S/2-1,0,7); g.fill();
  g.save(); g.beginPath(); g.arc(S/2,S/2,S/2-2,0,7); g.clip();
  function PX(x){ return S/2+(x-J.x)*ech; } function PZ(z){ return S/2+(z-J.z)*ech; }
  g.fillStyle='rgba(110,125,150,0.55)'; g.beginPath();
  for(i=0;i<GEO.bats.length;i++){
    var b=GEO.bats[i];
    if(b.x1<J.x-MINIR||b.x0>J.x+MINIR||b.z1<J.z-MINIR||b.z0>J.z+MINIR) continue;
    var p=b.p;
    g.moveTo(PX(p[0]),PZ(p[1]));
    for(var q=2;q<p.length;q+=2) g.lineTo(PX(p[q]),PZ(p[q+1]));
    g.closePath();
  }
  g.fill();
  g.strokeStyle='#F2B33D'; g.lineWidth=2.6; g.beginPath();
  var dem=false;
  for(i=0;i<TRACE.length;i++){
    var tx=PX(TRACE[i][0]), tz=PZ(TRACE[i][1]);
    if(tx<-40||tx>S+40||tz<-40||tz>S+40){ dem=false; continue; }
    if(!dem){ g.moveTo(tx,tz); dem=true; } else g.lineTo(tx,tz);
  }
  g.stroke();
  JOBJ.forEach(function(o){
    var ox=PX(o.x), oz=PZ(o.z);
    if(ox<0||ox>S||oz<0||oz>S) return;
    g.fillStyle=o.j.niv==='r'?'#ff4b3e':'#ffab2e';
    g.beginPath(); g.arc(ox,oz,SELECTION===o?5.5:3.6,0,7); g.fill();
  });
  g.restore();
  g.save(); g.translate(S/2,S/2);
  var capAff = VUE==='jal'&&VUEJAL ? null : ((VUE==='fp')?CAM.yaw:J.cap);
  if(capAff!==null){
    g.rotate(capAff+PI/2);
    g.fillStyle='#ffffff';
    g.beginPath(); g.moveTo(0,-9); g.lineTo(6,7); g.lineTo(0,4); g.lineTo(-6,7); g.closePath(); g.fill();
  }
  g.restore();
  g.strokeStyle='rgba(255,255,255,0.3)'; g.lineWidth=2; g.beginPath(); g.arc(S/2,S/2,S/2-1,0,7); g.stroke();
  g.fillStyle='rgba(255,255,255,0.65)'; g.font='11px system-ui'; g.fillText('N',S/2-4,13);
}
function remplirListe(){
  var arr=[];
  JOBJ.forEach(function(o){ arr.push(o); });
  arr.sort(function(a,b){ return a.n-b.n; });
  var h='', nr=0;
  arr.forEach(function(o){
    if(o.j.niv==='r') nr++;
    h+='<button class="e3-jl '+(o.j.niv==='r'?'r':'o')+'" data-n="'+o.n+'"><b>'+o.n+'</b><span>'+(o.d/1000).toFixed(2)+' km</span>'
      +'<em>bras '+({d:'droit',g:'gauche',n:'aucun',x:'croisés'}[o.bras]||'droit')+'</em></button>';
  });
  $e('e3-liste-j').innerHTML=h;
  $e('e3-njal').textContent=arr.length;
  $e('e3-nrouge').textContent=nr;
  $e('e3-norange').textContent=arr.length-nr;
}
var minuteurToast=0;
function dire(msg){
  var e=$e('e3-toast');
  if(!e) return;
  clearTimeout(minuteurToast);
  e.textContent=msg; e.hidden=false;
  minuteurToast=setTimeout(function(){ e.hidden=true; },3800);
}

/* ---------------- carte globale ---------------- */
var GM={e:1, ox:0, oy:0, glisse:null};
function basculerCarteGlobale(){ if($e('e3-gm').hidden) ouvrirCarteGlobale(); else fermerCarteGlobale(); }
function ouvrirCarteGlobale(){
  var el=$e('e3-gm'); el.hidden=false;
  var cv=$e('e3-gmc'), dpr=Math.min(2,devicePixelRatio||1);
  cv.width=Math.round(el.clientWidth*dpr); cv.height=Math.round(el.clientHeight*dpr);
  GM.e=Math.min(cv.width/(XMAX-XMIN), cv.height/(ZMAX-ZMIN))*0.94;
  GM.ox=cv.width/2-((XMIN+XMAX)/2)*GM.e;
  GM.oy=cv.height/2-((ZMIN+ZMAX)/2)*GM.e;
  dessinerGM();
}
function fermerCarteGlobale(){ var el=$e('e3-gm'); if(el) el.hidden=true; }
function dessinerGM(){
  var cv=$e('e3-gmc'), g=cv.getContext('2d'), e=GM.e, ox=GM.ox, oy=GM.oy, i, q;
  g.fillStyle='#0f1520'; g.fillRect(0,0,cv.width,cv.height);
  function sx(x){ return x*e+ox; } function sy(z){ return z*e+oy; }
  var cz={w:'#1f4d6b',f:'#1c3524',g:'#213d28',p:'#23452a',k:'#2a303a',c:'#253528',a:'#37331f',i:'#2a2e35'};
  GEO.zones.forEach(function(zn){
    var col=cz[zn.k]; if(!col) return;
    g.fillStyle=col; g.beginPath();
    g.moveTo(sx(zn.p[0]),sy(zn.p[1]));
    for(q=2;q<zn.p.length;q+=2) g.lineTo(sx(zn.p[q]),sy(zn.p[q+1]));
    g.closePath(); g.fill();
  });
  g.lineCap='round'; g.lineJoin='round';
  GEO.voies.forEach(function(v){
    g.strokeStyle= v.k==='r' ? '#5a6780' : (v.k==='v' ? '#4d4843' : '#6d5c46');
    g.lineWidth=Math.max(1, v.w*e);
    g.beginPath(); g.moveTo(sx(v.p[0]),sy(v.p[1]));
    for(q=2;q<v.p.length;q+=2) g.lineTo(sx(v.p[q]),sy(v.p[q+1]));
    g.stroke();
  });
  g.fillStyle='#3d4a64'; g.beginPath();
  for(i=0;i<GEO.bats.length;i++){
    var p=GEO.bats[i].p;
    g.moveTo(sx(p[0]),sy(p[1]));
    for(q=2;q<p.length;q+=2) g.lineTo(sx(p[q]),sy(p[q+1]));
    g.closePath();
  }
  g.fill();
  g.strokeStyle='#F2B33D'; g.lineWidth=Math.max(2.2,2.2*e); g.beginPath();
  for(i=0;i<TRACE.length;i++){ if(i) g.lineTo(sx(TRACE[i][0]),sy(TRACE[i][1])); else g.moveTo(sx(TRACE[i][0]),sy(TRACE[i][1])); }
  g.stroke();
  var r=Math.max(4,1.1*e);
  g.font='bold '+Math.round(Math.max(9,r*1.3))+'px system-ui'; g.textAlign='center'; g.textBaseline='middle';
  JOBJ.forEach(function(o){
    g.fillStyle=o.j.niv==='r'?'#ff4b3e':'#ffab2e';
    g.beginPath(); g.arc(sx(o.x),sy(o.z),r,0,7); g.fill();
    if(r>=7){ g.fillStyle='#10151d'; g.fillText(String(o.n),sx(o.x),sy(o.z)+0.5); }
  });
  g.save(); g.translate(sx(J.x),sy(J.z)); g.rotate(J.cap+PI/2);
  var k=Math.max(1,Math.min(3,e/1.5));
  g.fillStyle='#ffffff'; g.strokeStyle='#0b1019'; g.lineWidth=2;
  g.beginPath(); g.moveTo(0,-11*k); g.lineTo(7*k,8*k); g.lineTo(0,4*k); g.lineTo(-7*k,8*k); g.closePath(); g.fill(); g.stroke();
  g.restore();
}
function brancherCarteGlobale(){
  var cv=$e('e3-gmc');
  $e('e3-gm-fermer').onclick=fermerCarteGlobale;
  function pos(ev){ var r=cv.getBoundingClientRect(), k=cv.width/r.width; return {x:(ev.clientX-r.left)*k, y:(ev.clientY-r.top)*k}; }
  cv.addEventListener('wheel',function(ev){
    ev.preventDefault();
    var p=pos(ev), f=ev.deltaY<0?1.2:1/1.2;
    var ne=Math.max(0.15,Math.min(12,GM.e*f)); f=ne/GM.e;
    GM.ox=p.x-(p.x-GM.ox)*f; GM.oy=p.y-(p.y-GM.oy)*f; GM.e=ne;
    dessinerGM();
  },{passive:false});
  cv.addEventListener('pointerdown',function(ev){ var p=pos(ev); GM.glisse={x:p.x,y:p.y,ox:GM.ox,oy:GM.oy}; try{ cv.setPointerCapture(ev.pointerId); }catch(e){} });
  cv.addEventListener('pointermove',function(ev){ if(!GM.glisse) return; var p=pos(ev); GM.ox=GM.glisse.ox+(p.x-GM.glisse.x); GM.oy=GM.glisse.oy+(p.y-GM.glisse.y); dessinerGM(); });
  function fin(){ GM.glisse=null; }
  cv.addEventListener('pointerup',fin); cv.addEventListener('pointercancel',fin);
  cv.addEventListener('dblclick',function(ev){
    var p=pos(ev);
    var x=(p.x-GM.ox)/GM.e, z=(p.y-GM.oy)/GM.e;
    fermerCarteGlobale();
    teleporter(x,z);
  });
}
/* =================================================================
   Seconde passe graphique : nuit plus lisible, vrais éclairages de
   rue autour du coureur, eau animée, coureur posé sur le ruban étroit.
================================================================= */
var LUMS=[], tLum=0;
function preparerLumieres(){
  if(LUMS.length || !scene) return;
  for(var i=0;i<6;i++){
    var pl=new THREE.PointLight(0xffc98a,0,26,2);
    pl.castShadow=false;
    scene.add(pl);
    LUMS.push(pl);
  }
}
function animerDecor(dt,cx,cz){
  if(MAT.eauN){ MAT.eauN.offset.x+=dt*0.012; MAT.eauN.offset.y+=dt*0.007; }
  tLum-=dt;
  if(tLum>0 || !LUMS.length) return;
  tLum=0.35;
  if(!nuit || !lampes.length){ LUMS.forEach(function(l){ l.intensity=0; }); return; }
  var proches=lampes.map(function(L){ return [Math.hypot(L[0]-cx,L[2]-cz),L]; })
    .sort(function(a,b){ return a[0]-b[0]; });
  for(var i=0;i<LUMS.length;i++){
    var e=proches[i];
    if(!e || e[0]>140){ LUMS[i].intensity=0; continue; }
    LUMS[i].position.set(e[1][0],e[1][1]-0.3,e[1][2]);
    LUMS[i].intensity=55;
  }
}
function appliquerCiel(){
  if(!scene || !cielJour) return;
  scene.background=nuit?cielNuit:cielJour;
  scene.environment=nuit?envNuit:envJour;
  scene.environmentIntensity=nuit?1.1:0.82;
  scene.fog.color=new THREE.Color(nuit?0x121b2d:0xd6e4ef);
  scene.fog.near=nuit?90:380; scene.fog.far=nuit?720:1750;
  lumSol.intensity=nuit?0.8:0.35;
  lumSol.color=new THREE.Color(nuit?0x4a6594:0xbcd6f2);
  lumSol.groundColor=new THREE.Color(nuit?0x2a3448:0x5f6a48);
  lumDir.color=new THREE.Color(nuit?0x9ab4e0:0xfff0d4);
  lumDir.intensity=nuit?0.7:2.15;
  renderer.toneMappingExposure=nuit?1.3:0.80;
  if(MAT.trace) MAT.trace.emissive=new THREE.Color(nuit?0x7a5a10:0x3a2a06);
  if(lampHalos) lampHalos.visible=nuit;
  if(MAT.fenetresNuit) MAT.fenetresNuit.forEach(function(m){ m.emissiveIntensity=nuit?1:0; });
  tLum=0;
  var b=$e('e3-nuit'); if(b) b.classList.toggle('on',nuit);
}
function majJoueur(dt){
  var y=hauteur(J.x,J.z), ec=J.ecart;
  if(ec<0.55) y+=0.19; else if(ec<1.15) y+=0.19*(1.15-ec)/0.6;
  joueur.position.set(J.x,y,J.z);
  joueur.rotation.y=-J.cap;
  var u=joueur.userData, a=u.art;
  var vit=Math.abs(J.v);
  J.phase+=dt*(1.6+Math.min(vit,9)*1.25);
  var amp=Math.min(1,vit/4.4);
  var s=Math.sin(J.phase*2), c2=Math.cos(J.phase*2);
  a.hd.rotation.z=-s*0.72*amp;          a.hg.rotation.z=s*0.72*amp;
  a.gd.rotation.z=-Math.max(0,s-0.05)*1.6*amp-0.04;
  a.gg.rotation.z=-Math.max(0,-s-0.05)*1.6*amp-0.04;
  a.cd.rotation.z=Math.max(0,s)*0.35*amp; a.cg.rotation.z=Math.max(0,-s)*0.35*amp;
  a.ed.rotation.z=s*0.6*amp;            a.eg.rotation.z=-s*0.6*amp;
  a.ed.rotation.x=-0.09;                a.eg.rotation.x=0.09;
  a.od.rotation.z=0.22+1.15*amp;        a.og.rotation.z=0.22+1.15*amp;
  u.corps.position.y=Math.abs(c2)*0.05*amp-0.02*amp;
  u.corps.rotation.z=-0.13*amp;
}
/* =================================================================
   Construction du monde, ouverture et synchronisation avec la carte
================================================================= */
var Dzones=null, Dvoies=null, Dlignes=null, Dbats=null, Darbres=[], Dgros=null;
/* ce que la construction des bâtiments a posé, pour l'outillage de contrôle */
var BATIS_POSES=[];
/* Le point le plus haut de la dernière toiture posée. « top » est le haut des
   murs : une toiture à deux pentes ajoute son faîte par-dessus, jusqu'à 3,4 m.
   Un relevé 360 lit la silhouette, donc le faîte, et le comparer au haut des
   murs donnerait un écart systématique de deux à trois mètres qui n'est pas
   une erreur de mesure. Chaque fonction de toit note donc ici où elle monte. */
var FAITE_TOIT=0;
var construit=false, enConstruction=false, sale={route:false, jalons:false}, minuteurSync=0;

function lireDonnees(){
  var e=texteBrut('d-ele').split('\n'), i;
  ELE=new Float32Array(e.length);
  for(i=0;i<e.length;i++) ELE[i]=(+e[i])/10;
  Dzones=lignes(texteBrut('d-zones'));
  Dvoies=lignes(texteBrut('d-voies'));
  Dlignes=lignes(texteBrut('d-lignes'));
  Dbats=lignes(texteBrut('d-bats'));
  initCollision();
  chargerTraceCarte();
  GEO={bats:[], voies:[], zones:[]};
  Dbats.forEach(function(l){
    var c=l.split('\t'); if(c.length<11) return;
    var p=pointsDe(c[10]), x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
    for(var k=0;k<p.length;k+=2){ if(p[k]<x0)x0=p[k]; if(p[k]>x1)x1=p[k]; if(p[k+1]<z0)z0=p[k+1]; if(p[k+1]>z1)z1=p[k+1]; }
    GEO.bats.push({p:p,x0:x0,x1:x1,z0:z0,z1:z1});
  });
  Dvoies.forEach(function(l){ var c=l.split('\t'); if(c.length>=4) GEO.voies.push({k:c[0], w:(+c[1])/10, p:pointsDe(c[3])}); });
  Dzones.forEach(function(l){ var c=l.split('\t'); if(c.length>=3) GEO.zones.push({k:c[0], p:pointsDe(c[2])}); });
}
function ajouter(tas,mat,porte,recoit){
  if(tas.vide()) return null;
  var m=new THREE.Mesh(tas.geo(),mat);
  m.castShadow=!!porte; m.receiveShadow=!!recoit;
  monde.add(m);
  return m;
}
function etapeZones(){
  var z=construireZones(Dzones);
  Dgros=z.gros;
  MAT.sol=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(faireHerbe(),1,1),
        roughness:0.97, metalness:0, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2});
  MAT.dur=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(faireBitume(),1,1),
        roughness:0.9, metalness:0, polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-3});
  MAT.eau=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.13, metalness:0.35, transparent:true, opacity:0.9});
  ajouter(z.sol,MAT.sol,false,true);
  ajouter(z.dur,MAT.dur,false,true);
  ajouter(z.eau,MAT.eau,false,false);
}
function etapeVoies(){
  var v=construireVoies(Dvoies,260);
  MAT.bit=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(faireBitume(),1,1),
        roughness:0.88, metalness:0, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4});
  MAT.trot=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(faireDalles(),1,1), roughness:0.92, metalness:0});
  MAT.marq=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.65, metalness:0,
        polygonOffset:true, polygonOffsetFactor:-6, polygonOffsetUnits:-6});
  ajouter(v.bit,MAT.bit,false,true);
  ajouter(v.terre,MAT.bit,false,true);
  ajouter(v.trot,MAT.trot,false,true);
  ajouter(v.marq,MAT.marq,false,false);
}
function etapeLignes(){
  var tasBati=new Tas(16384), tasEau=new Tas(8192);
  construireLignes(Dlignes,tasEau,tasBati,Darbres);
  MAT.murets=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(faireMurNu(),1,1), roughness:0.95, metalness:0});
  ajouter(tasBati,MAT.murets,true,true);
  ajouter(tasEau,MAT.eau,false,false);
}
function facade(canvas,emission,rugo){
  return new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(canvas,1,1),
    emissiveMap:emission?textureDe(emission,1,1):null, emissive:emission?0xffffff:0x000000,
    emissiveIntensity:0, roughness:rugo||0.93, metalness:0});
}
function etapeBatis(){
  var b=construireBatis(Dbats);
  MAT.mursE=facade(faireEtage(false),faireFenetresLumineuses(false));
  MAT.rdcE=facade(faireRdc(false),faireFenetresLumineuses(true));
  MAT.mursP=facade(faireEtage(true),faireFenetresLumineuses(false));
  MAT.rdcP=facade(faireRdc(true),faireFenetresLumineuses(true));
  MAT.rdcC=facade(faireVitrine(),faireFenetresRect(256,205,[[16,88,150,98],[180,88,60,104],[8,20,240,26]],1));
  MAT.mursS=facade(faireEcole(),faireFenetresRect(256,205,[[12,40,104,112],[140,40,104,112]],0.35));
  MAT.mursEg=facade(faireEglise(),null,0.96);
  MAT.fenetresNuit=[MAT.mursE,MAT.rdcE,MAT.mursP,MAT.rdcP,MAT.rdcC,MAT.mursS];
  MAT.mursI=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(faireBardage(),1,1), roughness:0.55, metalness:0.35});
  MAT.annexes=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(faireMurNu(),1,1), roughness:0.95, metalness:0});
  MAT.toits=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(faireTuiles(),1,1), roughness:0.86, metalness:0});
  MAT.toitsA=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(faireArdoise(),1,1), roughness:0.62, metalness:0.05});
  MAT.toitsM=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(faireBardage(),1,1), roughness:0.5, metalness:0.4});
  MAT.plats=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(faireBitume(),1,1), roughness:0.94, metalness:0});
  MAT.deco=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.7, metalness:0.1});
  ajouter(b.mursE,MAT.mursE,true,true);  ajouter(b.rdcE,MAT.rdcE,true,true);
  ajouter(b.mursP,MAT.mursP,true,true);  ajouter(b.rdcP,MAT.rdcP,true,true);
  ajouter(b.rdcC,MAT.rdcC,true,true);    ajouter(b.mursS,MAT.mursS,true,true);
  ajouter(b.mursEg,MAT.mursEg,true,true); ajouter(b.mursI,MAT.mursI,true,true);
  ajouter(b.annexes,MAT.annexes,true,true);
  ajouter(b.toits,MAT.toits,true,true);  ajouter(b.toitsA,MAT.toitsA,true,true);
  ajouter(b.toitsM,MAT.toitsM,true,true); ajouter(b.plats,MAT.plats,true,true);
  ajouter(b.deco,MAT.deco,true,true);
}
function etapeArbres(){
  if(SOL) semerArbresCanopee(Darbres,Dvoies,4200);
  else {
    for(var i=0;i<Dzones.length;i++){
      var l=Dzones[i].split('\t');
      if(l.length<3) continue;
      if(l[0]==='f') semerArbresZone(pointsDe(l[2]),Darbres,140,300,0);
    }
  }
  var t=construireArbres(Darbres);
  MAT.feuillage=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(faireFeuillage(),1,1),
        alphaTest:0.42, roughness:0.95, metalness:0});
  MAT.tronc=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(faireEcorce(),1,1), roughness:0.96, metalness:0});
  ajouter(t.tronc,MAT.tronc,true,true);
  ajouter(t.feu,MAT.feuillage,true,true);
}
function etapeParcours(){
  reconstruireParcours();
  syncJalonneurs();
  construirePoisCarte();
  var L=construireLampes(Dvoies);
  lampTetes=L.tetes; lampHalos=L.halos;
}
function etapeJoueur(){
  joueur=faireJoueur();
  scene.add(joueur);
  placerJoueur(0);
  majVisibilite(); majBoutonsVue();
  appliquerCiel();
  remplirListe();
}
var ETAPES=[
  ['Lecture des données', lireDonnees],
  ['Ciel et lumière', preparerCiels],
  ['Photo aérienne : béton, herbe et arbres réels', preparerSolReel],
  ['Bois, prés et rivière', etapeZones],
  ['Modelé du terrain', function(){ construireRelief(Dgros); }],
  ['Rues, trottoirs et marquage', etapeVoies],
  ['Murs, haies, alignements', etapeLignes],
  ['Bâtiments : mairie, églises, écoles, commerces', etapeBatis],
  ['Plantation des arbres', etapeArbres],
  ['Personnages', preparerPersonnages],
  ['Parcours et jalonneurs', etapeParcours],
  ['Mise en place du coureur', etapeJoueur]
];
function progression(t,f){
  $e('e3-vtxt').textContent=t;
  $e('e3-jauge').style.width=Math.round(f*100)+'%';
}
function echecConstruction(err){
  console.error(err);
  $e('e3-vtxt').textContent='Erreur : '+((err&&err.message)||err);
  enConstruction=false;
}
function lancerEtape(i){
  if(i>=ETAPES.length){
    construit=true; enConstruction=false;
    if(sale.route||sale.jalons) synchroniser(false);
    var v=$e('e3-voile');
    v.classList.add('parti');
    setTimeout(function(){ v.hidden=true; v.classList.remove('parti'); },650);
    dire('Flèches pour courir, A et E pour pivoter la caméra, F pour la vue à la première personne, clic sur un jalonneur pour l’éditer.');
    demarrerBoucle();
    return;
  }
  progression(ETAPES[i][0], i/ETAPES.length);
  setTimeout(function(){
    var r;
    try{ r=ETAPES[i][1](); }catch(err){ echecConstruction(err); return; }
    if(r && typeof r.then==='function') r.then(function(){ lancerEtape(i+1); }, echecConstruction);
    else lancerEtape(i+1);
  },30);
}
function demarrerBoucle(){
  if(!boucleId && ouvert && construit){ horloge.getDelta(); boucleId=requestAnimationFrame(boucle); }
}
function synchroniser(force){
  if(!construit) return;
  if(sale.route || force){ chargerTraceCarte(); reconstruireParcours(); }
  if(sale.route || sale.jalons || force) syncJalonneurs();
  sale.route=false; sale.jalons=false;
}
window.ESPACE3D={
  ouvrir:function(){
    ouvert=true;
    document.body.classList.add('en-3d');
    $e('e3').hidden=false;
    if(!renderer){ initTrois(); brancherInterface(); }
    redimensionner();
    if(construit){ synchroniser(true); demarrerBoucle(); }
    else if(!enConstruction){ enConstruction=true; $e('e3-voile').hidden=false; lancerEtape(0); }
  },
  fermer:function(){
    if(VUE==='jal') sortirVueJal();
    ouvert=false; touches={};
    document.body.classList.remove('en-3d');
    $e('e3').hidden=true;
    fermerCarteGlobale();
    try{ window.dispatchEvent(new Event('resize')); }catch(e){}
  },
  signaler:function(t){
    sale[t]=true;
    if(!(ouvert && construit)) return;
    if(t==='jalons' && !sale.route) synchroniser(false);
    else { clearTimeout(minuteurSync); minuteurSync=setTimeout(function(){ synchroniser(false); },60); }
  }
};
/* =================================================================
   Matériaux de la seconde passe : reliefs, reflets, vitres brillantes
================================================================= */
function matTexture(canvas,force,opts){
  var o=opts||{};
  var m=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(canvas,1,1),
    normalMap:texNormale(canvas,force), roughness:(o.rugo===undefined?0.93:o.rugo), metalness:o.metal||0});
  if(o.echelle) m.normalScale.set(o.echelle,o.echelle);
  return m;
}
function facadeN(canvas,emission,vitres,force,rugo){
  var m=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(canvas,1,1),
    normalMap:texNormale(canvas,force||2.2),
    roughnessMap:vitres?texRugosite(canvas.width,canvas.height,vitres,240,26):null,
    roughness:vitres?1:(rugo||0.93), metalness:0,
    emissiveMap:emission?textureDe(emission,1,1):null, emissive:emission?0xffffff:0x000000, emissiveIntensity:0});
  m.normalScale.set(0.85,0.85);
  return m;
}
function etapeZones(){
  var z=construireZones(Dzones);
  Dgros=z.gros;
  var hc=faireHerbe();
  MAT.sol=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(hc,1,1), normalMap:texNormale(hc,1.5),
        roughness:0.97, metalness:0, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2});
  var bc=faireChaussee();
  MAT.dur=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(bc,1,1), normalMap:texNormale(bc,1.4),
        roughness:0.9, metalness:0, polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-3});
  MAT.eauN=texNormale(faireOndes(),2.2);
  MAT.eau=new THREE.MeshStandardMaterial({vertexColors:true, normalMap:MAT.eauN, roughness:0.06, metalness:0.28,
        transparent:true, opacity:0.92});
  MAT.eau.normalScale.set(0.6,0.6);
  ajouter(z.sol,MAT.sol,false,true);
  ajouter(z.dur,MAT.dur,false,true);
  ajouter(z.eau,MAT.eau,false,false);
}
function etapeVoies(){
  var v=construireVoies(Dvoies,260);
  var cc=faireChaussee(), dc=faireDalles(), tc=faireTerre();
  MAT.bit=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(cc,1,1), normalMap:texNormale(cc,1.6),
        roughness:0.86, metalness:0, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4});
  MAT.chemin=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(tc,1,1), normalMap:texNormale(tc,2.0),
        roughness:0.95, metalness:0, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4});
  MAT.trot=matTexture(dc,2.4,{rugo:0.9});
  MAT.marq=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.55, metalness:0,
        polygonOffset:true, polygonOffsetFactor:-6, polygonOffsetUnits:-6});
  ajouter(v.bit,MAT.bit,false,true);
  ajouter(v.terre,MAT.chemin,false,true);
  ajouter(v.trot,MAT.trot,false,true);
  ajouter(v.marq,MAT.marq,false,false);
}
function etapeLignes(){
  var tasBati=new Tas(16384), tasEau=new Tas(8192);
  construireLignes(Dlignes,tasEau,tasBati,Darbres);
  MAT.murets=matTexture(faireMurNu(),2.2,{rugo:0.95});
  ajouter(tasBati,MAT.murets,true,true);
  ajouter(tasEau,MAT.eau,false,false);
}
function etapeBatis(){
  var b=construireBatis(Dbats);
  var VE=[[42,44,54,96],[168,44,54,96]], VR=[[152,55,64,100],[36,39,52,12]];
  MAT.mursE=facadeN(faireEtage(0),faireFenetresLumineuses(false),VE);
  MAT.rdcE=facadeN(faireRdc(0),faireFenetresLumineuses(true),VR);
  MAT.mursP=facadeN(faireEtage(1),faireFenetresLumineuses(false),VE,2.8);
  MAT.rdcP=facadeN(faireRdc(1),faireFenetresLumineuses(true),VR,2.8);
  MAT.mursE2=facadeN(faireEtage(2),faireFenetresLumineuses(false),VE);
  MAT.rdcE2=facadeN(faireRdc(2),faireFenetresLumineuses(true),VR);
  MAT.mursM=facadeN(faireEtage(3),faireFenetresLumineuses(false),VE);
  MAT.rdcM=facadeN(faireRdc(3),faireFenetresLumineuses(true),VR);
  MAT.rdcC=facadeN(faireVitrine(),faireFenetresRect(256,205,[[16,88,150,98],[180,88,60,104],[8,20,240,26]],1),[[16,88,150,98],[180,88,60,104]]);
  MAT.mursS=facadeN(faireEcole(),faireFenetresRect(256,205,[[12,40,104,112],[140,40,104,112]],0.35),[[12,40,104,112],[140,40,104,112]]);
  MAT.mursEg=facadeN(faireEglise(),null,[[96,100,64,290]],2.8);
  MAT.fenetresNuit=[MAT.mursE,MAT.rdcE,MAT.mursP,MAT.rdcP,MAT.mursE2,MAT.rdcE2,MAT.mursM,MAT.rdcM,MAT.rdcC,MAT.mursS];
  MAT.mursI=matTexture(faireBardage(),2.6,{rugo:0.5,metal:0.35});
  MAT.annexes=matTexture(faireMurNu(),2.2,{rugo:0.95});
  MAT.corn=matTexture(faireMurNu(),1.6,{rugo:0.9});
  MAT.toits=matTexture(faireTuiles(),3.2,{rugo:0.84});
  MAT.toitsA=matTexture(faireArdoise(),2.6,{rugo:0.55,metal:0.05});
  MAT.toitsM=matTexture(faireBardage(),2.6,{rugo:0.45,metal:0.4});
  MAT.plats=matTexture(faireChaussee(),1.4,{rugo:0.94});
  MAT.deco=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.6, metalness:0.15});
  ajouter(b.mursE,MAT.mursE,true,true);   ajouter(b.rdcE,MAT.rdcE,true,true);
  ajouter(b.mursP,MAT.mursP,true,true);   ajouter(b.rdcP,MAT.rdcP,true,true);
  ajouter(b.mursE2,MAT.mursE2,true,true); ajouter(b.rdcE2,MAT.rdcE2,true,true);
  ajouter(b.mursM,MAT.mursM,true,true);   ajouter(b.rdcM,MAT.rdcM,true,true);
  ajouter(b.rdcC,MAT.rdcC,true,true);     ajouter(b.mursS,MAT.mursS,true,true);
  ajouter(b.mursEg,MAT.mursEg,true,true); ajouter(b.mursI,MAT.mursI,true,true);
  ajouter(b.annexes,MAT.annexes,true,true);
  ajouter(b.corn,MAT.corn,true,true);
  ajouter(b.toits,MAT.toits,true,true);   ajouter(b.toitsA,MAT.toitsA,true,true);
  ajouter(b.toitsM,MAT.toitsM,true,true); ajouter(b.plats,MAT.plats,true,true);
  ajouter(b.deco,MAT.deco,true,true);
}
function etapeArbres(){
  if(SOL) semerArbresCanopee(Darbres,Dvoies,4200);
  else {
    for(var i=0;i<Dzones.length;i++){
      var l=Dzones[i].split('\t');
      if(l.length<3) continue;
      if(l[0]==='f') semerArbresZone(pointsDe(l[2]),Darbres,140,300,0);
    }
  }
  var t=construireArbres(Darbres);
  var fc=faireFeuillage(), ec=faireEcorce();
  MAT.feuillage=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(fc,1,1), normalMap:texNormale(fc,2.4),
        alphaTest:0.42, roughness:0.9, metalness:0});
  MAT.tronc=matTexture(ec,3.0,{rugo:0.96});
  ajouter(t.tronc,MAT.tronc,true,true);
  ajouter(t.feu,MAT.feuillage,true,true);
}
function etapeJoueur(){
  joueur=faireJoueur();
  scene.add(joueur);
  placerJoueur(0);
  preparerLumieres();
  majVisibilite(); majBoutonsVue();
  appliquerCiel();
  remplirListe();
}
/* =================================================================
   Sol stable : plus de revêtements qui clignotent en se déplaçant.
   1. Les couches posées au sol (pelouses, parkings, chemins, chaussées,
      marquage) n'écrivent plus la profondeur et sont dessinées dans un
      ordre fixe : la couche du dessus gagne toujours, quel que soit
      l'angle de la caméra.
   2. Les trottoirs sont coupés là où ils tomberaient sur une autre
      chaussée (avenues à deux chaussées, carrefours).
   3. Chaussée sans taches répétées, variation douce à grande échelle.
================================================================= */
function superposer(m,ordre){
  if(!m) return m;
  m.renderOrder=ordre;
  m.material.depthWrite=false;
  return m;
}
var TEX_MACRO=null;
function faireMacro(){
  var W=256, H=256, c=toile(W,H), g=c.getContext('2d');
  g.fillStyle='#808080'; g.fillRect(0,0,W,H);
  for(var i=0;i<140;i++){
    var x=Math.random()*W, y=Math.random()*H, r=14+Math.random()*46, clair=Math.random()<0.5;
    for(var ox=-W;ox<=W;ox+=W) for(var oy=-H;oy<=H;oy+=H){
      var pg=g.createRadialGradient(x+ox,y+oy,1,x+ox,y+oy,r);
      pg.addColorStop(0,clair?'rgba(255,255,255,0.16)':'rgba(0,0,0,0.16)');
      pg.addColorStop(1,'rgba(128,128,128,0)');
      g.fillStyle=pg; g.fillRect(x+ox-r,y+oy-r,r*2,r*2);
    }
  }
  var t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}
function varierMonde(mat,ech,amp,cle){
  if(!TEX_MACRO) TEX_MACRO=faireMacro();
  var e=ech.toFixed(1), a=amp.toFixed(3), b=(1-amp/2).toFixed(3);
  mat.onBeforeCompile=function(sh){
    sh.uniforms.tMacro={value:TEX_MACRO};
    sh.vertexShader=sh.vertexShader
      .replace('#include <common>','#include <common>\nvarying vec3 vMonde;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvMonde=(modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader=sh.fragmentShader
      .replace('#include <common>','#include <common>\nvarying vec3 vMonde;\nuniform sampler2D tMacro;')
      .replace('#include <map_fragment>',
        'vec4 sampledDiffuseColor=texture2D(map,vMapUv);\n'+
        'sampledDiffuseColor.rgb*='+b+'+'+a+'*2.0*texture2D(tMacro,vMonde.xz/'+e+').r*texture2D(tMacro,vMonde.xz/'+(ech*0.29).toFixed(1)+'+0.37).r;\n'+
        'diffuseColor*=sampledDiffuseColor;');
  };
  mat.customProgramCacheKey=function(){ return 'monde-'+cle; };
}

/* ---------------- chaussée sans taches répétées ---------------- */
function faireChaussee(sansCaniveau){
  var W=512, H=512, c=toile(W,H), g=c.getContext('2d'), i;
  g.fillStyle='#48484b'; g.fillRect(0,0,W,H);
  grain(g,W,H,52000,0.26,'#8a8a8c','#2a2a2c');
  for(i=0;i<4200;i++){
    g.fillStyle='rgba('+(150+Math.random()*60|0)+','+(145+Math.random()*55|0)+','+(135+Math.random()*50|0)+',0.28)';
    g.fillRect(Math.random()*W,Math.random()*H,1.3,1.3);
  }
  if(!sansCaniveau){
    [0.3,0.7].forEach(function(f){
      var y=f*H, lg=g.createLinearGradient(0,y-50,0,y+50);
      lg.addColorStop(0,'rgba(0,0,0,0)'); lg.addColorStop(0.5,'rgba(8,8,10,0.12)'); lg.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=lg; g.fillRect(0,y-50,W,100);
    });
  }
  for(i=0;i<3;i++){
    g.strokeStyle='rgba(22,22,24,0.32)'; g.lineWidth=0.7+Math.random()*0.6;
    var x=Math.random()*W, y=60+Math.random()*(H-120);
    g.beginPath(); g.moveTo(x,y);
    for(var k=0;k<6;k++){ x+=(Math.random()-0.5)*50; y+=(Math.random()-0.5)*30; g.lineTo(x,y); }
    g.stroke();
  }
  if(!sansCaniveau){
    [0,H-30].forEach(function(y0){
      for(var yy=y0;yy<y0+30;yy+=15) for(var xx=-12;xx<W;xx+=24){
        var t=Math.random()*30;
        g.fillStyle='rgb('+(100+t|0)+','+(98+t|0)+','+(93+t|0)+')';
        g.fillRect(xx+2+((yy-y0)/15%2)*12,yy+2,20,11);
      }
      g.fillStyle='rgba(0,0,0,0.35)'; g.fillRect(0,y0===0?30:H-32,W,3);
    });
  }
  return c;
}

/* ---------------- trottoirs coupés aux autres chaussées ---------------- */
function indexerChaussees(voies){
  var I={segs:[], grille:{}, C:12};
  for(var i=0;i<voies.length;i++){
    var l=voies[i].split('\t');
    if(l.length<4 || l[0]!=='r') continue;
    var h=(+l[1])/20, p=pointsDe(l[3]);
    for(var s=2;s<p.length;s+=2){
      var ax=p[s-2], az=p[s-1], bx=p[s], bz=p[s+1];
      var n=I.segs.push({ax:ax,az:az,bx:bx,bz:bz,h:h,id:i})-1, m=h+2;
      var c0=Math.floor((Math.min(ax,bx)-m)/I.C), c1=Math.floor((Math.max(ax,bx)+m)/I.C);
      var r0=Math.floor((Math.min(az,bz)-m)/I.C), r1=Math.floor((Math.max(az,bz)+m)/I.C);
      for(var cx=c0;cx<=c1;cx++) for(var cz=r0;cz<=r1;cz++){
        var k=cx+','+cz;
        (I.grille[k]||(I.grille[k]=[])).push(n);
      }
    }
  }
  return I;
}
function dansChaussee(I,x,z,id,marge){
  var L=I.grille[Math.floor(x/I.C)+','+Math.floor(z/I.C)];
  if(!L) return false;
  for(var k=0;k<L.length;k++){
    var s=I.segs[L[k]];
    if(s.id===id) continue;
    var dx=s.bx-s.ax, dz=s.bz-s.az, l2=dx*dx+dz*dz;
    var t=l2>0?((x-s.ax)*dx+(z-s.az)*dz)/l2:0;
    t=t<0?0:(t>1?1:t);
    if(Math.hypot(x-(s.ax+dx*t),z-(s.az+dz*t))<s.h+marge) return true;
  }
  return false;
}
function trottoirDecoupe(tas,I,p,off,id,haut){
  var q=densifier(decaler(p,off),2), run=[], i;
  function vider(){
    if(run.length>=4){
      var len=0;
      for(var k=2;k<run.length;k+=2) len+=Math.hypot(run[k]-run[k-2],run[k+1]-run[k-1]);
      if(len>=2.5) bordure(tas,run,1.8,haut,COL.trottoir,COL.joue);
    }
    run=[];
  }
  for(i=0;i<q.x.length;i++){
    if(dansChaussee(I,q.x[i],q.z[i],id,0.9)) vider();
    else run.push(q.x[i],q.z[i]);
  }
  vider();
}
function construireVoies(voies,dpres){
  var bit=new Tas(), terre=new Tas(), trot=new Tas(), marq=new Tas();
  var blanc=teinte(0xf2f2ee), I=indexerChaussees(voies);
  for(var i=0;i<voies.length;i++){
    var l=voies[i].split('\t');
    if(l.length<4) continue;
    var k=l[0], w=(+l[1])/10, p=pointsDe(l[3]);
    if(k==='r'){
      ruban(bit,p,w,COL.route,0.16,6,7);
      if(w>=5 && pres(p,dpres)){
        var haut=0.28+(i%7)*0.004;
        trottoirDecoupe(trot,I,p, w/2+0.9,i,haut);
        trottoirDecoupe(trot,I,p,-w/2-0.9,i,haut);
        if(w>=6.2) pointilles(marq,p,blanc);
      }
    }
    else if(k==='s') ruban(terre,p,w,COL.sentier,0.15,6,4);
    else if(k==='t') ruban(terre,p,w,COL.piste,0.15,6,4);
    else if(k==='v') ruban(terre,p,w,COL.rail,0.18,6,3);
  }
  return {bit:bit, terre:terre, trot:trot, marq:marq};
}

/* ---------------- étapes : ordre fixe des couches ---------------- */
function etapeZones(){
  var z=construireZones(Dzones);
  Dgros=z.gros;
  var hc=faireHerbe();
  MAT.sol=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(hc,1,1), normalMap:texNormale(hc,1.5),
        roughness:0.97, metalness:0, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2});
  varierMonde(MAT.sol,47,0.34,'sol');
  var bc=faireChaussee(true);
  MAT.dur=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(bc,1,1), normalMap:texNormale(bc,1.2),
        roughness:0.9, metalness:0, polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-3});
  varierMonde(MAT.dur,39,0.26,'dur');
  MAT.eauN=texNormale(faireOndes(),2.2);
  MAT.eau=new THREE.MeshStandardMaterial({vertexColors:true, normalMap:MAT.eauN, roughness:0.06, metalness:0.28,
        transparent:true, opacity:0.92});
  MAT.eau.normalScale.set(0.6,0.6);
  superposer(ajouter(z.sol,MAT.sol,false,true),1);
  superposer(ajouter(z.dur,MAT.dur,false,true),2);
  ajouter(z.eau,MAT.eau,false,false);
}
function etapeVoies(){
  var v=construireVoies(Dvoies,260);
  var cc=faireChaussee(false), dc=faireDalles(), tc=faireTerre();
  MAT.bit=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(cc,1,1), normalMap:texNormale(cc,1.4),
        roughness:0.86, metalness:0, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4});
  varierMonde(MAT.bit,37,0.24,'bit');
  MAT.chemin=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(tc,1,1), normalMap:texNormale(tc,2.0),
        roughness:0.95, metalness:0, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4});
  varierMonde(MAT.chemin,31,0.3,'chemin');
  MAT.trot=matTexture(dc,2.4,{rugo:0.9});
  varierMonde(MAT.trot,23,0.2,'trot');
  MAT.marq=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.55, metalness:0,
        polygonOffset:true, polygonOffsetFactor:-6, polygonOffsetUnits:-6});
  superposer(ajouter(v.terre,MAT.chemin,false,true),3);
  superposer(ajouter(v.bit,MAT.bit,false,true),4);
  ajouter(v.trot,MAT.trot,false,true);
  superposer(ajouter(v.marq,MAT.marq,false,false),5);
}
/* =================================================================
   Personnages réalistes (Microsoft Rocketbox, licence MIT)
   - chargement FBX + textures converties
   - pose du jalonneur calculée en directions monde
   - pose figée en géométrie statique (70 jalonneurs sans squelette)
   - chasuble fluo moulée sur le buste
   Les fichiers sont fournis par ACTIF(nom) : chaîne base64 intégrée
   au programme, ou chemin de fichier pour les essais.
================================================================= */
var EXT=window.TROIS_EXT||{};
var TEX_VIDE='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
/* un chemin d'essai est court ; une donnée base64 (JPEG = « /9j/… ») est longue */
function estChemin(v){ return v.length<400 && /^(\/|https?:)/.test(v); }
function actifURL(nom){
  var A=window.ACTIFS||{}, v=A[nom];
  if(v===undefined) return null;
  if(estChemin(v)) return v;
  var ext=nom.split('.').pop().toLowerCase();
  var mime=ext==='png'?'image/png':(ext==='jpg'?'image/jpeg':'application/octet-stream');
  return 'data:'+mime+';base64,'+v;
}
function actifOctets(nom){
  var A=window.ACTIFS||{}, v=A[nom];
  if(v===undefined) return Promise.reject(new Error('actif manquant : '+nom));
  if(estChemin(v)) return fetch(v).then(function(r){ return r.arrayBuffer(); });
  var bin=atob(v), n=bin.length, u=new Uint8Array(n);
  for(var i=0;i<n;i++) u[i]=bin.charCodeAt(i);
  return Promise.resolve(u.buffer);
}

/* ---------------- chargement d'un avatar ---------------- */
function chargerAvatar(nom,remplace){
  return actifOctets(nom+'.fbx').then(function(buf){
    return new Promise(function(ok){
      var man=new THREE.LoadingManager(), attente=0, fini=false, obj=null;
      function finir(){ if(!fini && obj && attente<=0){ fini=true; ok(obj); } }
      man.setURLModifier(function(u){
        var b=u.split(/[\\/]/).pop().replace(/\.tga$/i,'');
        if(remplace && remplace[b]) b=remplace[b];
        return actifURL(b+'.png')||actifURL(b+'.jpg')||TEX_VIDE;
      });
      man.onStart=function(){ attente++; };
      man.onLoad=function(){ attente=0; finir(); };
      man.addHandler(/\.tga$/i,new THREE.TextureLoader(man));
      var L=new EXT.FBXLoader(man);
      obj=L.parse(buf,'');
      standardiserAvatar(obj);
      setTimeout(function(){ attente=0; finir(); },250);
      setTimeout(function(){ if(!fini){ fini=true; ok(obj); } },9000);
    });
  });
}
function standardiserAvatar(f){
  f.traverse(function(o){
    if(!o.isMesh) return;
    var arr=Array.isArray(o.material)?o.material:[o.material];
    var n=arr.map(function(m){
      if(m.map && m.map.colorSpace!==undefined) m.map.colorSpace=THREE.SRGBColorSpace;
      var s=new THREE.MeshStandardMaterial({map:m.map, normalMap:m.normalMap, roughness:0.82, metalness:0});
      if(/opacity/i.test(m.name)){ s.alphaTest=0.42; s.side=THREE.DoubleSide; }
      if(/head/i.test(m.name)) s.roughness=0.62;
      s.name=m.name;
      return s;
    });
    o.material=Array.isArray(o.material)?n:n[0];
    o.castShadow=true; o.receiveShadow=false;
    o.frustumCulled=false;
  });
}
function osAvatar(f){
  var B={};
  f.traverse(function(o){ if(o.isBone) B[o.name]=o; });
  return B;
}
/* met l'avatar debout, pieds au sol, hauteur h, face à +x */
function normaliserAvatar(f,h){
  f.updateMatrixWorld(true);
  var bb=new THREE.Box3().setFromObject(f), t=bb.getSize(new THREE.Vector3()).y||1;
  f.scale.multiplyScalar(h/t);
  f.updateMatrixWorld(true);
  bb.setFromObject(f);
  var p=new THREE.Group();
  f.position.y-=bb.min.y;
  f.rotation.y=PI/2;
  p.add(f);
  p.updateMatrixWorld(true);
  return p;
}

/* ---------------- pose en directions monde ---------------- */
var _pa=new THREE.Vector3(), _pb=new THREE.Vector3(), _qa=new THREE.Quaternion(), _qb=new THREE.Quaternion(), _qc=new THREE.Quaternion();
function orienterOs(os,enfant,dir){
  os.updateWorldMatrix(true,false); enfant.updateWorldMatrix(false,false);
  os.getWorldPosition(_pa); enfant.getWorldPosition(_pb);
  var cur=_pb.sub(_pa).normalize();
  _qa.setFromUnitVectors(cur,dir.clone().normalize());
  os.getWorldQuaternion(_qb); _qb.premultiply(_qa);
  os.parent.getWorldQuaternion(_qc).invert();
  os.quaternion.copy(_qc.multiply(_qb));
  os.updateMatrixWorld(true);
}
/* tourne un os autour de l'axe monde ax (unitaire) d'un angle a */
function tournerOsMonde(os,ax,a){
  _qa.setFromAxisAngle(ax,a);
  os.getWorldQuaternion(_qb); _qb.premultiply(_qa);
  os.parent.getWorldQuaternion(_qc).invert();
  os.quaternion.copy(_qc.multiply(_qb));
  os.updateMatrixWorld(true);
}
/* bras : 'd' ou 'g' tendu à l'horizontale, l'autre le long du corps.
   Le repère est celui du groupe normalisé : avant +x, droite +z. */
/* opt (facultatif) : avance = angle du bras vers l'avant (rad), hausse = levée, brasLibre = ne pas toucher l'autre bras.
   Le repère suit l'orientation du groupe dans le monde, pour pouvoir animer un jalonneur déjà tourné. */
var _qg=new THREE.Quaternion();
function poserBrasJalon(g,bras,opt){
  opt=opt||{};
  var B=g.userData.os||(g.userData.os=osAvatar(g));
  g.updateWorldMatrix(true,false); g.getWorldQuaternion(_qg);
  var avant=new THREE.Vector3(1,0,0).applyQuaternion(_qg), droite=new THREE.Vector3(0,0,1).applyQuaternion(_qg);
  /* 'n' : les deux bras le long du corps ; 'x' : bras croisés en X devant la poitrine (accès fermé) */
  if(bras==='n' || bras==='x'){
    ['R','L'].forEach(function(C){
      var lt=(C==='R')?droite.clone():droite.clone().negate();
      var b1=B['Bip01_'+C+'_UpperArm'], b2=B['Bip01_'+C+'_Forearm'], b3=B['Bip01_'+C+'_Hand'];
      if(!b1||!b2||!b3) return;
      if(bras==='n'){
        orienterOs(b1,b2,new THREE.Vector3(0,-1,0).add(lt.clone().multiplyScalar(0.13)).add(avant.clone().multiplyScalar(0.02)));
        orienterOs(b2,b3,new THREE.Vector3(0,-1,0).add(lt.clone().multiplyScalar(0.07)).add(avant.clone().multiplyScalar(0.16)));
      } else {
        var dev=(C==='R')?0.05:0;
        var dU=avant.clone().multiplyScalar(0.80).add(new THREE.Vector3(0,0.10,0)).add(lt.clone().multiplyScalar(-0.26)).normalize();
        var dF=avant.clone().multiplyScalar(0.30+dev).add(new THREE.Vector3(0,0.62,0)).add(lt.clone().multiplyScalar(-0.72)).normalize();
        orienterOs(b1,b2,dU);
        orienterOs(b2,b3,dF);
        var f2=B['Bip01_'+C+'_Finger2']||B['Bip01_'+C+'_Finger1'];
        if(f2) orienterOs(b3,f2,dF);
      }
    });
    g.updateMatrixWorld(true);
    return;
  }
  var S=bras==='d'?'R':'L', A=bras==='d'?'L':'R', lat=bras==='d'?droite.clone():droite.clone().negate();
  var bt=B['Bip01_'+S+'_UpperArm'], at=B['Bip01_'+S+'_Forearm'], mt=B['Bip01_'+S+'_Hand'];
  var fa=0.06+(opt.avance||0);
  var dirT=lat.clone().multiplyScalar(Math.cos(fa)).add(avant.clone().multiplyScalar(Math.sin(fa))).add(new THREE.Vector3(0,0.03+(opt.hausse||0),0)).normalize();
  orienterOs(bt,at,dirT);
  orienterOs(at,mt,dirT);
  var m2=B['Bip01_'+S+'_Finger2']||B['Bip01_'+S+'_Finger1'];
  if(m2) orienterOs(mt,m2,dirT);
  /* paume vers l'avant : normale de paume ramenée sur +x autour de l'axe du bras */
  var i1=B['Bip01_'+S+'_Finger1'], i4=B['Bip01_'+S+'_Finger4']||B['Bip01_'+S+'_Finger3'];
  if(i1 && i4 && m2){
    var ph=mt.getWorldPosition(new THREE.Vector3()), p1=i1.getWorldPosition(new THREE.Vector3()), p4=i4.getWorldPosition(new THREE.Vector3());
    var pm=m2.getWorldPosition(new THREE.Vector3());
    var le=pm.sub(ph).normalize(), tr=p1.sub(p4).normalize();
    var n=new THREE.Vector3().crossVectors(le,tr).normalize();
    if(bras==='g') n.negate();
    var ax=dirT.clone();
    var np=n.clone().sub(ax.clone().multiplyScalar(n.dot(ax))).normalize();
    var cible=avant.clone().sub(ax.clone().multiplyScalar(avant.dot(ax))).normalize();
    var ang=Math.atan2(new THREE.Vector3().crossVectors(np,cible).dot(ax), np.dot(cible));
    tournerOsMonde(bt,ax,ang*0.35);
    tournerOsMonde(mt,ax,ang*0.65);
  }
  if(opt.brasLibre){ g.updateMatrixWorld(true); return; }
  var bb=B['Bip01_'+A+'_UpperArm'], ab=B['Bip01_'+A+'_Forearm'], mb=B['Bip01_'+A+'_Hand'];
  var latA=lat.clone().negate();
  orienterOs(bb,ab,new THREE.Vector3(0,-1,0).add(latA.clone().multiplyScalar(0.13)).add(avant.clone().multiplyScalar(0.02)));
  orienterOs(ab,mb,new THREE.Vector3(0,-1,0).add(latA.clone().multiplyScalar(0.07)).add(avant.clone().multiplyScalar(0.16)));
  g.updateMatrixWorld(true);
}

/* ---------------- figer la pose en géométrie statique ---------------- */
var TORSE={Bip01_Spine:1,Bip01_Spine1:1,Bip01_Spine2:1,Bip01_Pelvis:1,Bip01_L_Clavicle:1,Bip01_R_Clavicle:1};
function figerAvatar(g){
  g.updateMatrixWorld(true);
  var inv=new THREE.Matrix4().copy(g.matrixWorld).invert();
  var sortie=[], v=new THREE.Vector3(), w=new THREE.Vector3(), nm=new THREE.Matrix3();
  g.traverse(function(o){
    if(!o.isMesh) return;
    var src=o.geometry, P=src.attributes.position, N=src.attributes.normal, cnt=P.count;
    var pos=new Float32Array(cnt*3), nor=new Float32Array(cnt*3), torse=new Uint8Array(cnt);
    var M=new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld);
    var skin=o.isSkinnedMesh, SI=src.attributes.skinIndex, SW=src.attributes.skinWeight;
    if(skin) o.skeleton.update();
    for(var i=0;i<cnt;i++){
      v.fromBufferAttribute(P,i);
      w.copy(v).add(_pa.fromBufferAttribute(N,i).multiplyScalar(0.01));
      if(skin){ o.applyBoneTransform(i,v); o.applyBoneTransform(i,w); }
      v.applyMatrix4(M); w.applyMatrix4(M);
      pos[i*3]=v.x; pos[i*3+1]=v.y; pos[i*3+2]=v.z;
      w.sub(v).normalize();
      nor[i*3]=w.x; nor[i*3+1]=w.y; nor[i*3+2]=w.z;
      if(skin){
        var best=0, bi=-1;
        for(var k=0;k<4;k++){ var ww=SW.getComponent(i,k); if(ww>best){ best=ww; bi=SI.getComponent(i,k); } }
        var bn=bi>=0?o.skeleton.bones[bi].name:'';
        torse[i]=TORSE[bn]?1:0;
      }
    }
    var geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));
    if(src.attributes.uv) geo.setAttribute('uv',src.attributes.uv.clone());
    if(src.index) geo.setIndex(src.index.clone());
    src.groups.forEach(function(gr){ geo.addGroup(gr.start,gr.count,gr.materialIndex); });
    geo.computeBoundingSphere();
    sortie.push({geo:geo, mat:o.material, torse:torse});
  });
  return sortie;
}

/* ---------------- chasuble fluo ---------------- */
var TEX_CHASUBLE=null;
function faireTexChasuble(){
  var c=toile(64,512), g=c.getContext('2d');
  g.fillStyle='#fff'; g.fillRect(0,0,64,512);
  grain(g,64,512,900,0.12,'#ffffff','#9a9a9a');
  /* v=0 bas de la chasuble, v=1 épaules : bandes réfléchissantes à 25 % et 55 % */
  [0.25,0.55].forEach(function(f){
    var y=Math.round((1-f)*512)-18;
    g.fillStyle='#3a3d42'; g.fillRect(0,y-3,64,42);
    g.fillStyle='#d9dde2'; g.fillRect(0,y,64,36);
    g.fillStyle='rgba(255,255,255,0.8)'; for(var x=0;x<64;x+=4) g.fillRect(x,y+3,2,30);
  });
  var t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}
/* reprend les triangles du buste du corps (matériau body), gonflés de 1,4 cm */
function geoChasuble(fige){
  var corps=null;
  fige.forEach(function(p){ if(!corps || p.geo.attributes.position.count>corps.geo.attributes.position.count) corps=p; });
  if(!corps) return null;
  var G=corps.geo, P=G.attributes.position.array, N=G.attributes.normal.array, T=corps.torse, idx=G.index?G.index.array:null;
  var mats=Array.isArray(corps.mat)?corps.mat:[corps.mat], plages=[];
  G.groups.forEach(function(gr){ var m=mats[gr.materialIndex]; if(m && /body/i.test(m.name)) plages.push([gr.start,gr.start+gr.count]); });
  if(!plages.length) plages.push([0,idx?idx.length:P.length/3]);
  var y0=1e9, y1=-1e9, i, q;
  for(i=0;i<P.length/3;i++) if(T[i]){ var yy=P[i*3+1]; if(yy<y0)y0=yy; if(yy>y1)y1=yy; }
  var hanche=y0+(y1-y0)*0.30, epaule=y1-(y1-y0)*0.04;
  var out=[], nor=[], uv=[];
  for(q=0;q<plages.length;q++) for(i=plages[q][0];i<plages[q][1];i+=3){
    var a=idx?idx[i]:i, b=idx?idx[i+1]:i+1, c=idx?idx[i+2]:i+2;
    if(!(T[a]&&T[b]&&T[c])) continue;
    var ymin=Math.min(P[a*3+1],P[b*3+1],P[c*3+1]), ymax=Math.max(P[a*3+1],P[b*3+1],P[c*3+1]);
    if(ymin<hanche || ymax>epaule) continue;
    [a,b,c].forEach(function(k){
      out.push(P[k*3]+N[k*3]*0.014, P[k*3+1]+N[k*3+1]*0.014, P[k*3+2]+N[k*3+2]*0.014);
      nor.push(N[k*3],N[k*3+1],N[k*3+2]);
      uv.push(0.5,(P[k*3+1]-hanche)/(epaule-hanche));
    });
  }
  var g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(out,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.computeBoundingSphere();
  return g;
}
function matChasuble(niv){
  if(!TEX_CHASUBLE) TEX_CHASUBLE=faireTexChasuble();
  var k='chas'+niv;
  if(!MAT[k]) MAT[k]=new THREE.MeshStandardMaterial({color:niv==='r'?0xe0261a:0xff8a00, map:TEX_CHASUBLE,
    roughness:0.55, metalness:0, emissive:niv==='r'?0x3a0602:0x3a1c00, side:THREE.DoubleSide});
  return MAT[k];
}
/* =================================================================
   Intégration des personnages réalistes dans l'espace 3D.
   Coureur : militaire animé (repos, marche, course) mélangés selon
   la vitesse. Jalonneurs : 4 civils, pose figée bras droit ou gauche,
   chasuble rouge (indispensable) ou orange (facultatif).
   Si un modèle manque, les personnages dessinés restent en place.
================================================================= */
var VARIANTES=['Male_Adult_06','Male_Adult_09','Female_Adult_08','Female_Adult_01'];
var PERSO={pret:false, jal:{}, coureurFbx:null, clips:null};
var _prepAncien=preparerPersonnages, _joueurAncien=faireJoueur, _majJoueurAncien=majJoueur, _majJalAncien=majJalonneur;

function reposOs(g){ var R=[]; g.traverse(function(o){ if(o.isBone) R.push([o,o.quaternion.clone(),o.position.clone()]); }); return R; }
function restaurerOs(R){ R.forEach(function(e){ e[0].quaternion.copy(e[1]); e[0].position.copy(e[2]); }); }
function chargerClip(nom){
  return actifOctets(nom+'.fbx').then(function(buf){
    var o=new EXT.FBXLoader().parse(buf,'');
    var c=o.animations[0];
    /* on garde la hauteur du bassin mais pas son déplacement au sol */
    c.tracks=c.tracks.filter(function(t){ return !/Footsteps/.test(t.name); });
    return c;
  });
}
preparerPersonnages=function(){
  _prepAncien();
  if(!EXT.FBXLoader || !window.ACTIFS || !ACTIFS['Male_Adult_06.fbx']) return;
  var p=Promise.resolve();
  VARIANTES.forEach(function(nom,vi){
    p=p.then(function(){ return chargerAvatar(nom); }).then(function(f){
      var g=normaliserAvatar(f,nom.indexOf('Female')===0?1.70:1.78), R=reposOs(g);
      ['d','g','n','x'].forEach(function(bras){
        restaurerOs(R); g.updateMatrixWorld(true);
        poserBrasJalon(g,bras);
        var fige=figerAvatar(g);
        PERSO.jal[vi+bras]={parts:fige.map(function(q){ return {geo:q.geo, mat:q.mat}; }), chas:geoChasuble(fige)};
      });
      /* gabarit remis au repos, réutilisé pour les jalonneurs animés et les piétons */
      restaurerOs(R); g.updateMatrixWorld(true);
      PERSO.gabarits=PERSO.gabarits||{};
      PERSO.gabarits[nom]={g:g, f:f, rest:R};
    }).catch(function(e){ console.error('Jalonneur '+nom,e); });
  });
  p=p.then(function(){
    return chargerAvatar('Military_Male_02',{sm024_body_color_acu:'sm024_body_color_ce',sm024_head_color_acu:'sm024_head_color_ce'});
  }).then(function(f){
    PERSO.coureurFbx=f;
    return Promise.all(['m_idle_neutral_01','m_walk_neutral_01','m_run_neutral_01'].map(chargerClip));
  }).then(function(c){
    PERSO.clips={idle:c[0], walk:c[1], run:c[2]};
    PERSO.pret=true;
  }).catch(function(e){ console.error('Coureur réaliste indisponible',e); PERSO.pret=false; });
  return p;
};
ETAPES.forEach(function(e){
  if(e[1]===_prepAncien){ e[1]=preparerPersonnages; e[0]='Personnages réalistes : coureur et jalonneurs'; }
});

faireJoueur=function(){
  if(!PERSO.pret || !PERSO.coureurFbx) return _joueurAncien();
  var f=PERSO.coureurFbx, g=normaliserAvatar(f,1.78);
  var mix=new THREE.AnimationMixer(f), A={};
  ['idle','walk','run'].forEach(function(k){
    A[k]=mix.clipAction(PERSO.clips[k]);
    A[k].play();
    A[k].setEffectiveWeight(k==='idle'?1:0);
  });
  g.userData={reel:true, mixer:mix, actions:A, poids:{idle:1, walk:0, run:0}};
  return g;
};
majJoueur=function(dt){
  var u=joueur.userData;
  if(!u.reel) return _majJoueurAncien(dt);
  var y=hauteur(J.x,J.z), ec=J.ecart;
  if(ec<0.55) y+=0.19; else if(ec<1.15) y+=0.19*(1.15-ec)/0.6;
  joueur.position.set(J.x,y,J.z);
  joueur.rotation.y=-J.cap;
  var vit=Math.abs(J.v);
  J.phase+=dt*(1.6+Math.min(vit,9)*1.25);
  var cible={idle:0, walk:0, run:0};
  if(vit<0.25) cible.idle=1;
  else { var t=Math.min(1,Math.max(0,(vit-1.7)/1.3)); cible.walk=1-t; cible.run=t; }
  var k=dt>0?Math.min(1,dt*7):1;
  ['idle','walk','run'].forEach(function(n){
    u.poids[n]+=(cible[n]-u.poids[n])*k;
    u.actions[n].setEffectiveWeight(u.poids[n]);
  });
  u.actions.walk.timeScale=Math.max(0.5,Math.min(1.6,vit/1.35));
  u.actions.run.timeScale=Math.max(0.7,Math.min(3.0,vit/3.6));
  u.mixer.update(dt);
};

majJalonneur=function(o,n){
  var j=o.j, or=CARTE.orientation(j), vi=((j._vis||0)%4+4)%4, R=PERSO.jal[vi+or.bras];
  if(!R) return _majJalAncien(o,n);
  var x=pX(j.lo), z=pZ(j.la), y=hauteur(x,z);
  var cle='R'+j.niv+or.bras+vi;
  if(cle!==o.cle){
    if(o.haut){ o.lod.remove(o.haut); o.lod.remove(o.bas); o.lod.levels.length=0; }
    var gr=new THREE.Group();
    R.parts.forEach(function(p){ var m=new THREE.Mesh(p.geo,p.mat); m.castShadow=true; gr.add(m); });
    if(R.chas){ var mc=new THREE.Mesh(R.chas,matChasuble(j.niv)); mc.castShadow=true; gr.add(mc); }
    o.haut=gr;
    o.bas=new THREE.Mesh(geoJalonSimple(j.niv,or.bras),MAT.persoSimple); o.bas.castShadow=true;
    o.lod.addLevel(o.haut,0); o.lod.addLevel(o.bas,38);
    o.cle=cle;
  }
  o.lod.position.set(x,y,z);
  o.lod.rotation.y=-capDeAz(or.az);
  o.proxy.position.set(x,y,z);
  var ce=n+j.niv;
  if(ce!==o.cleEtiq){
    if(o.etiq){ monde.remove(o.etiq); o.etiq.material.map.dispose(); o.etiq.material.dispose(); }
    o.etiq=etiquette(String(n), j.niv==='r'?'#d12b1e':'#f3970d', '#ffffff', '#ffffff', 74, 0.78);
    monde.add(o.etiq); o.cleEtiq=ce;
  }
  o.etiq.position.set(x,y+2.1,z);
  o.x=x; o.z=z; o.n=n; o.az=or.az; o.bras=or.bras;
  o.d=(typeof j._km==='number') ? j._km*1000 : (TRACE.length?surLeParcours(x,z).d:0);
};
/* =================================================================
   Textures photo (Poly Haven, CC0) : enduit, pierre de taille, tuiles,
   bitume, dalles, herbe, mur de pierre, brique, gravier.
   Façades dessinées en double résolution sur fond photo.
   Haies taillées continues au lieu de buissons isolés.
================================================================= */
var PHI={}, PHT={}, PH_OK=false;
var PH_IDS=['plastered_wall_02','white_sandstone_blocks_02','clay_roof_tiles_02','asphalt_04','square_concrete_pavers','leafy_grass','stone_wall','brick_wall_07','gravel_road'];
function prechargerPhotos(){
  if(!window.ACTIFS || !ACTIFS['ph_asphalt_04_diff.jpg']) return;
  var att=[];
  PH_IDS.forEach(function(id){
    ['diff','nor_gl','rough'].forEach(function(m){
      var url=actifURL('ph_'+id+'_'+m+'.jpg');
      if(!url) return;
      att.push(new Promise(function(ok){
        var im=new Image();
        im.onload=function(){ PHI[id+'_'+m]=im; ok(); };
        im.onerror=function(){ ok(); };
        im.src=url;
      }));
    });
  });
  return Promise.all(att).then(function(){ PH_OK=!!PHI['asphalt_04_diff']; });
}
ETAPES.splice(1,0,['Textures photo : enduits, pierre, tuiles, bitume',prechargerPhotos]);

function phTex(id,m,rx,ry){
  var im=PHI[id+'_'+m];
  if(!im) return null;
  var k=id+'|'+m+'|'+rx+'|'+ry;
  if(PHT[k]) return PHT[k];
  var t=new THREE.Texture(im);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(rx||1,ry||1);
  t.anisotropy=8;
  if(m==='diff' && t.colorSpace!==undefined) t.colorSpace=THREE.SRGBColorSpace;
  t.needsUpdate=true;
  return (PHT[k]=t);
}
function phAppliquer(mat,id,rx,ry,force){
  if(!PH_OK || !mat) return false;
  var d=phTex(id,'diff',rx,ry), n=phTex(id,'nor_gl',rx,ry), r=phTex(id,'rough',rx,ry);
  if(!d) return false;
  mat.map=d;
  if(n){ mat.normalMap=n; mat.normalScale.set(force||1,force||1); }
  if(r){ mat.roughnessMap=r; mat.roughness=1; }
  mat.needsUpdate=true;
  return true;
}
function envelopperEtape(ancienne,apres,nom){
  var nv=function(){
    var r=ancienne.apply(null,arguments);
    if(r && typeof r.then==='function') return r.then(function(){ apres(); });
    apres();
    return r;
  };
  ETAPES.forEach(function(e){ if(e[1]===ancienne){ e[1]=nv; if(nom) e[0]=nom; } });
  return nv;
}

/* ---------------- façades : double résolution, fond photo ---------------- */
function enHD(fn){
  var t0=toile;
  toile=function(w,h){ var c=t0(w*2,h*2); c.getContext('2d').scale(2,2); c.__hd=2; return c; };
  try{ return fn(); } finally { toile=t0; }
}
var _fondAncien=fondFamille;
fondFamille=function(g,W,H,f){
  var id=(f===1)?'white_sandstone_blocks_02':'plastered_wall_02', im=PHI[id+'_diff'];
  if(!PH_OK || !im) return _fondAncien(g,W,H,f);
  var tw=(f===1)?118:150;
  for(var y=0;y<H;y+=tw) for(var x=0;x<W;x+=tw) g.drawImage(im,x,y,tw,tw);
  if(f===1){ g.fillStyle='rgba(238,226,200,0.22)'; g.fillRect(0,0,W,H); }
  else if(f===2){ g.fillStyle='rgba(214,170,110,0.30)'; g.fillRect(0,0,W,H); }
  else if(f===3){ g.fillStyle='rgba(250,248,242,0.42)'; g.fillRect(0,0,W,H); }
  else { g.fillStyle='rgba(236,228,212,0.18)'; g.fillRect(0,0,W,H); }
  for(var i=0;i<10;i++){
    var xx=Math.random()*W, lg=g.createLinearGradient(0,0,0,H);
    lg.addColorStop(0,'rgba(60,55,45,0)'); lg.addColorStop(1,'rgba(60,55,45,0.10)');
    g.fillStyle=lg; g.fillRect(xx,H*Math.random()*0.5,3+Math.random()*8,H);
  }
};
var _etageAncien=faireEtage, _rdcAncien=faireRdc;
faireEtage=function(f){ return enHD(function(){ return _etageAncien(f); }); };
faireRdc=function(f){ return enHD(function(){ return _rdcAncien(f); }); };
var _rugoAncien=texRugosite;
texRugosite=function(W,H,rects,fond,vitre){
  var k=W>256?W/256:1;
  if(k===1) return _rugoAncien(W,H,rects,fond,vitre);
  return _rugoAncien(W,H,rects.map(function(r){ return [r[0]*k,r[1]*k,r[2]*k,r[3]*k]; }),fond,vitre);
};

/* ---------------- terrain : herbe, cours et chemins en photo ---------------- */
var _matSolAncien=materielSol;
materielSol=function(){
  var m=_matSolAncien();
  if(!PH_OK) return m;
  var herbe=phTex('leafy_grass','diff',3.4,3.4), hn=phTex('leafy_grass','nor_gl',3.4,3.4);
  if(herbe){ m.map=herbe; }
  if(hn){ m.normalMap=hn; m.normalScale.set(0.7,0.7); }
  var bit=phTex('asphalt_04','diff',1,1), grav=phTex('gravel_road','diff',1,1);
  var ob=m.onBeforeCompile;
  m.onBeforeCompile=function(sh){
    if(ob) ob(sh);
    if(sh.uniforms.tBeton && bit) sh.uniforms.tBeton.value=bit;
    if(sh.uniforms.tTerre && grav) sh.uniforms.tTerre.value=grav;
    sh.fragmentShader=sh.fragmentShader
      .replace('vec3 cHerbe=texture2D(map,vMapUv).rgb*vColor;','vec3 cHerbe=texture2D(map,vMapUv).rgb*min(vColor*1.45,vec3(1.15));')
      .replace('vec3 cBeton=texture2D(tBeton,vMonde.xz/3.2).rgb*vec3(0.78,0.76,0.72);','vec3 cBeton=texture2D(tBeton,vMonde.xz/3.4).rgb*vec3(1.12,1.10,1.06);')
      .replace('vec3 cTerre=texture2D(tTerre,vMonde.xz/3.6).rgb*vec3(0.92,0.86,0.74);','vec3 cTerre=texture2D(tTerre,vMonde.xz/2.6).rgb*vec3(1.0,0.96,0.88);');
  };
  m.customProgramCacheKey=function(){ return 'solPH'; };
  m.needsUpdate=true;
  return m;
};

/* ---------------- zones et voies ---------------- */
etapeZones=envelopperEtape(etapeZones,function(){
  if(phAppliquer(MAT.sol,'leafy_grass',2.3,2.3,0.7)) MAT.sol.color.setScalar(1.45);
  if(phAppliquer(MAT.dur,'asphalt_04',1.9,1.9,0.8)) MAT.dur.color.setScalar(1.35);
});
function shaderChaussee(mat,tCani){
  if(!TEX_MACRO) TEX_MACRO=faireMacro();
  mat.onBeforeCompile=function(sh){
    sh.uniforms.tCani={value:tCani};
    sh.uniforms.tMacro={value:TEX_MACRO};
    sh.vertexShader=sh.vertexShader
      .replace('#include <common>','#include <common>\nvarying vec3 vMonde;\nvarying vec2 vUv0;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvMonde=(modelMatrix*vec4(transformed,1.0)).xyz;\nvUv0=uv;');
    sh.fragmentShader=sh.fragmentShader
      .replace('#include <common>','#include <common>\nvarying vec3 vMonde;\nvarying vec2 vUv0;\nuniform sampler2D tCani;\nuniform sampler2D tMacro;')
      .replace('#include <map_fragment>',[
        'vec4 sampledDiffuseColor=texture2D(map,vMapUv);',
        'vec3 cani=texture2D(tCani,vUv0).rgb;',
        'float bd=min(vUv0.y,1.0-vUv0.y);',
        'float bord=1.0-smoothstep(0.050,0.066,bd);',
        'sampledDiffuseColor.rgb=mix(sampledDiffuseColor.rgb,cani*1.2,bord);',
        'sampledDiffuseColor.rgb*=0.88+0.26*texture2D(tMacro,vMonde.xz/41.0).r;',
        'diffuseColor*=sampledDiffuseColor;'
      ].join('\n'));
  };
  mat.customProgramCacheKey=function(){ return 'chausseePH'; };
  mat.needsUpdate=true;
}
etapeVoies=envelopperEtape(etapeVoies,function(){
  if(!PH_OK) return;
  var cani=textureDe(faireChaussee(false),1,1);
  if(phAppliquer(MAT.bit,'asphalt_04',2.1,2.1,0.9)){ MAT.bit.color.setRGB(0.50,0.50,0.52); shaderChaussee(MAT.bit,cani); }
  if(phAppliquer(MAT.chemin,'gravel_road',1.4,1.0,1.0)) MAT.chemin.color.setScalar(1.15);
  if(phAppliquer(MAT.trot,'square_concrete_pavers',1.0,0.9,1.0)) shaderDesature(MAT.trot,0.85,[1.02,1.02,1.04],23,'trotPH');
});
/* dalles photo trop brunes : on garde le relief, on ramène la teinte au gris béton */
function shaderDesature(mat,force,teinteRGB,ech,cle){
  if(!TEX_MACRO) TEX_MACRO=faireMacro();
  mat.onBeforeCompile=function(sh){
    sh.uniforms.tMacro={value:TEX_MACRO};
    sh.vertexShader=sh.vertexShader
      .replace('#include <common>','#include <common>\nvarying vec3 vMonde;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvMonde=(modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader=sh.fragmentShader
      .replace('#include <common>','#include <common>\nvarying vec3 vMonde;\nuniform sampler2D tMacro;')
      .replace('#include <map_fragment>',[
        'vec4 sampledDiffuseColor=texture2D(map,vMapUv);',
        'float lum=dot(sampledDiffuseColor.rgb,vec3(0.299,0.587,0.114));',
        'sampledDiffuseColor.rgb=mix(sampledDiffuseColor.rgb,vec3(lum),'+force.toFixed(2)+')*vec3('+teinteRGB.map(function(v){ return v.toFixed(3); }).join(',')+')*1.25;',
        'sampledDiffuseColor.rgb*=0.9+0.2*texture2D(tMacro,vMonde.xz/'+ech.toFixed(1)+').r;',
        'diffuseColor*=sampledDiffuseColor;'
      ].join('\n'));
  };
  mat.customProgramCacheKey=function(){ return cle; };
  mat.needsUpdate=true;
}

/* ---------------- haies taillées ---------------- */
var TAS_HAIE=null;
function faireHaie(){
  var W=256, H=256, c=toile(W,H), g=c.getContext('2d'), i;
  g.fillStyle='#24401d'; g.fillRect(0,0,W,H);
  var verts=['#2f5226','#3b6230','#4a7338','#2a4722','#58803f','#1d3417'];
  for(i=0;i<5200;i++){
    var x=Math.random()*W, y=Math.random()*H, r=1.5+Math.random()*3.2, a=Math.random()*3.14;
    g.fillStyle=verts[Math.floor(Math.random()*verts.length)];
    for(var ox=-W;ox<=W;ox+=W) for(var oy=-H;oy<=H;oy+=H){
      g.beginPath(); g.ellipse(x+ox,y+oy,r,r*0.55,a,0,7); g.fill();
    }
  }
  for(i=0;i<500;i++){ g.fillStyle='rgba(10,20,8,0.5)'; g.fillRect(Math.random()*W,Math.random()*H,2,2); }
  return c;
}
function haie(tas,pts,larg,h){
  var q=densifier(pts,2.5), qx=q.x, qz=q.z;
  for(var i=1;i<qx.length;i++){
    var ax=qx[i-1], az=qz[i-1], bx=qx[i], bz=qz[i];
    var dx=bx-ax, dz=bz-az, dl=Math.hypot(dx,dz);
    if(dl<0.2) continue;
    var ex=dx/dl*0.12, ez=dz/dl*0.12;
    var nx=dz/dl*larg/2, nz=-dx/dl*larg/2;
    var y0=Math.min(hauteur(ax,az),hauteur(bx,bz))-0.15, y1=y0+h+alea(Math.round(ax*3),Math.round(az*3))*0.05;
    var c=teinte(0xffffff);
    boiteQuad(tas,[ax+nx-ex,az+nz-ez],[bx+nx+ex,bz+nz+ez],[bx-nx+ex,bz-nz+ez],[ax-nx-ex,az-nz-ez],y0,y1,c,assombrir(c,1.08),1.6);
  }
}
var _lignesConstrAncien=construireLignes;
construireLignes=function(lgs,tasEau,tasBati,arbres){
  if(!TAS_HAIE) return _lignesConstrAncien(lgs,tasEau,tasBati,arbres);
  var autres=[];
  for(var i=0;i<lgs.length;i++){
    var l=lgs[i].split('\t');
    if(l[0]==='h' && l.length>=2) haie(TAS_HAIE,pointsDe(l[1]),0.95,1.7);
    else if(l[0]==='f' && l.length>=2 && TAS_GRILLE) grillage(TAS_GRILLE,TAS_POTEAUX,pointsDe(l[1]));
    else autres.push(lgs[i]);
  }
  _lignesConstrAncien(autres,tasEau,tasBati,arbres);
};
/* clôtures : panneaux de grillage rigide vert sur poteaux, coupés aux chaussées */
var TAS_GRILLE=null, TAS_POTEAUX=null, IDX_CH=null;
function faireGrillage(){
  var W=256, H=256, c=toile(W,H), g=c.getContext('2d'), x, y;
  g.clearRect(0,0,W,H);
  g.fillStyle='#ffffff';
  for(x=0;x<W;x+=20) g.fillRect(x,0,2.2,H);
  for(y=4;y<H;y+=13) g.fillRect(0,y,W,1.8);
  [H*0.33,H*0.66].forEach(function(yy){ g.fillRect(0,yy-3,W,5); });
  g.fillRect(0,0,W,4); g.fillRect(0,H-4,W,4);
  var t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.anisotropy=8;
  return t;
}
function grillage(tas,post,pts){
  var q=densifier(pts,2.5), qx=q.x, qz=q.z, h=1.9, vert=teinte(0x2e4c37), bl=teinte(0xffffff);
  var px=pX(-0.2120720), pz=pZ(46.4136569);
  for(var i=1;i<qx.length;i++){
    var ax=qx[i-1], az=qz[i-1], bx=qx[i], bz=qz[i], L=Math.hypot(bx-ax,bz-az);
    if(L<0.2) continue;
    /* le portail de l'ENSOA a ses propres murets et haies */
    if(Math.hypot((ax+bx)/2-px,(az+bz)/2-pz)<9.5) continue;
    if(IDX_CH && (dansChaussee(IDX_CH,(ax+bx)/2,(az+bz)/2,-1,0.6) || dansChaussee(IDX_CH,ax,az,-1,0.2) || dansChaussee(IDX_CH,bx,bz,-1,0.2))) continue;
    var ya=hauteur(ax,az)-0.05, yb=hauteur(bx,bz)-0.05, nx=(bz-az)/L, nz=-(bx-ax)/L, u=L/2.5;
    tas.tri(ax,ya,az, bx,yb,bz, bx,yb+h,bz, nx,0,nz,[0,0,u,0,u,1],bl);
    tas.tri(ax,ya,az, bx,yb+h,bz, ax,ya+h,az, nx,0,nz,[0,0,u,1,0,1],bl);
    tube(post,ax,ya-0.2,az, ax,ya+h+0.06,az, 0.03,0.03,5,vert,false,true);
  }
}
etapeLignes=(function(anc){
  var nv=function(){
    TAS_HAIE=new Tas(16384); TAS_GRILLE=new Tas(16384); TAS_POTEAUX=new Tas(16384);
    IDX_CH=indexerChaussees(Dvoies);
    anc();
    MAT.haie=matTexture(faireHaie(),3.2,{rugo:0.95});
    ajouter(TAS_HAIE,MAT.haie,true,true);
    MAT.grille=new THREE.MeshStandardMaterial({map:faireGrillage(), color:0x2f4d38, alphaTest:0.45, side:THREE.DoubleSide, roughness:0.55, metalness:0.3});
    ajouter(TAS_GRILLE,MAT.grille,true,true);
    ajouter(TAS_POTEAUX,new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.5, metalness:0.35}),true,true);
    TAS_GRILLE=null; TAS_POTEAUX=null;
    if(phAppliquer(MAT.murets,'stone_wall',1.0,0.8,1.2)) MAT.murets.color.setScalar(1.05);
    TAS_HAIE=null;
  };
  ETAPES.forEach(function(e){ if(e[1]===anc){ e[1]=nv; e[0]='Murs de pierre, haies taillées'; } });
  return nv;
})(etapeLignes);

/* ---------------- toitures ---------------- */
etapeBatis=envelopperEtape(etapeBatis,function(){
  if(phAppliquer(MAT.toits,'clay_roof_tiles_02',0.62,0.62,1.3)) MAT.toits.color.setScalar(1.12);
  if(phAppliquer(MAT.plats,'gravel_road',0.8,0.8,0.8)) MAT.plats.color.setScalar(1.05);
});
/* =================================================================
   Arbres réalistes (ez-tree, MIT) en trois niveaux de détail,
   voitures stationnées (Kenney Car Kit, CC0) et mobilier urbain
   placé aux positions réelles OpenStreetMap : passages piétons,
   stops, cédez-le-passage, feux, bancs, boîtes aux lettres,
   corbeilles, arceaux vélo, monuments.
================================================================= */
var EZ=window['@dgreenheck/ez-tree'];
var ARB={pret:false, liste:[], sets:[], loin:[], cx:1e9, cz:1e9, t:0};
var R_PRES=95, R_MOY=340;

function ezVariante(preset,seed,red,feuilles){
  var t=new EZ.Tree();
  t.loadPreset(preset);
  var o=t.options, k;
  o.seed=seed;
  for(k in o.branch.sections) o.branch.sections[k]=Math.max(3,Math.round(o.branch.sections[k]*red));
  if(o.branch.segments) for(k in o.branch.segments) o.branch.segments[k]=Math.max(3,Math.round(o.branch.segments[k]*red));
  o.leaves.count=Math.max(3,Math.round(o.leaves.count*feuilles));
  if(feuilles<0.6){ o.leaves.size*=1.35; o.leaves.billboard='single'; }
  t.generate();
  t.updateMatrixWorld(true);
  var bb=new THREE.Box3().setFromObject(t), parts=[];
  t.traverse(function(m){
    if(!m.isMesh) return;
    var mm=m.material;
    var s=new THREE.MeshStandardMaterial({map:mm.map||null, color:mm.color?mm.color.clone():new THREE.Color(0xffffff),
      alphaTest:mm.alphaTest||0, side:mm.side, roughness:0.88, metalness:0});
    if(mm.normalMap){ s.normalMap=mm.normalMap; }
    var g=m.geometry.clone(); g.applyMatrix4(m.matrixWorld);
    parts.push({geo:g, mat:s, feuille:!!mm.alphaTest});
  });
  return {h:bb.max.y-bb.min.y, y0:bb.min.y, parts:parts};
}
function geoArbreLoin(conif){
  var feu=new Tas(512), tronc=new Tas(256), h=conif?13:11, ray=conif?2.2:3.6, ht=conif?h*0.16:h*0.36;
  tube(tronc,0,0,0, 0,ht*1.25,0, 0.3,0.18,5,teinte(0xffffff),false,false);
  var cy=ht+(conif?h*0.42:h*0.30), hf=conif?h*0.86:h*0.72, u0=conif?0.5:0, u1=conif?1:0.5;
  var c=conif?teinte(0x9ec090):teinte(0xc8e0a8);
  panneau(feu,0,cy,0,0,ray*2,hf,u0,u1,c);
  panneau(feu,0,cy,0,1.047,ray*2,hf,u0,u1,assombrir(c,0.93));
  panneau(feu,0,cy,0,2.094,ray*2,hf,u0,u1,assombrir(c,0.87));
  return {feu:feu.geo(), tronc:tronc.geo(), h:h};
}
function mobilierLignes(){
  var t=donnee('d-mobilier');
  return t?t.split('\n'):[];
}
function etapeArbresReels(){
  var n0=monde.children.length;
  _arbresAncien();
  if(!EZ || !EZ.Tree) return;
  var anciens=monde.children.slice(n0);
  /* arbres OpenStreetMap ajoutés s'ils ne doublent pas un arbre existant */
  var grille={}, i;
  function cle(x,z){ return Math.floor(x/4)+','+Math.floor(z/4); }
  Darbres.forEach(function(a){ grille[cle(a[0],a[1])]=1; });
  mobilierLignes().forEach(function(l){
    var c=l.split('\t'); if(c[0]!=='T') return;
    var x=pX(+c[2]), z=pZ(+c[1]);
    if(grille[cle(x,z)] || bloquer(x,z)) return;
    Darbres.push([x,z,0]); grille[cle(x,z)]=1;
  });
  var V=[['Oak Medium',11,0],['Oak Medium',42,0],['Ash Medium',7,0],['Oak Large',3,0],['Pine Medium',5,1]];
  var pres=[], moy=[];
  try{
    V.forEach(function(v){ pres.push(ezVariante(v[0],v[1],0.6,0.85)); moy.push(ezVariante(v[0],v[1],0.34,0.45)); });
  }catch(e){ console.error('ez-tree',e); return; }
  var loinD=geoArbreLoin(false), loinC=geoArbreLoin(true);
  var compte=[0,0,0,0,0], L=[];
  for(i=0;i<Darbres.length;i++){
    var a=Darbres[i];
    if(a[2]===2 && MAT.haie) continue;
    var r=alea(Math.round(a[0]*7),Math.round(a[1]*7)), r2=alea(Math.round(a[1]*11),Math.round(a[0]*11));
    /* loin du parcours, on éclaircit : 6 arbres sur 10 */
    if(r>0.6 && (!TRACE.length || surLeParcours(a[0],a[1]).ecart>30)) continue;
    var conif=(a[2]===0 && r2>0.8);
    var vi=conif?4:Math.floor(r*3.999);
    var hc=conif?(11+r*6):(a[2]===2?4+r*2:(9+r*7));
    L.push({x:a[0], z:a[1], y:hauteur(a[0],a[1])-0.08, rot:r2*6.283, hc:hc, v:vi});
    compte[vi]++;
  }
  ARB.liste=L;
  function jeu(src,ombre,cap){
    return src.map(function(v,vi){
      return v.parts.map(function(p){
        var im=new THREE.InstancedMesh(p.geo,p.mat,Math.max(1,Math.min(compte[vi],cap)));
        im.count=0; im.castShadow=ombre; im.receiveShadow=true; im.frustumCulled=false;
        monde.add(im);
        return im;
      });
    });
  }
  ARB.pres=jeu(pres,true,900); ARB.moy=jeu(moy,false,4000);
  ARB.varH=pres.map(function(v){ return v; });
  ARB.varHm=moy;
  var nL=L.length;
  ARB.loin=[
    [new THREE.InstancedMesh(loinD.tronc,MAT.tronc,nL), new THREE.InstancedMesh(loinD.feu,MAT.feuillage,nL)],
    [new THREE.InstancedMesh(loinC.tronc,MAT.tronc,nL), new THREE.InstancedMesh(loinC.feu,MAT.feuillage,nL)]
  ];
  ARB.loinH=[loinD.h,loinC.h];
  ARB.loin.forEach(function(p){ p.forEach(function(im){ im.count=0; im.frustumCulled=false; im.castShadow=false; monde.add(im); }); });
  anciens.forEach(function(o){ monde.remove(o); });
  ARB.pret=true; ARB.cx=1e9;
}
var _m4=new THREE.Matrix4(), _q4=new THREE.Quaternion(), _s4=new THREE.Vector3(), _p4=new THREE.Vector3(), _ay=new THREE.Vector3(0,1,0);
function majArbres(cx,cz){
  if(!ARB.pret) return;
  if(Math.hypot(cx-ARB.cx,cz-ARB.cz)<9) return;
  ARB.cx=cx; ARB.cz=cz;
  var np=ARB.pres.map(function(){ return 0; }), nm=ARB.moy.map(function(){ return 0; }), nl=[0,0];
  var r1=R_PRES*R_PRES, r2=R_MOY*R_MOY, L=ARB.liste;
  for(var i=0;i<L.length;i++){
    var a=L[i], dx=a.x-cx, dz=a.z-cz, d2=dx*dx+dz*dz, v, s, k;
    _q4.setFromAxisAngle(_ay,a.rot);
    if(d2<r2){
      var proche=d2<r1, src=proche?ARB.varH[a.v]:ARB.varHm[a.v], jeu=proche?ARB.pres[a.v]:ARB.moy[a.v], cpt=proche?np:nm;
      if(cpt[a.v]>=jeu[0].instanceMatrix.count){ continue; }
      s=a.hc/src.h;
      _p4.set(a.x,a.y-src.y0*s,a.z); _s4.set(s,s,s);
      _m4.compose(_p4,_q4,_s4);
      for(k=0;k<jeu.length;k++) jeu[k].setMatrixAt(cpt[a.v],_m4);
      cpt[a.v]++;
    } else {
      var t=a.v===4?1:0;
      s=a.hc/ARB.loinH[t];
      _p4.set(a.x,a.y,a.z); _s4.set(s,s,s);
      _m4.compose(_p4,_q4,_s4);
      ARB.loin[t][0].setMatrixAt(nl[t],_m4); ARB.loin[t][1].setMatrixAt(nl[t],_m4);
      nl[t]++;
    }
  }
  function fixer(jeux,cpt){ jeux.forEach(function(j,vi){ j.forEach(function(im){ im.count=cpt[vi]; im.instanceMatrix.needsUpdate=true; }); }); }
  fixer(ARB.pres,np); fixer(ARB.moy,nm);
  ARB.loin.forEach(function(p,t){ p.forEach(function(im){ im.count=nl[t]; im.instanceMatrix.needsUpdate=true; }); });
}
var _arbresAncien=etapeArbres;
ETAPES.forEach(function(e){ if(e[1]===_arbresAncien){ e[1]=etapeArbresReels; e[0]='Arbres réalistes'; } });

/* ---------------- voitures ---------------- */
var VOIT={modeles:[], ims:[]};
function chargerGLB(nom){
  return actifOctets(nom).then(function(buf){
    return new Promise(function(ok,ko){
      var man=new THREE.LoadingManager();
      man.setURLModifier(function(u){ return /colormap/i.test(u)?(actifURL('v_colormap.png')||u):u; });
      var L=new EXT.GLTFLoader(man), cib=window.createImageBitmap;
      try{ window.createImageBitmap=undefined; L.parse(buf,'',ok,ko); }
      finally{ window.createImageBitmap=cib; }
    });
  });
}
function fusionnerModele(scene){
  var geos=[], mat=null;
  scene.updateMatrixWorld(true);
  scene.traverse(function(o){
    if(!o.isMesh) return;
    var g=o.geometry.clone().applyMatrix4(o.matrixWorld);
    Object.keys(g.attributes).forEach(function(a){ if(a!=='position'&&a!=='normal'&&a!=='uv') g.deleteAttribute(a); });
    geos.push(g.index?g.toNonIndexed():g);
    if(!mat) mat=o.material;
  });
  var f=EXT.mergeGeometries(geos,false);
  if(mat){ mat=new THREE.MeshStandardMaterial({map:mat.map, roughness:0.45, metalness:0.25}); if(mat.map) mat.map.colorSpace=THREE.SRGBColorSpace; }
  return {geo:f, mat:mat};
}
function routeProche(I,x,z,rayon){
  var best=null, bd=rayon||8;
  for(var gx=-1;gx<=1;gx++) for(var gz=-1;gz<=1;gz++){
    var Lc=I.grille[(Math.floor(x/I.C)+gx)+','+(Math.floor(z/I.C)+gz)];
    if(!Lc) continue;
    for(var k=0;k<Lc.length;k++){
      var s=I.segs[Lc[k]], dx=s.bx-s.ax, dz=s.bz-s.az, l2=dx*dx+dz*dz;
      if(l2<0.01) continue;
      var t=((x-s.ax)*dx+(z-s.az)*dz)/l2; t=t<0?0:(t>1?1:t);
      var px=s.ax+dx*t, pz=s.az+dz*t, d=Math.hypot(x-px,z-pz);
      if(d<bd){ var L=Math.sqrt(l2); bd=d; best={s:s, px:px, pz:pz, ux:dx/L, uz:dz/L, w:s.h*2, d:d}; }
    }
  }
  return best;
}
function placerVoitures(I,nm){
  nm=nm||5;
  var slots=[]; for(var sm=0;sm<nm;sm++) slots.push([]);
  for(var i=0;i<Dvoies.length;i++){
    var l=Dvoies[i].split('\t');
    if(l.length<4 || l[0]!=='r') continue;
    var w=(+l[1])/10;
    if(w<6) continue;
    /* sur une rue circulée étroite, pas de stationnement : la file de circulation passe au bord */
    if(voieCirculable(i) && w<9) continue;
    var sensUnique=+(l[4]||0);
    var p=pointsDe(l[3]);
    for(var s=2;s<p.length;s+=2){
      var ax=p[s-2], az=p[s-1], dx=p[s]-ax, dz=p[s+1]-az, L=Math.hypot(dx,dz);
      if(L<9) continue;
      var ux=dx/L, uz=dz/L, nx=uz, nz=-ux;
      for(var t=4;t<L-4;t+=5.9){
        for(var cote=-1;cote<=1;cote+=2){
          var h=alea(i*31+Math.round(t*3)+s,Math.round(ax*2+az)+cote*17);
          if(h>0.17) continue;
          var off=w/2-1.15, x=ax+ux*t+nx*off*cote, z=az+uz*t+nz*off*cote;
          if(dansChaussee(I,x,z,i,3.0) || bloquer(x,z) || bloquer(x+nx*cote*1.4,z+nz*cote*1.4)) continue;
          if(dansZoneMilitaire(x,z)) continue;
          if(TRACE.length && surLeParcours(x,z).ecart<2.6) continue;
          var mi=Math.floor(alea(Math.round(x),Math.round(z))*nm*0.9999);
          /* garé dans le sens de sa file : côté droit (cote -1) vers l'avant du tracé OSM */
          var sens=sensUnique!==0?sensUnique:(cote<0?1:-1);
          slots[mi].push([x,z,Math.atan2(ux,uz)+(sens<0?PI:0),i]);
        }
      }
    }
  }
  return slots;
}
function etapeVoitures(){
  if(!EXT.GLTFLoader || !EXT.FBXLoader || !window.ACTIFS || !(ACTIFS['r2_Sedan.fbx']||ACTIFS['k2_car_sedan.gltf'])) return;
  return chargerModelesVoitures()
  .then(function(mods){
    if(!mods.length) throw new Error('aucun modèle de voiture');
    var I=indexerChaussees(Dvoies), slots=placerVoitures(I,mods.length);
    var ech=new THREE.Vector3(1,1,1);
    mods.forEach(function(m,mi){
      var S=slots[mi]; if(!S.length) return;
      var im=new THREE.InstancedMesh(m.geo,m.mat,S.length);
      im.userData.voies=Int32Array.from(S.map(function(s){ return s[3]; }));
      S.forEach(function(sl,k){
        _q4.setFromAxisAngle(_ay,sl[2]);
        _p4.set(sl[0],hauteur(sl[0],sl[1])+0.16,sl[1]);
        _m4.compose(_p4,_q4,ech);
        im.setMatrixAt(k,_m4);
      });
      im.castShadow=true; im.receiveShadow=true;
      im.computeBoundingSphere && im.computeBoundingSphere();
      monde.add(im); VOIT.ims.push(im);
    });
    construireMobilier(I);
  }).catch(function(e){ console.error('Voitures',e); try{ construireMobilier(indexerChaussees(Dvoies)); }catch(e2){ console.error(e2); } });
}

/* ---------------- mobilier urbain ---------------- */
function boiteOr(tas,cx,y0,cz,lx,ly,lz,ang,cm,ct){
  var c=Math.cos(ang), s=Math.sin(ang), hx=lx/2, hz=lz/2;
  function P(u,v){ return [cx+u*c-v*s, cz+u*s+v*c]; }
  boiteQuad(tas,P(-hx,-hz),P(-hx,hz),P(hx,hz),P(hx,-hz),y0,y0+ly,cm,ct||cm,1);
}
function faireAtlasPanneaux(){
  var c=toile(512,256), g=c.getContext('2d');
  g.clearRect(0,0,512,256);
  /* STOP */
  g.save(); g.translate(128,128);
  function octo(r){ g.beginPath(); for(var i=0;i<8;i++){ var a=PI/8+i*PI/4; g.lineTo(Math.cos(a)*r,Math.sin(a)*r); } g.closePath(); }
  g.fillStyle='#ffffff'; octo(124); g.fill();
  g.fillStyle='#c8161d'; octo(112); g.fill();
  g.fillStyle='#ffffff'; g.font='bold 74px Arial, sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText('STOP',0,6);
  g.restore();
  /* cédez le passage */
  g.save(); g.translate(384,128);
  g.fillStyle='#c8161d'; g.beginPath(); g.moveTo(-122,-100); g.lineTo(122,-100); g.lineTo(0,112); g.closePath(); g.fill();
  g.fillStyle='#ffffff'; g.beginPath(); g.moveTo(-82,-76); g.lineTo(82,-76); g.lineTo(0,66); g.closePath(); g.fill();
  g.restore();
  var t=new THREE.CanvasTexture(c);
  if(t.colorSpace!==undefined) t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
function panneauFace(tas,x,y,z,ang,taille,u0,u1){
  var c=Math.cos(ang), s=Math.sin(ang), h=taille/2;
  var nx=c, nz=s, px=-s*h, pz=c*h;
  var A=[x+px,y-h,z+pz], B=[x-px,y-h,z-pz], C=[x-px,y+h,z-pz], D=[x+px,y+h,z+pz];
  var blanc=teinte(0xffffff);
  tas.tri(A[0],A[1],A[2], B[0],B[1],B[2], C[0],C[1],C[2], nx,0,nz, [u0,0,u1,0,u1,1], blanc);
  tas.tri(A[0],A[1],A[2], C[0],C[1],C[2], D[0],D[1],D[2], nx,0,nz, [u0,0,u1,1,u0,1], blanc);
}
function construireMobilier(I){
  var L=mobilierLignes();
  if(!L.length) return;
  var mob=new Tas(16384), marq=new Tas(16384), pan=new Tas(1024), feux=new Tas(1024);
  var gris=teinte(0x5a6068), acier=teinte(0x9aa1a8), bois=teinte(0x8a5a36), fonte=teinte(0x2b3a30), blanc=teinte(0xf4f4f0);
  var jaune=teinte(0xf2c200), bleu=teinte(0x234e9c), pierre=teinte(0xd9d0bd), vert=teinte(0x2f4a38);
  L.forEach(function(l){
    var c=l.split('\t'); if(c.length<3) return;
    var k=c[0], x=pX(+c[2]), z=pZ(+c[1]);
    if(x<XMIN||x>XMAX||z<ZMIN||z>ZMAX) return;
    var y=hauteur(x,z), rp=routeProche(I,x,z,12);
    if(k==='C' && rp && rp.d<5){
      var w=rp.w, nx=rp.uz, nz=-rp.ux, yy=hauteur(rp.px,rp.pz)+0.195;
      for(var o=-w/2+0.55;o<w/2-0.45;o+=1.0){
        var cx=rp.px+nx*o, cz=rp.pz+nz*o;
        var a1=[cx+nx*0.25-rp.ux*1.5, cz+nz*0.25-rp.uz*1.5], a2=[cx-nx*0.25-rp.ux*1.5, cz-nz*0.25-rp.uz*1.5];
        var a3=[cx-nx*0.25+rp.ux*1.5, cz-nz*0.25+rp.uz*1.5], a4=[cx+nx*0.25+rp.ux*1.5, cz+nz*0.25+rp.uz*1.5];
        marq.tri(a1[0],yy,a1[1], a2[0],yy,a2[1], a3[0],yy,a3[1], 0,1,0,[0,0,1,0,1,1],blanc);
        marq.tri(a1[0],yy,a1[1], a3[0],yy,a3[1], a4[0],yy,a4[1], 0,1,0,[0,0,1,1,0,1],blanc);
      }
      return;
    }
    if((k==='S'||k==='Y'||k==='F') && rp){
      var cote=((x-rp.px)*rp.uz-(z-rp.pz)*rp.ux)>=0?1:-1;
      /* au bord de la chaussée, jamais sur une autre voie ni dans un bâtiment */
      var qx=0, qz=0, qy=0, trouve=false;
      for(var essai=0;essai<8 && !trouve;essai++){
        var cc=(essai%2===0)?cote:-cote, off=rp.w/2+0.55+Math.floor(essai/2)*0.9;
        qx=rp.px+rp.uz*off*cc; qz=rp.pz-rp.ux*off*cc;
        if(!dansChaussee(I,qx,qz,-1,0.25) && !bloquer(qx,qz)){ trouve=true; cote=cc; }
      }
      if(!trouve) return;
      qy=hauteur(qx,qz)+0.28;
      var face=Math.atan2(-rp.uz,-rp.ux);
      if(k==='F'){
        tube(mob,qx,qy,qz, qx,qy+3.0,qz, 0.06,0.05,6,gris,false,true);
        boiteOr(mob,qx-rp.ux*0.18,qy+2.05,qz-rp.uz*0.18,0.26,0.86,0.3,face,teinte(0x23272b));
        var fx=qx-rp.ux*0.34, fz=qz-rp.uz*0.34;
        [[2.75,teinte(0xff2a1a)],[2.48,teinte(0x3a2a08)],[2.21,teinte(0x0f2a14)]].forEach(function(e){ boule(feux,fx,qy+e[0],fz,0.085,1,8,e[1]); });
        return;
      }
      tube(mob,qx,qy,qz, qx,qy+2.25,qz, 0.035,0.035,6,acier,false,true);
      panneauFace(pan,qx-rp.ux*0.05,qy+2.0,qz-rp.uz*0.05,face,k==='S'?0.72:0.8,k==='S'?0:0.5,k==='S'?0.5:1);
      boiteOr(mob,qx+rp.ux*0.0,qy+1.6,qz,0.02,0.8,0.7,face,gris);
      if(k==='S'){
        var sy=hauteur(rp.px,rp.pz)+0.195;
        var b1=[rp.px, rp.pz], b2=[rp.px+rp.uz*rp.w/2*cote, rp.pz-rp.ux*rp.w/2*cote];
        var ex=rp.ux*0.25, ez=rp.uz*0.25;
        marq.tri(b1[0]-ex,sy,b1[1]-ez, b2[0]-ex,sy,b2[1]-ez, b2[0]+ex,sy,b2[1]+ez, 0,1,0,[0,0,1,0,1,1],blanc);
        marq.tri(b1[0]-ex,sy,b1[1]-ez, b2[0]+ex,sy,b2[1]+ez, b1[0]+ex,sy,b1[1]+ez, 0,1,0,[0,0,1,1,0,1],blanc);
      }
      return;
    }
    var ang=rp?Math.atan2(rp.uz,rp.ux):0;
    if(k==='B'){
      var fa=ang+(rp && ((x-rp.px)*rp.uz-(z-rp.pz)*rp.ux)<0?PI:0);
      var ca=Math.cos(fa), sa=Math.sin(fa);
      function Q(u,v){ return [x+u*ca-v*sa, z+u*sa+v*ca]; }
      [-0.75,0.75].forEach(function(u){ var p=Q(u,0); boiteOr(mob,p[0],y,p[1],0.07,0.44,0.5,fa,fonte); var pb=Q(u,0.24); boiteOr(mob,pb[0],y+0.44,pb[1],0.06,0.42,0.06,fa,fonte); });
      [-0.16,0,0.16].forEach(function(v){ var p=Q(0,v); boiteOr(mob,p[0],y+0.44,p[1],1.72,0.035,0.11,fa,bois); });
      [0.62,0.76].forEach(function(hh){ var p=Q(0,0.25); boiteOr(mob,p[0],y+hh,p[1],1.72,0.1,0.03,fa,bois); });
      return;
    }
    if(k==='P'){ tube(mob,x,y,z,x,y+0.9,z,0.05,0.05,6,gris,false,false); boiteOr(mob,x,y+0.9,z,0.46,0.58,0.36,ang,jaune); boiteOr(mob,x,y+1.33,z,0.47,0.08,0.37,ang,bleu); return; }
    if(k==='W'){ tube(mob,x,y,z,x,y+0.95,z,0.04,0.04,6,gris,false,false); tube(mob,x+0.05,y+0.45,z,x+0.05,y+0.95,z,0.2,0.2,10,vert,true,false); return; }
    if(k==='V'){ for(var b=-1;b<=1;b++){ var bx=x+Math.cos(ang)*b*0.8, bz=z+Math.sin(ang)*b*0.8; var nx2=-Math.sin(ang)*0.35, nz2=Math.cos(ang)*0.35;
      tube(mob,bx-nx2,y,bz-nz2,bx-nx2,y+0.75,bz-nz2,0.03,0.03,6,acier,false,false); tube(mob,bx+nx2,y,bz+nz2,bx+nx2,y+0.75,bz+nz2,0.03,0.03,6,acier,false,false);
      tube(mob,bx-nx2,y+0.75,bz-nz2,bx+nx2,y+0.75,bz+nz2,0.03,0.03,6,acier,false,false); } return; }
    if(k==='M'){
      boiteOr(mob,x,y-0.2,z,2.2,0.5,2.2,ang,assombrir(pierre,0.85));
      boiteOr(mob,x,y+0.3,z,1.5,0.4,1.5,ang,pierre);
      boiteOr(mob,x,y+0.7,z,0.8,2.2,0.8,ang,pierre);
      boiteOr(mob,x,y+2.9,z,0.95,0.2,0.95,ang,assombrir(pierre,0.92));
      return;
    }
  });
  if(!mob.vide()){
    MAT.mob=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.55, metalness:0.2});
    ajouter(mob,MAT.mob,true,true);
  }
  if(!marq.vide()){
    MAT.marqPH=MAT.marqPH||new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.6, metalness:0,
      polygonOffset:true, polygonOffsetFactor:-7, polygonOffsetUnits:-7});
    superposer(ajouter(marq,MAT.marqPH,false,true),6);
  }
  if(!pan.vide()){
    MAT.panneaux=new THREE.MeshStandardMaterial({map:faireAtlasPanneaux(), alphaTest:0.5, roughness:0.4, metalness:0.1, side:THREE.DoubleSide});
    ajouter(pan,MAT.panneaux,true,false);
  }
  if(!feux.vide()){
    ajouter(feux,new THREE.MeshBasicMaterial({vertexColors:true}),false,false);
  }
}
ETAPES.forEach(function(e,i){ if(e[1]===etapeArbresReels) ETAPES.splice(i+1,0,['Voitures stationnées et mobilier urbain',etapeVoitures]); });

var _animAncienK=animerDecor;
animerDecor=function(dt,cx,cz){
  _animAncienK(dt,cx,cz);
  ARB.t-=dt;
  if(ARB.t<=0){ ARB.t=0.3; majArbres(camera?camera.position.x:cx, camera?camera.position.z:cz); }
};
/* =================================================================
   ENSOA : façades blanches à encadrements de briques (bâtiments du
   quartier) et portail d'entrée modélisé d'après photo.
================================================================= */
var FAM3=false;
var _fondL=fondFamille;
fondFamille=function(g,W,H,f){ return _fondL(g,W,H,FAM3?3:f); };
function encadrementBrique(g,x,y,w,h){
  var bx=x-11, by=y-15, bw=w+22, bh=h+25, e=10;
  g.fillStyle='#9a3e2b';
  g.fillRect(bx,by,bw,e+1); g.fillRect(bx,by,e,bh); g.fillRect(bx+bw-e,by,e,bh); g.fillRect(bx,by+bh-8,bw,8);
  for(var k=0;k<90;k++){
    g.fillStyle='rgba('+(110+Math.random()*70|0)+','+(38+Math.random()*30|0)+','+(24+Math.random()*20|0)+',0.45)';
    var gauche=Math.random()<0.5, px=gauche?bx+Math.random()*(e-3):bx+bw-e+Math.random()*(e-3);
    g.fillRect(px,by+Math.random()*(bh-3),3.5,2.6);
  }
  g.fillStyle='rgba(226,214,196,0.6)';
  for(var yy=by+4;yy<by+bh;yy+=4.2){ g.fillRect(bx,yy,e,0.7); g.fillRect(bx+bw-e,yy,e,0.7); }
  for(var xx=bx+6;xx<bx+bw;xx+=7){ g.fillRect(xx,by+1,0.7,e-1); }
  g.fillStyle='#ece6d9'; g.fillRect(x+w/2-6,by-3,12,15);
  g.fillStyle='rgba(0,0,0,0.18)'; g.fillRect(x+w/2-6,by+11,12,1.5);
}
var _fenL=fenetre;
fenetre=function(g,x,y,w,h,volets,garde){
  if(!FAM3) return _fenL(g,x,y,w,h,volets,garde);
  encadrementBrique(g,x,y,w,h);
  return _fenL(g,x,y,w,h,null,false);
};
var _etL=faireEtage, _rdcL=faireRdc;
faireEtage=function(f){ if(f!==3) return _etL(f); FAM3=true; try{ return _etL(0); } finally{ FAM3=false; } };
faireRdc=function(f){ if(f!==3) return _rdcL(f); FAM3=true; try{ return _rdcL(0); } finally{ FAM3=false; } };

/* ---------------- portail ---------------- */
function boite4(tas,pts,y0,y1,cm,ct){
  var p=[pts[0][0],pts[0][1],pts[1][0],pts[1][1],pts[2][0],pts[2][1],pts[3][0],pts[3][1]];
  if(airePoly(p)>0) pts=[pts[0],pts[3],pts[2],pts[1]];
  boiteQuad(tas,pts[0],pts[1],pts[2],pts[3],y0,y1,cm,ct||cm,1);
}
function textePlaques(){
  var c=toile(1024,256), g=c.getContext('2d');
  [[0,'ENSOA','École nationale des sous-officiers d’active'],[512,'QUARTIER','Accès contrôlé'] ].forEach(function(p){
    var x=p[0];
    g.fillStyle='#23282d'; g.fillRect(x,0,512,256);
    g.strokeStyle='#c9a54a'; g.lineWidth=8; g.strokeRect(x+14,14,484,228);
    g.fillStyle='#e8d9a8'; g.textAlign='center'; g.textBaseline='middle';
    g.font='bold 92px Georgia, serif'; g.fillText(p[1],x+256,104);
    g.font='30px Georgia, serif'; g.fillText(p[2],x+256,186);
  });
  var t=new THREE.CanvasTexture(c);
  if(t.colorSpace!==undefined) t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
function construirePortail(){
  var la=46.4136569, lo=-0.2120720, gx=pX(lo), gz=pZ(la);
  if(gx<XMIN||gx>XMAX||gz<ZMIN||gz>ZMAX) return;
  var I=indexerChaussees(Dvoies), rp=routeProche(I,gx,gz,12);
  if(!rp) return;
  var fx=rp.ux, fz=rp.uz;
  if(fz>0){ fx=-fx; fz=-fz; }
  var rx=-fz, rz=fx, ox=rp.px, oz=rp.pz, y0=hauteur(ox,oz);
  function W(a,b){ return [ox+fx*a+rx*b, oz+fz*a+rz*b]; }
  var angF=Math.atan2(fz,fx), angR=Math.atan2(rz,rx);
  var pierre=new Tas(4096), metal=new Tas(32768), sol=new Tas(1024), plaque=new Tas(64);
  var gris=teinte(0xd9d5cd), chap=teinte(0xf0ece4), blanc=teinte(0xf6f7f4), acier=teinte(0x3e4348), beton=teinte(0xe6e5df);

  /* murets en moellons, chaperon clair, plaques */
  [[-8.0,-4.35,0],[4.35,8.2,1]].forEach(function(s){
    var bm=(s[0]+s[1])/2, lb=s[1]-s[0], c=W(0,bm);
    var yb=Math.min(hauteur(W(0,s[0])[0],W(0,s[0])[1]),hauteur(W(0,s[1])[0],W(0,s[1])[1]))-0.3;
    boiteOr(pierre,c[0],yb,c[1],0.56,(y0+2.02)-yb,lb,angF,gris);
    boiteOr(pierre,c[0],y0+2.02,c[1],0.70,0.11,lb+0.14,angF,chap,chap);
    var pc=W(-0.30,bm), hx=Math.cos(angR)*0.62, hz=Math.sin(angR)*0.62, yA=y0+1.02, yB=y0+1.64;
    var u0=s[2]*0.5, u1=u0+0.5, nx=-fx, nz=-fz, bl=teinte(0xffffff);
    plaque.tri(pc[0]+hx,yA,pc[1]+hz, pc[0]-hx,yA,pc[1]-hz, pc[0]-hx,yB,pc[1]-hz, nx,0,nz,[u0,0,u1,0,u1,1],bl);
    plaque.tri(pc[0]+hx,yA,pc[1]+hz, pc[0]-hx,yB,pc[1]-hz, pc[0]+hx,yB,pc[1]+hz, nx,0,nz,[u0,0,u1,1,u0,1],bl);
  });

  /* portail coulissant blanc à barreaudage, ouvert derrière le muret droit */
  var ga=0.78, b0=4.6, b1=13.4, bas=0.1, haut=1.86, k;
  var lm=b1-b0, cm=W(ga,(b0+b1)/2);
  boiteOr(metal,cm[0],y0+bas,cm[1],lm,0.09,0.07,angR,blanc);
  boiteOr(metal,cm[0],y0+0.42,cm[1],lm,0.05,0.05,angR,blanc);
  boiteOr(metal,cm[0],y0+haut-0.08,cm[1],lm,0.08,0.07,angR,blanc);
  for(var b=b0+0.06;b<b1;b+=0.12){
    var pb=W(ga,b);
    boiteOr(metal,pb[0],y0+bas,pb[1],0.026,haut-bas,0.026,angR,blanc);
  }
  for(k=0;k<=3;k++){
    var ps=W(ga,b0+k*lm/3);
    boiteOr(metal,ps[0],y0+bas,ps[1],0.08,haut-bas+0.02,0.08,angR,blanc);
  }
  [b0+0.5,b1-0.5].forEach(function(b){ var pr=W(ga,b); tube(metal,pr[0],y0+0.02,pr[1],pr[0],y0+0.1,pr[1],0.07,0.07,8,acier,true,true); });
  /* poteau de guidage et rail au sol */
  var pg=W(ga+0.18,b1+0.15);
  boiteOr(metal,pg[0],y0,pg[1],0.14,1.95,0.14,angR,blanc);
  var r1=W(ga-0.04,-4.3), r2=W(ga-0.04,4.3), r3=W(ga+0.04,4.3), r4=W(ga+0.04,-4.3), yr=y0+0.2;
  sol.tri(r1[0],yr,r1[1], r2[0],yr,r2[1], r3[0],yr,r3[1], 0,1,0,[0,0,1,0,1,1],acier);
  sol.tri(r1[0],yr,r1[1], r3[0],yr,r3[1], r4[0],yr,r4[1], 0,1,0,[0,0,1,1,0,1],acier);

  /* îlot central séparant entrée et sortie */
  var yi=y0+0.16;
  boite4(sol,[W(-9.2,-0.24),W(-9.2,0.24),W(0.35,0.24),W(0.35,-0.24)],yi-0.05,yi+0.12,beton,teinte(0xf2f2ee));
  boite4(sol,[W(-10.3,-0.05),W(-10.3,0.05),W(-9.2,0.24),W(-9.2,-0.24)],yi-0.05,yi+0.1,beton,teinte(0xf2f2ee));

  /* haies taillées le long de la clôture, de part et d'autre */
  var tas=new Tas(8192), meil=null, md=8, sm=0;
  Dlignes.forEach(function(s){
    var c=s.split('\t'); if((c[0]!=='f'&&c[0]!=='m') || c.length<2) return;
    var q=pointsDe(c[1]), acc=0;
    for(var i=2;i<q.length;i+=2){
      var ax=q[i-2], az=q[i-1], dx=q[i]-ax, dz=q[i+1]-az, l2=dx*dx+dz*dz, L=Math.sqrt(l2);
      if(L<0.01) continue;
      var t=((ox-ax)*dx+(oz-az)*dz)/l2; t=t<0?0:(t>1?1:t);
      var d=Math.hypot(ox-(ax+dx*t),oz-(az+dz*t));
      if(d<md){ md=d; meil=q; sm=acc+t*L; }
      acc+=L;
    }
  });
  if(meil && MAT.haie){
    var cum=[0], i2;
    for(i2=2;i2<meil.length;i2+=2) cum.push(cum[cum.length-1]+Math.hypot(meil[i2]-meil[i2-2],meil[i2+1]-meil[i2-1]));
    var tot=cum[cum.length-1];
    function pointA(s){
      s=Math.max(0,Math.min(tot,s));
      for(var j=1;j<cum.length;j++) if(cum[j]>=s){ var f=(s-cum[j-1])/((cum[j]-cum[j-1])||1); return [meil[(j-1)*2]+(meil[j*2]-meil[(j-1)*2])*f, meil[(j-1)*2+1]+(meil[j*2+1]-meil[(j-1)*2+1])*f]; }
      return [meil[meil.length-2],meil[meil.length-1]];
    }
    [[sm+8.5,sm+42],[sm-42,sm-8.3]].forEach(function(pl){
      var pts=[], s;
      for(s=pl[0];s<=pl[1];s+=1.0){
        if(s<0||s>tot) continue;
        var a=pointA(s-0.5), c=pointA(s+0.5), p=pointA(s), dx=c[0]-a[0], dz=c[1]-a[1], L=Math.hypot(dx,dz)||1;
        var nx=dz/L, nz=-dx/L;
        if(nx*fx+nz*fz>0){ nx=-nx; nz=-nz; }
        var hx=p[0]+nx*0.9, hz=p[1]+nz*0.9;
        if(dansChaussee(I,hx,hz,-1,0.5)) { if(pts.length>=4){ haie(tas,pts,1.3,1.95); } pts=[]; continue; }
        pts.push(hx,hz);
      }
      if(pts.length>=4) haie(tas,pts,1.3,1.95);
    });
    ajouter(tas,MAT.haie,true,true);
  }

  MAT.portail=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.32, metalness:0.35});
  ajouter(pierre,MAT.murets||MAT.mob,true,true);
  ajouter(metal,MAT.portail,true,true);
  var mSol=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.7, metalness:0.1, side:THREE.DoubleSide});
  ajouter(sol,mSol,true,true);
  ajouter(plaque,new THREE.MeshStandardMaterial({map:textePlaques(), roughness:0.35, metalness:0.2}),false,true);
}
ETAPES.forEach(function(e,i){ if(e[1]===etapeVoitures) ETAPES.splice(i+1,0,['Portail de l’ENSOA',construirePortail]); });
/* =================================================================
   Fluidité : on ne dessine que ce qui est à portée.
   - la ville est découpée en carrés de 160 m, masqués au-delà de la
     distance d'affichage ; seuls les carrés proches portent des ombres
   - arbres et voitures remplis autour de la caméra seulement
   - qualité Basse / Moyenne / Haute (résolution, ombres)
   - allègement automatique si l'image passe sous ~24 images/s
================================================================= */
var QUALITES=[
  {nom:'Basse',   pr:1,    ombre:0,   carte:1024, ext:50, arbrePres:35, arbreMoy:0,   voit:80},
  {nom:'Moyenne', pr:1,    ombre:70,  carte:2048, ext:55, arbrePres:50, arbreMoy:140, voit:150},
  {nom:'Haute',   pr:1.5,  ombre:140, carte:4096, ext:85, arbrePres:90, arbreMoy:300, voit:300}
];
var PERF={dist:300, qualite:1, morceaux:[], t:0, somme:0, n:0, depuis:0, auto:true};
try{
  var _pp=JSON.parse(localStorage.getItem('corrida3d-perf')||'null');
  if(_pp){ if(_pp.dist) PERF.dist=_pp.dist; if(_pp.qualite>=0 && _pp.qualite<=2) PERF.qualite=_pp.qualite; }
}catch(e){}
function QUAL(){ return QUALITES[PERF.qualite]; }
function sauverPerf(){ try{ localStorage.setItem('corrida3d-perf',JSON.stringify({dist:PERF.dist, qualite:PERF.qualite})); }catch(e){} }

/* ---------------- découpage des géométries en carrés ---------------- */
var CARRE=160;
function enregistrerMorceau(m,porte){
  var g=m.geometry;
  if(!g.boundingSphere) g.computeBoundingSphere();
  var s=g.boundingSphere;
  PERF.morceaux.push({m:m, x:s.center.x, z:s.center.z, r:s.radius, porte:!!porte});
}
var _ajouterAncien=ajouter;
ajouter=function(tas,mat,porte,recoit){
  if(tas.vide()) return null;
  var n=tas.n;
  if(n<2400){
    var m1=_ajouterAncien(tas,mat,porte,recoit);
    if(m1) enregistrerMorceau(m1,porte);
    return m1;
  }
  var P=tas.p, N=tas.nr, U=tas.u, C=tas.c, cellules={}, t, k;
  for(t=0;t+2<n;t+=3){
    var cx=(P[t*3]+P[t*3+3]+P[t*3+6])/3, cz=(P[t*3+2]+P[t*3+5]+P[t*3+8])/3;
    k=Math.floor(cx/CARRE)+','+Math.floor(cz/CARRE);
    (cellules[k]||(cellules[k]=[])).push(t);
  }
  var grp=new THREE.Group();
  Object.keys(cellules).forEach(function(cle){
    var L=cellules[cle], nv=L.length*3;
    var p=new Float32Array(nv*3), nr=new Float32Array(nv*3), u=new Float32Array(nv*2), c=new Float32Array(nv*3);
    for(var i=0;i<L.length;i++){
      var s=L[i];
      p.set(P.subarray(s*3,s*3+9),i*9);
      nr.set(N.subarray(s*3,s*3+9),i*9);
      u.set(U.subarray(s*2,s*2+6),i*6);
      c.set(C.subarray(s*3,s*3+9),i*9);
    }
    var g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(p,3));
    g.setAttribute('normal',new THREE.BufferAttribute(nr,3));
    g.setAttribute('uv',new THREE.BufferAttribute(u,2));
    g.setAttribute('color',new THREE.BufferAttribute(c,3));
    g.computeBoundingSphere();
    var mesh=new THREE.Mesh(g,mat);
    mesh.castShadow=!!porte; mesh.receiveShadow=!!recoit;
    grp.add(mesh);
    enregistrerMorceau(mesh,porte);
  });
  tas.p=tas.nr=tas.u=tas.c=null;
  monde.add(grp);
  return grp;
};
var _superposerAncien=superposer;
superposer=function(m,ordre){
  if(m && m.isGroup){
    m.children.forEach(function(c){ c.renderOrder=ordre; c.material.depthWrite=false; });
    return m;
  }
  return _superposerAncien(m,ordre);
};
function majMorceaux(cx,cz){
  var D=PERF.dist, q=QUAL(), L=PERF.morceaux;
  for(var i=0;i<L.length;i++){
    var o=L[i], d=Math.hypot(o.x-cx,o.z-cz)-o.r;
    o.m.visible=d<D;
    o.m.castShadow=o.porte && q.ombre>0 && d<q.ombre;
  }
}

/* ---------------- arbres autour de la caméra ---------------- */
majArbres=function(cx,cz){
  if(!ARB.pret) return;
  if(Math.hypot(cx-ARB.cx,cz-ARB.cz)<9) return;
  ARB.cx=cx; ARB.cz=cz;
  var q=QUAL(), D=PERF.dist, rp=Math.min(q.arbrePres,D), rm=Math.min(q.arbreMoy,D);
  var r1=rp*rp, r2=rm*rm, r3=D*D, L=ARB.liste;
  var np=ARB.pres.map(function(){ return 0; }), nm=ARB.moy.map(function(){ return 0; }), nl=[0,0];
  for(var i=0;i<L.length;i++){
    var a=L[i], dx=a.x-cx, dz=a.z-cz, d2=dx*dx+dz*dz, s, k;
    if(d2>=r3) continue;
    _q4.setFromAxisAngle(_ay,a.rot);
    if(d2<r1 || d2<r2){
      var proche=d2<r1, src=proche?ARB.varH[a.v]:ARB.varHm[a.v], jeu=proche?ARB.pres[a.v]:ARB.moy[a.v], cpt=proche?np:nm;
      if(cpt[a.v]>=jeu[0].instanceMatrix.count) continue;
      s=a.hc/src.h;
      _p4.set(a.x,a.y-src.y0*s,a.z); _s4.set(s,s,s);
      _m4.compose(_p4,_q4,_s4);
      for(k=0;k<jeu.length;k++) jeu[k].setMatrixAt(cpt[a.v],_m4);
      cpt[a.v]++;
    } else {
      var t=a.v===4?1:0;
      s=a.hc/ARB.loinH[t];
      _p4.set(a.x,a.y,a.z); _s4.set(s,s,s);
      _m4.compose(_p4,_q4,_s4);
      ARB.loin[t][0].setMatrixAt(nl[t],_m4); ARB.loin[t][1].setMatrixAt(nl[t],_m4);
      nl[t]++;
    }
  }
  function fixer(jeux,cpt,ombre){ jeux.forEach(function(j,vi){ j.forEach(function(im){ im.count=cpt[vi]; im.castShadow=ombre; im.instanceMatrix.needsUpdate=true; }); }); }
  fixer(ARB.pres,np,q.ombre>0); fixer(ARB.moy,nm,false);
  ARB.loin.forEach(function(p,t){ p.forEach(function(im){ im.count=nl[t]; im.instanceMatrix.needsUpdate=true; }); });
};

/* ---------------- voitures autour de la caméra ---------------- */
var _voituresAncien=etapeVoitures;
function etapeVoituresProches(){
  var r=_voituresAncien();
  function fin(){
    VOIT.ims.forEach(function(im){
      im.userData.toutes=new Float32Array(im.instanceMatrix.array);
      im.userData.total=im.count;
      im.count=0; im.frustumCulled=false;
    });
    VOIT.cx=1e9;
  }
  if(r && typeof r.then==='function') return r.then(fin);
  fin();
  return r;
}
ETAPES.forEach(function(e){ if(e[1]===_voituresAncien) e[1]=etapeVoituresProches; });
function majVoitures(cx,cz){
  if(!VOIT.ims.length || VOIT.cx===undefined) return;
  if(Math.hypot(cx-VOIT.cx,cz-VOIT.cz)<8) return;
  VOIT.cx=cx; VOIT.cz=cz;
  var q=QUAL(), R=Math.min(q.voit,PERF.dist), R2=R*R;
  VOIT.ims.forEach(function(im){
    var A=im.userData.toutes, tot=im.userData.total, dst=im.instanceMatrix.array, n=0, VV=im.userData.voies;
    if(!A) return;
    for(var i=0;i<tot;i++){
      var o=i*16, dx=A[o+12]-cx, dz=A[o+14]-cz;
      if(dx*dx+dz*dz>R2) continue;
      if(VV && typeof masquerStationnement==='function' && masquerStationnement(VV[i])) continue;
      if(n!==i) dst.set(A.subarray(o,o+16),n*16);
      n++;
    }
    im.count=n; im.castShadow=q.ombre>0; im.instanceMatrix.needsUpdate=true;
  });
}

/* ---------------- jalonneurs lointains masqués ---------------- */
function majJalonsVisibles(cx,cz){
  var D=PERF.dist;
  JOBJ.forEach(function(o){
    var d=Math.hypot(o.x-cx,o.z-cz);
    o.lod.visible=d<D;
    if(o.etiq) o.etiq.visible=d<Math.max(D*1.6,400);
  });
}

/* ---------------- qualité, brouillard, profondeur de vue ---------------- */
function ajusterVue(){
  if(!camera || !scene) return;
  var D=PERF.dist;
  if(scene.fog){
    scene.fog.far=Math.min(scene.fog.far,D*1.02);
    scene.fog.near=Math.min(scene.fog.near,D*0.5);
  }
  camera.far=D*1.6+200;
  camera.updateProjectionMatrix();
}
var _cielAncienM=appliquerCiel;
appliquerCiel=function(){
  _cielAncienM();
  ajusterVue();
};
function appliquerQualite(){
  if(!renderer) return;
  var q=QUAL();
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,q.pr));
  redimensionner();
  lumDir.castShadow=q.ombre>0;
  if(lumDir.shadow.mapSize.x!==q.carte){
    lumDir.shadow.mapSize.set(q.carte,q.carte);
    if(lumDir.shadow.map){ lumDir.shadow.map.dispose(); lumDir.shadow.map=null; }
  }
  var sc=lumDir.shadow.camera;
  sc.left=-q.ext; sc.right=q.ext; sc.top=q.ext; sc.bottom=-q.ext;
  sc.updateProjectionMatrix();
  appliquerCiel();
  ARB.cx=1e9; VOIT.cx=1e9; PERF.t=0;
  majInterfacePerf();
  sauverPerf();
}
function majInterfacePerf(){
  var c=$e('e3-dist'), v=$e('e3-distv'), b=$e('e3-qual');
  if(c) c.value=PERF.dist;
  if(v) v.textContent=PERF.dist;
  if(b) b.textContent='Qualité : '+QUAL().nom;
}
function interfacePerf(){
  var ref=document.querySelector('#e3 .e3-allure');
  if(!ref || $e('e3-dist')) return;
  var box=document.createElement('div');
  box.className='e3-allure';
  box.style.bottom='62px';
  box.innerHTML='<label for="e3-dist">Distance</label>'+
    '<input type="range" id="e3-dist" min="120" max="1200" step="20">'+
    '<b><span id="e3-distv"></span> m</b>'+
    '<button type="button" id="e3-qual" style="margin-left:4px;background:#1c2638;color:#e8edf5;border:1px solid #34425a;border-radius:8px;padding:4px 10px;font:inherit;font-size:12px;cursor:pointer"></button>';
  ref.parentNode.insertBefore(box,ref.nextSibling);
  var c=$e('e3-dist');
  c.addEventListener('input',function(){ PERF.dist=+c.value; PERF.auto=false; $e('e3-distv').textContent=c.value; ARB.cx=1e9; VOIT.cx=1e9; PERF.t=0; appliquerCiel(); });
  c.addEventListener('change',function(){ sauverPerf(); c.blur(); });
  $e('e3-qual').addEventListener('click',function(e){
    PERF.qualite=(PERF.qualite+1)%3; PERF.auto=false;
    appliquerQualite();
    dire('Qualité '+QUAL().nom.toLowerCase()+' : '+(QUAL().ombre?'ombres jusqu’à '+QUAL().ombre+' m':'sans ombres')+'.');
    e.currentTarget.blur();
  });
  majInterfacePerf();
}
var _brancherAncien=brancherInterface;
brancherInterface=function(){
  _brancherAncien();
  interfacePerf();
  appliquerQualite();
};

/* ---------------- minicarte et carte globale : fond dessiné une seule fois ---------------- */
var MINI_FOND=null;
function fondMini(){
  var ech=220/(MINIR*2), W=Math.ceil((XMAX-XMIN)*ech)+2, H=Math.ceil((ZMAX-ZMIN)*ech)+2;
  var c=document.createElement('canvas'); c.width=W; c.height=H;
  var g=c.getContext('2d');
  g.fillStyle='rgba(110,125,150,0.55)'; g.beginPath();
  for(var i=0;i<GEO.bats.length;i++){
    var p=GEO.bats[i].p;
    g.moveTo((p[0]-XMIN)*ech,(p[1]-ZMIN)*ech);
    for(var q=2;q<p.length;q+=2) g.lineTo((p[q]-XMIN)*ech,(p[q+1]-ZMIN)*ech);
    g.closePath();
  }
  g.fill();
  MINI_FOND={c:c, ech:ech};
}
dessinerMini=function(){
  var c=$e('e3-mini'), g=c.getContext('2d'), S=220, ech=S/(MINIR*2), i;
  if(c.width!==S){ c.width=c.height=S; }
  if(!MINI_FOND) fondMini();
  g.clearRect(0,0,S,S);
  g.fillStyle=nuit?'rgba(8,14,26,0.86)':'rgba(16,22,32,0.80)';
  g.beginPath(); g.arc(S/2,S/2,S/2-1,0,7); g.fill();
  g.save(); g.beginPath(); g.arc(S/2,S/2,S/2-2,0,7); g.clip();
  function PX(x){ return S/2+(x-J.x)*ech; } function PZ(z){ return S/2+(z-J.z)*ech; }
  g.drawImage(MINI_FOND.c, S/2-(J.x-XMIN)*ech, S/2-(J.z-ZMIN)*ech);
  g.strokeStyle=couleurParcours(); g.lineWidth=2.6; g.beginPath();
  var dem=false;
  for(i=0;i<TRACE.length;i++){
    var tx=PX(TRACE[i][0]), tz=PZ(TRACE[i][1]);
    if(tx<-40||tx>S+40||tz<-40||tz>S+40){ dem=false; continue; }
    if(!dem){ g.moveTo(tx,tz); dem=true; } else g.lineTo(tx,tz);
  }
  g.stroke();
  JOBJ.forEach(function(o){
    var ox=PX(o.x), oz=PZ(o.z);
    if(ox<0||ox>S||oz<0||oz>S) return;
    g.fillStyle=o.j.niv==='r'?'#ff4b3e':'#ffab2e';
    g.beginPath(); g.arc(ox,oz,SELECTION===o?5.5:3.6,0,7); g.fill();
  });
  g.restore();
  g.save(); g.translate(S/2,S/2);
  var capAff = VUE==='jal'&&VUEJAL ? null : ((VUE==='fp')?CAM.yaw:J.cap);
  if(capAff!==null){
    g.rotate(capAff+PI/2);
    g.fillStyle='#ffffff';
    g.beginPath(); g.moveTo(0,-9); g.lineTo(6,7); g.lineTo(0,4); g.lineTo(-6,7); g.closePath(); g.fill();
  }
  g.restore();
  g.strokeStyle='rgba(255,255,255,0.3)'; g.lineWidth=2; g.beginPath(); g.arc(S/2,S/2,S/2-1,0,7); g.stroke();
  g.fillStyle='rgba(255,255,255,0.65)'; g.font='11px system-ui'; g.fillText('N',S/2-4,13);
};
var GM_FOND={cle:'', c:null};
function fondGM(cv){
  var e=GM.e, ox=GM.ox, oy=GM.oy, cle=cv.width+'x'+cv.height+'|'+e.toFixed(4)+'|'+ox.toFixed(1)+'|'+oy.toFixed(1);
  if(GM_FOND.cle===cle && GM_FOND.c) return GM_FOND.c;
  var c=GM_FOND.c||document.createElement('canvas');
  c.width=cv.width; c.height=cv.height;
  var g=c.getContext('2d'), i, q;
  function sx(x){ return x*e+ox; } function sy(z){ return z*e+oy; }
  g.fillStyle='#0f1520'; g.fillRect(0,0,c.width,c.height);
  var cz={w:'#1f4d6b',f:'#1c3524',g:'#213d28',p:'#23452a',k:'#2a303a',c:'#253528',a:'#37331f',i:'#2a2e35'};
  GEO.zones.forEach(function(zn){
    var col=cz[zn.k]; if(!col) return;
    g.fillStyle=col; g.beginPath();
    g.moveTo(sx(zn.p[0]),sy(zn.p[1]));
    for(q=2;q<zn.p.length;q+=2) g.lineTo(sx(zn.p[q]),sy(zn.p[q+1]));
    g.closePath(); g.fill();
  });
  g.lineCap='round'; g.lineJoin='round';
  GEO.voies.forEach(function(v){
    g.strokeStyle= v.k==='r' ? '#5a6780' : (v.k==='v' ? '#4d4843' : '#6d5c46');
    g.lineWidth=Math.max(1, v.w*e);
    g.beginPath(); g.moveTo(sx(v.p[0]),sy(v.p[1]));
    for(q=2;q<v.p.length;q+=2) g.lineTo(sx(v.p[q]),sy(v.p[q+1]));
    g.stroke();
  });
  g.fillStyle='#3d4a64'; g.beginPath();
  for(i=0;i<GEO.bats.length;i++){
    var p=GEO.bats[i].p;
    g.moveTo(sx(p[0]),sy(p[1]));
    for(q=2;q<p.length;q+=2) g.lineTo(sx(p[q]),sy(p[q+1]));
    g.closePath();
  }
  g.fill();
  GM_FOND.c=c; GM_FOND.cle=cle;
  return c;
}
dessinerGM=function(){
  var cv=$e('e3-gmc'), g=cv.getContext('2d'), e=GM.e, ox=GM.ox, oy=GM.oy, i;
  function sx(x){ return x*e+ox; } function sy(z){ return z*e+oy; }
  g.drawImage(fondGM(cv),0,0);
  g.lineCap='round'; g.lineJoin='round';
  g.strokeStyle=couleurParcours(); g.lineWidth=Math.max(2.2,2.2*e); g.beginPath();
  for(i=0;i<TRACE.length;i++){ if(i) g.lineTo(sx(TRACE[i][0]),sy(TRACE[i][1])); else g.moveTo(sx(TRACE[i][0]),sy(TRACE[i][1])); }
  g.stroke();
  var r=Math.max(4,1.1*e);
  g.font='bold '+Math.round(Math.max(9,r*1.3))+'px system-ui'; g.textAlign='center'; g.textBaseline='middle';
  JOBJ.forEach(function(o){
    g.fillStyle=o.j.niv==='r'?'#ff4b3e':'#ffab2e';
    g.beginPath(); g.arc(sx(o.x),sy(o.z),r,0,7); g.fill();
    if(r>=7){ g.fillStyle='#10151d'; g.fillText(String(o.n),sx(o.x),sy(o.z)+0.5); }
  });
  g.save(); g.translate(sx(J.x),sy(J.z)); g.rotate(J.cap+PI/2);
  var k=Math.max(1,Math.min(3,e/1.5));
  g.fillStyle='#ffffff'; g.strokeStyle='#0b1019'; g.lineWidth=2;
  g.beginPath(); g.moveTo(0,-11*k); g.lineTo(7*k,8*k); g.lineTo(0,4*k); g.lineTo(-7*k,8*k); g.closePath(); g.fill(); g.stroke();
  g.restore();
};

/* ---------------- boucle : mises à jour et allègement automatique ---------------- */
var _animM=animerDecor;
animerDecor=function(dt,cx,cz){
  _animM(dt,cx,cz);
  PERF.t-=dt;
  if(PERF.t<=0 && camera){
    PERF.t=0.25;
    var px=camera.position.x, pz=camera.position.z;
    majMorceaux(px,pz); majVoitures(px,pz); majJalonsVisibles(px,pz);
  }
  PERF.depuis+=dt;
  if(!PERF.auto || PERF.depuis<6) return;
  PERF.somme+=dt; PERF.n++;
  if(PERF.somme>=3){
    var moy=PERF.somme/PERF.n;
    PERF.somme=0; PERF.n=0;
    if(moy>0.042){
      if(PERF.dist>200){ PERF.dist=Math.max(200,Math.round(PERF.dist*0.75/20)*20); ARB.cx=1e9; VOIT.cx=1e9; PERF.t=0; appliquerCiel(); majInterfacePerf(); sauverPerf(); }
      else if(PERF.qualite>0){ PERF.qualite--; appliquerQualite(); }
      else { PERF.auto=false; return; }
      dire('Affichage allégé pour rester fluide : '+PERF.dist+' m, qualité '+QUAL().nom.toLowerCase()+'. Réglable en bas à gauche.');
    }
  }
};
/* =================================================================
   Finitions : menus réductibles, pieds posés sur la vraie surface
   (bitume, trottoir, bande du tracé) et course sans à-coups
   (le déplacement au sol contenu dans l'animation est neutralisé).
================================================================= */

/* ---------------- hauteur de la surface réellement dessinée ---------------- */
var IDX_SOL=null, PIEDS={y:null};
function hauteurSol(x,z,ecart){
  var y=hauteur(x,z);
  if(!IDX_SOL && Dvoies) IDX_SOL=indexerChaussees(Dvoies);
  if(ecart===undefined && TRACE.length) ecart=surLeParcours(x,z).ecart;
  var surTrace=(ecart!==undefined && ecart<0.6);
  var rp=IDX_SOL?routeProche(IDX_SOL,x,z,9):null;
  if(rp && rp.d<rp.w/2+0.05) return y+(surTrace?0.22:0.17);
  if(surTrace) return y+0.22;
  if(rp && rp.w>=5 && rp.d<rp.w/2+1.85) return y+0.29;
  return y+0.1;
}
var _majJoueurN=majJoueur;
majJoueur=function(dt){
  _majJoueurN(dt);
  if(!joueur) return;
  var c=hauteurSol(J.x,J.z,J.ecart);
  if(PIEDS.y===null || !dt || Math.abs(c-PIEDS.y)>2) PIEDS.y=c;
  else PIEDS.y+=(c-PIEDS.y)*Math.min(1,dt*14);
  joueur.position.y=PIEDS.y;
};
var _majJalN=majJalonneur;
majJalonneur=function(o,n){
  _majJalN(o,n);
  var y=hauteurSol(o.x,o.z);
  o.lod.position.y=y;
  o.proxy.position.y=y;
  if(o.etiq) o.etiq.position.y=y+2.1;
};

/* ---------------- animation : le bassin reste au-dessus des pieds ---------------- */
var _faireJoueurN=faireJoueur;
faireJoueur=function(){
  var g=_faireJoueurN();
  if(g.userData && g.userData.reel && PERSO.clips && !PERSO.clipsFixes){
    var os=null;
    PERSO.coureurFbx.traverse(function(o){ if(o.isBone && o.name==='Bip01') os=o; });
    if(os){
      var repos=os.position.toArray(), v=0, k;
      for(k=1;k<3;k++) if(Math.abs(repos[k])>Math.abs(repos[v])) v=k;
      ['idle','walk','run'].forEach(function(nom){
        PERSO.clips[nom].tracks.forEach(function(t){
          if(t.name!=='Bip01.position') return;
          for(var i=0;i<t.values.length;i+=3) for(var c=0;c<3;c++) if(c!==v) t.values[i+c]=repos[c];
        });
      });
      PERSO.clipsFixes=true; PERSO.axeVertical=v;
    }
  }
  return g;
};

/* ---------------- grande vitesse : pas de 0,8 m maximum pour ne pas traverser les murs ---------------- */
var _deplacerN=deplacer;
deplacer=function(dx,dz){
  var n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/0.8));
  for(var i=0;i<n;i++) _deplacerN(dx/n,dz/n);
};

/* ---------------- menus réductibles ---------------- */
var PLIS={};
try{ PLIS=JSON.parse(localStorage.getItem('corrida3d-plis')||'{}')||{}; }catch(e){ PLIS={}; }
function stylePlis(){
  if($e('e3-style-plis')) return;
  var s=document.createElement('style');
  s.id='e3-style-plis';
  s.textContent=[
    '.e3-plier{flex:none;margin-left:4px;width:22px;height:22px;border-radius:6px;border:1px solid #34425a;background:#1c2638;color:#cfd8e6;font:bold 14px/20px system-ui,sans-serif;cursor:pointer;padding:0}',
    '.e3-plier:hover{background:#26344c}',
    '.e3-allure.e3-reduit input[type=range],.e3-allure.e3-reduit #e3-qual{display:none}',
    '.e3-allure.e3-reduit{padding:4px 6px 4px 10px}',
    '.e3-allure.e3-reduit b{min-width:0}',
    '#e3-panneau.e3-reduit{bottom:auto}',
    '#e3-panneau.e3-reduit #e3-liste-j{display:none}',
    '#e3-panneau .e3-pt{position:relative;padding-right:36px}',
    '#e3-panneau .e3-pt .e3-plier{position:absolute;top:8px;right:8px}',
    '#e3-panneau.e3-reduit .e3-pt{font-size:0}',
    '#e3-panneau.e3-reduit .e3-pt b{font-size:13px}',
    '#e3-panneau.e3-reduit .e3-pt br,#e3-panneau.e3-reduit .e3-pt span:not(#e3-njal){display:none}'
  ].join('\n');
  document.head.appendChild(s);
}
function boutonPli(boite,cle,titre){
  var b=document.createElement('button');
  b.type='button'; b.className='e3-plier';
  function maj(){
    var r=!!PLIS[cle];
    boite.classList.toggle('e3-reduit',r);
    b.textContent=r?'+':'–';
    b.title=(r?'Déplier ':'Réduire ')+titre;
  }
  b.addEventListener('click',function(e){
    PLIS[cle]=!PLIS[cle];
    try{ localStorage.setItem('corrida3d-plis',JSON.stringify(PLIS)); }catch(er){}
    maj(); e.stopPropagation(); e.currentTarget.blur();
  });
  boite.appendChild(b);
  maj();
  return b;
}
function interfacePlis(){
  stylePlis();
  document.querySelectorAll('#e3 .e3-allure').forEach(function(bx){
    if(bx.querySelector('.e3-plier')) return;
    var dist=!!bx.querySelector('#e3-dist');
    boutonPli(bx,dist?'distance':'allure',dist?'le réglage de distance':'l’allure');
  });
  var p=$e('e3-panneau'), pt=p?p.querySelector('.e3-pt'):null;
  if(pt && !pt.querySelector('.e3-plier')) pt.appendChild(boutonPli(p,'jalonneurs','la liste des jalonneurs'));
}
var _brancherN=brancherInterface;
brancherInterface=function(){
  _brancherN();
  interfacePlis();
};
/* =================================================================
   Circulation : on roule à droite. Sens uniques d'OpenStreetMap
   respectés (chaussées séparées des 2x2 voies, ronds-points).
   Voitures créées autour de la caméra seulement, freinage devant le
   coureur et la voiture qui précède, phares la nuit.
   Mode : 0 aucune, 1 hors parcours (routes fermées pour la course), 2 partout.
================================================================= */
var CLASSES_CIRC={primary:1,primary_link:1,secondary:1,secondary_link:1,tertiary:1,tertiary_link:1,
  residential:1,unclassified:1,trunk:1,trunk_link:1};
var NB_CIRC=[14,28,50];
var TRAF={voies:null, traceRef:null, pret:false, voitures:[], ims:[], phares:null, arriere:null, mode:1, tc:0, candidats:[]};
try{
  var _tm=localStorage.getItem('corrida3d-circulation');
  if(_tm!==null && +_tm>=0 && +_tm<=2) TRAF.mode=+_tm;
}catch(e){}

function pointVoie(p,len,s){
  for(var k=1;k<len.length;k++){
    if(len[k]>=s){
      var f=(s-len[k-1])/((len[k]-len[k-1])||1);
      return [p[(k-1)*2]+(p[k*2]-p[(k-1)*2])*f, p[(k-1)*2+1]+(p[k*2+1]-p[(k-1)*2+1])*f];
    }
  }
  return [p[p.length-2],p[p.length-1]];
}
function preparerVoiesCirc(){
  TRAF.voies=[]; TRAF.traceRef=TRACE;
  for(var i=0;i<Dvoies.length;i++){
    var l=Dvoies[i].split('\t');
    if(l.length<6 || l[0]!=='r' || !CLASSES_CIRC[l[5]]){ TRAF.voies.push(null); continue; }
    var p=pointsDe(l[3]), n=p.length/2;
    if(n<2){ TRAF.voies.push(null); continue; }
    var len=[0], tot=0, k, x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
    for(k=0;k<n;k++){
      if(k){ tot+=Math.hypot(p[k*2]-p[k*2-2],p[k*2+1]-p[k*2-1]); len.push(tot); }
      if(p[k*2]<x0)x0=p[k*2]; if(p[k*2]>x1)x1=p[k*2]; if(p[k*2+1]<z0)z0=p[k*2+1]; if(p[k*2+1]>z1)z1=p[k*2+1];
    }
    var ech=0, proche=0, mil=0;
    for(var s=0;s<=tot;s+=8){
      var q=pointVoie(p,len,s); ech++;
      if(TRACE.length && surLeParcours(q[0],q[1]).ecart<6) proche++;
      if(dansZoneMilitaire(q[0],q[1])) mil++;
    }
    var cl=l[5], vmax=(cl.indexOf('primary')===0||cl.indexOf('trunk')===0)?19.5:((cl.indexOf('secondary')===0||cl.indexOf('tertiary')===0)?13.9:8.9);
    TRAF.voies.push({p:p, n:n, w:(+l[1])/10, ow:(+l[4]||0), len:len, tot:tot, vmax:vmax,
      parcours:ech>0 && proche/ech>0.3, ensoa:mil>0, cx:(x0+x1)/2, cz:(z0+z1)/2, r:Math.hypot(x1-x0,z1-z0)/2});
  }
  construireGrapheCirc();
}
/* sommets communs entre voies (à moins de 2,5 m), y compris la boucle d'un rond-point */
function construireGrapheCirc(){
  var V=TRAF.voies, grille={}, C=6;
  function cle(x,z){ return Math.floor(x/C)+','+Math.floor(z/C); }
  V.forEach(function(v,i){ if(!v) return; for(var k=0;k<v.n;k++){ var c=cle(v.p[k*2],v.p[k*2+1]); (grille[c]||(grille[c]=[])).push([i,k]); } });
  V.forEach(function(v,i){
    if(!v) return;
    v.jn=[];
    for(var k=0;k<v.n;k++){
      var x=v.p[k*2], z=v.p[k*2+1], gx=Math.floor(x/C), gz=Math.floor(z/C), res=[];
      for(var a=-1;a<=1;a++) for(var b=-1;b<=1;b++){
        var L=grille[(gx+a)+','+(gz+b)]; if(!L) continue;
        L.forEach(function(e){
          if(e[0]===i && Math.abs(e[1]-k)<=1) return;
          var w=V[e[0]];
          if(Math.hypot(w.p[e[1]*2]-x,w.p[e[1]*2+1]-z)<2.5) res.push(e);
        });
      }
      v.jn.push(res);
    }
  });
}
/* voie où l'on peut stationner sans gêner la circulation */
function voieCirculable(i){
  if(!TRAF.voies) preparerVoiesCirc();
  var v=TRAF.voies[i];
  return !!(v && !v.parcours);
}
function accessibleCirc(v){ return !!v && !v.ensoa && (TRAF.mode===2 || !v.parcours); }
/* pas de voitures dans les emprises militaires (ENSOA) */
function dansZoneMilitaire(x,z){
  for(var m=0;m<zonesM.length;m++) if(dansPoly(zonesM[m],x,z)) return true;
  return false;
}
function decalageVoie(v){
  var o=(v.ow!==0)?(v.w>=6?v.w/4:0):Math.max(0.9,v.w/4);
  if(v.w>=6 && (v.parcours || v.w>=9)) o=(v.ow!==0)?Math.max(0,Math.min(o,v.w/2-3.2)):Math.max(0.9,Math.min(o,v.w/2-3.2));
  return o;
}
function masquerStationnement(i){
  if(TRAF.mode!==2 || !TRAF.voies) return false;
  var v=TRAF.voies[i];
  return !!(v && v.parcours && v.w<9);
}

/* ---------------- conduite ---------------- */
function cibleVoiture(c){
  var v=TRAF.voies[c.v], a=c.k, b=c.k+c.dir;
  var ax=v.p[a*2], az=v.p[a*2+1], bx=v.p[b*2], bz=v.p[b*2+1], L=Math.hypot(bx-ax,bz-az)||1;
  var ux=(bx-ax)/L, uz=(bz-az)/L, off=decalageVoie(v), t=Math.min(c.t,L);
  /* à droite du sens de marche : vecteur (-uz, ux) */
  return {x:ax+ux*t-uz*off, z:az+uz*t+ux*off, ux:ux, uz:uz};
}
function choisirSuite(c,b){
  var v=TRAF.voies[c.v];
  var ux=v.p[b*2]-v.p[c.k*2], uz=v.p[b*2+1]-v.p[c.k*2+1], L=Math.hypot(ux,uz)||1; ux/=L; uz/=L;
  var opts=[], poids=[];
  function option(vi,kk,d){
    var w=TRAF.voies[vi];
    if(!accessibleCirc(w)) return;
    if(w.ow!==0 && w.ow!==d) return;
    var nk=kk+d; if(nk<0 || nk>=w.n) return;
    var dx=w.p[nk*2]-w.p[kk*2], dz=w.p[nk*2+1]-w.p[kk*2+1], dl=Math.hypot(dx,dz)||1, dot=(dx*ux+dz*uz)/dl;
    if(dot<-0.6) return;
    opts.push([vi,kk,d]); poids.push(0.25+Math.max(0,dot)*1.3);
  }
  option(c.v,b,c.dir);
  (v.jn[b]||[]).forEach(function(e){ option(e[0],e[1],1); option(e[0],e[1],-1); });
  if(!opts.length){
    if(v.ow===0){ c.k=b; c.dir=-c.dir; return true; }
    return false;
  }
  var tot=0, i; for(i=0;i<poids.length;i++) tot+=poids[i];
  var r=Math.random()*tot; i=0;
  while(i<opts.length-1 && r>poids[i]){ r-=poids[i]; i++; }
  c.v=opts[i][0]; c.k=opts[i][1]; c.dir=opts[i][2];
  c.vmax=TRAF.voies[c.v].vmax*(0.85+Math.random()*0.25);
  return true;
}
function avancerVoiture(c,dt){
  var ds=c.vit*dt;
  for(var g=0;g<10;g++){
    var v=TRAF.voies[c.v], a=c.k, b=c.k+c.dir, L=Math.abs(v.len[b]-v.len[a]);
    if(c.t+ds<L){ c.t+=ds; return true; }
    ds-=Math.max(0,L-c.t); c.t=0;
    if(!choisirSuite(c,b)) return false;
  }
  return true;
}
function majCandidats(cx,cz,R){
  TRAF.candidats=[];
  TRAF.voies.forEach(function(v,i){ if(accessibleCirc(v) && Math.hypot(v.cx-cx,v.cz-cz)<R+v.r) TRAF.candidats.push(i); });
}
function creerVoiture(cx,cz,R){
  var C=TRAF.candidats;
  if(!C.length || !TRAF.ims.length) return null;
  for(var essai=0;essai<20;essai++){
    var i=C[Math.floor(Math.random()*C.length)], v=TRAF.voies[i];
    var dir=v.ow!==0?v.ow:(Math.random()<0.5?1:-1), k=Math.floor(Math.random()*(v.n-1));
    if(dir<0) k++;
    if(k+dir<0 || k+dir>=v.n) continue;
    var x=v.p[k*2], z=v.p[k*2+1], d=Math.hypot(x-cx,z-cz);
    if(d>R || d<30) continue;
    var libre=true;
    for(var j=0;j<TRAF.voitures.length;j++) if(Math.hypot(TRAF.voitures[j].x-x,TRAF.voitures[j].z-z)<16){ libre=false; break; }
    if(!libre) continue;
    return {v:i, k:k, dir:dir, t:0, vit:v.vmax*0.6, vmax:v.vmax*(0.85+Math.random()*0.25),
            m:Math.floor(Math.random()*TRAF.ims.length), x:x, z:z, yaw:0, init:false, bloque:0};
  }
  return null;
}
function geoFeux(z,y,couleur){
  var t=new Tas(64), c=teinte(couleur), s=z>0?1:-1;
  [-0.58,0.58].forEach(function(x){
    t.tri(x-0.13,y-0.06,z, x+0.13,y-0.06,z, x+0.13,y+0.06,z, 0,0,s,[0,0,1,0,1,1],c);
    t.tri(x-0.13,y-0.06,z, x+0.13,y+0.06,z, x-0.13,y+0.06,z, 0,0,s,[0,0,1,1,0,1],c);
  });
  return t.geo();
}
function initCirculation(){
  if(!TRAF.voies || TRAF.traceRef!==TRACE) preparerVoiesCirc();
  TRAF.ims=VOIT.ims.map(function(im){
    var n=new THREE.InstancedMesh(im.geometry,im.material,60);
    n.count=0; n.frustumCulled=false; n.castShadow=true; n.receiveShadow=true;
    monde.add(n);
    return n;
  });
  var bb=VOIT.ims.length?(VOIT.ims[0].geometry.boundingBox||(VOIT.ims[0].geometry.computeBoundingBox(),VOIT.ims[0].geometry.boundingBox)):null;
  var zav=bb?bb.max.z+0.01:1.28, zar=bb?bb.min.z-0.01:-1.28, hy=bb?bb.min.y+(bb.max.y-bb.min.y)*0.38:0.45;
  var mb=new THREE.MeshBasicMaterial({vertexColors:true, side:THREE.DoubleSide});
  TRAF.phares=new THREE.InstancedMesh(geoFeux(zav,hy,0xfff1c2),mb,360);
  TRAF.arriere=new THREE.InstancedMesh(geoFeux(zar,hy,0xff2414),mb,360);
  [TRAF.phares,TRAF.arriere].forEach(function(m){ m.count=0; m.frustumCulled=false; monde.add(m); });
  TRAF.pret=true;
}
var _echV=new THREE.Vector3(1,1,1);
function majCirculation(dt){
  if(!TRAF.pret){ if(construit && VOIT.ims.length && Dvoies) initCirculation(); else return; }
  if(TRAF.traceRef!==TRACE){ preparerVoiesCirc(); TRAF.voitures=[]; }
  var cx=camera.position.x, cz=camera.position.z, R=Math.min(260,PERF.dist);
  var N=TRAF.mode===0?0:NB_CIRC[PERF.qualite];
  TRAF.tc-=dt;
  if(TRAF.tc<=0){ TRAF.tc=1.5; majCandidats(cx,cz,R); }
  TRAF.voitures=TRAF.voitures.filter(function(c){ return Math.hypot(c.x-cx,c.z-cz)<R+60 && accessibleCirc(TRAF.voies[c.v]); });
  while(TRAF.voitures.length>N) TRAF.voitures.pop();
  for(var e=0;e<3 && TRAF.voitures.length<N;e++){ var nc=creerVoiture(cx,cz,R); if(nc) TRAF.voitures.push(nc); }
  var obst=[];
  if(joueur) obst.push([J.x,J.z]);
  if(TRAF.mode===2) JOBJ.forEach(function(o){ obst.push([o.x,o.z]); });
  var V=TRAF.voitures;
  V.forEach(function(c){
    var p=cibleVoiture(c), lim=c.vmax;
    function gene(ox,oz,marge){
      var dx=ox-p.x, dz=oz-p.z, av=dx*p.ux+dz*p.uz, lat=Math.abs(-dx*p.uz+dz*p.ux);
      if(av>0.5 && av<24 && lat<marge) lim=Math.min(lim,Math.max(0,(av-6.5)*1.1));
    }
    for(var i=0;i<obst.length;i++) gene(obst[i][0],obst[i][1],2.1);
    for(i=0;i<V.length;i++) if(V[i]!==c) gene(V[i].x,V[i].z,1.3);
    c.bloque=lim<0.3?c.bloque+dt:0;
    c.vit+=Math.max(-9*dt,Math.min(2.8*dt,lim-c.vit));
    if(c.vit<0) c.vit=0;
    if(!avancerVoiture(c,dt) || c.bloque>9){ c.mort=true; return; }
    var q=cibleVoiture(c), yaw=Math.atan2(q.ux,q.uz);
    if(!c.init){ c.x=q.x; c.z=q.z; c.yaw=yaw; c.init=true; }
    else {
      var k=Math.min(1,dt*12);
      c.x+=(q.x-c.x)*k; c.z+=(q.z-c.z)*k;
      var dy=ecartAngle(yaw-c.yaw);
      c.yaw+=dy*Math.min(1,dt*6);
    }
  });
  TRAF.voitures=V.filter(function(c){ return !c.mort; });
  var cpt=TRAF.ims.map(function(){ return 0; }), nf=0, ombre=QUAL().ombre>0;
  TRAF.voitures.forEach(function(c){
    var im=TRAF.ims[c.m];
    if(!im || cpt[c.m]>=im.instanceMatrix.count) return;
    _q4.setFromAxisAngle(_ay,c.yaw);
    _p4.set(c.x,hauteur(c.x,c.z)+0.16,c.z);
    _m4.compose(_p4,_q4,_echV);
    im.setMatrixAt(cpt[c.m]++,_m4);
    if(nuit && nf<TRAF.phares.instanceMatrix.count){ TRAF.phares.setMatrixAt(nf,_m4); TRAF.arriere.setMatrixAt(nf,_m4); nf++; }
  });
  TRAF.ims.forEach(function(im,i){ im.count=cpt[i]; im.castShadow=ombre; im.instanceMatrix.needsUpdate=true; });
  TRAF.phares.count=nf; TRAF.arriere.count=nf;
  TRAF.phares.instanceMatrix.needsUpdate=true; TRAF.arriere.instanceMatrix.needsUpdate=true;
}

/* ---------------- bouton ---------------- */
var LIB_CIRC=['🚗 Aucune','🚗 Hors parcours','🚗 Partout'];
var AIDE_CIRC=['Pas de circulation.','Circulation sur les rues hors parcours : le parcours est fermé pour la course.','Circulation partout, parcours compris : les voitures s’arrêtent devant le coureur et les jalonneurs.'];
function interfaceCirculation(){
  var barre=document.querySelector('#e3 .e3-barre');
  if(!barre || $e('e3-circ')) return;
  var b=document.createElement('button');
  b.id='e3-circ'; b.type='button';
  barre.insertBefore(b,$e('e3-detail'));
  function maj(){ b.textContent=LIB_CIRC[TRAF.mode]; b.title='Circulation automobile : '+AIDE_CIRC[TRAF.mode]; b.classList.toggle('on',TRAF.mode>0); }
  b.addEventListener('click',function(){
    TRAF.mode=(TRAF.mode+1)%3;
    try{ localStorage.setItem('corrida3d-circulation',String(TRAF.mode)); }catch(e){}
    VOIT.cx=1e9; TRAF.tc=0;
    maj(); dire(AIDE_CIRC[TRAF.mode]); b.blur();
  });
  maj();
}
var _brancherO=brancherInterface;
brancherInterface=function(){ _brancherO(); interfaceCirculation(); };
var _animO=animerDecor;
animerDecor=function(dt,cx,cz){
  _animO(dt,cx,cz);
  if(camera) majCirculation(Math.min(dt,0.1));
};
/* =================================================================
   Ciel sans raccord visible : tout ce qui est dessiné près d'un bord
   est répété de l'autre côté (l'image se referme sur elle-même).
   Nuages en couches douces, halo du soleil raccordé.
================================================================= */
function dessinBoucle(W,fn){ fn(0); fn(-W); fn(W); }
faireCiel=function(nuit){
  var W=2048, H=1024, c=toile(W,H), g=c.getContext('2d'), i;
  var grd=g.createLinearGradient(0,0,0,H);
  if(nuit){
    grd.addColorStop(0,'#050c1d'); grd.addColorStop(0.34,'#0b1833');
    grd.addColorStop(0.47,'#182846'); grd.addColorStop(0.5,'#20304c');
    grd.addColorStop(0.55,'#121b2c'); grd.addColorStop(1,'#0a0f18');
  } else {
    grd.addColorStop(0,'#3a78c8'); grd.addColorStop(0.22,'#5d97d8');
    grd.addColorStop(0.40,'#93bde3'); grd.addColorStop(0.485,'#cfe0ee');
    grd.addColorStop(0.5,'#c9d8dc'); grd.addColorStop(0.62,'#8fa07a');
    grd.addColorStop(1,'#6b7a52');
  }
  g.fillStyle=grd; g.fillRect(0,0,W,H);
  if(nuit){
    for(i=0;i<3200;i++){
      var sx=Math.random()*W, sy=Math.random()*H*0.47, fort=Math.random()<0.04;
      g.fillStyle='rgba(255,255,255,'+(fort?0.95:0.25+Math.random()*0.5)+')';
      g.fillRect(sx,sy,fort?1.6:0.9,fort?1.6:0.9);
    }
    var mx=W*0.30, my=H*0.16;
    var lg=g.createRadialGradient(mx,my,4,mx,my,150);
    lg.addColorStop(0,'rgba(240,246,255,0.9)'); lg.addColorStop(0.12,'rgba(210,225,250,0.4)'); lg.addColorStop(1,'rgba(150,180,230,0)');
    g.fillStyle=lg; g.fillRect(mx-150,my-150,300,300);
    g.fillStyle='#eef3ff'; g.beginPath(); g.arc(mx,my,20,0,7); g.fill();
    g.fillStyle='rgba(180,190,210,0.35)';
    g.beginPath(); g.arc(mx-6,my-4,5,0,7); g.fill(); g.beginPath(); g.arc(mx+7,my+5,3.5,0,7); g.fill();
    return c;
  }
  /* soleil : halo modéré, raccordé des deux côtés */
  var ux=W*0.62, uy=H*0.22;
  dessinBoucle(W,function(o){
    var sg=g.createRadialGradient(ux+o,uy,8,ux+o,uy,300);
    sg.addColorStop(0,'rgba(255,252,238,1)'); sg.addColorStop(0.07,'rgba(255,246,214,0.75)');
    sg.addColorStop(0.3,'rgba(255,240,210,0.18)'); sg.addColorStop(1,'rgba(255,240,210,0)');
    g.fillStyle=sg; g.fillRect(ux+o-300,uy-300,600,600);
  });
  g.fillStyle='#fffdf4'; g.beginPath(); g.arc(ux,uy,22,0,7); g.fill();
  /* nuages : bancs aplatis, plus fins en hauteur, plus nombreux vers l'horizon */
  for(i=0;i<46;i++){
    var cy=H*(0.08+Math.pow(Math.random(),0.7)*0.36), prox=(cy/H-0.08)/0.36;
    var cx=Math.random()*W, larg=(160+Math.random()*380)*(0.5+prox*0.9), haut=(14+Math.random()*26)*(0.6+prox*0.6);
    var op=0.16+Math.random()*0.30, nb=10+Math.floor(Math.random()*14);
    var bouffees=[];
    for(var k=0;k<nb;k++) bouffees.push([(Math.random()-0.5)*larg,(Math.random()-0.5)*haut,(22+Math.random()*48)*(0.55+prox*0.6)]);
    dessinBoucle(W,function(o){
      if(cx+o+larg<0 || cx+o-larg>W) return;
      bouffees.forEach(function(b){
        var bx=cx+o+b[0], by=cy+b[1], br=b[2];
        var cg=g.createRadialGradient(bx,by-br*0.15,2,bx,by,br);
        cg.addColorStop(0,'rgba(255,255,255,'+op+')');
        cg.addColorStop(0.5,'rgba(246,249,252,'+(op*0.55)+')');
        cg.addColorStop(1,'rgba(232,240,248,0)');
        g.save(); g.translate(bx,by); g.scale(1,0.55); g.translate(-bx,-by);
        g.fillStyle=cg; g.fillRect(bx-br,by-br,br*2,br*2);
        g.restore();
      });
    });
  }
  var hz=g.createLinearGradient(0,H*0.40,0,H*0.52);
  hz.addColorStop(0,'rgba(222,235,246,0)'); hz.addColorStop(0.8,'rgba(222,235,246,0.75)'); hz.addColorStop(1,'rgba(212,226,238,0.85)');
  g.fillStyle=hz; g.fillRect(0,H*0.40,W,H*0.12);
  return c;
};
/* =================================================================
   Voitures : KayKit City Builder Bits (CC0, Kay Lousberg) et
   Free Low Poly Vehicles Pack (CC0, RGS Dev). Proportions de vraies
   voitures européennes, carrosseries repeintes en teintes courantes.
   Chaque modèle est ramené à 4,15 m de long, avant vers +z.
================================================================= */
var MODELES_VOITURES=[
  {k:'k2', nom:'car_hatchback'}, {k:'k2', nom:'car_sedan'}, {k:'k2', nom:'car_stationwagon'},
  {k:'r2', nom:'Hatchback', teintes:[0xe9e9e6,0x9c1d1d,0xa3a8ae]},
  {k:'r2', nom:'Sedan',     teintes:[0xa3a8ae,0x3a3f46,0x2a4775]},
  {k:'r2', nom:'SUV',       teintes:[0xe9e9e6,0x1c2330]},
  {k:'r2', nom:'Van',       teintes:[0xe9e9e6]},
  {k:'r2', nom:'Pickup',    teintes:[0x4a4f55]}
];
var COUL_DETAIL={'tires':0x1b1b1b, 'wheels':0xb9bdc3, 'windows':0x1b2231, 'rear lights':0x7a0d0d,
  'headlights':0xdcdce6, 'body black':0x161719, 'body white':0xe6e6e6};

function normaliserVoiture(geo){
  geo.computeBoundingBox();
  var b=geo.boundingBox, L=b.max.z-b.min.z, s=4.15/(L||1);
  geo.translate(-(b.min.x+b.max.x)/2,-b.min.y,-(b.min.z+b.max.z)/2);
  geo.scale(s,s,s);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}
function parseGLB(buf){
  return new Promise(function(ok,ko){
    var L=new EXT.GLTFLoader(), cib=window.createImageBitmap;
    try{ window.createImageBitmap=undefined; L.parse(buf,'',ok,ko); }
    finally{ window.createImageBitmap=cib; }
  });
}
/* .gltf + .bin séparés → conteneur GLB en mémoire (aucun chargement réseau) */
function gltfVersGlb(txt,bin){
  var js=JSON.parse(txt);
  js.buffers=[{byteLength:bin.byteLength}];
  (js.images||[]).forEach(function(im){
    if(im.uri && !/^data:/.test(im.uri)){ var u=actifURL('k2_'+im.uri); if(u) im.uri=u; }
  });
  var jb=new TextEncoder().encode(JSON.stringify(js)), jpad=(4-jb.length%4)%4, bpad=(4-bin.byteLength%4)%4;
  var total=12+8+jb.length+jpad+8+bin.byteLength+bpad, out=new ArrayBuffer(total), dv=new DataView(out), u8=new Uint8Array(out), o, i;
  dv.setUint32(0,0x46546C67,true); dv.setUint32(4,2,true); dv.setUint32(8,total,true);
  o=12;
  dv.setUint32(o,jb.length+jpad,true); dv.setUint32(o+4,0x4E4F534A,true); o+=8;
  u8.set(jb,o); for(i=0;i<jpad;i++) u8[o+jb.length+i]=0x20; o+=jb.length+jpad;
  dv.setUint32(o,bin.byteLength+bpad,true); dv.setUint32(o+4,0x004E4942,true); o+=8;
  u8.set(new Uint8Array(bin),o);
  return out;
}
function chargerKayKit(nom){
  return Promise.all([actifOctets('k2_'+nom+'.gltf'),actifOctets('k2_'+nom+'.bin')]).then(function(r){
    return parseGLB(gltfVersGlb(new TextDecoder().decode(r[0]),r[1]));
  }).then(function(g){
    var m=fusionnerModele(g.scene);
    m.mat.roughness=0.5; m.mat.metalness=0.15;
    normaliserVoiture(m.geo);
    return [m];
  });
}
function chargerRgs(nom,teintes){
  return actifOctets('r2_'+nom+'.fbx').then(function(buf){
    var f=new EXT.FBXLoader().parse(buf,'');
    f.updateMatrixWorld(true);
    var parts=[];
    f.traverse(function(o){
      if(!o.isMesh) return;
      var g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      var mats=Array.isArray(o.material)?o.material:[o.material];
      var grs=g.groups.length?g.groups:[{start:0,count:g.attributes.position.count,materialIndex:0}];
      parts.push({g:g, mats:mats, grs:grs});
    });
    if(!MAT.voitureRgs) MAT.voitureRgs=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.42, metalness:0.25});
    return teintes.map(function(t){
      var P=[], N=[], C=[], col=new THREE.Color();
      parts.forEach(function(pt){
        var pos=pt.g.attributes.position, nor=pt.g.attributes.normal;
        pt.grs.forEach(function(gr){
          var m=pt.mats[gr.materialIndex]||pt.mats[0], nm=(m.name||'').toLowerCase(), hex=COUL_DETAIL[nm];
          if(hex===undefined) hex=(nm.indexOf('body')===0)?t:m.color.getHex();
          col.setHex(hex);
          for(var i=gr.start;i<gr.start+gr.count;i++){
            P.push(pos.getX(i),pos.getY(i),pos.getZ(i));
            if(nor) N.push(nor.getX(i),nor.getY(i),nor.getZ(i));
            C.push(col.r,col.g,col.b);
          }
        });
      });
      var geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
      if(N.length) geo.setAttribute('normal',new THREE.Float32BufferAttribute(N,3)); else geo.computeVertexNormals();
      geo.setAttribute('color',new THREE.Float32BufferAttribute(C,3));
      normaliserVoiture(geo);
      return {geo:geo, mat:MAT.voitureRgs};
    });
  });
}
function chargerModelesVoitures(){
  return Promise.all(MODELES_VOITURES.map(function(d){
    return (d.k==='k2'?chargerKayKit(d.nom):chargerRgs(d.nom,d.teintes)).catch(function(e){ console.error('Voiture '+d.nom,e); return []; });
  })).then(function(l){
    var out=[];
    l.forEach(function(a){ a.forEach(function(m){ out.push(m); }); });
    return out;
  });
}
/* =================================================================
   Vie en ville : piétons qui marchent sur les trottoirs et jalonneurs
   proches animés (respiration, appuis, geste du bras tendu, regard).
   Seuls les personnages proches sont animés : les jalonneurs éloignés
   restent figés, les piétons n'existent qu'autour de la caméra.
================================================================= */
var PIETONS_AV=['Male_Adult_01','Male_Adult_08','Female_Adult_05','Female_Adult_07',
  'Male_Adult_06','Male_Adult_09','Female_Adult_08','Female_Adult_01'];
var NB_PIETONS=[6,14,24], NB_JAL_ANIMES=[2,5,8];
var VIE={pret:false, modeles:{}, clips:{}, pietons:[], rigsP:[], chemins:null, jal:[], tj:0};
var _hautV=new THREE.Vector3(0,1,0);

/* ---------------- chargement ---------------- */
function fixerRacineClip(clip,gab){
  if(!clip || !gab) return;
  var os=null;
  gab.f.traverse(function(o){ if(o.isBone && o.name==='Bip01') os=o; });
  if(!os) return;
  var r=os.position.toArray(), v=0, k;
  for(k=1;k<3;k++) if(Math.abs(r[k])>Math.abs(r[v])) v=k;
  clip.tracks.forEach(function(t){
    if(t.name!=='Bip01.position') return;
    for(var i=0;i<t.values.length;i+=3) for(var c=0;c<3;c++) if(c!==v) t.values[i+c]=r[c];
  });
}
function preparerVie(){
  if(!EXT.FBXLoader || !EXT.clone || !window.ACTIFS || !PERSO.pret) return;
  var p=Promise.all(['m_walk_neutral_01','f_walk_neutral_01','m_idle_neutral_01','f_idle_neutral_01'].map(function(n){
    return ACTIFS[n+'.fbx']?chargerClip(n).catch(function(){ return null; }):Promise.resolve(null);
  })).then(function(c){ VIE.clips={mw:c[0], fw:c[1]||c[0], mi:c[2], fi:c[3]||c[2]}; });
  PIETONS_AV.forEach(function(nom){
    p=p.then(function(){
      if(PERSO.gabarits && PERSO.gabarits[nom]){
        var gb=PERSO.gabarits[nom];
        VIE.modeles[nom]={g:gb.g, f:gb.f, rest:gb.rest, femme:nom.indexOf('Female')===0};
        return;
      }
      if(!ACTIFS[nom+'.fbx']) return;
      return chargerAvatar(nom).then(function(f){
        var g=normaliserAvatar(f,nom.indexOf('Female')===0?1.68:1.78);
        VIE.modeles[nom]={g:g, f:f, rest:reposOs(g), femme:nom.indexOf('Female')===0};
      });
    }).catch(function(e){ console.error('Piéton '+nom,e); });
  });
  return p.then(function(){
    var homme=null, femme=null;
    Object.keys(VIE.modeles).forEach(function(n){ var m=VIE.modeles[n]; if(m.femme){ if(!femme) femme=m; } else if(!homme) homme=m; });
    fixerRacineClip(VIE.clips.mw,homme);
    if(VIE.clips.fw!==VIE.clips.mw) fixerRacineClip(VIE.clips.fw,femme);
    VIE.pret=!!(VIE.clips.mw && Object.keys(VIE.modeles).length);
  });
}
ETAPES.forEach(function(e,i){ if(e[1]===preparerPersonnages) ETAPES.splice(i+1,0,['Piétons et gestes des jalonneurs',preparerVie]); });

function creerRig(nom){
  var m=VIE.modeles[nom];
  if(!m) return null;
  delete m.g.userData.os;
  restaurerOs(m.rest);
  m.g.updateMatrixWorld(true);
  var g=EXT.clone(m.g), meshes=[];
  g.traverse(function(o){ if(o.isMesh){ o.castShadow=true; o.frustumCulled=false; meshes.push(o); } });
  g.visible=false;
  monde.add(g);
  return {g:g, f:g.children[0], mix:new THREE.AnimationMixer(g.children[0]), nom:nom, femme:m.femme, meshes:meshes, libre:true};
}

/* chasuble déformée avec le squelette (buste du corps gonflé de 1,4 cm) */
function chasubleAnimee(rig,niv){
  var body=null;
  rig.g.traverse(function(o){ if(o.isSkinnedMesh && (!body || o.geometry.attributes.position.count>body.geometry.attributes.position.count)) body=o; });
  if(!body) return null;
  var G=body.geometry, P=G.attributes.position, N=G.attributes.normal, SI=G.attributes.skinIndex, SW=G.attributes.skinWeight;
  var mats=Array.isArray(body.material)?body.material:[body.material], plages=[], i, k;
  G.groups.forEach(function(gr){ var m=mats[gr.materialIndex]; if(m && /body/i.test(m.name)) plages.push([gr.start,gr.start+gr.count]); });
  if(!plages.length) plages.push([0,G.index?G.index.count:P.count]);
  G.computeBoundingBox();
  var sz=G.boundingBox.getSize(new THREE.Vector3()), ax=(sz.y>=sz.z)?(sz.y>=sz.x?1:0):(sz.z>=sz.x?2:0);
  var torse=new Uint8Array(P.count), y0=1e9, y1=-1e9;
  for(i=0;i<P.count;i++){
    var best=0, bi=-1;
    for(k=0;k<4;k++){ var w=SW.getComponent(i,k); if(w>best){ best=w; bi=SI.getComponent(i,k); } }
    if(bi>=0 && TORSE[body.skeleton.bones[bi].name]){ torse[i]=1; var v=P.getComponent(i,ax); if(v<y0)y0=v; if(v>y1)y1=v; }
  }
  var hanche=y0+(y1-y0)*0.30, epaule=y1-(y1-y0)*0.04, off=sz.getComponent(ax)*0.014/1.75;
  var idx=G.index?G.index.array:null, pos=[], nor=[], uv=[], si=[], sw=[];
  plages.forEach(function(pl){
    for(i=pl[0];i<pl[1];i+=3){
      var a=idx?idx[i]:i, b=idx?idx[i+1]:i+1, c=idx?idx[i+2]:i+2;
      if(!(torse[a]&&torse[b]&&torse[c])) continue;
      var ya=P.getComponent(a,ax), yb=P.getComponent(b,ax), yc=P.getComponent(c,ax);
      if(Math.min(ya,yb,yc)<hanche || Math.max(ya,yb,yc)>epaule) continue;
      [a,b,c].forEach(function(q){
        pos.push(P.getX(q)+N.getX(q)*off, P.getY(q)+N.getY(q)*off, P.getZ(q)+N.getZ(q)*off);
        nor.push(N.getX(q),N.getY(q),N.getZ(q));
        uv.push(0.5,(P.getComponent(q,ax)-hanche)/(epaule-hanche));
        si.push(SI.getX(q),SI.getY(q),SI.getZ(q),SI.getW(q));
        sw.push(SW.getX(q),SW.getY(q),SW.getZ(q),SW.getW(q));
      });
    }
  });
  if(!pos.length) return null;
  var geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));
  geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));
  var sm=new THREE.SkinnedMesh(geo,matChasuble(niv));
  sm.castShadow=true; sm.frustumCulled=false;
  sm.position.copy(body.position); sm.quaternion.copy(body.quaternion); sm.scale.copy(body.scale);
  body.parent.add(sm);
  sm.bind(body.skeleton,body.bindMatrix);
  rig.meshes.push(sm);
  return sm;
}

/* ---------------- jalonneurs animés ---------------- */
function libererJal(s){
  if(s.o){ s.o.anime=false; if(s.o.lod) s.o.lod.visible=true; }
  s.o=null; s.rig.g.visible=false;
}
function majJalonsAnimes(dt){
  if(!VIE.pret || !camera) return;
  var cap=NB_JAL_ANIMES[PERF.qualite], cx=camera.position.x, cz=camera.position.z;
  VIE.tj-=dt;
  if(VIE.tj<=0){
    VIE.tj=0.5;
    var cands=[];
    JOBJ.forEach(function(o){
      var d=Math.hypot(o.x-cx,o.z-cz);
      if(d<38 && !(VUE==='jal' && VUEJAL===o)) cands.push([d,o]);
    });
    cands.sort(function(a,b){ return a[0]-b[0]; });
    cands=cands.slice(0,cap);
    var voulus=new Set(cands.map(function(c){ return c[1]; }));
    VIE.jal.forEach(function(s){ if(s.o && (!voulus.has(s.o) || JOBJ.get(s.o.j)!==s.o)) libererJal(s); });
    cands.forEach(function(c){
      var o=c[1];
      if(VIE.jal.some(function(s){ return s.o===o; })) return;
      var nom=VARIANTES[((o.j._vis||0)%4+4)%4];
      var s=VIE.jal.filter(function(x){ return !x.o && x.rig.nom===nom; })[0];
      if(!s){
        if(VIE.jal.length>=NB_JAL_ANIMES[2]+2) return;
        var rig=creerRig(nom); if(!rig) return;
        var clip=rig.femme?VIE.clips.fi:VIE.clips.mi;
        if(clip){ var a=rig.mix.clipAction(clip); a.play(); a.time=Math.random()*clip.duration; }
        s={rig:rig, chas:null, niv:null, phase:Math.random()*6};
        VIE.jal.push(s);
      }
      s.o=o; o.anime=true; o.lod.visible=false; s.rig.g.visible=true;
    });
  }
  var ombre=QUAL().ombre>0;
  VIE.jal.forEach(function(s){
    if(!s.o) return;
    var o=s.o, g=s.rig.g;
    if(s.niv!==o.j.niv){
      if(s.chas) s.chas.material=matChasuble(o.j.niv); else s.chas=chasubleAnimee(s.rig,o.j.niv);
      s.niv=o.j.niv;
    }
    g.position.set(o.x,hauteurSol(o.x,o.z),o.z);
    g.rotation.y=-capDeAz(o.az);
    s.rig.mix.update(dt);
    s.phase+=dt;
    /* toutes les 6,5 s environ : le bras balaie la direction à prendre, la tête accompagne */
    var cyc=s.phase%6.5, av=0, ha=0, tete=0;
    if(cyc<1.9){
      var u=cyc/1.9, env=Math.sin(u*PI);
      av=env*0.62*(0.55+0.45*Math.sin(u*PI*4));
      ha=env*0.10; tete=env*0.6;
    }
    av+=Math.sin(s.phase*1.3)*0.025;
    ha+=Math.sin(s.phase*2.1)*0.015;
    g.updateMatrixWorld(true);
    if(o.bras==='d' || o.bras==='g'){
      poserBrasJalon(g,o.bras,{avance:av, hausse:ha, brasLibre:true});
      var B=g.userData.os, h=B && B.Bip01_Head;
      if(h && tete>0){ tournerOsMonde(h,_hautV,(o.bras==='d'?-1:1)*tete*0.6); }
    } else if(o.bras==='x') poserBrasJalon(g,'x');
    s.rig.meshes.forEach(function(m){ m.castShadow=ombre; });
  });
}
var _jalVisR=majJalonsVisibles;
majJalonsVisibles=function(cx,cz){
  _jalVisR(cx,cz);
  JOBJ.forEach(function(o){ if(o.anime) o.lod.visible=false; });
};

/* ---------------- piétons ---------------- */
function construireChemins(){
  var I=indexerChaussees(Dvoies), C=[];
  for(var i=0;i<Dvoies.length;i++){
    var l=Dvoies[i].split('\t');
    if(l.length<4 || l[0]!=='r') continue;
    var w=(+l[1])/10;
    if(w<5) continue;
    var p=pointsDe(l[3]);
    if(!pres(p,260)) continue;
    [1,-1].forEach(function(cote){
      var q=densifier(decaler(p,cote*(w/2+0.9)),2), run=[], k;
      function vider(){ if(run.length>=20) C.push(finirChemin(run)); run=[]; }
      for(k=0;k<q.x.length;k++){
        var x=q.x[k], z=q.z[k];
        if(dansChaussee(I,x,z,i,0.9) || dansZoneMilitaire(x,z) || bloquer(x,z)) vider();
        else run.push(x,z);
      }
      vider();
    });
  }
  VIE.chemins=C;
}
function finirChemin(run){
  var len=[0], tot=0, x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
  for(var k=0;k<run.length;k+=2){
    if(k) { tot+=Math.hypot(run[k]-run[k-2],run[k+1]-run[k-1]); len.push(tot); }
    if(run[k]<x0)x0=run[k]; if(run[k]>x1)x1=run[k]; if(run[k+1]<z0)z0=run[k+1]; if(run[k+1]>z1)z1=run[k+1];
  }
  return {p:run, len:len, tot:tot, cx:(x0+x1)/2, cz:(z0+z1)/2, r:Math.hypot(x1-x0,z1-z0)/2};
}
function pointChemin(c,s){
  s=Math.max(0,Math.min(c.tot,s));
  var L=c.len, k=1;
  while(k<L.length-1 && L[k]<s) k++;
  var f=(s-L[k-1])/((L[k]-L[k-1])||1);
  var ax=c.p[(k-1)*2], az=c.p[(k-1)*2+1], bx=c.p[k*2], bz=c.p[k*2+1], dx=bx-ax, dz=bz-az, dl=Math.hypot(dx,dz)||1;
  return [ax+dx*f, az+dz*f, dx/dl, dz/dl];
}
function prendreRigPieton(nom){
  var r=VIE.rigsP.filter(function(x){ return x.libre && x.nom===nom; })[0];
  if(r) return r;
  if(VIE.rigsP.length>=NB_PIETONS[2]+4) return VIE.rigsP.filter(function(x){ return x.libre; })[0]||null;
  r=creerRig(nom);
  if(r) VIE.rigsP.push(r);
  return r;
}
function creerPieton(cx,cz,R){
  var C=VIE.chemins;
  if(!C || !C.length) return;
  var noms=Object.keys(VIE.modeles);
  /* 7 fois sur 10 à portée de vue (15 à 70 m), sinon plus loin */
  var Rm=Math.random()<0.7?Math.min(R,70):R;
  if(!VIE.proches || VIE.procheT!==Math.round(cx/20)+','+Math.round(cz/20)){
    VIE.procheT=Math.round(cx/20)+','+Math.round(cz/20);
    VIE.proches=C.filter(function(ch){ return Math.hypot(ch.cx-cx,ch.cz-cz)<R+ch.r; });
  }
  var P=VIE.proches.length?VIE.proches:C;
  for(var essai=0;essai<12;essai++){
    var c=P[Math.floor(Math.random()*P.length)];
    if(Math.hypot(c.cx-cx,c.cz-cz)>Rm+c.r) continue;
    var s=Math.random()*c.tot, pt=pointChemin(c,s), d=Math.hypot(pt[0]-cx,pt[1]-cz);
    if(d>Rm || d<15) continue;
    if(VIE.pietons.some(function(p){ return Math.hypot(p.x-pt[0],p.z-pt[1])<3; })) continue;
    var rig=prendreRigPieton(noms[Math.floor(Math.random()*noms.length)]);
    if(!rig) return;
    var cw=rig.femme?VIE.clips.fw:VIE.clips.mw, ci=rig.femme?VIE.clips.fi:VIE.clips.mi;
    rig.mix.stopAllAction();
    var aw=rig.mix.clipAction(cw); aw.reset().play(); aw.time=Math.random()*cw.duration;
    var ai=ci?rig.mix.clipAction(ci):null;
    if(ai){ ai.reset().play(); ai.setEffectiveWeight(0); }
    var dir=Math.random()<0.5?1:-1;
    VIE.pietons.push({rig:rig, chemin:c, s:s, dir:dir, vmax:1.1+Math.random()*0.45, vit:1.2,
      lat:(Math.random()-0.5)*0.9, x:pt[0], z:pt[1], cap:Math.atan2(pt[3]*dir,pt[2]*dir), aw:aw, ai:ai});
    rig.libre=false; rig.g.visible=true;
    return;
  }
}
function majPietons(dt){
  if(!VIE.pret || !camera) return;
  if(!VIE.chemins) construireChemins();
  var N=NB_PIETONS[PERF.qualite], cx=camera.position.x, cz=camera.position.z, R=Math.min(150,PERF.dist);
  VIE.pietons=VIE.pietons.filter(function(p){
    var garder=Math.hypot(p.x-cx,p.z-cz)<R+40;
    if(!garder){ p.rig.g.visible=false; p.rig.libre=true; }
    return garder;
  });
  while(VIE.pietons.length>N){ var pp=VIE.pietons.pop(); pp.rig.g.visible=false; pp.rig.libre=true; }
  for(var nv=0;nv<3 && VIE.pietons.length<N;nv++) creerPieton(cx,cz,R);
  var ombre=QUAL().ombre>0;
  VIE.pietons.forEach(function(p){
    var c=p.chemin, pt=pointChemin(c,p.s);
    var dx=J.x-p.x, dz=J.z-p.z, devant=(dx*pt[2]+dz*pt[3])*p.dir;
    var cible=(Math.hypot(dx,dz)<2.2 && devant>0)?0:p.vmax;
    p.vit+=(cible-p.vit)*Math.min(1,dt*4);
    p.s+=p.dir*p.vit*dt;
    if(p.s<=0){ p.s=0; p.dir=1; } else if(p.s>=c.tot){ p.s=c.tot; p.dir=-1; }
    pt=pointChemin(c,p.s);
    p.x=pt[0]-pt[3]*p.lat; p.z=pt[1]+pt[2]*p.lat;
    var cap=Math.atan2(pt[3]*p.dir,pt[2]*p.dir), dy=ecartAngle(cap-p.cap);
    p.cap+=dy*Math.min(1,dt*6);
    var g=p.rig.g;
    g.position.set(p.x,hauteur(p.x,p.z)+0.28,p.z);
    g.rotation.y=-p.cap;
    var marche=Math.min(1,p.vit/0.4);
    p.aw.setEffectiveWeight(marche);
    if(p.ai) p.ai.setEffectiveWeight(1-marche);
    p.aw.timeScale=Math.max(0.3,p.vit/1.35);
    p.rig.mix.update(dt);
    p.rig.meshes.forEach(function(m){ m.castShadow=ombre; });
  });
}

var _animR=animerDecor;
animerDecor=function(dt,cx,cz){
  _animR(dt,cx,cz);
  var d=Math.min(dt,0.1);
  majJalonsAnimes(d);
  majPietons(d);
};
/* =================================================================
   Lampes frontales (mode nuit) : coureur et jalonneurs.
   Pour chacun : point lumineux sur le front, halo, faisceau léger et
   tache de lumière posée sur le sol devant soi, dans l'axe du regard.
   Trois vraies lumières seulement (coureur + 2 jalonneurs les plus
   proches) : elles éclairent aussi les objets et les personnages.
================================================================= */
var FRONT={pret:false, spots:[], parJalon:new Map(), coureur:null, tete:null, t:0, vue:null};
var _pT=new THREE.Vector3(), _dirF=new THREE.Vector3(), _basF=new THREE.Vector3(0,-1,0);

function texFrontale(sol){
  var c=toile(256,256), g=c.getContext('2d');
  g.clearRect(0,0,256,256);
  var cy=sol?150:128, rg=g.createRadialGradient(128,cy,4,128,cy,sol?122:126);
  if(sol){
    rg.addColorStop(0,'rgba(255,255,255,1)'); rg.addColorStop(0.35,'rgba(255,250,236,0.75)');
    rg.addColorStop(0.7,'rgba(255,238,210,0.22)'); rg.addColorStop(1,'rgba(255,230,200,0)');
  } else {
    rg.addColorStop(0,'rgba(255,255,255,1)'); rg.addColorStop(0.12,'rgba(255,250,235,0.85)');
    rg.addColorStop(0.35,'rgba(255,240,210,0.25)'); rg.addColorStop(1,'rgba(255,230,200,0)');
  }
  g.fillStyle=rg; g.fillRect(0,0,256,256);
  var t=new THREE.CanvasTexture(c);
  if(t.colorSpace!==undefined) t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
function initFrontales(){
  if(FRONT.pret || !scene) return;
  FRONT.matSol=new THREE.MeshBasicMaterial({map:texFrontale(true), color:0xffdcaa, transparent:true, opacity:0.34,
    blending:THREE.AdditiveBlending, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-10, polygonOffsetUnits:-10});
  FRONT.matHalo=new THREE.SpriteMaterial({map:texFrontale(false), color:0xfff4dc, transparent:true,
    blending:THREE.AdditiveBlending, depthWrite:false});
  FRONT.matFaisceau=new THREE.MeshBasicMaterial({color:0xfff0d2, transparent:true, opacity:0.028,
    blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide});
  FRONT.geoFaisceau=new THREE.CylinderGeometry(0.02,1,1,18,1,true);
  FRONT.geoFaisceau.translate(0,-0.5,0);
  FRONT.geoLampe=new THREE.SphereGeometry(0.028,10,8);
  FRONT.matLampe=new THREE.MeshBasicMaterial({color:0xffffff});
  for(var i=0;i<3;i++){
    var sp=new THREE.SpotLight(0xfff1d8,0,18,0.45,0.75,2);
    sp.castShadow=false; sp.visible=false;
    scene.add(sp); scene.add(sp.target);
    FRONT.spots.push(sp);
  }
  FRONT.pret=true;
}
function creerFrontale(){
  var geo=new THREE.PlaneGeometry(1,1,4,4);
  var f={sol:new THREE.Mesh(geo,FRONT.matSol), halo:new THREE.Sprite(FRONT.matHalo),
         faisceau:new THREE.Mesh(FRONT.geoFaisceau,FRONT.matFaisceau), lampe:new THREE.Mesh(FRONT.geoLampe,FRONT.matLampe), cle:''};
  f.sol.renderOrder=8; f.sol.frustumCulled=false;
  f.halo.scale.set(0.09,0.09,0.09); f.halo.renderOrder=9;
  f.faisceau.renderOrder=9;
  [f.sol,f.halo,f.faisceau,f.lampe].forEach(function(o){ o.visible=false; monde.add(o); });
  return f;
}
function supprimerFrontale(f){
  [f.sol,f.halo,f.faisceau,f.lampe].forEach(function(o){ monde.remove(o); });
  f.sol.geometry.dispose();
}
/* lampe en (lx,ly,lz), regard horizontal (fx,fz) */
function placerFrontale(f,lx,ly,lz,fx,fz,majSol,tete){
  f.lampe.position.set(lx,ly,lz);
  f.halo.position.set(lx+fx*0.03,ly,lz+fz*0.03);
  var cx=lx+fx*3.4, cz=lz+fz*3.4, off=hauteurSol(cx,cz)-hauteur(cx,cz), cy=hauteur(cx,cz)+off+0.05;
  _dirF.set(cx-lx,cy-ly,cz-lz);
  var len=_dirF.length();
  f.faisceau.position.set(lx,ly,lz);
  f.faisceau.quaternion.setFromUnitVectors(_basF,_dirF.divideScalar(len||1));
  f.faisceau.scale.set(0.95,len,0.95);
  if(majSol){
    var pos=f.sol.geometry.attributes.position, uv=f.sol.geometry.attributes.uv;
    for(var i=0;i<pos.count;i++){
      var u=uv.getX(i), v=uv.getY(i), d=0.9+v*5.4, w=(1.0+v*2.0)*(u-0.5);
      var x=lx+fx*d-fz*w, z=lz+fz*d+fx*w;
      pos.setXYZ(i,x,hauteur(x,z)+off+0.035,z);
    }
    pos.needsUpdate=true;
    f.sol.geometry.computeBoundingSphere();
  }
  f.visibleTete=tete!==false;
  return [cx,cy,cz];
}
function montrerFrontale(f,oui){
  f.sol.visible=oui;
  var t=oui && f.visibleTete;
  f.halo.visible=t; f.faisceau.visible=t; f.lampe.visible=false;
}

function majFrontales(dt){
  if(!FRONT.pret){ if(construit) initFrontales(); else return; }
  var nuitOn=!!nuit;
  FRONT.spots.forEach(function(s){ if(s.visible!==nuitOn) s.visible=nuitOn; });
  if(!nuitOn){
    if(FRONT.coureur) montrerFrontale(FRONT.coureur,false);
    FRONT.parJalon.forEach(function(f){ montrerFrontale(f,false); });
    return;
  }
  /* coureur */
  if(joueur){
    if(!FRONT.coureur) FRONT.coureur=creerFrontale();
    if(FRONT.tete===null){ FRONT.tete=false; joueur.traverse(function(o){ if(o.isBone && o.name==='Bip01_Head') FRONT.tete=o; }); }
    var fx=Math.cos(J.cap), fz=Math.sin(J.cap), lx, ly, lz;
    if(EQUIP.lentilleCoureur){ EQUIP.lentilleCoureur.getWorldPosition(_pT); lx=_pT.x+fx*0.01; ly=_pT.y; lz=_pT.z+fz*0.01; }
    else if(FRONT.tete){ FRONT.tete.getWorldPosition(_pT); lx=_pT.x+fx*0.12; ly=_pT.y+0.07; lz=_pT.z+fz*0.12; }
    else { lx=J.x+fx*0.12; ly=joueur.position.y+1.66; lz=J.z+fz*0.12; }
    var cib=placerFrontale(FRONT.coureur,lx,ly,lz,fx,fz,true,VUE!=='fp');
    montrerFrontale(FRONT.coureur,true);
    var s0=FRONT.spots[0];
    s0.position.set(lx,ly,lz); s0.target.position.set(cib[0],cib[1],cib[2]); s0.target.updateMatrixWorld();
    s0.intensity=15;
  }
  /* jalonneurs : tache au sol recalculée deux fois par seconde, lampe suivie à chaque image */
  FRONT.t-=dt;
  var majSol=FRONT.t<=0;
  if(majSol) FRONT.t=0.5;
  var cx=camera.position.x, cz=camera.position.z, D=PERF.dist, anim=new Map(), proches=[];
  VIE.jal.forEach(function(s){ if(s.o) anim.set(s.o,s); });
  if(majSol){
    FRONT.parJalon.forEach(function(f,o){ if(JOBJ.get(o.j)!==o){ supprimerFrontale(f); FRONT.parJalon.delete(o); } });
  }
  JOBJ.forEach(function(o){
    var d=Math.hypot(o.x-cx,o.z-cz), f=FRONT.parJalon.get(o);
    if(d>D){ if(f) montrerFrontale(f,false); return; }
    if(!f){ f=creerFrontale(); FRONT.parJalon.set(o,f); }
    var k=capDeAz(o.az), fx2=Math.cos(k), fz2=Math.sin(k), s=anim.get(o), B=s && s.rig.g.userData.os, h=B && B.Bip01_Head;
    var cle=o.x.toFixed(2)+','+o.z.toFixed(2)+','+o.az+','+o.j._vis;
    var tete=!(VUE==='jal' && VUEJAL===o);
    if(f.cle!==cle){
      /* jalonneur posé, déplacé ou tourné : on recalcule la tache au sol (coûteux, rare) */
      var femme=VARIANTES[((o.j._vis||0)%4+4)%4].indexOf('Female')===0;
      f.lampeFixe=lampeJalonFixe(o)||[o.x+fx2*0.12, hauteurSol(o.x,o.z)+(femme?1.60:1.68), o.z+fz2*0.12];
      f.cible=placerFrontale(f,f.lampeFixe[0],f.lampeFixe[1],f.lampeFixe[2],fx2,fz2,true,tete);
      f.cle=cle;
    }
    var L=f.lampeFixe;
    if(s && s.rig.frontale){ s.rig.frontale.getWorldPosition(_pT); L=[_pT.x+fx2*0.01,_pT.y,_pT.z+fz2*0.01]; }
    else if(h){ h.getWorldPosition(_pT); L=[_pT.x+fx2*0.11,_pT.y+0.07,_pT.z+fz2*0.11]; }
    /* suivi léger de la tête : lampe, halo et faisceau seulement */
    f.lampe.position.set(L[0],L[1],L[2]);
    f.halo.position.set(L[0]+fx2*0.03,L[1],L[2]+fz2*0.03);
    _dirF.set(f.cible[0]-L[0],f.cible[1]-L[1],f.cible[2]-L[2]);
    var len=_dirF.length();
    f.faisceau.position.set(L[0],L[1],L[2]);
    f.faisceau.quaternion.setFromUnitVectors(_basF,_dirF.divideScalar(len||1));
    f.faisceau.scale.set(0.95,len,0.95);
    f.visibleTete=tete;
    montrerFrontale(f,true);
    proches.push([d,L[0],L[1],L[2],f.cible]);
  });
  proches.sort(function(a,b){ return a[0]-b[0]; });
  for(var i=1;i<3;i++){
    var p=proches[i-1], sp=FRONT.spots[i];
    if(p && p[0]<70){
      sp.position.set(p[1],p[2],p[3]); sp.target.position.set(p[4][0],p[4][1],p[4][2]); sp.target.updateMatrixWorld();
      sp.intensity=11;
    } else sp.intensity=0;
  }
}
var _animS=animerDecor;
animerDecor=function(dt,cx,cz){
  _animS(dt,cx,cz);
  majFrontales(Math.min(dt,0.1));
};
/* =================================================================
   Nuit réaliste et frontales équipées.
   Nuit : ambiance, reflets du ciel et lune fortement baissés, 8 vrais
   lampadaires autour de la caméra. La lumière vient des lampadaires,
   des fenêtres et des frontales.
   Frontale : bandeau autour de la tête au niveau du front, boîtier et
   lentille, ajustés au tour de tête mesuré sur chaque modèle. Portée
   par la tête (suit les mouvements), visible la nuit seulement.
================================================================= */
var EQUIP={variantes:{}, mats:null, maillages:[], lentilleCoureur:null, coureurFait:false, t:0};
var INT_LAMPADAIRE=90;

/* Les fichiers FBX importés (personnages, animations, voitures) embarquent une
   lumière d'ambiance à pleine puissance chacun : une vingtaine au total, qui
   éclairaient toute la scène de façon uniforme, de jour comme de nuit. */
function retirerLumieresImportees(racine){
  var aRetirer=[];
  racine.traverse(function(o){ if(o.isLight) aRetirer.push(o); });
  aRetirer.forEach(function(l){ if(l.parent) l.parent.remove(l); });
  return racine;
}
if(EXT.FBXLoader && !EXT.FBXLoader.prototype.__sansLumieres){
  var _parseFbx=EXT.FBXLoader.prototype.parse;
  EXT.FBXLoader.prototype.parse=function(){ return retirerLumieresImportees(_parseFbx.apply(this,arguments)); };
  EXT.FBXLoader.prototype.__sansLumieres=true;
}
var NOS_LUMIERES=null;
function balayerLumieresEtrangeres(){
  if(!scene) return;
  var parasites=[];
  scene.traverse(function(o){ if(o.isAmbientLight) parasites.push(o); });
  parasites.forEach(function(l){ if(l.parent) l.parent.remove(l); });
}

/* ---------------- éclairage de nuit ---------------- */
preparerLumieres=function(){
  if(LUMS.length || !scene) return;
  for(var i=0;i<8;i++){
    var pl=new THREE.PointLight(0xffc98a,0,32,2);
    pl.castShadow=false;
    scene.add(pl); LUMS.push(pl);
  }
};
var _cielT=appliquerCiel;
appliquerCiel=function(){
  _cielT();
  if(!scene || !lumSol) return;
  if(nuit){
    scene.environmentIntensity=0.18;
    lumSol.intensity=0.5; lumSol.color.setHex(0x6a82b8); lumSol.groundColor.setHex(0x1a2030);
    lumDir.intensity=0.4; lumDir.color.setHex(0x8fa8d8);
    renderer.toneMappingExposure=1.0;
    if(MAT.trace) MAT.trace.emissive.setHex(0x3a2c08);
    if(lampHalos) lampHalos.visible=false;
  }
};

/* ---------------- géométrie de la frontale ---------------- */
function matsFrontale(){
  if(!EQUIP.mats) EQUIP.mats={
    equip:new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.72, metalness:0.1, side:THREE.DoubleSide}),
    lentille:new THREE.MeshBasicMaterial({color:0xfff6dc, side:THREE.DoubleSide})
  };
  return EQUIP.mats;
}
/* g : groupe normalisé (avant +x, haut +y). Géométries rendues dans le repère de g
   et dans celui de l'os de la tête (pour les personnages animés). */
function geoFrontaleDepuis(g){
  g.updateMatrixWorld(true);
  var tete=null;
  g.traverse(function(o){ if(o.isBone && o.name==='Bip01_Head') tete=o; });
  if(!tete) return null;
  var fige=figerAvatar(g), pts=[], k, i;
  fige.forEach(function(p){
    var mats=Array.isArray(p.mat)?p.mat:[p.mat], P=p.geo.attributes.position, idx=p.geo.index;
    var grs=p.geo.groups.length?p.geo.groups:[{start:0,count:idx?idx.count:P.count,materialIndex:0}];
    grs.forEach(function(gr){
      var m=mats[gr.materialIndex];
      if(!m || !/head/i.test(m.name)) return;
      for(var q=gr.start;q<gr.start+gr.count;q++){ var v=idx?idx.getX(q):q; pts.push(P.getX(v),P.getY(v),P.getZ(v)); }
    });
    p.geo.dispose();
  });
  if(pts.length<60) return null;
  var ymax=-1e9;
  for(k=1;k<pts.length;k+=3) if(pts[k]>ymax) ymax=pts[k];
  var hf=ymax-0.072, x0=1e9, x1=-1e9, z0=1e9, z1=-1e9;
  for(k=0;k<pts.length;k+=3){
    if(Math.abs(pts[k+1]-hf)>0.015) continue;
    if(pts[k]<x0)x0=pts[k]; if(pts[k]>x1)x1=pts[k]; if(pts[k+2]<z0)z0=pts[k+2]; if(pts[k+2]>z1)z1=pts[k+2];
  }
  if(x0>x1) return null;
  var cx=(x0+x1)/2, cz=(z0+z1)/2, rx=(x1-x0)/2+0.008, rz=(z1-z0)/2+0.008;
  var tas=new Tas(1024), noir=teinte(0x17191c), liseré=teinte(0x8a8f96), gris=teinte(0x3b3f45), N=36, h=0.013;
  for(i=0;i<N;i++){
    var a0=i/N*2*PI, a1=(i+1)/N*2*PI;
    var p0=[cx+Math.cos(a0)*rx, cz+Math.sin(a0)*rz], p1=[cx+Math.cos(a1)*rx, cz+Math.sin(a1)*rz];
    var nx=Math.cos((a0+a1)/2)/rx, nz=Math.sin((a0+a1)/2)/rz, nl=Math.hypot(nx,nz); nx/=nl; nz/=nl;
    tas.tri(p0[0],hf-h,p0[1], p1[0],hf+h,p1[1], p1[0],hf-h,p1[1], nx,0,nz,[0,0,1,1,1,0],noir);
    tas.tri(p0[0],hf-h,p0[1], p0[0],hf+h,p0[1], p1[0],hf+h,p1[1], nx,0,nz,[0,0,0,1,1,1],noir);
    /* fin liseré réfléchissant au milieu du bandeau */
    var o=0.0008;
    tas.tri(p0[0]+nx*o,hf-0.002,p0[1]+nz*o, p1[0]+nx*o,hf+0.002,p1[1]+nz*o, p1[0]+nx*o,hf-0.002,p1[1]+nz*o, nx,0,nz,[0,0,1,1,1,0],liseré);
    tas.tri(p0[0]+nx*o,hf-0.002,p0[1]+nz*o, p0[0]+nx*o,hf+0.002,p0[1]+nz*o, p1[0]+nx*o,hf+0.002,p1[1]+nz*o, nx,0,nz,[0,0,0,1,1,1],liseré);
  }
  /* boîtier à l'avant du bandeau */
  var bx=cx+rx+0.012, d=0.012, w=0.026, hb=0.018;
  boiteQuad(tas,[bx-d,cz-w],[bx-d,cz+w],[bx+d,cz+w],[bx+d,cz-w],hf-hb,hf+hb,gris,gris,1);
  boiteQuad(tas,[bx-d,cz-w],[bx-d,cz+w],[bx+d,cz+w],[bx+d,cz-w],hf-hb-0.003,hf-hb,gris,gris,1);
  /* lentille ronde sur la face avant */
  var lt=new Tas(64), lx=bx+d+0.0015, r=0.011, blanc=teinte(0xffffff);
  for(i=0;i<18;i++){
    var b0=i/18*2*PI, b1=(i+1)/18*2*PI;
    lt.tri(lx,hf,cz, lx,hf+Math.sin(b0)*r,cz+Math.cos(b0)*r, lx,hf+Math.sin(b1)*r,cz+Math.cos(b1)*r, 1,0,0,[0,0,1,0,1,1],blanc);
  }
  var geoEquip=tas.geo(), geoLent=lt.geo();
  var rel=new THREE.Matrix4().copy(g.matrixWorld).invert().multiply(tete.matrixWorld), inv=rel.clone().invert();
  var lens=new THREE.Vector3(lx+0.004,hf,cz);
  return {equip:geoEquip, lentille:geoLent, lens:lens,
          equipOs:geoEquip.clone().applyMatrix4(inv), lentilleOs:geoLent.clone().applyMatrix4(inv), lensOs:lens.clone().applyMatrix4(inv)};
}
function frontaleVariante(nom){
  if(EQUIP.variantes[nom]!==undefined) return EQUIP.variantes[nom];
  var gab=PERSO.gabarits && PERSO.gabarits[nom];
  if(!gab){ EQUIP.variantes[nom]=null; return null; }
  restaurerOs(gab.rest);
  var r=null;
  try{ r=geoFrontaleDepuis(gab.g); }catch(e){ console.error('Frontale '+nom,e); }
  return (EQUIP.variantes[nom]=r);
}
function enregistrerEquip(me,ml,proprio){
  me.castShadow=true; me.frustumCulled=false; ml.frustumCulled=false;
  me.userData.proprio=proprio; ml.userData.proprio=proprio;
  me.visible=ml.visible=!!nuit;
  EQUIP.maillages.push(me,ml);
}
/* sur l'os de la tête : suit les mouvements ; renvoie un repère placé sur la lentille */
function attacherTete(racine,v,proprio){
  var tete=null;
  racine.traverse(function(o){ if(o.isBone && o.name==='Bip01_Head') tete=o; });
  if(!tete || !v) return null;
  var m=matsFrontale(), me=new THREE.Mesh(v.equipOs,m.equip), ml=new THREE.Mesh(v.lentilleOs,m.lentille), mk=new THREE.Object3D();
  mk.position.copy(v.lensOs);
  tete.add(me); tete.add(ml); tete.add(mk);
  enregistrerEquip(me,ml,proprio);
  return mk;
}

/* jalonneurs figés : l'équipement est ajouté au groupe du modèle */
var _majJalT=majJalonneur;
majJalonneur=function(o,n){
  _majJalT(o,n);
  if(o.haut && o.haut.isGroup && !o.haut.userData.frontaleAjoutee){
    o.haut.userData.frontaleAjoutee=true;
    var v=frontaleVariante(VARIANTES[((o.j._vis||0)%4+4)%4]);
    if(v){
      var m=matsFrontale(), me=new THREE.Mesh(v.equip,m.equip), ml=new THREE.Mesh(v.lentille,m.lentille);
      o.haut.add(me); o.haut.add(ml);
      enregistrerEquip(me,ml,o);
      o.haut.userData.lentille=v.lens;
    }
  }
};
function lampeJalonFixe(o){
  var L=o.haut && o.haut.userData.lentille;
  if(!L) return null;
  var v=L.clone().applyAxisAngle(_hautV,-capDeAz(o.az));
  return [o.lod.position.x+v.x, o.lod.position.y+v.y, o.lod.position.z+v.z];
}

function majEquipements(dt){
  if(!construit) return;
  if(!EQUIP.coureurFait && joueur && PERSO.pret){
    EQUIP.coureurFait=true;
    if(joueur.userData.reel){
      try{ var r=geoFrontaleDepuis(joueur); if(r) EQUIP.lentilleCoureur=attacherTete(joueur,r,'coureur'); }
      catch(e){ console.error('Frontale coureur',e); }
    }
  }
  VIE.jal.forEach(function(s){
    if(s.rig.frontale!==undefined) return;
    s.rig.frontale=attacherTete(s.rig.g,frontaleVariante(s.rig.nom),s);
  });
  EQUIP.t-=dt;
  if(EQUIP.t<=0){
    EQUIP.t=2;
    balayerLumieresEtrangeres();
    EQUIP.maillages=EQUIP.maillages.filter(function(m){ var p=m; while(p.parent) p=p.parent; return p===scene; });
  }
  var on=!!nuit;
  for(var i=0;i<EQUIP.maillages.length;i++){
    var m=EQUIP.maillages[i], p=m.userData.proprio, vis=on;
    if(p==='coureur') vis=on && VUE!=='fp';
    else if(p && p.o!==undefined) vis=on && !(VUE==='jal' && VUEJAL===p.o);
    else if(p) vis=on && !(VUE==='jal' && VUEJAL===p);
    m.visible=vis;
  }
}
var _animT=animerDecor;
animerDecor=function(dt,cx,cz){
  _animT(dt,cx,cz);
  majEquipements(Math.min(dt,0.1));
  if(nuit) LUMS.forEach(function(l){ if(l.intensity>0) l.intensity=INT_LAMPADAIRE; });
};
/* =================================================================
   Barrières municipales et rubalise : pose dans la 3D, sélection,
   rotation, suppression, comptage du matériel.
   Bouton pour masquer le tracé (3D, panneaux de lieux, minicarte,
   carte globale) : on peut faire dérouler le parcours à quelqu'un qui
   ne le connaît pas, guidé par les jalonneurs, barrières et rubalise.
================================================================= */
var EQ={mode:null, a:null, pts:[], sel:null, imBar:null, geoBar:null, matBar:null, rub:null, matTape:null, matPiq:null,
        ghost:null, ligne:null, anneaux:null, matAnneau:null, tm:0, dernierP:null, infoFile:1, sale:false};
var TRACE_VISIBLE=true;
try{ TRACE_VISIBLE=localStorage.getItem('corrida3d-trace')!=='0'; }catch(e){}
/* rubalise nouée sur la lisse haute des barrières d'ancrage (1,10 m), un peu décalée pour ne pas traverser le tube */
var EQ_TRAVEE=10, EQ_HAUT=1.07, EQ_DECAL=0.04;

/* ---------------- modèles ---------------- */
/* barrière de ville type « Vauban » : 2 m × 1,10 m, acier galvanisé, axe long sur +x */
function geoBarriere(){
  var t=new Tas(8192), g=teinte(0xc5cad0), f=teinte(0x8f959c), h=1.1, bas=0.2, L=0.99, x;
  tube(t,-L,0.05,0,-L,h,0,0.022,0.022,8,g,false,true);
  tube(t, L,0.05,0, L,h,0,0.022,0.022,8,g,false,true);
  tube(t,-L,h,0,L,h,0,0.021,0.021,8,g,true,true);
  tube(t,-L,bas,0,L,bas,0,0.018,0.018,8,g,true,true);
  for(x=-0.89;x<0.9;x+=0.098) tube(t,x,bas,0,x,h,0,0.0085,0.0085,5,g,false,false);
  [-1,1].forEach(function(sx){
    var xp=sx*0.84;
    tube(t,xp,0.03,-0.38,xp,0.03,0.38,0.02,0.02,6,f,true,true);
    tube(t,xp,0.04,-0.32,sx*L,0.36,0,0.013,0.013,5,f,false,false);
    tube(t,xp,0.04,0.32,sx*L,0.36,0,0.013,0.013,5,f,false,false);
    tube(t,sx*L,0.95,0,sx*(L+0.045),0.95,0,0.009,0.009,5,g,false,true);
  });
  return t.geo();
}
function texRubalise(){
  var c=toile(256,32), g=c.getContext('2d');
  g.fillStyle='#f3f3ef'; g.fillRect(0,0,256,32);
  g.fillStyle='#cf2a22';
  for(var i=-1;i<5;i++){
    var x=i*64;
    g.beginPath(); g.moveTo(x,32); g.lineTo(x+32,32); g.lineTo(x+64,0); g.lineTo(x+32,0); g.closePath(); g.fill();
  }
  var t=new THREE.CanvasTexture(c);
  t.wrapS=THREE.RepeatWrapping; t.wrapT=THREE.ClampToEdgeWrapping; t.anisotropy=8;
  if(t.colorSpace!==undefined) t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
var _mE=new THREE.Matrix4(), _qE=new THREE.Quaternion(), _pE=new THREE.Vector3(), _sE=new THREE.Vector3(1,1,1), _yE=new THREE.Vector3(0,1,0);
function matriceBarriere(x,z,ang){
  _qE.setFromAxisAngle(_yE,-ang*PI/180);
  _pE.set(x,hauteurSol(x,z)-0.02,z);
  return _mE.compose(_pE,_qE,_sE);
}
function preparerModeleBarriere(){
  if(EQ.geoBar) return;
  EQ.geoBar=geoBarriere();
  EQ.matBar=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.4, metalness:0.55});
}

/* ---------------- construction depuis les données de la carte ---------------- */
function construireBarrieres(){
  if(EQ.imBar){ monde.remove(EQ.imBar); EQ.imBar.dispose(); EQ.imBar=null; }
  var L=CARTE.equip().barrieres, A=CARTE.ancrages ? CARTE.ancrages() : [];
  L.forEach(function(b){ b._x=pX(b.lo); b._z=pZ(b.la); });
  A.forEach(function(b){ b._x=pX(b.lo); b._z=pZ(b.la); });
  EQ.ancrages=A;
  var T=L.concat(A);
  if(!T.length) return;
  preparerModeleBarriere();
  var im=new THREE.InstancedMesh(EQ.geoBar,EQ.matBar,T.length);
  T.forEach(function(b,i){ im.setMatrixAt(i,matriceBarriere(b._x,b._z,b.ang)); });
  im.castShadow=true; im.receiveShadow=true;
  im.computeBoundingSphere();
  monde.add(im); EQ.imBar=im;
}
function noeudsRubalise(r){
  if(r._ancr && r._ancr.length>=2) return r._ancr.map(function(p){ return [pX(p[1]),pZ(p[0])]; });
  var P=r.pts.map(function(p){ return [pX(p[1]),pZ(p[0])]; }), N=[P[0]];
  for(var i=1;i<P.length;i++){
    var a=P[i-1], b=P[i], L=Math.hypot(b[0]-a[0],b[1]-a[1]), n=Math.max(1,Math.ceil(L/EQ_TRAVEE));
    for(var s=1;s<=n;s++) N.push([a[0]+(b[0]-a[0])*s/n, a[1]+(b[1]-a[1])*s/n]);
  }
  return N;
}
function construireRubalises(){
  if(EQ.rub){ monde.remove(EQ.rub); EQ.rub.children.forEach(function(m){ m.geometry.dispose(); }); EQ.rub=null; }
  var R=CARTE.equip().rubalises;
  if(!R.length) return;
  if(!EQ.matTape){
    EQ.matTape=new THREE.MeshStandardMaterial({map:texRubalise(), side:THREE.DoubleSide, roughness:0.45, metalness:0});
    EQ.matPiq=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.6, metalness:0});
  }
  var tape=new Tas(16384), piq=new Tas(16384), rouge=teinte(0xcf2a22), blanc=teinte(0xf2f2ee), demi=0.028, e=0.018;
  var bandes=[[-0.2,0.25,rouge],[0.25,0.5,blanc],[0.5,0.75,rouge],[0.75,1.0,blanc]];
  R.forEach(function(r){
    var N=noeudsRubalise(r), Y=N.map(function(n){ return hauteurSol(n[0],n[1]); }), i, du=0;
    r._noeuds=N;
    for(i=1;i<N.length;i++){
      var a=N[i-1], b=N[i], L=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(L<0.05) continue;
      var nx=-(b[1]-a[1])/L, nz=(b[0]-a[0])/L, fl=Math.min(0.14,0.018*L), S=8;
      for(var s=0;s<S;s++){
        var t0=s/S, t1=(s+1)/S;
        var x0=a[0]+(b[0]-a[0])*t0+nx*EQ_DECAL, z0=a[1]+(b[1]-a[1])*t0+nz*EQ_DECAL;
        var x1=a[0]+(b[0]-a[0])*t1+nx*EQ_DECAL, z1=a[1]+(b[1]-a[1])*t1+nz*EQ_DECAL;
        var y0=Y[i-1]+(Y[i]-Y[i-1])*t0+EQ_HAUT-fl*4*t0*(1-t0), y1=Y[i-1]+(Y[i]-Y[i-1])*t1+EQ_HAUT-fl*4*t1*(1-t1);
        var u0=(du+L*t0)/0.9, u1=(du+L*t1)/0.9;
        tape.tri(x0,y0-demi,z0, x1,y1-demi,z1, x1,y1+demi,z1, nx,0,nz,[u0,0,u1,0,u1,1],blanc);
        tape.tri(x0,y0-demi,z0, x1,y1+demi,z1, x0,y0+demi,z0, nx,0,nz,[u0,0,u1,1,u0,1],blanc);
      }
      du+=L;
    }
  });
  var g=new THREE.Group();
  if(!tape.vide()){ var mt=new THREE.Mesh(tape.geo(),EQ.matTape); mt.castShadow=true; g.add(mt); }
  if(!piq.vide()){ var mp=new THREE.Mesh(piq.geo(),EQ.matPiq); mp.castShadow=true; mp.receiveShadow=true; g.add(mp); }
  monde.add(g); EQ.rub=g;
}
function reconstruireEquip(){
  if(!window.CARTE || !CARTE.equip || !scene) return;
  construireBarrieres();
  construireRubalises();
  majCompteurEquip();
  if(EQ.sel){
    var E=CARTE.equip(), s=EQ.sel, ok;
    if(s.type==='r') ok=E.rubalises.indexOf(s.o)>=0;
    else if(s.type==='g' || s.type==='m'){ s.liste=s.liste.filter(function(b){ return E.barrieres.indexOf(b)>=0; }); ok=s.liste.length>0; }
    else ok=E.barrieres.indexOf(s.o)>=0;
    if(!ok) deselectionnerEquip();
    else { majSurlignage(); majPanneauEquip(); }
  }
}
function majCompteurEquip(){
  if(!CARTE.bilanEquip) return;
  var b=CARTE.bilanEquip(), n=$e('e3-mat'), m=$e('e3-matm');
  if(n) n.textContent=b.barrieres;
  if(m) m.textContent=b.metres;
}
function bilanTexte(){
  var b=CARTE.bilanEquip();
  return b.barrieres+' barrière'+(b.barrieres>1?'s':'')+(b.ancrages?' dont '+b.ancrages+' d’ancrage':'')+', '+b.metres+' m de rubalise.';
}

/* ---------------- aperçu pendant la pose ---------------- */
function initApercu(){
  if(EQ.ghost) return;
  preparerModeleBarriere();
  EQ.ghost=new THREE.InstancedMesh(EQ.geoBar,new THREE.MeshBasicMaterial({color:0xf2b33d, transparent:true, opacity:0.5, depthWrite:false}),150);
  EQ.ghost.count=0; EQ.ghost.frustumCulled=false; EQ.ghost.renderOrder=10;
  monde.add(EQ.ghost);
  var geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(3*400),3));
  geo.setDrawRange(0,0);
  EQ.ligne=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xff4136, depthTest:false, transparent:true}));
  EQ.ligne.frustumCulled=false; EQ.ligne.renderOrder=11;
  monde.add(EQ.ligne);
  EQ.anneaux=new THREE.Group();
  monde.add(EQ.anneaux);
}
function angleEnTravers(x,z){
  var I=IDX_SOL||(IDX_SOL=indexerChaussees(Dvoies)), rp=routeProche(I,x,z,15), ang=0;
  if(rp) ang=Math.atan2(rp.uz,rp.ux)*180/PI+90;
  return ((Math.round(ang)%360)+360)%360;
}
/* file de barrières de 2 m bout à bout entre a et b ; clic unique : une barrière en travers de la rue */
function fileBarrieres(a,b){
  var dx=b.x-a.x, dz=b.z-a.z, L=Math.hypot(dx,dz), out=[];
  if(L<1.0){ out.push({x:a.x, z:a.z, ang:angleEnTravers(a.x,a.z)}); return out; }
  var n=Math.max(1,Math.ceil(L/2.02)), st=L/n, ux=dx/L, uz=dz/L;
  var an=((Math.round(Math.atan2(uz,ux)*180/PI)%360)+360)%360;
  for(var i=0;i<n;i++) out.push({x:a.x+ux*st*(i+0.5), z:a.z+uz*st*(i+0.5), ang:an});
  return out;
}
function longueurPts(pts){
  var L=0;
  for(var i=1;i<pts.length;i++) L+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);
  return Math.round(L);
}
function majApercu(p){
  initApercu();
  var g=EQ.ghost;
  if(EQ.mode==='bar'){
    EQ.ligne.geometry.setDrawRange(0,0);
    if(!p){ g.count=0; }
    else {
      var file=fileBarrieres(EQ.a||p, p), n=Math.min(file.length,g.instanceMatrix.count);
      for(var i=0;i<n;i++) g.setMatrixAt(i,matriceBarriere(file[i].x,file[i].z,file[i].ang));
      g.count=n; g.instanceMatrix.needsUpdate=true;
      EQ.infoFile=file.length;
    }
  } else if(EQ.mode==='rub'){
    var pts=EQ.pts.slice();
    if(p) pts.push([p.x,p.z]);
    /* aperçu des barrières d'ancrage (tous les 10 m au plus, hors barrières déjà posées à moins de 1,5 m) */
    var fixes=CARTE.equip().barrieres.concat(EQ.ancrages||[]), na=0;
    function ancre(x,z,ang){
      for(var f=0;f<fixes.length;f++) if(fixes[f]._x!==undefined && Math.hypot(fixes[f]._x-x,fixes[f]._z-z)<1.5) return;
      if(na<g.instanceMatrix.count) g.setMatrixAt(na++,matriceBarriere(x,z,ang));
    }
    for(var q=0;q<pts.length;q++){
      if(q===0){ if(pts.length>1) ancre(pts[0][0],pts[0][1],Math.atan2(pts[1][1]-pts[0][1],pts[1][0]-pts[0][0])*180/PI); continue; }
      var ax=pts[q-1][0], az=pts[q-1][1], bx=pts[q][0], bz=pts[q][1], Ls=Math.hypot(bx-ax,bz-az), ns=Math.max(1,Math.ceil(Ls/EQ_TRAVEE));
      var an=Math.atan2(bz-az,bx-ax)*180/PI;
      for(var sp=1;sp<=ns;sp++) ancre(ax+(bx-ax)*sp/ns, az+(bz-az)*sp/ns, an);
    }
    g.count=na; g.instanceMatrix.needsUpdate=true;
    var arr=EQ.ligne.geometry.attributes.position.array, k=0, nb=Math.min(pts.length,400);
    for(var j=0;j<nb;j++){ arr[k++]=pts[j][0]; arr[k++]=hauteurSol(pts[j][0],pts[j][1])+EQ_HAUT; arr[k++]=pts[j][1]; }
    EQ.ligne.geometry.attributes.position.needsUpdate=true;
    EQ.ligne.geometry.setDrawRange(0,nb);
    EQ.ligne.geometry.computeBoundingSphere();
    EQ.infoRub=longueurPts(pts);
  } else {
    g.count=0;
    EQ.ligne.geometry.setDrawRange(0,0);
  }
  majPanneauEquip();
}

/* ---------------- panneau ---------------- */
function panneauEquip(){
  var p=$e('e3-eq');
  if(p) return p;
  var s=document.createElement('style');
  s.textContent=[
    '#e3-eq{position:absolute;left:12px;top:118px;width:310px;z-index:7;background:rgba(14,20,31,.94);border:1px solid #3a4a63;',
    'border-radius:14px;padding:12px 13px 10px;box-shadow:0 10px 30px rgba(0,0,0,.5);backdrop-filter:blur(6px);display:flex;flex-direction:column;gap:8px}',
    '.e3-eq-tete{display:flex;align-items:center;justify-content:space-between;gap:8px}',
    '#e3-eq p{margin:0;font-size:12.5px;line-height:1.45;color:#dfe6f0}',
    '.e3-eq-ligne{display:flex;gap:6px;flex-wrap:wrap}',
    '.e3-eq-az{align-items:center;flex-wrap:nowrap}',
    '#e3 .e3-eq-az input[type=range]{flex:1;min-width:70px;width:auto}',
    '@media (max-width:760px){#e3-eq{top:auto;bottom:66px;width:calc(100vw - 24px)}}'
  ].join('\n');
  document.head.appendChild(s);
  p=document.createElement('div');
  p.id='e3-eq'; p.hidden=true;
  $e('e3').appendChild(p);
  p.addEventListener('click',function(ev){
    var b=ev.target.closest ? ev.target.closest('button') : null;
    if(!b) return;
    actionEquip(b.dataset.a);
    b.blur();
  });
  p.addEventListener('input',function(ev){
    if(ev.target.id!=='e3-eq-az' || !EQ.sel) return;
    var cible=((+ev.target.value-90)%360+360)%360, d=cible-orientationSel();
    if(d>180) d-=360;
    if(d<-180) d+=360;
    tournerSel(d);
  });
  p.addEventListener('change',function(ev){ if(ev.target.id==='e3-eq-az') ev.target.blur(); });
  return p;
}
function majPanneauEquip(){
  var p=panneauEquip(), h='';
  function tete(t,a,titre){ return '<div class="e3-eq-tete"><b>'+t+'</b><button class="e3-x" data-a="'+a+'" title="'+titre+'">✕</button></div>'; }
  if(EQ.mode==='bar'){
    var nf=EQ.infoFile||1;
    h=tete('🚧 Pose de barrières','stop','Arrêter la pose (Échap)')+
      '<p>'+(EQ.a ? 'Clique la fin de la file : <b>'+nf+' barrière'+(nf>1?'s':'')+'</b> de 2 m bout à bout.'
                  : 'Clique le début de la file de barrières, puis sa fin. Deux clics au même endroit posent une barrière seule, en travers de la rue.')+'</p>'+
      '<p class="e3-discret">Clic droit ou Échap : annuler. Glisse pour tourner la caméra. '+bilanTexte()+'</p>';
  } else if(EQ.mode==='rub'){
    h=tete('〰 Pose de rubalise','stop','Arrêter la pose (Échap)')+
      '<p>Clique chaque point d’accroche.'+(EQ.pts.length ? ' <b>'+(EQ.infoRub||0)+' m</b> en cours.' : '')+'</p>'+
      '<div class="e3-eq-ligne"><button data-a="finir" class="e3-fort">Terminer (Entrée)</button><button data-a="retour">Retirer le dernier point</button></div>'+
      '<p class="e3-discret">Double-clic termine aussi. Échap : annuler la ligne en cours. La rubalise est nouée sur une barrière tous les 10 m au plus (en doré : les barrières qui seront ajoutées) ; une barrière déjà posée à moins de 1,5 m sert d’ancrage. '+bilanTexte()+'</p>';
  } else if(EQ.sel){
    var s=EQ.sel, titre, info, extra='', nom;
    if(s.type==='b'){
      var rg=rangeeDe(s.o);
      titre='🚧 Barrière municipale'; info='2 m × 1,10 m.'; nom='la barrière';
      if(rg) extra='<button data-a="rangee">Toute la rangée ('+rg.length+')</button>';
    } else if(s.type==='g'){
      titre='🚧 Rangée de '+s.liste.length+' barrières'; info=(s.liste.length*2)+' m de barrières bout à bout.'; nom='la rangée';
      extra='<button data-a="seule">Une seule barrière</button>';
    } else if(s.type==='m'){
      titre='🚧 '+s.liste.length+' barrières sélectionnées'; nom='la sélection';
      info='Relie-les de proche en proche, en partant de la barrière la plus à l’extrémité.';
      extra='<button data-a="relierRub" class="e3-fort">〰 Relier par de la rubalise</button>'+
            '<button data-a="relierBar" class="e3-fort">🚧 Relier par des barrières</button>';
    } else {
      var N=s.o._noeuds||[];
      titre='〰 Rubalise'; nom='la rubalise';
      info='<b>'+longueurPts(N)+' m</b>, '+N.length+' point'+(N.length>1?'s':'')+' d’ancrage sur barrière.';
    }
    h=tete(titre,'fermer','Fermer (Échap)')+
      '<p>'+info+'</p>'+
      '<div class="e3-jp-lbl">Orientation <span id="e3-eq-azv"></span></div>'+
      '<div class="e3-eq-ligne e3-eq-az"><button data-a="rg" title="Tourner de 15° vers la gauche">⟲ 15°</button>'+
      '<input type="range" id="e3-eq-az" min="0" max="359" step="1" aria-label="Orientation">'+
      '<button data-a="rd" title="Tourner de 15° vers la droite">15° ⟳</button><button data-a="r90" title="Tourner d’un quart de tour">⟂</button></div>'+
      '<div class="e3-eq-ligne">'+extra+'<button data-a="suppr" class="e3-danger">Supprimer (Suppr)</button></div>'+
      '<p class="e3-discret">Tire '+nom+' dans la scène pour la déplacer.'+(s.type==='b' && rangeeDe(s.o) ? ' Double-clic : toute la rangée.' : '')+
      (s.type!=='r' ? ' Ctrl+clic sur une barrière : l’ajouter ou la retirer de la sélection.' : '')+' Tout est reporté sur la carte.</p>';
  } else { p.hidden=true; p.__h=''; return; }
  if(p.__h!==h){ p.innerHTML=h; p.__h=h; }
  p.hidden=false;
  if(EQ.sel){
    /* affichage en azimut géographique (0° = nord) */
    var geo=(orientationSel()+90)%360, az=$e('e3-eq-az'), azv=$e('e3-eq-azv');
    if(az && document.activeElement!==az) az.value=geo;
    if(azv) azv.textContent=geo+'° '+pointCardinal(geo);
  }
}
function actionEquip(a){
  if(a==='stop') sortirMode();
  else if(a==='finir') terminerRubalise();
  else if(a==='retour'){ EQ.pts.pop(); majApercu(EQ.dernierP); }
  else if(a==='fermer') deselectionnerEquip();
  else if(a==='suppr') supprimerSelEquip();
  else if(EQ.sel && (a==='rg'||a==='rd'||a==='r90')) tournerSel(a==='rg'?-15:(a==='rd'?15:90));
  else if(a==='rangee' && EQ.sel && EQ.sel.type==='b'){ var rg=rangeeDe(EQ.sel.o); if(rg) selectionnerEquip({type:'g', liste:rg, o:EQ.sel.o}); }
  else if(a==='seule' && EQ.sel && EQ.sel.type==='g') selectionnerEquip({type:'b', o:EQ.sel.o});
  else if(a==='relierRub') relierSel('rub');
  else if(a==='relierBar') relierSel('bar');
}

/* ---------------- sélection ---------------- */
function distSeg(px,pz,a,b){
  var dx=b[0]-a[0], dz=b[1]-a[1], l2=dx*dx+dz*dz, t=l2>0?((px-a[0])*dx+(pz-a[1])*dz)/l2:0;
  t=t<0?0:(t>1?1:t);
  return Math.hypot(px-(a[0]+dx*t),pz-(a[1]+dz*t));
}
function trouverEquip(p){
  var E=CARTE.equip(), best=null, bd=1e9;
  E.barrieres.forEach(function(b){
    if(b._x===undefined) return;
    var an=b.ang*PI/180, ux=Math.cos(an), uz=Math.sin(an);
    var d=distSeg(p.x,p.z,[b._x-ux,b._z-uz],[b._x+ux,b._z+uz]);
    if(d<0.8 && d<bd){ bd=d; best={type:'b',o:b}; }
  });
  E.rubalises.forEach(function(r){
    var N=r._noeuds; if(!N) return;
    for(var i=1;i<N.length;i++){
      var d=distSeg(p.x,p.z,N[i-1],N[i]);
      if(d<0.9 && d<bd){ bd=d; best={type:'r',o:r}; }
    }
  });
  return best;
}
/* ---------------- sélection avancée : rangées, visée au rayon, déplacement, rotation ---------------- */
function rangeeDe(b){
  if(!b || !b.g) return null;
  var L=CARTE.equip().barrieres.filter(function(x){ return x.g===b.g; });
  return L.length>1 ? L : null;
}
function rubaliseDeAncrage(a){
  var R=CARTE.equip().rubalises;
  for(var i=0;i<R.length;i++){
    var A=R[i]._ancr||[];
    for(var k=0;k<A.length;k++) if(Math.abs(A[k][0]-a.la)<1e-7 && Math.abs(A[k][1]-a.lo)<1e-7) return R[i];
  }
  return null;
}
/* ce qui est sous le pointeur : barrière visée au rayon (même le haut du cadre), sinon test au sol */
function viserEquip(ev){
  if(!window.CARTE || !CARTE.equip) return null;
  if(EQ.imBar){
    raycaster.setFromCamera(ndc(ev),camera);
    var h=raycaster.intersectObject(EQ.imBar,false);
    if(h.length && h[0].instanceId!==undefined){
      var L=CARTE.equip().barrieres, id=h[0].instanceId;
      if(id<L.length) return {type:'b', o:L[id]};
      var a=(EQ.ancrages||[])[id-L.length], r=a && rubaliseDeAncrage(a);
      if(r) return {type:'r', o:r};
    }
  }
  var p=solSousPointeur(ev);
  return p ? trouverEquip(p) : null;
}
function elementsSel(s){
  s=s||EQ.sel;
  if(!s) return [];
  if(s.type==='b') return [s.o];
  if(s.type==='g' || s.type==='m') return s.liste;
  return [];
}
/* Ctrl+clic ou Maj+clic : ajouter ou retirer une barrière de la sélection */
function basculerMulti(b){
  var cur=elementsSel().slice(), i=cur.indexOf(b);
  if(i>=0) cur.splice(i,1); else cur.push(b);
  if(!cur.length){ deselectionnerEquip(); return; }
  if(cur.length===1) selectionnerEquip({type:'b', o:cur[0]});
  else selectionnerEquip({type:'m', liste:cur, o:cur[0]});
}
/* ordre de passage : depuis l'extrémité la plus éloignée, puis de proche en proche */
function chaineSel(liste){
  var P=liste.map(function(b){ return {b:b, x:pX(b.lo), z:pZ(b.la)}; });
  if(P.length<2) return P;
  var i0=0, dm=-1, i, j;
  for(i=0;i<P.length;i++) for(j=i+1;j<P.length;j++){
    var d=Math.hypot(P[i].x-P[j].x,P[i].z-P[j].z);
    if(d>dm){ dm=d; i0=i; }
  }
  var reste=P.slice(), ordre=[reste.splice(i0,1)[0]];
  while(reste.length){
    var der=ordre[ordre.length-1], k=0, bd=1e9;
    reste.forEach(function(q,ix){ var d2=Math.hypot(q.x-der.x,q.z-der.z); if(d2<bd){ bd=d2; k=ix; } });
    ordre.push(reste.splice(k,1)[0]);
  }
  return ordre;
}
function relierSel(mode){
  var s=EQ.sel;
  if(!s || s.type!=='m') return;
  var C=chaineSel(s.liste), i;
  if(mode==='rub'){
    var r=CARTE.ajouterRubalise(C.map(function(q){ return [laDeZ(q.z),loDeX(q.x)]; })), L=0;
    for(i=1;i<C.length;i++) L+=Math.hypot(C[i].x-C[i-1].x,C[i].z-C[i-1].z);
    selectionnerEquip({type:'r', o:r});
    dire('Rubalise de '+Math.round(L)+' m tendue entre les '+C.length+' barrières. Total : '+bilanTexte());
    return;
  }
  var nouv=[];
  for(i=1;i<C.length;i++){
    var a=C[i-1], b=C[i], dx=b.x-a.x, dz=b.z-a.z, Lp=Math.hypot(dx,dz);
    if(Lp<0.1) continue;
    /* on comble l'écart entre les bouts des deux barrières (1 m de demi-barrière de chaque côté) */
    var ux=dx/Lp, uz=dz/Lp, ecart=Lp-2;
    if(ecart<0.3) continue;
    var n=Math.max(1,Math.ceil(ecart/2.02)), pas=ecart/n, an=((Math.round(Math.atan2(uz,ux)*180/PI)%360)+360)%360;
    for(var k=0;k<n;k++){ var dd=1+pas*(k+0.5); nouv.push({la:laDeZ(a.z+uz*dd), lo:loDeX(a.x+ux*dd), ang:an}); }
  }
  if(!nouv.length){ dire('Ces barrières se touchent déjà : aucune barrière à ajouter.'); return; }
  /* tout l'ensemble, rangées d'origine comprises, devient une seule rangée */
  var g=CARTE.nouveauGroupe(), anciens={};
  s.liste.forEach(function(x){ if(x.g) anciens[x.g]=true; });
  CARTE.equip().barrieres.forEach(function(x){ if(s.liste.indexOf(x)>=0 || (x.g && anciens[x.g])) x.g=g; });
  CARTE.ajouterBarrieres(nouv,g);
  var rg=CARTE.equip().barrieres.filter(function(x){ return x.g===g; });
  selectionnerEquip({type:'g', liste:rg, o:rg[0]});
  dire(nouv.length+' barrière'+(nouv.length>1?'s':'')+' ajoutée'+(nouv.length>1?'s':'')+' : l’ensemble forme une rangée de '+rg.length+' barrières. Total : '+bilanTexte());
}
function centreSel(s){
  var sx=0, sz=0, n=0;
  if(s.type==='r') s.o.pts.forEach(function(q){ sx+=pX(q[1]); sz+=pZ(q[0]); n++; });
  else elementsSel(s).forEach(function(b){ sx+=pX(b.lo); sz+=pZ(b.la); n++; });
  return {x:sx/(n||1), z:sz/(n||1)};
}
/* orientation interne : 0° = est, 90° = sud (sens horaire vu du ciel) */
function orientationSel(s){
  s=s||EQ.sel;
  if(!s) return 0;
  if(s.type==='r'){
    var P=s.o.pts, a=Math.atan2(pZ(P[1][0])-pZ(P[0][0]), pX(P[1][1])-pX(P[0][1]))*180/PI;
    return ((Math.round(a)%360)+360)%360;
  }
  var e=elementsSel(s)[0];
  return e ? ((Math.round(e.ang)%360)+360)%360 : 0;
}
/* rotation autour du centre de la sélection */
function tournerSel(delta){
  var s=EQ.sel;
  if(!s || !delta) return;
  var c=centreSel(s), d=delta*PI/180, co=Math.cos(d), si=Math.sin(d);
  function rot(x,z){ var dx=x-c.x, dz=z-c.z; return [c.x+dx*co-dz*si, c.z+dx*si+dz*co]; }
  if(s.type==='r'){
    s.o.pts=s.o.pts.map(function(q){ var r=rot(pX(q[1]),pZ(q[0])); return [laDeZ(r[1]),loDeX(r[0])]; });
  } else {
    elementsSel(s).forEach(function(b){
      if(s.type==='g' || s.type==='m'){ var r=rot(pX(b.lo),pZ(b.la)); b.la=laDeZ(r[1]); b.lo=loDeX(r[0]); }
      b.ang=((Math.round(b.ang+delta)%360)+360)%360;
    });
  }
  CARTE.equipModifie();
}
function deplacerSel(s,dx,dz){
  if(s.type==='r') s.o.pts=s.o.pts.map(function(q){ return [laDeZ(pZ(q[0])+dz), loDeX(pX(q[1])+dx)]; });
  else elementsSel(s).forEach(function(b){ var x=pX(b.lo)+dx, z=pZ(b.la)+dz; b.la=laDeZ(z); b.lo=loDeX(x); });
  CARTE.equipModifie();
}
/* aperçu doré pendant qu'on tire la sélection */
function apercuDeplacement(s,dx,dz){
  initApercu();
  var g=EQ.ghost, n=0;
  if(s.type==='r'){
    var N=s.o._noeuds||[], arr=EQ.ligne.geometry.attributes.position.array, k=0, nb=Math.min(N.length,400);
    for(var j=0;j<nb;j++){
      var x=N[j][0]+dx, z=N[j][1]+dz, j2=j>0?j:1;
      arr[k++]=x; arr[k++]=hauteurSol(x,z)+EQ_HAUT; arr[k++]=z;
      var an=N.length>1 ? Math.atan2(N[j2][1]-N[j2-1][1],N[j2][0]-N[j2-1][0])*180/PI : 0;
      if(n<g.instanceMatrix.count) g.setMatrixAt(n++,matriceBarriere(x,z,an));
    }
    EQ.ligne.geometry.attributes.position.needsUpdate=true;
    EQ.ligne.geometry.setDrawRange(0,nb);
    EQ.ligne.geometry.computeBoundingSphere();
  } else {
    EQ.ligne.geometry.setDrawRange(0,0);
    elementsSel(s).forEach(function(b){ if(n<g.instanceMatrix.count) g.setMatrixAt(n++,matriceBarriere(pX(b.lo)+dx,pZ(b.la)+dz,b.ang)); });
  }
  g.count=n; g.instanceMatrix.needsUpdate=true;
}
function finApercu(){
  if(!EQ.ghost) return;
  EQ.ghost.count=0;
  EQ.ligne.geometry.setDrawRange(0,0);
}
function majSurlignage(){
  initApercu();
  var G=EQ.anneaux;
  while(G.children.length){ var c=G.children.pop(); c.geometry.dispose(); }
  if(!EQ.sel) return;
  if(!EQ.matAnneau) EQ.matAnneau=new THREE.MeshBasicMaterial({color:0xF2B33D, transparent:true, opacity:0.95, depthWrite:false, side:THREE.DoubleSide});
  function anneau(x,z,r){
    var m=new THREE.Mesh(new THREE.RingGeometry(r*0.8,r,32),EQ.matAnneau);
    m.rotation.x=-PI/2; m.position.set(x,hauteurSol(x,z)+0.05,z); m.renderOrder=7;
    G.add(m);
  }
  if(EQ.sel.type==='b') anneau(EQ.sel.o._x,EQ.sel.o._z,1.25);
  else if(EQ.sel.type==='g' || EQ.sel.type==='m') EQ.sel.liste.forEach(function(b){ if(b._x!==undefined) anneau(b._x,b._z,1.15); });
  else (EQ.sel.o._noeuds||[]).forEach(function(n){ anneau(n[0],n[1],0.32); });
}
function selectionnerEquip(t){
  if(SELECTION) deselectionner();
  EQ.sel=t;
  majSurlignage(); majPanneauEquip();
}
function deselectionnerEquip(){
  EQ.sel=null;
  if(EQ.anneaux) majSurlignage();
  majPanneauEquip();
}
function supprimerSelEquip(){
  var s=EQ.sel;
  if(!s) return;
  deselectionnerEquip();
  if(s.type==='b'){ CARTE.supprimerBarriere(s.o); dire('Barrière supprimée, sur la carte aussi.'); }
  else if(s.type==='g'){ CARTE.supprimerBarrieres(s.liste); dire('Rangée de '+s.liste.length+' barrières supprimée, sur la carte aussi.'); }
  else if(s.type==='m'){ CARTE.supprimerBarrieres(s.liste); dire(s.liste.length+' barrières supprimées, sur la carte aussi.'); }
  else { CARTE.supprimerRubalise(s.o); dire('Rubalise supprimée, sur la carte aussi.'); }
}
var _selectionnerU=selectionner;
selectionner=function(o){ if(EQ.sel) deselectionnerEquip(); _selectionnerU(o); };

/* ---------------- modes de pose ---------------- */
function basculerMode(m){
  if(EQ.mode===m){ sortirMode(); return; }
  if(VUE==='jal') sortirVueJal();
  if(SELECTION) deselectionner();
  EQ.sel=null; if(EQ.anneaux) majSurlignage();
  EQ.mode=m; EQ.a=null; EQ.pts=[];
  initApercu();
  majBoutonsEquip();
  majApercu(null);
}
function sortirMode(){
  if(EQ.mode==='rub' && EQ.pts.length>=2) dire('Ligne de rubalise non terminée abandonnée.');
  EQ.mode=null; EQ.a=null; EQ.pts=[];
  majBoutonsEquip();
  majApercu(null);
}
function majBoutonsEquip(){
  var b1=$e('e3-b-bar'), b2=$e('e3-b-rub');
  if(b1) b1.classList.toggle('on',EQ.mode==='bar');
  if(b2) b2.classList.toggle('on',EQ.mode==='rub');
}
function clicPose(p){
  if(EQ.mode==='bar'){
    if(bloquer(p.x,p.z)){ dire('Impossible de poser une barrière dans un bâtiment.'); return; }
    if(!EQ.a){ EQ.a=p; majApercu(p); return; }
    var file=fileBarrieres(EQ.a,p).slice(0,150);
    CARTE.ajouterBarrieres(file.map(function(f){ return {la:laDeZ(f.z), lo:loDeX(f.x), ang:f.ang}; }));
    EQ.a=null;
    majApercu(p);
    dire(file.length+' barrière'+(file.length>1?'s':'')+' posée'+(file.length>1?'s':'')+'. Total : '+bilanTexte());
  } else if(EQ.mode==='rub'){
    var d=EQ.pts.length ? EQ.pts[EQ.pts.length-1] : null;
    if(d && Math.hypot(d[0]-p.x,d[1]-p.z)<0.3) return;
    EQ.pts.push([p.x,p.z]);
    majApercu(p);
  }
}
function terminerRubalise(){
  if(EQ.pts.length<2){ dire('Il faut au moins deux points pour tendre une rubalise.'); return; }
  var L=longueurPts(EQ.pts);
  CARTE.ajouterRubalise(EQ.pts.map(function(q){ return [laDeZ(q[1]),loDeX(q[0])]; }));
  EQ.pts=[];
  majApercu(null);
  dire('Rubalise de '+L+' m posée. Total : '+bilanTexte());
}
function annulerEtapeEquip(){
  if(EQ.mode==='bar' && EQ.a){ EQ.a=null; majApercu(EQ.dernierP); return; }
  if(EQ.mode==='rub' && EQ.pts.length){ EQ.pts=[]; majApercu(EQ.dernierP); dire('Ligne en cours annulée.'); return; }
  sortirMode();
}

/* ---------------- tracé masquable ---------------- */
function appliquerTrace(){
  if(typeof groupeParcours!=='undefined' && groupeParcours) groupeParcours.visible=TRACE_VISIBLE;
  if(typeof groupePois!=='undefined' && groupePois) groupePois.visible=TRACE_VISIBLE;
  var b=$e('e3-b-trace');
  if(b){ b.classList.toggle('on',!TRACE_VISIBLE); b.textContent=TRACE_VISIBLE?'👁 Tracé visible':'🙈 Tracé masqué'; }
  var ec=$e('e3-ecart');
  if(ec && ec.parentNode) ec.parentNode.style.display=TRACE_VISIBLE?'':'none';
}
var _reconstruireParcoursU=reconstruireParcours;
reconstruireParcours=function(){ _reconstruireParcoursU(); appliquerTrace(); };
var _poisU=construirePoisCarte;
construirePoisCarte=function(){ _poisU(); appliquerTrace(); };
function sansTrace(fn){
  if(TRACE_VISIBLE) return fn();
  var t=TRACE;
  TRACE=[];
  try{ return fn(); } finally { TRACE=t; }
}
function equipSurMini(){
  if(!window.CARTE || !CARTE.equip || !joueur) return;
  var c=$e('e3-mini'), g=c.getContext('2d'), S=220, ech=S/(MINIR*2), E=CARTE.equip();
  if(!E.barrieres.length && !E.rubalises.length) return;
  function PX(x){ return S/2+(x-J.x)*ech; }
  function PZ(z){ return S/2+(z-J.z)*ech; }
  g.save(); g.beginPath(); g.arc(S/2,S/2,S/2-2,0,7); g.clip();
  g.lineCap='round';
  g.strokeStyle='#ff4136'; g.lineWidth=1.8; g.setLineDash([3,2]);
  E.rubalises.forEach(function(r){
    var N=r._noeuds; if(!N) return;
    g.beginPath();
    N.forEach(function(n,i){ if(i) g.lineTo(PX(n[0]),PZ(n[1])); else g.moveTo(PX(n[0]),PZ(n[1])); });
    g.stroke();
  });
  g.setLineDash([]); g.strokeStyle='#e8edf5'; g.lineWidth=2.4;
  var demi=Math.max(1,3/ech);
  E.barrieres.concat(EQ.ancrages||[]).forEach(function(b){
    if(b._x===undefined) return;
    var a=b.ang*PI/180, ux=Math.cos(a)*demi, uz=Math.sin(a)*demi;
    g.beginPath(); g.moveTo(PX(b._x-ux),PZ(b._z-uz)); g.lineTo(PX(b._x+ux),PZ(b._z+uz)); g.stroke();
  });
  g.restore();
}
var _miniU=dessinerMini;
dessinerMini=function(){ sansTrace(_miniU); equipSurMini(); };
var _gmU=dessinerGM;
dessinerGM=function(){ sansTrace(_gmU); };

/* ---------------- branchements ---------------- */
function brancherEquip(){
  var vue=$e('e3-vue'), bas=null;
  vue.addEventListener('pointerdown',function(e){
    if(e.button===2 && EQ.mode){ e.preventDefault(); annulerEtapeEquip(); e.stopImmediatePropagation(); return; }
    if(e.button!==0) return;
    bas={x:e.clientX, y:e.clientY, id:e.pointerId};
    /* en pose, un clic sur un jalonneur pose quand même au sol au lieu de le déplacer */
    if(EQ.mode && VUE!=='jal' && viser(e)){ e.stopImmediatePropagation(); return; }
    if(EQ.mode || VUE==='jal' || viser(e)) return;
    var hit=viserEquip(e);
    if(!hit) return;
    if((e.ctrlKey || e.shiftKey || e.metaKey) && hit.type==='b'){
      basculerMulti(hit.o);
      bas=null; e.stopImmediatePropagation();
      return;
    }
    /* une barrière de la rangée ou de la sélection multiple entraîne tout l'ensemble */
    if(hit.type==='b' && EQ.sel && (EQ.sel.type==='g' || EQ.sel.type==='m') && EQ.sel.liste.indexOf(hit.o)>=0) hit=EQ.sel;
    if(hit.type===(EQ.sel&&EQ.sel.type) && hit.o===EQ.sel.o) hit=EQ.sel;
    /* on saisit l'élément par son centre : il suit le curseur, comme un jalonneur */
    EQ.drag={s:hit, x0:e.clientX, y0:e.clientY, id:e.pointerId, c:centreSel(hit), p:null, bouge:false, t:0};
    bas=null;
    try{ vue.setPointerCapture(e.pointerId); }catch(er){}
    e.stopImmediatePropagation();
  },true);
  vue.addEventListener('contextmenu',function(e){ if(EQ.mode || EQ.sel) e.preventDefault(); });
  vue.addEventListener('pointermove',function(e){
    var D=EQ.drag;
    if(D && D.id===e.pointerId){
      e.stopImmediatePropagation();
      if(!D.bouge && Math.hypot(e.clientX-D.x0,e.clientY-D.y0)<5) return;
      if(!D.bouge){ D.bouge=true; if(EQ.sel!==D.s) selectionnerEquip(D.s); }
      vue.style.cursor='grabbing';
      var t=performance.now();
      if(t-D.t<35) return;
      D.t=t;
      var q=solSousPointeur(e);
      if(!q) return;
      D.p=q;
      apercuDeplacement(D.s,q.x-D.c.x,q.z-D.c.z);
      return;
    }
    if(!EQ.mode || VUE==='jal') return;
    var now=performance.now();
    if(now-EQ.tm<45) return;
    EQ.tm=now;
    var p=solSousPointeur(e);
    EQ.dernierP=p;
    majApercu(p);
  },true);
  function finDrag(e){
    var D=EQ.drag;
    if(!D || D.id!==e.pointerId) return false;
    EQ.drag=null;
    vue.style.cursor='';
    finApercu();
    if(D.bouge && D.p){
      var dx=D.p.x-D.c.x, dz=D.p.z-D.c.z, L=Math.hypot(dx,dz);
      if(L>0.05 && e.type==='pointerup'){
        deplacerSel(D.s,dx,dz);
        selectionnerEquip(D.s);
        dire((D.s.type==='r'?'Rubalise déplacée':(D.s.type==='g'?'Rangée déplacée':(D.s.type==='m'?'Barrières déplacées':'Barrière déplacée')))+' de '+L.toFixed(1).replace('.',',')+' m. La carte est déjà à jour.');
      }
    } else if(e.type==='pointerup') selectionnerEquip(D.s);
    return true;
  }
  vue.addEventListener('pointercancel',function(e){ finDrag(e); },true);
  vue.addEventListener('pointerup',function(e){
    if(finDrag(e)){ e.stopImmediatePropagation(); return; }
    if(!bas || bas.id!==e.pointerId) return;
    var clic=Math.hypot(e.clientX-bas.x,e.clientY-bas.y)<5;
    bas=null;
    if(!clic || VUE==='jal') return;
    if(EQ.mode){ var p=solSousPointeur(e); if(p) clicPose(p); return; }
    if(viser(e)) return;
    if(EQ.sel) deselectionnerEquip();
  },true);
  vue.addEventListener('dblclick',function(e){
    if(EQ.mode==='rub'){ terminerRubalise(); return; }
    if(EQ.mode || VUE==='jal') return;
    var hit=viserEquip(e);
    if(hit && hit.type==='b'){
      var rg=rangeeDe(hit.o);
      if(rg){ selectionnerEquip({type:'g', liste:rg, o:hit.o}); dire('Rangée de '+rg.length+' barrières sélectionnée : tire-la pour la déplacer.'); }
    }
  });
  addEventListener('keydown',function(e){
    if(!ouvert) return;
    var tg=e.target;
    if(tg && ((tg.tagName==='INPUT' && tg.type!=='range') || tg.tagName==='TEXTAREA' || tg.tagName==='SELECT')) return;
    var k=e.key;
    if(EQ.mode){
      if(k==='Escape'){ annulerEtapeEquip(); e.preventDefault(); e.stopImmediatePropagation(); }
      else if(k==='Enter' && EQ.mode==='rub'){ terminerRubalise(); e.preventDefault(); e.stopImmediatePropagation(); }
      else if(k==='Backspace' && EQ.mode==='rub'){ EQ.pts.pop(); majApercu(EQ.dernierP); e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    if(EQ.sel){
      if(k==='Escape'){ deselectionnerEquip(); e.preventDefault(); e.stopImmediatePropagation(); }
      else if(k==='Delete' || k==='Backspace'){ supprimerSelEquip(); e.preventDefault(); e.stopImmediatePropagation(); }
    }
  },true);
}
var _brancherU=brancherInterface;
brancherInterface=function(){
  _brancherU();
  var barre=document.querySelector('#e3 .e3-barre'), aide=$e('e3-aide');
  function bouton(id,txt,titre,fn){
    if($e(id)) return;
    var b=document.createElement('button');
    b.id=id; b.type='button'; b.textContent=txt; b.title=titre;
    b.onclick=function(){ fn(); b.blur(); };
    barre.insertBefore(b,aide);
  }
  if(barre){
    bouton('e3-b-bar','🚧 Barrières','Poser des barrières municipales : file de barrières de 2 m bout à bout',function(){ basculerMode('bar'); });
    bouton('e3-b-rub','〰 Rubalise','Tendre de la rubalise rouge et blanche, nouée sur une barrière tous les 10 m au plus',function(){ basculerMode('rub'); });
    bouton('e3-b-trace','','Afficher ou masquer le tracé (3D, minicarte et carte globale)',function(){
      TRACE_VISIBLE=!TRACE_VISIBLE;
      try{ localStorage.setItem('corrida3d-trace',TRACE_VISIBLE?'1':'0'); }catch(er){}
      appliquerTrace();
      dire(TRACE_VISIBLE ? 'Tracé affiché.' : 'Tracé masqué : le parcours se suit aux jalonneurs, barrières et rubalise.');
    });
  }
  var ch=document.querySelector('#e3 .e3-chiffres');
  if(ch && !$e('e3-mat')){
    var d=document.createElement('div');
    d.className='e3-ch';
    d.innerHTML='<i>Matériel posé</i><b id="e3-mat">0</b><em> barr. · <span id="e3-matm">0</span> m rubalise</em>';
    ch.appendChild(d);
  }
  var boite=document.querySelector('#e3-aidem .e3-boite'), credit=boite && boite.querySelector('.e3-credit');
  if(boite && !$e('e3-aide-equip')){
    var h=document.createElement('h3'); h.id='e3-aide-equip'; h.textContent='Barrières et rubalise';
    var p=document.createElement('p');
    p.innerHTML='<b>🚧 Barrières</b> : clique le début puis la fin d’une file, les barrières de 2 m se posent bout à bout. '+
      '<b>〰 Rubalise</b> : clique chaque point d’accroche, Entrée ou double-clic pour terminer. '+
      'Clique ensuite sur une barrière (double-clic : toute la rangée) ou une rubalise pour l’orienter ou la supprimer, et tire-la dans la scène pour la déplacer. '+
      'Ctrl+clic sur plusieurs barrières pour les sélectionner ensemble, puis <b>Relier</b> par de la rubalise ou par des barrières. Le matériel posé est compté en haut à gauche et dans le panneau de la carte. '+
      '<b>Tracé masqué</b> : le tracé disparaît de la 3D et des cartes pour faire dérouler le parcours à quelqu’un qui ne le connaît pas.';
    boite.insertBefore(h,credit); boite.insertBefore(p,credit);
  }
  brancherEquip();
  appliquerTrace();
  majCompteurEquip();
};

/* ---------------- synchronisation avec la carte ---------------- */
var _signalerU=window.ESPACE3D.signaler;
window.ESPACE3D.signaler=function(t){
  if(t==='equip'){
    if(construit && ouvert) reconstruireEquip();
    else if(construit) EQ.sale=true;
    return;
  }
  _signalerU(t);
};
var _synchroniserU=synchroniser;
synchroniser=function(force){
  _synchroniserU(force);
  if(construit && (force || EQ.sale)){ EQ.sale=false; reconstruireEquip(); }
};
ETAPES.forEach(function(e,i){
  if(e[1]===etapeParcours) ETAPES.splice(i+1,0,['Barrières et rubalise',function(){ reconstruireEquip(); appliquerTrace(); }]);
});
/* =================================================================
   Barrières posées sur la surface réellement dessinée (bordures,
   trottoirs, pentes), sélection plus facile (zones de clic élargies,
   survol), Ctrl+Z dans la 3D et affichage des autres parcours
   (A, B, C…) dans leur couleur.
================================================================= */

/* ---------------- hauteur réelle des surfaces du sol ---------------- */
var GRILLE_SOL=4, CACHE_BARR={}, NB_CACHE_BARR=0, IDX_MORC={n:-1, g:null};
function cleSol(gx,gz){ return (gx+4000)*8192+(gz+4000); }
function indexerMorceauSol(m){
  var g=m.geometry, pos=g.attributes.position, idx=g.index, n=idx?idx.count:pos.count, a=pos.array, G={}, t;
  for(t=0;t+2<n;t+=3){
    var i0=idx?idx.getX(t):t, i1=idx?idx.getX(t+1):t+1, i2=idx?idx.getX(t+2):t+2;
    var x0=a[i0*3], z0=a[i0*3+2], x1=a[i1*3], z1=a[i1*3+2], x2=a[i2*3], z2=a[i2*3+2];
    var gx0=Math.floor(Math.min(x0,x1,x2)/GRILLE_SOL), gx1=Math.floor(Math.max(x0,x1,x2)/GRILLE_SOL);
    var gz0=Math.floor(Math.min(z0,z1,z2)/GRILLE_SOL), gz1=Math.floor(Math.max(z0,z1,z2)/GRILLE_SOL);
    if(gx1-gx0>60 || gz1-gz0>60) continue;
    for(var gx=gx0;gx<=gx1;gx++) for(var gz=gz0;gz<=gz1;gz++){
      var k=cleSol(gx,gz);
      (G[k]||(G[k]=[])).push(i0,i1,i2);
    }
  }
  return G;
}
/* morceaux de sol (non porteurs d'ombre) rangés par carrés de 64 m */
function morceauxProches(x,z){
  var L=PERF.morceaux;
  if(IDX_MORC.n!==L.length){
    var G={};
    L.forEach(function(o){
      if(o.porte || !o.m || !o.m.geometry || o.m.material===MAT.eau) return;
      var r=o.r+1;
      for(var gx=Math.floor((o.x-r)/64);gx<=Math.floor((o.x+r)/64);gx++)
        for(var gz=Math.floor((o.z-r)/64);gz<=Math.floor((o.z+r)/64);gz++){
          var k=cleSol(gx,gz);
          (G[k]||(G[k]=[])).push(o);
        }
    });
    IDX_MORC={n:L.length, g:G};
  }
  return IDX_MORC.g[cleSol(Math.floor(x/64),Math.floor(z/64))]||[];
}
function yTriangle(a,i0,i1,i2,x,z){
  var x0=a[i0*3], y0=a[i0*3+1], z0=a[i0*3+2], x1=a[i1*3], y1=a[i1*3+1], z1=a[i1*3+2], x2=a[i2*3], y2=a[i2*3+1], z2=a[i2*3+2];
  var d=(z1-z2)*(x0-x2)+(x2-x1)*(z0-z2);
  if(Math.abs(d)<1e-7) return null;
  var l0=((z1-z2)*(x-x2)+(x2-x1)*(z-z2))/d, l1=((z2-z0)*(x-x2)+(x0-x2)*(z-z2))/d, l2=1-l0-l1;
  if(l0<-1e-4 || l1<-1e-4 || l2<-1e-4) return null;
  return l0*y0+l1*y1+l2*y2;
}
/* plus haute surface de sol dessinée au point (x, z), null s'il n'y en a pas */
function solReel(x,z){
  if(typeof PERF==='undefined' || !PERF.morceaux) return null;
  var h0=hauteur(x,z), best=-1e9, L=morceauxProches(x,z), k=cleSol(Math.floor(x/GRILLE_SOL),Math.floor(z/GRILLE_SOL));
  for(var i=0;i<L.length;i++){
    var m=L[i].m;
    if(!m.userData.grilleSol) m.userData.grilleSol=indexerMorceauSol(m);
    var T=m.userData.grilleSol[k];
    if(!T) continue;
    var a=m.geometry.attributes.position.array;
    for(var j=0;j<T.length;j+=3){
      var y=yTriangle(a,T[j],T[j+1],T[j+2],x,z);
      if(y!==null && y>best && y<h0+1.6) best=y;
    }
  }
  return best>-1e8 ? best : null;
}
/* une barrière repose sur le point le plus haut sous ses pieds */
function hauteurBarriere(x,z,ang){
  var cle=x.toFixed(2)+','+z.toFixed(2)+','+Math.round(ang);
  var c=CACHE_BARR[cle];
  if(c!==undefined) return c;
  var an=ang*PI/180, ux=Math.cos(an), uz=Math.sin(an), vx=-uz, vz=ux, best=-1e9, trouve=false;
  var P=[[0,0],[0.95,0],[-0.95,0],[0.84,0.38],[0.84,-0.38],[-0.84,0.38],[-0.84,-0.38]];
  for(var i=0;i<P.length;i++){
    var px=x+ux*P[i][0]+vx*P[i][1], pz=z+uz*P[i][0]+vz*P[i][1], y=solReel(px,pz);
    if(y===null) y=hauteur(px,pz)+0.04; else trouve=true;
    if(y>best) best=y;
  }
  if(!trouve) best=Math.max(best,hauteurSol(x,z)-0.02);
  best-=0.01;
  if(NB_CACHE_BARR>30000){ CACHE_BARR={}; NB_CACHE_BARR=0; }
  CACHE_BARR[cle]=best; NB_CACHE_BARR++;
  return best;
}
matriceBarriere=function(x,z,ang){
  _qE.setFromAxisAngle(_yE,-ang*PI/180);
  _pE.set(x,hauteurBarriere(x,z,ang),z);
  return _mE.compose(_pE,_qE,_sE);
};
/* la rubalise reste nouée à la lisse haute de ses barrières, quelle que soit leur hauteur */
var _construireRubalisesW=construireRubalises;
construireRubalises=function(){
  var H={}, E=CARTE.equip(), ancien=hauteurSol;
  E.barrieres.concat(EQ.ancrages||[]).forEach(function(b){
    if(b._x!==undefined) H[b._x.toFixed(2)+','+b._z.toFixed(2)]=hauteurBarriere(b._x,b._z,b.ang)+0.02;
  });
  hauteurSol=function(x,z,e){
    var h=H[x.toFixed(2)+','+z.toFixed(2)];
    if(h!==undefined) return h;
    var r=solReel(x,z);
    return r!==null ? r : ancien(x,z,e);
  };
  try{ _construireRubalisesW(); } finally { hauteurSol=ancien; }
};

/* ---------------- zones de clic élargies ---------------- */
var PROX={bar:null, rub:null, rubRef:[], mat:null, geoBar:null, geoRub:null};
var _mW=new THREE.Matrix4(), _qW=new THREE.Quaternion(), _pW=new THREE.Vector3(), _sW=new THREE.Vector3();
function construireZonesClic(){
  if(PROX.bar){ monde.remove(PROX.bar); PROX.bar.dispose(); PROX.bar=null; }
  if(PROX.rub){ monde.remove(PROX.rub); PROX.rub.dispose(); PROX.rub=null; }
  PROX.rubRef=[];
  if(!window.CARTE || !CARTE.equip) return;
  if(!PROX.mat){
    PROX.mat=new THREE.MeshBasicMaterial({color:0xffffff});
    PROX.geoBar=new THREE.BoxGeometry(2.35,1.45,1.05); PROX.geoBar.translate(0,0.72,0);
    PROX.geoRub=new THREE.BoxGeometry(1,0.7,0.75);
  }
  var E=CARTE.equip(), T=E.barrieres.concat(EQ.ancrages||[]);
  if(T.length){
    var ib=new THREE.InstancedMesh(PROX.geoBar,PROX.mat,T.length);
    T.forEach(function(b,i){ ib.setMatrixAt(i,matriceBarriere(b._x,b._z,b.ang)); });
    ib.visible=false; ib.computeBoundingSphere();
    monde.add(ib); PROX.bar=ib;
  }
  var segs=[];
  E.rubalises.forEach(function(r){
    var N=r._noeuds||[];
    for(var i=1;i<N.length;i++) segs.push([N[i-1],N[i],r]);
  });
  if(segs.length){
    var ir=new THREE.InstancedMesh(PROX.geoRub,PROX.mat,segs.length);
    segs.forEach(function(s,i){
      var a=s[0], b=s[1], dx=b[0]-a[0], dz=b[1]-a[1], L=Math.max(0.2,Math.hypot(dx,dz));
      var mx=(a[0]+b[0])/2, mz=(a[1]+b[1])/2, y=solReel(mx,mz);
      if(y===null) y=hauteurSol(mx,mz);
      _qW.setFromAxisAngle(_yE,-Math.atan2(dz,dx));
      _pW.set(mx,y+EQ_HAUT-0.05,mz); _sW.set(L,1,1);
      ir.setMatrixAt(i,_mW.compose(_pW,_qW,_sW));
      PROX.rubRef.push(s[2]);
    });
    ir.visible=false; ir.computeBoundingSphere();
    monde.add(ir); PROX.rub=ir;
  }
}
var _reconstruireEquipW=reconstruireEquip;
reconstruireEquip=function(){
  _reconstruireEquipW();
  if(!window.CARTE || !CARTE.equip || !scene) return;
  construireZonesClic();
  majSurvol(null);
};
function selDepuisInstance(id){
  var L=CARTE.equip().barrieres;
  if(id<L.length) return {type:'b', o:L[id]};
  var a=(EQ.ancrages||[])[id-L.length], r=a && rubaliseDeAncrage(a);
  return r ? {type:'r', o:r} : null;
}
/* visée au rayon seulement : le modèle d'abord, puis les zones élargies */
function viserEquipRayon(ev){
  if(!window.CARTE || !CARTE.equip) return null;
  raycaster.setFromCamera(ndc(ev),camera);
  var h, s;
  if(EQ.imBar){
    h=raycaster.intersectObject(EQ.imBar,false);
    if(h.length && h[0].instanceId!==undefined && (s=selDepuisInstance(h[0].instanceId))) return s;
  }
  var obj=[];
  if(PROX.bar) obj.push(PROX.bar);
  if(PROX.rub) obj.push(PROX.rub);
  if(!obj.length) return null;
  h=raycaster.intersectObjects(obj,false);
  for(var i=0;i<h.length;i++){
    if(h[i].instanceId===undefined) continue;
    if(h[i].object===PROX.bar){ s=selDepuisInstance(h[i].instanceId); if(s) return s; }
    else { var r=PROX.rubRef[h[i].instanceId]; if(r) return {type:'r', o:r}; }
  }
  return null;
}
viserEquip=function(ev){
  var s=viserEquipRayon(ev);
  if(s) return s;
  var p=solSousPointeur(ev);
  return p ? trouverEquip(p) : null;
};

/* ---------------- survol : anneau blanc sous ce qui serait saisi ---------------- */
var SURVOL={g:null, o:null, mat:null, geo:null, t:0, curseur:false};
function majSurvol(h){
  var o=h ? h.o : null;
  if(o===SURVOL.o) return;
  SURVOL.o=o;
  if(!SURVOL.g){
    if(!o) return;
    SURVOL.g=new THREE.Group(); monde.add(SURVOL.g);
    SURVOL.mat=new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.6, depthWrite:false, depthTest:false, side:THREE.DoubleSide});
    SURVOL.geo=new THREE.RingGeometry(0.78,1,32);
  }
  var G=SURVOL.g;
  while(G.children.length) G.remove(G.children[G.children.length-1]);
  if(!o) return;
  function anneau(x,z,r){
    var y=solReel(x,z); if(y===null) y=hauteurSol(x,z);
    var m=new THREE.Mesh(SURVOL.geo,SURVOL.mat);
    m.rotation.x=-PI/2; m.scale.set(r,r,r); m.position.set(x,y+0.06,z); m.renderOrder=8;
    G.add(m);
  }
  var liste;
  if(h.type==='b'){
    /* dans une sélection multiple ou une rangée sélectionnée, tout l'ensemble suivra */
    if(EQ.sel && (EQ.sel.type==='g' || EQ.sel.type==='m') && EQ.sel.liste.indexOf(o)>=0) liste=EQ.sel.liste;
    else liste=[o];
    liste.forEach(function(b){ if(b._x!==undefined) anneau(b._x,b._z,1.3); });
  } else {
    var N=o._noeuds||[], pas=Math.max(1,Math.ceil(N.length/80));
    for(var i=0;i<N.length;i+=pas) anneau(N[i][0],N[i][1],0.4);
  }
}

/* ---------------- Ctrl+Z / Ctrl+Y dans la 3D ---------------- */
function annuler3D(refaire){
  if(!window.CARTE || !CARTE.annulerEquip) return;
  if(!refaire && EQ.mode==='rub' && EQ.pts.length){ EQ.pts.pop(); majApercu(EQ.dernierP); dire('Dernier point de rubalise retiré.'); return; }
  if(!refaire && EQ.mode==='bar' && EQ.a){ EQ.a=null; majApercu(EQ.dernierP); dire('Début de file annulé.'); return; }
  if(VUE==='jal') sortirVueJal();
  if(SELECTION) deselectionner();
  if(EQ.sel) deselectionnerEquip();
  majSurvol(null);
  var ok=refaire ? CARTE.retablirEquip() : CARTE.annulerEquip();
  if(refaire) dire(ok ? 'Rétabli.' : 'Rien à rétablir.');
  else dire(ok ? 'Annulé. Ctrl+Y pour rétablir.' : 'Rien à annuler pour les jalonneurs, barrières et rubalise.');
}

/* ---------------- autres parcours en pointillés de leur couleur ---------------- */
var AUTRES=null, MAT_AUTRES=null, AUTRES_MINI=[];
function couleurParcours(){
  try{ return (window.CARTE && CARTE.parcoursActif) ? CARTE.parcoursActif().couleur : '#F2B33D'; }catch(e){ return '#F2B33D'; }
}
function teinterTrace(){
  if(!MAT.trace) return;
  var c=couleurParcours();
  if(String(c).toUpperCase()==='#F2B33D') return;
  MAT.trace.emissive=new THREE.Color(c).multiplyScalar(0.24);
}
function construireAutresParcours(){
  if(AUTRES){ monde.remove(AUTRES); liberer(AUTRES); AUTRES=null; }
  AUTRES_MINI=[];
  if(!window.CARTE || !CARTE.autresParcours) return;
  var L=CARTE.autresParcours();
  if(!L.length) return;
  if(!MAT_AUTRES) MAT_AUTRES=new THREE.MeshBasicMaterial({vertexColors:true, transparent:true, opacity:0.9, depthWrite:false,
        polygonOffset:true, polygonOffsetFactor:-5, polygonOffsetUnits:-5});
  AUTRES=new THREE.Group();
  L.forEach(function(p){
    var pts=[];
    p.trace.forEach(function(q){
      var x=pX(q[1]), z=pZ(q[0]), m=pts.length;
      if(m && Math.hypot(x-pts[m-2],z-pts[m-1])<0.3) return;
      pts.push(x,z);
    });
    if(pts.length<4) return;
    var q=densifier(pts,1), X_=q.x, Z_=q.z, d=0, cur=[], tas=new Tas(16384), c=teinte(p.couleur), mini=[], i;
    for(i=0;i<X_.length;i++){
      if(i) d+=Math.hypot(X_[i]-X_[i-1],Z_[i]-Z_[i-1]);
      if(i%4===0) mini.push(X_[i],Z_[i]);
      if(d%10<6) cur.push(X_[i],Z_[i]);
      else { if(cur.length>=4) ruban(tas,cur,0.8,c,0.2,2,4); cur=[]; }
    }
    if(cur.length>=4) ruban(tas,cur,0.8,c,0.2,2,4);
    AUTRES_MINI.push({couleur:p.couleur, pts:mini});
    if(!tas.vide()){ var me=new THREE.Mesh(tas.geo(),MAT_AUTRES); me.renderOrder=2; AUTRES.add(me); }
  });
  monde.add(AUTRES);
  AUTRES.visible=TRACE_VISIBLE;
}
var _reconstruireParcoursW=reconstruireParcours;
reconstruireParcours=function(){
  COL.trace=teinte(couleurParcours());
  _reconstruireParcoursW();
  teinterTrace();
  construireAutresParcours();
};
var _appliquerCielW=appliquerCiel;
appliquerCiel=function(){ var r=_appliquerCielW.apply(this,arguments); teinterTrace(); return r; };
var _appliquerTraceW=appliquerTrace;
appliquerTrace=function(){ _appliquerTraceW(); if(AUTRES) AUTRES.visible=TRACE_VISIBLE; };
var _miniW=dessinerMini;
dessinerMini=function(){
  _miniW();
  if(!TRACE_VISIBLE || !AUTRES_MINI.length || !joueur) return;
  var cv=$e('e3-mini'), g=cv.getContext('2d'), S=220, ech=S/(MINIR*2);
  g.save(); g.beginPath(); g.arc(S/2,S/2,S/2-2,0,7); g.clip();
  g.lineWidth=2.2; g.setLineDash([]); g.lineCap='round';
  AUTRES_MINI.forEach(function(p){
    var P=p.pts;
    g.strokeStyle=p.couleur; g.beginPath();
    for(var i=0;i<P.length;i+=2){
      var x=S/2+(P[i]-J.x)*ech, y=S/2+(P[i+1]-J.z)*ech;
      if(i) g.lineTo(x,y); else g.moveTo(x,y);
    }
    g.stroke();
  });
  g.restore();
};
/* changement de parcours, ou case cochée : le tracé, ses jalonneurs et son matériel sont rechargés */
var _signalerW=window.ESPACE3D.signaler;
window.ESPACE3D.signaler=function(t){ _signalerW(t==='parcours' ? 'route' : t); };

/* ---------------- branchements ---------------- */
function brancherW(){
  var vue=$e('e3-vue');
  vue.addEventListener('pointermove',function(e){
    if(EQ.drag || EQ.mode || VUE==='jal' || e.buttons || e.pointerType==='touch'){
      if(SURVOL.o && !EQ.drag) majSurvol(null);
      return;
    }
    var t=performance.now();
    if(t-SURVOL.t<70) return;
    SURVOL.t=t;
    var h=viser(e) ? null : viserEquipRayon(e);
    majSurvol(h);
    if(h){ vue.style.cursor='grab'; SURVOL.curseur=true; }
    else if(SURVOL.curseur){ vue.style.cursor=''; SURVOL.curseur=false; }
  });
  vue.addEventListener('pointerleave',function(){
    majSurvol(null);
    if(SURVOL.curseur){ vue.style.cursor=''; SURVOL.curseur=false; }
  });
  addEventListener('keydown',function(e){
    if(!ouvert || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    var tg=e.target;
    if(tg && ((tg.tagName==='INPUT' && tg.type!=='range') || tg.tagName==='TEXTAREA')) return;
    var k=e.key.toLowerCase();
    if(k!=='z' && k!=='y') return;
    e.preventDefault(); e.stopImmediatePropagation();
    annuler3D(k==='y' || e.shiftKey);
  },true);
  var h=$e('e3-aide-equip'), p=h && h.nextSibling;
  if(p && p.innerHTML.indexOf('Ctrl+Z')<0)
    p.innerHTML+=' Survole un élément : un anneau blanc montre ce que tu vas saisir. <b>Ctrl+Z</b> annule la dernière modification des jalonneurs, barrières et rubalise, <b>Ctrl+Y</b> la rétablit.';
}
var _brancherW=brancherInterface;
brancherInterface=function(){ _brancherW(); brancherW(); };
/* =================================================================
   Topographie fine : relief IGN RGE ALTI tous les 5 m, niveau réel
   de la Sèvre Niortaise et des ruisseaux (lit creusé sous l'eau),
   tabliers des ponts au-dessus de l'eau.
================================================================= */
var TOPO={eau:[], lignes:[], ponts:[], seuils:[], murs:[], masque:null, idxL:null, idxP:null, brut:null, niv:null};

function lireTopo(){
  (texteBrut('d-topo')||'').split('\n').forEach(function(l){
    var c=l.split('\t');
    if(c.length<5 || !c[4]) return;
    var p=pointsDe(c[4]);
    if(c[0]==='MP') TOPO.eau.push({role:c[1], p:p});
    else if(c[0]==='RIV' || c[0]==='STR') TOPO.lignes.push({k:c[0], nom:c[3], p:p, larg:(+c[2])||(c[0]==='RIV'?(c[3].indexOf('Sèvre')>=0?14:6):2.6)});
    else if(c[0]==='PONT') TOPO.ponts.push({hw:c[1], nom:c[3], p:p});
    else if(c[0]==='WEIR') TOPO.seuils.push({nom:c[3], p:p});
    else if(c[0]==='MUR') TOPO.murs.push({p:p});
  });
}
/* anneaux : raccorde les tronçons de contour par leurs extrémités */
function anneaux(liste){
  var R=[], reste=liste.map(function(m){ return m.p.slice(); });
  while(reste.length){
    var a=reste.shift(), boucle=0;
    while(!(a[0]===a[a.length-2] && a[1]===a[a.length-1]) && reste.length && boucle<5000){
      boucle++;
      var ex=a[a.length-2], ez=a[a.length-1], k=-1, inv=false;
      for(var i=0;i<reste.length;i++){
        var b=reste[i];
        if(Math.hypot(b[0]-ex,b[1]-ez)<0.5){ k=i; break; }
        if(Math.hypot(b[b.length-2]-ex,b[b.length-1]-ez)<0.5){ k=i; inv=true; break; }
      }
      if(k<0) break;
      var s=reste.splice(k,1)[0];
      if(inv){ var q=[]; for(var j=s.length-2;j>=0;j-=2) q.push(s[j],s[j+1]); s=q; }
      a=a.concat(s.slice(2));
    }
    if(a.length>=8) R.push(a);
  }
  return R;
}

/* ---------------- grille fine ---------------- */
function gBrut(i,j){
  if(i<0)i=0; else if(i>GROWS-1)i=GROWS-1;
  if(j<0)j=0; else if(j>GCOLS-1)j=GCOLS-1;
  return TOPO.brut[i*GCOLS+j];
}
/* plus basse altitude brute autour d'un point (fond de vallée, surface de l'eau pour l'IGN) */
function minBrut(x,z,r){
  var jc=(x-XMIN)/PASX, ic=(ZMAX-z)/PASZ, m=1e9, n=Math.ceil(r/PASX);
  for(var i=Math.floor(ic)-n+1;i<=Math.floor(ic)+n;i++) for(var j=Math.floor(jc)-n+1;j<=Math.floor(jc)+n;j++){
    var v=gBrut(i,j); if(v<m) m=v;
  }
  return m;
}
/* remplit les nœuds de la grille à l'intérieur de contours (pair-impair : les îles restent) */
function remplirContours(rings,fn){
  var z0=1e9, z1=-1e9;
  rings.forEach(function(p){ for(var k=1;k<p.length;k+=2){ if(p[k]<z0)z0=p[k]; if(p[k]>z1)z1=p[k]; } });
  var i0=Math.max(0,Math.floor((ZMAX-z1)/PASZ)), i1=Math.min(GROWS-1,Math.ceil((ZMAX-z0)/PASZ));
  for(var i=i0;i<=i1;i++){
    var z=ZMAX-i*PASZ, xs=[];
    rings.forEach(function(p){
      var n=p.length/2;
      for(var a=0;a<n;a++){
        var b=(a+1)%n, za=p[a*2+1], zb=p[b*2+1];
        if((za>z)!==(zb>z)) xs.push(p[a*2]+(z-za)/(zb-za)*(p[b*2]-p[a*2]));
      }
    });
    xs.sort(function(u,v){ return u-v; });
    for(var s=0;s+1<xs.length;s+=2){
      var j0=Math.max(0,Math.ceil((xs[s]-XMIN)/PASX)), j1=Math.min(GCOLS-1,Math.floor((xs[s+1]-XMIN)/PASX));
      for(var j=j0;j<=j1;j++) fn(i,j);
    }
  }
}

/* ---------------- niveau de l'eau le long des cours d'eau ---------------- */
function preparerNiveaux(){
  TOPO.idxL={};
  TOPO.lignes.forEach(function(L,li){
    var q=densifier(L.p,4), n=q.x.length, niv=new Float32Array(n), i;
    for(i=0;i<n;i++) niv[i]=minBrut(q.x[i],q.z[i],Math.max(6,L.larg*0.6));
    /* OSM trace les cours d'eau vers l'aval : le niveau ne remonte jamais */
    for(i=1;i<n;i++) if(niv[i]>niv[i-1]) niv[i]=niv[i-1];
    var lis=new Float32Array(n);
    for(i=0;i<n;i++){ var s=0, c=0; for(var k=Math.max(0,i-3);k<=Math.min(n-1,i+3);k++){ s+=niv[k]; c++; } lis[i]=Math.min(s/c,niv[Math.max(0,i-3)]); }
    L.q=q; L.niv=lis;
    for(i=0;i<n;i++){
      var key=Math.floor(q.x[i]/20)+'_'+Math.floor(q.z[i]/20);
      (TOPO.idxL[key]||(TOPO.idxL[key]=[])).push(li,i);
    }
  });
}
/* niveau de l'eau au point le plus proche d'un cours d'eau, null au-delà de 90 m */
function niveauEau(x,z){
  var gx=Math.floor(x/20), gz=Math.floor(z/20), best=null, bd=1e9;
  for(var r=0;r<=4 && best===null;r++){
    for(var a=-r;a<=r;a++) for(var b=-r;b<=r;b++){
      if(Math.max(Math.abs(a),Math.abs(b))!==r) continue;
      var t=TOPO.idxL[(gx+a)+'_'+(gz+b)]; if(!t) continue;
      for(var k=0;k<t.length;k+=2){
        var L=TOPO.lignes[t[k]], i=t[k+1], d=Math.hypot(L.q.x[i]-x,L.q.z[i]-z);
        if(d<bd){ bd=d; best=L.niv[i]; }
      }
    }
    if(best!==null && r<4){ r++; }
  }
  return best;
}

/* ---------------- lit creusé ---------------- */
function creuserLits(){
  var M=new Uint8Array(GROWS*GCOLS), N=new Float32Array(GROWS*GCOLS);
  TOPO.niv=N;
  var rings=anneaux(TOPO.eau);
  TOPO.anneaux=rings;
  remplirContours(rings,function(i,j){
    var x=XMIN+j*PASX, z=ZMAX-i*PASZ, nv=niveauEau(x,z);
    if(nv===null) nv=minBrut(x,z,12);
    var o=i*GCOLS+j; M[o]=2; N[o]=nv; ELE[o]=Math.min(ELE[o],nv-1.5);
  });
  /* biefs et bras cartographiés à part de la Sèvre : même niveau que la rivière voisine */
  TOPO.plansRiv=[];
  (Dzones||[]).forEach(function(l){
    var c=l.split('\t');
    if(c[0]!=='w' || c.length<3 || +c[1]<400) return;
    var p=pointsDe(c[2]), n=p.length/2, cx=0, cz=0;
    for(var k=0;k<n;k++){ cx+=p[k*2]; cz+=p[k*2+1]; }
    var nv0=niveauEau(cx/n,cz/n);
    if(nv0===null) return;
    TOPO.plansRiv.push(p);
    remplirContours([p],function(i,j){
      var o=i*GCOLS+j;
      if(M[o]===2) return;
      var nv=niveauEau(XMIN+j*PASX,ZMAX-i*PASZ);
      if(nv===null) nv=nv0;
      M[o]=2; N[o]=nv; ELE[o]=Math.min(ELE[o],nv-1.2);
    });
  });
  /* cours d'eau hors de la surface cartographiée : bande creusée à la largeur du lit */
  TOPO.lignes.forEach(function(L){
    var q=L.q, h=L.larg/2, prof=(L.k==='RIV'?1.1:0.55);
    L.horsSurface=false;
    for(var i=0;i<q.x.length;i++){
      var jc=Math.round((q.x[i]-XMIN)/PASX), ic=Math.round((ZMAX-q.z[i])/PASZ);
      if(ic>=0 && jc>=0 && ic<GROWS && jc<GCOLS && M[ic*GCOLS+jc]===2) continue;
      L.horsSurface=true;
      var n=Math.ceil((h+2)/PASX);
      for(var a=-n;a<=n;a++) for(var b=-n;b<=n;b++){
        var ii=ic+a, jj=jc+b;
        if(ii<0||jj<0||ii>=GROWS||jj>=GCOLS) continue;
        var o=ii*GCOLS+jj, d=Math.hypot(XMIN+jj*PASX-q.x[i],ZMAX-ii*PASZ-q.z[i]);
        if(d<=h+0.5){ if(M[o]!==2){ M[o]=Math.max(M[o],2); N[o]=L.niv[i]; } ELE[o]=Math.min(ELE[o],L.niv[i]-prof); }
        else if(d<=h+3 && M[o]===0){ M[o]=1; ELE[o]=Math.min(ELE[o],L.niv[i]+0.35); }
      }
    }
  });
  /* berges : les nœuds qui touchent l'eau passent juste au-dessus du niveau */
  for(var i=1;i<GROWS-1;i++) for(var j=1;j<GCOLS-1;j++){
    var o=i*GCOLS+j;
    if(M[o]) continue;
    var nv=null;
    for(var a=-1;a<=1;a++) for(var b=-1;b<=1;b++){ var p=(i+a)*GCOLS+j+b; if(M[p]===2){ nv=N[p]; } }
    if(nv!==null){ M[o]=1; if(ELE[o]<nv+0.3) ELE[o]=nv+0.3; else if(ELE[o]>nv+2.5 && TOPO.brut[o]<nv+2.5) ELE[o]=nv+0.8; }
  }
  TOPO.masque=M;
}

/* ---------------- ponts : tablier au-dessus de l'eau ---------------- */
function preparerPonts(){
  TOPO.idxP={};
  TOPO.ponts.forEach(function(P,pi){
    var p=P.p, n=p.length/2, L=0, cum=[0], i;
    for(i=1;i<n;i++){ L+=Math.hypot(p[i*2]-p[i*2-2],p[i*2+1]-p[i*2-1]); cum.push(L); }
    P.L=L; P.cum=cum;
    P.larg=P.hw==='secondary'?9:(P.hw==='footway'||P.hw==='path'||P.hw==='cycleway'?2.6:6.5);
    var ya=hauteurGrille(p[0],p[1]), yb=hauteurGrille(p[n*2-2],p[n*2-1]), eau=-1e9;
    for(i=0;i<=8;i++){
      var t=i/8, x=p[0]+(p[n*2-2]-p[0])*t, z=p[1]+(p[n*2-1]-p[1])*t;
      var jc=Math.round((x-XMIN)/PASX), ic=Math.round((ZMAX-z)/PASZ), o=ic*GCOLS+jc;
      if(TOPO.masque && TOPO.masque[o]===2 && TOPO.niv[o]>eau) eau=TOPO.niv[o];
    }
    P.eau=eau>-1e8?eau:null;
    if(P.eau!==null){ ya=Math.max(ya,P.eau+1.3); yb=Math.max(yb,P.eau+1.3); }
    P.ya=ya; P.yb=yb;
    for(i=1;i<n;i++){
      var x0=Math.min(p[i*2-2],p[i*2]), x1=Math.max(p[i*2-2],p[i*2]), z0=Math.min(p[i*2-1],p[i*2+1]), z1=Math.max(p[i*2-1],p[i*2+1]);
      for(var gx=Math.floor((x0-8)/16);gx<=Math.floor((x1+8)/16);gx++) for(var gz=Math.floor((z0-8)/16);gz<=Math.floor((z1+8)/16);gz++)
        (TOPO.idxP[gx+'_'+gz]||(TOPO.idxP[gx+'_'+gz]=[])).push(pi,i);
    }
  });
}
function tablierEn(x,z){
  if(!TOPO.idxP) return null;
  var t=TOPO.idxP[Math.floor(x/16)+'_'+Math.floor(z/16)];
  if(!t) return null;
  var best=null, bd=1e9;
  for(var k=0;k<t.length;k+=2){
    var P=TOPO.ponts[t[k]], i=t[k+1], p=P.p;
    var ax=p[i*2-2], az=p[i*2-1], bx=p[i*2], bz=p[i*2+1], dx=bx-ax, dz=bz-az, l2=dx*dx+dz*dz;
    var u=l2>0?((x-ax)*dx+(z-az)*dz)/l2:0; u=u<0?0:(u>1?1:u);
    var d=Math.hypot(x-ax-dx*u,z-az-dz*u);
    if(d<=P.larg/2+0.4 && d<bd){ bd=d; var s=(P.cum[i-1]+(P.cum[i]-P.cum[i-1])*u)/(P.L||1); best=P.ya+(P.yb-P.ya)*s; }
  }
  return best;
}
/* hauteur exactement sur les facettes du terrain affiché (mêmes triangles que le relief) :
   la courbe lissée d'origine s'écartait jusqu'à 2 m des facettes au bord du lit creusé,
   et les personnages ou les barrières passaient sous le sol */
var hauteurLissee=hauteur;
var hauteurGrille=function(x,z){
  if(!TOPO.brut) return hauteurLissee(x,z);
  var fj=(x-XMIN)/PASX, fi=(ZMAX-z)/PASZ, j=Math.floor(fj), i=Math.floor(fi), tj=fj-j, ti=fi-i;
  var a=gele(i,j), b=gele(i,j+1), c=gele(i+1,j), d=gele(i+1,j+1);
  return (tj+ti<=1) ? a+(b-a)*tj+(c-a)*ti : d+(c-d)*(1-tj)+(b-d)*(1-ti);
};
hauteur=function(x,z){
  var t=tablierEn(x,z), g=hauteurGrille(x,z);
  /* un chemin cartographié en « pont » sur la terre ferme suit le terrain */
  return (t!==null && t>g) ? t : g;
};

/* ---------------- lecture : relief fin puis creusement ---------------- */
var _lireDonneesX=lireDonnees;
lireDonnees=function(){
  /* lecture d'origine (ancien relief 25 m, zones, voies…), puis relief fin et creusement */
  _lireDonneesX();
  var s=(texteBrut('d-ele5')||'').split('\n').filter(function(v){ return v!==''; });
  /* 404 × 480 pour Saint-Maixent ; une autre carte donne sa propre taille
     dans window.CARTE_ORIGINE, et une grille carrée est admise telle quelle */
  var nr=(ORIG.grows||404), nc=(ORIG.gcols||480);
  if(s.length!==nr*nc){
    var cote=Math.round(Math.sqrt(s.length));
    if(cote*cote===s.length && cote>8){ nr=nc=cote; } else return;
  }
  GROWS=nr; GCOLS=nc;
  PASX=(XMAX-XMIN)/(GCOLS-1); PASZ=(ZMAX-ZMIN)/(GROWS-1);
  ELE=new Float32Array(s.length);
  for(var i=0;i<s.length;i++) ELE[i]=(+s[i])/100;
  TOPO.brut=ELE.slice();
  lireTopo(); preparerNiveaux(); creuserLits(); preparerPonts();
};
/* la liste des étapes garde la fonction d'origine : on la remplace aussi */
ETAPES.forEach(function(e){ if(e[1]===_lireDonneesX) e[1]=lireDonnees; });
/* =================================================================
   Eau à son niveau réel, seuils des moulins, ponts en pierre et
   passerelles, mur de soutènement, berges et lit de la rivière.
================================================================= */

/* le relief fin est déjà une grille de 5 m : un sommet par nœud, lit et berges teintés */
var _reliefX=construireRelief;
construireRelief=function(gros){
  if(!TOPO.brut) return _reliefX(gros);
  var nx=GCOLS, nz=GROWS, N=nx*nz, pos=new Float32Array(N*3), col=new Float32Array(N*3), uv=new Float32Array(N*2), r, c, k;
  var bb=gros.map(function(g){ var x0=1e9,x1=-1e9,z0=1e9,z1=-1e9; for(var i=0;i<g.p.length;i+=2){ if(g.p[i]<x0)x0=g.p[i]; if(g.p[i]>x1)x1=g.p[i]; if(g.p[i+1]<z0)z0=g.p[i+1]; if(g.p[i+1]>z1)z1=g.p[i+1]; } return [x0,x1,z0,z1]; });
  var vase=teinte(0x4b4636), berge=teinte(0x5f6a3c), mini=1e9;
  for(r=0;r<nz;r++){
    var z=ZMAX-r*PASZ;
    for(c=0;c<nx;c++){
      var x=XMIN+c*PASX, o=r*nx+c, y=ELE[o];
      if(y<mini) mini=y;
      pos[o*3]=x; pos[o*3+1]=y; pos[o*3+2]=z;
      uv[o*2]=x/9; uv[o*2+1]=z/9;
      var cc=COL.terrain;
      for(k=0;k<gros.length;k++){ var b=bb[k]; if(x<b[0]||x>b[1]||z<b[2]||z>b[3]) continue; if(dansPoly(gros[k].p,x,z)){ cc=gros[k].c; break; } }
      var dx=(ELE[r*nx+Math.min(nx-1,c+1)]-ELE[r*nx+Math.max(0,c-1)])/(2*PASX);
      var dz=(ELE[Math.min(nz-1,r+1)*nx+c]-ELE[Math.max(0,r-1)*nx+c])/(2*PASZ);
      var pn=Math.hypot(dx,dz);
      if(pn>0.20) cc=melange(cc,COL.roche,Math.min(0.7,(pn-0.20)*2.1));
      var m=TOPO.masque[o];
      if(m===2) cc=vase; else if(m===1) cc=melange(cc,berge,0.55);
      var v=0.86+bruit(x,z,34)*0.22+bruit(x,z,9)*0.08;
      col[o*3]=cc[0]*v; col[o*3+1]=cc[1]*v; col[o*3+2]=cc[2]*v;
    }
  }
  var idx=new Uint32Array((nx-1)*(nz-1)*6), t=0;
  for(r=0;r<nz-1;r++) for(c=0;c<nx-1;c++){
    var a=r*nx+c, b2=a+1, c2=a+nx, d=c2+1;
    idx[t++]=a; idx[t++]=b2; idx[t++]=c2; idx[t++]=b2; idx[t++]=d; idx[t++]=c2;
  }
  var g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.BufferAttribute(col,3));
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  g.setIndex(new THREE.BufferAttribute(idx,1));
  g.computeVertexNormals();
  MAT.terrain=materielSol();
  meshTerrain=new THREE.Mesh(g,MAT.terrain);
  meshTerrain.receiveShadow=true;
  monde.add(meshTerrain);
  var pl=new THREE.Mesh(new THREE.PlaneGeometry(16000,16000),new THREE.MeshStandardMaterial({color:0x7d8f5c, roughness:1, metalness:0}));
  pl.rotation.x=-PI/2; pl.position.set((XMIN+XMAX)/2,mini-4,(ZMIN+ZMAX)/2);
  monde.add(pl);
};

/* les anciens rubans et plans d'eau posés sous le relief sont remplacés */
var _zonesX=construireZones;
construireZones=function(zones){
  if(!TOPO.brut) return _zonesX(zones);
  TOPO.plans=[];
  var gardees=zones.filter(function(l){
    if(l.charAt(0)!=='w' || l.charAt(1)!=='\t') return true;
    var c=l.split('\t'); if(c.length>=3) TOPO.plans.push({aire:+c[1], p:pointsDe(c[2])});
    return false;
  });
  return _zonesX(gardees);
};
var _lignesX=construireLignes;
construireLignes=function(lgs,tasEau,tasBati,arbres){
  if(!TOPO.brut) return _lignesX(lgs,tasEau,tasBati,arbres);
  _lignesX(lgs.filter(function(l){ var k=l.charAt(0); return !((k==='R'||k==='S') && l.charAt(1)==='\t'); }),tasEau,tasBati,arbres);
};

function dansRiviere(x,z){
  var rings=TOPO.anneaux||[], dedans=false;
  for(var i=0;i<rings.length;i++) if(dansPoly(rings[i],x,z)) dedans=!dedans;
  return dedans;
}
function triHaut(tas,a,b,c,col,uvs){
  var e1x=b[0]-a[0], e1z=b[2]-a[2], e2x=c[0]-a[0], e2z=c[2]-a[2];
  if(e1z*e2x-e1x*e2z<0){ var s=b; b=c; c=s; }
  tas.tri(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2], 0,1,0,
    [a[0]/uvs,a[2]/uvs, b[0]/uvs,b[2]/uvs, c[0]/uvs,c[2]/uvs], col);
}
function niveauOu(x,z){
  var jc=Math.round((x-XMIN)/PASX), ic=Math.round((ZMAX-z)/PASZ);
  if(ic>=0 && jc>=0 && ic<GROWS && jc<GCOLS){ var o=ic*GCOLS+jc; if(TOPO.masque[o]===2) return TOPO.niv[o]; }
  var n=niveauEau(x,z);
  return n!==null ? n : minBrut(x,z,8);
}

/* ---------------- surfaces d'eau ---------------- */
function construireEau(tas){
  var coul=teinte(0x3f6258), i;
  /* la Sèvre : contour extérieur et îles */
  function v2(p){ var r=[], n=p.length/2; if(p[0]===p[n*2-2] && p[1]===p[n*2-1]) n--; for(var k=0;k<n;k++) r.push(new THREE.Vector2(p[k*2],p[k*2+1])); return r; }
  var ext=anneaux(TOPO.eau.filter(function(m){ return m.role!=='inner'; })).map(v2);
  var iles=anneaux(TOPO.eau.filter(function(m){ return m.role==='inner'; })).map(v2);
  ext.forEach(function(e){
    if(THREE.ShapeUtils.isClockWise(e)) e.reverse();
    var trous=iles.filter(function(h){ return h.length && dansPoly(e.reduce(function(a,q){ a.push(q.x,q.y); return a; },[]),h[0].x,h[0].y); });
    trous.forEach(function(h){ if(!THREE.ShapeUtils.isClockWise(h)) h.reverse(); });
    var tris;
    try{ tris=THREE.ShapeUtils.triangulateShape(e,trous); }catch(er){ return; }
    var tous=e.concat.apply(e,trous), Y=tous.map(function(q){ return niveauOu(q.x,q.y)+0.02; });
    tris.forEach(function(t){
      var p=t.map(function(k){ return [tous[k].x,Y[k],tous[k].y]; });
      if(p.every(function(q){ return q[0]<XMIN||q[0]>XMAX||q[2]<ZMIN||q[2]>ZMAX; })) return;
      triHaut(tas,p[0],p[1],p[2],coul,7);
    });
  });
  /* ruisseaux et biefs hors de la surface cartographiée */
  TOPO.lignes.forEach(function(L){
    var q=L.q, n=q.x.length, h=L.larg/2, prev=null;
    for(i=0;i<n;i++){
      var ax=i?q.x[i]-q.x[i-1]:q.x[1]-q.x[0], az=i?q.z[i]-q.z[i-1]:q.z[1]-q.z[0], l=Math.hypot(ax,az)||1;
      var nx=az/l*h, nz=-ax/l*h, y=L.niv[i]+0.02;
      var dedans=dansRiviere(q.x[i],q.z[i]);
      if(!dedans) for(var pr=0;pr<(TOPO.plansRiv||[]).length;pr++) if(dansPoly(TOPO.plansRiv[pr],q.x[i],q.z[i])){ dedans=true; break; }
      var cur={l:[q.x[i]+nx,y,q.z[i]+nz], r:[q.x[i]-nx,y,q.z[i]-nz], dedans:dedans};
      if(prev && !(cur.dedans && prev.dedans)){
        triHaut(tas,prev.l,prev.r,cur.r,coul,7);
        triHaut(tas,prev.l,cur.r,cur.l,coul,7);
      }
      prev=cur;
    }
  });
  /* bassins, lavoirs, piscines */
  (TOPO.plans||[]).forEach(function(Z){
    var p=Z.p, n=p.length/2, cx=0, cz=0, k;
    for(k=0;k<n;k++){ cx+=p[k*2]; cz+=p[k*2+1]; }
    cx/=n; cz/=n;
    if(dansRiviere(cx,cz)) return;
    var ctr=[]; for(k=0;k<n;k++) ctr.push(new THREE.Vector2(p[k*2],p[k*2+1]));
    var tris; try{ tris=THREE.ShapeUtils.triangulateShape(ctr,[]); }catch(er){ return; }
    /* bief ou bras de rivière : creusé au niveau de la rivière voisine */
    if(Z.aire>=400 && niveauEau(cx,cz)!==null){
      var Yr=ctr.map(function(v){ return niveauOu(v.x,v.y)+0.02; });
      tris.forEach(function(t){ triHaut(tas,[ctr[t[0]].x,Yr[t[0]],ctr[t[0]].y],[ctr[t[1]].x,Yr[t[1]],ctr[t[1]].y],[ctr[t[2]].x,Yr[t[2]],ctr[t[2]].y],coul,7); });
      return;
    }
    var y=-1e9, ymin=1e9;
    for(k=0;k<n;k++){ var hh=hauteurGrille(p[k*2],p[k*2+1]); if(hh>y) y=hh; if(hh<ymin) ymin=hh; }
    y=(Z.aire<400 || y-ymin<0.6) ? y+0.08 : ymin+0.05;
    var c=Z.aire<400 ? teinte(0x3b8fb0) : coul;
    tris.forEach(function(t){ triHaut(tas,[ctr[t[0]].x,y,ctr[t[0]].y],[ctr[t[1]].x,y,ctr[t[1]].y],[ctr[t[2]].x,y,ctr[t[2]].y],c,6); });
  });
}

/* ---------------- seuils et clapets des moulins ---------------- */
function construireSeuils(ecume,pierre){
  var gris=teinte(0x8a8579), blanc=teinte(0xeef3f2);
  TOPO.seuils.forEach(function(S){
    var p=S.p, n=p.length/2, mx=0, mz=0, k;
    for(k=0;k<n;k++){ mx+=p[k*2]; mz+=p[k*2+1]; }
    mx/=n; mz/=n;
    /* sens du courant au point de rivière le plus proche */
    var best=null, bd=1e9;
    TOPO.lignes.forEach(function(L){ for(var i=0;i<L.q.x.length;i++){ var d=Math.hypot(L.q.x[i]-mx,L.q.z[i]-mz); if(d<bd){ bd=d; best={L:L,i:i}; } } });
    if(!best || bd>60) return;
    var L=best.L, i0=Math.max(0,best.i-5), i1=Math.min(L.q.x.length-1,best.i+5);
    var fx=L.q.x[i1]-L.q.x[i0], fz=L.q.z[i1]-L.q.z[i0], fl=Math.hypot(fx,fz)||1; fx/=fl; fz/=fl;
    var haut=Math.max(L.niv[i0],niveauOu(mx-fx*10,mz-fz*10)), bas=Math.min(L.niv[i1],niveauOu(mx+fx*10,mz+fz*10));
    var chute=Math.max(0.35,Math.min(2.2,haut-bas));
    var q=densifier(p,1.5);
    for(k=1;k<q.x.length;k++){
      var ax=q.x[k-1], az=q.z[k-1], bx=q.x[k], bz=q.z[k];
      var y0=haut+0.02, y1=haut-chute+0.03;
      /* crête en pierre */
      boiteQuad(pierre,[ax-fx*0.45,az-fz*0.45],[bx-fx*0.45,bz-fz*0.45],[bx+fx*0.35,bz+fz*0.35],[ax+fx*0.35,az+fz*0.35],y1-0.6,y0+0.06,gris,assombrir(gris,0.8),1.5);
      /* nappe d'eau qui déborde puis écume au pied */
      triHaut(ecume,[ax+fx*0.35,y0,az+fz*0.35],[bx+fx*0.35,y0,bz+fz*0.35],[bx+fx*1.6,y1,bz+fz*1.6],blanc,3);
      triHaut(ecume,[ax+fx*0.35,y0,az+fz*0.35],[bx+fx*1.6,y1,bz+fz*1.6],[ax+fx*1.6,y1,az+fz*1.6],blanc,3);
      triHaut(ecume,[ax+fx*1.6,y1,az+fz*1.6],[bx+fx*1.6,y1,bz+fz*1.6],[bx+fx*4.5,y1-0.01,bz+fz*4.5],assombrir(blanc,0.92),3);
      triHaut(ecume,[ax+fx*1.6,y1,az+fz*1.6],[bx+fx*4.5,y1-0.01,bz+fz*4.5],[ax+fx*4.5,y1-0.01,az+fz*4.5],assombrir(blanc,0.92),3);
    }
  });
}

/* ---------------- ponts et passerelles ---------------- */
function construirePonts(pierre,metal){
  var cp=teinte(0xb9ae98), cm=teinte(0x55606a);
  TOPO.ponts.forEach(function(P){
    var q=densifier(P.p,2), n=q.x.length, h=P.larg/2, pieton=P.larg<4, i;
    var ep=pieton?0.35:0.9;
    for(i=1;i<n;i++){
      var ax=q.x[i-1], az=q.z[i-1], bx=q.x[i], bz=q.z[i], dx=bx-ax, dz=bz-az, l=Math.hypot(dx,dz);
      if(l<0.05) continue;
      var nx=dz/l, nz=-dx/l, ya=tablierEn(ax,az), yb=tablierEn(bx,bz);
      if(ya===null) ya=hauteurGrille(ax,az); if(yb===null) yb=hauteurGrille(bx,bz);
      var y=Math.min(ya,yb)+0.1, sol=Math.min(hauteurGrille(ax,az),hauteurGrille(bx,bz));
      if(y-sol<0.6) continue;
      var e=h+0.35;
      /* tablier */
      boiteQuad(pieton?metal:pierre,[ax+nx*e,az+nz*e],[bx+nx*e,bz+nz*e],[bx-nx*e,bz-nz*e],[ax-nx*e,az-nz*e],y-ep,y,pieton?cm:cp,assombrir(pieton?cm:cp,0.75),2);
      if(pieton){
        [1,-1].forEach(function(s){
          var ox=nx*(h+0.2)*s, oz=nz*(h+0.2)*s;
          tube(metal,ax+ox,y+1.05,az+oz,bx+ox,y+1.05,bz+oz,0.03,0.03,6,cm,false,false);
          tube(metal,ax+ox,y+0.5,az+oz,bx+ox,y+0.5,bz+oz,0.015,0.015,5,cm,false,false);
          tube(metal,ax+ox,y,az+oz,ax+ox,y+1.05,az+oz,0.025,0.025,5,cm,false,false);
        });
      } else {
        [1,-1].forEach(function(s){
          var o1=h+0.05, o2=h+0.4;
          boiteQuad(pierre,[ax+nx*o2*s,az+nz*o2*s],[bx+nx*o2*s,bz+nz*o2*s],[bx+nx*o1*s,bz+nz*o1*s],[ax+nx*o1*s,az+nz*o1*s],y,y+0.95,cp,assombrir(cp,0.85),1.2);
        });
      }
      /* piles dans la rivière, tous les 10 m environ */
      if(!pieton && P.eau!==null && i%5===0 && i<n-2){
        var fond=hauteurGrille(bx,bz)-0.4, ux=dx/l*0.9, uz=dz/l*0.9;
        if(y-ep-fond>1) boiteQuad(pierre,[bx+nx*e-ux,bz+nz*e-uz],[bx+nx*e+ux,bz+nz*e+uz],[bx-nx*e+ux,bz-nz*e+uz],[bx-nx*e-ux,bz-nz*e-uz],fond,y-ep,cp,assombrir(cp,0.7),1.5);
      }
    }
  });
}

/* on ne traverse pas la rivière à pied : il faut prendre un pont */
var _bloquerX=bloquer;
bloquer=function(x,z){
  if(_bloquerX(x,z)) return true;
  if(!TOPO.masque) return false;
  var jc=Math.round((x-XMIN)/PASX), ic=Math.round((ZMAX-z)/PASZ);
  if(ic<0||jc<0||ic>=GROWS||jc>=GCOLS) return false;
  var o=ic*GCOLS+jc;
  return TOPO.masque[o]===2 && tablierEn(x,z)===null && hauteurGrille(x,z)<TOPO.niv[o]-0.5;
};

function etapeTopo(){
  if(!TOPO.brut) return;
  var eau=new Tas(32768), ecume=new Tas(4096), pierre=new Tas(16384), metal=new Tas(8192);
  construireEau(eau);
  construireSeuils(ecume,pierre);
  construirePonts(pierre,metal);
  TOPO.murs.forEach(function(M){ murLigne(pierre,M.p,0.5,2.4,teinte(0xc9bfa9)); });
  if(!MAT.eau){
    MAT.eauN=texNormale(faireOndes(),2.2);
    MAT.eau=new THREE.MeshStandardMaterial({vertexColors:true, normalMap:MAT.eauN, roughness:0.06, metalness:0.28, transparent:true, opacity:0.92});
  }
  MAT.eau.opacity=0.88; MAT.eau.depthWrite=false;
  MAT.ecume=new THREE.MeshStandardMaterial({vertexColors:true, map:MAT.eauN, roughness:0.5, metalness:0, transparent:true, opacity:0.8, depthWrite:false});
  MAT.pierrePont=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(faireMurNu(),1,1), roughness:0.92, metalness:0});
  MAT.metalPont=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.45, metalness:0.6});
  var me=ajouter(eau,MAT.eau,false,false); if(me) me.renderOrder=5;
  var mc=ajouter(ecume,MAT.ecume,false,false); if(mc) mc.renderOrder=6;
  ajouter(pierre,MAT.pierrePont,true,true);
  ajouter(metal,MAT.metalPont,true,true);
}
ETAPES.forEach(function(e,i){ if(e[1]===etapeLignes || e[0]==='Murs de pierre, haies taillées') ETAPES.splice(i+1,0,['Sèvre Niortaise, seuils et ponts',etapeTopo]); });
/* =================================================================
   Places bitumées de l'ENSOA (relevées sur la vue satellite),
   véhicules militaires posés à la main, autres parcours affichés en
   trait plein avec leurs jalonneurs, barrières, rubalise et véhicules.
================================================================= */

/* ---------------- places bitumées ---------------- */
/* ll : coins en latitude/longitude ; m : points en mètres dans le repère local (x est, z sud) */
var PLACES_BITUME=[
  /* petite place, à l'est du carrefour du jalonneur 19 du parcours B */
  {ll:[[46.416376,-0.213252],[46.416323,-0.212628],[46.415682,-0.212743],[46.415734,-0.213367]]},
  /* avenue : tout l'espace entre ses deux chaussées OSM est bitumé */
  {m:[[-558.7,-276.3],[-542.6,-274.5],[-511.5,-269.7],[-435.8,-263.8],[-430.4,-263.7],[-365.2,-257.4],[-331.3,-254.1],[-290.3,-249.7],
      [-288.5,-268.6],[-364.8,-276.0],[-403.6,-280.0],[-429.4,-282.6],[-513.2,-289.9],[-540.9,-292.3],[-557.4,-293.7]]},
  /* grande place d'armes, à l'ouest du jalonneur 18 du parcours B, bordée par les gradins */
  {ll:[[46.416972,-0.218111],[46.416900,-0.216992],[46.415760,-0.217153],[46.415832,-0.218272]]}
];
var PLACES=PLACES_BITUME.map(function(P){
  var p=[], x0=1e9, x1=-1e9, z0=1e9, z1=-1e9;
  function ajoute(x,z){ p.push(x,z); x0=Math.min(x0,x); x1=Math.max(x1,x); z0=Math.min(z0,z); z1=Math.max(z1,z); }
  if(P.ll) P.ll.forEach(function(q){ ajoute(pX(q[1]),pZ(q[0])); });
  else P.m.forEach(function(q){ ajoute(q[0],q[1]); });
  p.bb=[x0,x1,z0,z1];
  return p;
});
function dansPlace(x,z,marge){
  marge=marge||0;
  for(var i=0;i<PLACES.length;i++){
    var p=PLACES[i], b=p.bb;
    if(x<b[0]-marge || x>b[1]+marge || z<b[2]-marge || z>b[3]+marge) continue;
    if(dansPoly(p,x,z)) return true;
    if(marge){
      var n=p.length/2;
      for(var k=0;k<n;k++){ var c=(k+1)%n; if(distSeg(x,z,[p[k*2],p[k*2+1]],[p[c*2],p[c*2+1]])<marge) return true; }
    }
  }
  return false;
}
/* quadrilatère découpé en mailles de 2 m qui épousent le relief */
/* triangle redécoupé jusqu'à 2,5 m de côté pour suivre le relief */
function triPlace(tas,a,b,c,col){
  var lab=Math.hypot(a[0]-b[0],a[1]-b[1]), lbc=Math.hypot(b[0]-c[0],b[1]-c[1]), lca=Math.hypot(c[0]-a[0],c[1]-a[1]), m=Math.max(lab,lbc,lca);
  if(m>2.5){
    if(m===lab){ var ab=[(a[0]+b[0])/2,(a[1]+b[1])/2]; triPlace(tas,a,ab,c,col); triPlace(tas,ab,b,c,col); }
    else if(m===lbc){ var bc=[(b[0]+c[0])/2,(b[1]+c[1])/2]; triPlace(tas,a,b,bc,col); triPlace(tas,a,bc,c,col); }
    else { var ca=[(c[0]+a[0])/2,(c[1]+a[1])/2]; triPlace(tas,a,b,ca,col); triPlace(tas,ca,b,c,col); }
    return;
  }
  triHaut(tas,[a[0],hauteur(a[0],a[1])+0.15,a[1]],[b[0],hauteur(b[0],b[1])+0.15,b[1]],[c[0],hauteur(c[0],c[1])+0.15,c[1]],col,6);
}
function construirePlace(tas,p,col){
  if(p.length!==8){
    var ctr=[];
    for(var k=0;k<p.length;k+=2) ctr.push(new THREE.Vector2(p[k],p[k+1]));
    var tris;
    try{ tris=THREE.ShapeUtils.triangulateShape(ctr,[]); }catch(e){ return; }
    tris.forEach(function(t){ triPlace(tas,[ctr[t[0]].x,ctr[t[0]].y],[ctr[t[1]].x,ctr[t[1]].y],[ctr[t[2]].x,ctr[t[2]].y],col); });
    return;
  }
  var A=[p[0],p[1]], B=[p[2],p[3]], C=[p[4],p[5]], D=[p[6],p[7]];
  var nu=Math.max(1,Math.ceil(Math.hypot(B[0]-A[0],B[1]-A[1])/2)), nv=Math.max(1,Math.ceil(Math.hypot(D[0]-A[0],D[1]-A[1])/2));
  function P(u,v){
    var x=(1-u)*(1-v)*A[0]+u*(1-v)*B[0]+u*v*C[0]+(1-u)*v*D[0];
    var z=(1-u)*(1-v)*A[1]+u*(1-v)*B[1]+u*v*C[1]+(1-u)*v*D[1];
    return [x,hauteur(x,z)+0.15,z];
  }
  for(var i=0;i<nu;i++) for(var j=0;j<nv;j++){
    var a=P(i/nu,j/nv), b=P((i+1)/nu,j/nv), c=P((i+1)/nu,(j+1)/nv), d=P(i/nu,(j+1)/nv);
    triHaut(tas,a,b,c,col,6); triHaut(tas,a,c,d,col,6);
  }
}
function etapePlaces(){
  if(!PLACES.length) return;
  var tas=new Tas(8192);
  PLACES.forEach(function(p){ construirePlace(tas,p,COL.parking); });
  /* même couche que les parkings : dessinée par-dessus le terrain, sous les rues */
  superposer(ajouter(tas,MAT.dur||MAT.bit,false,true),2);
}
ETAPES.forEach(function(e,i){ if(e[1]===etapeVoies) ETAPES.splice(i+1,0,['Place d’armes bitumée',etapePlaces]); });

/* grands gradins en béton devant la façade est du bâtiment qui donne sur la place d'armes */
var GRADINS=[{a:[-649.2,-317.6], b:[-652.0,-289.4], centreBat:[-675.3,-305.9], longueur:40, rangs:8, marche:0.45, profondeur:0.9, recul:1.0}];
function etapeGradins(){
  var tas=new Tas(8192), beton=teinte(0xc9c5bb), assise=teinte(0xa9a59b);
  GRADINS.forEach(function(G){
    var ux=G.b[0]-G.a[0], uz=G.b[1]-G.a[1], L=Math.hypot(ux,uz); ux/=L; uz/=L;
    var nx=-uz, nz=ux, mx=(G.a[0]+G.b[0])/2, mz=(G.a[1]+G.b[1])/2;
    /* la normale part du bâtiment vers la place */
    var bc=G.centreBat;
    if((mx-bc[0])*nx+(mz-bc[1])*nz<0){ nx=-nx; nz=-nz; }
    var h=G.longueur/2, dmax=G.recul+G.rangs*G.profondeur, base=1e9, i;
    [[-h,G.recul],[h,G.recul],[-h,dmax],[h,dmax]].forEach(function(c){ var x=mx+ux*c[0]+nx*c[1], z=mz+uz*c[0]+nz*c[1]; base=Math.min(base,hauteur(x,z)); });
    function P(l,d){ return [mx+ux*l+nx*d, mz+uz*l+nz*d]; }
    for(i=0;i<G.rangs;i++){
      /* le rang le plus haut est contre le bâtiment, le plus bas donne sur la place */
      var d0=G.recul+i*G.profondeur, d1=d0+G.profondeur, y1=base+(G.rangs-i)*G.marche;
      boiteQuad(tas,P(-h,d0),P(h,d0),P(h,d1),P(-h,d1),base-0.3,y1,i%2?assise:beton,beton,2.5);
    }
    /* joues latérales et garde-corps en haut */
    var gris=teinte(0x6d7278);
    tube(tas,P(-h,G.recul)[0],base+G.rangs*G.marche,P(-h,G.recul)[1],P(h,G.recul)[0],base+G.rangs*G.marche,P(h,G.recul)[1],0.04,0.04,6,gris,false,false);
    var cote=[];
    [P(-h-0.1,G.recul),P(h+0.1,G.recul),P(h+0.1,dmax),P(-h-0.1,dmax)].forEach(function(q){ cote.push(q[0],q[1]); });
    marquerPoly(cote);
  });
  MAT.gradins=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(faireBeton(),1,1), roughness:0.92, metalness:0});
  ajouter(tas,MAT.gradins,true,true);
}
ETAPES.forEach(function(e,i){ if(e[1]===etapePlaces) ETAPES.splice(i+1,0,['Gradins de la place d’armes',etapeGradins]); });
/* rien au milieu de la place : ni trottoir, ni lampadaire, ni mobilier, ni arbre */
var _voiesY=construireVoies;
construireVoies=function(voies,dpres){
  var orig=dansChaussee;
  dansChaussee=function(I,x,z,id,marge){ return orig(I,x,z,id,marge) || dansPlace(x,z,0.6); };
  try{ return _voiesY(voies,dpres); } finally { dansChaussee=orig; }
};
var _mobY=mobilierLignes;
mobilierLignes=function(){
  return _mobY().filter(function(l){ var c=l.split('\t'); return c.length<3 || !dansPlace(pX(+c[2]),pZ(+c[1]),1); });
};
/* Le mémorial du mobilier urbain (type M) est un socle blanc nu : là où le
   monument Denfert-Rochereau est modelé pour de bon, on l'efface, sans
   quoi les deux se superposent. */
var _mobZ=mobilierLignes;
mobilierLignes=function(){
  return _mobZ().filter(function(l){
    var c=l.split('\t');
    if(c.length<3 || c[0]!=='M') return true;
    return Math.hypot(pX(+c[2])-pX(MONUMENT.lo), pZ(+c[1])-pZ(MONUMENT.la))>6;
  });
};
var _canopY=semerArbresCanopee;
semerArbresCanopee=function(arbres,voies,max){
  var n0=arbres.length;
  _canopY(arbres,voies,max);
  for(var i=arbres.length-1;i>=n0;i--) if(dansPlace(arbres[i][0],arbres[i][1],2)) arbres.splice(i,1);
};
(function(){
  for(var i=0;i<ETAPES.length;i++){
    if(ETAPES[i][0]==='Arbres réalistes' || ETAPES[i][0]==='Plantation des arbres'){
      ETAPES.splice(i,0,['Place d’armes dégagée',function(){ for(var k=Darbres.length-1;k>=0;k--) if(dansPlace(Darbres[k][0],Darbres[k][1],2)) Darbres.splice(k,1); }]);
      break;
    }
  }
})();
construireLampes=function(voies){
  var tas=new Tas(16384), tetes=new Tas(4096), gris=teinte(0x3d434b), verre=teinte(0xfff2cd), n=0;
  for(var i=0;i<voies.length && n<420;i++){
    var l=voies[i].split('\t');
    if(l.length<4 || l[0]!=='r' || (+l[1])<50) continue;
    var p=pointsDe(l[3]);
    for(var j=1;j<p.length/2 && n<420;j++){
      var x0=p[(j-1)*2], z0=p[(j-1)*2+1], x1=p[j*2], z1=p[j*2+1], L=Math.hypot(x1-x0,z1-z0), m=Math.floor(L/38);
      for(var s=0;s<m;s++){
        var t=(s+0.5)/m, cx=x0+(x1-x0)*t, cz=z0+(z1-z0)*t, dx=(x1-x0)/L, dz=(z1-z0)/L, off=(+l[1])/20+1.1;
        var lx=cx+dz*off, lz=cz-dx*off;
        if(surLeParcours(lx,lz).ecart>80 || dansPlace(lx,lz,1.5)) continue;
        var y=hauteur(lx,lz);
        tube(tas,lx,y,lz, lx,y+4.6,lz, 0.11,0.075,7,gris,false,false);
        var hx=lx-dz*0.85, hz=lz+dx*0.85;
        tube(tas,lx,y+4.6,lz, hx,y+4.85,hz, 0.07,0.06,6,gris,false,false);
        tube(tetes,hx,y+4.85,hz, hx,y+4.62,hz, 0.19,0.13,8,verre,true,true);
        lampes.push([hx,y+4.6,hz]);
        n++;
      }
    }
  }
  monde.add(new THREE.Mesh(tas.geo(),MAT.perso));
  MAT.verre=new THREE.MeshBasicMaterial({vertexColors:true});
  var mm=new THREE.Mesh(tetes.geo(),MAT.verre);
  monde.add(mm);
  var halo=new Tas(16384), jaune=teinte(0xffd88a);
  for(var q=0;q<lampes.length;q++){ var L2=lampes[q]; disque(halo,L2[0],hauteur(L2[0],L2[2])+0.22,L2[2],7.5,jaune); }
  MAT.halo=new THREE.MeshBasicMaterial({vertexColors:true, transparent:true, opacity:0.26, blending:THREE.AdditiveBlending, depthWrite:false});
  var meshHalo=new THREE.Mesh(halo.geo(),MAT.halo);
  meshHalo.visible=false;
  monde.add(meshHalo);
  return {tetes:mm, halos:meshHalo};
};
var _hsY=hauteurSol;
hauteurSol=function(x,z,e){
  var y=_hsY(x,z,e);
  if(PLACES.length && dansPlace(x,z)){ var b=hauteur(x,z)+0.165; if(y<b) y=b; }
  return y;
};

/* ---------------- véhicules militaires ---------------- */
var VEH_DEF={
  char:{actif:'mil_char.glb', nom:'Char', icone:'🪖', h:2.45, larg:0.75, yaw:0,
        peint:{Main:0x56613a, Main_Dark:0x434b2c, Main_Details:0x353a26, Main_Light:0x6b7648, Wheels:0x2f312b}},
  camion:{actif:'mil_camion.glb', nom:'Camion militaire', icone:'🚛', h:3.05, larg:1, yaw:0},
  utilitaire:{actif:'mil_utilitaire.glb', nom:'Utilitaire militaire', icone:'🚙', h:1.9, larg:0.85, yaw:0, teinte:0x7f8f5a}
};
var VM={modeles:{}, pret:false, objs:new Map(), mode:null, dernierType:'char', ghost:null, matFantome:null,
        sel:null, drag:null, anneau:null, tm:0, curseur:false, azModifie:false};
function preparerModeleVehicule(t){
  var D=VEH_DEF[t];
  return chargerGLB(D.actif).then(function(g){
    var sc=g.scene, lum=[], peaux=[];
    sc.traverse(function(o){ if(o.isLight) lum.push(o); if(o.isSkinnedMesh) peaux.push(o); });
    lum.forEach(function(o){ if(o.parent) o.parent.remove(o); });
    sc.updateMatrixWorld(true);
    /* maillages animés par squelette (caisse et chenilles du char) : figés en géométrie fixe,
       sinon la copie perd le lien avec les os et ils disparaissent */
    peaux.forEach(function(sm){
      sm.skeleton.update();
      var src=sm.geometry, P=src.attributes.position, pos=new Float32Array(P.count*3), v=new THREE.Vector3();
      for(var i=0;i<P.count;i++){ v.fromBufferAttribute(P,i); sm.applyBoneTransform(i,v); pos[i*3]=v.x; pos[i*3+1]=v.y; pos[i*3+2]=v.z; }
      var geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
      ['uv','color'].forEach(function(a){ if(src.attributes[a]) geo.setAttribute(a,src.attributes[a]); });
      if(src.index) geo.setIndex(src.index);
      src.groups.forEach(function(gr){ geo.addGroup(gr.start,gr.count,gr.materialIndex); });
      geo.computeVertexNormals();
      var m=new THREE.Mesh(geo,sm.material);
      m.name=sm.name; m.position.copy(sm.position); m.quaternion.copy(sm.quaternion); m.scale.copy(sm.scale);
      sm.parent.add(m); sm.parent.remove(sm);
    });
    sc.traverse(function(o){ if(o.isBone) o.visible=true; });
    sc.updateMatrixWorld(true);
    var b=new THREE.Box3().setFromObject(sc), sz=b.getSize(new THREE.Vector3()), ct=b.getCenter(new THREE.Vector3());
    var s=D.h/(sz.y||1);
    sc.position.set(-ct.x,-b.min.y,-ct.z);
    var corps=new THREE.Group();
    corps.add(sc);
    corps.scale.set(s,s,s*D.larg);
    corps.rotation.y=D.yaw;
    var pivot=new THREE.Group();
    pivot.add(corps);
    sc.traverse(function(o){
      if(!o.isMesh) return;
      o.castShadow=true; o.receiveShadow=true;
      (Array.isArray(o.material)?o.material:[o.material]).forEach(function(m){
        if(D.peint && D.peint[m.name]!==undefined){ m.color.setHex(D.peint[m.name]); m.vertexColors=false; }
        /* texture couleur sable : multipliée par un vert olive */
        if(D.teinte && m.map) m.color.setHex(D.teinte);
        if(m.metalness!==undefined){ m.metalness=Math.min(m.metalness,0.3); m.roughness=Math.max(m.roughness,0.6); }
        m.needsUpdate=true;
      });
    });
    pivot.updateMatrixWorld(true);
    var bb=new THREE.Box3().setFromObject(pivot), dim=bb.getSize(new THREE.Vector3());
    VM.modeles[t]={gabarit:pivot, L:Math.max(dim.x,dim.z), W:Math.min(dim.x,dim.z)};
  });
}
function hauteurVeh(x,z){ return hauteurSol(x,z)-0.03; }
function placerObjVeh(o,v){ var x=pX(v.lo), z=pZ(v.la); o.position.set(x,hauteurVeh(x,z),z); o.rotation.set(0,-v.ang*PI/180,0); }
function creerObjVeh(v,fantome){
  var M=VM.modeles[v.t];
  if(!M) return null;
  var o=M.gabarit.clone(true);
  o.userData.veh=v;
  if(fantome) o.traverse(function(m){ if(m.isMesh){ m.castShadow=false; m.receiveShadow=false; m.material=VM.matFantome; m.renderOrder=10; } });
  return o;
}
function majVehicules3D(){
  if(!VM.pret || !window.CARTE || !CARTE.vehicules) return;
  var L=CARTE.vehicules(), vus=new Set();
  L.forEach(function(v){
    vus.add(v);
    var o=VM.objs.get(v);
    if(!o){ o=creerObjVeh(v); if(!o) return; monde.add(o); VM.objs.set(v,o); }
    placerObjVeh(o,v);
  });
  VM.objs.forEach(function(o,v){ if(!vus.has(v)){ monde.remove(o); VM.objs.delete(v); } });
  if(VM.sel && !vus.has(VM.sel)) deselectionnerVeh();
  else if(VM.sel){ majAnneauVeh(); majPanneauVeh(); }
}
var _reconstruireEquipY=reconstruireEquip;
reconstruireEquip=function(){ _reconstruireEquipY(); majVehicules3D(); };
function etapeVehicules(){
  return Promise.all(Object.keys(VEH_DEF).map(function(t){
    return preparerModeleVehicule(t).catch(function(e){ console.error('Véhicule '+t,e); });
  })).then(function(){
    VM.pret=true;
    majVehicules3D();
    construireAutresParcours();
    if(VM.mode){ initFantome(); majPanneauVeh(); }
  });
}
ETAPES.forEach(function(e,i){ if(e[0]==='Barrières et rubalise') ETAPES.splice(i+1,0,['Véhicules militaires',etapeVehicules]); });

function viserVeh(ev){
  if(!VM.objs.size) return null;
  raycaster.setFromCamera(ndc(ev),camera);
  var objs=[];
  VM.objs.forEach(function(o){ objs.push(o); });
  var h=raycaster.intersectObjects(objs,true);
  for(var i=0;i<h.length;i++){ var n=h[i].object; while(n && !n.userData.veh) n=n.parent; if(n) return n.userData.veh; }
  return null;
}
function angleRue(x,z){
  var I=IDX_SOL||(IDX_SOL=indexerChaussees(Dvoies)), rp=routeProche(I,x,z,15);
  var a=rp ? Math.atan2(rp.uz,rp.ux)*180/PI : J.cap*180/PI;
  return ((Math.round(a)%360)+360)%360;
}
function initFantome(){
  if(VM.ghost){ monde.remove(VM.ghost); VM.ghost=null; }
  if(!VM.pret || !VM.mode || !VM.modeles[VM.mode]) return;
  if(!VM.matFantome) VM.matFantome=new THREE.MeshBasicMaterial({color:0xF2B33D, transparent:true, opacity:0.45, depthWrite:false});
  VM.ghost=creerObjVeh({t:VM.mode, la:0, lo:0, ang:0},true);
  VM.ghost.visible=false;
  monde.add(VM.ghost);
}
function majAnneauVeh(){
  if(!VM.anneau){
    VM.anneau=new THREE.Mesh(new THREE.RingGeometry(0.9,1,48),
      new THREE.MeshBasicMaterial({color:0xF2B33D, transparent:true, opacity:0.95, depthWrite:false, side:THREE.DoubleSide}));
    VM.anneau.rotation.x=-PI/2; VM.anneau.renderOrder=7;
    monde.add(VM.anneau);
  }
  var v=VM.sel;
  if(!v){ VM.anneau.visible=false; return; }
  var M=VM.modeles[v.t], r=(M?M.L:5)*0.6, x=pX(v.lo), z=pZ(v.la);
  VM.anneau.scale.set(r,r,r);
  VM.anneau.position.set(x,hauteurSol(x,z)+0.06,z);
  VM.anneau.visible=true;
}
function selectionnerVeh(v){
  if(SELECTION) deselectionner();
  if(EQ.sel) deselectionnerEquip();
  VM.sel=v;
  majAnneauVeh(); majPanneauVeh();
}
function deselectionnerVeh(){
  VM.sel=null;
  if(VM.anneau) VM.anneau.visible=false;
  majPanneauVeh();
}
function majBoutonVeh(){ var b=$e('e3-b-veh'); if(b) b.classList.toggle('on',!!VM.mode); }
function basculerModeVeh(type){
  if(VM.mode && !type){ sortirModeVeh(); return; }
  if(EQ.mode) sortirMode();
  if(VUE==='jal') sortirVueJal();
  if(SELECTION) deselectionner();
  if(EQ.sel) deselectionnerEquip();
  if(VM.sel) deselectionnerVeh();
  VM.mode=type||VM.dernierType||'char';
  initFantome(); majBoutonVeh(); majPanneauVeh();
}
function sortirModeVeh(){
  if(VM.mode) VM.dernierType=VM.mode;
  VM.mode=null;
  if(VM.ghost){ monde.remove(VM.ghost); VM.ghost=null; }
  majBoutonVeh(); majPanneauVeh();
}
function tournerVeh(d){
  var v=VM.sel;
  if(!v) return;
  v.ang=((Math.round(v.ang+d)%360)+360)%360;
  CARTE.vehiculeModifie();
}
function supprimerSelVeh(){
  var v=VM.sel;
  if(!v) return;
  deselectionnerVeh();
  CARTE.supprimerVehicule(v);
  dire(VEH_DEF[v.t].nom+' retiré, sur la carte aussi.');
}
/* un seul élément sélectionné à la fois : jalonneur, matériel ou véhicule */
var _selEqY=selectionnerEquip;
selectionnerEquip=function(t){ if(VM.sel) deselectionnerVeh(); _selEqY(t); };
var _selY=selectionner;
selectionner=function(o){ if(VM.sel) deselectionnerVeh(); _selY(o); };
var _modeY=basculerMode;
basculerMode=function(m){ if(VM.mode) sortirModeVeh(); if(VM.sel) deselectionnerVeh(); _modeY(m); };
var _viserEquipY=viserEquip;
viserEquip=function(ev){ return VM.mode ? null : _viserEquipY(ev); };

function panneauVeh(){
  var p=$e('e3-veh');
  if(p) return p;
  var s=document.createElement('style');
  s.textContent=[
    '#e3-veh{position:absolute;left:12px;top:118px;width:320px;z-index:7;background:rgba(14,20,31,.94);border:1px solid #3a4a63;border-radius:14px;padding:12px 13px 10px;box-shadow:0 10px 30px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:8px}',
    '#e3-veh p{margin:0;font-size:12.5px;line-height:1.45;color:#dfe6f0}',
    '#e3-veh .e3-eq-tete{display:flex;align-items:center;justify-content:space-between;gap:8px}',
    '#e3-veh .e3-eq-ligne{display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
    '#e3 #e3-veh .e3-eq-az{flex-wrap:nowrap}',
    '#e3 #e3-veh .e3-eq-az input[type=range]{flex:1;min-width:70px;width:auto}',
    '.e3-veh-types{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}',
    '#e3 .e3-veh-types button{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 4px;font-size:12px;line-height:1.2}',
    '.e3-veh-types button b{font-size:22px;line-height:1}',
    '#e3 .e3-veh-types button.on{border-color:#F2B33D;color:#F2B33D;background:rgba(242,179,61,.12)}',
    '@media (max-width:760px){#e3-veh{top:auto;bottom:66px;width:calc(100vw - 24px)}}'
  ].join('\n');
  document.head.appendChild(s);
  p=document.createElement('div');
  p.id='e3-veh'; p.hidden=true;
  $e('e3').appendChild(p);
  p.addEventListener('click',function(ev){
    var b=ev.target.closest ? ev.target.closest('button') : null;
    if(!b) return;
    var a=b.dataset.a;
    b.blur();
    if(a==='stop') sortirModeVeh();
    else if(a==='type') basculerModeVeh(b.dataset.t);
    else if(a==='fermer') deselectionnerVeh();
    else if(a==='suppr') supprimerSelVeh();
    else if(a==='rg' || a==='rd' || a==='r180') tournerVeh(a==='rg'?-15:(a==='rd'?15:180));
  });
  p.addEventListener('input',function(ev){
    if(ev.target.id!=='e3-veh-az' || !VM.sel) return;
    var geo=+ev.target.value;
    VM.sel.ang=((geo-90)%360+360)%360;
    var o=VM.objs.get(VM.sel); if(o) placerObjVeh(o,VM.sel);
    VM.azModifie=true;
    var azv=$e('e3-veh-azv'); if(azv) azv.textContent=geo+'° '+pointCardinal(geo);
  });
  p.addEventListener('change',function(ev){
    if(ev.target.id!=='e3-veh-az') return;
    ev.target.blur();
    if(VM.azModifie){ VM.azModifie=false; CARTE.vehiculeModifie(); }
  });
  return p;
}
function majPanneauVeh(){
  var p=panneauVeh(), h='';
  function tete(t,a,titre){ return '<div class="e3-eq-tete"><b>'+t+'</b><button class="e3-x" data-a="'+a+'" title="'+titre+'">✕</button></div>'; }
  if(VM.mode){
    h=tete('🪖 Véhicules et policiers','stop','Arrêter la pose (Échap)')+
      '<div class="e3-veh-types">'+Object.keys(VEH_DEF).map(function(t){
        return '<button data-a="type" data-t="'+t+'" class="'+(VM.mode===t?'on':'')+'"><b>'+VEH_DEF[t].icone+'</b>'+VEH_DEF[t].nom+'</button>';
      }).join('')+'</div>'+
      '<p>'+(VM.pret ? 'Clique dans la scène pour poser un <b>'+VEH_DEF[VM.mode].nom.toLowerCase()+'</b>, dans l’axe de la rue la plus proche. Tu pourras ensuite le tourner et le déplacer.'
                     : 'Chargement des modèles de véhicules…')+'</p>'+
      '<p class="e3-discret">Clic droit ou Échap : arrêter. Les véhicules ne sont jamais ajoutés automatiquement ; ils appartiennent au parcours en cours et apparaissent sur la carte.</p>';
  } else if(VM.sel){
    var v=VM.sel;
    h=tete(VEH_DEF[v.t].icone+' '+VEH_DEF[v.t].nom,'fermer','Fermer (Échap)')+
      '<div class="e3-jp-lbl">Orientation <span id="e3-veh-azv"></span></div>'+
      '<div class="e3-eq-ligne e3-eq-az"><button data-a="rg" title="Tourner de 15° vers la gauche (Maj+R)">⟲ 15°</button>'+
      '<input type="range" id="e3-veh-az" min="0" max="359" step="1" aria-label="Orientation">'+
      '<button data-a="rd" title="Tourner de 15° vers la droite (R)">15° ⟳</button><button data-a="r180" title="Demi-tour">↻</button></div>'+
      '<div class="e3-eq-ligne"><button data-a="suppr" class="e3-danger">Supprimer (Suppr)</button></div>'+
      '<p class="e3-discret">Tire le véhicule dans la scène pour le déplacer. Ctrl+Z annule. Tout est reporté sur la carte.</p>';
  } else { p.hidden=true; p.__h=''; return; }
  if(p.__h!==h){ p.innerHTML=h; p.__h=h; }
  p.hidden=false;
  if(VM.sel){
    var geo=(Math.round(VM.sel.ang)+90)%360, az=$e('e3-veh-az'), azv=$e('e3-veh-azv');
    if(az && document.activeElement!==az) az.value=geo;
    if(azv) azv.textContent=geo+'° '+pointCardinal(geo);
  }
}
function brancherVehicules(){
  var vue=$e('e3-vue'), bas=null, bas2=null, survol=0;
  vue.addEventListener('pointerdown',function(e){
    if(VM.mode){
      if(e.button===2){ e.preventDefault(); sortirModeVeh(); e.stopImmediatePropagation(); return; }
      if(e.button===0){ bas={x:e.clientX, y:e.clientY, id:e.pointerId}; if(viser(e)) e.stopImmediatePropagation(); }
      return;
    }
    if(e.button!==0 || EQ.mode || VUE==='jal' || viser(e)) return;
    var v=viserVeh(e);
    if(!v) return;
    e.stopImmediatePropagation();
    VM.drag={v:v, x0:e.clientX, y0:e.clientY, id:e.pointerId, bouge:false, t:0, p:null};
    try{ vue.setPointerCapture(e.pointerId); }catch(er){}
  },true);
  vue.addEventListener('contextmenu',function(e){ if(VM.mode || VM.sel) e.preventDefault(); });
  vue.addEventListener('pointermove',function(e){
    var D=VM.drag;
    if(D && D.id===e.pointerId){
      e.stopImmediatePropagation();
      if(!D.bouge && Math.hypot(e.clientX-D.x0,e.clientY-D.y0)<5) return;
      if(!D.bouge){ D.bouge=true; if(VM.sel!==D.v) selectionnerVeh(D.v); vue.style.cursor='grabbing'; }
      var t=performance.now();
      if(t-D.t<30) return;
      D.t=t;
      var q=solSousPointeur(e);
      if(!q) return;
      D.p=q;
      var o=VM.objs.get(D.v);
      if(o) o.position.set(q.x,hauteurVeh(q.x,q.z),q.z);
      if(VM.anneau && VM.sel===D.v) VM.anneau.position.set(q.x,hauteurSol(q.x,q.z)+0.06,q.z);
      return;
    }
    if(VM.mode){
      var now=performance.now();
      if(now-VM.tm<40) return;
      VM.tm=now;
      var p=solSousPointeur(e);
      if(VM.ghost){
        if(p){ VM.ghost.visible=true; VM.ghost.position.set(p.x,hauteurVeh(p.x,p.z),p.z); VM.ghost.rotation.set(0,-angleRue(p.x,p.z)*PI/180,0); }
        else VM.ghost.visible=false;
      }
      return;
    }
    if(e.buttons || EQ.mode || VUE==='jal' || e.pointerType==='touch') return;
    var n2=performance.now();
    if(n2-survol<90) return;
    survol=n2;
    if(viserVeh(e)){ vue.style.cursor='grab'; VM.curseur=true; }
    else if(VM.curseur){ vue.style.cursor=''; VM.curseur=false; }
  },true);
  function finDragVeh(e){
    var D=VM.drag;
    if(!D || D.id!==e.pointerId) return false;
    VM.drag=null;
    vue.style.cursor='';
    if(D.bouge && D.p && e.type==='pointerup'){
      D.v.la=laDeZ(D.p.z); D.v.lo=loDeX(D.p.x);
      selectionnerVeh(D.v);
      CARTE.vehiculeModifie();
      dire(VEH_DEF[D.v.t].nom+' déplacé. La carte est déjà à jour.');
    } else if(e.type==='pointerup' && !D.bouge) selectionnerVeh(D.v);
    else { var o=VM.objs.get(D.v); if(o) placerObjVeh(o,D.v); }
    return true;
  }
  vue.addEventListener('pointercancel',function(e){ finDragVeh(e); },true);
  vue.addEventListener('pointerup',function(e){
    if(finDragVeh(e)){ e.stopImmediatePropagation(); return; }
    if(!VM.mode || !bas || bas.id!==e.pointerId) return;
    var clic=Math.hypot(e.clientX-bas.x,e.clientY-bas.y)<5;
    bas=null;
    if(!clic) return;
    /* pas d'arrêt de l'événement : la caméra doit recevoir la fin du geste commencé à l'appui */
    if(!VM.pret){ dire('Les modèles de véhicules sont encore en chargement.'); return; }
    var p=solSousPointeur(e);
    if(!p) return;
    if(bloquer(p.x,p.z)){ dire('Impossible de poser un véhicule dans un bâtiment ou dans la rivière.'); return; }
    CARTE.ajouterVehicule(VM.mode,laDeZ(p.z),loDeX(p.x),angleRue(p.x,p.z));
    dire(VEH_DEF[VM.mode].nom+' posé. Clique pour en poser un autre, Échap pour arrêter.');
  },true);
  vue.addEventListener('pointerdown',function(e){ if(e.button===0) bas2={x:e.clientX, y:e.clientY}; });
  vue.addEventListener('pointerup',function(e){
    if(!bas2) return;
    var c=Math.hypot(e.clientX-bas2.x,e.clientY-bas2.y)<5;
    bas2=null;
    if(c && VM.sel && !VM.mode && !viserVeh(e)) deselectionnerVeh();
  });
  addEventListener('keydown',function(e){
    if(!ouvert || e.ctrlKey || e.metaKey || e.altKey) return;
    var tg=e.target;
    if(tg && ((tg.tagName==='INPUT' && tg.type!=='range') || tg.tagName==='TEXTAREA' || tg.tagName==='SELECT')) return;
    var k=e.key;
    if(VM.mode){ if(k==='Escape'){ sortirModeVeh(); e.preventDefault(); e.stopImmediatePropagation(); } return; }
    if(!VM.sel) return;
    if(k==='Escape'){ deselectionnerVeh(); e.preventDefault(); e.stopImmediatePropagation(); }
    else if(k==='Delete' || k==='Backspace'){ supprimerSelVeh(); e.preventDefault(); e.stopImmediatePropagation(); }
    else if(k==='r' || k==='R'){ tournerVeh(e.shiftKey?-15:15); e.preventDefault(); e.stopImmediatePropagation(); }
  },true);
}

/* ---------------- autres parcours : trait plein, jalonneurs, matériel, véhicules ---------------- */
var AUTRES_OBJ={jal:[], meshes:[], veh:[]};
function viderAutresObjets(){
  AUTRES_OBJ.jal.forEach(function(o){
    supprimerObjJalon(o);
    if(typeof EQUIP!=='undefined' && EQUIP.maillages) EQUIP.maillages=EQUIP.maillages.filter(function(m){ return m.userData.proprio!==o; });
  });
  AUTRES_OBJ.meshes.forEach(function(m){ monde.remove(m); if(m.isInstancedMesh) m.dispose(); else if(m.geometry) m.geometry.dispose(); });
  AUTRES_OBJ.veh.forEach(function(o){ monde.remove(o); });
  AUTRES_OBJ={jal:[], meshes:[], veh:[]};
}
function tapeRubalises(R){
  if(!EQ.matTape) EQ.matTape=new THREE.MeshStandardMaterial({map:texRubalise(), side:THREE.DoubleSide, roughness:0.45, metalness:0});
  var tape=new Tas(16384), blanc=teinte(0xf2f2ee), demi=0.028;
  R.forEach(function(r){
    var N=noeudsRubalise(r), Yn=N.map(function(n){ return hauteurSol(n[0],n[1]); }), du=0;
    for(var i=1;i<N.length;i++){
      var a=N[i-1], b=N[i], L=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(L<0.05) continue;
      var nx=-(b[1]-a[1])/L, nz=(b[0]-a[0])/L, fl=Math.min(0.14,0.018*L), S=8;
      for(var s=0;s<S;s++){
        var t0=s/S, t1=(s+1)/S;
        var x0=a[0]+(b[0]-a[0])*t0+nx*EQ_DECAL, z0=a[1]+(b[1]-a[1])*t0+nz*EQ_DECAL;
        var x1=a[0]+(b[0]-a[0])*t1+nx*EQ_DECAL, z1=a[1]+(b[1]-a[1])*t1+nz*EQ_DECAL;
        var y0=Yn[i-1]+(Yn[i]-Yn[i-1])*t0+EQ_HAUT-fl*4*t0*(1-t0), y1=Yn[i-1]+(Yn[i]-Yn[i-1])*t1+EQ_HAUT-fl*4*t1*(1-t1);
        var u0=(du+L*t0)/0.9, u1=(du+L*t1)/0.9;
        tape.tri(x0,y0-demi,z0, x1,y1-demi,z1, x1,y1+demi,z1, nx,0,nz,[u0,0,u1,0,u1,1],blanc);
        tape.tri(x0,y0-demi,z0, x1,y1+demi,z1, x0,y0+demi,z0, nx,0,nz,[u0,0,u1,1,u0,1],blanc);
      }
      du+=L;
    }
  });
  if(tape.vide()) return null;
  var m=new THREE.Mesh(tape.geo(),EQ.matTape);
  m.castShadow=true;
  return m;
}
function texteSur(hex){
  var c=new THREE.Color(hex);
  return (0.3*c.r+0.59*c.g+0.11*c.b)>0.55 ? '#0B1019' : '#ffffff';
}
construireAutresParcours=function(){
  if(AUTRES){ monde.remove(AUTRES); liberer(AUTRES); AUTRES=null; }
  AUTRES_MINI=[];
  viderAutresObjets();
  if(!window.CARTE || !CARTE.autresParcours) return;
  var L=CARTE.autresParcours();
  if(!L.length) return;
  if(!MAT_AUTRES) MAT_AUTRES=new THREE.MeshBasicMaterial({vertexColors:true, transparent:true, opacity:0.9, depthWrite:false,
        polygonOffset:true, polygonOffsetFactor:-5, polygonOffsetUnits:-5});
  AUTRES=new THREE.Group();
  L.forEach(function(p){
    var pts=[];
    p.trace.forEach(function(q){
      var x=pX(q[1]), z=pZ(q[0]), m=pts.length;
      if(m && Math.hypot(x-pts[m-2],z-pts[m-1])<0.3) return;
      pts.push(x,z);
    });
    if(pts.length>=4){
      var tas=new Tas(16384), q=densifier(pts,4), mini=[];
      ruban(tas,pts,1.1,teinte(p.couleur),0.2,2,4);
      for(var i=0;i<q.x.length;i+=2) mini.push(q.x[i],q.z[i]);
      AUTRES_MINI.push({couleur:p.couleur, pts:mini});
      if(!tas.vide()){ var me=new THREE.Mesh(tas.geo(),MAT_AUTRES); me.renderOrder=2; AUTRES.add(me); }
    }
    (p.jalons||[]).forEach(function(j,k){
      try{
        if(j._vis===undefined) j._vis=Math.abs(Math.round(j.la*1e5)+Math.round(j.lo*1e5))%4;
        var o=creerObjJalon(j);
        majJalonneur(o,k+1);
        if(o.etiq){ monde.remove(o.etiq); o.etiq.material.map.dispose(); o.etiq.material.dispose(); }
        o.etiq=etiquette(p.nom+(k+1), p.couleur, '#ffffff', texteSur(p.couleur), 96, 0.78);
        o.etiq.position.set(o.x,o.lod.position.y+2.1,o.z);
        monde.add(o.etiq);
        AUTRES_OBJ.jal.push(o);
      }catch(er){ console.error(er); }
    });
    var T=(p.barrieres||[]).concat(p.ancrages||[]);
    if(T.length){
      preparerModeleBarriere();
      var im=new THREE.InstancedMesh(EQ.geoBar,EQ.matBar,T.length);
      T.forEach(function(b,i){ im.setMatrixAt(i,matriceBarriere(pX(b.lo),pZ(b.la),b.ang)); });
      im.castShadow=true; im.receiveShadow=true; im.computeBoundingSphere();
      monde.add(im); AUTRES_OBJ.meshes.push(im);
    }
    if(p.rubalises && p.rubalises.length){ var mt=tapeRubalises(p.rubalises); if(mt){ monde.add(mt); AUTRES_OBJ.meshes.push(mt); } }
    if(VM.pret) (p.vehicules||[]).forEach(function(v){ var o=creerObjVeh(v); if(o){ placerObjVeh(o,v); monde.add(o); AUTRES_OBJ.veh.push(o); } });
  });
  monde.add(AUTRES);
  AUTRES.visible=TRACE_VISIBLE;
};
var _majJalVisY=majJalonsVisibles;
majJalonsVisibles=function(cx,cz){
  _majJalVisY(cx,cz);
  var D=PERF.dist;
  AUTRES_OBJ.jal.forEach(function(o){
    var d=Math.hypot(o.x-cx,o.z-cz);
    o.lod.visible=d<D;
    if(o.etiq) o.etiq.visible=d<Math.max(D*1.6,400);
  });
};

/* ---------------- panneau « Parcours » de la 3D ---------------- */
function fkm(k){ return k.toFixed(2).replace('.',',')+' km'; }
function panneauParcours3D(){
  var p=$e('e3-parc');
  if(p) return p;
  var s=document.createElement('style');
  s.textContent=[
    '#e3-parc{position:absolute;right:12px;top:118px;width:320px;z-index:8;background:rgba(14,20,31,.96);border:1px solid #3a4a63;border-radius:14px;padding:12px 13px;box-shadow:0 10px 30px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:7px;color:#dfe6f0;font-size:12.5px}',
    '#e3-parc .e3-eq-tete{display:flex;align-items:center;justify-content:space-between;gap:8px}',
    '#e3-parc .pl{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:9px;border:1px solid #2c3a50;background:rgba(255,255,255,.03)}',
    '#e3-parc .pl.actif{border-color:var(--c)}',
    '#e3-parc .pt{width:12px;height:12px;border-radius:50%;flex:none}',
    '#e3-parc .pl span{margin-left:auto;opacity:.75;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '#e3-parc label{display:flex;align-items:center;gap:6px;cursor:pointer}',
    '#e3 #e3-parc .pl button{padding:4px 8px;font-size:11.5px}',
    '#e3-parc p{margin:0;color:#98A3B6;font-size:11.5px;line-height:1.4}'
  ].join('\n');
  document.head.appendChild(s);
  p=document.createElement('div');
  p.id='e3-parc'; p.hidden=true;
  $e('e3').appendChild(p);
  p.addEventListener('change',function(ev){
    var c=ev.target;
    if(!c.dataset || c.dataset.i===undefined) return;
    c.blur();
    CARTE.afficherParcours(+c.dataset.i,c.checked);
    dire(c.checked ? 'Parcours '+c.dataset.nom+' affiché avec ses jalonneurs, barrières, rubalise et véhicules.' : 'Parcours '+c.dataset.nom+' masqué.');
  });
  p.addEventListener('click',function(ev){
    var b=ev.target.closest ? ev.target.closest('button') : null;
    if(!b) return;
    b.blur();
    if(b.dataset.a==='fermer'){ p.hidden=true; majBoutonParc(); }
    else if(b.dataset.a==='modifier'){
      if(VM.mode) sortirModeVeh();
      if(VM.sel) deselectionnerVeh();
      if(EQ.mode) sortirMode();
      CARTE.activerParcours(+b.dataset.i);
      dire('Parcours '+b.dataset.nom+' en cours de modification : ses jalonneurs, barrières, rubalise et véhicules sont chargés.');
      setTimeout(majPanneauParcours3D,120);
    }
  });
  return p;
}
function majPanneauParcours3D(){
  var p=$e('e3-parc');
  if(!p || p.hidden || !window.CARTE || !CARTE.parcoursListe) return;
  var h='<div class="e3-eq-tete"><b>🧭 Parcours</b><button class="e3-x" data-a="fermer" title="Fermer">✕</button></div>';
  CARTE.parcoursListe().forEach(function(q){
    h+='<div class="pl'+(q.actif?' actif':'')+'" style="--c:'+q.couleur+'"><i class="pt" style="background:'+q.couleur+'"></i>'+
      (q.actif ? '<b>Parcours '+q.nom+'</b><span>'+fkm(q.km)+' · en cours</span>'
               : '<label><input type="checkbox" data-i="'+q.i+'" data-nom="'+q.nom+'"'+(q.visible?' checked':'')+'><b>Parcours '+q.nom+'</b></label><span>'+fkm(q.km)+'</span>'+
                 '<button data-a="modifier" data-i="'+q.i+'" data-nom="'+q.nom+'" title="Rendre ce parcours actif">Modifier</button>')+
      '</div>';
  });
  h+='<p>Coche un parcours pour l’afficher en trait plein de sa couleur, avec ses jalonneurs (étiquette à sa lettre), ses barrières, sa rubalise et ses véhicules. Seul le parcours en cours se modifie.</p>';
  if(p.__h!==h){ p.innerHTML=h; p.__h=h; }
}
function majBoutonParc(){ var b=$e('e3-b-parc'), p=$e('e3-parc'); if(b) b.classList.toggle('on',!!(p && !p.hidden)); }
function basculerPanneauParcours(){
  var p=panneauParcours3D();
  p.hidden=!p.hidden;
  majPanneauParcours3D(); majBoutonParc();
}
var _signalerY=window.ESPACE3D.signaler;
window.ESPACE3D.signaler=function(t){
  _signalerY(t);
  if(t==='parcours' || t==='route') setTimeout(majPanneauParcours3D,80);
};

/* ---------------- branchements ---------------- */
var _brancherY=brancherInterface;
brancherInterface=function(){
  _brancherY();
  var barre=document.querySelector('#e3 .e3-barre'), aide=$e('e3-aide');
  if(barre && !$e('e3-b-veh')){
    var bp=document.createElement('button');
    bp.id='e3-b-parc'; bp.type='button'; bp.textContent='🧭 Parcours';
    bp.title='Afficher les autres parcours en 3D avec leurs jalonneurs, barrières, rubalise et véhicules';
    bp.onclick=function(){ basculerPanneauParcours(); bp.blur(); };
    barre.insertBefore(bp,aide);
    var bv=document.createElement('button');
    bv.id='e3-b-veh'; bv.type='button'; bv.textContent='🪖 Véhicules et 👮 policiers';
    bv.title='Poser à la main des véhicules militaires (char, camion, utilitaire) et des policiers';
    bv.onclick=function(){ basculerModeVeh(); bv.blur(); };
    barre.insertBefore(bv,aide);
  }
  var boite=document.querySelector('#e3-aidem .e3-boite'), credit=boite && boite.querySelector('.e3-credit');
  if(boite && !$e('e3-aide-veh')){
    var h=document.createElement('h3'); h.id='e3-aide-veh'; h.textContent='Véhicules militaires et parcours';
    var p=document.createElement('p');
    p.innerHTML='<b>🪖 Véhicules</b> : choisis char, camion ou utilitaire puis clique dans la scène ; ils ne sont jamais posés automatiquement. '+
      'Clique un véhicule pour le tourner ou le supprimer, tire-le pour le déplacer (R pour tourner de 15°). '+
      '<b>🧭 Parcours</b> : coche les autres parcours pour les voir en trait plein de leur couleur avec leurs jalonneurs, barrières, rubalise et véhicules ; « Modifier » rend un parcours actif.';
    boite.insertBefore(h,credit); boite.insertBefore(p,credit);
  }
  brancherVehicules();
};

/* ---------------- passage garanti sur le tracé et les rues ---------------- */
/* les cellules de collision (5 m) des bâtiments et de la rivière débordaient sur certains chemins,
   par exemple le long du Quai des Tanneries : on passe toujours sur le tracé et sur les rues */
var _bloquerY=bloquer;
bloquer=function(x,z){
  if(!_bloquerY(x,z)) return false;
  if(TRACE.length && surLeParcours(x,z).ecart<2.4) return false;
  if(Dvoies){
    var I=IDX_SOL||(IDX_SOL=indexerChaussees(Dvoies)), rp=routeProche(I,x,z,10);
    if(rp && rp.d<rp.w/2+0.6 && tablierEn(x,z)===null && !(TOPO.masque && TOPO.niv && hauteurGrille(x,z)<nivEauProche(x,z)-0.5)) return false;
  }
  return true;
};
function nivEauProche(x,z){
  var jc=Math.round((x-XMIN)/PASX), ic=Math.round((ZMAX-z)/PASZ);
  if(ic<0||jc<0||ic>=GROWS||jc>=GCOLS) return -1e9;
  var o=ic*GCOLS+jc;
  return TOPO.masque[o]===2 ? TOPO.niv[o] : -1e9;
}

/* ---------------- silhouette du coureur à travers les murs ---------------- */
var XRAY={mat:null, t:0, cache:false};
function coureurCache(cam){
  if(!joueur) return false;
  var ax=cam.position.x, az=cam.position.z, bx=J.x, bz=J.z, L=Math.hypot(bx-ax,bz-az);
  if(L<2.5) return false;
  var n=Math.ceil(L/1.5);
  for(var i=1;i<n;i++){
    var t=i/n;
    if(L*(1-t)<1.2) break;
    if(_bloquerY(ax+(bx-ax)*t,az+(bz-az)*t)) return true;
  }
  return false;
}
function dessinerSilhouette(rendu,cam){
  if(VUE!=='tp' || !joueur || !joueur.visible) return;
  var t=performance.now();
  if(t-XRAY.t>120){ XRAY.t=t; XRAY.cache=coureurCache(cam); }
  if(!XRAY.cache) return;
  if(!XRAY.mat) XRAY.mat=new THREE.MeshBasicMaterial({color:0xF2B33D, transparent:true, opacity:0.5, depthTest:false, depthWrite:false});
  var liste=[];
  joueur.traverse(function(o){ if(o.isMesh && o.visible){ liste.push([o,o.material]); o.material=XRAY.mat; } });
  var ac=renderer.autoClear, su=renderer.shadowMap.autoUpdate;
  renderer.autoClear=false; renderer.shadowMap.autoUpdate=false;
  try{ rendu(joueur,cam); }
  finally{
    renderer.autoClear=ac; renderer.shadowMap.autoUpdate=su;
    liste.forEach(function(e){ e[0].material=e[1]; });
  }
}
var _brancherSil=brancherInterface;
brancherInterface=function(){
  _brancherSil();
  if(renderer && !renderer.__silhouette){
    renderer.__silhouette=true;
    var rendu=renderer.render.bind(renderer);
    renderer.render=function(sc,cam){
      rendu(sc,cam);
      if(sc===scene) dessinerSilhouette(rendu,cam);
    };
  }
};
/* =================================================================
   Fusil d'assaut dans les mains du coureur : modèle « M4 » de
   Kristian M (CC-BY 3.0, Poly Pizza), modèle maison en secours.
   Vue à la 3e personne : crosse calée dans le creux de l'épaule droite,
   position de garde basse, mains posées sur l'arme par cinématique
   inverse des bras, buste légèrement penché en course.
   Vue à la première personne : arme et avant-bras en bas à droite de
   l'écran, dessinés par-dessus la scène comme dans les jeux vidéo.
================================================================= */
/* vraiFP : en première personne, on voit ses propres bras et l'arme tenue (corps sans tête) */
var FUSIL={gabarit:null, mat:null, obj:null, vm:null, vmScene:null, vmHemi:null, vmDir:null, err:false, actif:true, source:'', vraiFP:true};
/* repère de l'arme : +x vers la bouche du canon, +y vers le haut, +z à droite ; origine sur la poignée */
var FUSIL_MAIN_G=[0.225,0.088,-0.012];
var FUSIL_CROSSE=[-0.20,0.079,0];
/* M4 : échelle et point de poignée dans les unités du fichier (canon vers -x) */
var M4_ECHELLE=0.0545, M4_POIGNEE=[2.65,-0.85,0.18];

function faceQuad(tas,a,b,c,d,col){
  var ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2], vx=d[0]-a[0], vy=d[1]-a[1], vz=d[2]-a[2];
  var nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx, l=Math.hypot(nx,ny,nz)||1;
  nx/=l; ny/=l; nz/=l;
  tas.tri(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2], nx,ny,nz,[0,0,1,0,1,1],col);
  tas.tri(a[0],a[1],a[2], c[0],c[1],c[2], d[0],d[1],d[2], nx,ny,nz,[0,0,1,1,0,1],col);
}
function boiteFusil(tas,cx,cy,cz,hx,hy,hz,rot,col){
  var c=Math.cos(rot||0), s=Math.sin(rot||0);
  function P(x,y,z){ return [cx+x*c-y*s, cy+x*s+y*c, cz+z]; }
  var p=[P(-hx,-hy,-hz),P(hx,-hy,-hz),P(hx,hy,-hz),P(-hx,hy,-hz),P(-hx,-hy,hz),P(hx,-hy,hz),P(hx,hy,hz),P(-hx,hy,hz)];
  faceQuad(tas,p[4],p[5],p[6],p[7],col); faceQuad(tas,p[1],p[0],p[3],p[2],col);
  faceQuad(tas,p[5],p[1],p[2],p[6],col); faceQuad(tas,p[0],p[4],p[7],p[3],col);
  faceQuad(tas,p[7],p[6],p[2],p[3],col); faceQuad(tas,p[0],p[1],p[5],p[4],col);
}
/* modèle maison (secours si le M4 ne se charge pas) */
function geoFusilMaison(){
  var t=new Tas(8192), noir=teinte(0x1b1c1e), gris=teinte(0x2d2f33), metal=teinte(0x44484d);
  boiteFusil(t,0.02,0.072,0, 0.11,0.03,0.018,0,noir);
  boiteFusil(t,0.03,0.114,0, 0.125,0.017,0.02,0,gris);
  boiteFusil(t,-0.015,-0.005,0, 0.018,0.055,0.015,-0.28,noir);
  boiteFusil(t,0.088,-0.02,0, 0.022,0.085,0.013,0.25,gris);
  tube(t,0.15,0.1,0, 0.42,0.1,0, 0.029,0.029,8,gris,true,true);
  tube(t,0.42,0.105,0, 0.60,0.105,0, 0.009,0.009,8,metal,false,true);
  tube(t,-0.10,0.1,0, -0.20,0.1,0, 0.016,0.016,8,noir,false,true);
  boiteFusil(t,-0.17,0.088,0, 0.05,0.034,0.021,0,noir);
  return t.geo();
}
function preparerGabaritFusil(){
  FUSIL.mat=new THREE.MeshStandardMaterial({color:0x2a2c2f, roughness:0.5, metalness:0.45});
  return chargerGLB('mil_m4.glb').then(function(g){
    var sc=g.scene, lum=[];
    sc.traverse(function(o){ if(o.isLight) lum.push(o); });
    lum.forEach(function(o){ if(o.parent) o.parent.remove(o); });
    sc.traverse(function(o){ if(o.isMesh){ o.material=FUSIL.mat; o.castShadow=true; o.receiveShadow=true; if(o.geometry.attributes.normal===undefined) o.geometry.computeVertexNormals(); } });
    sc.position.set(-M4_POIGNEE[0],-M4_POIGNEE[1],-M4_POIGNEE[2]);
    var corps=new THREE.Group();
    corps.add(sc);
    corps.rotation.y=PI;               /* canon du fichier vers -x : on le retourne vers +x */
    corps.scale.setScalar(M4_ECHELLE);
    var pivot=new THREE.Group();
    pivot.add(corps);
    FUSIL.gabarit=pivot; FUSIL.source='M4';
  }).catch(function(e){
    console.error('Fusil M4',e);
    var m=new THREE.Mesh(geoFusilMaison(),new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.55, metalness:0.35, side:THREE.DoubleSide}));
    m.castShadow=true;
    var pivot=new THREE.Group(); pivot.add(m);
    FUSIL.gabarit=pivot; FUSIL.source='maison';
  });
}

/* ---------------- 3e personne : arme calée à l'épaule, bras posés dessus ---------------- */
var _fq=new THREE.Quaternion(), _fm=new THREE.Matrix4();
/* normale de la paume (sortant de la paume), axe de la main et axe transversal index → auriculaire */
function normalePaume(B,S){
  var ha=B['Bip01_'+S+'_Hand'], m2=B['Bip01_'+S+'_Finger2'], i1=B['Bip01_'+S+'_Finger1'], i4=B['Bip01_'+S+'_Finger4']||B['Bip01_'+S+'_Finger3'];
  if(!ha || !m2 || !i1 || !i4) return null;
  var ph=ha.getWorldPosition(new THREE.Vector3());
  var le=m2.getWorldPosition(new THREE.Vector3()).sub(ph).normalize();
  var tr=i1.getWorldPosition(new THREE.Vector3()).sub(i4.getWorldPosition(new THREE.Vector3())).normalize();
  var n=new THREE.Vector3().crossVectors(le,tr).normalize();
  /* côté paume : celui vers lequel les doigts se plient naturellement (pose de repos ou animée) */
  var bout=B['Bip01_'+S+'_Finger22']||B['Bip01_'+S+'_Finger21'], sur=false;
  if(bout){
    var d=bout.getWorldPosition(new THREE.Vector3()).sub(m2.getWorldPosition(new THREE.Vector3())).normalize();
    var c=d.sub(le.clone().multiplyScalar(d.dot(le)));
    if(c.lengthSq()>0.01){ if(c.dot(n)<0) n.negate(); sur=true; }
  }
  if(!sur && S==='L') n.negate();
  return {n:n, le:le, tr:tr, ph:ph};
}
/* fait tourner la main autour de son axe pour orienter la paume vers « paume » */
function tournerPaume(B,S,paume,ax){
  var ha=B['Bip01_'+S+'_Hand'], P=normalePaume(B,S);
  if(!P) return;
  var np=P.n.clone().sub(ax.clone().multiplyScalar(P.n.dot(ax))).normalize();
  var ci=paume.clone().sub(ax.clone().multiplyScalar(paume.dot(ax))).normalize();
  var ang=Math.atan2(new THREE.Vector3().crossVectors(np,ci).dot(ax), np.dot(ci));
  tournerOsMonde(ha,ax,ang);
}
/* doigts repliés autour de l'arme ; les phalanges repartent de leur pose de repos à chaque image */
var DOIGTS=[['1','11','12'],['2','21','22'],['3','31','32'],['4','41','42'],['0','01','02']];
function fermerMain(B,S,force){
  var repos=B.__reposDoigts||(B.__reposDoigts={});
  DOIGTS.forEach(function(ch){ ch.forEach(function(nom){
    var o=B['Bip01_'+S+'_Finger'+nom];
    if(!o) return;
    if(!repos[o.name]) repos[o.name]=o.quaternion.clone();
    o.quaternion.copy(repos[o.name]);
  }); });
  var ha=B['Bip01_'+S+'_Hand'];
  if(ha) ha.updateMatrixWorld(true);
  var P=normalePaume(B,S);
  if(!P) return;
  /* sens de flexion : celui qui rapproche le bout du majeur de la paume */
  var m=B['Bip01_'+S+'_Finger2'], bout=B['Bip01_'+S+'_Finger22']||B['Bip01_'+S+'_Finger21'], signe=1;
  if(m && bout){
    var q0=m.quaternion.clone();
    tournerOsMonde(m,P.tr,0.5);
    var dp=bout.getWorldPosition(new THREE.Vector3()).sub(P.ph).dot(P.n);
    m.quaternion.copy(q0); m.updateMatrixWorld(true);
    tournerOsMonde(m,P.tr,-0.5);
    var dm=bout.getWorldPosition(new THREE.Vector3()).sub(P.ph).dot(P.n);
    m.quaternion.copy(q0); m.updateMatrixWorld(true);
    signe=dp>dm?1:-1;
  }
  DOIGTS.forEach(function(ch,k){
    ch.forEach(function(nom,j){
      var o=B['Bip01_'+S+'_Finger'+nom];
      if(!o) return;
      if(k===4) tournerOsMonde(o,P.le,signe*force*0.3);
      else tournerOsMonde(o,P.tr,signe*force*(j===0?0.85:0.7));
    });
  });
}
function ikBras(B,S,cible,pole,dirMain,paume,serrer){
  var up=B['Bip01_'+S+'_UpperArm'], fo=B['Bip01_'+S+'_Forearm'], ha=B['Bip01_'+S+'_Hand'];
  if(!up || !fo || !ha) return;
  var pS=up.getWorldPosition(new THREE.Vector3()), pE=fo.getWorldPosition(new THREE.Vector3()), pH=ha.getWorldPosition(new THREE.Vector3());
  var a=pS.distanceTo(pE), b=pE.distanceTo(pH);
  var dv=cible.clone().sub(pS), d=Math.min(Math.max(dv.length(),0.05),a+b-0.002), u=dv.normalize();
  var x=(a*a-b*b+d*d)/(2*d), r=Math.sqrt(Math.max(0,a*a-x*x));
  var p=pole.clone().sub(u.clone().multiplyScalar(pole.dot(u)));
  if(p.lengthSq()<1e-6) p.set(0,-1,0);
  p.normalize();
  var E=pS.clone().add(u.clone().multiplyScalar(x)).add(p.multiplyScalar(r));
  orienterOs(up,fo,E.clone().sub(pS));
  orienterOs(fo,ha,pS.clone().add(u.multiplyScalar(d)).sub(E));
  var doigt=B['Bip01_'+S+'_Finger2'] || B['Bip01_'+S+'_Finger1'];
  if(doigt && dirMain) orienterOs(ha,doigt,dirMain);
  if(dirMain && paume) tournerPaume(B,S,paume,dirMain);
  if(serrer) fermerMain(B,S,serrer);
}
var _axeDroite=new THREE.Vector3();
function poserFusil(){
  if(!FUSIL.obj) return;
  if(!joueur || !joueur.userData || !joueur.userData.reel || !FUSIL.actif){ FUSIL.obj.visible=false; return; }
  var B=joueur.userData.os||(joueur.userData.os=osAvatar(joueur));
  var sp=B.Bip01_Spine2||B.Bip01_Spine1||B.Bip01_Spine, epD=B.Bip01_R_UpperArm, sp1=B.Bip01_Spine1;
  if(!sp || !epD){ FUSIL.obj.visible=false; return; }
  /* en première personne, le corps est dessiné quand même (sans la tête) : la pose doit être calculée */
  var enFP=(VUE==='fp' && FUSIL.vraiFP);
  FUSIL.obj.visible=joueur.visible || enFP;
  if(!joueur.visible && !enFP) return;
  joueur.updateMatrixWorld(true);
  joueur.getWorldQuaternion(_fq);
  var A=new THREE.Vector3(1,0,0).applyQuaternion(_fq), D=new THREE.Vector3(0,0,1).applyQuaternion(_fq), U=new THREE.Vector3(0,1,0);
  var vit=Math.min(1,Math.abs(J.v)/5);
  /* buste un peu penché vers l'avant en course */
  if(sp1 && vit>0.05){ _axeDroite.copy(D); tournerOsMonde(sp1,_axeDroite,-0.10*vit); }
  var torse=sp.getWorldPosition(new THREE.Vector3()), epaule=epD.getWorldPosition(new THREE.Vector3());
  /* creux de l'épaule droite : entre l'épaule et le sternum, un peu devant et dessous */
  var creux=epaule.clone().lerp(torse,0.36).add(A.clone().multiplyScalar(0.0)).add(U.clone().multiplyScalar(-0.06));
  /* 3e personne : garde basse, canon vers l'avant et le bas, légèrement vers l'axe du corps.
     1re personne : arme relevée, presque horizontale, qui suit le regard (visible en bas à droite de l'écran). */
  var lacet=0.26, tangage=0.46-0.06*vit;
  if(enFP){
    A.set(Math.cos(CAM.yaw),0,Math.sin(CAM.yaw)); D.set(-Math.sin(CAM.yaw),0,Math.cos(CAM.yaw));
    lacet=0.07;
    tangage=Math.max(-0.9,Math.min(0.9,0.07-(CAM.fpPitch||0)*0.85));
    creux.add(U.clone().multiplyScalar(0.05));
  }
  var f=A.clone().multiplyScalar(Math.cos(tangage)*Math.cos(lacet))
        .add(D.clone().multiplyScalar(-Math.cos(tangage)*Math.sin(lacet)))
        .add(U.clone().multiplyScalar(-Math.sin(tangage))).normalize();
  var haut=U.clone().sub(f.clone().multiplyScalar(U.dot(f))).normalize();
  var cote=new THREE.Vector3().crossVectors(f,haut);
  _fm.makeBasis(f,haut,cote);
  FUSIL.obj.quaternion.setFromRotationMatrix(_fm);
  /* la plaque de crosse se pose dans le creux de l'épaule */
  FUSIL.obj.position.copy(creux)
    .sub(f.clone().multiplyScalar(FUSIL_CROSSE[0])).sub(haut.clone().multiplyScalar(FUSIL_CROSSE[1])).sub(cote.clone().multiplyScalar(FUSIL_CROSSE[2]));
  FUSIL.obj.updateMatrixWorld(true);
  /* cibles du poignet : en retrait du point de prise, pour que la paume (et non le poignet) soit sur l'arme */
  var dirD=haut.clone().multiplyScalar(-0.85).add(f.clone().multiplyScalar(0.45)).normalize();
  var dirG=cote.clone().multiplyScalar(0.8).add(haut.clone().multiplyScalar(0.35)).add(f.clone().multiplyScalar(0.3)).normalize();
  var mainD=new THREE.Vector3(-0.01,-0.005,0).applyMatrix4(FUSIL.obj.matrixWorld).sub(dirD.clone().multiplyScalar(0.055)).add(cote.clone().multiplyScalar(0.025));
  var mainG=new THREE.Vector3(FUSIL_MAIN_G[0],FUSIL_MAIN_G[1],FUSIL_MAIN_G[2]).applyMatrix4(FUSIL.obj.matrixWorld).sub(dirG.clone().multiplyScalar(0.06)).sub(haut.clone().multiplyScalar(0.035));
  /* coude droit sorti vers le bas et l'extérieur, coude gauche sous l'arme */
  /* main droite : doigts le long de la poignée, paume contre la poignée, doigts refermés dessus */
  ikBras(B,'R',mainD, D.clone().multiplyScalar(0.8).add(U.clone().multiplyScalar(-1.0)).add(A.clone().multiplyScalar(-0.3)),
         haut.clone().multiplyScalar(-0.85).add(f.clone().multiplyScalar(0.45)).normalize(), cote.clone().negate(), 1.0);
  /* main gauche : sous le garde-main, paume vers le haut, doigts refermés par-dessus */
  ikBras(B,'L',mainG, D.clone().multiplyScalar(-0.35).add(U.clone().multiplyScalar(-1.0)).add(A.clone().multiplyScalar(-0.1)),
         cote.clone().multiplyScalar(0.8).add(haut.clone().multiplyScalar(0.35)).add(f.clone().multiplyScalar(0.3)).normalize(), haut.clone(), 0.85);
}
var _majJoueurFusil=majJoueur;
majJoueur=function(dt){
  _majJoueurFusil(dt);
  try{ poserFusil(); }catch(e){ if(!FUSIL.err){ FUSIL.err=true; console.error('Fusil',e); } }
};

/* ---------------- première personne : arme en bas à droite de l'écran ---------------- */
var _fv=new THREE.Vector3(), _fqOff=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,PI/2+0.01,0.02,'YXZ'));
function creerVueFusil(){
  FUSIL.vmScene=new THREE.Scene();
  FUSIL.vmHemi=new THREE.HemisphereLight(0xe6eeff,0x3a3326,1.15);
  FUSIL.vmDir=new THREE.DirectionalLight(0xffffff,1.5);
  FUSIL.vmScene.add(FUSIL.vmHemi); FUSIL.vmScene.add(FUSIL.vmDir); FUSIL.vmScene.add(FUSIL.vmDir.target);
  var g=new THREE.Group(), t=new Tas(2048), camo=teinte(0x4f5436), gant=teinte(0x202123);
  g.add(FUSIL.gabarit.clone(true));
  /* avant-bras en treillis et gants noirs, qui entrent par le bas de l'écran */
  /* avant-bras en V vers les coins bas de l'écran : manchette de treillis puis gant */
  tube(t,-0.06,-0.06,0.05, -0.20,-0.34,0.30, 0.040,0.056,10,camo,false,false);
  tube(t,-0.035,-0.035,0.035, -0.07,-0.075,0.06, 0.036,0.041,10,teinte(0x3e422b),false,false);
  tube(t,-0.03,0.025,0.02, -0.035,-0.04,0.03, 0.028,0.032,8,gant,true,true);
  tube(t,FUSIL_MAIN_G[0]-0.05,0.01,-0.07, 0.02,-0.30,-0.34, 0.040,0.056,10,camo,false,false);
  tube(t,FUSIL_MAIN_G[0]-0.02,0.045,-0.045, FUSIL_MAIN_G[0]-0.055,0.005,-0.075, 0.036,0.041,10,teinte(0x3e422b),false,false);
  tube(t,FUSIL_MAIN_G[0]-0.02,0.07,-0.035, FUSIL_MAIN_G[0]+0.04,0.07,0.012, 0.027,0.027,8,gant,true,true);
  g.add(new THREE.Mesh(t.geo(),new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.85, metalness:0})));
  g.traverse(function(o){ if(o.isMesh){ o.frustumCulled=false; o.castShadow=false; } });
  FUSIL.vm=g;
  FUSIL.vmScene.add(g);
}
function majVueFusil(cam){
  var bob=Math.min(1,Math.abs(J.v)/4.5), ph=J.phase||0;
  _fv.set(0.17+Math.sin(ph)*0.01*bob, -0.22-Math.abs(Math.sin(ph))*0.016*bob, -0.60).applyQuaternion(cam.quaternion).add(cam.position);
  FUSIL.vm.position.copy(_fv);
  FUSIL.vm.quaternion.copy(cam.quaternion).multiply(_fqOff);
  var n=(typeof nuit!=='undefined' && nuit);
  FUSIL.vmHemi.intensity=n?0.5:1.15;
  FUSIL.vmDir.intensity=n?0.7:1.5;
  FUSIL.vmDir.position.copy(cam.position).add(_fv.set(3,8,2));
  FUSIL.vmDir.target.position.copy(cam.position);
  FUSIL.vmDir.target.updateMatrixWorld();
  FUSIL.vmScene.environment=scene.environment||null;
}
function rendreVueFusil(cam){
  majVueFusil(cam);
  var ac=renderer.autoClear, su=renderer.shadowMap.autoUpdate;
  renderer.autoClear=false; renderer.shadowMap.autoUpdate=false;
  renderer.clearDepth();
  try{ renderer.render(FUSIL.vmScene,cam); }
  finally{ renderer.autoClear=ac; renderer.shadowMap.autoUpdate=su; }
}

function etapeFusil(){
  return preparerGabaritFusil().then(function(){
    FUSIL.obj=FUSIL.gabarit.clone(true);
    FUSIL.obj.traverse(function(o){ if(o.isMesh) o.castShadow=true; });
    scene.add(FUSIL.obj);
    creerVueFusil();
    poserFusil();
  });
}
ETAPES.push(['Fusil du coureur',etapeFusil]);

var _brancherFusil=brancherInterface;
brancherInterface=function(){
  _brancherFusil();
  if(renderer && !renderer.__fusil){
    renderer.__fusil=true;
    var precedent=renderer.render;
    renderer.render=function(sc,cam){
      var reel=!!(joueur && joueur.userData && joueur.userData.reel && FUSIL.actif);
      if(sc===scene && FUSIL.obj){
        /* vraie première personne : le corps du coureur et son arme, sans la tête */
        if(VUE==='fp' && reel && FUSIL.vraiFP && joueur.userData.os && joueur.userData.os.Bip01_Head){
          var tete=joueur.userData.os.Bip01_Head, echelle=tete.scale.clone(), vis=joueur.visible;
          joueur.visible=true; FUSIL.obj.visible=true;
          tete.scale.setScalar(0.001); tete.updateMatrixWorld(true);
          try{ precedent.call(renderer,sc,cam); }
          finally{ joueur.visible=vis; tete.scale.copy(echelle); tete.updateMatrixWorld(true); }
          return;
        }
        /* l'arme portée suit la visibilité du corps */
        FUSIL.obj.visible=reel && joueur.visible;
      }
      precedent.call(renderer,sc,cam);
      if(sc===scene && VUE==='fp' && FUSIL.vm && reel && !FUSIL.vraiFP) rendreVueFusil(cam);
    };
  }
};
/* =================================================================
   Rendu réaliste (1/3) : ciel photographique HDR (Poly Haven, CC0),
   soleil calé sur celui de la photo, brouillard couleur d'horizon,
   qualité Basse moins dégradée, réglages de performance remis à neuf.
================================================================= */
var RENDU={fond:1.0, env:0.55, soleil:2.5, hemi:0.12, expo:0.78};
var CIELHDR={tex:null, env:null, soleil:null, brume:null, elev:0};

/* qualité Basse : ombres proches et arbres détaillés à mi-distance */
QUALITES[0].ombre=45; QUALITES[0].carte=1024; QUALITES[0].ext=40; QUALITES[0].arbreMoy=120;
try{
  if(!localStorage.getItem('corrida3d-rendu2')){
    localStorage.setItem('corrida3d-rendu2','1');
    PERF.qualite=1; PERF.dist=300; PERF.auto=true;
    localStorage.setItem('corrida3d-perf',JSON.stringify({dist:300, qualite:1}));
  }
}catch(e){}

function chargerCielHDR(){
  var Ld=(window.TROIS_EXT||{}).RGBELoader;
  if(!Ld || !window.ACTIFS || !ACTIFS['ciel_jour.hdr']) return Promise.resolve();
  return actifOctets('ciel_jour.hdr').then(function(buf){
    var ld=new Ld(); ld.setDataType(THREE.HalfFloatType);
    var d=ld.parse(buf), W=d.width, H=d.height, px=d.data;
    var t=new THREE.DataTexture(px,W,H,THREE.RGBAFormat,d.type);
    t.colorSpace=THREE.LinearSRGBColorSpace;
    t.minFilter=t.magFilter=THREE.LinearFilter;
    t.generateMipmaps=false; t.flipY=true;
    t.mapping=THREE.EquirectangularReflectionMapping;
    t.needsUpdate=true;
    /* soleil : texel le plus lumineux ; brume : moyenne juste au-dessus de l'horizon */
    var half=(d.type===THREE.HalfFloatType), best=-1, br=0, bc=0, x, y, o;
    function val(i){ return half ? THREE.DataUtils.fromHalfFloat(px[i]) : px[i]; }
    for(y=0;y<H/2;y+=2) for(x=0;x<W;x+=2){
      o=(y*W+x)*4;
      var l=val(o)*0.2126+val(o+1)*0.7152+val(o+2)*0.0722;
      if(l>best){ best=l; br=y; bc=x; }
    }
    var u=(bc+0.5)/W, v=1-(br+0.5)/H, phi=(u-0.5)*2*PI, el=(v-0.5)*PI;
    CIELHDR.soleil=new THREE.Vector3(Math.cos(el)*Math.cos(phi), Math.sin(el), Math.cos(el)*Math.sin(phi)).normalize();
    CIELHDR.elev=el*180/PI;
    var sr=0, sg=0, sb=0, n=0, r0=Math.round((0.5-4/180)*H), r1=Math.round((0.5-1/180)*H);
    for(y=r0;y<=r1;y++) for(x=0;x<W;x+=8){ o=(y*W+x)*4; sr+=val(o); sg+=val(o+1); sb+=val(o+2); n++; }
    CIELHDR.brume=new THREE.Color(sr/n, sg/n, sb/n);
    /* sous l'horizon : couleur du brouillard, pour que les vues plongeantes se fondent dans le ciel */
    var fm=Math.max(sr,sg,sb)/n||1, fog=[sr/n/fm*0.92, sg/n/fm*0.92, sb/n/fm*0.92];
    CIELHDR.brumeFog=fog;
    function enc(v){ return half ? THREE.DataUtils.toHalfFloat(v) : v; }
    var yH=Math.round(H/2), bande=Math.max(2,Math.round(H*3/180)), fe=[enc(fog[0]),enc(fog[1]),enc(fog[2])];
    for(y=yH-bande;y<H;y++){
      var a=y>=yH?1:(y-(yH-bande))/bande;
      for(x=0;x<W;x++){
        o=(y*W+x)*4;
        if(a>=1){ px[o]=fe[0]; px[o+1]=fe[1]; px[o+2]=fe[2]; }
        else for(var q=0;q<3;q++) px[o+q]=enc(val(o+q)*(1-a)+fog[q]*a);
      }
    }
    var pm=new THREE.PMREMGenerator(renderer);
    CIELHDR.env=pm.fromEquirectangular(t).texture;
    pm.dispose();
    CIELHDR.tex=t;
  }).catch(function(e){ console.error('Ciel HDR',e); });
}
ETAPES.forEach(function(e){
  if(e[1]!==preparerCiels) return;
  var anc=e[1];
  e[1]=function(){ anc(); return chargerCielHDR().then(function(){ appliquerCiel(); }); };
  e[0]='Ciel et lumière : ciel photographique';
});

var _cielZA=appliquerCiel;
appliquerCiel=function(){
  _cielZA();
  if(!scene || nuit || !CIELHDR.tex) return;
  scene.background=CIELHDR.tex;
  scene.environment=CIELHDR.env;
  scene.backgroundIntensity=RENDU.fond;
  scene.environmentIntensity=RENDU.env;
  if(CIELHDR.brumeFog) scene.fog.color.setRGB(CIELHDR.brumeFog[0], CIELHDR.brumeFog[1], CIELHDR.brumeFog[2]);
  lumDir.color.setHex(0xfff0dc); lumDir.intensity=RENDU.soleil;
  lumSol.intensity=RENDU.hemi;
  renderer.toneMappingExposure=RENDU.expo;
};

/* la lumière directionnelle vient d'où le soleil est sur la photo */
var _animZA=animerDecor;
animerDecor=function(dt,cx,cz){
  if(CIELHDR.soleil && !nuit && lumDir){
    var s=CIELHDR.soleil, t=lumDir.target.position;
    lumDir.position.set(t.x+s.x*260, t.y+s.y*260, t.z+s.z*260);
  }
  _animZA(dt,cx,cz);
};
/* =================================================================
   Rendu réaliste (2/3) : façades inspirées des maisons du Poitou.
   Six familles : 0 enduit clair, 1 pierre de taille, 2 enduit ocre,
   3 bâtiments militaires, 4 moellons enduits, 5 pavillons.
   Encadrements, persiennes ouvertes ou closes, volets roulants,
   balcons en fer forgé, rideaux, appuis et coulures, soubassements.
   Une travée de texture = 4 m × 3,2 m (256 × 205 unités).
================================================================= */
var PH2_IDS=['roof_slates_02','ceramic_roof_01','beige_wall_001','plaster_stone_wall_01','yellow_plaster_02'];
function prechargerPhotos2(){
  if(!window.ACTIFS || !ACTIFS['ph2_roof_slates_02_diff.jpg']) return;
  var att=[];
  PH2_IDS.forEach(function(id){ ['diff','nor_gl','rough'].forEach(function(m){
    var url=actifURL('ph2_'+id+'_'+m+'.jpg');
    if(!url) return;
    att.push(new Promise(function(ok){
      var im=new Image();
      im.onload=function(){ PHI[id+'_'+m]=im; ok(); };
      im.onerror=function(){ ok(); };
      im.src=url;
    }));
  }); });
  return Promise.all(att);
}
(function(){
  for(var i=0;i<ETAPES.length;i++) if(ETAPES[i][1]===prechargerPhotos){
    ETAPES.splice(i+1,0,['Textures photo : ardoises, tuiles, enduits anciens',prechargerPhotos2]); break;
  }
})();

/* ---------------- fonds photo ---------------- */
var FOND_FAM=[
  {id:'beige_wall_001',            voile:'rgba(250,244,230,0.42)'},
  {id:'white_sandstone_blocks_02', voile:'rgba(238,226,200,0.16)'},
  {id:'yellow_plaster_02',         voile:'rgba(238,208,152,0.34)'},
  {id:'plastered_wall_02',         voile:'rgba(250,248,242,0.45)'},
  {id:'plaster_stone_wall_01',     voile:'rgba(236,224,200,0.08)'},
  {id:'plastered_wall_02',         voile:'rgba(240,236,226,0.50)'}
];
function fondRiche(g,W,H,f){
  var F=FOND_FAM[f]||FOND_FAM[0], im=PHI[F.id+'_diff'];
  if(!im){ fondFamille(g,W,H,Math.min(f,3)); return; }
  /* 128 × 102,5 : la photo se raccorde d'une travée et d'un étage à l'autre */
  for(var y=0;y<H-1;y+=H/2) for(var x=0;x<W;x+=128) g.drawImage(im,x,y,128,H/2);
  g.fillStyle=F.voile; g.fillRect(0,0,W,H);
}
function tirer(t){ return t[Math.floor(Math.random()*t.length)]; }
var VOLETS_FAM=[['#7c93a4','#a3aead','#e6e2d6','#5f7a8a'],['#7d8f78','#98a38e','#6b7f86'],['#7b302b','#8c4a2f','#5a6b4a'],[null],['#8a6a4a','#9a8a70','#6e7c7e'],[null]];

/* ---------------- éléments ---------------- */
function persienne(g,x,y,w,h,c,ferme){
  g.fillStyle='rgba(0,0,0,0.20)'; g.fillRect(x+2,y+2,w,h);
  g.fillStyle=c; g.fillRect(x,y,w,h);
  g.fillStyle='rgba(255,255,255,0.12)'; g.fillRect(x,y,w,2); g.fillRect(x,y,2,h);
  g.fillStyle='rgba(0,0,0,0.22)'; g.fillRect(x+w-2,y,2,h);
  g.strokeStyle='rgba(0,0,0,0.30)'; g.lineWidth=1;
  var mid=y+h*0.5;
  for(var s=y+5;s<y+h-4;s+=3.2){
    if(Math.abs(s-mid)<2.5) continue;
    g.beginPath(); g.moveTo(x+3,s); g.lineTo(x+w-3,s+1.2); g.stroke();
  }
  g.fillStyle='rgba(0,0,0,0.30)'; g.fillRect(x+2,mid-1.5,w-4,3);
  if(!ferme){ g.fillStyle='rgba(30,30,30,0.7)'; g.fillRect(x+w*0.5-1,y+h*0.2,2,3); g.fillRect(x+w*0.5-1,y+h*0.78,2,3); }
}
/* fenêtre complète ; renvoie les rectangles de vitre visibles */
function fenetreRiche(g,x,y,w,h,o){
  o=o||{};
  var vit=[], e=o.encW||0, k;
  if(o.encadr && e){
    g.fillStyle='rgba(0,0,0,0.12)'; g.fillRect(x-e+1,y-e+2,w+2*e,h+e+2);
    g.fillStyle=o.encadr; g.fillRect(x-e,y-e,w+2*e,h+e);
    g.fillStyle='rgba(255,255,255,0.18)'; g.fillRect(x-e,y-e,w+2*e,2);
    if(o.cle){
      g.fillStyle=o.encadr; g.beginPath();
      g.moveTo(x+w/2-7,y-e-4); g.lineTo(x+w/2+7,y-e-4); g.lineTo(x+w/2+5,y+2); g.lineTo(x+w/2-5,y+2); g.closePath(); g.fill();
      g.strokeStyle='rgba(0,0,0,0.18)'; g.lineWidth=0.8; g.stroke();
    }
  }
  g.fillStyle='#2a2622'; g.fillRect(x,y,w,h);
  var vg=g.createLinearGradient(x,y,x+w*0.4,y+h);
  vg.addColorStop(0,'#aebfcd'); vg.addColorStop(0.35,'#6f8496'); vg.addColorStop(0.6,'#3a4855'); vg.addColorStop(1,'#20272e');
  g.fillStyle=vg; g.fillRect(x+3,y+3,w-6,h-6);
  if(o.rideau){
    g.fillStyle='rgba(236,232,222,0.55)'; g.fillRect(x+4,y+4,w*0.22,h-8); g.fillRect(x+w*0.78-4,y+4,w*0.22,h-8);
    g.strokeStyle='rgba(170,162,150,0.35)'; g.lineWidth=1;
    for(k=0;k<3;k++){
      g.beginPath(); g.moveTo(x+6+k*3,y+4); g.lineTo(x+6+k*3,y+h-4); g.stroke();
      g.beginPath(); g.moveTo(x+w-6-k*3,y+4); g.lineTo(x+w-6-k*3,y+h-4); g.stroke();
    }
  }
  g.fillStyle='rgba(255,255,255,0.10)';
  g.beginPath(); g.moveTo(x+3,y+h*0.7); g.lineTo(x+w*0.7,y+3); g.lineTo(x+w-3,y+3); g.lineTo(x+3,y+h-3); g.closePath(); g.fill();
  var yv=y, hv=h, mc=o.menuis||'#f1eee6';
  if(o.coffre){ g.fillStyle=mc; g.fillRect(x,y,w,9); g.fillStyle='rgba(0,0,0,0.25)'; g.fillRect(x,y+9,w,2); yv=y+9; hv=h-9; }
  if(o.roulant>0){
    var hr=hv*o.roulant;
    g.fillStyle='#dcdad3'; g.fillRect(x+2,yv,w-4,hr);
    g.strokeStyle='rgba(0,0,0,0.22)'; g.lineWidth=0.8;
    for(var s=yv+2.5;s<yv+hr;s+=2.5){ g.beginPath(); g.moveTo(x+2,s); g.lineTo(x+w-2,s); g.stroke(); }
    g.fillStyle='rgba(0,0,0,0.3)'; g.fillRect(x+2,yv+hr-1.5,w-4,2.5);
    yv+=hr; hv-=hr;
  }
  g.strokeStyle=mc; g.lineWidth=2.6; g.strokeRect(x+2.5,yv+1.5,w-5,Math.max(2,hv-4));
  g.beginPath(); g.moveTo(x+w/2,yv); g.lineTo(x+w/2,y+h);
  if(o.bois){ var nb=o.carreaux||3; for(var r=1;r<nb;r++){ var yy=y+h*r/nb; if(yy>yv+3){ g.moveTo(x+2,yy); g.lineTo(x+w-2,yy); } } }
  g.stroke();
  g.fillStyle='rgba(0,0,0,0.42)'; g.fillRect(x,y,w,4); g.fillRect(x,y,3,h);
  g.fillStyle='rgba(0,0,0,0.16)'; g.fillRect(x,y+4,w,4);
  if(hv>10) vit.push([x+3,yv+2,w-6,hv-6]);
  if(o.garde){
    var yg=y+h*0.60;
    g.strokeStyle='rgba(24,24,26,0.92)'; g.lineWidth=2; g.beginPath(); g.moveTo(x-2,yg); g.lineTo(x+w+2,yg); g.stroke();
    g.lineWidth=1.2; g.beginPath();
    for(var b=x+2;b<x+w;b+=4.5){ g.moveTo(b,yg); g.lineTo(b,y+h); }
    for(var a=x+4;a<x+w-8;a+=12){ g.moveTo(a+12,yg+7); g.arc(a+6,yg+7,6,0,PI,false); }
    g.stroke();
  }
  var ap=o.appui||'#e2dccd';
  g.fillStyle=ap; g.fillRect(x-e-3,y+h,w+2*e+6,5);
  g.fillStyle='rgba(0,0,0,0.30)'; g.fillRect(x-e-3,y+h+5,w+2*e+6,2.5);
  var cg=g.createLinearGradient(0,y+h+7,0,y+h+40);
  cg.addColorStop(0,'rgba(60,54,44,0.16)'); cg.addColorStop(1,'rgba(60,54,44,0)');
  g.fillStyle=cg; g.fillRect(x-e,y+h+7,w+2*e,33);
  if(o.volets){
    var vw=Math.round(w/2)+1, et=o.etat||'ouvert';
    if(et==='ferme'){
      persienne(g,x+1,y+1,vw-1,h-2,o.volets,true); persienne(g,x+w-vw,y+1,vw-1,h-2,o.volets,true);
      vit.length=0;
    } else if(et==='mi'){
      persienne(g,x-e-vw-1,y-1,vw,h+2,o.volets);
      persienne(g,x+w-vw,y+1,vw-1,h-2,o.volets,true);
      if(vit.length) vit[0][2]=Math.max(4,w/2-6);
    } else {
      persienne(g,x-e-vw-1,y-1,vw,h+2,o.volets); persienne(g,x+w+e+1,y-1,vw,h+2,o.volets);
    }
  }
  return vit;
}
function porteRiche(g,x,y,w,h,o){
  o=o||{};
  var e=o.encW||6, vit=[];
  if(o.encadr){ g.fillStyle=o.encadr; g.fillRect(x-e,y-e,w+2*e,h+e); }
  g.fillStyle='#231f1b'; g.fillRect(x,y,w,h);
  var imp=o.imposte?Math.round(h*0.2):0;
  if(imp){
    var vg=g.createLinearGradient(x,y,x,y+imp); vg.addColorStop(0,'#8ea2b2'); vg.addColorStop(1,'#2d3944');
    g.fillStyle=vg; g.fillRect(x+3,y+3,w-6,imp-5);
    g.strokeStyle='#e8e4da'; g.lineWidth=1.6; g.beginPath();
    g.moveTo(x+w/3,y+3); g.lineTo(x+w/3,y+imp-2); g.moveTo(x+2*w/3,y+3); g.lineTo(x+2*w/3,y+imp-2); g.stroke();
    vit.push([x+3,y+3,w-6,imp-5]);
  }
  var col=o.col||'#5a3e2a', y0=y+imp+2, hh=h-imp-2;
  g.fillStyle=col; g.fillRect(x+2,y0,w-4,hh);
  var pg=g.createLinearGradient(x,0,x+w,0);
  pg.addColorStop(0,'rgba(0,0,0,0.10)'); pg.addColorStop(0.5,'rgba(255,255,255,0.08)'); pg.addColorStop(1,'rgba(0,0,0,0.12)');
  g.fillStyle=pg; g.fillRect(x+2,y0,w-4,hh);
  var nv=o.double?2:1, lw=(w-4)/nv;
  g.strokeStyle='rgba(0,0,0,0.38)'; g.lineWidth=1.6;
  for(var k=0;k<nv;k++){ var lx=x+2+k*lw; g.strokeRect(lx+5,y0+6,lw-10,hh*0.40); g.strokeRect(lx+5,y0+hh*0.5,lw-10,hh*0.42); }
  if(o.double){ g.fillStyle='rgba(0,0,0,0.5)'; g.fillRect(x+w/2-1,y0,2,hh); }
  g.fillStyle='#c9b27a'; g.beginPath(); g.arc(o.double?x+w/2-5:x+w-8,y0+hh*0.52,2.2,0,7); g.fill();
  g.fillStyle='rgba(0,0,0,0.4)'; g.fillRect(x,y,w,3); g.fillRect(x,y,3,h);
  g.fillStyle='#9d978a'; g.fillRect(x-e-2,y+h,w+2*e+4,4);
  return vit;
}
function soubassement(g,W,H,col,hs){
  g.fillStyle=col; g.fillRect(0,H-hs,W,hs);
  grainZone(g,0,H-hs,W,hs,500,0.14);
  g.fillStyle='rgba(0,0,0,0.22)'; g.fillRect(0,H-hs,W,2);
  g.fillStyle='rgba(255,255,255,0.12)'; g.fillRect(0,H-hs-2,W,2);
}
function porteGarage(g,x,y,w,h,col){
  g.fillStyle='#2a2724'; g.fillRect(x-3,y-3,w+6,h+3);
  g.fillStyle=col; g.fillRect(x,y,w,h);
  g.strokeStyle='rgba(0,0,0,0.25)'; g.lineWidth=1.2;
  for(var s=y+h/5;s<y+h-1;s+=h/5){ g.beginPath(); g.moveTo(x,s); g.lineTo(x+w,s); g.stroke(); }
  g.fillStyle='rgba(255,255,255,0.12)';
  for(s=y+2;s<y+h;s+=h/5) g.fillRect(x,s,w,1.5);
  g.fillStyle='rgba(0,0,0,0.3)'; g.fillRect(x,y,w,3);
}

/* ---------------- travées ---------------- */
function etatVolet(){ var r=Math.random(); return r<0.12?'ferme':(r<0.22?'mi':'ouvert'); }
function etageRiche(f){
  var W=256, H=205, c=toile(W,H), g=c.getContext('2d'), vit=[], vol=tirer(VOLETS_FAM[f]);
  fondRiche(g,W,H,f);
  function ajoute(v){ vit=vit.concat(v); }
  if(f===0) [44,162].forEach(function(x){ ajoute(fenetreRiche(g,x,40,50,98,{encadr:'rgba(246,240,228,0.95)',encW:6,volets:vol,etat:etatVolet(),bois:true,rideau:Math.random()<0.6})); });
  else if(f===1){
    [44,162].forEach(function(x){ ajoute(fenetreRiche(g,x,30,50,116,{encadr:'rgba(232,222,198,0.97)',encW:8,cle:true,volets:vol,etat:etatVolet(),bois:true,carreaux:4,garde:Math.random()<0.55,rideau:Math.random()<0.5,appui:'#d9cfb6'})); });
    g.fillStyle='rgba(236,226,204,0.9)'; g.fillRect(0,H-11,W,7); g.fillStyle='rgba(0,0,0,0.22)'; g.fillRect(0,H-4,W,2.5);
  }
  else if(f===2) [44,162].forEach(function(x){ ajoute(fenetreRiche(g,x,42,50,94,{encadr:'rgba(222,200,160,0.92)',encW:6,volets:vol,etat:etatVolet(),bois:true,rideau:Math.random()<0.6,appui:'#dcd0b8'})); });
  else if(f===3){
    [28,146].forEach(function(x){ ajoute(fenetreRiche(g,x,52,82,82,{encadr:'rgba(212,212,208,0.95)',encW:5,menuis:'#6d7378',appui:'#c8c8c4'})); });
    g.fillStyle='rgba(210,210,204,0.95)'; g.fillRect(0,H-16,W,10); g.fillStyle='rgba(0,0,0,0.18)'; g.fillRect(0,H-6,W,3);
  }
  else if(f===4) ajoute(fenetreRiche(g,104,56,48,80,{encadr:'rgba(230,220,196,0.95)',encW:7,volets:vol,etat:etatVolet(),bois:true,rideau:Math.random()<0.5,appui:'#d8cdb2'}));
  else [36,158].forEach(function(x){ ajoute(fenetreRiche(g,x,50,62,86,{coffre:true,roulant:0.12+Math.random()*0.5,menuis:'#f4f4f1',appui:'#d6d6d2',rideau:Math.random()<0.4})); });
  return {c:c, v:vit};
}
function rdcRiche(f){
  var W=256, H=205, c=toile(W,H), g=c.getContext('2d'), vit=[], vol=tirer(VOLETS_FAM[f]);
  var cp=tirer(['#5a3e2a','#2f4b5e','#6b2d2a','#3d4f3a','#4a4642','#7a6a55']);
  fondRiche(g,W,H,f);
  function ajoute(v){ vit=vit.concat(v); }
  if(f===3){
    soubassement(g,W,H,'#9b9a94',30);
    ajoute(porteRiche(g,40,H-150,70,146,{encadr:'rgba(214,214,208,0.95)',col:'#5d666d',double:true,imposte:true}));
    ajoute(fenetreRiche(g,150,52,82,82,{encadr:'rgba(212,212,208,0.95)',encW:5,menuis:'#6d7378',appui:'#c8c8c4'}));
  } else if(f===5){
    soubassement(g,W,H,'#a7a59e',20);
    porteGarage(g,24,H-128,112,124,tirer(['#e9e8e3','#8c8f91','#6f5a45']));
    ajoute(fenetreRiche(g,168,H-150,54,86,{coffre:true,roulant:0.2+Math.random()*0.4,menuis:'#f4f4f1',appui:'#d6d6d2'}));
  } else {
    soubassement(g,W,H,f===1?'#b7ad97':(f===4?'#a39a86':'#aaa292'),f===1?34:26);
    var fp=(f===1)?{encadr:'rgba(232,222,198,0.97)',encW:8,col:cp,double:Math.random()<0.5,imposte:true}
                  :{encadr:'rgba(240,234,220,0.9)',encW:6,col:cp,imposte:Math.random()<0.6};
    ajoute(porteRiche(g,f===4?30:36,H-148,fp.double?66:52,144,fp));
    ajoute(fenetreRiche(g,158,57,50,90,{encadr:fp.encadr,encW:fp.encW,volets:f===4||f===0||f===2||f===1?vol:null,etat:Math.random()<0.25?'ferme':'ouvert',bois:true,rideau:Math.random()<0.6,appui:'#ddd5c2'}));
  }
  return {c:c, v:vit};
}
/* matériau de façade : texture, relief, vitres brillantes, fenêtres allumées la nuit */
function facadeRiche(f,rdc){
  var r=enHD(function(){ return rdc?rdcRiche(f):etageRiche(f); });
  var rects=r.v.length?r.v:[[0,0,1,1]];
  var e=faireFenetresRect(256,205,rects,rdc?0.45:0.5);
  return facadeN(r.c,e,r.v.length?r.v:null,f===1||f===4?2.6:2.0);
}
/* =================================================================
   Rendu réaliste (3/3) : bâtiments.
   - six familles de façades ; chaque mur reçoit un nombre entier de
     travées (plus de fenêtre coupée à un angle), largeur de travée et
     hauteur d'étage propres à chaque bâtiment
   - pignons en maçonnerie au lieu de tuiles
   - gouttières et descentes, cheminées enduites coiffées de mitrons
   - ardoises et deux modèles de tuiles en photo
================================================================= */
var CTX_TOIT=null;
function pan4u(tas,x0,z0,x1,z1,y0,y1,nx,nz,ua,ub,v0,v1,cbas,chaut){
  tas.triC(x0,y0,z0, x1,y1,z1, x1,y0,z1, nx,0,nz, [ua,v0,ub,v1,ub,v0], cbas,chaut,cbas);
  tas.triC(x0,y0,z0, x0,y1,z0, x1,y1,z1, nx,0,nz, [ua,v0,ua,v1,ub,v1], cbas,chaut,chaut);
}
/* triangle de pignon posé dans le tas des murs, sur une bande sans fenêtre */
function pignonMur(a,b,c,cx,cz){
  var ctx=CTX_TOIT, nn=nrm(a,b,c);
  var mx=(a[0]+b[0]+c[0])/3-cx, mz=(a[2]+b[2]+c[2])/3-cz;
  if(nn[0]*mx+nn[2]*mz<0){ var t=b; b=c; c=t; nn=nrm(a,b,c); }
  ctx.mur.tri(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2], nn[0],nn[1],nn[2], [0.004,0.1,0.014,0.6,0.024,0.1], ctx.col);
}
function gouttiere(P0,P1,y){
  if(!BAT.zinc) return;
  tube(BAT.zinc,P0[0],y,P0[2],P1[0],y,P1[2],0.065,0.065,4,teinte(0xb9bec2),true,true);
}
/* ---------------------------------------------------------------
   Toiture découpée sur l'emprise.

   Jusqu'ici le toit était posé sur la boîte englobante du bâtiment. Dès
   que l'emprise n'est pas rectangulaire — et à Saint-Maixent les rangées
   suivent des rues obliques, si bien que deux emprises sur cinq laissent
   plus d'un dixième de leur boîte hors du bâti — un pan de toit dépassait
   dans le vide. Depuis la rue on voyait une toiture suspendue en plein
   ciel, séparée du haut du mur par une bande de ciel : c'est la « zone de
   vide » relevée sur le terrain, avenue Gambetta comme rue Chalon.

   La surface reste la même tente à deux pentes, de même pente et de même
   faîte ; elle est seulement rognée au contour du bâtiment. Le découpage
   est exact et non échantillonné : les bornes des tranches sont les
   abscisses des sommets, entre lesquelles le contour est fait de droites.
   Partout où le rampant s'élève au-dessus du haut du mur, une bande
   verticale ferme le pignon — plus aucun trou possible, quelle que soit
   la forme de l'emprise.
--------------------------------------------------------------- */
/* normale sortante d'une arête, d'après le sens de parcours du contour */
function normSort(A,B,sens){
  var du=B[0]-A[0], dv=B[1]-A[1], L=Math.hypot(du,dv);
  if(L<1e-6) return null;
  return [sens*dv/L, -sens*du/L];
}
/* l'emprise dans le repère du faîte, dilatée du débord de toit */
function empriseToit(p,n,cx,cz,co,si,deb){
  var Q=[], i;
  for(i=0;i<n;i++){
    var dx=p[i*2]-cx, dz=p[i*2+1]-cz;
    Q.push([dx*co+dz*si, -dx*si+dz*co]);
  }
  /* sommets doublés : ils cassent le calcul des normales */
  var R=[];
  for(i=0;i<Q.length;i++){
    var s=Q[(i+1)%Q.length];
    if(Math.hypot(s[0]-Q[i][0],s[1]-Q[i][1])>0.05) R.push(Q[i]);
  }
  if(R.length<3) return null;
  var aire2=0;
  for(i=0;i<R.length;i++){ var A=R[i], B=R[(i+1)%R.length]; aire2+=A[0]*B[1]-B[0]*A[1]; }
  var sens=(aire2>=0)?1:-1;
  if(!(deb>0)) return R;
  var D=[];
  for(i=0;i<R.length;i++){
    var Aa=R[(i+R.length-1)%R.length], Bb=R[i], Cc=R[(i+1)%R.length];
    var n1=normSort(Aa,Bb,sens), n2=normSort(Bb,Cc,sens);
    if(!n1||!n2){ D.push([Bb[0],Bb[1]]); continue; }
    var k=1+n1[0]*n2[0]+n1[1]*n2[1];
    var al=(k<0.25)?deb*4:deb/k;                 /* angle rentrant : on borne */
    D.push([Bb[0]+(n1[0]+n2[0])*al, Bb[1]+(n1[1]+n2[1])*al]);
  }
  return D;
}
/* Traversées du contour par la verticale d'abscisse u : l'ordonnée, et
   l'arête qui la donne. On garde l'arête pour évaluer la borne exactement
   aux deux bouts de la tranche : compter les traversées séparément à
   chaque bout revenait à comparer deux listes qui ne concordaient pas
   toujours sur les grandes emprises découpées en dizaines de sommets, et
   la tranche entière était alors abandonnée — un vrai trou au milieu du
   toit. Ici on ne compte qu'une fois, au milieu de la tranche, où la
   verticale ne passe par aucun sommet. */
function coupesU(Q,u){
  var t=[], m=Q.length;
  for(var i=0;i<m;i++){
    var A=Q[i], B=Q[(i+1)%m];
    if((A[0]<=u)===(B[0]<=u)) continue;
    t.push({v:A[1]+(B[1]-A[1])*(u-A[0])/(B[0]-A[0]), a:A, b:B});
  }
  t.sort(function(x,y){ return x.v-y.v; });
  return t;
}
function vSurArete(e,u){ return e.a[1]+(e.b[1]-e.a[1])*(u-e.a[0])/(e.b[0]-e.a[0]); }
/* Un quadrilatère de toiture dont un côté s'est refermé en pointe — cela
   arrive à chaque tranche qui se termine sur un sommet de l'emprise — a
   trois coins confondus ou alignés. Si ce sont les trois premiers, la
   normale calculée sur eux est indéfinie et le pan peut partir tourné vers
   le bas : éclairé par en dessous, il apparaît en noir. On fait donc
   tourner le quadrilatère pour que le triangle de tête soit franc. */
function panRogne(tas,A,B,C,D,col){
  var S=[A,B,C,D], m=0, meilleur=-1, N=null, i;
  for(i=0;i<4;i++){
    var a=S[i], b=S[(i+1)%4], cc=S[(i+2)%4];
    var ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2];
    var vx=cc[0]-a[0], vy=cc[1]-a[1], vz=cc[2]-a[2];
    var nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    var s=nx*nx+ny*ny+nz*nz;
    if(s>m){ m=s; meilleur=i; N=[nx,ny,nz]; }
  }
  if(m<1e-4) return;   /* moins d'un demi-décimètre carré : invisible, et
                          sa normale n'est plus fiable — on ne le pose pas */
  var lg=Math.sqrt(m), n=[N[0]/lg, N[1]/lg, N[2]/lg];
  if(n[1]<0){ n=[-n[0],-n[1],-n[2]]; }
  /* On pose les deux triangles soi-même au lieu de passer par pan() : pan
     retourne le quadrilatère quand sa normale de tête pointe vers le bas,
     ce qui remet en tête le triangle dégénéré que l'on venait justement
     d'écarter, et la normale stockée redevient quelconque. */
  var a0=S[meilleur], b0=S[(meilleur+1)%4], c0=S[(meilleur+2)%4], d0=S[(meilleur+3)%4];
  var w=Math.hypot(b0[0]-a0[0],b0[2]-a0[2]), h=Math.hypot(c0[0]-b0[0],c0[1]-b0[1],c0[2]-b0[2]);
  triFace(tas,a0,b0,c0,n,[0,0,w/1.28,0,w/1.28,h/1.28],col);
  triFace(tas,a0,c0,d0,n,[0,0,w/1.28,h/1.28,0,h/1.28],col);
}
/* Quadrilatère posé dans le sens de sa normale : deux triangles, chacun
   remis d'aplomb. C'est la brique de base des volumes décrits à la main —
   la porte, les monuments — où le sens d'écriture ne doit plus décider de
   ce qu'on voit. */
function quadFace(tas,A,B,C,D,n,uv,col){
  triFace(tas,A,B,C,n,[uv[0],uv[1],uv[2],uv[3],uv[4],uv[5]],col);
  triFace(tas,A,C,D,n,[uv[0],uv[1],uv[4],uv[5],uv[6],uv[7]],col);
}
/* Triangle posé dans le sens de sa normale : on échange deux sommets s'il
   tourne à l'envers, sinon le moteur l'efface ou l'éclaire par derrière.
   Ne pas confondre avec triOriente, plus haut, qui prend une normale par
   sommet — c'est d'ailleurs le nom que j'avais pris ici par distraction,
   et la déclaration la plus tardive l'emportant, tubes et sphères se
   retrouvaient appelés avec la mauvaise signature. */
function triFace(tas,a,b,c,n,uv,col){
  var ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2];
  var vx=c[0]-a[0], vy=c[1]-a[1], vz=c[2]-a[2];
  var nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
  var ps=nx*n[0]+ny*n[1]+nz*n[2];
  if(nx*nx+ny*ny+nz*nz<1e-8) return;      /* moitié refermée en pointe */
  if(ps<0){
    var t=b; b=c; c=t;
    uv=[uv[0],uv[1],uv[4],uv[5],uv[2],uv[3]];
  }
  tas.tri(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2], n[0],n[1],n[2], uv, col);
}
/* la tente : faîte le long de u, versants vers v=±L */
function toitTente(tas,cx,cz,ang,w,l,top,c,fpente,aire,r,brique,ctx){
  var co=Math.cos(ang), si=Math.sin(ang), ov=0.38;
  var W=w/2+ov, L=l/2+ov;
  var rise=Math.min(L*0.72,3.4)*(fpente||1);
  FAITE_TOIT=top+rise;
  function P(u,v,y){ return [cx+u*co-v*si, y, cz+u*si+v*co]; }
  function yDe(v){ var a=1-Math.abs(v)/L; return top+rise*(a>0?a:0); }
  var Q=(ctx&&ctx.p)?empriseToit(ctx.p,ctx.n,cx,cz,co,si,ov):null;
  if(!Q||Q.length<3) Q=[[-W,-L],[W,-L],[W,L],[-W,L]];

  /* --- les versants, tranche par tranche ---
     Bornes des tranches : les abscisses des sommets, et aussi celles où une
     arête traverse le faîte. Sans ces dernières, la borne basse d'une
     tranche change de versant en cours de route ; en la rabattant sur le
     faîte on obtenait un rabat de toit débordant de l'emprise, jusqu'à un
     mètre et demi — le pan suspendu qui restait visible rue Chalon. */
  var PLIS=[-L,0,L];                  /* les trois plis de la tente : deux
                                         égouts et le faîte ; au-delà des
                                         égouts la surface reste plate */
  var us=[], i, q;
  for(i=0;i<Q.length;i++){
    us.push(Q[i][0]);
    var A0=Q[i], B0=Q[(i+1)%Q.length];
    for(q=0;q<PLIS.length;q++){
      if((A0[1]<PLIS[q])!==(B0[1]<PLIS[q]))
        us.push(A0[0]+(B0[0]-A0[0])*(PLIS[q]-A0[1])/(B0[1]-A0[1]));
    }
  }
  us.sort(function(a,b){ return a-b; });
  /* Bornes trop voisines : les fondre au lieu de sauter la tranche. Sauter
     laissait une fente — jusqu'à un centimètre, invisible de la rue mais
     bien réelle — entre deux tranches, là où un sommet et un pli tombent
     presque au même endroit. */
  var uf=[us[0]];
  for(i=1;i<us.length;i++) if(us[i]-uf[uf.length-1]>0.03) uf.push(us[i]);
  us=uf;
  var runs=[], enCours=null;
  for(i=0;i+1<us.length;i++){
    var ua=us[i], ub=us[i+1];
    var tm=coupesU(Q,(ua+ub)/2);
    if(tm.length<2 || (tm.length&1)) continue;
    var faite=false;
    for(var k=0;k+1<tm.length;k+=2){
      var e0=tm[k], e1=tm[k+1];
      var v0a=vSurArete(e0,ua), v1a=vSurArete(e1,ua);
      var v0b=vSurArete(e0,ub), v1b=vSurArete(e1,ub);
      if(v1a<v0a){ var w0=v0a; v0a=v1a; v1a=w0; }
      if(v1b<v0b){ var w1=v0b; v0b=v1b; v1b=w1; }
      /* coupé à chaque pli pour que chaque morceau reste plan : à cheval
         sur un pli, le quadrilatère se voile et l'un de ses deux triangles
         part retourné, éclairé par en dessous — les éclats noirs. */
      var bornes=[-1e9,-L,0,L,1e9];
      for(q=0;q+1<bornes.length;q++){
        var g=bornes[q], dd=bornes[q+1];
        var a0=Math.min(Math.max(v0a,g),dd), a1=Math.min(Math.max(v1a,g),dd);
        var b0=Math.min(Math.max(v0b,g),dd), b1=Math.min(Math.max(v1b,g),dd);
        if((a1-a0)+(b1-b0)<0.03) continue;
        panRogne(tas,P(ua,a0,yDe(a0)),P(ub,b0,yDe(b0)),P(ub,b1,yDe(b1)),P(ua,a1,yDe(a1)),c);
      }
      if(v0a<-0.02&&v1a>0.02&&v0b<-0.02&&v1b>0.02) faite=true;
    }
    if(faite){
      if(enCours && Math.abs(enCours[1]-ua)<0.05) enCours[1]=ub;
      else { enCours=[ua,ub]; runs.push(enCours); }
    } else enCours=null;
  }
  /* --- faîtière, sur la longueur réellement couverte --- */
  var cf=assombrir(c,0.88), pl=null;
  for(i=0;i<runs.length;i++){
    var R0=P(runs[i][0],0,top+rise+0.06), R1=P(runs[i][1],0,top+rise+0.06);
    tube(tas,R0[0],R0[1],R0[2],R1[0],R1[1],R1[2],0.13,0.13,5,cf,false,false);
    if(!pl || runs[i][1]-runs[i][0]>pl[1]-pl[0]) pl=runs[i];
  }

  /* --- pignons et gouttières, le long du contour --- */
  var aire2=0;
  for(i=0;i<Q.length;i++){ var A1=Q[i], B1=Q[(i+1)%Q.length]; aire2+=A1[0]*B1[1]-B1[0]*A1[1]; }
  var sens=(aire2>=0)?1:-1;
  var egout=null;
  for(i=0;i<Q.length;i++){
    var A=Q[i], B=Q[(i+1)%Q.length];
    var ns=normSort(A,B,sens);
    if(!ns) continue;
    var nx=ns[0]*co-ns[1]*si, nz=ns[0]*si+ns[1]*co;
    /* l'arête traverse-t-elle un pli ? on la scinde à chaque fois, sinon
       la bande de pignon coupe au plus court et dépasse du rampant */
    var ts=[0,1], kk;
    for(kk=0;kk<PLIS.length;kk++){
      if((A[1]<PLIS[kk])!==(B[1]<PLIS[kk])){
        var tt=(PLIS[kk]-A[1])/(B[1]-A[1]);
        if(tt>0.001 && tt<0.999) ts.push(tt);
      }
    }
    ts.sort(function(x,y){ return x-y; });
    var bouts=[];
    for(kk=0;kk+1<ts.length;kk++){
      bouts.push([[A[0]+(B[0]-A[0])*ts[kk], A[1]+(B[1]-A[1])*ts[kk]],
                  [A[0]+(B[0]-A[0])*ts[kk+1], A[1]+(B[1]-A[1])*ts[kk+1]]]);
    }
    for(var b=0;b<bouts.length;b++){
      var S=bouts[b][0], T=bouts[b][1];
      var yS=yDe(S[1]), yT=yDe(T[1]);
      if(yS-top<0.06 && yT-top<0.06){                 /* c'est un égout */
        var G0=P(S[0],S[1],0), G1=P(T[0],T[1],0);
        if(ctx && ctx.h>3.2) gouttiere(G0,G1,top-0.07);
        if(!egout || Math.hypot(T[0]-S[0],T[1]-S[1])>egout.L)
          egout={P:G0, L:Math.hypot(T[0]-S[0],T[1]-S[1])};
        continue;
      }
      /* bande verticale du haut du mur au rampant */
      var a0=P(S[0],S[1],top), a1=P(S[0],S[1],yS);
      var b0=P(T[0],T[1],top), b1=P(T[0],T[1],yT);
      var cible=(ctx&&ctx.mur)?ctx.mur:tas, cc=(ctx&&ctx.mur)?ctx.col:c;
      var v1u=0.1+(yS-top)/8, v2u=0.1+(yT-top)/8;
      /* par triFace, et non directement : le sens de parcours de l'arête
         n'a rien à voir avec la normale sortante, si bien qu'une bande sur
         deux tournait à l'envers et se faisait effacer par le moteur — le
         pignon manquait, et le rampant paraissait flotter au-dessus du
         vide alors qu'il était bien à sa place. */
      var nb=[nx,0,nz];
      triFace(cible,a0,b0,b1,nb,[0.004,0.1,0.024,0.1,0.024,v2u],cc);
      triFace(cible,a0,b1,a1,nb,[0.004,0.1,0.024,v2u,0.004,v1u],cc);
    }
  }
  if(!ctx) return;
  /* descente d'eau à l'angle d'un égout */
  if(ctx.h>3.2 && egout){
    var dp=egout.P;
    tube(BAT.zinc,dp[0],ctx.base+0.1,dp[2],dp[0],top-0.1,dp[2],0.045,0.045,4,teinte(0xaeb3b7),false,false);
  }
  /* souche de cheminée enduite, chaperon et mitrons en terre cuite, posée
     sur le faîte là où il existe vraiment */
  if(aire>55 && r<0.72 && BAT.chem && pl){
    var uc=pl[0]+(pl[1]-pl[0])*(r<0.36?0.34:0.68);
    var Pm=P(uc,0,0), mx=Pm[0], mz=Pm[2];
    var sz=0.34+r*0.16, hc=top+rise+0.7+r*0.7, cc2=melange(ctx.col,teinte(0xe8e2d6),0.5);
    boiteQuad(BAT.chem,[mx-sz,mz-sz],[mx+sz,mz-sz],[mx+sz,mz+sz],[mx-sz,mz+sz],top+rise-0.9,hc,cc2,cc2,1.2);
    var s2=sz+0.08;
    boiteQuad(BAT.chem,[mx-s2,mz-s2],[mx+s2,mz-s2],[mx+s2,mz+s2],[mx-s2,mz+s2],hc,hc+0.1,assombrir(cc2,0.82),assombrir(cc2,0.8),1.2);
    var terre=teinte(0xa4552f);
    tube(BAT.chem,mx-sz*0.4,hc+0.1,mz,mx-sz*0.4,hc+0.42,mz,0.085,0.07,6,terre,false,true);
    if(r>0.2) tube(BAT.chem,mx+sz*0.4,hc+0.1,mz,mx+sz*0.4,hc+0.36,mz,0.085,0.07,6,terre,false,true);
  }
}
/* L'axe du faîte. La boîte englobante d'aire minimale donne l'enveloppe la
   plus serrée, mais pas toujours l'axe du bâtiment : pour une rangée qui
   suit une rue oblique, les côtés de la boîte ne sont pas parallèles aux
   murs de pignon, et la toiture rognée sur l'emprise s'effile en pointe à
   hauteur de faîte au lieu de finir sur un pignon franc — une lame claire
   suspendue dans le ciel, vue de la rue. On essaie donc l'axe du plus long
   mur : s'il enveloppe l'emprise presque aussi serré, c'est le bon. */
function axeToit(p,n,cx,cz,ang,w,l){
  var base={ang:ang, w:w, l:l, cx:cx, cz:cz};
  if(!p || n<3) return base;
  var iL=-1, lg=0, i, j;
  for(i=0;i<n;i++){
    j=(i+1)%n;
    var dx=p[j*2]-p[i*2], dz=p[j*2+1]-p[i*2+1], d=Math.hypot(dx,dz);
    if(d>lg){ lg=d; iL=i; }
  }
  if(iL<0 || lg<6) return base;
  j=(iL+1)%n;
  var a2=Math.atan2(p[j*2+1]-p[iL*2+1], p[j*2]-p[iL*2]);
  var co=Math.cos(a2), si=Math.sin(a2);
  var u0=1e9,u1=-1e9,v0=1e9,v1=-1e9;
  for(i=0;i<n;i++){
    var ex=p[i*2]-cx, ez=p[i*2+1]-cz;
    var uu=ex*co+ez*si, vv=-ex*si+ez*co;
    if(uu<u0)u0=uu; if(uu>u1)u1=uu; if(vv<v0)v0=vv; if(vv>v1)v1=vv;
  }
  var w2=u1-u0, l2=v1-v0;
  if(Math.min(w2,l2)>Math.min(w,l)*1.22) return base;   /* enveloppe trop lâche */
  var um=(u0+u1)/2, vm=(v0+v1)/2;
  return {ang:a2, w:w2, l:l2, cx:cx+um*co-vm*si, cz:cz+um*si+vm*co};
}
toitDeuxPentes=function(tas,cx,cz,ang,w,l,top,c,fpente,aire,r,brique){
  var ctx=CTX_TOIT;
  var A=axeToit(ctx?ctx.p:null, ctx?ctx.n:0, cx, cz, ang, w, l);
  /* un seul cas traité : le faîte le long de u. L'autre s'y ramène par un
     quart de tour, ce qui évite d'écrire deux fois le découpage. */
  if(A.w>=A.l) toitTente(tas,A.cx,A.cz,A.ang,A.w,A.l,top,c,fpente,aire,r,brique,ctx);
  else toitTente(tas,A.cx,A.cz,A.ang+PI/2,A.l,A.w,top,c,fpente,aire,r,brique,ctx);
};

construireBatis=function(bats){
  indexerTypes();
  NB_TYPES={};
  BATIS_POSES.length=0;      /* la fonction peut être rappelée : on repart de zéro */
  BAT={ murs:[], rdc:[], rdcC:new Tas(8192), mursS:new Tas(16384), mursEg:new Tas(8192), mursI:new Tas(16384),
        annexes:new Tas(16384), toits:new Tas(65536), toits2:new Tas(32768), toitsA:new Tas(16384), toitsM:new Tas(8192),
        plats:new Tas(16384), deco:new Tas(4096), corn:new Tas(65536), zinc:new Tas(65536), chem:new Tas(32768),
        bronze:new Tas(16384), taille:new Tas(32768) };
  for(var f=0;f<NB_FAM;f++){ BAT.murs.push(new Tas(32768)); BAT.rdc.push(new Tas(32768)); }
  var brique=teinte(0xb08a72), gris=teinte(0xe6e8ea), clair=teinte(0xf4f0e6), blanc=teinte(0xffffff);
  for(var i=0;i<bats.length;i++){
    var l=bats[i].split('\t');
    if(l.length<11) continue;
    var k=l[0], rect=+l[1], ang=(+l[2])/10*PI/180;
    var cx=(+l[3])/10, cz=(+l[4])/10, ow=(+l[5])/10, ol=(+l[6])/10;
    var aire=+l[7], lv=+l[8], ht=(+l[9])/10;
    var p=pointsDe(l[10]), n=p.length/2, j;
    if(n<3) continue;
    var x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
    for(j=0;j<n;j++){ var px_=p[j*2], pz_=p[j*2+1]; if(px_<x0)x0=px_; if(px_>x1)x1=px_; if(pz_<z0)z0=pz_; if(pz_>z1)z1=pz_; }
    var r=alea(Math.round(cx*3),Math.round(cz*3)), r2=alea(Math.round(cz*7),Math.round(cx*7)), r3=alea(Math.round(cx*13),Math.round(cz*5));
    var milit=false, m;
    for(m=0;m<zonesM.length;m++){ if(dansPoly(zonesM[m],cx,cz)){ milit=true; break; } }
    var type=(k==='e')?'E':typeDe(p,cx,cz,aire,x0,x1,z0,z1);
    if(!type && k==='i') type='I';
    if(type) NB_TYPES[type]=(NB_TYPES[type]||0)+1;
    /* Ce que les photos disent de ce bâtiment précis. À lire ici, avant la
       hauteur : je l'avais placé plus bas, après, et « rel » valait donc
       undefined au moment du remplacement de hauteur. Sans erreur visible :
       la famille de façade changeait bien, mais pas la hauteur, et le toit
       restait perché là où la hauteur devinée l'avait mis — d'où des
       toitures flottant au-dessus des commerces bas. */
    if(repriseParMonument(cx,cz)) continue;
    var rel=releveProche(cx,cz);
    var h=hautBat(k,aire,lv,ht,r,milit,type);
    /* niveaux comptés sur la photo : la 3D faisait trois étages là où
       l'avenue n'a qu'un commerce d'un seul niveau très haut */
    if(rel && rel.niv){
      h=(rel.fam===6) ? 4.9 : (rel.niv*3.15+1.1);
    }
    var base=1e9;
    for(j=0;j<n;j++){ var hh=hauteur(p[j*2],p[j*2+1]); if(hh<base) base=hh; }
    base-=0.35;
    var top=base+h;
    var petit=(k==='g'||aire<28||h<3.2) && !type;
    var fam;
    if(rel && rel.fam!==undefined) fam=rel.fam;
    else if(milit) fam=3;
    /* long, large et régulier : caserne, école, administration. Les photos
       montrent que ce type n'a pas de volets, et qu'il est fréquent en ville
       et pas seulement dans l'enceinte. */
    else if(institutionnel(aire,ow,ol,rect)) fam=3;
    else if(type==='M'||type==='H'||type==='P') fam=1;
    else if(aire>220||h>8.5) fam=r2<0.34?1:(r2<0.67?0:2);
    else fam=r2<0.18?1:(r2<0.36?0:(r2<0.50?2:(r2<0.75?4:5)));
    var cm;
    if(rel && rel.mur!==undefined) cm=teinte(rel.mur);
    else if(fam===3||fam===6){
      /* Pas de mélange au blanc pour ces familles : il désature, et le tone
         mapping ACES désature encore les surfaces claires. Pour obtenir à
         l'écran le crème chaud mesuré sur les photos — rvb(198,192,177),
         soit 21 d'écart entre le rouge et le bleu — il faut entrer une
         teinte franchement plus chaude que la cible. */
      cm=melange(teinte(0xe4d6b4),teinte(0xd8cfbe),r);
    }
    else cm=melange(blanc,MURS[Math.floor(r*MURS.length)],0.45);
    if(milit) cm=melange(cm,teinte(0xf7f4ee),0.6);
    if(petit) cm=melange(MURS[Math.floor(r*MURS.length)],teinte(0xd8d2c6),0.5);
    /* largeur de travée relevée sur les photos : 2,6 m d'axe en axe entre
       deux fenêtres institutionnelles, soit 5,2 m pour deux ; les commerces
       de l'avenue ont de grandes baies espacées de 3 m. */
    var bayFam=(fam===3?5.2:(fam===6?6.0:(fam===4?4.6:4.0)));
    var bay=bayFam*(fam===3||fam===6?1:(0.9+r3*0.24));
    var hs=(fam===6?4.2:3.05+r2*0.3);

    var tasBas, tasHaut, coupe=base+hs, pleine=false, special=false;
    if(petit){ tasBas=tasHaut=BAT.annexes; coupe=base; special=true; }
    else if(type==='E'){ tasBas=tasHaut=BAT.mursEg; pleine=true; cm=melange(MURS[Math.floor(r*MURS.length)],teinte(0xe9e2d0),0.6); }
    else if(type==='S'){ tasBas=tasHaut=BAT.mursS; coupe=base; special=true; }
    else if(type==='G'||type==='I'){ tasBas=tasHaut=BAT.mursI; coupe=base; special=true; cm=melange(gris,MURS[Math.floor(r*MURS.length)],0.25); }
    else if(type==='C'){ tasBas=BAT.rdcC; tasHaut=BAT.murs[fam]; }
    else { tasBas=BAT.rdc[fam]; tasHaut=BAT.murs[fam]; }
    if(h<4.3 && !pleine) coupe=top;

    var ao=assombrir(cm,0.62), mi=assombrir(cm,0.95);
    for(j=0;j<n;j++){
      var jj=(j+1)%n, ax=p[j*2], az=p[j*2+1], bx=p[jj*2], bz=p[jj*2+1];
      var dx=bx-ax, dz=bz-az, L=Math.hypot(dx,dz);
      if(L<0.15) continue;
      var nx=dz/L, nz=-dx/L;
      if(pleine){ pan4g(tasHaut,ax,az,bx,bz,base,top,nx,nz,L/4,1,0,ao,cm); continue; }
      if(special){
        var yc0=Math.min(coupe,top);
        if(coupe>base+0.05) pan4g(tasBas,ax,az,bx,bz,base,yc0,nx,nz,L/4,(yc0-base)/3.2,0,ao,mi);
        if(top>coupe+0.05) pan4g(tasHaut,ax,az,bx,bz,coupe,top,nx,nz,L/4,(top-coupe)/3.2,0,(coupe<=base+0.05)?ao:mi,cm);
        continue;
      }
      /* travées entières ; mur trop court : bande d'enduit sans fenêtre */
      var ua=0, ub;
      if(L<bay*0.55){ ua=0.004; ub=0.024; } else ub=Math.max(1,Math.round(L/bay));
      var yc=Math.min(coupe,top), v0=-0.35/hs;
      pan4u(tasBas,ax,az,bx,bz,base,yc,nx,nz,ua,ub,v0,v0+(yc-base)/hs,ao,mi);
      if(top>coupe+0.05){
        var nEt=Math.max(1,Math.round((top-coupe)/hs));
        pan4u(tasHaut,ax,az,bx,bz,coupe,top,nx,nz,ua,ub,0,nEt,mi,cm);
      }
    }
    if(!petit && h>5 && type!=='G' && type!=='I') corniche(BAT.corn,p,top,melange(cm,clair,0.35));

    var ct=TOITS[Math.floor(r2*TOITS.length)];
    var ardoise = type==='E'||type==='M'||type==='P'||type==='H'||(milit && aire>250)||(fam===1 && r3>0.55);
    var cta=melange(blanc,teinte(0xd6dbe2),r2);
    if(milit && !ardoise) ct=melange(ct,teinte(0xc8cdd4),0.5);
    var tuiles=(r3>0.5)?BAT.toits2:BAT.toits, riseMairie=0;
    CTX_TOIT={mur:tasHaut, col:cm, base:base, h:h, p:p, n:n};
    FAITE_TOIT=top;
    if(type==='G'||type==='I'){
      if(rect>=70 && Math.min(ow,ol)>6) toitDeuxPentes(BAT.toitsM,cx,cz,ang,ow,ol,top,gris,0.32,0,1,brique);
      else toitPlat(BAT.plats,p,top,cm,ct);
    }
    else if(type==='M' && rect>=65){ riseMairie=toitCroupe(BAT.toitsA,cx,cz,ang,ow,ol,top,cta,4.2); }
    else if(rect>=72 && Math.min(ow,ol)>2.4 && k!=='i'){
      if(ardoise) toitDeuxPentes(BAT.toitsA,cx,cz,ang,ow,ol,top,cta,type==='E'?2.1:1.25,aire,r,brique);
      else toitDeuxPentes(tuiles,cx,cz,ang,ow,ol,top,ct,1,aire,r,brique);
    } else {
      toitPlat(BAT.plats,p,top,cm,ct);
      if(milit && !petit && h>6) gardeCorps(BAT.deco,p,top);
    }
    CTX_TOIT=null;
    if(riseMairie) FAITE_TOIT=Math.max(FAITE_TOIT,top+riseMairie);
    /* Ce que la 3D a réellement posé ici : hauteur des murs, faîte de la
       toiture, couleur de mur, couleur de toit. C'est la vérité contre
       laquelle on mesure l'outil de relevé 360 — on lui donne des panoramas
       rendus de ce monde-ci et on compare ce qu'il retrouve à ce qui a été
       bâti, au lieu d'aller vérifier sur le terrain ce qu'on ne sait pas
       encore mesurer. Noté après la toiture, pour disposer du faîte. */
    BATIS_POSES.push({la:laDeZ(cz), lo:loDeX(cx), h:+h.toFixed(2),
      sol:+base.toFixed(2), murs:+top.toFixed(2), faite:+FAITE_TOIT.toFixed(2),
      mur:cm.slice(), toit:(ardoise?cta:ct).slice(),
      fam:fam, type:type||null, aire:aire, ow:+ow.toFixed(1), ol:+ol.toFixed(1)});
    if(type==='E' && aire>120) clocher(cx,cz,ang,ow,ol,base,top,cm,cta);
    if(type==='M') drapeau(cx,cz,ang,top+(riseMairie||0.4));
    marquerPoly(p);
  }
  /* les deux monuments relevés en photo, bâtis dans les mêmes tas */
  try{ porteChalon(); }catch(e){ console.warn('Porte Chalon :',e); }
  try{ monumentDenfert(); }catch(e){ console.warn('monument :',e); }
  return BAT;
};

function etapeBatisRiche(){
  var b=construireBatis(Dbats), f;
  MAT.murs=[]; MAT.rdcs=[];
  for(f=0;f<NB_FAM;f++){ MAT.murs.push(facadeRiche(f,false)); MAT.rdcs.push(facadeRiche(f,true)); }
  MAT.mursE=MAT.murs[0]; MAT.rdcE=MAT.rdcs[0]; MAT.mursP=MAT.murs[1]; MAT.rdcP=MAT.rdcs[1];
  MAT.mursE2=MAT.murs[2]; MAT.rdcE2=MAT.rdcs[2]; MAT.mursM=MAT.murs[3]; MAT.rdcM=MAT.rdcs[3];
  MAT.rdcC=facadeN(faireVitrine(),faireFenetresRect(256,205,[[16,88,150,98],[180,88,60,104],[8,20,240,26]],1),[[16,88,150,98],[180,88,60,104]]);
  MAT.mursS=facadeN(faireEcole(),faireFenetresRect(256,205,[[12,40,104,112],[140,40,104,112]],0.35),[[12,40,104,112],[140,40,104,112]]);
  MAT.mursEg=facadeN(faireEglise(),null,[[96,100,64,290]],2.8);
  MAT.fenetresNuit=MAT.murs.concat(MAT.rdcs,[MAT.rdcC,MAT.mursS]);
  MAT.mursI=matTexture(faireBardage(),2.6,{rugo:0.5,metal:0.35});
  MAT.annexes=matTexture(faireMurNu(),2.2,{rugo:0.95});
  MAT.corn=matTexture(faireMurNu(),1.6,{rugo:0.9});
  MAT.chem=matTexture(faireMurNu(),1.8,{rugo:0.92});
  MAT.zinc=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.42, metalness:0.55});
  MAT.toits=matTexture(faireTuiles(),3.2,{rugo:0.84});
  MAT.toits2=matTexture(faireTuiles(),3.2,{rugo:0.84});
  MAT.toitsA=matTexture(faireArdoise(),2.6,{rugo:0.55,metal:0.05});
  MAT.toitsM=matTexture(faireBardage(),2.6,{rugo:0.45,metal:0.4});
  MAT.plats=matTexture(faireChaussee(),1.4,{rugo:0.94});
  MAT.deco=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.6, metalness:0.15});
  if(phAppliquer(MAT.toits,'clay_roof_tiles_02',0.62,0.62,1.3)) MAT.toits.color.setScalar(1.12);
  if(phAppliquer(MAT.toits2,'ceramic_roof_01',0.5,0.5,1.2)) MAT.toits2.color.setScalar(1.18);
  if(phAppliquer(MAT.toitsA,'roof_slates_02',0.55,0.55,1.1)) MAT.toitsA.color.setRGB(0.78,0.90,1.10);
  if(phAppliquer(MAT.plats,'gravel_road',0.8,0.8,0.8)) MAT.plats.color.setScalar(1.05);
  /* NB_FAM et non 6 : en ajoutant la septième famille j'avais corrigé les
     deux boucles de création mais pas celle-ci, et les murs de cette famille
     partaient dans des tas que rien n'ajoutait à la scène. Les bâtiments
     concernés n'avaient donc aucun mur, seulement leur toit — c'est la
     « zone de vide » vue sur le terrain : une toiture suspendue au-dessus
     de rien. */
  for(f=0;f<NB_FAM;f++){ ajouter(b.murs[f],MAT.murs[f],true,true); ajouter(b.rdc[f],MAT.rdcs[f],true,true); }
  ajouter(b.rdcC,MAT.rdcC,true,true);     ajouter(b.mursS,MAT.mursS,true,true);
  ajouter(b.mursEg,MAT.mursEg,true,true); ajouter(b.mursI,MAT.mursI,true,true);
  ajouter(b.annexes,MAT.annexes,true,true);
  ajouter(b.corn,MAT.corn,true,true);
  ajouter(b.toits,MAT.toits,true,true);   ajouter(b.toits2,MAT.toits2,true,true);
  ajouter(b.toitsA,MAT.toitsA,true,true); ajouter(b.toitsM,MAT.toitsM,true,true);
  ajouter(b.plats,MAT.plats,true,true);   ajouter(b.deco,MAT.deco,true,true);
  ajouter(b.zinc,MAT.zinc,true,false);    ajouter(b.chem,MAT.chem,true,true);
  /* bronze patiné du lion et de la statue du monument : sombre, un peu
     métallique, comme sur les photos */
  MAT.bronze=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.52, metalness:0.45});
  ajouter(b.bronze,MAT.bronze,true,true);
  /* pierre de taille des monuments : MAT.deco n'a aucune texture, la Porte
     Chalon en sortait d'un gris parfaitement plat. Assises de calcaire, et
     la photo Poly Haven par-dessus quand elle est là. */
  var ctai=toile(256,256); fondPierre(ctai.getContext('2d'),256,256);
  MAT.taille=matTexture(ctai,2.0,{rugo:0.86});
  /* 1,4 répétition par unité d'UV, et non 0,5 : à 0,5 la tuile de grès
     couvrait 3,2 m et la Porte Chalon sortait en blocs cyclopéens, là où
     la photo montre des assises de 30 cm. */
  phAppliquer(MAT.taille,'white_sandstone_blocks_02',1.4,1.4,0.9);
  ajouter(b.taille,MAT.taille,true,true);
  /* Des matériaux nommés : sans cela le sondeur (ESPACE3D.sonder) ne peut
     dire que « sans nom », et on ne sait pas si une surface suspendue est
     une toiture, une corniche ou un mur. */
  for(f=0;f<NB_FAM;f++){ MAT.murs[f].name='mur f'+f; MAT.rdcs[f].name='rdc f'+f; }
  MAT.rdcC.name='rdc commerce'; MAT.mursS.name='mur ecole'; MAT.mursEg.name='mur eglise';
  MAT.mursI.name='mur bardage'; MAT.annexes.name='annexe'; MAT.corn.name='corniche';
  MAT.toits.name='toit tuiles'; MAT.toits2.name='toit tuiles 2'; MAT.toitsA.name='toit ardoise';
  MAT.toitsM.name='toit bardage'; MAT.plats.name='toit plat'; MAT.deco.name='deco';
  MAT.zinc.name='zinc'; MAT.chem.name='cheminee'; MAT.bronze.name='bronze'; MAT.taille.name='pierre de taille';
}
ETAPES.forEach(function(e){ if(e[1]===etapeBatis){ e[1]=etapeBatisRiche; e[0]='Bâtiments : façades, toitures, cheminées'; } });
/* =================================================================
   Rendu réaliste : pelouses moins saturées, arbres lointains rendus
   d'après les vrais arbres ez-tree (panneaux croisés) au lieu des
   taches peintes.
================================================================= */
function desaturerMat(mat,garde,teinteGL,cle){
  if(!mat) return;
  var ob=mat.onBeforeCompile;
  mat.onBeforeCompile=function(sh,r){
    if(ob) ob.call(mat,sh,r);
    sh.fragmentShader=sh.fragmentShader.replace('#include <emissivemap_fragment>',
      'float lzD=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114));\n'+
      'diffuseColor.rgb=mix(vec3(lzD),diffuseColor.rgb,'+garde.toFixed(2)+')*vec3('+teinteGL+');\n#include <emissivemap_fragment>');
  };
  var ck=mat.customProgramCacheKey;
  mat.customProgramCacheKey=function(){ return (ck?ck.call(mat):'')+'|'+cle; };
  mat.needsUpdate=true;
}
var _matSolZD=materielSol;
materielSol=function(){
  var m=_matSolZD();
  desaturerMat(m,0.58,'0.96,0.95,0.84','solZD');
  return m;
};
etapeZones=envelopperEtape(etapeZones,function(){ desaturerMat(MAT.sol,0.58,'0.96,0.95,0.84','zonesZD'); });

/* ---------------- imposteurs d'arbres ---------------- */
function imposteurArbre(v){
  var S=256, rt=new THREE.WebGLRenderTarget(S,S*2);
  rt.texture.colorSpace=THREE.SRGBColorSpace;
  var sc=new THREE.Scene();
  sc.add(new THREE.AmbientLight(0xffffff,0.8));
  var dl=new THREE.DirectionalLight(0xfff4e6,1.1); dl.position.set(2,5,6); sc.add(dl);
  var grp=new THREE.Group();
  v.parts.forEach(function(p){ grp.add(new THREE.Mesh(p.geo,p.mat)); });
  sc.add(grp);
  var bb=new THREE.Box3().setFromObject(grp), sz=bb.getSize(new THREE.Vector3()), c=bb.getCenter(new THREE.Vector3());
  var hw=Math.max(Math.max(sz.x,sz.z)/2, sz.y/4)*1.03, hH=hw*2;
  var cam=new THREE.OrthographicCamera(-hw,hw,hH,-hH,0.1,200);
  cam.position.set(c.x,c.y,c.z+80); cam.lookAt(c.x,c.y,c.z);
  var prevRT=renderer.getRenderTarget(), prevCol=new THREE.Color(), prevA=renderer.getClearAlpha();
  renderer.getClearColor(prevCol);
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000,0); renderer.clear();
  renderer.render(sc,cam);
  var buf=new Uint8Array(S*S*2*4);
  renderer.readRenderTargetPixels(rt,0,0,S,S*2,buf);
  renderer.setRenderTarget(prevRT); renderer.setClearColor(prevCol,prevA);
  rt.dispose();
  var cv=document.createElement('canvas'); cv.width=S; cv.height=S*2;
  var g=cv.getContext('2d'), im=g.createImageData(S,S*2);
  for(var y=0;y<S*2;y++){
    var src=(S*2-1-y)*S*4, dst=y*S*4;
    for(var x=0;x<S*4;x+=4){
      im.data[dst+x]=buf[src+x]; im.data[dst+x+1]=buf[src+x+1]; im.data[dst+x+2]=buf[src+x+2];
      im.data[dst+x+3]=buf[src+x+3]>40?255:0;
    }
  }
  g.putImageData(im,0,0);
  var tex=new THREE.CanvasTexture(cv);
  tex.colorSpace=THREE.SRGBColorSpace; tex.anisotropy=4;
  /* sol de l'arbre dans l'image, hauteur visible rapportée à un panneau de hauteur 1 */
  var sol=(bb.min.y-(c.y-hH))/(2*hH);
  return {tex:tex, sol:sol, h:sz.y/(2*hH), larg:0.5};
}
function geoImposteur(I){
  var tas=new Tas(64), y0=-I.sol, y1=1-I.sol, w=I.larg/2, blanc=teinte(0xffffff);
  for(var k=0;k<2;k++){
    var a=k*PI/2, co=Math.cos(a)*w, si=Math.sin(a)*w;
    var A=[-co,y0,-si], B=[co,y0,si], C=[co,y1,si], D=[-co,y1,-si];
    var nb=[0,0.35,0], nh=[0,1,0];
    tas.triN(A,B,C, nb,nb,nh, [0,0,1,0,1,1], blanc);
    tas.triN(A,C,D, nb,nh,nh, [0,0,1,1,0,1], blanc);
  }
  return tas.geo();
}
function etapeImposteurs(){
  if(!ARB.pret || !ARB.varH || !ARB.loin) return;
  try{
    [0,4].forEach(function(vi,t){
      var src=ARB.varH[vi];
      if(!src) return;
      var I=imposteurArbre(src);
      var mat=new THREE.MeshStandardMaterial({map:I.tex, alphaTest:0.5, side:THREE.DoubleSide, roughness:0.92, metalness:0});
      var feu=ARB.loin[t][1], tronc=ARB.loin[t][0];
      feu.geometry.dispose(); feu.geometry=geoImposteur(I); feu.material=mat;
      tronc.visible=false;
      ARB.loinH[t]=I.h;
    });
    ARB.cx=1e9;
  }catch(e){ console.error('Imposteurs',e); }
}
(function(){
  for(var i=0;i<ETAPES.length;i++) if(ETAPES[i][0]==='Arbres réalistes'){
    ETAPES.splice(i+1,0,['Arbres lointains',etapeImposteurs]); break;
  }
})();
/* =================================================================
   Policier (Microsoft Rocketbox « Police_Male_01 », licence MIT),
   posé à la main comme les véhicules : même panneau, même
   enregistrement dans le parcours, visible sur la carte.
================================================================= */
VEH_DEF.policier={avatar:'Police_Male_01', nom:'Policier', icone:'👮', h:1.80};
var _prepVehZE=preparerModeleVehicule;
preparerModeleVehicule=function(t){
  var D=VEH_DEF[t];
  if(!D.avatar) return _prepVehZE(t);
  if(!window.ACTIFS || !ACTIFS[D.avatar+'.fbx']) return Promise.reject(new Error('modèle du policier absent'));
  return chargerAvatar(D.avatar).then(function(f){
    var g=normaliserAvatar(f,D.h), R=reposOs(g);
    restaurerOs(R); g.updateMatrixWorld(true);
    poserBrasJalon(g,'n');
    var fige=figerAvatar(g), corps=new THREE.Group();
    /* l'arme de service n'a pas de texture fournie : noir mat plutôt que le bleu par défaut */
    var noirArme=new THREE.MeshStandardMaterial({color:0x1b1d21, roughness:0.55, metalness:0.35});
    function corriger(mt){ return (mt && /pistol|gun|weapon/i.test(mt.name||'')) ? noirArme : mt; }
    fige.forEach(function(q){
      var mt=Array.isArray(q.mat) ? q.mat.map(corriger) : corriger(q.mat);
      var m=new THREE.Mesh(q.geo,mt); m.castShadow=true; m.receiveShadow=true; corps.add(m);
    });
    restaurerOs(R);
    var pivot=new THREE.Group();
    pivot.add(corps);
    VM.modeles[t]={gabarit:pivot, L:1.2, W:0.6};
  });
};
/* =================================================================
   Vue 3D : barre compacte à menus (écran 14 pouces), compteurs sur
   une ligne, points de la ville rafraîchis quand la carte les modifie.
================================================================= */
function styleBarreCompacte(){
  if($e('e3-style-compact')) return;
  var s=document.createElement('style');
  s.id='e3-style-compact';
  s.textContent=[
    '.e3-barre{top:8px;right:8px;gap:5px;flex-wrap:nowrap;max-width:none}',
    '#e3 .e3-barre>button,#e3 .e3-menu>button{padding:6px 10px}',
    '.e3-menu{position:relative}',
    '#e3 .e3-menu>.e3-menu-b::after{content:" ▾";font-size:10px;opacity:.7}',
    '#e3 .e3-menu.ouvert>.e3-menu-b,#e3 .e3-menu.actif>.e3-menu-b{border-color:#F2B33D;color:#F2B33D}',
    '.e3-pop{position:absolute;top:calc(100% + 6px);right:0;z-index:20;min-width:220px;background:rgba(14,20,31,.97);border:1px solid #3a4a63;border-radius:12px;padding:7px;display:flex;flex-direction:column;gap:5px;box-shadow:0 12px 34px rgba(0,0,0,.55)}',
    '#e3 .e3-pop button{width:100%;text-align:left}',
    '.e3-pop-titre{font-size:9.5px;text-transform:uppercase;letter-spacing:.6px;color:#98A3B6;padding:2px 3px 0}',
    '.e3-hud{top:8px;left:8px}',
    '.e3-sous{display:none}',
    '.e3-marque{font-size:13px}',
    '.e3-chiffres{gap:4px;margin-top:5px;flex-wrap:nowrap;max-width:none}',
    '.e3-ch{padding:3px 7px;min-width:0;border-radius:7px;white-space:nowrap}',
    '.e3-ch i{font-size:8px;letter-spacing:.4px}',
    '.e3-ch b{font-size:13px}',
    '.e3-ch em{font-size:9px}',
    '#e3-panneau{top:48px}',
    '#e3-jp,#e3-veh,#e3-eq,#e3-parc{top:74px!important}',
    '.e3-allure{padding:4px 9px;bottom:10px;left:10px}',
    '#e3 .e3-allure input[type=range]{width:120px}',
    '@media (max-width:1180px){ .e3-ch i{display:none} }'
  ].join('\n');
  document.head.appendChild(s);
}
function fermerMenus3D(){
  document.querySelectorAll('#e3 .e3-menu').forEach(function(m){ m.classList.remove('ouvert'); var p=m.querySelector('.e3-pop'); if(p) p.hidden=true; });
}
function compacter3D(){
  var barre=document.querySelector('#e3 .e3-barre');
  if(!barre || barre.__compacte) return;
  barre.__compacte=true;
  styleBarreCompacte();
  function menu(titre,aide,ids){
    var m=document.createElement('div'); m.className='e3-menu';
    var b=document.createElement('button'); b.type='button'; b.className='e3-menu-b'; b.textContent=titre; b.title=aide;
    var pop=document.createElement('div'); pop.className='e3-pop'; pop.hidden=true;
    ids.forEach(function(id){
      if(id.charAt(0)==='#'){ var t=document.createElement('div'); t.className='e3-pop-titre'; t.textContent=id.slice(1); pop.appendChild(t); return; }
      var e=$e(id); if(e) pop.appendChild(e);
    });
    b.addEventListener('click',function(ev){
      ev.stopPropagation();
      var ouvrir=pop.hidden;
      fermerMenus3D();
      pop.hidden=!ouvrir; m.classList.toggle('ouvert',ouvrir);
      b.blur();
    });
    pop.addEventListener('click',function(ev){ if(ev.target.closest && ev.target.closest('button')) setTimeout(fermerMenus3D,0); });
    m.appendChild(b); m.appendChild(pop);
    return m;
  }
  var mVue=menu('🎥 Vue','Point de vue et déplacements',['e3-vuep','e3-haute','e3-auto','e3-depart']);
  var mPoser=menu('➕ Poser','Poser jalonneurs, matériel, véhicules et policiers',['#Personnes','e3-ajout','e3-b-veh','#Matériel','e3-b-bar','e3-b-rub']);
  var mAff=menu('👁 Afficher','Ce qui est affiché dans la scène',['e3-liste','e3-b-parc','e3-b-trace','e3-circ','e3-nuit','e3-detail']);
  var bv=$e('e3-b-veh'); if(bv) bv.textContent='🪖 Véhicules et 👮 policiers';
  var carte=$e('e3-carte'), save=$e('e3-save'), aide=$e('e3-aide');
  var ordre=[carte,mVue,mPoser,mAff,save,aide];
  Array.prototype.slice.call(barre.children).forEach(function(e){ if(ordre.indexOf(e)<0) mAff.querySelector('.e3-pop').appendChild(e); });
  ordre.forEach(function(e){ if(e) barre.appendChild(e); });
  /* le menu Poser reste en surbrillance pendant une pose */
  setInterval(function(){
    var actif=!!(($e('e3-b-bar')&&$e('e3-b-bar').classList.contains('on'))||($e('e3-b-rub')&&$e('e3-b-rub').classList.contains('on'))||($e('e3-b-veh')&&$e('e3-b-veh').classList.contains('on')));
    mPoser.classList.toggle('actif',actif);
  },400);
}
document.addEventListener('click',function(ev){ if(!(ev.target.closest && ev.target.closest('#e3 .e3-menu'))) fermerMenus3D(); });
var _brancherZF=brancherInterface;
brancherInterface=function(){ _brancherZF(); compacter3D(); };

/* points de la ville modifiés sur la carte : panneaux 3D refaits */
var _signalerZF=window.ESPACE3D.signaler;
window.ESPACE3D.signaler=function(t){
  if(t==='pois'){ if(construit && typeof construirePoisCarte==='function') construirePoisCarte(); return; }
  _signalerZF(t);
};
/* =================================================================
   Piste d'obstacles militaire (parcours du combattant réglementaire,
   20 obstacles, ~500 m). Sept repères donnés par Nicolas :
   A échelle de corde (1), B ramper (4), C échelle de rails (8),
   D table irlandaise (10), E mur d'assaut (16), F fosse (17),
   G mur d'escalade / girafe (18). Les autres obstacles sont répartis
   entre ces repères dans l'ordre réglementaire ; 19 et 20 après G.
================================================================= */
/* relevés sur la capture de Nicolas (vue 3D en perspective, pivotée d'environ 55°), recalée par homographie
   sur 8 repères : jonctions tracé-routes, chemin, terrain vert, routes ; C2 = coin après l'échelle de rails */
var PISTE_REPERES={
  A:[46.415758,-0.220928], B:[46.415939,-0.221416], C:[46.416271,-0.222206], C2:[46.416332,-0.222382],
  D:[46.416842,-0.221847], E:[46.416476,-0.220958], F:[46.416340,-0.220670], G:[46.416224,-0.220386]
};
var PISTE_ORDRE=[['A',1],['B',4],['C',8],['C2',0],['D',10],['E',16],['F',17],['G',18]];
var PISTE_NOMS=['','Échelle de corde','Poutres jumelées','Réseau à enjamber','Réseau à franchir en rampant','Gué',
  'Espalier','Poutre d’équilibre','Échelle de rails','Poutres dessus-dessous','Table irlandaise','Poutre horizontale',
  'Fossé et plan incliné','Banquette et fossé','Petit mur','Fossé, banquette, fossé','Mur d’assaut','Fosse',
  'Mur d’escalade (girafe)','Chicane','Tranchées successives'];
var PISTE={groupe:null, obstacles:[]};

var PC={bois:teinte(0x8a6a45), boisS:teinte(0x5e4630), metal:teinte(0x7f868e), corde:teinte(0xc9b182), fil:teinte(0x2b2d31),
  beton:teinte(0xb7b3aa), terre:teinte(0x3f3226), sable:teinte(0xa88f64), trou:teinte(0x17130f), sac:teinte(0xb9a77c)};

/* repère local : u = sens de course, v = latéral, h = hauteur au-dessus du sol */
function PS(o,u,v,h){ return [o.x+o.ux*u+o.vx*v, o.y+h, o.z+o.uz*u+o.vz*v]; }
function boiteP(t,o,u0,u1,v0,v1,h0,h1,col){
  var a=PS(o,u0,v0,0), b=PS(o,u1,v0,0), c=PS(o,u1,v1,0), d=PS(o,u0,v1,0);
  boiteQuad(t,[a[0],a[2]],[b[0],b[2]],[c[0],c[2]],[d[0],d[2]],o.y+h0,o.y+h1,col,assombrir(col,1.06),2);
}
function tubeP(t,o,u0,v0,h0,u1,v1,h1,r,col){
  var a=PS(o,u0,v0,h0), b=PS(o,u1,v1,h1);
  tube(t,a[0],a[1],a[2],b[0],b[1],b[2],r,r,5,col,false,false);
}
function quadP(t,o,p,col){
  var A=PS(o,p[0][0],p[0][1],p[0][2]), B=PS(o,p[1][0],p[1][1],p[1][2]), C=PS(o,p[2][0],p[2][1],p[2][2]), D=PS(o,p[3][0],p[3][1],p[3][2]);
  var n=nrm(A,B,C);
  t.tri(A[0],A[1],A[2],B[0],B[1],B[2],C[0],C[1],C[2],n[0],n[1],n[2],[0,0,1,0,1,1],col);
  t.tri(A[0],A[1],A[2],C[0],C[1],C[2],D[0],D[1],D[2],n[0],n[1],n[2],[0,0,1,1,0,1],col);
  t.tri(A[0],A[1],A[2],C[0],C[1],C[2],B[0],B[1],B[2],-n[0],-n[1],-n[2],[0,0,1,1,1,0],col);
  t.tri(A[0],A[1],A[2],D[0],D[1],D[2],C[0],C[1],C[2],-n[0],-n[1],-n[2],[0,0,0,1,1,1],col);
}
function solP(t,o,u0,u1,v0,v1,h,col){ quadP(t,o,[[u0,v0,h],[u1,v0,h],[u1,v1,h],[u0,v1,h]],col); }
function poteauP(t,o,u,v,h,col){ boiteP(t,o,u-0.07,u+0.07,v-0.07,v+0.07,-0.1,h,col||PC.boisS); }
/* trou simulé : fond sombre et rebord, le relief n'étant pas creusé */
function trouP(t,o,u0,u1,v0,v1,rebord){
  solP(t,o,u0,u1,v0,v1,0.04,PC.trou);
  var e=0.14, h=rebord||0.12, cr=(h>=0.25)?PC.beton:PC.boisS;
  boiteP(t,o,u0-e,u0,v0-e,v1+e,-0.05,h,cr); boiteP(t,o,u1,u1+e,v0-e,v1+e,-0.05,h,cr);
  boiteP(t,o,u0,u1,v0-e,v0,-0.05,h,cr); boiteP(t,o,u0,u1,v1,v1+e,-0.05,h,cr);
}
var W=1.6; /* demi-largeur du couloir */

var PISTE_OBS={
  1:function(t,o){ /* échelle de corde : portique de 5 m, deux faces de corde */
    [-W,W].forEach(function(v){ tubeP(t,o,0,v,0,0,v,5.2,0.1,PC.bois); tubeP(t,o,-1.4,v,0,0,v,3,0.06,PC.bois); tubeP(t,o,1.4,v,0,0,v,3,0.06,PC.bois); });
    tubeP(t,o,0,-W-0.1,5.1,0,W+0.1,5.1,0.11,PC.bois);
    [-1,1].forEach(function(s){
      for(var k=0;k<6;k++){ var v=-1.25+k*0.5; tubeP(t,o,0,v,5.05,s*1.15,v,0.03,0.018,PC.corde); }
      for(var h=0.4;h<4.9;h+=0.45){ var uu=s*1.15*(1-h/5.05); tubeP(t,o,uu,-1.25,h,uu,1.25,h,0.016,PC.corde); }
    });
  },
  2:function(t,o){ /* poutres jumelées 1 m et 1,40 m, à 0,80 m */
    [[-0.4,1.0],[0.4,1.4]].forEach(function(p){
      boiteP(t,o,p[0]-0.08,p[0]+0.08,-W,W,p[1]-0.16,p[1],PC.bois);
      poteauP(t,o,p[0],-W-0.08,p[1]); poteauP(t,o,p[0],W+0.08,p[1]);
    });
  },
  3:function(t,o){ /* réseau à enjamber : 6 fils à 0,60 m, tous les 2 m */
    for(var k=0;k<6;k++){ var u=-4.5+k*1.8; poteauP(t,o,u,-W,0.7); poteauP(t,o,u,W,0.7); tubeP(t,o,u,-W,0.6,u,W,0.6,0.012,PC.fil); }
  },
  4:function(t,o){ /* réseau à franchir en rampant : 20 m sous fils à 0,50 m */
    solP(t,o,-10.5,10.5,-W-0.2,W+0.2,0.03,PC.sable);
    for(var u=-10;u<=10.01;u+=2.5){ poteauP(t,o,u,-W,0.6); poteauP(t,o,u,W,0.6); tubeP(t,o,u,-W,0.5,u,W,0.5,0.01,PC.fil); }
    for(var v=-W;v<=W+0.01;v+=0.8) tubeP(t,o,-10,v,0.5,10,v,0.5,0.01,PC.fil);
  },
  5:function(t,o){ /* gué : 5 plots irréguliers sur 7 m */
    [[-3.2,0.35],[-1.7,-0.4],[0,0.3],[1.6,-0.35],[3.3,0.25]].forEach(function(p){
      var a=PS(o,p[0],p[1],0);
      tube(t,a[0],a[1]-0.1,a[2],a[0],a[1]+0.15,a[2],0.17,0.17,8,PC.beton,false,true);
    });
    solP(t,o,-3.8,3.8,-1.1,1.1,0.02,teinte(0x3d4a52));
  },
  6:function(t,o){ /* espalier : barres à 0,80, 1,60 et 2,30 m */
    [-W,W].forEach(function(v){ tubeP(t,o,0,v,-0.1,0,v,2.45,0.08,PC.metal); });
    [0.8,1.6,2.3].forEach(function(h){ tubeP(t,o,0,-W,h,0,W,h,0.05,PC.metal); });
  },
  7:function(t,o){ /* poutre d'équilibre : plan incliné puis poutre de 8,50 m à 1 m */
    quadP(t,o,[[-7.4,-0.15,0.02],[-4.25,-0.15,1],[-4.25,0.15,1],[-7.4,0.15,0.02]],PC.bois);
    boiteP(t,o,-4.25,4.25,-0.1,0.1,0.88,1.0,PC.bois);
    for(var u=-4;u<=4.01;u+=2) boiteP(t,o,u-0.08,u+0.08,-0.08,0.08,-0.1,0.9,PC.boisS);
  },
  8:function(t,o){ /* échelle de rails : double échelle métallique de 5 m */
    [-1,1].forEach(function(s){
      [-0.9,0.9].forEach(function(v){ tubeP(t,o,s*1.3,v,0,s*0.12,v,5.05,0.06,PC.metal); });
      for(var h=0.5;h<5;h+=0.5){ var uu=s*(1.3-(1.18*h/5.05)); tubeP(t,o,uu,-0.9,h,uu,0.9,h,0.035,PC.metal); }
    });
    tubeP(t,o,0,-1,5.05,0,1,5.05,0.06,PC.metal);
  },
  9:function(t,o){ /* poutres dessus-dessous : 1,20 / 0,70 / 1,20 / 0,70 m */
    [[-2.25,1.2],[-0.75,0.7],[0.75,1.2],[2.25,0.7]].forEach(function(p){
      boiteP(t,o,p[0]-0.08,p[0]+0.08,-W,W,p[1]-0.15,p[1],PC.bois);
      poteauP(t,o,p[0],-W-0.08,p[1]); poteauP(t,o,p[0],W+0.08,p[1]);
    });
  },
  10:function(t,o){ /* table irlandaise : planche de 0,45 m à 2 m */
    boiteP(t,o,-0.22,0.23,-W,W,1.9,2.0,PC.bois);
    [-W-0.08,W+0.08].forEach(function(v){ poteauP(t,o,0,v,2.0); });
    boiteP(t,o,-0.05,0.05,-W,W,1.0,1.08,PC.boisS);
  },
  11:function(t,o){ /* poutre horizontale à 0,80 m */
    boiteP(t,o,-0.08,0.08,-W,W,0.66,0.8,PC.bois);
    poteauP(t,o,0,-W-0.08,0.8); poteauP(t,o,0,W+0.08,0.8);
    solP(t,o,0.3,1.3,-W,W,0.02,PC.sable);
  },
  12:function(t,o){ /* fossé de 0,50 m puis plan incliné de 2,50 m */
    trouP(t,o,-1.5,0,-W,W,0.08);
    quadP(t,o,[[0.6,-W,0.02],[3.1,-W,0.5],[3.1,W,0.5],[0.6,W,0.02]],PC.bois);
    boiteP(t,o,3.1,3.3,-W,W,-0.05,0.5,PC.boisS);
  },
  13:function(t,o){ /* banquette (plan incliné de 1 m) et fossé */
    quadP(t,o,[[-2.4,-W,0.02],[-0.4,-W,1.0],[-0.4,W,1.0],[-2.4,W,0.02]],PC.terre);
    boiteP(t,o,-0.4,0.2,-W,W,-0.05,1.0,PC.terre);
    trouP(t,o,0.6,1.4,-W,W,0.08);
  },
  14:function(t,o){ boiteP(t,o,-0.15,0.15,-W,W,-0.05,1.0,PC.beton); },
  15:function(t,o){ /* fossé, banquette de 1,50 m, fossé */
    trouP(t,o,-2.4,-1.7,-W,W,0.06);
    quadP(t,o,[[-1.5,-W,0.02],[0,-W,0.9],[0,W,0.9],[-1.5,W,0.02]],PC.terre);
    quadP(t,o,[[0,-W,0.9],[1.5,-W,0.02],[1.5,W,0.02],[0,W,0.9]],PC.terre);
    trouP(t,o,1.7,2.4,-W,W,0.06);
  },
  16:function(t,o){ /* mur d'assaut : 2 m, 0,40 m d'épaisseur, parois lisses */
    boiteP(t,o,-0.2,0.2,-W,W,-0.05,2.0,teinte(0x7a5c3d));
    boiteP(t,o,-0.24,0.24,-W-0.04,W+0.04,1.98,2.06,PC.boisS);
  },
  17:function(t,o){ /* fosse : 2,20 m de profondeur, 4,30 m de large */
    trouP(t,o,-2.15,2.15,-W,W,0.3);
    for(var h=-1.9;h<0;h+=0.45) boiteP(t,o,-2.13,-2.03,-0.3,0.3,h,h+0.06,PC.metal);
  },
  18:function(t,o){ /* mur d'escalade (girafe) : 4 m, plan d'appui et marches */
    boiteP(t,o,-0.12,0.12,-W,W,-0.05,4.0,teinte(0x7a5c3d));
    for(var h=0.9;h<4;h+=0.9) boiteP(t,o,-0.4,-0.12,-W,W,h,h+0.07,PC.boisS);
    boiteP(t,o,0.12,1.4,-W,W,3.9,4.0,PC.bois);
    for(var k=1;k<=4;k++){ var h2=4-k*0.95, u=1.4+k*0.7; boiteP(t,o,u-0.7,u,-W,W,h2-0.08,h2,PC.bois); poteauP(t,o,u-0.1,-W,h2); poteauP(t,o,u-0.1,W,h2); }
    [-W,W].forEach(function(v){ poteauP(t,o,1.35,v,4.0); });
  },
  19:function(t,o){ /* chicane : murets de 1 m en quinconce */
    for(var k=0;k<4;k++){ var u=-2.25+k*1.5, v0=(k%2)?-0.3:-W, v1=(k%2)?W:0.3; boiteP(t,o,u-0.1,u+0.1,v0,v1,-0.05,1.0,PC.beton); }
  },
  20:function(t,o){ /* tranchées successives bordées de sacs */
    [-3,0,3].forEach(function(u){
      trouP(t,o,u-0.45,u+0.45,-W,W,0.05);
      for(var v=-W;v<W;v+=0.55){ boiteP(t,o,u-0.8,u-0.55,v,v+0.5,0,0.18,PC.sac); boiteP(t,o,u+0.55,u+0.8,v,v+0.5,0,0.18,PC.sac); }
    });
  }
};

function etapePiste(){
  if(!PISTE_REPERES) return;
  if(PISTE.groupe){ monde.remove(PISTE.groupe); liberer(PISTE.groupe); }
  /* polyligne des repères et longueurs cumulées */
  var N=[], cum=[0], i;
  PISTE_ORDRE.forEach(function(e){ var p=PISTE_REPERES[e[0]]; if(p) N.push({x:pX(p[1]), z:pZ(p[0]), n:e[1], k:e[0]}); });
  for(i=1;i<N.length;i++) cum.push(cum[i-1]+Math.hypot(N[i].x-N[i-1].x,N[i].z-N[i-1].z));
  function surPiste(d){
    var j=1; while(j<N.length-1 && cum[j]<d) j++;
    var a=N[j-1], b=N[j], L=(cum[j]-cum[j-1])||1, t=(d-cum[j-1])/L;
    return {x:a.x+(b.x-a.x)*t, z:a.z+(b.z-a.z)*t, ux:(b.x-a.x)/L, uz:(b.z-a.z)/L};
  }
  var ancres=N.map(function(p,j){ return {n:p.n, d:cum[j]}; }).filter(function(a){ return a.n>0; });
  var pos={};
  ancres.forEach(function(a,j){
    pos[a.n]=a.d;
    var b=ancres[j+1]; if(!b) return;
    for(var n=a.n+1;n<b.n;n++) pos[n]=a.d+(b.d-a.d)*(n-a.n)/(b.n-a.n);
  });
  var dG=ancres[ancres.length-1].d;
  pos[19]=dG+16; pos[20]=dG+34;
  var t=new Tas(65536), grp=new THREE.Group();
  PISTE.obstacles=[];
  for(var n=1;n<=20;n++){
    if(pos[n]===undefined) continue;
    var s=surPiste(pos[n]);
    /* au coin, orientation moyenne des deux segments */
    var s1=surPiste(Math.max(0,pos[n]-1.5)), s2=surPiste(pos[n]+1.5), ux=s2.x-s1.x, uz=s2.z-s1.z, L=Math.hypot(ux,uz)||1;
    ux/=L; uz/=L;
    if(pos[n]>cum[cum.length-1]){ var fin=N[N.length-1], av=N[N.length-2], LL=Math.hypot(fin.x-av.x,fin.z-av.z)||1; ux=(fin.x-av.x)/LL; uz=(fin.z-av.z)/LL; s={x:fin.x+ux*(pos[n]-cum[cum.length-1]), z:fin.z+uz*(pos[n]-cum[cum.length-1])}; }
    var o={x:s.x, z:s.z, y:hauteur(s.x,s.z), ux:ux, uz:uz, vx:-uz, vz:ux};
    try{ PISTE_OBS[n](t,o); }catch(e){ console.error('Obstacle '+n,e); }
    /* panneau numéroté au départ de l'obstacle */
    var pp=PS(o,-3.2,-W-0.9,0);
    tube(t,pp[0],pp[1]-0.1,pp[2],pp[0],pp[1]+1.7,pp[2],0.04,0.04,5,PC.metal,false,true);
    var e=etiquette(n+' · '+PISTE_NOMS[n],'rgba(30,22,6,0.92)','#F2B33D','#fff0c8',0,0.62);
    e.position.set(pp[0],pp[1]+2.05,pp[2]);
    grp.add(e);
    PISTE.obstacles.push({n:n, x:o.x, z:o.z});
  }
  if(!MAT.piste) MAT.piste=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.86, metalness:0.05, side:THREE.DoubleSide});
  ajouter(t,MAT.piste,true,true);
  monde.add(grp);
  PISTE.groupe=grp;
}
ETAPES.push(['Piste d’obstacles',etapePiste]);
/* =================================================================
   Piste d'obstacles (2) : obstacles posés d'après la carte
   (CARTE.pisteObstacles), déplaçables et orientables dans la 3D,
   allée de graviers gris qui les relie, arbres de part et d'autre du
   chemin qui traverse la piste.
================================================================= */
var PH={objs:[], chemin:null, sel:null, drag:null, anneau:null, matGrav:null};
function dirDepuisAz(az){ var a=az*PI/180; return {ux:Math.sin(a), uz:-Math.cos(a)}; }

function construireObstacle(o){
  var t=new Tas(8192), loc={x:0, z:0, y:0, ux:1, uz:0, vx:0, vz:1};
  try{ PISTE_OBS[o.n](t,loc); }catch(e){ console.error('Obstacle '+o.n,e); }
  var pp=PS(loc,-3.2,-W-0.9,0);
  tube(t,pp[0],-0.1,pp[2],pp[0],1.7,pp[2],0.04,0.04,5,PC.metal,false,true);
  if(!MAT.piste) MAT.piste=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.86, metalness:0.05, side:THREE.DoubleSide});
  var g=new THREE.Group(), m=new THREE.Mesh(t.geo(),MAT.piste);
  m.castShadow=true; m.receiveShadow=true;
  g.add(m);
  var e=etiquette(o.n+' · '+o.nom,'rgba(30,22,6,0.92)','#F2B33D','#fff0c8',0,0.62);
  e.position.set(pp[0],2.05,pp[2]);
  g.add(e);
  /* zone de clic invisible, plus facile à attraper que des fils fins */
  m.geometry.computeBoundingBox();
  var bb=m.geometry.boundingBox, sz=bb.getSize(new THREE.Vector3()), ct=bb.getCenter(new THREE.Vector3());
  var px=new THREE.Mesh(new THREE.BoxGeometry(Math.max(sz.x,1.6),Math.max(sz.y,1.2),Math.max(sz.z,1.6)), new THREE.MeshBasicMaterial({visible:false}));
  px.position.copy(ct);
  g.add(px);
  g.userData={o:o, proxy:px, L:Math.max(sz.x,sz.z,2)};
  return g;
}
function placerObstacle(g,o){
  var x=pX(o.lo), z=pZ(o.la), d=dirDepuisAz(o.az);
  g.position.set(x,hauteur(x,z),z);
  g.rotation.set(0,Math.atan2(-d.uz,d.ux),0);
}
function cheminGraviers(L){
  if(PH.chemin){ monde.remove(PH.chemin); PH.chemin.geometry.dispose(); PH.chemin=null; }
  var pts=[];
  L.forEach(function(o){ pts.push(pX(o.lo),pZ(o.la)); });
  var tas=new Tas(8192);
  ruban(tas,pts,1.8,teinte(0xc4c4c0),0.12,2,2.4);
  if(!PH.matGrav){
    PH.matGrav=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.95, metalness:0,
      polygonOffset:true, polygonOffsetFactor:-5, polygonOffsetUnits:-5});
    if(typeof phAppliquer==='function' && phAppliquer(PH.matGrav,'gravel_road',1,1,1.0) && typeof desaturerMat==='function')
      desaturerMat(PH.matGrav,0.04,'1.05,1.05,1.07','gravPiste');
  }
  PH.chemin=new THREE.Mesh(tas.geo(),PH.matGrav);
  PH.chemin.receiveShadow=true; PH.chemin.renderOrder=2;
  monde.add(PH.chemin);
}
function etapePiste2(){
  if(!window.CARTE || !CARTE.pisteObstacles) return;
  PH.objs.forEach(function(g){ monde.remove(g); });
  PH.objs=[];
  var L=CARTE.pisteObstacles();
  L.forEach(function(o){ var g=construireObstacle(o); placerObstacle(g,o); monde.add(g); PH.objs.push(g); });
  cheminGraviers(L);
  PISTE.obstacles=L.map(function(o){ return {n:o.n, x:pX(o.lo), z:pZ(o.la)}; });
}
function majPiste3D(){
  if(!PH.objs.length) return;
  var L=CARTE.pisteObstacles();
  L.forEach(function(o,i){ var g=PH.objs[i]; if(g){ g.userData.o=o; placerObstacle(g,o); } });
  cheminGraviers(L);
  PISTE.obstacles=L.map(function(o){ return {n:o.n, x:pX(o.lo), z:pZ(o.la)}; });
  if(PH.sel){ majAnneauObs(); majPanneauObs(); }
}
ETAPES.forEach(function(e){ if(e[1]===etapePiste){ e[1]=etapePiste2; } });

/* ---------------- arbres de part et d'autre du chemin qui traverse la piste ---------------- */
function etapeArbresChemin(){
  if(!window.CARTE || !CARTE.pisteObstacles || !Dvoies) return;
  var L=CARTE.pisteObstacles(), P={};
  L.forEach(function(o){ P[o.n]=[pX(o.lo),pZ(o.la)]; });
  /* Cette étape borne le chemin sur les obstacles 1, 4, 16 et 17 de la piste,
     et écarte ensuite les arbres des vingt obstacles. Sans piste — une autre
     carte que Saint-Maixent — P est vide et P[1][0] jetait une exception qui
     arrêtait la construction du monde entier. La garde sur CARTE.pisteObstacles
     ne suffisait pas : la fonction existe, c'est sa liste qui est vide.      */
  for(var np=1;np<=20;np++) if(!P[np]) return;
  var s1=[P[1],P[4]], s2=[P[16],P[17]];
  function coupe(a,b,c,d){
    var rx=b[0]-a[0], rz=b[1]-a[1], sx=d[0]-c[0], sz=d[1]-c[1], den=rx*sz-rz*sx;
    if(Math.abs(den)<1e-9) return false;
    var t=((c[0]-a[0])*sz-(c[1]-a[1])*sx)/den, u=((c[0]-a[0])*rz-(c[1]-a[1])*rx)/den;
    return t>=0 && t<=1 && u>=0 && u<=1;
  }
  function chercher(p){
    var i1=-1, i2=-1;
    for(var i=2;i<p.length;i+=2){
      var a=[p[i-2],p[i-1]], b=[p[i],p[i+1]];
      if(i1<0 && coupe(a,b,s1[0],s1[1])) i1=i;
      if(i2<0 && coupe(a,b,s2[0],s2[1])) i2=i;
    }
    return (i1>=0 && i2>=0) ? {p:p, a:Math.min(i1,i2), b:Math.max(i1,i2)} : null;
  }
  var trouve=null;
  Dvoies.forEach(function(l){
    if(trouve) return;
    var c=l.split('\t');
    if(c[0]!=='s' && c[0]!=='t') return;
    trouve=chercher(pointsDe(c[3]));
  });
  if(!trouve) return;
  /* portion du chemin entre les deux colonnes, prolongée de 35 m de chaque côté */
  var p=trouve.p, deb=Math.max(0,trouve.a-2), fin=Math.min(p.length-2,trouve.b), ext=0;
  while(deb>0 && ext<35){ ext+=Math.hypot(p[deb]-p[deb-2],p[deb+1]-p[deb-1]); deb-=2; }
  ext=0;
  while(fin<p.length-2 && ext<35){ ext+=Math.hypot(p[fin+2]-p[fin],p[fin+3]-p[fin+1]); fin+=2; }
  var pts=p.slice(deb,fin+2), q=densifier(pts,1), I=IDX_SOL||(IDX_SOL=indexerChaussees(Dvoies));
  function libre(x,z){
    if(bloquer(x,z)) return false;
    var rp=routeProche(I,x,z,12); if(rp && rp.d<rp.w/2+2.2) return false;
    for(var n=1;n<=20;n++) if(Math.hypot(P[n][0]-x,P[n][1]-z)<6.5) return false;
    for(n=2;n<=20;n++){
      var ax=P[n-1][0], az=P[n-1][1], bx=P[n][0], bz=P[n][1], dx=bx-ax, dz=bz-az, L2=dx*dx+dz*dz||1;
      var t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/L2));
      if(Math.hypot(ax+dx*t-x,az+dz*t-z)<3.2) return false;
    }
    return true;
  }
  var acc=0, nb=0;
  for(var i=1;i<q.x.length;i++){
    acc+=Math.hypot(q.x[i]-q.x[i-1],q.z[i]-q.z[i-1]);
    if(acc<8.5) continue;
    acc=0;
    var dx=q.x[i]-q.x[i-1], dz=q.z[i]-q.z[i-1], Ln=Math.hypot(dx,dz)||1, nx=-dz/Ln, nz=dx/Ln;
    [-1,1].forEach(function(s){
      for(var essai=0;essai<8;essai++){
        var j=essai*0.37;
        var x=q.x[i]+nx*s*(4.2+j)+dx/Ln*j*1.3, z=q.z[i]+nz*s*(4.2+j)+dz/Ln*j*1.3;
        /* l'étape des arbres en écarte 4 sur 10 selon leur position : on choisit une position conservée */
        if(alea(Math.round(x*7),Math.round(z*7))>0.6) continue;
        if(alea(Math.round(z*11),Math.round(x*11))>0.8) continue;
        if(!libre(x,z)) break;
        Darbres.push([x,z,0]); nb++;
        break;
      }
    });
  }
  PH.arbresChemin=nb;
}
(function(){
  for(var i=0;i<ETAPES.length;i++) if(ETAPES[i][0]==='Arbres réalistes'){
    ETAPES.splice(i,0,['Arbres du chemin de la piste',etapeArbresChemin]); break;
  }
})();

/* ---------------- sélection, déplacement, orientation dans la 3D ---------------- */
function viserObs(ev){
  if(!PH.objs.length) return null;
  raycaster.setFromCamera(ndc(ev),camera);
  var h=raycaster.intersectObjects(PH.objs.map(function(g){ return g.userData.proxy; }),false);
  if(!h.length) return null;
  for(var i=0;i<PH.objs.length;i++) if(PH.objs[i].userData.proxy===h[0].object) return PH.objs[i];
  return null;
}
function majAnneauObs(){
  if(!PH.anneau){
    PH.anneau=new THREE.Mesh(new THREE.RingGeometry(0.93,1,48),
      new THREE.MeshBasicMaterial({color:0xF2B33D, transparent:true, opacity:0.95, depthWrite:false, side:THREE.DoubleSide}));
    PH.anneau.rotation.x=-PI/2; PH.anneau.renderOrder=7;
    monde.add(PH.anneau);
  }
  var g=PH.sel;
  if(!g){ PH.anneau.visible=false; return; }
  var r=g.userData.L*0.62;
  PH.anneau.scale.set(r,r,r);
  PH.anneau.position.set(g.position.x,g.position.y+0.08,g.position.z);
  PH.anneau.visible=true;
}
function selObs(g){
  if(typeof SELECTION!=='undefined' && SELECTION) deselectionner();
  if(typeof VM!=='undefined' && VM.sel) deselectionnerVeh();
  if(typeof EQ!=='undefined' && EQ.sel) deselectionnerEquip();
  PH.sel=g; majAnneauObs(); majPanneauObs();
}
function deselObs(){ PH.sel=null; if(PH.anneau) PH.anneau.visible=false; majPanneauObs(); }
var _selZH=selectionner;
selectionner=function(o){ if(PH.sel) deselObs(); _selZH(o); };
var _selVehZH=selectionnerVeh;
selectionnerVeh=function(v){ if(PH.sel) deselObs(); _selVehZH(v); };
var _selEqZH=selectionnerEquip;
selectionnerEquip=function(t){ if(PH.sel) deselObs(); _selEqZH(t); };
function majPanneauObs(){
  var p=$e('e3-obs');
  if(!p){
    var s=document.createElement('style');
    s.textContent='#e3-obs{position:absolute;left:12px;top:74px;width:300px;z-index:7;background:rgba(14,20,31,.94);border:1px solid #3a4a63;border-radius:14px;padding:12px 13px 10px;box-shadow:0 10px 30px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:8px}'+
      '#e3-obs p{margin:0;font-size:12px;line-height:1.45;color:#cfd8e6}#e3-obs .l{display:flex;gap:6px;flex-wrap:wrap;align-items:center}#e3-obs .t{display:flex;align-items:center;justify-content:space-between;gap:8px}'+
      '@media (max-width:760px){#e3-obs{top:auto;bottom:66px;width:calc(100vw - 24px)}}';
    document.head.appendChild(s);
    p=document.createElement('div'); p.id='e3-obs'; p.hidden=true;
    $e('e3').appendChild(p);
    p.addEventListener('click',function(ev){
      var b=ev.target.closest ? ev.target.closest('button') : null;
      if(!b || !PH.sel) return;
      b.blur();
      var o=PH.sel.userData.o, a=b.dataset.a;
      if(a==='x') deselObs();
      else if(a==='rg' || a==='rd' || a==='r180'){ CARTE.pisteModifiee(o.n,undefined,undefined,o.az+(a==='rg'?-15:(a==='rd'?15:180))); majPiste3D(); }
      else if(a==='orig'){ CARTE.pisteRemise(o.n); majPiste3D(); dire('Obstacle '+o.n+' remis à son emplacement d’origine.'); }
    });
  }
  if(!PH.sel){ p.hidden=true; return; }
  var o=PH.sel.userData.o;
  p.innerHTML='<div class="t"><b>'+o.n+' · '+o.nom+'</b><button class="e3-x" data-a="x" title="Fermer (Échap)">✕</button></div>'+
    '<div class="e3-jp-lbl">Sens de passage <span>'+Math.round(o.az)+'° '+pointCardinal(o.az)+'</span></div>'+
    '<div class="l"><button data-a="rg" title="Tourner de 15° vers la gauche">⟲ 15°</button><button data-a="rd" title="Tourner de 15° vers la droite">15° ⟳</button><button data-a="r180">↻ Demi-tour</button></div>'+
    '<div class="l"><button data-a="orig">Remettre à l’emplacement d’origine</button></div>'+
    '<p>Tire l’obstacle dans la scène pour le déplacer : l’allée de graviers et la carte suivent.</p>';
  p.hidden=false;
}
function brancherPiste(){
  var vue=$e('e3-vue');
  if(!vue || vue.__piste) return;
  vue.__piste=true;
  vue.addEventListener('pointerdown',function(e){
    if(e.button!==0 || VUE==='jal' || (typeof EQ!=='undefined' && EQ.mode) || (typeof VM!=='undefined' && VM.mode)) return;
    if(typeof viser==='function' && viser(e)) return;
    var g=viserObs(e);
    if(!g) return;
    e.stopImmediatePropagation();
    PH.drag={g:g, id:e.pointerId, x0:e.clientX, y0:e.clientY, bouge:false, p:null, off:null};
    try{ vue.setPointerCapture(e.pointerId); }catch(er){}
  },true);
  vue.addEventListener('pointermove',function(e){
    var D=PH.drag;
    if(!D || D.id!==e.pointerId) return;
    e.stopImmediatePropagation();
    if(!D.bouge && Math.hypot(e.clientX-D.x0,e.clientY-D.y0)<5) return;
    var q=solSousPointeur(e);
    if(!q) return;
    if(!D.bouge){ D.bouge=true; D.off={x:D.g.position.x-q.x, z:D.g.position.z-q.z}; selObs(D.g); vue.style.cursor='grabbing'; }
    var x=q.x+D.off.x, z=q.z+D.off.z;
    D.p={x:x, z:z};
    D.g.position.set(x,hauteur(x,z),z);
    majAnneauObs();
  },true);
  function fin(e){
    var D=PH.drag;
    if(!D || D.id!==e.pointerId) return false;
    PH.drag=null; vue.style.cursor='';
    if(D.bouge && D.p && e.type==='pointerup'){
      var o=D.g.userData.o;
      CARTE.pisteModifiee(o.n,laDeZ(D.p.z),loDeX(D.p.x));
      majPiste3D();
      dire('Obstacle '+o.n+' ('+o.nom+') déplacé. La carte est déjà à jour.');
    } else if(!D.bouge) selObs(D.g);
    else majPiste3D();
    return true;
  }
  vue.addEventListener('pointerup',function(e){ if(fin(e)) e.stopImmediatePropagation(); },true);
  vue.addEventListener('pointercancel',function(e){ fin(e); },true);
  addEventListener('keydown',function(e){ if(e.key==='Escape' && PH.sel) deselObs(); });
}
var _brancherZH=brancherInterface;
brancherInterface=function(){ _brancherZH(); brancherPiste(); };
var _signalerZH=window.ESPACE3D.signaler;
window.ESPACE3D.signaler=function(t){
  if(t==='piste'){ if(construit) majPiste3D(); return; }
  _signalerZH(t);
};
/* =================================================================
   Vue 3D sur téléphone (mode consultation) : rien n'est modifiable.
   Joystick virtuel sous le pouce gauche (doucement : marcher, à fond :
   courir, au-delà : sprint), glisser ailleurs pour tourner la caméra,
   pincer pour zoomer, toucher un jalonneur pour sa fiche.
   Réglages allégés pour les téléphones.
================================================================= */
if(window.CONSULTATION){
  QUALITES[0].ombre=0; QUALITES[0].arbrePres=35; QUALITES[0].arbreMoy=70; QUALITES[0].voit=60;
  PERF.qualite=0; PERF.dist=Math.min(PERF.dist||220,220); PERF.auto=true;
  try{ TRAF.mode=0; }catch(e){}
}
function interfaceConsultation3D(){
  var e3=$e('e3'), vue=$e('e3-vue');
  if(!e3 || !vue || e3.classList.contains('consultation')) return;
  e3.classList.add('consultation');
  var c='#e3.consultation ';
  var s=document.createElement('style');
  s.textContent=[
    c+'#e3-save,'+c+'.e3-allure,'+c+'#e3-jp,'+c+'#e3-veh,'+c+'#e3-eq,'+c+'#e3-obs{display:none!important}',
    c+'.e3-ch:nth-child(2),'+c+'.e3-ch:nth-child(n+4){display:none}',
    c+'.e3-chiffres{flex-wrap:nowrap}',
    c+'.e3-barre{top:6px!important;right:6px!important;left:auto!important;bottom:auto!important;max-width:none!important}',
    c+'.e3-barre button{padding:8px 11px;font-size:13px}',
    c+'.e3-mini,'+c+'#e3-mini{width:112px;height:112px}',
    c+'#e3-toast{bottom:auto;top:54px;max-width:92vw}',
    '#e3-joy{position:absolute;width:124px;height:124px;margin:-62px 0 0 -62px;border-radius:50%;border:2px solid rgba(255,255,255,.4);background:rgba(10,16,26,.28);z-index:9;pointer-events:none;display:none}',
    '#e3-joy i{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(242,179,61,.8);box-shadow:0 2px 10px rgba(0,0,0,.45)}',
    '#e3-joy-aide{position:absolute;left:22px;bottom:22px;width:112px;height:112px;border-radius:50%;border:2px dashed rgba(255,255,255,.35);z-index:4;pointer-events:none;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.75);font-size:11px;line-height:1.3;text-align:center;padding:10px;text-shadow:0 1px 3px #000}',
    '#e3-tact-btn{position:absolute;right:10px;bottom:132px;z-index:8;display:flex;flex-direction:column;gap:9px}',
    '#e3 #e3-tact-btn button{width:54px;height:54px;border-radius:50%;padding:0;font-size:21px;line-height:1}',
    /* écran étroit (téléphone tenu droit) : barre en icônes, compteurs sous la barre */
    '@media (max-width:600px){'+
      c+'.e3-marque{display:none}'+
      c+'.e3-hud{top:52px;left:8px}'+
      c+'.e3-chiffres{margin-top:0}'+
      c+'.e3-barre{gap:4px;right:6px!important;left:6px!important;justify-content:flex-end!important}'+
      c+'.e3-barre button{padding:8px 9px;font-size:14px}'+
      c+'.e3-menu>.e3-menu-b::after{content:""}'+
    '}',
    /* téléphone à l'horizontale : tout se range sur les bords */
    '@media (orientation:landscape) and (max-height:520px){'+
      c+'.e3-marque,'+c+'.e3-sous{display:none}'+
      c+'.e3-hud{top:8px;left:8px}'+
      c+'.e3-barre button{padding:6px 9px;font-size:13px}'+
      c+'.e3-mini,'+c+'#e3-mini{width:96px;height:96px}'+
      '#e3-tact-btn{bottom:12px;right:120px;flex-direction:row}'+
      '#e3 #e3-tact-btn button{width:48px;height:48px;font-size:19px}'+
      '#e3-joy-aide{left:16px;bottom:14px;width:96px;height:96px}'+
    '}',
    '#e3-tourner{position:absolute;inset:0;z-index:30;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(8,12,20,.88);color:#fff;text-align:center;padding:24px;font-size:16px}',
    '#e3-tourner b{font-size:54px;line-height:1}',
    '@media (orientation:portrait){'+c+'#e3-tourner:not(.vu){display:flex}}'
  ].join('\n');
  /* libellés courts sur écran étroit */
  function libelles(){
    var etroit=window.innerWidth<=600;
    [['e3-carte','◧ Carte','◧'],[null,'🎥 Vue','🎥'],[null,'👁 Afficher','☰']].forEach(function(l,i){
      var b=l[0] ? $e(l[0]) : null;
      if(!b){ document.querySelectorAll('#e3 .e3-menu-b').forEach(function(m){ if(m.textContent.indexOf(l[1].slice(-4))>=0 || m.dataset.lib===l[1]) b=m; }); }
      if(!b) return;
      if(!b.dataset.lib) b.dataset.lib=l[1];
      b.textContent=etroit ? l[2] : b.dataset.lib;
    });
  }
  libelles();
  addEventListener('resize',libelles);
  document.head.appendChild(s);
  document.querySelectorAll('#e3 .e3-menu').forEach(function(m){
    var b=m.querySelector('.e3-menu-b');
    if(b && /Poser/.test(b.textContent)) m.style.display='none';
  });

  var joy=document.createElement('div'); joy.id='e3-joy'; joy.innerHTML='<i></i>'; e3.appendChild(joy);
  var aide=document.createElement('div'); aide.id='e3-joy-aide'; aide.textContent='Pose ton pouce ici pour avancer'; e3.appendChild(aide);
  var box=document.createElement('div'); box.id='e3-tact-btn';
  [['👁','Vue à la première ou à la troisième personne',function(){ basculerVue(); }],
   ['▶','Visite guidée du parcours',function(){ basculerAuto(); }],
   ['⏮','Revenir au départ',function(){ if(VUE==='jal') sortirVueJal(); placerJoueur(0); dire('Retour au départ'); }],
   ['⛶','Plein écran',function(){ if(window.pleinEcranPaysage) window.pleinEcranPaysage(false); }]
  ].forEach(function(d){
    var b=document.createElement('button'); b.type='button'; b.textContent=d[0]; b.title=d[1];
    b.onclick=function(){ d[2](); b.blur(); };
    box.appendChild(b);
  });
  e3.appendChild(box);

  /* allure : toucher la vitesse en haut à gauche ouvre le réglage, Valider le referme
     (même réglage que le curseur Allure de l'ordinateur) */
  var curseur=$e('e3-vitesse'), chVit=$e('e3-vit') ? $e('e3-vit').closest('.e3-ch') : null;
  var PRESETS=[['🚶 Marche',6],['🏃 Footing',10],['🏃 Course',13],['⚡ Rapide',18],['🚲 Vélo',25],['🚗 Voiture',50]];
  var menuV=document.createElement('div'); menuV.id='e3-vit-menu'; menuV.hidden=true;
  menuV.innerHTML='<div class="vm-tete"><b>Choisir l’allure</b><button type="button" class="vm-x" aria-label="Fermer">✕</button></div>'+
    '<div class="vm-val"><button type="button" class="vm-m" aria-label="Moins vite">−</button><span><b>13</b>km/h</span><button type="button" class="vm-p" aria-label="Plus vite">+</button></div>'+
    '<input type="range" min="4" max="150" step="1" aria-label="Allure en km/h">'+
    '<div class="vm-pre"></div>'+
    '<button type="button" class="vm-ok">Valider</button>';
  var vmVal=menuV.querySelector('.vm-val b'), vmR=menuV.querySelector('input'), vmPre=menuV.querySelector('.vm-pre'), choix=13;
  function montrerChoix(){
    vmVal.textContent=choix; vmR.value=choix;
    [].forEach.call(vmPre.children,function(b){ b.classList.toggle('on', +b.dataset.v===choix); });
  }
  PRESETS.forEach(function(p){
    var b=document.createElement('button'); b.type='button'; b.dataset.v=p[1]; b.textContent=p[0]+' · '+p[1];
    b.onclick=function(){ choix=p[1]; montrerChoix(); };
    vmPre.appendChild(b);
  });
  vmR.addEventListener('input',function(){ choix=+vmR.value; montrerChoix(); });
  menuV.querySelector('.vm-m').onclick=function(){ choix=Math.max(4,choix-1); montrerChoix(); };
  menuV.querySelector('.vm-p').onclick=function(){ choix=Math.min(150,choix+1); montrerChoix(); };
  function ouvrirVit(){ choix=+curseur.value; montrerChoix(); menuV.hidden=false; if(chVit) chVit.classList.add('ouvert'); }
  function fermerVit(){ menuV.hidden=true; if(chVit) chVit.classList.remove('ouvert'); }
  menuV.querySelector('.vm-x').onclick=fermerVit;
  menuV.querySelector('.vm-ok').onclick=function(){
    curseur.value=choix; curseur.dispatchEvent(new Event('input',{bubbles:true}));
    fermerVit(); dire('Allure : '+choix+' km/h');
  };
  if(chVit){
    chVit.classList.add('e3-ch-vit'); chVit.title='Choisir l’allure';
    chVit.addEventListener('click',function(){ if(menuV.hidden) ouvrirVit(); else fermerVit(); });
  }
  e3.appendChild(menuV);
  var sv=document.createElement('style'), cm='#e3 #e3-vit-menu ';
  sv.textContent=[
    '#e3.consultation .e3-ch-vit{pointer-events:auto;cursor:pointer}',
    '#e3.consultation .e3-ch-vit::after{content:"▾";margin-left:5px;font-size:11px;opacity:.85}',
    '#e3.consultation .e3-ch-vit.ouvert{outline:2px solid #F2B33D;outline-offset:1px}',
    '#e3-vit-menu{position:absolute;left:8px;top:46px;z-index:25;width:min(300px,calc(100vw - 16px));box-sizing:border-box;background:rgba(12,18,28,.95);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:10px 12px;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.5)}',
    '#e3-vit-menu .vm-tete{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:14px}',
    cm+'.vm-x{width:32px;height:32px;padding:0;border-radius:50%}',
    '#e3-vit-menu .vm-val{display:flex;align-items:center;justify-content:space-between;gap:8px}',
    cm+'.vm-m,'+cm+'.vm-p{width:44px;height:44px;padding:0;border-radius:50%;font-size:22px;line-height:1}',
    '#e3-vit-menu .vm-val span{font-size:14px;opacity:.9}',
    '#e3-vit-menu .vm-val b{font-size:30px;margin-right:4px;opacity:1}',
    '#e3-vit-menu input{width:100%;margin:8px 0;accent-color:#F2B33D}',
    '#e3-vit-menu .vm-pre{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:8px}',
    cm+'.vm-pre button{padding:7px 2px;font-size:12px;white-space:nowrap}',
    cm+'.vm-pre button.on{border-color:#F2B33D;color:#F2B33D}',
    cm+'.vm-ok{width:100%;padding:10px;font-size:15px;font-weight:700;background:#F2B33D;border-color:#F2B33D;color:#14181f}',
    '@media (max-width:600px){#e3-vit-menu{top:88px}}',
    '@media (orientation:landscape) and (max-height:520px){#e3-vit-menu{top:44px;padding:8px 10px}#e3-vit-menu .vm-val b{font-size:24px}'+cm+'.vm-m,'+cm+'.vm-p{width:38px;height:38px}#e3-vit-menu input{margin:4px 0}'+cm+'.vm-pre button{padding:5px 2px}'+cm+'.vm-ok{padding:8px}}'
  ].join('\n');
  document.head.appendChild(sv);

  var T={joy:null, look:{}, pinch:null, apresPince:false};
  /* les compteurs laissent passer les doigts : on peut pincer ou tourner par-dessus */
  var hud=e3.querySelector('.e3-hud'); if(hud) hud.style.pointerEvents='none';
  aide.textContent='Déplacement';
  function dansVue(ev){ return ev.target===vue || vue.contains(ev.target); }
  function joyStop(fin){
    touches.__av=touches.__ar=touches.__ga=touches.__dr=false;
    touches.control=false; touches.shift=false;
    if(fin){ T.joy=null; joy.style.display='none'; aide.style.opacity=''; }
  }
  /* le joystick ne naît que dans le coin en bas à gauche ; partout ailleurs : caméra et pincement */
  function dansCoin(x,y,r){ return x<Math.max(150,r.width*0.3) && y>r.height-Math.max(160,r.height*0.4); }
  function doigts(){ return Object.keys(T.look); }
  function debutPince(){
    var ids=doigts(); if(ids.length<2) return;
    var a=T.look[ids[0]], b=T.look[ids[1]];
    T.pinch={a:ids[0], b:ids[1], d0:Math.max(20,Math.hypot(a.x-b.x,a.y-b.y)), dist0:CAM.dist, bascule:false};
    T.apresPince=true;
  }
  e3.addEventListener('pointerdown',function(ev){
    if(!dansVue(ev)) return;
    ev.stopPropagation(); ev.preventDefault();
    var r=vue.getBoundingClientRect(), x=ev.clientX-r.left, y=ev.clientY-r.top;
    try{ vue.setPointerCapture(ev.pointerId); }catch(er){}
    if(!T.joy && dansCoin(x,y,r)){
      var bx=Math.max(62,Math.min(r.width-62,x)), by=Math.max(62,Math.min(r.height-62,y));
      T.joy={id:ev.pointerId, cx:r.left+bx, cy:r.top+by};
      joy.style.left=bx+'px'; joy.style.top=by+'px'; joy.style.display='block';
      joy.firstChild.style.transform='';
      aide.style.opacity='0';
      return;
    }
    T.look[ev.pointerId]={x:ev.clientX, y:ev.clientY, x0:ev.clientX, y0:ev.clientY, t:performance.now()};
    if(doigts().length>=2 && !T.pinch) debutPince();
  },true);
  e3.addEventListener('pointermove',function(ev){
    if(T.joy && ev.pointerId===T.joy.id){
      ev.stopPropagation(); ev.preventDefault();
      var R=56, dx=ev.clientX-T.joy.cx, dy=ev.clientY-T.joy.cy, L=Math.hypot(dx,dy), k=L>R?R/L:1;
      joy.firstChild.style.transform='translate('+(dx*k).toFixed(1)+'px,'+(dy*k).toFixed(1)+'px)';
      if(L<R*0.18){ joyStop(false); return; }
      var ux=dx/L, uy=dy/L;
      touches.__av=uy<-0.38; touches.__ar=uy>0.38; touches.__ga=ux<-0.38; touches.__dr=ux>0.38;
      touches.control=L<R*0.55; touches.shift=L>R*1.4;
      return;
    }
    var l=T.look[ev.pointerId];
    if(!l) return;
    ev.stopPropagation(); ev.preventDefault();
    var dx2=ev.clientX-l.x, dy2=ev.clientY-l.y;
    l.x=ev.clientX; l.y=ev.clientY;
    if(T.pinch){
      var a=T.look[T.pinch.a], b=T.look[T.pinch.b];
      if(!a || !b) return;
      var d=Math.max(20,Math.hypot(a.x-b.x,a.y-b.y)), k=T.pinch.d0/d;   /* k>1 : doigts rapprochés, on s'éloigne */
      if(VUE==='tp') CAM.dist=Math.max(2.5,Math.min(60,T.pinch.dist0*k));
      else if(VUE==='fp' && k>1.35 && !T.pinch.bascule){
        T.pinch.bascule=true; basculerVue();
        T.pinch.dist0=CAM.dist; T.pinch.d0=d;
      }
      return;
    }
    if(T.apresPince) return;   /* après un pincement, la caméra ne tourne plus tant qu'un doigt reste posé */
    if(VUE==='tp'){ CAM.yaw+=dx2*0.0058; CAM.pitch=Math.max(-0.30,Math.min(1.35,CAM.pitch+dy2*0.0042)); CAM.libre=2.2; }
    else if(VUE==='fp'){ CAM.yaw+=dx2*0.005; CAM.fpPitch=Math.max(-1.3,Math.min(1.3,CAM.fpPitch-dy2*0.0045)); }
    else { CAM.jalYaw+=dx2*0.005; CAM.jalPitch=Math.max(-1.3,Math.min(1.3,CAM.jalPitch-dy2*0.0045)); }
  },true);
  function haut(ev){
    if(T.joy && ev.pointerId===T.joy.id){ ev.stopPropagation(); joyStop(true); return; }
    var l=T.look[ev.pointerId];
    if(!l) return;
    ev.stopPropagation();
    delete T.look[ev.pointerId];
    if(T.pinch && (String(ev.pointerId)===T.pinch.a || String(ev.pointerId)===T.pinch.b)) T.pinch=null;
    var etaitPince=T.apresPince;
    if(!doigts().length) T.apresPince=false;
    if(!etaitPince && ev.type==='pointerup' && performance.now()-l.t<300 && Math.hypot(ev.clientX-l.x0,ev.clientY-l.y0)<12){
      var o=(typeof viser==='function') ? viser(ev) : null;
      if(o) dire('Jalonneur n° '+o.n+' · km '+(o.d/1000).toFixed(2).replace('.',',')+' · '+(o.j.niv==='r'?'indispensable':'facultatif')+
        ({x:' · bras croisés', n:' · bras le long du corps', g:' · bras gauche tendu', d:' · bras droit tendu'}[o.bras]||''));
    }
  }
  e3.addEventListener('pointerup',haut,true);
  e3.addEventListener('pointercancel',haut,true);
  ['dblclick','contextmenu','wheel'].forEach(function(t){
    e3.addEventListener(t,function(ev){ if(dansVue(ev)){ ev.stopPropagation(); if(t!=='wheel') ev.preventDefault(); } },true);
  });
  /* téléphone tenu droit : invitation à le tourner (une fois écartée, elle ne revient plus) */
  var tourner=document.createElement('div'); tourner.id='e3-tourner';
  tourner.innerHTML='<b>📱↻</b><div>Tourne ton téléphone à l’horizontale<br>pour jouer en plein écran.</div>';
  var bt=document.createElement('button'); bt.type='button'; bt.textContent='⛶ Plein écran';
  bt.onclick=function(){ if(window.pleinEcranPaysage) window.pleinEcranPaysage(true); };
  var bc=document.createElement('button'); bc.type='button'; bc.textContent='Continuer quand même';
  bc.onclick=function(){ tourner.classList.add('vu'); };
  tourner.appendChild(bt); tourner.appendChild(bc);
  e3.appendChild(tourner);
}
var _brancherZI=brancherInterface;
brancherInterface=function(){ _brancherZI(); if(window.CONSULTATION) interfaceConsultation3D(); };
/* =================================================================
   Zone d'arrivée : arche avec tapis de chronométrage et horloge,
   tentes (chronométrage, poste de secours, ravitaillement), scène et
   sono, tables de ravitaillement, mâts d'éclairage, ambulance.
   Modèles construits ici (aucun téléchargement), posés, déplacés et
   enregistrés exactement comme les véhicules.
   Repère des modèles : x = longueur, +z = face avant, y = haut.
================================================================= */
var ZA={mats:{}, tex:{}};
function zaMat(cle,prop){
  if(!ZA.mats[cle]) ZA.mats[cle]=new THREE.MeshStandardMaterial(prop);
  return ZA.mats[cle];
}
function zaTexture(cle,W,H,dessin){
  if(ZA.tex[cle]) return ZA.tex[cle];
  var c=document.createElement('canvas'); c.width=W; c.height=H;
  dessin(c.getContext('2d'),W,H);
  var t=new THREE.CanvasTexture(c);
  if(THREE.SRGBColorSpace) t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=4;
  ZA.tex[cle]=t;
  return t;
}
/* bandeau de texte : fond, lignes centrées, taille réduite si trop large */
function zaBandeau(cle,lignes,o){
  o=o||{};
  return zaTexture(cle,o.w||512,o.h||128,function(g,W,H){
    g.fillStyle=o.fond||'#14213d'; g.fillRect(0,0,W,H);
    if(o.avant) o.avant(g,W,H);
    g.fillStyle=o.coul||'#ffffff'; g.textAlign='center'; g.textBaseline='middle';
    var n=lignes.length;
    lignes.forEach(function(t,i){
      var taille=(o.tailles && o.tailles[i]) || Math.round(H/n*0.72);
      g.font='800 '+taille+'px Arial, Helvetica, sans-serif';
      while(g.measureText(t).width>W*0.9 && taille>8){ taille-=2; g.font='800 '+taille+'px Arial, Helvetica, sans-serif'; }
      g.fillText(t,W/2,H*(i+0.5)/n+taille*0.04);
    });
  });
}
function zaBoite(gr,w,h,d,mat,x,y,z){
  var m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; gr.add(m); return m;
}
function zaCyl(gr,r1,r2,h,mat,x,y,z,seg){
  var m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,seg||10),mat);
  m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; gr.add(m); return m;
}
function zaPlan(gr,w,h,mat,x,y,z,ry){
  var m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);
  m.position.set(x,y,z); m.rotation.y=ry||0; m.receiveShadow=true; gr.add(m); return m;
}
function zaMatTexte(cle,tex,lumineux){
  if(ZA.mats[cle]) return ZA.mats[cle];
  var p={map:tex, roughness:0.75, metalness:0};
  if(lumineux){ p.emissive=new THREE.Color(0xffffff); p.emissiveMap=tex; p.emissiveIntensity=lumineux; }
  return (ZA.mats[cle]=new THREE.MeshStandardMaterial(p));
}
var ZAC={
  alu:function(){ return zaMat('alu',{color:0xb9bec4, metalness:0.6, roughness:0.35}); },
  noir:function(){ return zaMat('noir',{color:0x1d2026, roughness:0.7}); },
  blanc:function(){ return zaMat('blanc',{color:0xf1f1ec, roughness:0.85, side:THREE.DoubleSide}); },
  nappe:function(){ return zaMat('nappe',{color:0xf7f5ef, roughness:0.9}); },
  or:function(){ return zaMat('or',{color:0xf2b33d, roughness:0.55, metalness:0.1}); },
  marine:function(){ return zaMat('marine',{color:0x1b2d52, roughness:0.8, side:THREE.DoubleSide}); },
  orange:function(){ return zaMat('orange',{color:0xe8772e, roughness:0.8, side:THREE.DoubleSide}); },
  rouge:function(){ return zaMat('rouge',{color:0xc62828, roughness:0.6}); },
  gomme:function(){ return zaMat('gomme',{color:0x25272b, roughness:0.95}); },
  plateau:function(){ return zaMat('plateau',{color:0x2e3238, roughness:0.8}); },
  led:function(){ return zaMat('led',{color:0xfffbea, emissive:0xfff2cc, emissiveIntensity:2.2, roughness:0.4}); },
  vitre:function(){ return zaMat('vitre',{color:0x1b2530, roughness:0.15, metalness:0.5}); },
  ecran:function(){ return zaMat('ecranbleu',{color:0x0d1a2e, emissive:0x3a7bd5, emissiveIntensity:0.9, roughness:0.3}); },
  bleuGyro:function(){ return zaMat('gyro',{color:0x1e4fff, emissive:0x2a5cff, emissiveIntensity:2.5, roughness:0.3}); },
  eau:function(){ return zaMat('eau',{color:0x8fc7ff, roughness:0.15, metalness:0.05, transparent:true, opacity:0.75}); },
  gobelet:function(){ return zaMat('gobelet',{color:0xf4f4f4, roughness:0.5}); },
  caisse:function(){ return zaMat('caisse',{color:0x2f6d3a, roughness:0.8}); },
  chaise:function(){ return zaMat('chaise',{color:0x39414c, roughness:0.7}); }
};

/* ---------- toit de barnum en croupe (à quatre pentes) ---------- */
function zaToit(L,W,y0,y1,mat){
  var r=Math.max(0,(L-W)/2), c1=[-L/2,y0,-W/2], c2=[L/2,y0,-W/2], c3=[L/2,y0,W/2], c4=[-L/2,y0,W/2], r1=[-r,y1,0], r2=[r,y1,0];
  var tris=[c1,c2,r2, c1,r2,r1, c3,c4,r1, c3,r1,r2, c2,c3,r2, c4,c1,r1], pos=[];
  tris.forEach(function(p){ pos.push(p[0],p[1],p[2]); });
  var geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.computeVertexNormals();
  var m=new THREE.Mesh(geo,mat); m.castShadow=true; m.receiveShadow=true;
  return m;
}
/* barnum pliant : pieds, lambrequin avec inscription, toit, murs */
function zaTente(L,W,matToile,texLambrequin,murs){
  var g=new THREE.Group(), h=2.1, alu=ZAC.alu();
  var xs=L>4 ? [-L/2,0,L/2] : [-L/2,L/2];
  xs.forEach(function(x){ [-W/2,W/2].forEach(function(z){ zaCyl(g,0.028,0.028,h+0.25,alu,x,(h+0.25)/2,z,8); }); });
  zaBoite(g,L,0.04,0.04,alu,0,h+0.2,W/2); zaBoite(g,L,0.04,0.04,alu,0,h+0.2,-W/2);
  zaBoite(g,0.04,0.04,W,alu,L/2,h+0.2,0); zaBoite(g,0.04,0.04,W,alu,-L/2,h+0.2,0);
  var t=zaToit(L+0.1,W+0.1,h+0.28,h+0.28+Math.min(W,L)*0.26,matToile);
  g.add(t);
  /* lambrequins : avant et arrière avec l'inscription, côtés unis */
  var ml=zaMatTexte('lamb:'+texLambrequin.uuid,texLambrequin);
  zaPlan(g,L,0.3,ml,0,h+0.13,W/2+0.03,0);
  zaPlan(g,L,0.3,ml,0,h+0.13,-W/2-0.03,Math.PI);
  zaPlan(g,W,0.3,matToile,L/2+0.03,h+0.13,0,Math.PI/2);
  zaPlan(g,W,0.3,matToile,-L/2-0.03,h+0.13,0,-Math.PI/2);
  /* murs : 1 = fond, 3 = fond et côtés */
  if(murs>=1) zaPlan(g,L,h,matToile,0,h/2,-W/2+0.01,0);
  if(murs>=3){ zaPlan(g,W,h,matToile,L/2-0.01,h/2,0,-Math.PI/2); zaPlan(g,W,h,matToile,-L/2+0.01,h/2,0,Math.PI/2); }
  /* lests aux pieds */
  xs.forEach(function(x){ [-W/2,W/2].forEach(function(z){ zaBoite(g,0.28,0.12,0.28,ZAC.noir(),x,0.06,z); }); });
  return g;
}
function zaTable(g,L,x,z,ry,nappe){
  var t=new THREE.Group();
  zaBoite(t,L,0.04,0.76,nappe ? ZAC.nappe() : ZAC.plateau(),0,0.74,0);
  if(nappe) zaBoite(t,L,0.5,0.01,ZAC.nappe(),0,0.47,0.38);
  [[-L/2+0.1,-0.3],[L/2-0.1,-0.3],[-L/2+0.1,0.3],[L/2-0.1,0.3]].forEach(function(p){ zaCyl(t,0.02,0.02,0.72,ZAC.alu(),p[0],0.36,p[1],6); });
  t.position.set(x,0,z); t.rotation.y=ry||0; g.add(t);
  return t;
}
function zaChaise(g,x,z,ry){
  var c=new THREE.Group(), m=ZAC.chaise();
  zaBoite(c,0.44,0.04,0.42,m,0,0.45,0); zaBoite(c,0.44,0.42,0.04,m,0,0.68,-0.2);
  [[-0.19,-0.18],[0.19,-0.18],[-0.19,0.18],[0.19,0.18]].forEach(function(p){ zaCyl(c,0.015,0.015,0.45,ZAC.alu(),p[0],0.22,p[1],5); });
  c.position.set(x,0,z); c.rotation.y=ry||0; g.add(c);
}
/* gobelets et bouteilles alignés sur une table (repère de la table) */
function zaRavitoSur(t,L){
  for(var i=0;i<Math.floor((L-0.2)/0.16);i++){
    for(var j=0;j<2;j++) zaCyl(t,0.036,0.028,0.1,ZAC.gobelet(),-L/2+0.18+i*0.16,0.81,0.18+j*0.12,8);
  }
  for(var k=0;k<Math.floor((L-0.3)/0.3);k++){
    var b=zaCyl(t,0.045,0.045,0.26,ZAC.eau(),-L/2+0.25+k*0.3,0.89,-0.18,8);
    b.castShadow=false;
    zaCyl(t,0.02,0.02,0.04,ZAC.bleuGyro(),-L/2+0.25+k*0.3,1.04,-0.18,6).material=zaMat('bouchon',{color:0x1f5fbf, roughness:0.5});
  }
}

/* ---------- textures ---------- */
function zaTexHorloge(){
  return zaTexture('horloge',512,160,function(g,W,H){
    g.fillStyle='#050608'; g.fillRect(0,0,W,H);
    g.fillStyle='#ff3b2f'; g.textAlign='center'; g.textBaseline='middle';
    g.font='700 118px "Courier New", monospace'; g.fillText('00:38:52',W/2,H/2+6);
  });
}
function zaTexTapis(){
  return zaTexture('tapis',512,64,function(g,W,H){
    g.fillStyle='#232528'; g.fillRect(0,0,W,H);
    g.fillStyle='#f2b33d'; g.fillRect(0,0,W,5); g.fillRect(0,H-5,W,5);
    g.fillStyle='#3a3d42'; for(var x=12;x<W;x+=24) g.fillRect(x,14,12,H-28);
  });
}
function zaTexCroix(fond){
  return zaTexture('croix:'+fond,256,256,function(g,W,H){
    g.fillStyle=fond; g.fillRect(0,0,W,H);
    g.fillStyle='#d32f2f'; g.fillRect(W*0.38,H*0.14,W*0.24,H*0.72); g.fillRect(W*0.14,H*0.38,W*0.72,H*0.24);
  });
}
function zaTexResultats(){
  return zaTexture('resultats',512,300,function(g,W,H){
    g.fillStyle='#0b1628'; g.fillRect(0,0,W,H);
    g.fillStyle='#f2b33d'; g.fillRect(0,0,W,46);
    g.fillStyle='#0b1628'; g.font='800 30px Arial'; g.textAlign='left'; g.fillText('CORRIDA 2027 · RÉSULTATS',16,33);
    g.font='600 24px Arial'; g.fillStyle='#e8eef8';
    ['1  00:31:48  ENSOA','2  00:32:05  ENSOA','3  00:32:40  ENSOA','4  00:33:12','5  00:33:30','6  00:33:58'].forEach(function(t,i){ g.fillText(t,20,84+i*36); });
  });
}
function zaTexAmbulance(){
  return zaTexture('ambulance',512,200,function(g,W,H){
    g.fillStyle='#fbfbf8'; g.fillRect(0,0,W,H);
    for(var x=0;x<W;x+=40){ g.fillStyle=(x/40)%2 ? '#1f5fbf' : '#ffd21f'; g.fillRect(x,H*0.52,40,H*0.2); }
    g.fillStyle='#c62828'; g.fillRect(0,H*0.46,W,H*0.05);
    g.fillStyle='#1f5fbf'; g.font='800 46px Arial'; g.textAlign='center'; g.fillText('AMBULANCE',W*0.5,H*0.34);
    g.save(); g.translate(W*0.86,H*0.24); g.fillStyle='#1f5fbf';
    for(var k=0;k<3;k++){ g.rotate(Math.PI/3); g.fillRect(-7,-26,14,52); }
    g.restore();
  });
}

/* ---------- modèles ---------- */
function construireArche(){
  var g=new THREE.Group(), l=8.0, h=4.7, r=0.45;
  var mMar=zaMat('arche-marine',{color:0x16264a, roughness:0.6});
  var tArr=zaBandeau('arche-arrivee',['ARRIVÉE'],{w:1024,h:128,fond:'#16264a',coul:'#f2b33d',
    avant:function(c,W,H){ c.fillStyle='#f2b33d'; c.fillRect(0,0,W,6); c.fillRect(0,H-6,W,6); }});
  var tCol=zaBandeau('arche-colonne',['CORRIDA','2027','ENSOA'],{w:128,h:512,fond:'#16264a',coul:'#ffffff',tailles:[34,54,34]});
  [-l/2,l/2].forEach(function(x){
    zaCyl(g,r,r*1.08,h,mMar,x,h/2,0,20);
    zaCyl(g,r*1.25,r*1.25,0.18,ZAC.noir(),x,0.09,0,16);
    var mc=zaMatTexte('arche-col-mat',tCol);
    zaPlan(g,0.62,2.5,mc,x,2.3,r+0.02,0); zaPlan(g,0.62,2.5,mc,x,2.3,-r-0.02,Math.PI);
  });
  zaBoite(g,l+2*r,0.95,0.95,mMar,0,h+0.47,0);
  var ma=zaMatTexte('arche-arr-mat',tArr);
  zaPlan(g,l,0.8,ma,0,h+0.47,0.49,0); zaPlan(g,l,0.8,ma,0,h+0.47,-0.49,Math.PI);
  /* horloge de course au sommet, lisible des deux côtés */
  zaBoite(g,2.3,0.78,0.36,ZAC.noir(),0,h+1.35,0);
  var mh=zaMatTexte('horloge-mat',zaTexHorloge(),1.6);
  zaPlan(g,2.1,0.62,mh,0,h+1.35,0.19,0); zaPlan(g,2.1,0.62,mh,0,h+1.35,-0.19,Math.PI);
  /* tapis de chronométrage (ligne de départ-arrivée et tapis de sécurité) et boîtiers d'antenne */
  var mt=zaMatTexte('tapis-mat',zaTexTapis());
  [-0.55,0.55].forEach(function(z){
    var tp=zaPlan(g,l-0.4,0.9,mt,0,0.025,z,0); tp.rotation.x=-Math.PI/2;
    zaBoite(g,0.35,0.25,0.9,ZAC.gomme(),-l/2+0.35,0.12,z); zaBoite(g,0.35,0.25,0.9,ZAC.gomme(),l/2-0.35,0.12,z);
  });
  /* ligne blanche peinte */
  var ligne=zaPlan(g,l-0.4,0.12,zaMat('ligne',{color:0xffffff, roughness:0.6}),0,0.03,0,0); ligne.rotation.x=-Math.PI/2;
  return g;
}
function construireTenteChrono(){
  var tex=zaBandeau('lamb-chrono',['CHRONOMÉTRAGE'],{w:512,h:64,fond:'#1b2d52',coul:'#f2b33d'});
  var g=zaTente(3,3,ZAC.marine(),tex,1);
  zaTable(g,1.8,0,0.35,0,false);
  zaChaise(g,-0.5,-0.3,0); zaChaise(g,0.5,-0.3,0);
  [-0.45,0.45].forEach(function(x){
    zaBoite(g,0.34,0.02,0.24,ZAC.noir(),x,0.77,0.35);
    var e=zaBoite(g,0.34,0.22,0.015,ZAC.ecran(),x,0.9,0.24); e.rotation.x=-0.25;
  });
  zaBoite(g,0.3,0.18,0.25,ZAC.noir(),0,0.85,0.55);
  /* écran des résultats tourné vers la ligne */
  zaCyl(g,0.03,0.03,1.6,ZAC.alu(),1.2,0.8,1.2,8);
  zaBoite(g,1.1,0.66,0.06,ZAC.noir(),1.2,1.85,1.2);
  zaPlan(g,1.0,0.58,zaMatTexte('resultats-mat',zaTexResultats(),0.9),1.2,1.85,1.235,0);
  return g;
}
function construireTenteMedicale(){
  var tex=zaBandeau('lamb-secours',['POSTE DE SECOURS'],{w:1024,h:64,fond:'#ffffff',coul:'#c62828'});
  var g=zaTente(6,3,ZAC.blanc(),tex,3);
  var croix=zaMatTexte('croix-mat',zaTexCroix('#ffffff'));
  zaPlan(g,1.1,1.1,croix,0,1.3,-1.5-0.02,Math.PI);
  zaPlan(g,1.1,1.1,croix,3.02,1.3,0,Math.PI/2); zaPlan(g,1.1,1.1,croix,-3.02,1.3,0,-Math.PI/2);
  /* lits de camp et brancard */
  [-1.8,0,1.8].forEach(function(x,i){
    var lit=new THREE.Group();
    zaBoite(lit,0.7,0.06,1.9,zaMat('toile-lit',{color:0x3f6e4f, roughness:0.85}),0,0.42,0);
    [[-0.3,-0.85],[0.3,-0.85],[-0.3,0.85],[0.3,0.85]].forEach(function(p){ zaCyl(lit,0.02,0.02,0.4,ZAC.alu(),p[0],0.2,p[1],5); });
    if(i<2) zaBoite(lit,0.55,0.12,0.35,ZAC.blanc(),0,0.51,-0.7);
    lit.position.set(x,0,-0.3); g.add(lit);
  });
  zaTable(g,1.2,2.2,1.05,0,true);
  zaBoite(g,0.45,0.3,0.3,ZAC.rouge(),2.0,0.93,1.05);
  zaBoite(g,0.3,0.35,0.2,zaMat('oxy',{color:0x2f8f4a, roughness:0.5}),2.5,0.94,1.05);
  /* fanion croix rouge */
  zaCyl(g,0.025,0.025,3.4,ZAC.alu(),3.35,1.7,1.6,6);
  zaPlan(g,0.8,0.8,zaMatTexte('croix-fanion',zaTexCroix('#ffffff')),3.75,3.0,1.6,0).material.side=THREE.DoubleSide;
  return g;
}
function construireTenteRavito(){
  var tex=zaBandeau('lamb-ravito',['RAVITAILLEMENT'],{w:1024,h:64,fond:'#e8772e',coul:'#14213d'});
  var g=zaTente(6,3,ZAC.orange(),tex,1);
  [-1.6,1.6].forEach(function(x){ var t=zaTable(g,2.8,x,0.9,0,true); zaRavitoSur(t,2.8); });
  /* caisses et packs d'eau à l'arrière */
  for(var i=0;i<4;i++){ zaBoite(g,0.55,0.32,0.38,ZAC.caisse(),-2.2+i*1.4,0.16,-1.0); zaBoite(g,0.55,0.32,0.38,ZAC.caisse(),-2.2+i*1.4,0.48,-1.0); }
  for(var k=0;k<3;k++){ var pk=zaBoite(g,0.36,0.3,0.26,ZAC.eau(),-0.5+k*0.45,0.15,-0.4); pk.castShadow=false; }
  return g;
}
function construireSono(){
  var g=new THREE.Group(), L=4, W=3, hp=0.6;
  zaBoite(g,L,hp,W,ZAC.plateau(),0,hp/2,0);
  var jupe=zaBandeau('sono-jupe',['CORRIDA 2027 · ENSOA'],{w:1024,h:128,fond:'#16264a',coul:'#f2b33d'});
  zaPlan(g,L,hp-0.04,zaMatTexte('sono-jupe-mat',jupe),0,hp/2,W/2+0.01,0);
  /* marches à l'arrière */
  for(var s=0;s<3;s++) zaBoite(g,1.0,0.2*(s+1),0.3,ZAC.plateau(),-1.2,0.1*(s+1),-W/2-0.15-(2-s)*0.3);
  /* tours de sonorisation avec enceintes suspendues */
  [-L/2+0.25,L/2-0.25].forEach(function(x,i){
    zaBoite(g,0.3,3.6,0.3,ZAC.alu(),x,hp+1.8,-0.9);
    for(var k=0;k<4;k++){
      var e=zaBoite(g,0.62,0.34,0.5,ZAC.noir(),x,hp+3.2-k*0.36,-0.55);
      e.rotation.x=0.05*k; e.rotation.y=(i ? -1 : 1)*0.18;
    }
    zaBoite(g,0.75,0.6,0.7,ZAC.noir(),x+(i ? -0.3 : 0.3),hp+0.3,1.0);
  });
  /* banderole de fond, table de mixage, micro */
  var fond=zaBandeau('sono-fond',['CORRIDA 2027','ENSOA · COURSE NOCTURNE'],{w:1024,h:400,fond:'#16264a',coul:'#ffffff',tailles:[150,70],
    avant:function(c,W,H){ c.fillStyle='#f2b33d'; c.fillRect(0,H-26,W,26); }});
  zaBoite(g,L-0.6,0.05,0.05,ZAC.alu(),0,hp+2.6,-1.35);
  zaPlan(g,L-0.8,1.6,zaMatTexte('sono-fond-mat',fond),0,hp+1.75,-1.33,0);
  var t=zaTable(g,1.2,0.6,-0.6,0,false); t.position.y=hp;
  zaBoite(t,0.8,0.1,0.45,ZAC.noir(),0,0.82,0);
  zaCyl(g,0.015,0.015,1.5,ZAC.noir(),-0.3,hp+0.75,1.0,6);
  zaCyl(g,0.03,0.02,0.12,ZAC.alu(),-0.3,hp+1.55,1.0,8);
  return g;
}
function construireTableRavito(){
  var g=new THREE.Group();
  var t=zaTable(g,1.8,0,0,0,true); zaRavitoSur(t,1.8);
  zaBoite(g,0.55,0.32,0.38,ZAC.caisse(),-0.45,0.16,-0.1); zaBoite(g,0.55,0.32,0.38,ZAC.caisse(),0.3,0.16,-0.1);
  return g;
}
function construireEclairage(){
  var g=new THREE.Group(), jaune=zaMat('remorque',{color:0xd9a21b, roughness:0.6, metalness:0.2});
  zaBoite(g,1.5,0.55,0.95,jaune,0,0.62,0);
  zaBoite(g,0.9,0.06,0.06,jaune,1.1,0.42,0);
  [-0.5,0.5].forEach(function(z){ var rw=zaCyl(g,0.3,0.3,0.18,ZAC.gomme(),0,0.3,z*1.1,14); rw.rotation.x=Math.PI/2; });
  [[-0.65,-0.65],[0.65,-0.65],[-0.65,0.65],[0.65,0.65]].forEach(function(p){ zaCyl(g,0.03,0.03,0.4,ZAC.alu(),p[0],0.2,p[1],6); });
  zaCyl(g,0.09,0.06,6.4,ZAC.alu(),0,4.1,0,10);
  zaBoite(g,1.6,0.08,0.08,ZAC.alu(),0,7.3,0);
  [-0.55,-0.18,0.18,0.55].forEach(function(x){
    var p=new THREE.Group();
    zaBoite(p,0.34,0.26,0.08,ZAC.noir(),0,0,0);
    zaBoite(p,0.3,0.22,0.01,ZAC.led(),0,0,0.045);
    p.position.set(x,7.1,0.12); p.rotation.x=0.55; g.add(p);
  });
  g.userData.lumiereZA={x:0, y:7.0, z:2.5};
  return g;
}
function construireAmbulance(){
  var g=new THREE.Group(), blanc=zaMat('carrosserie',{color:0xfbfbf8, roughness:0.45, metalness:0.15});
  var tx=zaMatTexte('ambulance-flanc',zaTexAmbulance());
  zaBoite(g,3.9,2.25,2.05,blanc,-0.8,1.55,0);
  zaPlan(g,3.8,1.6,tx,-0.8,1.55,1.035,0); zaPlan(g,3.8,1.6,tx,-0.8,1.55,-1.035,Math.PI);
  zaBoite(g,1.5,1.35,2.0,blanc,1.9,1.12,0);
  var capot=zaBoite(g,0.7,0.5,1.95,blanc,2.72,0.95,0); capot.rotation.z=-0.28;
  var pb=zaBoite(g,0.06,0.7,1.8,ZAC.vitre(),2.55,1.62,0); pb.rotation.z=0.45;
  [-1.0,1.0].forEach(function(z){ zaPlan(g,0.9,0.55,ZAC.vitre(),2.0,1.55,z*1.005,z>0 ? 0 : Math.PI); });
  zaBoite(g,5.6,0.3,2.1,zaMat('bas-caisse',{color:0x3a3f47, roughness:0.7}),0.1,0.5,0);
  [[-2.0,1],[-2.0,-1],[1.95,1],[1.95,-1]].forEach(function(p){ var r=zaCyl(g,0.38,0.38,0.26,ZAC.gomme(),p[0],0.38,p[1]*0.93,16); r.rotation.x=Math.PI/2; });
  zaBoite(g,0.35,0.14,1.4,ZAC.bleuGyro(),1.95,1.86,0);
  zaBoite(g,0.2,0.12,0.5,ZAC.bleuGyro(),-2.7,2.72,0.7); zaBoite(g,0.2,0.12,0.5,ZAC.bleuGyro(),-2.7,2.72,-0.7);
  zaBoite(g,0.05,0.22,0.5,zaMat('phare',{color:0xffffff, emissive:0xfff6d8, emissiveIntensity:1.2}),2.95,0.8,0.7);
  zaBoite(g,0.05,0.22,0.5,zaMat('phare',{}),2.95,0.8,-0.7);
  return g;
}
VEH_DEF.arche={construire:construireArche, nom:'Arche d’arrivée', icone:'🏁'};
VEH_DEF.tente_chrono={construire:construireTenteChrono, nom:'Tente chronométrage', icone:'⏱'};
VEH_DEF.tente_medicale={construire:construireTenteMedicale, nom:'Poste de secours', icone:'⛑'};
VEH_DEF.tente_ravito={construire:construireTenteRavito, nom:'Tente ravitaillement', icone:'🥤'};
VEH_DEF.sono={construire:construireSono, nom:'Scène et sono', icone:'🔊'};
VEH_DEF.table_ravito={construire:construireTableRavito, nom:'Table de ravitaillement', icone:'🍌'};
VEH_DEF.eclairage={construire:construireEclairage, nom:'Mât d’éclairage', icone:'💡'};
VEH_DEF.ambulance={construire:construireAmbulance, nom:'Ambulance', icone:'🚑'};

/* mâts d'éclairage : une vraie lumière la nuit (8 au plus, sans ombre) */
var ZA_LUM=[];
function majLumieresZA(){
  var nuitActive=(typeof nuit!=='undefined') && !!nuit, n=0;
  VM.objs.forEach(function(o,v){
    if(v.t!=='eclairage') return;
    var L=o.userData.lumZA;
    if(nuitActive && n<8){
      if(!L){
        /* un mât LED de chantier éclaire bien plus qu'un lampadaire (55) */
        L=new THREE.PointLight(0xfff1d6, window.CONSULTATION ? 160 : 260, 45, 2);
        L.position.set(0,6.6,2.4); L.castShadow=false;
        o.add(L); o.userData.lumZA=L;
      }
      L.visible=true; n++;
    } else if(L) L.visible=false;
  });
}
var _majVeh3DZJ=majVehicules3D;
majVehicules3D=function(){ _majVeh3DZJ(); majLumieresZA(); };
if(typeof appliquerCiel==='function'){
  var _cielZJ=appliquerCiel;
  appliquerCiel=function(){ var r=_cielZJ.apply(this,arguments); try{ majLumieresZA(); }catch(e){} return r; };
}

var _prepVehZJ=preparerModeleVehicule;
preparerModeleVehicule=function(t){
  var D=VEH_DEF[t];
  if(!D || !D.construire) return _prepVehZJ(t);
  return new Promise(function(ok,ko){
    try{
      var corps=D.construire(), pivot=new THREE.Group();
      pivot.add(corps); pivot.updateMatrixWorld(true);
      var bb=new THREE.Box3().setFromObject(pivot), dim=bb.getSize(new THREE.Vector3());
      VM.modeles[t]={gabarit:pivot, L:Math.max(dim.x,dim.z), W:Math.min(dim.x,dim.z)};
      ok();
    }catch(e){ ko(e); }
  });
};

/* une arche posée près de l'arrivée remplace le portique rouge et l'étiquette ARRIVÉE d'origine */
function archeProcheZA(p){
  try{ return (CARTE.vehicules()||[]).some(function(v){ return v.t==='arche' && Math.hypot(pX(v.lo)-p[0],pZ(v.la)-p[1])<15; }); }
  catch(e){ return false; }
}
construireBornes=function(groupe){
  var tas=new Tas(8192), n=Math.floor(LONGUEUR/1000), k;
  for(k=1;k<=n;k++){
    var p=pointSur(k*1000), y=hauteur(p[0],p[1]);
    boiteQuad(tas,[p[0]-0.11,p[1]-0.11],[p[0]+0.11,p[1]-0.11],[p[0]+0.11,p[1]+0.11],[p[0]-0.11,p[1]+0.11],
              y,y+1.5,teinte(0xF2B33D),teinte(0xfff0c8),1);
    var e=etiquette(k+' km','rgba(30,22,6,0.92)','#F2B33D','#F2B33D',0,0.95);
    e.position.set(p[0],y+1.5,p[1]);
    groupe.add(e);
  }
  var d=pointSur(0), a=pointSur(LONGUEUR);
  portique(tas,d,capSur(0),teinte(0x2f8f4a));
  var ed=etiquette('DÉPART','rgba(10,40,20,0.94)','#4ade80','#dcfce7',0,1.1);
  ed.position.set(d[0],hauteur(d[0],d[1])+5.2,d[1]); groupe.add(ed);
  if(!archeProcheZA(a)){
    portique(tas,a,capSur(LONGUEUR),teinte(0xc0392b));
    var ea=etiquette('ARRIVÉE','rgba(44,10,10,0.94)','#fca5a5','#fee2e2',0,1.1);
    ea.position.set(a[0],hauteur(a[0],a[1])+5.2,a[1]); groupe.add(ea);
  }
  groupe.add(new THREE.Mesh(tas.geo(),MAT.perso));
};
/* =================================================================
   Zone de départ : arche DÉPART, tente accueil et dossards, consigne,
   toilettes, panneaux de sas (mêmes mécanismes que la zone d'arrivée).
   Zones sans voitures : aucune voiture garée ni en circulation dans les
   routes fermées et parkings réquisitionnés du parcours en cours
   (clé zones_sans_voiture, fournie par CARTE.zonesSansVoiture).
================================================================= */
function zkTexHorloge(txt){
  return zaTexture('horloge:'+txt,512,160,function(g,W,H){
    g.fillStyle='#050608'; g.fillRect(0,0,W,H);
    g.fillStyle='#ff3b2f'; g.textAlign='center'; g.textBaseline='middle';
    g.font='700 118px "Courier New", monospace'; g.fillText(txt,W/2,H/2+6);
  });
}
function construireArcheTexte(texte,coul,horloge){
  var g=new THREE.Group(), l=8.0, h=4.7, r=0.45, cle='arche:'+texte;
  var mMar=zaMat('arche-marine',{color:0x16264a, roughness:0.6});
  var tTxt=zaBandeau(cle,[texte],{w:1024,h:128,fond:'#16264a',coul:coul,
    avant:function(c,W,H){ c.fillStyle=coul; c.fillRect(0,0,W,6); c.fillRect(0,H-6,W,6); }});
  var tCol=zaBandeau('arche-colonne',['CORRIDA','2027','ENSOA'],{w:128,h:512,fond:'#16264a',coul:'#ffffff',tailles:[34,54,34]});
  var mc=zaMatTexte('arche-col-mat',tCol);
  [-l/2,l/2].forEach(function(x){
    zaCyl(g,r,r*1.08,h,mMar,x,h/2,0,20);
    zaCyl(g,r*1.25,r*1.25,0.18,ZAC.noir(),x,0.09,0,16);
    zaPlan(g,0.62,2.5,mc,x,2.3,r+0.02,0); zaPlan(g,0.62,2.5,mc,x,2.3,-r-0.02,Math.PI);
  });
  zaBoite(g,l+2*r,0.95,0.95,mMar,0,h+0.47,0);
  var ma=zaMatTexte(cle+'-mat',tTxt);
  zaPlan(g,l,0.8,ma,0,h+0.47,0.49,0); zaPlan(g,l,0.8,ma,0,h+0.47,-0.49,Math.PI);
  zaBoite(g,2.3,0.78,0.36,ZAC.noir(),0,h+1.35,0);
  var mh=zaMatTexte('horloge-mat:'+horloge,zkTexHorloge(horloge),1.6);
  zaPlan(g,2.1,0.62,mh,0,h+1.35,0.19,0); zaPlan(g,2.1,0.62,mh,0,h+1.35,-0.19,Math.PI);
  var mt=zaMatTexte('tapis-mat',zaTexTapis());
  [-0.55,0.55].forEach(function(z){
    var tp=zaPlan(g,l-0.4,0.9,mt,0,0.025,z,0); tp.rotation.x=-Math.PI/2;
    zaBoite(g,0.35,0.25,0.9,ZAC.gomme(),-l/2+0.35,0.12,z); zaBoite(g,0.35,0.25,0.9,ZAC.gomme(),l/2-0.35,0.12,z);
  });
  var ligne=zaPlan(g,l-0.4,0.12,zaMat('ligne',{color:0xffffff, roughness:0.6}),0,0.03,0,0); ligne.rotation.x=-Math.PI/2;
  return g;
}
function construireTenteAccueil(){
  var tex=zaBandeau('lamb-accueil',['ACCUEIL · RETRAIT DES DOSSARDS'],{w:1024,h:64,fond:'#1b2d52',coul:'#ffffff'});
  var g=zaTente(6,3,ZAC.marine(),tex,1), carton=zaMat('carton',{color:0xb08a5a, roughness:0.9});
  [-1.5,1.5].forEach(function(x){ zaTable(g,2.6,x,0.9,0,true); zaChaise(g,x-0.6,0.2,0); zaChaise(g,x+0.6,0.2,0); });
  [-2.3,-1.5,0.7,1.5].forEach(function(x){ zaBoite(g,0.38,0.14,0.26,carton,x,0.83,0.9); });
  for(var i=0;i<6;i++) zaBoite(g,0.42,0.3,0.32,carton,-2.25+i*0.9,0.15,-1.05);
  var az=zaBandeau('accueil-az',['A → L','M → Z'],{w:512,h:256,fond:'#f2b33d',coul:'#14213d'});
  zaPlan(g,1.3,0.65,zaMatTexte('accueil-az-mat',az),0,1.65,-1.47,0);
  return g;
}
function construireTenteConsigne(){
  var tex=zaBandeau('lamb-consigne',['CONSIGNE · SACS'],{w:1024,h:64,fond:'#f2b33d',coul:'#14213d'});
  var g=zaTente(6,3,zaMat('toile-or',{color:0xf2b33d, roughness:0.8, side:THREE.DoubleSide}),tex,3);
  zaTable(g,5.0,0,1.05,0,true);
  var cols=[0xc62828,0x1f5fbf,0x2f8f4a,0x2a2a2a];
  [-1.8,0,1.8].forEach(function(x,j){
    zaBoite(g,1.5,0.04,0.5,ZAC.alu(),x,0.5,-0.95); zaBoite(g,1.5,0.04,0.5,ZAC.alu(),x,1.1,-0.95);
    for(var k=0;k<4;k++){
      [0.68,1.28].forEach(function(y,e){ var c=cols[(k+j+e)%4]; zaBoite(g,0.3,0.32,0.3,zaMat('sac'+c,{color:c, roughness:0.85}),x-0.54+k*0.36,y,-0.95); });
    }
  });
  return g;
}
function construireWC(){
  var g=new THREE.Group(), coque=zaMat('wc-coque',{color:0x2f6fd6, roughness:0.55}), toit=zaMat('wc-toit',{color:0xf1f1ec, roughness:0.6}), porte=zaMat('wc-porte',{color:0x24549f, roughness:0.6});
  var sig=zaMatTexte('wc-sigle-mat',zaBandeau('wc-sigle',['WC'],{w:128,h:128,fond:'#ffffff',coul:'#1f5fbf'}));
  for(var i=0;i<4;i++){
    var x=-1.8+i*1.2;
    zaBoite(g,1.1,2.25,1.2,coque,x,1.125,0);
    zaBoite(g,1.16,0.08,1.26,toit,x,2.29,0);
    zaPlan(g,0.8,1.9,porte,x,1.0,0.605,0);
    zaPlan(g,0.3,0.3,sig,x,2.02,0.61,0);
  }
  return g;
}
function construirePanneauSas(n,couleur,sous){
  var g=new THREE.Group();
  var m=zaMatTexte('sas'+n+'-mat',zaBandeau('sas'+n,['SAS '+n,sous],{w:512,h:256,fond:couleur,coul:'#ffffff',tailles:[120,50]}));
  [-1.0,1.0].forEach(function(x){ zaCyl(g,0.04,0.04,3.1,ZAC.alu(),x,1.55,0,8); zaBoite(g,0.36,0.08,0.36,ZAC.noir(),x,0.04,0); });
  zaBoite(g,2.2,1.05,0.05,ZAC.noir(),0,2.55,0);
  zaPlan(g,2.1,0.95,m,0,2.55,0.03,0); zaPlan(g,2.1,0.95,m,0,2.55,-0.03,Math.PI);
  return g;
}
VEH_DEF.arche_depart={construire:function(){ return construireArcheTexte('DÉPART','#4ade80','00:00:00'); }, nom:'Arche de départ', icone:'🚦'};
VEH_DEF.tente_accueil={construire:construireTenteAccueil, nom:'Accueil et dossards', icone:'🎫'};
VEH_DEF.tente_consigne={construire:construireTenteConsigne, nom:'Consigne', icone:'🎒'};
VEH_DEF.wc={construire:construireWC, nom:'Toilettes', icone:'🚻'};
VEH_DEF.sas_1={construire:function(){ return construirePanneauSas(1,'#c62828','MOINS DE 40 MIN'); }, nom:'Panneau SAS 1', icone:'🟥'};
VEH_DEF.sas_2={construire:function(){ return construirePanneauSas(2,'#1f5fbf','40 À 50 MIN'); }, nom:'Panneau SAS 2', icone:'🟦'};
VEH_DEF.sas_3={construire:function(){ return construirePanneauSas(3,'#2f8f4a','PLUS DE 50 MIN'); }, nom:'Panneau SAS 3', icone:'🟩'};

/* arches posées : elles remplacent le portique et l'étiquette d'origine (départ comme arrivée) */
function archeTypeProche(type,p){
  try{ return (CARTE.vehicules()||[]).some(function(v){ return v.t===type && Math.hypot(pX(v.lo)-p[0],pZ(v.la)-p[1])<15; }); }
  catch(e){ return false; }
}
construireBornes=function(groupe){
  var tas=new Tas(8192), n=Math.floor(LONGUEUR/1000), k;
  for(k=1;k<=n;k++){
    var p=pointSur(k*1000), y=hauteur(p[0],p[1]);
    boiteQuad(tas,[p[0]-0.11,p[1]-0.11],[p[0]+0.11,p[1]-0.11],[p[0]+0.11,p[1]+0.11],[p[0]-0.11,p[1]+0.11],
              y,y+1.5,teinte(0xF2B33D),teinte(0xfff0c8),1);
    var e=etiquette(k+' km','rgba(30,22,6,0.92)','#F2B33D','#F2B33D',0,0.95);
    e.position.set(p[0],y+1.5,p[1]);
    groupe.add(e);
  }
  var d=pointSur(0), a=pointSur(LONGUEUR);
  if(!archeTypeProche('arche_depart',d)){
    portique(tas,d,capSur(0),teinte(0x2f8f4a));
    var ed=etiquette('DÉPART','rgba(10,40,20,0.94)','#4ade80','#dcfce7',0,1.1);
    ed.position.set(d[0],hauteur(d[0],d[1])+5.2,d[1]); groupe.add(ed);
  }
  if(!archeTypeProche('arche',a)){
    portique(tas,a,capSur(LONGUEUR),teinte(0xc0392b));
    var ea=etiquette('ARRIVÉE','rgba(44,10,10,0.94)','#fca5a5','#fee2e2',0,1.1);
    ea.position.set(a[0],hauteur(a[0],a[1])+5.2,a[1]); groupe.add(ea);
  }
  groupe.add(new THREE.Mesh(tas.geo(),MAT.perso));
};

/* mâts : la lumière va aux 8 mâts les plus proches de la caméra */
majLumieresZA=function(){
  var nuitActive=(typeof nuit!=='undefined') && !!nuit, L=[];
  VM.objs.forEach(function(o,v){ if(v.t==='eclairage') L.push(o); });
  var cx=camera ? camera.position.x : 0, cz=camera ? camera.position.z : 0;
  L.sort(function(a,b){ return Math.hypot(a.position.x-cx,a.position.z-cz)-Math.hypot(b.position.x-cx,b.position.z-cz); });
  L.forEach(function(o,i){
    var lu=o.userData.lumZA;
    if(nuitActive && i<8){
      if(!lu){ lu=new THREE.PointLight(0xfff1d6, window.CONSULTATION ? 160 : 260, 45, 2); lu.position.set(0,6.6,2.4); lu.castShadow=false; o.add(lu); o.userData.lumZA=lu; }
      lu.visible=true;
    } else if(lu) lu.visible=false;
  });
};
var tLumZK=0, _animZK=animerDecor;
animerDecor=function(dt,cx,cz){
  _animZK(dt,cx,cz);
  tLumZK-=dt;
  if(tLumZK<=0){ tLumZK=2; if(typeof nuit!=='undefined' && nuit) majLumieresZA(); }
};

/* ---------------- zones sans voitures ---------------- */
var ZSV3={polys:[], cle:null};
function lireZSV(forcer){
  var L=[];
  try{ L=(window.CARTE && CARTE.zonesSansVoiture) ? (CARTE.zonesSansVoiture()||[]) : []; }catch(e){}
  var cle=JSON.stringify(L);
  if(!forcer && cle===ZSV3.cle) return false;
  ZSV3.cle=cle;
  ZSV3.polys=L.map(function(f){
    var p=[], x0=1e9, x1=-1e9, z0=1e9, z1=-1e9;
    for(var i=0;i+1<f.length;i+=2){
      var x=pX(+f[i+1]), z=pZ(+f[i]);
      p.push(x,z);
      if(x<x0) x0=x; if(x>x1) x1=x; if(z<z0) z0=z; if(z>z1) z1=z;
    }
    return {p:p, x0:x0, x1:x1, z0:z0, z1:z1};
  });
  return true;
}
function dansZSV(x,z){
  for(var k=0;k<ZSV3.polys.length;k++){
    var P=ZSV3.polys[k];
    if(x<P.x0 || x>P.x1 || z<P.z0 || z>P.z1) continue;
    var p=P.p, n=p.length/2, dedans=false;
    for(var i=0,j=n-1;i<n;j=i++){
      var xi=p[i*2], zi=p[i*2+1], xj=p[j*2], zj=p[j*2+1];
      if(((zi>z)!==(zj>z)) && (x<(xj-xi)*(z-zi)/((zj-zi)||1e-9)+xi)) dedans=!dedans;
    }
    if(dedans) return true;
  }
  return false;
}
var _m4ZK=new THREE.Matrix4(), _zeroZK=new THREE.Matrix4().makeScale(0,0,0);
/* les voitures garées sont gardées dans userData.toutes (u3_m) et recopiées autour de la caméra :
   on vide celles des zones dans cette réserve (copie d'origine conservée), puis on force la recopie */
function appliquerZSVGarees(){
  if(typeof VOIT==='undefined' || !VOIT.ims) return;
  VOIT.ims.forEach(function(im){
    var A=im.userData.toutes, tot=im.userData.total||0;
    if(!A) return;
    if(!im.userData.toutesZSV) im.userData.toutesZSV=new Float32Array(A);
    var o=im.userData.toutesZSV;
    for(var k=0;k<tot;k++){
      var b=k*16, j;
      if(dansZSV(o[b+12],o[b+14])){ for(j=0;j<16;j++) A[b+j]=0; A[b+12]=1e7; A[b+14]=1e7; }
      else for(j=0;j<16;j++) A[b+j]=o[b+j];
    }
  });
  VOIT.cx=1e9;
}
function compterGareesZSV(){
  var tot=0, vides=0;
  if(typeof VOIT!=='undefined') VOIT.ims.forEach(function(im){ var o=im.userData.toutesZSV, n=im.userData.total||0; if(!o) return; for(var k=0;k<n;k++){ tot++; if(dansZSV(o[k*16+12],o[k*16+14])) vides++; } });
  return [tot,vides];
}
function marquerVoiesZSV(){
  if(typeof TRAF==='undefined' || !TRAF.voies) return;
  TRAF.voies.forEach(function(v){
    if(!v) return;
    var n=0, t=0;
    if(ZSV3.polys.length) for(var s=0;s<=v.tot;s+=8){ var q=pointVoie(v.p,v.len,s); t++; if(dansZSV(q[0],q[1])) n++; }
    v.zsv=t>0 && n/t>=0.34;
  });
}
var _accZK=accessibleCirc;
accessibleCirc=function(v){ return _accZK(v) && !(v && v.zsv); };
var _prepVoiesZK=preparerVoiesCirc;
preparerVoiesCirc=function(){ _prepVoiesZK(); lireZSV(true); marquerVoiesZSV(); };
var _avZK=avancerVoiture;
avancerVoiture=function(c,dt){
  var ok=_avZK(c,dt);
  if(ok && ZSV3.polys.length){ var q=cibleVoiture(c); if(dansZSV(q.x,q.z)) return false; }
  return ok;
};
function majZSV(forcer){
  if(lireZSV(forcer) || forcer){ appliquerZSVGarees(); marquerVoiesZSV(); }
}
ETAPES.forEach(function(e,i){ if(e[0]==='Voitures stationnées et mobilier urbain') ETAPES.splice(i+1,0,['Routes fermées',function(){ majZSV(true); }]); });
var _signalerZK=window.ESPACE3D.signaler;
window.ESPACE3D.signaler=function(t){
  _signalerZK(t);
  if(t==='equip' || t==='parcours' || t==='route'){
    setTimeout(function(){ try{ if(construit) majZSV(false); }catch(e){ console.error('Zones sans voitures',e); } },200);
  }
};
/* =================================================================
   Jalonneurs vus à plusieurs passages : la pose suit le passage du
   coureur (CARTE.progression) ; le panneau montre les passages et
   règle la consigne du passage choisi (CARTE.modifierRole).
================================================================= */
var tRolesZL=0, syncZLprevu=false, _animZL=animerDecor;
function syncJalonneursPlusTard(){
  if(syncZLprevu) return;
  syncZLprevu=true;
  setTimeout(function(){ syncZLprevu=false; try{ syncJalonneurs(); }catch(e){ console.error(e); } },0);
}
animerDecor=function(dt,cx,cz){
  _animZL(dt,cx,cz);
  tRolesZL-=dt;
  if(tRolesZL>0 || !window.CARTE || !CARTE.progression || !J) return;
  tRolesZL=0.4;
  if(CARTE.progression(J.d)) syncJalonneursPlusTard();
};
function rolesPanneau(){
  var o=SELECTION, box=$e('e3-jp-pass');
  if(!box){
    var ref=document.querySelector('#e3-jp .e3-jp-lbl');
    if(!ref) return;
    box=document.createElement('div'); box.id='e3-jp-pass';
    ref.parentNode.insertBefore(box,ref);
    box.addEventListener('click',function(ev){
      var b=ev.target.closest('button');
      if(!b || !SELECTION) return;
      if(b.dataset.k!==undefined){ CARTE.forcerPassage(SELECTION.j,+b.dataset.k); syncJalonneurs(); }
      else if(b.dataset.a==='commun'){ CARTE.modifierRole(SELECTION.j,{commun:true}); dire('Même consigne à chaque passage.'); }
      b.blur();
    });
  }
  if(!o || !CARTE.passagesJalon){ box.hidden=true; return; }
  var P=CARTE.passagesJalon(o.j);
  if(P.km.length<2){ box.hidden=true; box.__h=''; return; }
  box.hidden=false;
  var h='<div class="e3-jp-lbl">Passages des coureurs devant lui</div><div class="e3-jp-ligne e3-seg">'+
    P.km.map(function(km,k){ return '<button type="button" data-k="'+k+'" class="'+(k===P.actif?'on':'')+'" title="Voir et régler sa consigne à ce passage">'+(k+1)+'<sup>'+(k?'e':'er')+'</sup> · km '+km.toFixed(2).replace('.',',')+'</button>'; }).join('')+'</div>'+
    '<p class="e3-jp-aide">'+(P.p2>=0
      ? 'Consigne propre au '+(P.p2+1)+(P.p2?'e':'er')+' passage. <button type="button" data-a="commun" class="e3-lien">Même consigne partout</button>'
      : 'Même consigne à chaque passage. Choisis le '+(P.km.length>1?'2e':'')+' passage puis règle le regard ou les bras pour lui donner sa propre consigne.')+'</p>';
  if(box.__h!==h){ box.innerHTML=h; box.__h=h; }
  var ba=$e('e3-jp-auto');
  if(ba && P.p2>=0 && P.actif===P.p2) ba.textContent=(o.j.p2 && (o.j.p2.az===undefined || o.j.p2.az===null)) ? 'Orientation automatique (tout droit s’il continue droit)' : 'Remettre en automatique';
}
var _majPanZL=majPanneauJalon;
majPanneauJalon=function(){ _majPanZL(); try{ rolesPanneau(); }catch(e){ console.error(e); } };
var _deselZL=deselectionner;
deselectionner=function(){
  var o=SELECTION;
  _deselZL();
  if(o && window.CARTE && CARTE.forcerPassage){ CARTE.forcerPassage(o.j,null); syncJalonneursPlusTard(); }
};
var _branchZL=brancherInterface;
brancherInterface=function(){
  _branchZL();
  if(!window.CARTE || !CARTE.modifierRole) return;
  function role(ch){ if(SELECTION) CARTE.modifierRole(SELECTION.j,ch); }
  ['g','d','n','x'].forEach(function(b){ var e=$e('e3-jp-'+b); if(e) e.onclick=function(){ role({bras:b}); }; });
  $e('e3-jp-moins').onclick=function(){ if(SELECTION) role({az:SELECTION.az-15}); };
  $e('e3-jp-plus').onclick=function(){ if(SELECTION) role({az:SELECTION.az+15}); };
  $e('e3-jp-auto').onclick=function(){ role({auto:true}); dire('Orientation recalculée pour ce passage.'); };
  var az=$e('e3-jp-az'), az2=az.cloneNode(true);
  az.parentNode.replaceChild(az2,az);
  az2.addEventListener('input',function(){
    var o=SELECTION; if(!o) return;
    o.az=+az2.value; o.lod.rotation.y=-capDeAz(o.az);
    $e('e3-jp-azv').textContent=Math.round(o.az)+'° '+pointCardinal(o.az);
  });
  az2.addEventListener('change',function(){ role({az:+az2.value}); az2.blur(); });
};
/* =================================================================
   Vues de référence pour le relevé photo.
   Poser la caméra où l'on veut, dans la direction qu'on veut, et
   récupérer l'image : c'est ce qui fabrique les vignettes montrées sur
   le téléphone (outils/rendre_vues.js). Rien dans l'interface n'appelle
   ces fonctions, l'usage normal de la 3D n'est pas touché.
================================================================= */
window.ESPACE3D.construit=function(){ return !!construit; };
/* o : {la, lo, az, champ (degrés, horizontal), pitch} */
window.ESPACE3D.vueDepuis=function(o){
  if(!construit || !renderer) return false;
  if(VUE==='jal') sortirVueJal();
  VUE='fp';
  J.x=pX(o.lo); J.z=pZ(o.la); J.v=0; J.phase=0;
  J.cap=capDeAz(o.az);
  CAM.yaw=J.cap; CAM.libre=0;
  CAM.fpPitch=(o.pitch===undefined)?-0.02:o.pitch;
  /* le champ demandé est horizontal, comme celui d'un téléphone ;
     three.js veut le champ vertical */
  var h=(o.champ||68)*PI/180, asp=camera.aspect||1.6;
  camera.fov=2*Math.atan(Math.tan(h/2)/asp)*180/PI;
  camera.updateProjectionMatrix();
  if(joueur) majJoueur(0);
  majVisibilite(); majBoutonsVue();
  /* la caméra vient de sauter : on révèle tout de suite ce qui l'entoure
     au lieu d'attendre le prochain tour de boucle (qui peut être lent) */
  camera.position.set(J.x+Math.cos(CAM.yaw)*0.15, hauteur(J.x,J.z)+1.63, J.z+Math.sin(CAM.yaw)*0.15);
  PERF.auto=false;            /* pas d'allègement automatique : toutes les vues au même niveau */
  PERF.t=0; ARB.cx=1e9; VOIT.cx=1e9;
  try{
    majMorceaux(J.x,J.z); majVoitures(J.x,J.z); majJalonsVisibles(J.x,J.z); majArbres(J.x,J.z);
  }catch(e){ console.warn(e); }
  return true;
};
/* où est la caméra, et qu'est-ce qui est réellement affiché : sert à
   vérifier chaque vue au moment où on la fabrique */
window.ESPACE3D.etat=function(){
  if(!construit || !renderer) return null;
  var vis=0, i;
  for(i=0;i<PERF.morceaux.length;i++) if(PERF.morceaux[i].m.visible) vis++;
  return {
    vue:VUE, auto:auto,
    joueur:[+J.x.toFixed(1), +J.z.toFixed(1)],
    camera:[+camera.position.x.toFixed(1), +camera.position.y.toFixed(1), +camera.position.z.toFixed(1)],
    cap:+(((Math.atan2(Math.cos(CAM.yaw),-Math.sin(CAM.yaw))*180/PI)+360)%360).toFixed(1),
    champV:+camera.fov.toFixed(1), sol:+hauteur(J.x,J.z).toFixed(1),
    portee:PERF.dist, qualite:QUAL().nom,
    morceaux:PERF.morceaux.length, morceauxVisibles:vis
  };
};
/* dessine immédiatement et renvoie l'image : le tampon n'est pas
   conservé d'une image à l'autre, il faut donc lire dans la foulée */
window.ESPACE3D.cliche=function(qualite){
  if(!construit || !renderer) return null;
  renderer.render(scene,camera);
  return renderer.domElement.toDataURL('image/jpeg',qualite||0.72);
};

/* Ce que la 3D a bâti, bâtiment par bâtiment : sa hauteur au faîte des
   murs et les couleurs qui lui ont été données. Sert de vérité connue pour
   éprouver outils/relever_360.js sur des panoramas de synthèse.          */
window.ESPACE3D.batisPoses=function(){
  if(!construit) return null;
  var c=new THREE.Color();
  return BATIS_POSES.map(function(b){
    return {la:+b.la.toFixed(7), lo:+b.lo.toFixed(7), h:b.h, sol:b.sol, murs:b.murs, faite:b.faite,
            mur:'0x'+c.fromArray(b.mur).getHexString(), toit:'0x'+c.fromArray(b.toit).getHexString(),
            fam:b.fam, type:b.type, aire:b.aire, ow:b.ow, ol:b.ol};
  });
};

/* Une tranche de panorama, depuis un point et une direction donnés.

   La vue subjective place l'oeil à 15 cm devant le coureur, dans la
   direction du regard : en faisant le tour de l'horizon par tranches, le
   centre de projection décrirait un cercle de 30 cm de diamètre. À dix
   mètres cela décale les toits de près d'un degré, soit 16 cm de hauteur
   relevée — exactement ce que le relevé 360 cherche à mesurer. Cette
   fonction pose donc la caméra au point demandé, sans décalage.

   Poser la caméra et lire l'image doivent tenir dans le même appel : entre
   deux appels, la boucle d'animation la remettrait derrière le coureur.

   o : {la, lo} ou {x, z} ; h hauteur de l'oeil au-dessus du sol (1,63 m par
   défaut) ou y absolu ; az azimut et el élévation en degrés ; champ le
   champ horizontal en degrés.                                            */
window.ESPACE3D.clicheLibre=function(o,qualite){
  if(!construit || !renderer) return null;
  var x=(o.x!==undefined)?o.x:pX(o.lo), z=(o.z!==undefined)?o.z:pZ(o.la);
  var y=(o.y!==undefined)?o.y:(hauteur(x,z)+((o.h!==undefined)?o.h:1.63));
  var a=(o.az||0)*PI/180, el=(o.el||0)*PI/180;
  var dx=Math.sin(a)*Math.cos(el), dy=Math.sin(el), dz=-Math.cos(a)*Math.cos(el);
  var asp=camera.aspect||1.6, ch=(o.champ||60)*PI/180;
  camera.fov=2*Math.atan(Math.tan(ch/2)/asp)*180/PI;
  camera.position.set(x,y,z);
  camera.up.set(0,1,0);
  camera.lookAt(x+dx, y+dy, z+dz);
  camera.updateProjectionMatrix();
  renderer.render(scene,camera);
  /* qualite = 0 : on ne réencode pas. L'appelant recopie la toile du moteur
     dans la foulée, sans passer par un JPEG, et garde les pixels exacts. */
  return {image:(qualite===0)?null:renderer.domElement.toDataURL('image/jpeg',qualite||0.85),
          oeil:[x,y,z], aspect:asp, fovV:camera.fov,
          large:renderer.domElement.width, haut:renderer.domElement.height};
};

/* Que touche-t-on à cet endroit de l'écran ? Un rayon depuis la caméra, et
   le nom du matériau, le point touché et la normale. C'est ce qui permet
   de nommer un toit qui flotte au lieu de le deviner : on demande au
   moteur de quel maillage il sort et à quelle hauteur.
   sx, sy : fractions de l'image, 0,0 en haut à gauche.                  */
/* Nommer les matériaux avant de sonder : « (sans nom) » n'apprend rien, et
   c'est précisément quand on ne reconnaît pas ce qu'on voit qu'on sonde. Les
   matériaux nommés à la main gardent leur nom ; les autres prennent leur clé
   dans MAT, et faute de nom on rend la couleur — une barre verte de sept
   mètres au milieu du bourg ne se laisse pas identifier autrement. */
function nommerMateriaux(){
  for(var k in MAT){
    var m=MAT[k];
    if(!m) continue;
    if(Array.isArray(m)){
      for(var i=0;i<m.length;i++) if(m[i] && m[i].isMaterial && !m[i].name) m[i].name=k+'['+i+']';
    } else if(m.isMaterial && !m.name) m.name=k;
  }
}
window.ESPACE3D.sonder=function(sx,sy,combien){
  if(!construit || !renderer) return null;
  nommerMateriaux();
  var r=new THREE.Raycaster();
  r.setFromCamera(new THREE.Vector2(sx*2-1, 1-sy*2), camera);
  r.far=1200;
  var t=r.intersectObjects(scene.children,true), out=[];
  for(var i=0;i<t.length && out.length<(combien||4);i++){
    var h=t[i];
    if(!h.object || !h.object.visible) continue;
    var m=h.object.material||{};
    var quoi=m.name||h.object.name||(h.object.parent&&h.object.parent.name)||'';
    if(!quoi) quoi='(sans nom'+(m.color?(', couleur #'+m.color.getHexString()):'')+
                   (m.map?', texturé':'')+(m.alphaTest?', découpé':'')+')';
    out.push({
      quoi:quoi,
      dist:+h.distance.toFixed(1),
      point:[+h.point.x.toFixed(1), +h.point.y.toFixed(1), +h.point.z.toFixed(1)],
      normale:h.face?[+h.face.normal.x.toFixed(2),+h.face.normal.y.toFixed(2),+h.face.normal.z.toFixed(2)]:null
    });
  }
  return out;
};

/* =================================================================
   Relevé photographique du 17 septembre 2026 : ce que le terrain dit.

   Dix-sept photos prises sur le parcours, avec position GPS et cap de la
   boussole, ont été confrontées au rendu 3D du même point et du même angle
   (outils/comparer_photos.js). Trois constats, par ordre d'importance :

   1. Des volets partout. La 3D en pose sur presque toutes les fenêtres.
      En ville, les grands bâtiments institutionnels — et ils sont nombreux
      à Saint-Maixent, qui s'est construite autour de l'école — n'en ont
      pas : de hautes fenêtres nues, alignées, sans persiennes. La famille
      « militaire » sans volets existait déjà, mais ne s'appliquait qu'aux
      polygones de l'ENSOA ; les bâtiments de même nature situés en ville
      recevaient donc des familles résidentielles. C'est ce qui saute le
      plus aux yeux sur la comparaison.

   2. Des fenêtres carrées là où elles sont hautes et étroites. La famille
      institutionnelle dessinait des baies de 1,28 × 1,28 m. Les photos
      donnent environ 1,15 m de large pour 2,05 m de haut, espacées de
      2,6 m d'axe en axe.

   3. Les couleurs, elles, étaient déjà proches : la mesure du rendu donne
      un crème à rvb(198,194,186) contre rvb(198,192,177) sur les photos, et
      un gris à rvb(134,129,128) contre rvb(142,143,138). On corrige d'un
      cheveu — un peu plus chaud sur le crème, un peu plus clair sur le
      gris — sans toucher à l'équilibre général.

   Palette relevée, une voix par photo, teinte au soleil (la 3D éclaire
   elle-même, il lui faut la couleur propre du matériau et non son
   apparence du jour) : crème rvb(198,192,177) sur 6 photos, gris-beige
   rvb(142,143,138) sur 6, gris moyen rvb(160,160,153) sur 2.
================================================================= */

/* ---------- les bâtiments vus en photo, et ce qu'ils sont vraiment ----------
   Repérés par leur centre en latitude/longitude, pas par leur rang dans les
   données : un nouvel import OSM changerait les rangs, pas les positions.
   niv : nombre de niveaux lu sur la photo. fam : famille de façade.        */
var RELEVE=[
  /* Position = centre réel de l'emprise OSM, relevé par le lancer de rayon
     (outils/relever_batiments.js), et non une coordonnée devinée : deux de
     mes premières entrées tombaient à plus de 22 m de leur bâtiment et
     n'étaient donc jamais appliquées. */

  /* #57 — avenue du départ : long commerce d'un seul niveau très haut,
     grandes baies, enseigne. La 3D en faisait trois étages de logements. */
  {la:46.414720, lo:-0.201852, niv:1, fam:6, note:'commerce bas de l’avenue'},
  /* #3586 — le grand bâtiment de 70 m derrière : institutionnel */
  {la:46.414916, lo:-0.201923, niv:2, fam:3, note:'grand bâtiment de l’avenue'},
  /* #22 et #4503 — pierre de taille institutionnelle, trois niveaux,
     fenêtres hautes nues, aucun volet sur la photo */
  {la:46.414153, lo:-0.203569, niv:3, fam:3, note:'grand bâtiment de pierre'},
  {la:46.414031, lo:-0.203763, niv:3, fam:3, note:'annexe de pierre'},
  /* #3229 — la mairie : ocre chaud, volets gris-bleu, drapeau. C'est le
     bâtiment que la 3D avait le moins mal rendu. */
  {la:46.413104, lo:-0.203509, niv:2, fam:2, note:'mairie, ocre chaud'},
  /* #4399 — vieille ville : front bâti continu à volets, trois niveaux */
  {la:46.413544, lo:-0.205522, niv:3, fam:0, note:'front bâti de la place'},
  /* #369 — longue caserne à lucarnes, deux niveaux, toit de tuile */
  {la:46.413421, lo:-0.203303, niv:2, fam:3, note:'caserne à lucarnes'},
  /* #3128 — la plus longue : 68 m, trois niveaux, fenêtres nues alignées */
  {la:46.411981, lo:-0.203343, niv:3, fam:3, note:'caserne de 68 m'},
  /* #3490 — bâtiment de pignon à hautes baies, enduit gris */
  {la:46.412857, lo:-0.202109, niv:2, fam:3, note:'pignon à hautes baies'}
];
/* familles : 0 enduit clair, 1 pierre de taille, 2 enduit ocre,
   3 institutionnel sans volets, 4 moellons enduits, 5 pavillon,
   6 commerce bas à grandes baies (nouvelle, relevée sur l'avenue) */

var RELEVE_XZ=null;
function releveProche(cx,cz){
  if(!RELEVE_XZ) RELEVE_XZ=RELEVE.map(function(o){
    return {x:pX(o.lo), z:pZ(o.la), o:o};
  });
  var best=null;
  for(var i=0;i<RELEVE_XZ.length;i++){
    var d=Math.hypot(RELEVE_XZ[i].x-cx, RELEVE_XZ[i].z-cz);
    if(d<22 && (!best || d<best.d)) best={d:d, o:RELEVE_XZ[i].o};
  }
  return best ? best.o : null;
}

/* ---------- emprises reprises par un monument ----------
   La Porte Chalon est bâtie sur les deux emprises OSM de ses pavillons. Si
   on laisse en plus la 3D y dresser ses bâtiments ordinaires, les deux se
   superposent : c'est ce qui donnait, sur la capture du terrain, des
   balustrades et des entablements paraissant flotter au-dessus de maisons à
   volets. Ces emprises sont donc écartées de la boucle des bâtiments. */
function repriseParMonument(cx,cz){
  if(!window.PORTE) return false;
  var d1=Math.hypot(pX(PORTE.pavA.lo)-cx, pZ(PORTE.pavA.la)-cz);
  var d2=Math.hypot(pX(PORTE.pavB.lo)-cx, pZ(PORTE.pavB.la)-cz);
  return Math.min(d1,d2)<7;
}

/* ---------- un bâtiment institutionnel se reconnaît à sa forme ----------
   Long, large, régulier : une caserne, une école, une administration. Les
   photos montrent que ce type domine le parcours en ville, et qu'il n'a pas
   de volets. Le seuil vient des bâtiments relevés : 449 m² pour le plus
   petit d'entre eux, 37 m de long.                                        */
function institutionnel(aire,ow,ol,rect){
  var lon=Math.max(ow,ol), lar=Math.min(ow,ol);
  return aire>380 && lon>30 && lar>8 && rect>=55;
}

/* ---------- deux familles de façade refaites d'après les photos ---------- */
var NB_FAM=7;

/* fonds et volets : une entrée de plus, et un gris relevé sur les photos
   plutôt que le gris légèrement chaud et sombre que mesurait le rendu */
/* Le voile donne sa teinte à la famille. Mon premier essai était neutre
   (146,147,142) et le rendu mesuré est ressorti à rvb(182,180,179) : un
   écart rouge-bleu de 3 là où les photos en donnent 21. Les bâtiments
   institutionnels de Saint-Maixent sont d'un crème chaud, pas gris. */
FOND_FAM[3]={id:'plastered_wall_02', voile:'rgba(206,197,176,0.46)'};
FOND_FAM[6]={id:'beige_wall_001',    voile:'rgba(201,195,180,0.46)'};
VOLETS_FAM[6]=[null];               /* un commerce n'a pas de persiennes */
/* Sur les dix-sept photos, aucun volet rouge ni brun : ils sont gris-bleu,
   gris pâle ou blanc cassé — la mairie, les maisons de la place et les
   étages de l'avenue s'accordent là-dessus. La famille ocre avait hérité
   d'une palette de rouges et d'olive que j'avais inventée. */
VOLETS_FAM[2]=['#8d9aa3','#a9b0b2','#e4e2da','#6f8391'];
VOLETS_FAM[0]=['#7c93a4','#a3aead','#e6e2d6','#5f7a8a'];
VOLETS_FAM[4]=['#94a0a6','#a9a9a2','#7a8b93'];

/* Façade institutionnelle : deux fenêtres hautes et étroites par travée de
   5,2 m — 1,15 m de large pour 1,9 m de haut, appui à 0,95 m, comme sur les
   casernes photographiées. Encadrement peint clair, pas de volets, corniche
   sous le toit. C'est la correction la plus visible du relevé.             */
function etageInstit(g,W,H){
  var vit=[];
  var lF=Math.round(W*1.15/5.2), hF=Math.round(H*1.90/3.35);
  var yF=H-Math.round(H*0.95/3.35)-hF;
  [0.25,0.75].forEach(function(u){
    var x=Math.round(W*u-lF/2);
    vit=vit.concat(fenetreRiche(g,x,yF,lF,hF,{
      encadr:'rgba(222,220,212,0.95)', encW:4, menuis:'#707880',
      appui:'#c9c7c0', bois:true, carreaux:3
    }));
  });
  /* corniche : un bandeau clair et son ombre portée */
  g.fillStyle='rgba(216,214,206,0.92)'; g.fillRect(0,H-13,W,8);
  g.fillStyle='rgba(0,0,0,0.20)'; g.fillRect(0,H-5,W,3);
  return vit;
}
/* Commerce bas de l'avenue : un seul niveau très haut, grandes baies,
   bandeau d'enseigne. La 3D en faisait trois étages de logements.          */
function etageCommerce(g,W,H){
  var vit=[];
  /* bandeau d'enseigne en haut */
  g.fillStyle='rgba(74,78,82,0.90)'; g.fillRect(0,0,W,Math.round(H*0.17));
  g.fillStyle='rgba(255,255,255,0.10)'; g.fillRect(0,Math.round(H*0.17)-3,W,3);
  var lB=Math.round(W*2.40/6.0), hB=Math.round(H*2.60/4.2);
  var yB=H-Math.round(H*0.40/4.2)-hB;
  [0.27,0.73].forEach(function(u){
    var x=Math.round(W*u-lB/2);
    vit=vit.concat(fenetreRiche(g,x,yB,lB,hB,{
      encadr:'rgba(64,68,72,0.95)', encW:6, menuis:'#3d4247'
    }));
  });
  g.fillStyle='rgba(120,116,108,0.35)'; g.fillRect(0,H-9,W,9);
  return vit;
}

var _etageAvant=etageRiche, _rdcAvant=rdcRiche;
etageRiche=function(f){
  if(f!==3 && f!==6) return _etageAvant(f);
  var W=256, H=205, c=toile(W,H), g=c.getContext('2d');
  fondRiche(g,W,H,f);
  return {c:c, v:(f===6)?etageCommerce(g,W,H):etageInstit(g,W,H)};
};
rdcRiche=function(f){
  if(f!==3 && f!==6) return _rdcAvant(f);
  var W=256, H=205, c=toile(W,H), g=c.getContext('2d');
  fondRiche(g,W,H,f);
  if(f===6) return {c:c, v:etageCommerce(g,W,H)};
  /* rez institutionnel : mêmes fenêtres, une porte à deux battants, et un
     soubassement de pierre comme sur les photos */
  soubassement(g,W,H,'#9e9c95',26);
  var vit=[];
  var lF=Math.round(W*1.15/5.2), hF=Math.round(H*1.90/3.35);
  var yF=H-Math.round(H*0.95/3.35)-hF;
  vit=vit.concat(porteRiche(g,Math.round(W*0.25-40),H-26-Math.round(H*2.35/3.35),80,
    Math.round(H*2.35/3.35),{encadr:'rgba(222,220,212,0.95)',col:'#5d666d',double:true,imposte:true}));
  vit=vit.concat(fenetreRiche(g,Math.round(W*0.75-lF/2),yF,lF,hF,{
    encadr:'rgba(222,220,212,0.95)', encW:4, menuis:'#707880', appui:'#c9c7c0', bois:true, carreaux:3}));
  return {c:c, v:vit};
};

/* =================================================================
   Détails relevés sur les photos du 17 septembre 2026.

   Trois choses que la 3D ne savait pas, et qui font qu'on reconnaît une
   ville : ses monuments, ses statues, et ce qui est écrit sur ses murs.

   - La Porte Chalon, relevée sur deux photos : deux pavillons à
     balustrade, deux murs concaves qui les relient à une arche en plein
     cintre, un tympan en ferronnerie, le drapeau au-dessus. Sa position
     n'est pas devinée : les deux pavillons existent dans les emprises
     OpenStreetMap (#1136 et #1769), l'arche est posée à leur milieu et
     l'axe de la composition est la droite qui les joint.

   - Le monument à Denfert-Rochereau, place de l'esplanade : socle en
     pyramide tronquée cannelée, lion de bronze couché, statue en capote
     et képi, bornes reliées par des chaînes. Sa position est triangulée
     par les caps de deux photos prises de part et d'autre — 28 m depuis
     l'une, 52 m depuis l'autre, qui se croisent à un mètre près.

   - Les enseignes : HUMAN immobilier, ORPI VINET, PROMAN intérim, maison
     blanche, HÔTEL, FEMINA, la plaque SALONS DE L'HÔTEL DE VILLE de la
     mairie, et les listes de noms gravées du mémorial. Chacune est un
     panneau texturé posé devant son mur, à sa place relevée.
================================================================= */

/* ---------- quadrilatère texturé, coins dans l'ordre ---------- */
function quadT(tas,A,B,C,D,uv,col){
  var nn=nrm(A,B,C);
  tas.tri(A[0],A[1],A[2], B[0],B[1],B[2], C[0],C[1],C[2], nn[0],nn[1],nn[2],
          [uv[0],uv[1], uv[2],uv[3], uv[4],uv[5]], col);
  tas.tri(A[0],A[1],A[2], C[0],C[1],C[2], D[0],D[1],D[2], nn[0],nn[1],nn[2],
          [uv[0],uv[1], uv[4],uv[5], uv[6],uv[7]], col);
}
/* le même, mais la normale forcée : utile pour un panneau mince */
function quadN(tas,A,B,C,D,n,uv,col){
  tas.tri(A[0],A[1],A[2], B[0],B[1],B[2], C[0],C[1],C[2], n[0],n[1],n[2],
          [uv[0],uv[1], uv[2],uv[3], uv[4],uv[5]], col);
  tas.tri(A[0],A[1],A[2], C[0],C[1],C[2], D[0],D[1],D[2], n[0],n[1],n[2],
          [uv[0],uv[1], uv[4],uv[5], uv[6],uv[7]], col);
}

/* Un panneau texturé porte sa propre image, donc son propre matériau : on
   le pose comme un maillage à part plutôt que dans un tas partagé. Une
   dizaine de panneaux dans toute la ville, l'appel de dessin est sans
   conséquence.

   Deux pièges, et j'y suis tombé dans les deux :

   1. Le sens horizontal. Un observateur qui regarde le panneau avance dans
      la direction -n ; sa droite vaut alors (n.z, 0, -n.x). J'avais pris
      l'opposé, ce qui retourne l'enroulement des triangles : les panneaux
      étaient éliminés comme faces arrière, donc invisibles — sauf celui
      qu'on apercevait par derrière, en miroir et à l'envers.

   2. Le sens vertical. Une CanvasTexture a flipY à vrai : la coordonnée
      v = 0 tombe sur le bas de l'image telle qu'elle est dessinée. Les
      coins du bas doivent donc porter v = 0, et non v = 1.

   D'où PANNEAU_UV et droiteDe(), partagés par tout ce qui porte une image
   posée sur un mur. */
var PANNEAU_UV=[0,0, 1,0, 1,1, 0,1];
function droiteDe(n){ return [n[2],0,-n[0]]; }
/* Une image posée sur un quadrilatère : enseigne, plaque, ferronnerie.

   Elle s'appelait panneau(), et il y avait déjà, bien plus haut dans le
   fichier, un panneau(tas,cx,cy,cz,ang,larg,haut,u0,u1,col) qui fabrique
   les panneaux de feuillage des arbres. Les déclarations de fonction
   remontent en tête de portée et la dernière gagne : depuis l'arrivée de
   mes enseignes, tous les arbres du projet appelaient donc la mauvaise
   fonction, avec un Tas là où elle attendait un point. Leurs feuillages
   sortaient en NaN — 5 511 géométries à chaque construction du monde —
   et disparaissaient à l'affichage.

   Rien ne se voyait à Saint-Maixent : les vrais arbres en volume (ez-tree)
   se posent par-dessus et masquaient l'absence. C'est la carte du village,
   sans arbres modélisés, qui l'a révélé. Deuxième collision de nom du même
   genre après triOriente() ; d'où ce nom-là, explicite.                  */
function panneauImage(A,B,C,D,n,toileP,opts){
  var o=opts||{};
  var tas=new Tas(64);
  quadN(tas,A,B,C,D,n,PANNEAU_UV,teinte(0xffffff));
  var m=new THREE.MeshStandardMaterial({vertexColors:true, map:textureDe(toileP,1,1),
    roughness:(o.rugo===undefined?0.85:o.rugo), metalness:o.metal||0,
    transparent:!!o.transparent, alphaTest:o.transparent?0.35:0, side:o.double?THREE.DoubleSide:THREE.FrontSide});
  return ajouter(tas,m,false,true);
}

/* ---------- textures des détails ---------- */
/* Une enseigne : fond, lettres, et de quoi la lire de loin. Les polices du
   navigateur suffisent, le panneau fait 20 cm par pixel au plus. */
function texEnseigne(o){
  var W=512, H=Math.max(64,Math.round(512*o.ht/o.l)), c=toile(W,H), g=c.getContext('2d');
  g.fillStyle=o.fond||'#1b7cb0'; g.fillRect(0,0,W,H);
  if(o.bord){ g.strokeStyle=o.bord; g.lineWidth=Math.max(2,H*0.05); g.strokeRect(0,0,W,H); }
  g.textAlign='center'; g.textBaseline='middle';
  var t=o.texte||'', sous=o.sous||'';
  g.fillStyle=o.encre||'#ffffff';
  var taille=Math.round(H*(sous?0.42:0.56));
  g.font='600 '+taille+'px '+(o.police||'"Oswald",Impact,sans-serif');
  /* l'espacement des lettres ne se règle pas sur une toile : on écrit
     lettre par lettre quand l'enseigne l'exige */
  if(o.espace){
    var pas=W*0.92/Math.max(1,t.length);
    for(var i=0;i<t.length;i++) g.fillText(t[i], W*0.04+pas*(i+0.5), H*(sous?0.38:0.5));
  } else g.fillText(t, W/2, H*(sous?0.38:0.5));
  if(sous){
    g.font='400 '+Math.round(H*0.26)+'px "Barlow",sans-serif';
    g.fillStyle=o.encre2||o.encre||'#ffffff';
    g.fillText(sous, W/2, H*0.74);
  }
  grain(g,W,H,Math.round(W*H/420),0.10,'#ffffff','#000000');
  return c;
}
/* Une plaque gravée : lettres en creux sur la pierre */
/* Plaque gravée. La toile s'adapte au texte : à 62 % de la hauteur sur une
   toile carrée de deux pour un, « A DENFERT-ROCHEREAU » faisait trois fois
   la largeur et sortait rognée au milieu d'un mot. On mesure donc la ligne
   la plus longue et on taille la toile à sa mesure — l'appelant lit ensuite
   le rapport de la toile pour donner au panneau la même proportion. */
function texPlaque(lignes,fond){
  var n=lignes.length, H=Math.max(128,96*n), c0=toile(8,8), g0=c0.getContext('2d');
  var taille=Math.round(H*0.62/n);
  g0.font='600 '+taille+'px "Barlow",serif';
  var large=0, i;
  for(i=0;i<n;i++) large=Math.max(large,g0.measureText(lignes[i]).width);
  var W=Math.max(Math.round(H*1.6), Math.round(large*1.18));
  var c=toile(W,H), g=c.getContext('2d');
  g.fillStyle=fond||'#cfc7b4'; g.fillRect(0,0,W,H);
  grain(g,W,H,Math.round(W*H/90),0.18,'#ffffff','#8d8575');
  g.textAlign='center'; g.textBaseline='middle';
  for(i=0;i<n;i++){
    var y=H*(i+0.5)/n;
    g.font='600 '+taille+'px "Barlow",serif';
    g.fillStyle='rgba(255,255,255,0.55)'; g.fillText(lignes[i],W/2+1.5,y+1.5);
    g.fillStyle='#4a4436'; g.fillText(lignes[i],W/2,y);
  }
  return c;
}
/* Les listes de noms du mémorial : des colonnes de lignes fines, gravées.
   On ne prétend pas écrire les vrais noms — ce serait inventer des morts.
   On rend la trame : des colonnes de texte serré, lisibles comme telles. */
function texListeNoms(){
  var W=512, H=1024, c=toile(W,H), g=c.getContext('2d');
  g.fillStyle='#c9c2b2'; g.fillRect(0,0,W,H);
  grain(g,W,H,6000,0.16,'#ffffff','#8b8474');
  g.textAlign='center';
  var col=2, larg=W/col;
  for(var k=0;k<col;k++){
    var x=larg*(k+0.5), y=26;
    g.fillStyle='#4a4436'; g.font='600 19px "Barlow",serif';
    g.fillText(['1914-1918','1939-1945'][k]||'', x, y); y+=26;
    g.font='400 13px "Barlow",serif';
    while(y<H-18){
      /* une ligne de nom : trait plein irrégulier, pas de nom inventé */
      var l=larg*(0.34+Math.random()*0.40);
      g.fillStyle='rgba(74,68,54,'+(0.55+Math.random()*0.3)+')';
      g.fillRect(x-l/2, y-4, l, 2.2);
      y+=15;
    }
  }
  return c;
}
/* La face d'un pavillon de la Porte Chalon : deux niveaux de hautes
   fenêtres à petits carreaux, un garde-corps de fer forgé devant celles du
   premier, encadrements de pierre, et le refend des assises. Relevé sur le
   recadrage « arche et fronton » : les baies montent presque jusqu'au
   bandeau, et le balconnet ne fait qu'une trentaine de centimètres. */
function texPavillon(){
  var W=512, H=616, c=toile(W,H), g=c.getContext('2d');
  fondPierre(g,W,H);
  /* refend : des joints horizontaux plus marqués que ceux du fond */
  g.strokeStyle='rgba(120,112,96,0.30)'; g.lineWidth=2;
  for(var y=44;y<H;y+=44){ g.beginPath(); g.moveTo(0,y); g.lineTo(W,y); g.stroke(); }
  function baie(x,y,w,h,garde){
    /* encadrement */
    g.fillStyle='rgba(232,226,210,0.92)'; g.fillRect(x-11,y-13,w+22,h+24);
    g.fillStyle='rgba(0,0,0,0.13)'; g.fillRect(x-11,y+h+9,w+22,3);
    /* vitrage */
    var vg=g.createLinearGradient(x,y,x+w*0.5,y+h);
    vg.addColorStop(0,'#9fb0be'); vg.addColorStop(0.45,'#5d7386');
    vg.addColorStop(0.7,'#33414e'); vg.addColorStop(1,'#1e262d');
    g.fillStyle=vg; g.fillRect(x,y,w,h);
    /* meneaux : deux vantaux, quatre carreaux chacun */
    g.strokeStyle='#e7e2d6'; g.lineWidth=3.2;
    g.strokeRect(x+1.6,y+1.6,w-3.2,h-3.2);
    g.beginPath();
    g.moveTo(x+w/2,y); g.lineTo(x+w/2,y+h);
    for(var k=1;k<4;k++){ g.moveTo(x,y+h*k/4); g.lineTo(x+w,y+h*k/4); }
    g.stroke();
    /* appui */
    g.fillStyle='#ddd7c6'; g.fillRect(x-14,y+h+10,w+28,7);
    g.fillStyle='rgba(0,0,0,0.20)'; g.fillRect(x-14,y+h+17,w+28,3);
    if(garde){
      /* balconnet : barreaux fins et une lisse */
      g.strokeStyle='#2f2f2c'; g.lineWidth=2.2;
      g.beginPath(); g.moveTo(x-10,y+h-30); g.lineTo(x+w+10,y+h-30); g.stroke();
      g.lineWidth=1.7;
      for(var b=x-6;b<x+w+8;b+=8){ g.beginPath(); g.moveTo(b,y+h-30); g.lineTo(b,y+h+9); g.stroke(); }
    }
  }
  [0.27,0.73].forEach(function(u){
    baie(Math.round(W*u-52), 96, 104, 172, true);     /* premier niveau */
    baie(Math.round(W*u-52), 352, 104, 156, false);   /* rez */
  });
  /* bandeau d'entablement en haut */
  g.fillStyle='rgba(226,219,202,0.95)'; g.fillRect(0,0,W,30);
  g.fillStyle='rgba(0,0,0,0.18)'; g.fillRect(0,30,W,5);
  /* soubassement plus sombre, comme la pierre salie du pied */
  var sg=g.createLinearGradient(0,H-70,0,H);
  sg.addColorStop(0,'rgba(120,112,96,0)'); sg.addColorStop(1,'rgba(96,90,76,0.38)');
  g.fillStyle=sg; g.fillRect(0,H-70,W,70);
  return c;
}
/* Le tympan en ferronnerie de la Porte Chalon : volutes et armoiries,
   sur fond transparent pour laisser voir le ciel à travers */
function texFerronnerie(){
  var W=512, H=256, c=toile(W,H), g=c.getContext('2d');
  g.clearRect(0,0,W,H);
  g.strokeStyle='#2b2a26'; g.lineCap='round';
  /* rayons et volutes, en demi-cercle */
  var cx=W/2, cy=H, R=H*0.94;
  g.lineWidth=5;
  g.beginPath(); g.arc(cx,cy,R,PI,2*PI); g.stroke();
  g.beginPath(); g.arc(cx,cy,R*0.62,PI,2*PI); g.stroke();
  g.lineWidth=3.4;
  for(var i=1;i<12;i++){
    var a=PI+PI*i/12;
    g.beginPath();
    g.moveTo(cx+Math.cos(a)*R*0.62, cy+Math.sin(a)*R*0.62);
    g.lineTo(cx+Math.cos(a)*R, cy+Math.sin(a)*R);
    g.stroke();
  }
  /* volutes */
  g.lineWidth=3;
  for(var k=0;k<7;k++){
    var b=PI+PI*(k+0.5)/7, rr=R*0.78;
    g.beginPath();
    g.arc(cx+Math.cos(b)*rr, cy+Math.sin(b)*rr, R*0.10, 0, 2*PI);
    g.stroke();
  }
  /* armoiries au centre */
  g.fillStyle='#4a4640';
  g.beginPath();
  g.moveTo(cx-26,cy-R*0.80); g.lineTo(cx+26,cy-R*0.80);
  g.lineTo(cx+26,cy-R*0.56); g.lineTo(cx,cy-R*0.40); g.lineTo(cx-26,cy-R*0.56);
  g.closePath(); g.fill();
  g.strokeStyle='#8f8a7e'; g.lineWidth=2; g.stroke();
  return c;
}

/* ---------- la Porte Chalon ----------
   Dimensions relevées sur les photos, à l'échelle des emprises OSM :
   pavillons de 11 × 9 m et 11 m de haut, balustrade de 1,1 m, murs
   concaves de 7,2 m, arche de 4,6 m d'ouverture sous un entablement à
   12,4 m. La pierre est un calcaire pâle, plus sombre au pied.          */
window.PORTE={
  /* Centres des deux pavillons, tels qu'ils sont dans les emprises OSM. Ils
     encadrent le point « Porte Chalon » à dix mètres de part et d'autre,
     exactement : ce sont bien eux, et l'arche est à leur milieu.
     Écart mesuré : 19,8 m — la composition entière fait donc une trentaine
     de mètres, et non les quarante que j'avais d'abord estimés d'après la
     perspective des photos. Tout est dimensionné sur cet écart. */
  pavA:{la:46.413171, lo:-0.205419},
  pavB:{la:46.413089, lo:-0.205648}
};
var PORTE=window.PORTE;
/* ================================================================
   La Porte Chalon, refaite d'après le plan OSM et les deux photos.

   Le plan vient des deux emprises #1136 et #1769, exprimées dans le repère
   de la composition (u le long de l'axe, v vers le nord — c'est de là que
   les photos sont prises, cap 171° et 183°, et c'est la face qui porte les
   écrans concaves) :

     · les deux piles de l'arche se font face à u = ±2,21 : le passage a
       donc 4,42 m de large, et 3 m de profondeur ;
     · de chaque côté, l'emprise dessine un quart de cercle — les sommets
       relevés se placent à 4 cm près sur un cercle de 4,10 m de rayon
       centré à (±5,55 ; 3,40). C'est l'écran concave des photos, tangent
       au bloc de l'arche d'un côté et perpendiculaire au pavillon de
       l'autre ;
     · les pavillons occupent u de ±9,8 à ±17,3, leur face avant à v ≈ +5.

   Les hauteurs viennent des photos, par rapports mesurés entre objets à la
   même distance — jamais en mélangeant deux plans, ce qui m'avait donné
   des proportions fausses au premier essai :

     · bloc de l'arche : 2,87 fois la largeur du passage, soit 12,7 m ;
       naissance du cintre à 1,32 fois, soit 5,84 m ; bloc large de 2,58
       fois, soit 11,4 m ;
     · pavillon : 1,39 fois sa propre largeur, soit 9,7 m sur 7 m.

   Tout est décrit en volumes pleins : le tympan au-dessus du cintre est
   maçonné jusqu'à la corniche, et non suspendu au-dessus du vide comme
   dans la version précédente.
================================================================ */
function porteChalon(){
  if(!BAT || !BAT.taille) return;
  /* Calcaire clair : la photo donne un gris-crème très pâle, et le tone
     mapping ACES rabat encore les tons clairs — il faut donc entrer plus
     clair que la cible. */
  var pierre=teinte(0xe4e0d2), pierreO=teinte(0xd2ccba), taille=teinte(0xefece0);
  var corniche=teinte(0xf2efe4), fer=teinte(0x33322e), verre=teinte(0x55636d);

  var ax=pX(PORTE.pavA.lo), az=pZ(PORTE.pavA.la);
  var bx=pX(PORTE.pavB.lo), bz=pZ(PORTE.pavB.la);
  var dx=ax-bx, dz=az-bz, D=Math.hypot(dx,dz);
  if(D<4) return;
  var ux=dx/D, uz=dz/D;                    /* u : vers le pavillon A */
  var nx=-uz, nz=ux;
  if(nz>0){ nx=-nx; nz=-nz; }              /* v : vers le nord */
  var mx=(ax+bx)/2, mz=(az+bz)/2;
  var sol=Math.min(hauteur(ax,az),hauteur(bx,bz),hauteur(mx,mz))-0.15;
  function P(u,v){ return [mx+ux*u+nx*v, mz+uz*u+nz*v]; }
  /* Dans ce repère la normale nord rend le couple (u,v) gaucher : un
     quadrilatère écrit « u croissant puis v croissant » sort donc à
     l'envers. C'est ce qui vidait la moitié de la porte. On ne s'en remet
     plus au sens d'écriture : boiteQuad remet elle-même son contour dans
     le sens direct, et quadFace impose la normale voulue. */
  function boite(u0,u1,v0,v1,y0,y1,cm,ct,ech){
    boiteQuad(BAT.taille,P(u0,v0),P(u1,v0),P(u1,v1),P(u0,v1),
              sol+y0,sol+y1,cm,ct||cm,ech||1.6);
  }
  /* un panneau vertical dans le plan v = cst, normale vers +v ou -v */
  function faceV(u0,u1,y0,y1,v,sens,col,uv){
    var A=P(u0,v), B=P(u1,v);
    quadFace(BAT.taille,[A[0],sol+y0,A[1]],[B[0],sol+y0,B[1]],
             [B[0],sol+y1,B[1]],[A[0],sol+y1,A[1]],
             [nx*sens,0,nz*sens], uv||[0,0,(u1-u0)/1.6,0,(u1-u0)/1.6,(y1-y0)/1.6,0,(y1-y0)/1.6], col);
  }

  /* ---------------------------------------------------------------
     Le bloc de l'arche
  --------------------------------------------------------------- */
  var OUV=2.21, AL=5.70;                   /* demi-passage, demi-bloc */
  var V0=-2.95, V1=0.05;                   /* profondeur du bloc */
  var NAI=5.84, HB=11.55;                  /* naissance du cintre, maçonnerie */
  var HC=0.70, DC=0.42, HK=0.45, DK=0.58;  /* corniche et coiffe */
  var CLE=8.05;                            /* clé du cintre : NAI + OUV */

  /* les deux piles, socle compris */
  [-1,1].forEach(function(c){
    var u0=c*OUV, u1=c*AL;
    boite(Math.min(u0,u1)-0.14*(c<0?1:0), Math.max(u0,u1)+0.14*(c>0?1:0),
          V0-0.14, V1+0.14, 0, 0.55, pierreO, pierreO, 1.2);   /* soubassement */
    boite(u0, u1, V0, V1, 0.55, HB, pierre, pierre, 1.6);
    /* pilastre d'angle : large et à peine saillant, comme sur la photo */
    var pu=c*(AL-1.50);
    boite(pu, c*AL, V1, V1+0.10, 0.55, HB, taille, taille, 1.2);
    boite(pu, c*AL, V0-0.10, V0, 0.55, HB, taille, taille, 1.2);
    /* bandeau d'imposte, au niveau de la naissance */
    boite(u0, u1, V1, V1+0.10, NAI-0.22, NAI, corniche, corniche, 1);
    boite(u0, u1, V0-0.10, V0, NAI-0.22, NAI, corniche, corniche, 1);
    /* joue du passage : la pile vue depuis l'arche */
    faceV(0,0,0,0,0,1,pierre);   /* (place tenue, voir plus bas) */
  });
  /* les joues du passage, dans le plan u = ±OUV, normale vers l'axe */
  [-1,1].forEach(function(c){
    var A=P(c*OUV,V0), B=P(c*OUV,V1);
    var np=[-ux*c,0,-uz*c];
    quadFace(BAT.taille,[A[0],sol+0.55,A[1]],[B[0],sol+0.55,B[1]],
             [B[0],sol+NAI,B[1]],[A[0],sol+NAI,A[1]],np,
             [0,0,(V1-V0)/1.6,0,(V1-V0)/1.6,(NAI-0.55)/1.6,0,(NAI-0.55)/1.6],pierreO);
  });

  /* Le cintre et tout ce qui le surmonte. Pour chaque tranche du demi-
     cercle : l'intrados, le tympan maçonné jusqu'à la corniche sur les
     deux faces, et l'archivolte en saillie. */
  var NA=18;
  for(var i=0;i<NA;i++){
    var a0=PI*i/NA, a1=PI*(i+1)/NA;
    var u0=-Math.cos(a0)*OUV, u1=-Math.cos(a1)*OUV;
    var y0=NAI+Math.sin(a0)*OUV, y1=NAI+Math.sin(a1)*OUV;
    /* intrados : la voûte du passage, normale vers le bas-intérieur */
    var A=P(u0,V0), B=P(u0,V1), C=P(u1,V1), Dd=P(u1,V0);
    var mu=-(u0+u1)/2/OUV, my=-((y0+y1)/2-NAI)/OUV, ml=Math.hypot(mu,my)||1;
    var ni=[ux*mu/ml, my/ml, uz*mu/ml];
    quadFace(BAT.taille,[A[0],sol+y0,A[1]],[B[0],sol+y0,B[1]],
             [C[0],sol+y1,C[1]],[Dd[0],sol+y1,Dd[1]],ni,
             [0,0,(V1-V0)/1.4,0,(V1-V0)/1.4,0.5,0,0.5],pierreO);
    /* tympan : du cintre jusqu'à la corniche, sur les deux faces */
    [1,-1].forEach(function(s){
      var v=(s>0)?V1:V0;
      var Aa=P(u0,v), Bb=P(u1,v);
      quadFace(BAT.taille,[Aa[0],sol+y0,Aa[1]],[Bb[0],sol+y1,Bb[1]],
               [Bb[0],sol+HB,Bb[1]],[Aa[0],sol+HB,Aa[1]],[nx*s,0,nz*s],
               [0,0,0.8,0,0.8,1.2,0,1.2],pierre);
    });
    /* archivolte : bandeau saillant suivant l'extrados */
    var e0=-Math.cos(a0)*(OUV+0.55), e1=-Math.cos(a1)*(OUV+0.55);
    var g0=NAI+Math.sin(a0)*(OUV+0.55), g1=NAI+Math.sin(a1)*(OUV+0.55);
    [1,-1].forEach(function(s){
      var v=((s>0)?V1:V0)+s*0.13;
      var Aa=P(u0,v), Bb=P(u1,v), Cc=P(e1,v), Dd2=P(e0,v);
      quadFace(BAT.taille,[Aa[0],sol+y0,Aa[1]],[Bb[0],sol+y1,Bb[1]],
               [Cc[0],sol+g1,Cc[1]],[Dd2[0],sol+g0,Dd2[1]],[nx*s,0,nz*s],
               [0,0,0.45,0,0.45,0.35,0,0.35],taille);
      /* chant du bandeau */
      var vi=(s>0)?V1:V0;
      var Ai=P(e0,vi), Bi=P(e1,vi), Bo=P(e1,v), Ao=P(e0,v);
      var mo=-(e0+e1)/2/(OUV+0.55), mh=((g0+g1)/2-NAI)/(OUV+0.55), mL=Math.hypot(mo,mh)||1;
      quadFace(BAT.taille,[Ai[0],sol+g0,Ai[1]],[Bi[0],sol+g1,Bi[1]],
               [Bo[0],sol+g1,Bo[1]],[Ao[0],sol+g0,Ao[1]],
               [ux*mo/mL, mh/mL, uz*mo/mL],[0,0,0.4,0,0.4,0.12,0,0.12],taille);
    });
  }
  /* la clé, saillante, qui monte dans la frise */
  [1,-1].forEach(function(s){
    var v=((s>0)?V1:V0)+s*0.20;
    boite(-0.42,0.42,Math.min(v,(s>0)?V1:V0),Math.max(v,(s>0)?V1:V0),
          CLE-0.35,CLE+0.95,taille,taille,1);
  });
  boite(-0.42,0.42,V0-0.20,V1+0.20,CLE+0.62,CLE+0.95,taille,taille,1);

  /* corniche et coiffe, d'un seul volume : rien ne flotte */
  boite(-AL-0.20,AL+0.20,V0-0.20,V1+0.20,HB-0.26,HB,corniche,corniche,1.2);
  boite(-AL-DC,AL+DC,V0-DC,V1+DC,HB,HB+HC,corniche,corniche,1.4);
  boite(-AL-DK,AL+DK,V0-DK,V1+DK,HB+HC,HB+HC+HK,corniche,corniche,1.2);

  /* le tympan de ferronnerie, à claire-voie, posé juste derrière la face
     nord, sur une traverse à la naissance */
  var rd=droiteDe([nx,0,nz]);
  var vg=V1-0.45;
  var cg=P(0,vg);
  var tg=[cg[0]-rd[0]*OUV, cg[1]-rd[2]*OUV], td=[cg[0]+rd[0]*OUV, cg[1]+rd[2]*OUV];
  panneauImage([tg[0],sol+NAI,tg[1]],[td[0],sol+NAI,td[1]],
          [td[0],sol+NAI+OUV,td[1]],[tg[0],sol+NAI+OUV,tg[1]],
          [nx,0,nz], texFerronnerie(), {transparent:true, double:true, rugo:0.55, metal:0.3});
  var tv0=P(-OUV,vg), tv1=P(OUV,vg);
  tube(BAT.zinc,tv0[0],sol+NAI-0.05,tv0[1],tv1[0],sol+NAI-0.05,tv1[1],0.09,0.09,4,fer,true,true);

  /* le drapeau, au centre de la coiffe */
  var pf=P(0,(V0+V1)/2);
  drapeau(pf[0],pf[1],Math.atan2(nz,nx),sol+HB+HC+HK);

  /* ---------------------------------------------------------------
     Les deux écrans concaves : un quart de cercle de 4,10 m de rayon,
     épais de 2,40 m, relevé sur l'emprise OSM.
  --------------------------------------------------------------- */
  var HM=7.30, HMC=0.30, RI=4.10, RO=6.50;
  [-1,1].forEach(function(c){
    var cu=c*5.55, cv=3.40, NS=10;
    function pt(t,r){
      var a=1.5*PI+0.5*PI*t;                       /* de 270° à 360° */
      return [cu+c*Math.cos(a)*r, cv+Math.sin(a)*r];
    }
    for(var k=0;k<NS;k++){
      var t0=k/NS, t1=(k+1)/NS;
      var i0=pt(t0,RI), i1=pt(t1,RI), o0=pt(t0,RO), o1=pt(t1,RO);
      /* face concave, tournée vers le centre du cercle donc vers le nord */
      var am=1.5*PI+0.5*PI*(t0+t1)/2;
      var nc=[-(c*Math.cos(am))*ux-(Math.sin(am))*nx, 0, -(c*Math.cos(am))*uz-(Math.sin(am))*nz];
      var A=P(i0[0],i0[1]), B=P(i1[0],i1[1]);
      quadFace(BAT.taille,[A[0],sol,A[1]],[B[0],sol,B[1]],
               [B[0],sol+HM,B[1]],[A[0],sol+HM,A[1]],nc,
               [0,0,0.9,0,0.9,4.5,0,4.5],pierre);
      /* face convexe, au dos */
      var Ao=P(o0[0],o0[1]), Bo=P(o1[0],o1[1]);
      quadFace(BAT.taille,[Ao[0],sol,Ao[1]],[Bo[0],sol,Bo[1]],
               [Bo[0],sol+HM,Bo[1]],[Ao[0],sol+HM,Ao[1]],[-nc[0],0,-nc[2]],
               [0,0,1.4,0,1.4,4.5,0,4.5],pierreO);
      /* coiffe : dalle horizontale et ses deux chants */
      var ci0=pt(t0,RI-0.12), ci1=pt(t1,RI-0.12), co0=pt(t0,RO+0.12), co1=pt(t1,RO+0.12);
      var Q1=P(ci0[0],ci0[1]), Q2=P(ci1[0],ci1[1]), Q3=P(co1[0],co1[1]), Q4=P(co0[0],co0[1]);
      quadFace(BAT.taille,[Q1[0],sol+HM+HMC,Q1[1]],[Q2[0],sol+HM+HMC,Q2[1]],
               [Q3[0],sol+HM+HMC,Q3[1]],[Q4[0],sol+HM+HMC,Q4[1]],[0,1,0],
               [0,0,1,0,1,2.4,0,2.4],corniche);
      quadFace(BAT.taille,[Q1[0],sol+HM,Q1[1]],[Q2[0],sol+HM,Q2[1]],
               [Q2[0],sol+HM+HMC,Q2[1]],[Q1[0],sol+HM+HMC,Q1[1]],nc,
               [0,0,0.9,0,0.9,0.3,0,0.3],corniche);
      quadFace(BAT.taille,[Q4[0],sol+HM,Q4[1]],[Q3[0],sol+HM,Q3[1]],
               [Q3[0],sol+HM+HMC,Q3[1]],[Q4[0],sol+HM+HMC,Q4[1]],[-nc[0],0,-nc[2]],
               [0,0,1.4,0,1.4,0.3,0,0.3],corniche);
    }
  });

  /* ---------------------------------------------------------------
     Les deux pavillons
  --------------------------------------------------------------- */
  var PL=3.50, PH=8.40, PHC=0.30, PDC=0.34;
  var BB=0.24, BH=0.48, BT=0.28;           /* balustrade : socle, balustres, main courante */
  [-1,1].forEach(function(c){
    var cu=c*13.30;
    var v0=(c>0)?-5.20:-3.60, v1=(c>0)?5.50:4.40;
    var u0=cu-PL, u1=cu+PL;
    boite(u0-0.16,u1+0.16,v0-0.16,v1+0.16,0,0.55,pierreO,pierreO,1.2);
    boite(u0,u1,v0,v1,0.55,PH,pierre,pierre,1.6);
    /* Chaînes d'angle sur les quatre faces. Posées seulement sur les faces
       nord et sud, on n'en voyait que le chant depuis le côté : un trait
       vertical au lieu d'un harpage de pierre. */
    [[u0,u0+1.0],[u1-1.0,u1]].forEach(function(q){
      boite(q[0],q[1],v1,v1+0.09,0.55,PH,taille,taille,1.1);
      boite(q[0],q[1],v0-0.09,v0,0.55,PH,taille,taille,1.1);
    });
    [[v0,v0+1.0],[v1-1.0,v1]].forEach(function(q){
      boite(u1,u1+0.09,q[0],q[1],0.55,PH,taille,taille,1.1);
      boite(u0-0.09,u0,q[0],q[1],0.55,PH,taille,taille,1.1);
    });
    /* corniche */
    boite(u0-PDC,u1+PDC,v0-PDC,v1+PDC,PH,PH+PHC,corniche,corniche,1.3);
    /* balustrade : socle, dés d'angle, balustres tournés, main courante */
    var b0=u0-0.10, b1=u1+0.10, bv0=v0-0.10, bv1=v1+0.10;
    boite(b0,b1,bv0,bv1,PH+PHC,PH+PHC+BB,corniche,corniche,1.1);
    var y0=PH+PHC+BB, y1=y0+BH;
    [[b0,b0+0.55],[b1-0.55,b1]].forEach(function(q){
      boite(q[0],q[1],bv0,bv0+0.55,y0,y1+BT,corniche,corniche,1);
      boite(q[0],q[1],bv1-0.55,bv1,y0,y1+BT,corniche,corniche,1);
    });
    function file(uA,vA,uB,vB){
      var L=Math.hypot(uB-uA,vB-vA), n=Math.max(1,Math.round(L/0.44));
      for(var k=0;k<=n;k++){
        var t=k/n, p=P(uA+(uB-uA)*t, vA+(vB-vA)*t);
        tube(BAT.taille,p[0],sol+y0,p[1],p[0],sol+y1,p[1],0.105,0.065,6,corniche,false,true);
        tube(BAT.taille,p[0],sol+y0+BH*0.42,p[1],p[0],sol+y0+BH*0.58,p[1],0.105,0.105,6,corniche,false,false);
      }
    }
    file(b0+0.62,bv1-0.28,b1-0.62,bv1-0.28);
    file(b0+0.62,bv0+0.28,b1-0.62,bv0+0.28);
    file(b0+0.28,bv0+0.62,b0+0.28,bv1-0.62);
    file(b1-0.28,bv0+0.62,b1-0.28,bv1-0.62);
    boite(b0,b1,bv0,bv1,y1,y1+BT,corniche,corniche,1.1);

    /* Les deux hautes fenêtres, une par niveau — et sur les deux faces :
       les photos montrent la face nord, mais le parcours passe au sud, et
       de ce côté le pavillon restait une paroi nue. */
    [[1.45,2.95,false,1],[5.25,2.95,true,1],[1.45,2.95,false,-1],[5.25,2.95,true,-1]].forEach(function(f){
      var yb=f[0], hf=f[1], bal=f[2], sg=f[3], lf=0.72;   /* demi-largeur */
      var vF=(sg>0)?v1:v0;
      /* Le vitrage se pose DEVANT le nu du mur, pas derrière : à 14 cm en
         retrait il était enfoui dans la maçonnerie, et la fenêtre ne se
         voyait plus — il ne restait que le garde-corps du balcon, qui
         passait pour une grille de cave. L'encadrement, lui, ressort de
         10 cm et donne l'ombre du tableau. */
      var Av=P(cu-lf,vF+0.03*sg), Bv=P(cu+lf,vF+0.03*sg);
      quadFace(BAT.deco,[Av[0],sol+yb,Av[1]],[Bv[0],sol+yb,Bv[1]],
               [Bv[0],sol+yb+hf,Bv[1]],[Av[0],sol+yb+hf,Av[1]],[nx*sg,0,nz*sg],
               [0,0,0.9,0,0.9,1.9,0,1.9],verre);
      /* encadrement de pierre : deux jambages, un linteau, un appui */
      boite(cu-lf-0.22,cu-lf,vF,vF+0.11*sg,yb-0.12,yb+hf+0.22,taille,taille,1);
      boite(cu+lf,cu+lf+0.22,vF,vF+0.11*sg,yb-0.12,yb+hf+0.22,taille,taille,1);
      boite(cu-lf-0.22,cu+lf+0.22,vF,vF+0.13*sg,yb+hf,yb+hf+0.22,taille,taille,1);
      boite(cu-lf-0.30,cu+lf+0.30,vF,vF+0.17*sg,yb-0.20,yb-0.12,taille,taille,1);
      /* petits bois : trois montants, cinq traverses */
      var k, pu2=P(cu, vF+0.055*sg);
      tube(BAT.taille,pu2[0],sol+yb,pu2[1],pu2[0],sol+yb+hf,pu2[1],0.035,0.035,4,taille,false,false);
      for(k=1;k<=3;k++){
        var pa=P(cu-lf,vF+0.055*sg), pb2=P(cu+lf,vF+0.055*sg), yy=sol+yb+hf*k/4;
        tube(BAT.taille,pa[0],yy,pa[1],pb2[0],yy,pb2[1],0.035,0.035,4,taille,false,false);
      }
      /* garde-corps de fonte devant la fenêtre haute */
      if(bal){
        var g0=P(cu-lf-0.16,vF+0.26*sg), g1=P(cu+lf+0.16,vF+0.26*sg);
        tube(BAT.zinc,g0[0],sol+yb+0.78,g0[1],g1[0],sol+yb+0.78,g1[1],0.028,0.028,4,fer,true,true);
        tube(BAT.zinc,g0[0],sol+yb+0.06,g0[1],g1[0],sol+yb+0.06,g1[1],0.024,0.024,4,fer,true,true);
        var nb=Math.round((2*lf+0.32)/0.15);
        for(k=0;k<=nb;k++){
          var pg=P(cu-lf-0.16+(2*lf+0.32)*k/nb, vF+0.26*sg);
          tube(BAT.zinc,pg[0],sol+yb+0.06,pg[1],pg[0],sol+yb+0.78,pg[1],0.013,0.013,4,fer,false,false);
        }
      }
    });
  });

  /* la plaque « PAVILLON MUNICIPAL », sur le pavillon est */
  var pc=P(13.30-2.05,5.52), tq=texPlaque(['PAVILLON','MUNICIPAL'],'#e6e2d6');
  var hq=0.46, lq=hq*tq.width/tq.height/2;
  var pg=[pc[0]-rd[0]*lq, pc[1]-rd[2]*lq], pd=[pc[0]+rd[0]*lq, pc[1]+rd[2]*lq];
  panneauImage([pg[0],sol+4.55,pg[1]],[pd[0],sol+4.55,pd[1]],
          [pd[0],sol+4.55+hq,pd[1]],[pg[0],sol+4.55+hq,pg[1]],
          [nx,0,nz], tq, {rugo:0.9});

  /* la terrasse de pierre et sa grille en losanges, devant le pavillon est */
  var tu0=13.30-3.8, tu1=13.30+3.8, tv=5.50;
  boite(tu0,tu1,tv,tv+1.9,0,0.62,pierreO,pierreO,1.2);
  var q0=P(tu0+0.2,tv+1.75), q1=P(tu1-0.2,tv+1.75);
  var gx=q1[0]-q0[0], gz=q1[1]-q0[1], GL=Math.hypot(gx,gz);
  tube(BAT.zinc,q0[0],sol+1.52,q0[1],q1[0],sol+1.52,q1[1],0.035,0.035,4,fer,true,true);
  var np=Math.max(2,Math.round(GL/1.15));
  for(var k2=0;k2<=np;k2++){
    var t2=k2/np, px=q0[0]+gx*t2, pz2=q0[1]+gz*t2;
    tube(BAT.zinc,px,sol+0.62,pz2,px,sol+1.52,pz2,0.03,0.03,4,fer,false,false);
    if(k2<np){
      var t3=(k2+1)/np, qx=q0[0]+gx*t3, qz=q0[1]+gz*t3;
      var cxm=(px+qx)/2, czm=(pz2+qz)/2;
      tube(BAT.zinc,px,sol+0.70,pz2,cxm,sol+1.45,czm,0.018,0.018,3,fer,false,false);
      tube(BAT.zinc,cxm,sol+1.45,czm,qx,sol+0.70,qz,0.018,0.018,3,fer,false,false);
      tube(BAT.zinc,px,sol+1.45,pz2,cxm,sol+0.70,czm,0.018,0.018,3,fer,false,false);
      tube(BAT.zinc,cxm,sol+0.70,czm,qx,sol+1.45,qz,0.018,0.018,3,fer,false,false);
    }
  }
}

/* ---------- le monument à Denfert-Rochereau ----------
   Position triangulée par les caps de libre-001 (130°, à 28 m) et
   libre-002 (219°, à 52 m) : les deux rayons se croisent à x=762, z=-167.
   Socle en pyramide tronquée à cannelures, lion de bronze couché contre
   la face avant, statue en capote et képi au sommet, bornes et chaînes.  */
/* Le monument est dans les données : le mobilier urbain OSM porte un
   mémorial (type M) à cet endroit, et c'est lui que la 3D dessinait en
   socle blanc nu. Ma position venait de la triangulation des caps de deux
   photos — deux relevés de boussole concordants, mais treize mètres à
   côté du point OSM, qui fait foi. « az » est ici la direction vers
   laquelle la statue regarde : l'axe de l'avenue, donc le rond-point, à
   92 m de là — c'est aussi de ce côté que les deux photos sont prises. */
var MONUMENT={la:46.415308, lo:-0.199700, az:242};
/* ================================================================
   Le monument Denfert-Rochereau, refait d'après la photo libre-001.

   La version précédente en faisait une pyramide de 5,8 m de base et 5,4 m
   de haut, surmontée d'une statuette : rien à voir avec l'original. La
   photo, mesurée en prenant la statue pour étalon (un bronze de ce type
   fait 2,4 m, ce qui donne 112 px/m sur l'image), décrit tout autre chose :

     · un socle bas de deux degrés, 5 m de côté, 1,16 m de haut ;
     · un dé fortement fruité — 2,25 m de côté en bas, 1,40 m en haut —
       sur 1,52 m ;
     · une frise de cannelures verticales, une corniche, le bandeau gravé
       « A DENFERT-ROCHEREAU », puis le dé qui porte la statue ;
     · le lion de bronze couché sur le degré, devant le dé, 1,65 m de long ;
     · le soldat de bronze en capote et képi, bras croisés, le fusil posé
       à sa droite, son paquetage à ses pieds ;
     · dix bornes reliées par des chaînes autour du tout.

   Hauteur totale : 6,4 m, et non 8,5.
================================================================ */
function monumentDenfert(){
  if(!BAT || !BAT.taille) return;
  var mx=pX(MONUMENT.lo), mz=pZ(MONUMENT.la), sol=hauteur(mx,mz);
  var a=MONUMENT.az*PI/180, nx=Math.sin(a), nz=-Math.cos(a);   /* la face */
  var ux=-nz, uz=nx;                                            /* le long */
  var pierre=teinte(0xe6e2d4), pierreO=teinte(0xd4cebc), gris=teinte(0xc2bbaa);
  /* deux bronzes : la patine sombre du corps, et un ton plus clair pour ce
     qui doit se détacher — la crinière du lion, le képi, les mitrons */
  var bronze=teinte(0x333b33), bronzeC=teinte(0x4d5749);

  function P(u,v){ return [mx+ux*u+nx*v, mz+uz*u+nz*v]; }
  function carre(r,y0,y1,col,ct,ech){
    boiteQuad(BAT.taille,P(-r,-r),P(r,-r),P(r,r),P(-r,r),sol+y0,sol+y1,col,ct||col,ech||1.2);
  }
  /* Le dé fruité, en quatre trapèzes d'un seul plan. Empilé en assises
     carrées de plus en plus petites — ma première version — le fruit se
     lisait comme un escalier : une ziggourat au milieu du rond-point,
     alors que la photo montre un parement lisse aux joints fins. */
  function fruit(r0,r1,y0,y1,col){
    var dr=r0-r1, dy=y1-y0, L=Math.hypot(dr,dy)||1;
    var cotes=[[ux,uz,1,0],[nx,nz,0,1],[-ux,-uz,-1,0],[-nx,-nz,0,-1]];
    for(var c=0;c<4;c++){
      var o=cotes[c], su=o[2], sv=o[3];
      /* la face porte sur l'axe perpendiculaire au côté */
      var pu=-sv, pv=su;
      var A=P(su*r0+pu*r0, sv*r0+pv*r0), B=P(su*r0-pu*r0, sv*r0-pv*r0);
      var C=P(su*r1-pu*r1, sv*r1-pv*r1), Dd=P(su*r1+pu*r1, sv*r1+pv*r1);
      quadFace(BAT.taille,[A[0],sol+y0,A[1]],[B[0],sol+y0,B[1]],
               [C[0],sol+y1,C[1]],[Dd[0],sol+y1,Dd[1]],
               [o[0]*dy/L, dr/L, o[1]*dy/L],
               [0,0,2*r0/0.8,0,2*r1/0.8,L/0.8,0,L/0.8],col);
    }
    /* la face du dessus, pour ne rien laisser ouvert */
    var T=[P(r1,r1),P(-r1,r1),P(-r1,-r1),P(r1,-r1)];
    quadFace(BAT.taille,[T[0][0],sol+y1,T[0][1]],[T[1][0],sol+y1,T[1][1]],
             [T[2][0],sol+y1,T[2][1]],[T[3][0],sol+y1,T[3][1]],[0,1,0],
             [0,0,1,0,1,1,0,1],col);
  }

  /* --- socle : deux degrés et une plinthe --- */
  carre(2.50, 0.00, 0.42, pierreO, gris, 1.6);
  carre(2.15, 0.42, 0.80, pierre, gris, 1.4);
  carre(1.65, 0.80, 1.16, pierre, gris, 1.2);

  /* --- le dé fruité --- */
  fruit(1.12, 0.70, 1.16, 2.68, pierre);

  /* --- frise de cannelures, corniche, bandeau gravé --- */
  carre(0.74, 2.68, 3.08, pierreO, pierreO, 0.9);
  for(var k=0;k<40;k++){
    var cote=Math.floor(k/10), t=(k%10+0.5)/10;
    var s=-0.66+1.32*t;
    var p=(cote===0)?P(s,0.76):(cote===1)?P(0.76,s):(cote===2)?P(-s,-0.76):P(-0.76,-s);
    tube(BAT.taille,p[0],sol+2.74,p[1],p[0],sol+3.02,p[1],0.045,0.045,4,gris,false,false);
  }
  carre(0.82, 3.08, 3.35, pierre, pierre, 1.0);      /* corniche */
  carre(0.70, 3.35, 3.62, pierreO, pierreO, 1.0);    /* bandeau gravé */
  carre(0.62, 3.62, 4.02, pierre, pierre, 1.0);      /* dé de la statue */
  var rd=droiteDe([nx,0,nz]);
  var ic=P(0,0.71), tp=texPlaque(['A DENFERT-ROCHEREAU'],'#cfc7b4');
  var hp=0.19, lp=Math.min(0.64, hp*tp.width/tp.height/2);
  var ig=[ic[0]-rd[0]*lp, ic[1]-rd[2]*lp], id=[ic[0]+rd[0]*lp, ic[1]+rd[2]*lp];
  panneauImage([ig[0],sol+3.40,ig[1]],[id[0],sol+3.40,id[1]],
          [id[0],sol+3.40+hp,id[1]],[ig[0],sol+3.40+hp,ig[1]],
          [nx,0,nz], tp, {rugo:0.92});

  /* --- le lion de bronze, sur son corbeau, devant le dé ---
     C'est une réplique du Lion de Belfort de Bartholdi : couché, mais la
     poitrine soulevée et la tête haute, tournée vers le passant. Il est
     donc bâti autour d'une ligne de dos qui monte de la croupe au
     poitrail, et non d'un corps horizontal. */
  boiteQuad(BAT.taille,P(-0.95,0.95),P(0.95,0.95),P(0.95,2.05),P(-0.95,2.05),
            sol+0.86,sol+1.16,pierre,pierre,1.0);
  var ly=sol+1.16, ech=0.80;          /* 1,55 m du museau à la croupe */
  function L(u,v){ return P(0.05+u*ech, 1.42+v*ech); }
  function Y(h){ return ly+h*ech; }
  function R(r){ return r*ech; }
  /* Le corps : une seule capsule effilée de la croupe au poitrail, et non
     une file de boules — les raccords se voyaient et l'ensemble tenait du
     phoque. La crinière, large et plus claire, porte la tête haute : c'est
     elle qui fait lire le fauve de loin. */
  var Lq=L(-0.54,0), Lp=L(0.28,0), Lm=L(0.50,0.03), Lt=L(0.74,0.06);
  boule(BAT.bronze,Lq[0],Y(0.31),Lq[1],R(0.28),0.92,16,bronze);                 /* croupe */
  tube(BAT.bronze,Lq[0],Y(0.32),Lq[1],Lp[0],Y(0.44),Lp[1],R(0.26),R(0.29),16,bronze,false,false);
  boule(BAT.bronze,Lp[0],Y(0.48),Lp[1],R(0.29),1.02,16,bronze);                 /* poitrail */
  boule(BAT.bronze,Lm[0],Y(0.68),Lm[1],R(0.38),1.04,18,bronzeC);                /* crinière */
  boule(BAT.bronze,Lm[0],Y(0.44),Lm[1],R(0.30),0.85,16,bronzeC);                /* le poitrail sous la crinière */
  boule(BAT.bronze,Lt[0],Y(0.82),Lt[1],R(0.20),1.00,16,bronze);                 /* tête */
  var Lmu=L(0.92,0.07);
  tube(BAT.bronze,Lt[0],Y(0.80),Lt[1],Lmu[0],Y(0.74),Lmu[1],R(0.135),R(0.095),12,bronze,false,true);
  [-1,1].forEach(function(c){                                                    /* oreilles */
    var o=L(0.60,c*0.12);
    boule(BAT.bronze,o[0],Y(0.97),o[1],R(0.065),1.0,8,bronzeC);
  });
  [-1,1].forEach(function(c){
    var e0=L(0.32,c*0.15), e1=L(0.92,c*0.16), e2=L(1.02,c*0.16);
    tube(BAT.bronze,e0[0],Y(0.30),e0[1],e1[0],Y(0.08),e1[1],R(0.09),R(0.07),12,bronze,false,true);
    boule(BAT.bronze,e2[0],Y(0.075),e2[1],R(0.10),0.70,10,bronze);              /* patte avant */
    var a0=L(-0.46,c*0.20), a1=L(-0.14,c*0.25);
    tube(BAT.bronze,a0[0],Y(0.26),a0[1],a1[0],Y(0.11),a1[1],R(0.115),R(0.09),12,bronze,false,true);
  });
  var t0=L(-0.68,0.04), t1=L(-0.60,-0.30), t2=L(-0.32,-0.36);
  tube(BAT.bronze,t0[0],Y(0.30),t0[1],t1[0],Y(0.14),t1[1],R(0.06),R(0.045),8,bronze,false,false);
  tube(BAT.bronze,t1[0],Y(0.14),t1[1],t2[0],Y(0.11),t2[1],R(0.045),R(0.035),8,bronze,false,true);
  var pal=L(1.06,0);
  boule(BAT.bronze,pal[0],Y(0.05),pal[1],R(0.23),0.11,10,bronzeC);              /* la palme */

  /* --- le soldat : capote longue, képi, bras croisés, épée levée ---
     La sculpture de Baujault le montre en uniforme, les bras croisés sur
     la poitrine, l'épée tenue droite le long du corps et, dans l'autre
     main, la lettre du général prussien Treskow. C'est cette pose, et non
     un fusil à la bretelle, qui fait reconnaître le monument. */
  var sy=sol+4.02, sx=mx, sz=mz;
  [-1,1].forEach(function(c){                                                   /* brodequins */
    var b=P(c*0.15,0.02);
    boiteQuad(BAT.bronze,
      [b[0]-ux*0.09+nx*0.15, b[1]-uz*0.09+nz*0.15],
      [b[0]+ux*0.09+nx*0.15, b[1]+uz*0.09+nz*0.15],
      [b[0]+ux*0.09-nx*0.13, b[1]+uz*0.09-nz*0.13],
      [b[0]-ux*0.09-nx*0.13, b[1]-uz*0.09-nz*0.13],
      sy,sy+0.13,bronze,bronze,0.6);
  });
  /* la capote : évasée du bas, resserrée à la taille, avec le pli du
     devant marqué par une arête un peu saillante */
  /* La capote tombe droit, à peine évasée : en cône marqué, la statue
     prenait l'allure d'un pion d'échecs. */
  tube(BAT.bronze,sx,sy+0.09,sz,sx,sy+0.70,sz,0.345,0.325,16,bronze,true,false);
  tube(BAT.bronze,sx,sy+0.70,sz,sx,sy+1.14,sz,0.325,0.295,16,bronze,false,false);
  var pli=P(0,0.29);
  tube(BAT.bronze,pli[0],sy+0.12,pli[1],pli[0],sy+1.10,pli[1],0.05,0.042,8,bronzeC,false,false);
  var cei=P(0,0);
  tube(BAT.bronze,cei[0],sy+1.14,cei[1],cei[0],sy+1.22,cei[1],0.302,0.300,16,bronzeC,false,false);/* ceinturon */
  tube(BAT.bronze,sx,sy+1.22,sz,sx,sy+1.60,sz,0.295,0.255,16,bronze,false,false);/* buste */
  boule(BAT.bronze,sx,sy+1.62,sz,0.270,0.44,16,bronze);                          /* épaules */
  /* le col relevé de la capote, puis la tête et le képi */
  tube(BAT.bronze,sx,sy+1.70,sz,sx,sy+1.84,sz,0.150,0.112,14,bronzeC,false,false);
  boule(BAT.bronze,sx,sy+1.865,sz,0.120,1.06,16,bronze);
  /* Le képi d'une seule pièce, fermé par son fond plat. J'avais posé
     par-dessus une calotte sphérique très aplatie : vue d'en bas, on n'en
     voyait que l'hémisphère inférieur, et elle sortait de part et d'autre
     de la tête comme deux ailes. */
  tube(BAT.bronze,sx,sy+1.905,sz,sx,sy+2.005,sz,0.140,0.152,16,bronzeC,false,true);
  /* Visière : une plaque mince accrochée au bas du bandeau. Posée plus
     haut, elle se détachait au-dessus du crâne quand on regarde la statue
     d'en bas — ce qu'on fait toujours, elle est à six mètres. */
  var v1=P(-0.130,0.04), v2=P(0.130,0.04), v3=P(0.110,0.195), v4=P(-0.110,0.195);
  boiteQuad(BAT.bronze,v1,v2,v3,v4,sy+1.885,sy+1.905,bronze,bronze,0.4);
  /* les bras croisés : l'avant-bras droit passe devant le gauche */
  var eD=P(0.26,0.06), mD=P(-0.13,0.25), eG=P(-0.26,0.06), mG=P(0.15,0.27);
  tube(BAT.bronze,eD[0],sy+1.55,eD[1],mD[0],sy+1.31,mD[1],0.100,0.078,10,bronze,false,true);
  tube(BAT.bronze,eG[0],sy+1.52,eG[1],mG[0],sy+1.37,mG[1],0.100,0.078,10,bronze,false,true);
  /* l'épée, tenue droite contre le flanc droit, la pointe au-dessus de
     l'épaule : c'est la ligne verticale qu'on lit sur la photo */
  var g0=P(0.30,0.22), g1=P(0.38,0.10);
  tube(BAT.bronze,g0[0],sy+1.18,g0[1],g1[0],sy+2.36,g1[1],0.030,0.013,8,bronzeC,false,true);
  boule(BAT.bronze,g0[0],sy+1.14,g0[1],0.055,1.0,8,bronzeC);                     /* pommeau */
  var gg=P(0.30,0.22), gd=P(0.30,0.22);
  tube(BAT.bronze,gg[0]-ux*0.10,sy+1.27,gg[1]-uz*0.10,gd[0]+ux*0.10,sy+1.27,gd[1]+uz*0.10,
       0.022,0.022,6,bronzeC,true,true);                                          /* garde */
  /* la lettre, tenue dans la main gauche */
  var le=P(0.14,0.31);
  boiteQuad(BAT.bronze,
    [le[0]-ux*0.10-nx*0.02, le[1]-uz*0.10-nz*0.02],
    [le[0]+ux*0.10-nx*0.02, le[1]+uz*0.10-nz*0.02],
    [le[0]+ux*0.10+nx*0.02, le[1]+uz*0.10+nz*0.02],
    [le[0]-ux*0.10+nx*0.02, le[1]-uz*0.10+nz*0.02],
    sy+1.28,sy+1.46,bronzeC,bronzeC,0.4);
  /* le paquetage à ses pieds, à gauche */
  var pq=P(-0.44,0.04);
  boiteQuad(BAT.bronze,[pq[0]-ux*0.20-nx*0.15,pq[1]-uz*0.20-nz*0.15],
            [pq[0]+ux*0.20-nx*0.15,pq[1]+uz*0.20-nz*0.15],
            [pq[0]+ux*0.20+nx*0.15,pq[1]+uz*0.20+nz*0.15],
            [pq[0]-ux*0.20+nx*0.15,pq[1]-uz*0.20+nz*0.15],
            sy,sy+0.30,bronze,bronzeC,0.6);
  boule(BAT.bronze,pq[0],sy+0.36,pq[1],0.17,0.55,10,bronzeC);
  var cq=P(-0.28,0.30);
  boule(BAT.bronze,cq[0],sy+0.14,cq[1],0.14,0.9,10,bronzeC);      /* le clairon roulé */

  /* --- bornes et chaînes --- */
  var R=4.30, NB=10, prec=null, fonte=teinte(0x4b4d4a);
  for(var b=0;b<=NB;b++){
    var ab=2*PI*b/NB;
    var p2=P(Math.cos(ab)*R, Math.sin(ab)*R);
    var s2=hauteur(p2[0],p2[1]);
    tube(BAT.taille,p2[0],s2,p2[1],p2[0],s2+0.72,p2[1],0.115,0.095,8,pierreO,false,true);
    boule(BAT.taille,p2[0],s2+0.76,p2[1],0.10,0.9,8,pierreO);
    if(prec && b>0){
      var m1=[(prec[0]*2+p2[0])/3,(prec[1]*2+p2[1])/3];
      var m2=[(prec[0]+p2[0]*2)/3,(prec[1]+p2[1]*2)/3];
      var yb=Math.min(hauteur(prec[0],prec[1]),s2)+0.58, yc2=yb-0.14;
      tube(BAT.zinc,prec[0],yb,prec[1],m1[0],yc2,m1[1],0.022,0.022,4,fonte,false,false);
      tube(BAT.zinc,m1[0],yc2,m1[1],m2[0],yc2,m2[1],0.022,0.022,4,fonte,false,false);
      tube(BAT.zinc,m2[0],yc2,m2[1],p2[0],yb,p2[1],0.022,0.022,4,fonte,false,false);
    }
    prec=p2;
  }
}

/* ---------- les enseignes relevées ----------
   Position : le point où le rayon de la photo touche le mur, et la normale
   sortante de ce mur — tous deux calculés sur les emprises OSM par
   outils/relever_batiments.js, donc pas devinés. « dec » décale le long du
   mur, « bas » donne la hauteur du bord inférieur.                       */
/* Les enseignes relevées sur les photos de Saint-Maixent. Une autre carte
   pose les siennes dans window.CARTE_ENSEIGNES avant de charger ce fichier —
   celles du village sont fabriquées depuis les noms d'OpenStreetMap par
   outils/enseignes_depuis_osm.js, faute de photos à relever une par une. */
var ENSEIGNES=(typeof window!=='undefined' && window.CARTE_ENSEIGNES) || [
  /* Le mur touché ne fait que 9,5 m : une enseigne de 6 m y tient, mais
     celle d'à côté décalée de 9,5 m tombait au-delà du pignon et flottait
     au-dessus d'un toit. Les deux se partagent maintenant le mur. */
  {la:46.414651, lo:-0.201840, az:152, dec:1.1,  bas:3.30, l:4.8, ht:1.05,
   texte:'HUMAN', sous:'immobilier', fond:'#1b7cb0', encre:'#ffffff'},
  {la:46.414651, lo:-0.201840, az:152, dec:-3.2, bas:3.30, l:2.9, ht:0.85,
   texte:'ORPI', sous:'VINET', fond:'#f2f2ef', encre:'#14539e', encre2:'#5a6472'},
  {la:46.414825, lo:-0.201839, az:150, dec:0,    bas:6.10, l:4.0, ht:1.10,
   texte:'HOTEL', espace:true, fond:'#e9e4d6', encre:'#1b4f96'},
  {la:46.414000, lo:-0.203690, az:156, dec:0,    bas:3.55, l:5.5, ht:0.95,
   texte:'PROMAN', sous:'intérim • recrutement', fond:'#f4f4f2', encre:'#123f88', encre2:'#123f88'},
  {la:46.413495, lo:-0.205524, az:161, dec:0,    bas:3.10, l:4.6, ht:0.88,
   texte:'maison blanche', fond:'#1b1b1d', encre:'#f0efe9', police:'"Barlow",sans-serif'},
  /* la plaque gravée de la mairie */
  {la:46.413161, lo:-0.203402, az:78, dec:1.6, bas:2.70, l:1.7, ht:0.62,
   plaque:['SALONS DE','L’HÔTEL DE VILLE']},
  /* les deux panneaux de noms du mémorial */
  {la:46.412908, lo:-0.202068, az:342, dec:-1.95, bas:1.45, l:1.05, ht:3.30, noms:true},
  {la:46.412908, lo:-0.202068, az:342, dec:1.95,  bas:1.45, l:1.05, ht:3.30, noms:true}
];
function poserEnseignes(){
  ENSEIGNES.forEach(function(e){
    var a=e.az*PI/180, n=[Math.sin(a),0,-Math.cos(a)];
    var rd=droiteDe(n);
    var x=pX(e.lo)+rd[0]*(e.dec||0)+n[0]*0.07, z=pZ(e.la)+rd[2]*(e.dec||0)+n[2]*0.07;
    var sol=hauteur(x,z);
    var A=[x-rd[0]*e.l/2, sol+e.bas, z-rd[2]*e.l/2];
    var B=[x+rd[0]*e.l/2, sol+e.bas, z+rd[2]*e.l/2];
    var C=[B[0], sol+e.bas+e.ht, B[2]];
    var Dd=[A[0], sol+e.bas+e.ht, A[2]];
    var nx=n[0], nz=n[2];
    var toileE=e.noms?texListeNoms():(e.plaque?texPlaque(e.plaque):texEnseigne(e));
    /* Une plaque gravée doit garder le rapport de sa toile, sinon les
       lettres s'étirent : la toile est maintenant taillée à la mesure du
       texte, et le panneau se règle sur elle. */
    if(e.plaque||e.noms){
      var rr=toileE.width/toileE.height, lE=e.l, hE=e.ht;
      if(lE/hE>rr) lE=hE*rr; else hE=lE/rr;
      A=[x-rd[0]*lE/2, sol+e.bas, z-rd[2]*lE/2];
      B=[x+rd[0]*lE/2, sol+e.bas, z+rd[2]*lE/2];
      C=[B[0], sol+e.bas+hE, B[2]];
      Dd=[A[0], sol+e.bas+hE, A[2]];
    }
    panneauImage(A,B,C,Dd,[nx,0,nz],toileE,{rugo:(e.noms||e.plaque)?0.92:0.55});
  });
}

/* les enseignes sont posées après les bâtiments : elles portent chacune sa
   propre image, donc son propre maillage */
(function(){
  for(var i=0;i<ETAPES.length;i++) if(ETAPES[i][1]===etapeBatisRiche){
    ETAPES.splice(i+1,0,['Monuments et enseignes relevés en photo',function(){
      try{ poserEnseignes(); }catch(e){ console.warn('enseignes :',e); }
    }]);
    break;
  }
})();

})();
