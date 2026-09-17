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
