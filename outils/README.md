# Outils du relevé photo

## `plan_prises_de_vue.js`

Calcule ce que le coureur voit réellement du parcours, et où il faut se placer
pour le photographier.

```sh
node outils/plan_prises_de_vue.js
```

Lit les données de `index.html` (emprises OSM du bloc `d-bats`, tracé et
jalonneurs de `window.ETAT_EMBARQUE`), lance des rayons depuis le tracé tous
les 6 m sur un champ de 150°, et retient la première façade touchée par chaque
rayon. Chaque bâtiment reçoit une *exposition* — les degrés qu'il occupe dans
le champ de vision, multipliés par les mètres pendant lesquels il les occupe.
Puis, pour chaque façade retenue, le script cherche le point du tracé d'où elle
se photographie le mieux : vue de face, sans rien devant, ni trop près ni trop
loin.

Écrit deux fichiers :

- `outils/plan_prises_de_vue.json` — tout, pour le travail sur la 3D ;
- `releve/plan.json` — la version embarquée sur le téléphone, réduite aux
  champs dont l'application de relevé a besoin.

**À relancer quand le tracé ou les jalonneurs changent**, sinon le relevé
guide vers des points qui ne sont plus sur le parcours.

Les emprises viennent d'OpenStreetMap (ODbL), comme le reste de la carte.

## `rendre_vues.js`

Fabrique les vignettes 3D que le relevé montre sur le terrain.

```sh
node outils/rendre_vues.js            # tout le plan (656 vues, ~1 h 30)
node outils/rendre_vues.js --lot      # seulement le lot de validation (31 vues)
node outils/rendre_vues.js --index    # réécrit seulement vues/index.json
node outils/rendre_vues.js --refaire  # réécrit les vues déjà rendues
```

Ouvre la page dans un Chromium sans écran (rendu logiciel SwiftShader,
aucune carte graphique nécessaire), construit le monde une fois — environ
40 s —, puis saute de point en point avec les deux fonctions ajoutées au
module 3D :

- `ESPACE3D.vueDepuis({la, lo, az, champ, pitch})` — pose la caméra à la
  première personne au point et dans la direction donnés, avec un champ
  horizontal en degrés. Révèle immédiatement les quartiers autour du nouveau
  point au lieu d'attendre le prochain tour de boucle, et fige la qualité
  pour que toutes les vues se ressemblent.
- `ESPACE3D.cliche(qualité)` — dessine et renvoie l'image en JPEG.
- `ESPACE3D.etat()` — où est la caméra et ce qui est affiché, pour vérifier.

Rien dans l'interface n'appelle ces fonctions : l'usage normal de la 3D
n'est pas touché.

Les vues déjà présentes sont sautées, donc un long rendu se reprend après
une interruption. **À relancer avec `--refaire` quand la 3D change** — c'est
tout l'intérêt : les vignettes doivent montrer l'état courant de la 3D.

## `rendre_carte.js`

Produit `releve/carte.json` (142 Ko) : rues, cours d'eau et emprises de
bâtiments à moins de 170 m du parcours, en mètres dans le repère local de la
3D, simplifiés et arrondis au mètre. Les longues routes sont découpées pour ne
garder que les portions proches du tracé.

```sh
node outils/rendre_carte.js
```

À relancer si le tracé change.

## `rendre_360.js`

Produit les panoramas cylindriques du relevé, dans `releve/vues/360/`.

```sh
node outils/rendre_360.js            # le lot de validation (15 panoramas)
node outils/rendre_360.js --prio1    # aussi les façades de priorité 1
node outils/rendre_360.js --index    # réécrit seulement 360/index.json
```

Douze vues de 30° de champ par arrêt, assemblées bout à bout dans une toile
de 2880 × 320 directement dans la page, puis relues en un seul JPEG. La
tranche *k* couvre les azimuts [30k, 30k+30], donc x = 0 correspond au nord —
c'est ce qui permet à l'application de caler la bande sur la boussole.

Comme pour les vignettes, **à relancer avec `--refaire` quand la 3D change**.

## `verifier_toitures.js`

