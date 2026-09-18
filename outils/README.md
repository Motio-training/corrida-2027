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
