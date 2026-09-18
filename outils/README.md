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

Six panoramas de synthèse au centre de Saint-Maixent, 83 bâtiments relevés,
36 retenus après filtrage (étalement inférieur à 2,5 m, au moins 12 colonnes,
45 m au plus) :

| mesure | écart médian | q90 |
|---|---|---|
| faîte, tous les bâtiments relevés | 1,15 m | 8,55 m |
| faîte, bâtiments retenus | 0,86 m | 3,62 m |
| haut des murs, bâtiments retenus | 1,65 m | 3,40 m |

Niveaux : 42 % justes, 94 % à un niveau près. Le cap de la colonne zéro est
retrouvé à un demi-degré près — c'était la pièce la plus incertaine du
procédé, et c'est celle qui marche le mieux.

L'écart sur le haut des murs est le double de celui sur le faîte parce qu'on
y retranche un relèvement de toiture estimé depuis la boîte OSM, alors que le
moteur calcule le sien sur une boîte réorientée et avec une pente qui dépend
du matériau. C'est cette estimation, et non la mesure, qui limite le comptage
des niveaux.

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