Contrôle géométrique des toitures, sans navigateur : les 3 573 emprises qui
reçoivent une toiture à deux pentes sont éprouvées en deux secondes, là où un
rendu en demande deux minutes.

```sh
node outils/verifier_toitures.js             # le bilan
node outils/verifier_toitures.js --details   # et les emprises fautives
```

Quatre invariants, qui sont exactement les quatre façons dont j'ai vu la
toiture se tromper :

1. **toute l'emprise est couverte** — pas de trou dans le toit ;
2. **rien ne dépasse de plus d'un mètre du contour** — pas de pan suspendu
   dans le vide (le débord de toit vaut 38 cm) ;
3. **chaque triangle de pan** a une normale franche tournée vers le haut, et
   tourne dans le sens de cette normale — sinon le moteur l'efface ou
   l'éclaire par en dessous, et il apparaît en noir ;
4. **chaque bande de pignon** ferme l'écart entre le haut du mur et le
   rampant, et tourne aussi dans le bon sens.

Le contrôle sort en échec (code 1) au premier défaut, et il attrape bien les
régressions : en reposant la toiture sur la boîte englobante, ou en posant les
bandes de pignon sans vérifier leur sens, il signale les 3 573 emprises.

## `carte_depuis_osm.js`

Fabrique les blocs de données du moteur à partir d'un export OpenStreetMap.

```sh
node outils/carte_depuis_osm.js export.geojson \
     --sortie village/donnees.html --centre 46.3617,-0.0703 --rayon 900 --sol 95
```

Le moteur ne lit pas d'OSM : il lit des blocs de texte tabulés, en
décimètres dans un repère local. Ces blocs existaient pour Saint-Maixent
sans qu'aucun outil ne sache les refaire — c'est ce trou que comble ce
script, pour monter une deuxième carte et, plus tard, remettre à jour la
première.

Entrée : un export GeoJSON d'overpass-turbo (les tags OSM dans
`properties`). Sortie : un fichier de blocs `<script>` prêt à inclure,
plus `window.CARTE_ORIGINE`, que `actifs/code3d.js` lit désormais pour son
origine et son emprise de relief au lieu des constantes de Saint-Maixent.

Correspondances : `building` → `d-bats` (avec boîte d'aire minimale,
rectangularité, niveaux) et `d-types` pour la fonction (mairie, église,
école, commerce…) ; `highway` → `d-voies` avec une largeur par classe ;
`landuse`/`natural`/`leisure` → `d-zones` ; `barrier` → `d-lignes` ;
`waterway` → `d-topo` ; le mobilier ponctuel → `d-mobilier`.

Le relief sort en nappe plate : aucune source d'altitude n'est accessible
depuis l'environnement de développement. Il sera affiné par les altitudes
GPS de la sortie 360.

## `page_village.js`

Monte la page du banc d'essai du village à partir de la page principale.

```sh
node outils/page_village.js \
     --page index.html --donnees village/donnees.html \
     --osm export.geojson --sortie village/index.html \
     --titre "La Mothe-Saint-Héray"
```

Le but n'est pas un deuxième site, c'est un terrain d'essai pour le relevé
360. On reprend donc de `index.html` ce qui fait la vue 3D — les styles et
le bloc `e3` —, on y branche les données du village, et on remplace tout le
reste (carte 2D, synchronisation, jalonneurs, tracé de la Corrida) par la
surface minimale que `code3d.js` attend : un `window.CARTE` dont chaque
fonction rend la forme vide attendue.

`--osm` sert seulement à tracer une boucle de démonstration le long des
rues réelles, par un Dijkstra sur le réseau piéton entre la mairie,
l'église, le temple, l'Orangerie et les lavoirs. Sans lui, ou avec
`--sans-boucle`, la page s'ouvre sans parcours.

## `verifier_noms.js`

Refuse une collision de nom de fonction dans `code3d.js`.

```sh
node outils/verifier_noms.js
```

Le moteur est écrit en passes : une section tardive redéclare une fonction
d'une section antérieure pour la remplacer, volontairement — 27 noms du
fichier sont dans ce cas et tous vont bien. Le même mécanisme produit
pourtant le pire défaut silencieux du projet quand le nom est repris par
erreur pour une fonction qui n'a rien à voir : les déclarations remontent en
tête de portée, la dernière gagne, et les appels de la première partent vers
la seconde sans qu'aucune erreur ne soit levée.

