# Relevés photographiques

Un dossier par sortie : les métadonnées, pas les images. Les photos
elles-mêmes ne sont pas versionnées — elles pèsent 15 Mo pour dix-sept vues
et ne servent qu'une fois, au moment d'en tirer les mesures.

## Sortie du 17 septembre 2026

- `manifeste-2026-09-17.json` — ce que l'application a enregistré : pour
  chaque photo, sa position GPS et sa précision, le cap de la boussole au
  déclenchement, l'azimut qui était prévu, et l'arrêt concerné.
- `batiments-2026-09-17.json` — quel bâtiment OSM chaque photo montre,
  obtenu en lançant un rayon depuis le point de prise de vue le long du cap
  (`outils/relever_batiments.js`). C'est ce fichier qui donne les
  coordonnées exactes de la table `RELEVE` dans `actifs/code3d.js`.
- `couleurs-2026-09-17.json` — les teintes mesurées sur les photos
  (`outils/relever_photos.js`) : par image, la couleur de mur au soleil et à
  l'ombre, et la palette d'ensemble.

Dix-sept photos : neuf sur les arrêts du plan (5, 15, 26, 339) et huit
libres, toutes en ville — aucune dans l'enceinte de l'ENSOA. Précision GPS
de 4 à 5 m. L'arrêt 360 a été passé.

### Ce que cette sortie a appris

1. **Des volets partout où il n'y en a pas.** Saint-Maixent compte beaucoup
   de grands bâtiments institutionnels en ville, aux hautes fenêtres nues.
   La famille de façade sans volets existait, mais ne s'appliquait qu'aux
   polygones de l'ENSOA.
2. **Des hauteurs fausses.** OpenStreetMap ne donne ni niveaux ni hauteur
   pour ces bâtiments (`lv` et `ht` à zéro partout) : la 3D devinait, et
   faisait trois étages d'un commerce d'un seul niveau.
3. **Aucun volet rouge ni brun** sur les dix-sept photos : ils sont
   gris-bleu, gris pâle ou blanc cassé. La palette de la famille ocre était
   inventée.
4. **Les couleurs d'ensemble étaient déjà proches.** Mesuré sur le rendu :
   crème rvb(198,194,186) contre rvb(198,192,177) sur les photos. Le défaut
   n'était pas la clarté mais la saturation, et il fallait mesurer le rendu
   — non la constante dans le code — pour s'en apercevoir : le tone mapping
   et les textures photo déplacent beaucoup la couleur finale.

### Ce qui manque encore

- La porte monumentale (photos `facade-026`) : le repère le plus
  reconnaissable du parcours, absent de la 3D.
- Le marché couvert (`libre-006`) et le monument aux morts (`libre-001`,
  `libre-002`) : absents aussi.
- La volumétrie des longues casernes : la façade est juste, la masse reste
  celle qu'OSM donne.

### Pour la prochaine sortie

- **Tenir le téléphone à l'horizontale** pour les façades larges : les
  dix-sept photos sont en portrait, alors que les vignettes de cadrage sont
  en paysage.
- **Surveiller le cap** : les écarts entre azimut visé et cap réel montent
  à 60° (photo `facade-339-1`), ce qui rend l'identification du bâtiment
  incertaine. Attendre le vert du cadran.
- **Reculer davantage** quand c'est possible : à 10 m d'une façade de 32 m,
  aucun cadre ne la contient.
