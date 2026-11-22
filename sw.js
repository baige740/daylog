const CACHE='daylog-shell-v16';
const files=['./','index.html','fish.html','fish.js','fish.css','fish-avatar.webp','app.js','article.js','boot.js','auth.js','auth.css','icons.js','styles.css','extras.js','extras.css','media.js','insights.js','journal.js','market.js','market.json','article.html','article.css','writing.js','forest.webp','lxgwwenkai-common.woff2','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(files)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('daylog-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==location.origin)return;
 if(url.pathname==='/api'||url.pathname.startsWith('/api/')||url.pathname.endsWith('/sw.js'))return;
 const scope=new URL(self.registration.scope).pathname;
 if(!url.pathname.startsWith(scope))return;
 if(event.request.mode==='navigate'){
   event.respondWith((async()=>{
     const cache=await caches.open(CACHE);
     const cached=await cache.match(event.request,{ignoreSearch:true})||await cache.match(url.pathname,{ignoreSearch:true});
     const network=fetch(event.request).then(response=>{
       if(response.ok)cache.put(new Request(url.origin+url.pathname),response.clone());
       return response;
     }).catch(()=>null);
     if(cached){event.waitUntil(network);return cached}
     const fresh=await network;
     if(fresh)return fresh;
     if(url.pathname===scope||url.pathname===scope+'index.html')return await cache.match('index.html',{ignoreSearch:true})||Response.error();
     return Response.error();
   })());
   return;
 }
 event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   const cached=await cache.match(event.request,{ignoreSearch:true});
   const network=fetch(event.request).then(response=>{
     if(response.ok)cache.put(new Request(url.origin+url.pathname),response.clone());
     return response;
   }).catch(()=>null);
   if(cached){event.waitUntil(network);return cached}
   const fresh=await network;
   return fresh||Response.error();
 })());
});