C'est arrivé deux fois : `triOriente()`, où mon aide au sens de rotation a
écrasé celle du moteur, et `panneau()`, où mon panneau d'enseigne a écrasé
le panneau de feuillage des arbres — 5 511 géométries en NaN à chaque
construction du monde, invisibles à Saint-Maixent parce que les arbres en
volume se posaient par-dessus.

Ce qui sépare les deux familles se lit sans exécuter le fichier : une passe
qui remplace garde la signature, ou l'étend d'un paramètre. Aucune des 27
redéclarations légitimes ne perd de paramètre ; les deux collisions en
perdaient, 9 → 7 et 10 → 7. Le contrôle échoue donc sur une redéclaration
qui réduit le nombre de paramètres, et signale seulement, sans échouer,
celles qui les renomment.

## `rendre_equirect.js`

Panoramas équirectangulaires depuis la 3D, pour éprouver le relevé 360 sans
attendre le terrain.

```sh
node outils/rendre_equirect.js points.json \
     --sortie releve/pano --page /village/ --large 2880
```

La GoPro Max rend une image 360° × 180° : la colonne donne l'azimut, la
ligne l'élévation. Il faut les mêmes images, mais prises d'un monde dont on
connaît déjà chaque hauteur et chaque couleur. Le moteur ne sait rendre que
des vues perspectives : on en prend dix-huit (six azimuts × trois
élévations) et on les reprojette dans la grille équirectangulaire, chaque
pixel choisissant la tranche dont l'axe est le plus proche de sa direction.

C'est pour cela que le moteur a reçu `ESPACE3D.clicheLibre()` : la vue
subjective pose l'œil à 15 cm devant le coureur, dans la direction du
regard, et en tournant le centre de projection décrirait un cercle de 30 cm
— près d'un degré de décalage à dix mètres, soit 16 cm sur la hauteur
relevée, ce que l'outil cherche justement à mesurer.

## `relever_360.js`

Relève la hauteur, les niveaux et les couleurs de chaque bâtiment depuis un
lot de photos 360°.

```sh
node outils/relever_360.js releve/pano --page village/index.html --verite
node outils/relever_360.js x --essai-geometrie      # auto-contrôle
```

Le principe est géométrique. Depuis le point GPS, les emprises OSM disent
déjà quel bâtiment occupe quel azimut et à quelle distance — un lancer de
rayon, avec occultation, sur des données qu'on possède. Il ne reste à lire
dans l'image que ce qu'elle seule sait : à quelle élévation s'arrête le
bâti, et de quelle couleur il est. La hauteur suit,
`hauteur = hauteur de la caméra + distance × tan(élévation du faîte)`.

L'orientation de la caméra se résout en un seul angle pour tout le lot — la
GoPro est portée de la même façon d'un bout à l'autre de la sortie, et un
paramètre partagé par cent photos est cent fois mieux contraint qu'un
paramètre par photo. Si l'EXIF porte un cap (`GPSImgDirection`), on le prend
à la place.

La résolution se fait en deux temps, et les deux ont été trouvés en se
trompant. Le premier jet comptait les colonnes où prédiction et mesure
s'accordaient sur « y a-t-il un bâtiment ici » : dans un bourg on touche
quelque chose dans 96 % des directions à soixante-dix mètres, l'accord reste
à 93 % quelle que soit la rotation, et le maximum n'est plus que du bruit —
269° au lieu de 0 à La Mothe-Saint-Héray, et quatre mètres d'écart médian sur
les hauteurs au lieu d'un. L'indice de Jaccard n'y changeait rien.

Ce qui a de la structure, c'est la hauteur apparente : à hauteur de bâti à
peu près constante, l'élévation de la silhouette varie comme l'inverse de la
distance. La corrélation entre les deux trouve le bon pic — mais pas son
sommet, parce que les bâtiments n'ont justement pas tous la même hauteur : il
restait quatre degrés de biais au village et cinq à Saint-Maixent, les deux
moitiés du lot donnant la même valeur, donc un biais et non du bruit.

