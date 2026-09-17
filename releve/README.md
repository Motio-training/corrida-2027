# Relevé photo sur le terrain

`releve/index.html` : page à ouvrir sur le téléphone, sur le parcours.

Elle lit `plan.json` (calculé par `outils/plan_prises_de_vue.js`), guide au GPS
et à la boussole vers chaque arrêt, indique l'azimut à viser et le nombre de
photos à prendre, puis empaquette tout dans une archive `.zip`.

- **Guidage** — l'arrêt le plus proche, l'aiguille vers lui, puis le secteur de
  visée quand on y est. Le cadran passe au vert quand l'appareil est dans
  l'angle voulu à 9° près.
- **Façades** — les 361 arrêts, filtrables. Toucher un arrêt en fait la cible.
- **Postes** — les 75 jalonneurs, trois photos chacun (gauche, face, droite du
  champ de vision), pour remplacer la 3D dans « voir par ses yeux ».
- **Envoi** — l'archive : les photos réduites à 2048 px, plus un
  `manifeste.json` qui donne pour chaque image sa position GPS, le cap de la
  boussole au déclenchement, l'azimut visé et l'arrêt concerné.

Tout reste sur le téléphone (IndexedDB) et la page fonctionne hors réseau
après la première visite : on peut marcher les 9 km sans connexion et
n'envoyer qu'en rentrant.

Les métadonnées EXIF ne survivent pas au passage par le navigateur : c'est le
manifeste qui porte la géolocalisation, et c'est lui qui permet de replacer
chaque façade sur la bonne emprise.
