# -*- coding: utf-8 -*-
"""Lire une partition gravée en PDF, et en sortir les voix du lecteur 8 bits.

   Une partition vectorielle n'est pas une image : chaque tête de note est un
   glyphe dont on connaît la position au centième de point. La hauteur se lit
   donc à la géométrie — la distance à la ligne du bas de la portée —, et non
   à la reconnaissance de formes. Le résultat est exact ou il ne sort pas :
   chaque mesure doit tomber juste, et l'outil le dit mesure par mesure.

   Écrit pour « Jeunes Chefs » (©Partitions, Gérard Eiselé, 2023), gravure
   Finale, police Maestro, deux voix, 2/4. Le vocabulaire de glyphes est celui
   de cette gravure ; une autre police demanderait une autre table.

   Ce qu'il lit :
     - les portées (cinq traits horizontaux longs) et les barres de mesure
       (un trait vertical qui va d'une ligne extrême à l'autre — une hampe de
       note, elle, s'arrête avant) ;
     - les têtes de note, dont la position verticale donne le degré, et la
       taille la voix : la grande est la seconde voix, la petite la mélodie ;
     - les drapeaux (croche), à droite de la tête si la hampe monte, à
       l'aplomb si elle descend, et les points d'augmentation ;
     - les silences, noire et croche ;
     - les chiffrages d'accord, texte au-dessus de la portée, d'où vient la
       basse.

   Usage :
     pip install pymupdf
     python3 outils/partition_depuis_pdf.py partition.pdf
     python3 outils/partition_depuis_pdf.py partition.pdf --mesures   # détail
"""
import sys, os
try:
    import pymupdf
except ImportError:
    import fitz as pymupdf