Le second temps ne demande aucun modèle : au bon cap, les colonnes qui visent
un même bâtiment lui donnent toutes la même hauteur ; au mauvais, elles
mélangent les distances de ses voisins et la dispersion explose. On minimise
donc la variance intra-bâtiment autour du pic. Le cap tombe alors à moins
d'un degré du vrai, et c'est exactement le critère qu'on cherche à optimiser.

Le lancer de rayon en azimut est la pièce dont tout le reste dépend :
`--essai-geometrie` le vérifie sur un cas calculable à la main — un carré de
10 m dont la face nord est à 15 m occupe ±18,43° et se tient à 15 m droit
devant — plutôt que sur le terrain. Pris à l'envers, chaque mur balayait
l'horizon entier et occultait le village derrière lui ; le contrôle le voit.

`--verite` compare aux hauteurs connues. Sur des panoramas de synthèse,
`ESPACE3D.batisPoses()` donne ce que la 3D a réellement bâti et sert de
vérité de référence. Il rend deux hauteurs, et la distinction compte : `murs`
est le haut des murs, `faite` le point le plus haut de la toiture. Un relevé
360 lit la silhouette, donc le faîte ; le comparer au haut des murs
afficherait un écart systématique de deux à trois mètres qui n'est pas une
erreur de mesure.

`--bruit-gps 4` déplace chaque prise de vue de quatre mètres au hasard, avec
un tirage reproductible. Sur des panoramas de synthèse la position est
exacte, et comme c'est elle qui donne la distance et donc la hauteur, le
contrôle serait flatteur : un GPS de téléphone ou de GoPro se trompe de
quelques mètres, et cette option chiffre ce que cela coûte avant d'aller sur
le terrain.

Les clochers sont des exceptions attendues : `clocher()` monte bien au-dessus
du faîte des murs de l'église, et la silhouette le voit.

### Ce que le contrôle donne

Deux jeux de panoramas de synthèse, l'un au centre de Saint-Maixent, l'autre
le long de l'itinéraire prévu à La Mothe-Saint-Héray. Les bâtiments retenus
sont ceux vus sur au moins 12 colonnes, à 45 m au plus, avec un étalement
inférieur à 2,5 m :

| | Saint-Maixent (6 vues) | La Mothe (8 vues) |
|---|---|---|
| bâtiments relevés | 83 | 111 |
| dont retenus | 35 | 67 |
| cap retrouvé | 357,8° pour 0 | 359,3° pour 0 |
| faîte, retenus | 0,94 m | **0,79 m** |
| haut des murs, retenus | 1,94 m | 1,50 m |
| niveaux justes | 40 % | **60 %** |
| niveaux à un près | 94 % | **97 %** |

Le village fait mieux que la ville : le bâti y est plus bas et plus régulier,
les rues plus larges, et l'itinéraire a été calculé pour voir chaque façade
d'assez près. C'est le jeu qui compte, puisque c'est là que la sortie aura
lieu.

L'écart sur le haut des murs est le double de celui sur le faîte parce qu'on
y retranche un relèvement de toiture estimé depuis la boîte OSM, alors que le
moteur calcule le sien sur une boîte réorientée et avec une pente qui dépend
du matériau. C'est cette estimation, et non la mesure, qui limite le comptage
des niveaux : la silhouette, elle, est lue à moins d'un mètre.

Les plus fautifs sont tous des façades vues en biais à cinquante ou soixante
mètres sur six à dix colonnes — une lichette de mur, où une erreur d'un pixel
de silhouette vaut un mètre de hauteur. D'où le filtre de publication.

### Tolérance au GPS

`--bruit-gps` chiffre ce que coûte une position approximative. C'est
l'inconnue qui compte le plus, puisque la distance donne la hauteur :

| erreur GPS | faîte, écart médian | niveaux à un près | cap retrouvé |
|---|---|---|---|
| 0 m | 0,86 m | 94 % | oui |
| 2 m | 0,86 m | 97 % | oui |
| 4 m | 1,50 m | 97 % | oui |
| 8 m | 5,85 m | 53 % | non (207° au lieu de 0°) |

