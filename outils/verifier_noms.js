/* Deux fonctions du même nom dans code3d.js : distinguer la couche du piège.

   Le moteur est écrit en passes : une section tardive reprend une fonction
   d'une section antérieure et la redéclare, volontairement, pour la
   remplacer. Les déclarations remontent en tête de portée, la dernière
   gagne, et c'est exactement l'effet recherché — 27 noms du fichier sont
   dans ce cas, et tous vont bien.

   Le même mécanisme produit pourtant le pire défaut silencieux du projet,
   quand le nom est repris par erreur pour une fonction qui n'a rien à voir.
   C'est arrivé deux fois :

     triOriente(tas,A,B,C,NA,NB,NC,uv,col)   celle du moteur, pour les tubes
     triOriente(tas,A,B,C,n,uv,col)           la mienne, pour les toitures

     panneau(tas,cx,cy,cz,ang,larg,haut,u0,u1,col)  le feuillage des arbres
     panneau(A,B,C,D,n,toileP,opts)                  mon enseigne

   Aucune erreur levée ; dans le second cas, 5 511 géométries en NaN à
   chaque construction du monde, invisibles à Saint-Maixent parce que les
   arbres en volume se posaient par-dessus.

   Ce qui sépare les deux familles est net, et se lit sans exécuter le
   fichier : une passe qui remplace une fonction en garde la signature, ou
   l'étend d'un paramètre de plus (fenetre gagne « garde », hautBat gagne
   « type »). Aucune des 27 redéclarations légitimes ne perd de paramètre.
   Les deux collisions accidentelles, elles, en perdent : 9 → 7 et 10 → 7.
   Le contrôle échoue donc sur une redéclaration qui réduit le nombre de
   paramètres, et se contente de signaler celles qui les renomment.

   Usage : node outils/verifier_noms.js [fichier…] [--tout]              */

const fs=require('fs'), path=require('path');
const RACINE=path.resolve(__dirname,'..');
const ARG=process.argv.slice(2);
const TOUT=ARG.includes('--tout');
const FICHIERS=ARG.filter(a=>!a.startsWith('--'));
if(!FICHIERS.length) FICHIERS.push(path.join(RACINE,'actifs','code3d.js'));

let defauts=0;
for(const f of FICHIERS){
  const L=fs.readFileSync(f,'utf8').split('\n');
  /* au premier niveau : la déclaration commence en colonne zéro. Le corps du
     fichier est une IIFE dont le contenu n'est pas indenté ; toutes les
     fonctions imbriquées le sont. */
  const vus=new Map();
  L.forEach((l,i)=>{
    const m=l.match(/^function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/);
    if(!m) return;
    const params=m[2].split(',').map(s=>s.trim()).filter(Boolean);
    if(!vus.has(m[1])) vus.set(m[1],[]);
    vus.get(m[1]).push({ligne:i+1, params});
  });
  const doubles=[...vus].filter(([,l])=>l.length>1);
  console.log(path.relative(RACINE,f)+' : '+vus.size+' fonctions au premier niveau, '+
              doubles.length+' redéclarée(s)');
  const renommages=[];
  for(const [nom,versions] of doubles){
    for(let k=1;k<versions.length;k++){
      const av=versions[k-1], ap=versions[k];
      if(ap.params.length<av.params.length){
        defauts++;
        console.log('  COLLISION  '+nom+'  ligne '+av.ligne+' ('+av.params.length+
                    ' paramètres) écrasée ligne '+ap.ligne+' ('+ap.params.length+')');
        console.log('             '+av.ligne+': '+L[av.ligne-1].trim().slice(0,110));
        console.log('             '+ap.ligne+': '+L[ap.ligne-1].trim().slice(0,110));
        console.log('             une passe qui remplace garde la signature ; celle-ci perd '+
                    (av.params.length-ap.params.length)+' paramètre(s) : renommer.');
      } else {
        const communs=ap.params.filter(p=>av.params.indexOf(p)>=0).length;
        if(!communs && av.params.length) renommages.push(nom+' ('+av.ligne+' → '+ap.ligne+') : '+
          av.params.join(',')+'  →  '+ap.params.join(','));
      }
    }
  }
  if(renommages.length){
    console.log('  à l’œil (paramètres renommés, signature de même longueur) :');
    renommages.forEach(r=>console.log('    '+r));
  }
  if(TOUT) for(const [nom,versions] of doubles)
    console.log('    passe : '+nom+'  lignes '+versions.map(v=>v.ligne).join(', '));
}
if(defauts){
  console.log('=== '+defauts+' collision(s) de nom : renommer la fonction fautive ===');
  process.exit(1);
}
console.log('=== aucune collision : les redéclarations gardent leur signature ===');
