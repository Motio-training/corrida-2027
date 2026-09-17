/* Relevé photo : tout doit marcher sans réseau, en marchant dans la ville.
   La page, le plan et les polices sont mis de côté à la première visite ;
   ensuite le cache répond d'abord et le réseau ne sert qu'à rafraîchir. */
var CACHE='releve-corrida-5';
var BASE=['./','./index.html','./plan.json','./carte.json','./vues/index.json','./vues/360/index.json'];

/* les vues 3D du lot de validation sont mises de côté dès l'installation :
   c'est la sortie qu'on fait sans réseau. Les autres arrivent au besoin,
   et le gestionnaire de fetch les garde au passage. */
function deCote(c,index,prefixe){
  return fetch(index,{cache:'no-store'})
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(V){
      if(!V || !V.lot || !V.lot.length) return;
      return Promise.all(V.lot.map(function(n){
        return c.add(prefixe+n).catch(function(){});
      }));
    })
    .catch(function(){});
}
function vuesDuLot(c){
  /* les vignettes de cadrage et les panoramas 360° du lot : environ 4 Mo,
     c'est le prix d'une sortie qui marche sans réseau */
  return Promise.all([
    deCote(c,'./vues/index.json','./vues/'),
    deCote(c,'./vues/360/index.json','./vues/360/')
  ]);
}

self.addEventListener('install',function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(BASE).then(function(){ return vuesDuLot(c); }); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(noms){
    return Promise.all(noms.filter(function(n){ return n!==CACHE; }).map(function(n){ return caches.delete(n); }));
  }).then(function(){ return self.clients.claim(); }));
});

/* Deux régimes, et la distinction compte :

   - la page et les fichiers de description (plan, index, carte) changent à
     chaque mise à jour → RÉSEAU D'ABORD, cache en secours. Sinon une version
     en cache continue d'être servie et les nouveautés n'arrivent jamais :
     c'est exactement ce qui a fait disparaître l'onglet Carte.
   - les images (vignettes, panoramas, photos) ne changent pas sous le même
     nom → CACHE D'ABORD, c'est ce qui rend la sortie possible sans réseau.  */
function aNous(url){
  return url.indexOf(self.registration.scope)===0;
}
function fraisDAbord(rq){
  return rq.mode==='navigate' || /\.(html|json)(\?|$)/.test(rq.url) || rq.url.slice(-1)==='/';
}
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET') return;
  var rq=e.request;

  if(fraisDAbord(rq)){
    e.respondWith(
      fetch(rq,{cache:'no-store'}).then(function(n){
        if(n && n.ok && aNous(rq.url)){
          var copie=n.clone();
          caches.open(CACHE).then(function(c){ c.put(rq,copie); });
        }
        return n;
      }).catch(function(){
        /* hors réseau : on ressort la dernière version connue */
        return caches.match(rq).then(function(r){
          return r || caches.match('./index.html') ||
                 new Response('hors ligne',{status:503,statusText:'hors ligne'});
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(rq).then(function(r){
      if(r) return r;
      return fetch(rq).then(function(n){
        if(n && n.ok && (aNous(rq.url) || rq.url.indexOf('fonts.')>=0)){
          var copie=n.clone();
          caches.open(CACHE).then(function(c){ c.put(rq,copie); });
        }
        return n;
      }).catch(function(){
        return new Response('hors ligne',{status:503,statusText:'hors ligne'});
      });
    })
  );
});