Jusqu'à quatre mètres le procédé tient ; à huit, la résolution du cap
décroche et tout s'effondre avec elle. La suite évidente est de recaler la
trace sur le réseau de voies : l'essentiel de l'erreur d'un GPS piéton est
latérale, et une rue connue la contraint.

## `carte.js`

La carte du moteur, lue depuis une page, et qui voit quoi depuis un point.

```js
const C=require('./carte.js').charger({page:'village/index.html', gw:1440, portee:70});
C.visibilite(x,z)   // → {bat, dist} : pour chaque colonne d'azimut,
                    //   l'emprise la plus proche et sa distance
```

Ce n'est pas un outil mais la pièce commune à `relever_360.js`, qui mesure
les bâtiments sur les photos, et `plan_360.js`, qui décide où il faut passer.
Le lancer de rayon en azimut est ce dont dépendent toutes les hauteurs
relevées : en garder deux copies, c'est se préparer à les voir diverger. Le
projet a déjà payé deux fois le prix d'une fonction dupliquée sous le même
nom — `triOriente`, puis `panneau`.

`remplacerBatiments()` sert aux auto-contrôles, qui vérifient le lancer de
rayon sur un carré posé à la main plutôt que sur la carte réelle.

## `plan_360.js`

Où faut-il passer avec la caméra 360 pour voir le bourg en entier.

```sh
node outils/plan_360.js --page village/index.html \
     --osm village/export-osm.geojson \
     --depart 46.360453,-0.112819 --budget 5200 --rayon 450 --coeur 400 \
     --sortie village/parcours-360
```

Le relevé mesure un bâtiment quand il l'a vu assez large et d'assez près :
au moins trois degrés d'azimut, quarante-cinq mètres au plus, et de deux
points de vue pour pouvoir prendre une médiane. Cela ne dépend que de la
géométrie, qu'on possède déjà — l'itinéraire se calcule donc avant d'aller
marcher, au lieu de découvrir au dépouillement qu'une rue manque.

Le réseau piéton est échantillonné tous les quatorze mètres, le pas d'une
photo toutes les dix secondes à cinq kilomètres-heure, et chaque point de vue
est évalué au lancer de rayon. Les rues sont ensuite choisies une par une :
celle qui rapporte le plus de bâtiments neufs par mètre parcouru, détour
compris. Glouton, donc non optimal — le problème est celui du facteur rural
— mais sur un bourg la différence ne vaut pas le temps de la chercher.

Deux bornes possibles pour les rues candidates, sans borner le réseau
(traverser reste permis) : `--rayon` autour du départ, ou `--trace` +
`--corridor` le long d'un tracé, ce qu'il faudra pour un parcours de course.
Sans borne, le glouton part chercher quelques fermes à un kilomètre alors
qu'il reste des ruelles du centre à faire.

`--osm` sert à nommer les rues, que `d-voies` ne porte pas : l'itinéraire
écrit dit « remonte la rue de la Chamoiserie » au lieu d'afficher une trace.

Sorties : un GPX à charger dans n'importe quelle appli de marche, et un
itinéraire en Markdown, rue par rue.

### Ce que ça donne sur La Mothe-Saint-Héray

769 des 1 542 emprises du bourg sont visibles depuis une rue à moins de
45 m — les remises de fond de jardin ne se voient d'aucune :

| longueur | photos | durée | bourg vu 1 fois | vu de 2 points de vue |
|---|---|---|---|---|
| 3,8 km | 270 | 47 min | 70 % | 63 % |
| 4,5 km | 322 | 56 min | 79 % | 72 % |
| **5,3 km** | **381** | **67 min** | **85 %** | **78 %** |
| 8,1 km | 575 | 101 min | 93 % | 86 % |

## `relief_depuis_gps.js`

Le relief du village, depuis les altitudes GPS de la sortie.

```sh
node outils/relief_depuis_gps.js trace.gpx releve/photos-360/ \
     --donnees village/donnees.html
```

La carte sort du convertisseur sur une nappe plate : aucune source
d'altitude n'est joignable depuis l'environnement de développement. Pour un
bourg de vallée, ça se voit. Ce que la sortie rapporte comble ce trou — une
altitude par point de passage, bruitée, et seulement le long des rues, mais
un profil de vallée approché vaut mieux qu'une table.

