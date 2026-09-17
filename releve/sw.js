/* Relevé photo : tout doit marcher sans réseau, en marchant dans la ville.
   La page, le plan et les polices sont mis de côté à la première visite ;
   ensuite le cache répond d'abord et le réseau ne sert qu'à rafraîchir. */
var CACHE='releve-corrida-1';
var BASE=['./','./index.html','./plan.json'];

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(BASE); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(noms){
    return Promise.all(noms.filter(function(n){ return n!==CACHE; }).map(function(n){ return caches.delete(n); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET') return;
  e.respondWith(
    caches.match(e.request).then(function(r){
      if(r){
        /* on rafraîchit en tâche de fond, sans faire attendre le terrain */
        fetch(e.request).then(function(n){
          if(n && n.ok) caches.open(CACHE).then(function(c){ c.put(e.request,n); });
        }).catch(function(){});
        return r;
      }
      return fetch(e.request).then(function(n){
        if(n && n.ok && (e.request.url.indexOf(self.registration.scope)===0 || e.request.url.indexOf('fonts.')>=0)){
          var copie=n.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request,copie); });
        }
        return n;
      }).catch(function(){
        return new Response('hors ligne',{status:503,statusText:'hors ligne'});
      });
    })
  );
});
