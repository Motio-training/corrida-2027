# -*- coding: utf-8 -*-
"""Relever la mélodie d'un chant enregistré.

   Pourquoi pas outils/melodie_depuis_audio.js, qui existe déjà : ce dernier
   suit une autocorrélation, et se trompe d'octave sur un chœur. Le fichier
   « Jeune chef » que j'ai reçu est un chœur d'hommes a cappella coupé sous
   120 Hz : le fondamental y est affaibli, donc la plus forte composante du
   spectre est une harmonique, et tout détecteur qui suit le pic le plus fort
   lit une quinte ou une octave trop haut. Le relevé obtenu ainsi donnait
   trois octaves d'étendue et 63 % de silence — inutilisable.

   La méthode d'ici, en trois temps :

   1. *saillance harmonique* — pour chaque demi-ton candidat, on somme
      l'amplitude de ses dix premières harmoniques. Un fondamental absent ne
      fait plus disparaître le candidat, ses harmoniques le portent ;
   2. *Viterbi* — un chemin de hauteur continu sur toute la durée, avec un
      coût proportionnel au saut. Aucune voix ne change d'octave d'une trame
      à l'autre : le coût l'interdit, et c'est là que se corrigent les
      octaves ;
   3. *découpe* aux changements de hauteur et aux attaques (flux spectral),
      puis recalage sur la gamme de la tonalité trouvée.

   Et une épreuve, parce qu'un relevé qu'on ne peut pas contrôler ne vaut
   rien : on compare la suite de notes au chromagramme du fichier — calculé
   directement sur le spectre, donc indépendant de tout ce qui précède —
   contre ses onze transpositions et contre un mélange de ses propres notes.
   Le relevé doit battre les douze. Sur « Jeune chef » : 9,3 écarts-types.

   Usage :
     pip install numpy soundfile
     python3 outils/melodie_depuis_chant.py chant.mp3
     python3 outils/melodie_depuis_chant.py chant.mp3 --de 36.7 --a 67.5 \
             --octave 12 --tempo 112

   Options :
     --de, --a      la portion à mettre en partition (secondes) ; par défaut
                    tout le fichier
     --octave       transposition en demi-tons de la partition écrite (12
                    pour monter d'une octave : le registre de la puce)
     --tempo        impose le tempo au lieu de le mesurer
     --bas, --haut  les bornes de la recherche de hauteur, en notes
     --mesure       la longueur d'une mesure en doubles croches (16 = 4/4)
     --structure    cherche la période de répétition du morceau
   """
import sys, os, re, json
import numpy as np