LETTRES='CDEFGAB'
DEGRE={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
NOMS=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nom(m): return NOMS[m%12]+str(m//12-1)

# la portée en clé de sol : ligne du bas = mi4 écrit
def hauteur(pos):
    i=LETTRES.index('E')+pos
    return DEGRE[LETTRES[i%7]]+12*(4+i//7+1)

def glyphes(pg):
    out=[]
    for b in pg.get_text("rawdict")['blocks']:
        for l in b.get('lines',[]):
            for s in l['spans']:
                for c in s['chars']:
                    out.append({'c':c['c'],'x':c['origin'][0],'y':c['origin'][1],
                                'taille':round(s['size'],1),
                                'mus':s['font'].startswith('Maestro'),
                                'x1':c['bbox'][2]})
    return out

def portees(pg):
    h=[]
    for it in pg.get_drawings():
        for x in it['items']:
            if x[0]=='l':
                a,b=x[1],x[2]
                if abs(a.y-b.y)<0.3 and abs(a.x-b.x)>100: h.append(round(a.y,2))
            elif x[0]=='re':
                r=x[1]
                if r.height<1.5 and r.width>100: h.append(round(r.y0,2))
    h=sorted(set(h)); out=[]; cur=[h[0]]
    for y in h[1:]:
        if y-cur[-1]<8: cur.append(y)
        else: out.append(cur); cur=[y]
    out.append(cur)
    return [s for s in out if len(s)==5]

def barres(pg,y0,y1):
    """une barre de mesure joint les deux lignes extrêmes ; une hampe, non."""
    v=[]
    for it in pg.get_drawings():
        for x in it['items']:
            if x[0]=='l':
                a,b=x[1],x[2]
                ya,yb=min(a.y,b.y),max(a.y,b.y)
                if abs(a.x-b.x)<0.5 and abs(ya-y0)<1.2 and abs(yb-y1)<1.2: v.append(round(a.x,1))
            elif x[0]=='re':
                r=x[1]
                if r.width<3.5 and abs(r.y0-y0)<1.2 and abs(r.y1-y1)<1.2: v.append(round(r.x0,1))
    v=sorted(set(v)); out=[]
    for x in v:
        if out and x-out[-1]<4: out[-1]=x; continue     # barre de reprise : deux traits
        out.append(x)
    return out

def accords_texte(pg,gl,y0):
    """les chiffrages, texte juste au-dessus de la portée"""
    h=sorted([g for g in gl if not g['mus'] and y0-22<g['y']<y0-1], key=lambda g:g['x'])
    mots=[]
    for g in h:
        if mots and g['x']-mots[-1][2]<4.5:
            mots[-1][0]+=g['c']; mots[-1][2]=g['x1']
        else: mots.append([g['c'],g['x'],g['x1']])
    return [(m[0],m[1]) for m in mots if m[0][0] in 'ABCDEFG' and len(m[0])<=3]

def lire_systeme(pg,lignes,gl):
    y0,y1=lignes[0],lignes[4]
    demi=(lignes[1]-lignes[0])/2.0
    bar=barres(pg,y0,y1)
    acc=accords_texte(pg,gl,y0)
    dd=[g for g in gl if g['mus'] and y0-38<g['y']<y1+38]
    notes=sorted([g for g in dd if g['c']=='œ'], key=lambda g:g['x'])
    flags=[g for g in dd if g['c'] in ('ι','Ι')]
    points=[g for g in dd if g['c']=='−']
    ev=[]
    for g in notes:
        p=round((y1-g['y'])/demi)
        if ev and ev[-1]['type']=='note' and g['x']-ev[-1]['x']<3.2: ev[-1]['pos'].append(p)
        else: ev.append({'x':g['x'],'type':'note','pos':[p],'duree':4})
    for a in [e for e in ev if e['type']=='note']:
        if any((3.5<f['x']-a['x']<10.5) if f['c']=='ι' else (abs(f['x']-a['x'])<1.5) for f in flags):
            a['duree']=2
        if any(0<p['x']-a['x']<13 for p in points): a['duree']=int(a['duree']*1.5)
    ev+=[{'x':g['x'],'type':'silence','duree':4} for g in dd if g['c']=='Œ']
    ev+=[{'x':g['x'],'type':'silence','duree':2} for g in dd if g['c']=='‰']
    ev.sort(key=lambda e:e['x'])
    mes=[]; cur=[]; bi=0; ai=0; ch=None
    for e in ev:
        while bi<len(bar) and e['x']>bar[bi]:
            if cur: mes.append((cur,ch))
            cur=[]; bi+=1
        while ai<len(acc) and acc[ai][1]<=e['x']+6: ch=acc[ai][0]; ai+=1
        cur.append(e)
    if cur: mes.append((cur,ch))
    return mes

def mesures(chemin):
    d=pymupdf.open(chemin)
    out=[]
    for pg in d:
        gl=glyphes(pg)
        for lignes in portees(pg):
            out.extend(lire_systeme(pg,lignes,gl))
    return out

# ------------------------------------------------------------- les voix
def dans(classe,lo,hi):
    m=lo+((classe-lo)%12)
    return m if m<=hi else m-12
ACCORDS={'C':0,'Dm':2,'D':2,'Em':4,'F':5,'G':7,'G7':7,'Am':9,'Bb':10,'A':9,'E':4}

def voix(mes, octave=0, basse=(36,47)):
    """lead = voix du haut, harmonie = voix du bas (unisson si une seule tête),
       basse = fondamentale puis quinte, un temps chacune."""
    lead=[]; harm=[]; bas=[]
    for m,ch in mes:
        long=0
        for e in m:
            if e['type']=='silence':
                lead.append('-/%d'%e['duree']); harm.append('-/%d'%e['duree'])
            else:
                p=sorted(e['pos'],reverse=True)
                lead.append('%s/%d'%(nom(hauteur(p[0])+octave),e['duree']))
                harm.append('%s/%d'%(nom(hauteur(p[-1])+octave),e['duree']))
            long+=e['duree']
        r=ACCORDS.get(ch,0)
        f=dans(r,*basse)
        bas.append('%s/%d %s/%d'%(nom(f),long//2,nom(f+7),long-long//2))
    return lead,harm,bas

def main():
    a=sys.argv[1:]
    if not a: print(__doc__); return 1
    mes=mesures(a[0])
    faux=[(i+1,sum(e['duree'] for e in m)) for i,(m,ch) in enumerate(mes) if sum(e['duree'] for e in m)!=8]
    print("%s : %d mesures"%(os.path.basename(a[0]),len(mes)))
    print("  mesures justes : %d sur %d%s"%(len(mes)-len(faux),len(mes),
          '' if not faux else '  <<< '+str(faux)))
    lead,harm,bas=voix(mes)
    n=sum(int(t.split('/')[1]) for t in lead)
    print("  %d doubles croches = %.1f s à 88 à la noire"%(n,n*(60/88)/4))
    h=[t for t in lead if not t.startswith('-')]
    print("  mélodie : %d notes, %s..%s"%(len(h),
        min(h,key=lambda t:etendue(t)).split('/')[0], max(h,key=lambda t:etendue(t)).split('/')[0]))
    if '--mesures' in a:
        for i,(m,ch) in enumerate(mes):
            print("   m%-3d %-6s %s"%(i+1,ch or '',
                " ".join(('-/%d'%e['duree']) if e['type']=='silence'
                          else '[%s]/%d'%('+'.join(nom(hauteur(p)) for p in sorted(e['pos'],reverse=True)),e['duree'])
                         for e in m)))
    for lab,v in (('lead',lead),('harmonie',harm),('basse',bas)):
        print("\n  %s :"%lab)
        par=8 if lab!='basse' else 4
        # une ligne par groupe de mesures
        i=0; ligne=[]; cpt=0
        if lab=='basse':
            for j in range(0,len(v),4): print("    "+"  ".join(v[j:j+4]))
        else:
            pas=0; cour=[]
            for t in v:
                cour.append(t); pas+=int(t.split('/')[1])
                if pas%32==0: print("    "+" ".join(cour)); cour=[]
            if cour: print("    "+" ".join(cour))
    print("\n  percussion : K/2 H/2 S/2 H/2   (2/4 : grosse caisse au 1, caisse claire au 2)")
    return 0

def etendue(t):
    n=t.split('/')[0]
    import re
    m=re.match(r'([A-G]#?)(-?\d)',n)
    return (int(m.group(2))+1)*12+DEGRE[m.group(1)[0]]+(1 if '#' in n else 0)

if __name__=='__main__':
    sys.exit(main())