L'altitude GPS se trompe de deux façons : un bruit de haute fréquence, que
la médiane puis la moyenne glissantes enlèvent, et une dérive lente de
plusieurs mètres, qu'aucun lissage n'enlève. On interpole ensuite sur la
grille du moteur en 1/(d² + s²) sur les vingt-quatre mesures les plus
proches, avec un terme de fond placé à cent cinquante mètres qui ne pèse que
là où il n'y a vraiment rien.

Un décalage constant est invisible : le moteur n'utilise que des altitudes
relatives. Que le GPS donne la hauteur sur l'ellipsoïde ou sur le géoïde ne
change donc rien.

Éprouvé sur une trace de synthèse suivant l'itinéraire prévu, avec un profil
de vallée connu, un bruit de 2 m d'écart type et une dérive en marche
aléatoire bornée à 6 m :

| | écart médian | q90 |
|---|---|---|
| sur la trace | 1,29 m | 2,62 m |
| dans les 400 m du départ | 2,76 m | 7,70 m |

Le premier jet donnait trois mètres d'écart *sur la trace elle-même* : il
prenait toutes les mesures et donnait au terme de fond un poids calculé sur
quatre fois la longueur de lissage, si bien que les contributions lointaines
portaient la moitié du poids partout et que le relief sortait écrasé vers la
moyenne. C'est le voisinage borné qui l'a corrigé.

## `enseignes_depuis_osm.js`

Les enseignes des commerces, depuis les noms d'OpenStreetMap.

```sh
node outils/enseignes_depuis_osm.js village/export-osm.geojson \
     --page village/index.html --sortie village/enseignes.html
```

Ce qui fait reconnaître une rue, ce n'est pas seulement la hauteur des
façades, c'est ce qui est écrit dessus. À Saint-Maixent les sept enseignes de
la 3D ont été relevées une à une sur les photos, avec leurs couleurs et leur
position au lancer de rayon — un travail à la main qu'on ne recommence pas
pour chaque bourg. Or OSM porte déjà l'essentiel : le nom du commerce et sa
nature.

Le mur choisi est celui qui donne sur la rue : pour chaque côté de l'emprise
on mesure la distance de son milieu à la chaussée la plus proche, et on garde
le plus proche **dont la normale sorte du bâtiment**. Sans ce dernier test une
enseigne sur deux se retrouvait à l'intérieur, donc invisible. Deux objets sur
le même mur sont décalés de part et d'autre au lieu de se superposer.

Les commerces reçoivent un bandeau (`PHARMACIE` en vert, `LA POSTE` en jaune,
le nom quand OSM le donne), les bâtiments publics une plaque gravée (`MAIRIE`,
`ÉCOLE`, `MÉDIATHÈQUE`). Les couleurs sont celles de l'usage, pas d'un
relevé : une photo les corrigera. Les églises n'ont pas d'enseigne.

`actifs/code3d.js` lit `window.CARTE_ENSEIGNES` quand la page en pose une, et
retombe sinon sur sa table de Saint-Maixent. Sur La Mothe-Saint-Héray : treize
enseignes, dont la mairie, les deux pharmacies, la boulangerie, le Crédit
Mutuel, le café, La Poste, l'école, le collège et la médiathèque.

## `verifier_musique.js`

La musique joue-t-elle les bonnes notes ?

```sh
node outils/verifier_musique.js [--morceau marche] [--secondes 20]
```

Je n'entends rien de ce que je fabrique : il faut donc mesurer. `actifs/musique.js`
sait planifier dans n'importe quel contexte audio ; on lui en donne un hors
ligne — un `OfflineAudioContext` rend le son dans un tableau au lieu de le
jouer — et on retrouve la hauteur de chaque note par autocorrélation. C'est le
même code de planification qu'en direct : un contrôle qui n'écouterait pas
exactement ce que la page joue ne vaudrait rien.