NOMS=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
DEMI={n:i for i,n in enumerate(NOMS)}
DEMI.update({'Db':1,'Eb':3,'Gb':6,'Ab':8,'Bb':10})
def nom(m):  m=int(round(m)); return NOMS[m%12]+str(m//12-1)
def frq(m):  return 440.0*2**((m-69)/12.0)
def midi(n):
    x=re.match(r'([A-G][#b]?)(-?\d)',n)
    return (int(x.group(2))+1)*12+DEMI[x.group(1)]

SR=22050          # la mélodie vit sous 1 kHz ; inutile de garder mieux
WIN=4096          # 186 ms : assez fin en fréquence pour un grave de 150 Hz
WINF=1024         # 46 ms : le flux a besoin de temps court, pas de finesse en
                  #         fréquence — sur 186 ms une attaque s'étale et les
                  #         syllabes répétées ne se séparent plus
HOP=512           # 23 ms
HARM=10

# --------------------------------------------------------------- la lecture
def lire_audio(chemin):
    import soundfile as sf
    d,sr=sf.read(chemin, dtype='float32', always_2d=True)
    x=d.mean(axis=1)
    if sr!=SR:                       # rééchantillonnage linéaire, suffisant ici
        n=int(len(x)*SR/sr)
        x=np.interp(np.arange(n)*sr/SR, np.arange(len(x)), x).astype(np.float32)
    return x, len(d)/sr

# ------------------------------------------------- saillance et flux, en un passage
def analyser(x, bas, haut):
    w=np.hanning(WIN).astype(np.float32)
    n=(len(x)-WIN)//HOP
    M=haut-bas+1
    f=np.arange(WIN//2+1)*SR/WIN
    bornes=np.zeros((M,HARM,2),dtype=np.int32)
    for j,m in enumerate(range(bas,haut+1)):
        for h in range(1,HARM+1):
            fh=frq(m)*h
            lo,hi=fh*2**(-0.25/12), fh*2**(0.25/12)
            i0=max(0,min(int(np.floor(lo/SR*WIN)), len(f)-1))
            i1=max(i0+1,min(int(np.ceil(hi/SR*WIN))+1, len(f)))
            bornes[j,h-1]=(i0,i1)
    A=np.zeros((n,M,HARM),dtype=np.float32)
    R=np.zeros(n,dtype=np.float32)
    C=np.zeros((n,12),dtype=np.float32)
    pc=np.full(len(f),-1,dtype=int)
    ok=(f>140)&(f<1400)
    pc[ok]=np.round(12*np.log2(f[ok]/440)+69).astype(int)%12
    for k in range(n):
        seg=x[k*HOP:k*HOP+WIN]*w
        R[k]=np.sqrt((seg**2).mean())
        mag=np.abs(np.fft.rfft(seg)).astype(np.float32)
        for c in range(12): C[k,c]=mag[pc==c].sum()
        mag/=(mag.max()+1e-9)
        for j in range(M):
            for h in range(HARM):
                i0,i1=bornes[j,h]
                A[k,j,h]=mag[i0:i1].max()
    C/=(C.sum(axis=1,keepdims=True)+1e-9)
    return A,R,flux_court(x,n),C

def flux_court(x,n):
    """flux spectral sur fenêtre courte : la dérivée positive du spectre,
       bornée aux fréquences de la voix. C'est ce qui marque les syllabes."""
    w=np.hanning(WINF).astype(np.float32)
    f=np.arange(WINF//2+1)*SR/WINF
    bande=(f>110)&(f<2500)
    flux=np.zeros(n,dtype=np.float32)
    prec=None
    for k in range(n):
        a=k*HOP
        if a+WINF>len(x): break
        mag=np.abs(np.fft.rfft(x[a:a+WINF]*w)).astype(np.float32)[bande]
        if prec is not None: flux[k]=np.maximum(mag-prec,0).sum()
        prec=mag
    if flux.max()>0: flux/=flux.max()
    return flux

def chemin(A, alpha=1.0):
    """Viterbi : l'émission est la saillance harmonique normalisée, la
       transition coûte le saut. C'est la correction d'octave."""
    poids=np.array([0.55]+[0.9**h for h in range(1,A.shape[2])],dtype=np.float32)
    S=(A*poids).sum(axis=2)
    E=np.log(0.05+S/(S.max(axis=1,keepdims=True)+1e-9))
    n,M=E.shape
    d=np.abs(np.arange(M)[:,None]-np.arange(M)[None,:]).astype(np.float32)
    T=-alpha*d
    D=np.empty((n,M),dtype=np.float32); B=np.zeros((n,M),dtype=np.int32)
    D[0]=E[0]
    for k in range(1,n):
        c=D[k-1][:,None]+T
        B[k]=c.argmax(axis=0); D[k]=c.max(axis=0)+E[k]
    p=np.zeros(n,dtype=np.int32); p[-1]=int(D[-1].argmax())
    for k in range(n-1,0,-1): p[k-1]=B[k,p[k]]
    return p

def attaques(flux, part=0.5, espace=0.20):
    """les pics du flux spectral, au-dessus d'une moyenne glissante"""
    L=13
    mm=np.convolve(flux,np.ones(L)/L,mode='same')
    brut=[]
    for k in range(2,len(flux)-2):
        if flux[k]>mm[k]*1.35+0.012 and flux[k]==flux[max(0,k-3):k+4].max():
            brut.append(k)
    if not brut: return np.array([],dtype=int)
    brut=np.array(brut)
    lim=np.quantile(flux[brut],part)
    gard=[]
    for k in brut:
        if flux[k]<lim: continue
        if gard and (k-gard[-1])*HOP/SR<espace:
            if flux[k]>flux[gard[-1]]: gard[-1]=k
            continue
        gard.append(k)
    return np.array(gard,dtype=int)

def decouper(p, v, R, onsets, mindur=0.11):
    hop=HOP/SR
    n=len(p)
    front=np.zeros(n,bool); front[0]=True
    front[1:]|=(p[1:]!=p[:-1]); front[1:]|=(v[1:]&~v[:-1])
    for k in onsets:
        if k<n: front[k]=True
    out=[]; k=0
    while k<n:
        if not v[k]: k+=1; continue
        j=k
        while j+1<n and v[j+1] and not front[j+1] and p[j+1]==p[k]: j+=1
        d=(j-k+1)*hop
        if d>=mindur: out.append({'midi':int(p[k]),'t':k*hop,'d':d})
        k=j+1
    return out

# -------------------------------------------------------------- la tonalité
MAJ=np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
MIN=np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
GAMME_MAJ=[0,2,4,5,7,9,11]
GAMME_MIN=[0,2,3,5,7,8,10]
def tonalite(N):
    h=np.zeros(12)
    for x in N: h[x['midi']%12]+=x['d']
    if h.sum()==0: return None
    h/=h.sum()
    def corr(a,b):
        a=a-a.mean(); b=b-b.mean()
        return float((a*b).sum()/np.sqrt((a*a).sum()*(b*b).sum()+1e-12))
    res=[]
    for t in range(12):
        res.append((corr(h,np.roll(MAJ,t)), t, 'majeur'))
        res.append((corr(h,np.roll(MIN,t)), t, 'mineur'))
    res.sort(reverse=True)
    return res

def recaler(N, tonique, mode):
    cl=[(tonique+d)%12 for d in (GAMME_MAJ if mode=='majeur' else GAMME_MIN)]
    ch=0
    for x in N:
        if x['midi']%12 in cl: continue
        for d in (1,-1,2,-2):
            if (x['midi']+d)%12 in cl:
                x['midi']+=d; ch+=1; break
    return ch,cl

# ------------------------------------------------------------------ le tempo
def tempo_global(flux):
    f=flux-flux.mean()
    ac=np.correlate(f,f,'full')[len(f)-1:]
    if ac[0]!=0: ac=ac/ac[0]
    lags=np.arange(len(ac))*HOP/SR
    m=(lags>0.40)&(lags<0.70)
    if not m.any(): return 0.5357
    return float(lags[m][int(np.argmax(ac[m]))])

def tempo_local(onsets, t, fen=6.0, Tmin=0.42, Tmax=0.66):
    o=onsets*HOP/SR
    m=o[(o>t-fen)&(o<t+fen)]
    if len(m)<6: return None
    iv=np.diff(m); iv=iv[(iv>0.09)&(iv<0.9)]
    if len(iv)<4: return None
    best=None
    for T in np.arange(Tmin,Tmax,0.002):
        r=np.abs(iv/(T/2)-np.round(iv/(T/2)))
        s=float(np.exp(-(r/0.2)**2).sum())
        if best is None or s>best[0]: best=(s,T)
    return best[1]

# ------------------------------------------------------------ la partition
VALEURS=[1,2,3,4,6,8]
def partition(N, onsets, T0, octave=0, coupe=2.0, mesure=16, souffle=8):
    """« NOTE/durée » en doubles croches. Les durées sont calées sur la
       valeur la plus proche ; la respiration entre deux phrases est allongée
       de ce qu'il faut pour finir la mesure. La boucle tombe ainsi sur un
       nombre entier de mesures — sans quoi elle se rebouclerait au milieu
       d'une mesure — et les notes, elles, ne sont pas retouchées."""
    phr=[[]]
    for i,y in enumerate(N):
        T=tempo_local(onsets,y['t']) or T0
        pas=T/4.0
        if i:
            pr=N[i-1]
            if (y['t']-(pr['t']+pr['d']))/pas>=coupe: phr.append([])
        d=min(VALEURS,key=lambda a:abs(a-y['d']/pas))
        phr[-1].append((nom(y['midi']+octave), d))
    phr=[p for p in phr if p]
    lignes=[]
    for p in phr:
        s=sum(d for _,d in p)
        rep=(-s)%souffle or souffle//2
        lignes.append((p,rep))
    # la boucle doit tomber sur un nombre entier de mesures, sinon elle se
    # reboucle au milieu d'une mesure et la batterie se décale. On allonge
    # pour cela la dernière respiration, celle qui précède la reprise.
    total=sum(sum(d for _,d in p)+r for p,r in lignes)
    manque=(-total)%mesure
    if manque:
        p,r=lignes[-1]; lignes[-1]=(p,r+manque)
    return [" ".join("%s/%d"%(n,d) for n,d in p)+" -/%d"%r for p,r in lignes]

# --------------------------------------------------- l'accompagnement
#   Un chœur a cappella n'a ni basse ni batterie : il faut les déduire. Pour
#   chaque mesure on cherche l'accord du ton qui contient le mieux les notes
#   de la mélodie, avec une préférence pour la tonique et la dominante — sans
#   quoi le moindre passage ambigu part sur un accord exotique.
DEGRES=[(0,'majeur',1.12),(5,'majeur',1.00),(7,'majeur',1.06),
        (9,'mineur',0.98),(2,'mineur',0.95),(4,'mineur',0.92)]
def accords(lignes, tonique, mesure=16):
    jet=[]
    for l in lignes: jet.extend(l.split())
    pas=0; mes=[]
    for t in jet:
        n,d=t.split('/'); d=int(d)
        for k in range(d):
            i=(pas+k)//mesure
            while len(mes)<=i: mes.append([])
            if n!='-': mes[i].append(midi(n)%12)
        pas+=d
    plan=[]
    for cl in mes:
        if not cl: plan.append(plan[-1] if plan else (tonique,'majeur')); continue
        h=np.bincount(cl,minlength=12)/len(cl)
        best=None
        for d,mode,pref in DEGRES:
            r=(tonique+d)%12
            notes=[r,(r+(4 if mode=='majeur' else 3))%12,(r+7)%12]
            sc=sum(h[x] for x in notes)*pref
            if best is None or sc>best[0]: best=(sc,r,mode)
        plan.append((best[1],best[2]))
    return plan

def voies(plan, mesure=16, basse=(38,49), contre=(48,62)):
    """basse : fondamentale et quinte en alternance, au pas ;
       contrechant : tierce et quinte sur les temps faibles. Chaque voix est
       placée dans sa propre fenêtre de hauteur — le contrechant sous le
       chant, la basse sous le contrechant — pour qu'aucune ne masque la
       mélodie."""
    def dans(classe, borne):
        lo,hi=borne
        m=lo+((classe-lo)%12)
        return m if m<=hi else m-12
    b=[]; h=[]
    temps=mesure//4
    for r,mode in plan:
        fond=dans(r,basse)
        quin=fond-5 if fond-5>=basse[0] else fond+7
        tie=dans((r+(4 if mode=='majeur' else 3))%12, contre)
        cin=dans((r+7)%12, contre)
        if cin<tie and cin+12<=contre[1]: cin+=12      # la quinte au-dessus de la tierce
        b.append(("%s/%d %s/%d "%(nom(fond),temps,nom(quin),temps))*2)
        h.append(("-/%d %s/%d %s/%d "%(temps,nom(tie),temps//2,nom(cin),temps//2))*2)
    return [" ".join(x.split()) for x in b], [" ".join(x.split()) for x in h]

# ------------------------------------------------------------- l'épreuve
def epreuve(N, C, graine=3):
    """Le relevé colle-t-il au chromagramme mieux que ses transpositions et
       qu'un mélange de ses propres notes ?"""
    hop=HOP/SR; n=len(C)
    def masque(dec, ordre=None):
        M=np.zeros((n,12),dtype=np.float32)
        for i,y in enumerate(N):
            a=int(y['t']/hop); b=min(n,int((y['t']+y['d'])/hop))
            if b<=a: continue
            m=N[ordre[i]]['midi'] if ordre is not None else y['midi']
            M[a:b,(m+dec)%12]=1
        return M
    base=masque(0); dans=base.sum(axis=1)>0
    if dans.sum()<50: return None
    def score(M): return float((C[dans]*M[dans]).sum()/dans.sum())
    s=[score(masque(d)) for d in range(12)]
    rng=np.random.default_rng(graine)
    mel=[score(masque(0,rng.permutation(len(N)))) for _ in range(40)]
    mu,sg=float(np.mean(mel)),float(np.std(mel)+1e-9)
    return {'releve':s[0], 'transpositions':s[1:], 'melange':(mu,sg),
            'sigma':(s[0]-mu)/sg, 'rang':1+sum(1 for v in s[1:] if v>s[0])}

def structure(p, R, v):
    """la période de répétition : couplet + refrain, s'il y en a"""
    hop=HOP/SR; pas=max(1,int(round(0.05/hop))); n=len(p)//pas
    q=np.full(n,-1)
    for k in range(n):
        s=p[k*pas:(k+1)*pas]; vv=v[k*pas:(k+1)*pas]
        if vv.mean()>0.5: q[k]=np.bincount(s[vv]-s[vv].min()).argmax()+s[vv].min()
    best=[]
    for lag in range(int(3/0.05), max(int(3/0.05)+1,n//2)):
        a,b=q[:-lag],q[lag:]
        m=(a>0)&(b>0)
        if m.sum()<20: continue
        best.append((float((a[m]==b[m]).mean()*np.sqrt(m.mean())), lag*0.05))
    best.sort(reverse=True)
    return best[:5]

# ------------------------------------------------------------------- main
def main():
    a=sys.argv[1:]
    if not a or a[0].startswith('--'):
        print(__doc__); return 1
    fich=a[0]
    def opt(n,d=None):
        return a[a.index('--'+n)+1] if '--'+n in a else d
    bas=midi(opt('bas','C3')); haut=midi(opt('haut','C5'))
    octave=int(opt('octave',0))
    x,duree=lire_audio(fich)
    print("%s : %.1f s, analysé à %d Hz entre %s et %s"%(
        os.path.basename(fich),duree,SR,nom(bas),nom(haut)))
    A,R,flux,C=analyser(x,bas,haut)
    hop=HOP/SR
    med=np.median(R[R>0]) if (R>0).any() else 0
    v=R>max(0.10*R.max(),0.30*med)
    p=chemin(A)+bas
    on=attaques(flux)
    N=decouper(p,v,R,on)
    print("  %d trames, %.0f%% sonores | %d attaques | %d notes"%(len(p),100*v.mean(),len(on),len(N)))
    res=tonalite(N)
    ton,mode=res[0][1],res[0][2]
    print("  tonalité : %s %s (%.3f ; suivante %s %s %.3f)"%(
        NOMS[ton],mode,res[0][0],NOMS[res[1][1]],res[1][2],res[1][0]))
    ch,cl=recaler(N,ton,mode)
    print("  %d notes hors gamme recalées (%d%%)"%(ch,round(100*ch/max(1,len(N)))))
    T0=float(opt('tempo',0)) and 60/float(opt('tempo')) or tempo_global(flux)
    print("  tempo : %.1f à la noire"%(60/T0))
    if '--structure' in a:
        print("  répétitions :"," ; ".join("%.1f s (%.2f)"%(l,s) for s,l in structure(p,R,v)))
    de=float(opt('de',0)); jusqu=float(opt('a',duree))
    sub=[y for y in N if de<=y['t']<jusqu]
    ep=epreuve(sub,C)
    if ep:
        print("\n  épreuve sur le chromagramme : relevé %.3f | mélange %.3f ± %.3f"%(
            ep['releve'],ep['melange'][0],ep['melange'][1]))
        print("  soit %.1f écarts-types au-dessus du hasard ; rang %d sur 12 transpositions"%(
            ep['sigma'],ep['rang']))
    mesure=int(opt('mesure',16))
    lignes=partition(sub,on,T0,octave,mesure=mesure,souffle=int(opt('souffle',8)))
    total=sum(int(t.split('/')[1]) for l in lignes for t in l.split())
    print("\n  partition : %d phrases, %d doubles croches = %.1f mesures = %.1f s"%(
        len(lignes),total,total/mesure,total*T0/4))
    print("\n  chant :")
    for l in lignes: print("    "+l)
    plan=accords(lignes,ton,mesure)
    print("\n  accords :"," ".join("%s%s"%(NOMS[r],'' if m=='majeur' else 'm') for r,m in plan))
    b,h=voies(plan,mesure)
    print("\n  basse :")
    for i in range(0,len(b),2): print("    "+"  ".join(b[i:i+2]))
    print("\n  contrechant :")
    for i in range(0,len(h),2): print("    "+"  ".join(h[i:i+2]))
    print("\n  percussion : K/2 H/2 S/2 H/2")
    return 0

if __name__=='__main__':
    sys.exit(main())
