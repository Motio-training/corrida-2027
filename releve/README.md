# Relevé photo sur le terrain

`releve/index.html` : page à ouvrir sur le téléphone, sur le parcours.

Elle lit `plan.json` (calculé par `outils/plan_prises_de_vue.js`), guide au GPS
et à la boussole vers chaque arrêt, indique l'azimut à viser et le nombre de
photos à prendre, puis empaquette tout dans une archive `.zip`.

- **Guidage** — l'arrêt le plus proche, l'aiguille vers lui, puis le secteur de
  visée quand on y est. Le cadran passe au vert quand l'appareil est dans
  l'angle voulu à 9° près. La bascule du haut choisit entre le **lot de
  validation** et tout le parcours.
- **Le cadre visuel** — trois onglets sous l'image :
  - **360° autour de toi** — une bande qui fait le tour de l'horizon depuis
    le point de prise de vue, et qui **défile avec la boussole** : ce que
    montre l'écran est ce que tu as devant toi. Le repère orange marque la
    direction à viser, il suffit de tourner jusqu'à lui ; la ligne pointillée
    au milieu, c'est droit devant. On peut la faire glisser au doigt pour
    regarder ailleurs, et double-taper pour revenir au suivi de la boussole.
    C'est l'onglet ouvert par défaut : on se repère d'abord.
  - **Cadrage** — l'image que la 3D donne du point et de l'angle exacts de la
    photo à prendre : il n'y a plus qu'à cadrer pareil.
  - **Ma photo** — dès que la photo est prise, pour la vérifier sur place.

  Au changement d'angle ou d'arrêt, on revient au 360° — sauf si tu as
  demandé le cadrage toi-même.
- **Carte** — se repérer sur le tracé : rues, bâtiments, rivière, le tracé
  de la course, ta position et le cône de la boussole. Les 15 arrêts du lot
  sont numérotés en orange, avec un trait vers la direction à viser ; les
  autres façades importantes (priorité 1) sont de simples points. Toucher un
  point en fait la cible. Déplacement au doigt, pincer pour zoomer, ◎ pour se
  recentrer, ⤢ pour voir tout le parcours. Les postes de jalonneurs ne sont
  pas encore dessus.
- **Photo libre** — le bouton sous la carte enregistre une photo où tu es,
  sans arrêt prévu : quand tu juges qu'un endroit vaut une image. Position et
  cap sont notés comme pour les autres, et elles arrivent dans l'archive sous
  `libre-001.jpg`, marquées `genre: "libre"` dans le manifeste.
- **Façades** — les 361 arrêts, filtrables. Toucher un arrêt en fait la cible.
- **Postes** — les 75 jalonneurs, trois photos chacun (gauche, face, droite du
  champ de vision), pour remplacer la 3D dans « voir par ses yeux ».
- **Envoi** — l'archive : les photos réduites à 2048 px, plus un
  `manifeste.json` qui donne pour chaque image sa position GPS, le cap de la
  boussole au déclenchement, l'azimut visé et l'arrêt concerné.

Tout reste sur le téléphone (IndexedDB) et la page fonctionne hors réseau
après la première visite : on peut marcher les 9 km sans connexion et
n'envoyer qu'en rentrant.

## Le lot de validation

L'application démarre sur un **lot de 15 façades et 3 postes**, choisi par le
script : tous les repères nommés de la vieille ville (Porte Chalon, mairie,
marché couvert, square Varaize, place du Marché, abbatiale, médiathèque,
seconde porte de ville, musée du Sous-Officier), complétés par les façades de
priorité 1 les plus vues du secteur, et trois postes de jalonneurs pour
valider aussi la vue « par ses yeux ».

**1 139 m de marche, 31 photos, aucun arrêt dans l'enceinte de l'ENSOA.**
De quoi juger le gain dans la 3D avant de marcher les 9 km.

## Le fond de carte

`releve/carte.json` (142 Ko) porte les rues, les cours d'eau et les emprises
de bâtiments à moins de 170 m du parcours, en mètres dans le repère local de
la 3D, simplifiés et arrondis au mètre. Produit par
`outils/rendre_carte.js` depuis les données de `index.html` — donc
d'OpenStreetMap, comme le reste de la carte. À relancer si le tracé change.

## Les panoramas 360°

`releve/vues/360/` contient une bande cylindrique par arrêt, produite par
`outils/rendre_360.js` : douze vues perspectives de 30° de champ, prises tous
les 30° et mises bout à bout, soit 2880 × 320. Sur un champ aussi étroit,
l'écart entre projection perspective et projection cylindrique reste sous 1 %
de la largeur d'une tranche — la bande se lit comme un panorama continu sans
reprojection.

La tranche *k* couvre les azimuts [30k, 30k+30], donc **x = 0 dans l'image,
c'est le nord** : dans l'application, azimut = x / largeur × 360. C'est ce qui
permet de la caler sur la boussole.

Pour l'instant seuls les 15 arrêts du lot en ont un (environ 3 Mo, gardés hors
ligne). `--prio1` étend aux façades de priorité 1.

## Les vues 3D

`releve/vues/` contient une vignette par photo à prendre, rendue hors ligne
par `outils/rendre_vues.js` : 520 × 340, champ de 68° comme un téléphone.
`vues/index.json` dit lesquelles existent, sous quels angles, et lesquelles
appartiennent au lot de validation — ce sont celles que le service worker
garde hors ligne. Les autres se chargent au besoin et sont gardées au passage.

Une façade large est prise en plusieurs photos : chacune a son propre angle,
et donc sa propre vue 3D. L'application marche sans les vues, avec un cadre
qui l'annonce.

Les métadonnées EXIF ne survivent pas au passage par le navigateur : c'est le
manifeste qui porte la géolocalisation, et c'est lui qui permet de replacer
chaque façade sur la bonne emprise.