Ce qui est vérifié : le mélange n'est pas silencieux, il ne sature pas, et
chaque note du chant sort à moins de 25 cents de sa fréquence. Sur la marche
actuelle : 42 notes, écart médian 0 cent, crête 0,27.

Le contrôle attrape bien un désaccord — désaccorder la voix d'un demi-ton le
fait échouer sur 101 cents.

## `melodie_depuis_audio.js`

Une mélodie, depuis un enregistrement.

```sh
node outils/melodie_depuis_audio.js chant.m4a --tempo 112 --sortie part.txt
node outils/melodie_depuis_audio.js --essai          # auto-contrôle
```

Je n'entends pas les fichiers qu'on m'envoie, mais je peux les mesurer. Le
navigateur décode l'audio, on suit la hauteur image par image par
autocorrélation, on découpe en notes, on quantifie sur une grille de doubles
croches, et il en sort la partition au format du lecteur, prête à coller.

Deux pièges, tous deux rencontrés et corrigés :

**L'erreur d'octave.** Le décalage d'une période double corrèle presque aussi
bien que celui d'une période, et parfois mieux. Le premier jet la faisait à
chaque attaque et rendait 77 notes là où il y en a 42, farcies de graves
inventés. On reprend donc le plus petit décalage qui atteint 88 % du maximum,
et non le maximum.

**Les notes répétées.** Deux notes identiques qui se suivent n'en faisaient
qu'une, faute de savoir où l'une finit. Une attaque se voit à l'énergie, qui
remonte après avoir creusé : on coupe quand le niveau dépasse de moitié le
creux des trois trames précédentes.

`--essai` est l'auto-contrôle : on rend la voix de chant du lecteur, dont la
partition est connue, et on vérifie qu'on la retrouve. **42 notes écrites, 42
retrouvées, 42 à la bonne place.** Les durées, elles, dérivent d'un pas ici ou
là — les hauteurs sont exactes, le rythme est à relire.

Ça marche sur une voix à la fois : sifflement, clavier, trompette, chant sur
une voyelle tenue. **Sur un chœur, il échoue** : voir
`melodie_depuis_chant.py` ci-dessous, écrit pour ce cas.

Le relevé lui-même vit dans `actifs/releve_melodie.js`, partagé avec la page
`melodie/` : une seule copie de la partie qui décide des notes. C'est la
troisième fois dans ce projet qu'une fonction dupliquée finit par diverger de
son jumeau — `triOriente`, `panneau` — et celle-ci décide de chaque note
qu'on entendra.

## `melodie_depuis_chant.py`

La mélodie d'un chant chanté à plusieurs — le cas où l'outil précédent
échoue.

```sh
pip install numpy soundfile
python3 outils/melodie_depuis_chant.py chant.mp3 --structure
python3 outils/melodie_depuis_chant.py chant.mp3 \
        --de 36.7 --a 67.5 --octave 12 --tempo 112
```

C'est l'outil qui a relevé « Jeune chef » sur l'enregistrement du chœur de
l'ENSOA, et qui régénère le bloc `'jeunechef'` de `actifs/musique.js` — les
quatre voix, pas seulement le chant.

**Pourquoi un autre outil.** L'enregistrement reçu est un chœur d'hommes a
cappella, coupé sous 120 Hz : *aucune* énergie sous cette fréquence, donc un
fondamental absent et des harmoniques qui, elles, sont fortes. Tout détecteur
qui suit le pic le plus fort — ou la meilleure autocorrélation — lit alors une
quinte ou une octave trop haut. Mesuré sur ce fichier : 3,1 octaves d'étendue,
44 sauts d'octave sur 212 intervalles alors que l'intervalle médian est de
2 demi-tons. Ce n'est pas un réglage à corriger, c'est la méthode qui ne tient
pas.

**Ce que fait celui-ci.**

1. *Saillance harmonique* — pour chaque demi-ton candidat, la somme des
   amplitudes de ses dix premières harmoniques. Un fondamental affaibli ne
   fait plus disparaître le candidat.
2. *Viterbi* sur toute la durée, avec un coût proportionnel au saut : aucune
   voix ne change d'octave d'une trame à l'autre. C'est là que les octaves se
   corrigent, et la piste passe alors de trois octaves à une.
3. *Découpe* aux changements de hauteur et aux attaques — flux spectral sur
   fenêtre courte (46 ms), sans quoi les syllabes répétées d'un chant
   déclamé fondent en une seule note.
4. *Recalage sur la gamme* de la tonalité trouvée (corrélation de Krumhansl) :
   sur un relevé, le hors-gamme est presque toujours une hauteur mal lue.
5. *Mise en partition* : durées calées sur la double croche avec un tempo
   mesuré localement — un chœur sans accompagnement dérive, une grille unique
   ne tient pas sur deux minutes —, respirations allongées pour finir la
   mesure, accords déduits mesure par mesure, basse et contrechant placés
   chacun dans sa fenêtre de hauteur.

**L'épreuve.** Je n'entends rien de ce que je fabrique, donc un relevé qu'on
ne peut pas contrôler ne vaut rien. La suite de notes est comparée au
*chromagramme* du fichier — calculé directement sur le spectre, donc
indépendant des cinq étapes ci-dessus — contre ses onze transpositions et
contre quarante mélanges de ses propres notes. Sur « Jeune chef » : **9,9
écarts-types au-dessus du hasard, et premier des douze**. Deux autres
recoupements : les deux passages du fichier (structure trouvée seule : deux
fois 68,5 s, couplet puis refrain) s'accordent à 79 % des notes, et la
tonalité sort à 0,66 contre 0,55 pour la suivante.

Seule dépendance hors du projet, et seul outil en Python du dépôt : `numpy`
pour les FFT et `soundfile` pour lire le MP3 (libsndfile ≥ 1.1). Le reste des
outils reste en Node.

## `melodie/` (page)

De quoi me donner une mélodie sans avoir à me l'expliquer, déployée avec le
site : https://motio-training.github.io/corrida-2027/melodie/

Trois entrées, une seule sortie — la notation du lecteur :

- **le clavier**, deux octaves, à la souris, au doigt ou aux touches de
  l'ordinateur ; le rythme du jeu est conservé ;
- **le micro**, pour chanter ou siffler l'air ; rien ne quitte l'appareil,
  l'analyse se fait dans la page ;
- **un fichier** audio, mémo vocal ou extrait de cérémonie.

Le clavier est la voie sûre : ce qui est tapé est relevé tel quel. Le micro et
le fichier passent par `releve_melodie.js`, qui suit une autocorrélation et se
trompe d'octave sur une voix chantée sur des paroles — la page le dit
maintenant, et conseille de siffler ou de tenir une voyelle.

Quatre choses rendent le clavier utilisable pour un air de quarante notes :

- les touches portent leur **nom en solfège** — c'est ainsi qu'on retient un
  chant —, la lettre du clavier d'ordinateur en dessous ;
- un **métronome** au tempo choisi, qui donne **quatre temps d'annonce** avant
  de lancer l'enregistrement : sans référence, le rythme part à la dérive, et
  c'est le rythme qui fait reconnaître un air. Les clics sont posés dans le
  temps de l'horloge audio, l'annonce affichée aussi — un `setInterval` seul
  dérive, et un contexte audio qui vient de démarrer a plusieurs centaines de
  millisecondes de retard sur la page ;
- **l'annulation de la dernière note**, et non plus seulement tout effacer :
  une fausse note ne coûte plus la reprise complète ;
- la **liste des notes saisies**, en solfège, un clic pour en retirer une.
  Sans elle on joue à l'aveugle : on ne sait ni si la note a été prise, ni
  laquelle effacer.

Le tempo se corrige après coup : il ne change pas les notes, seulement le
découpage des durées. **Écouter** joue le résultat avec le timbre exact de la
3D, via `MUSIQUE.definir()` — juger une mélodie sur un autre son que celui
qu'on aura n'apprend pas grand-chose.

Éprouvée dans un navigateur sans écran : jouer G4 G4 C5 au clavier rend
exactement `G4/2 G4/2 C5/4`, la liste affiche `sol4 la4 do5`, l'annulation
retire bien la dernière, l'annonce défile `4… 3… 2… 1…` avant le départ, et le
fichier de synthèse ressort à 45 notes dont les dix premières sont justes.
