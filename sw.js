const CACHE='daylog-shell-v36';
const files=['./','index.html','fish.html','fish-reset.html','fish.js','fish-static-api.js','fish.css','fish-avatar.webp','app.js','article.js','boot.js','version.js','auth.js','auth.css','icons.js','styles.css','extras.js','extras.css','media.js','insights.js','journal.js','journal-cloud.js','market.js','market.json','article.html','article.css','writing.js','forest.webp','lxgwwenkai-common.woff2','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(files)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('daylog-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==location.origin)return;
 if(url.pathname==='/api'||url.pathname.startsWith('/api/')||url.pathname.endsWith('/sw.js'))return;
 const scope=new URL(self.registration.scope).pathname;
 if(!url.pathname.startsWith(scope))return;
 if(url.searchParams.has('v')&&/\.(?:js|css|webp|woff2)$/.test(url.pathname)){
   event.respondWith((async()=>{
     const cache=await caches.open(CACHE);
     const cached=await cache.match(event.request);
     if(cached)return cached;
     try{
       const fresh=await fetch(event.request,{cache:'no-cache'});
       if(fresh.ok)cache.put(event.request,fresh.clone());
       return fresh;
     }catch{
       return await cache.match(url.pathname)||Response.error();
     }
   })());
   return;
 }
 if(url.pathname.endsWith('/fish-library.json')){
   event.respondWith((async()=>{
     const cache=await caches.open(CACHE);
     try{
       const fresh=await fetch(event.request);
       if(fresh.ok)cache.put(new Request(url.origin+url.pathname),fresh.clone());
       return fresh;
     }catch{
       return await cache.match(new Request(url.origin+url.pathname))||Response.error();
     }
   })());
   return;
 }
 if(event.request.mode==='navigate'&&(url.pathname.endsWith('/fish.html')||url.pathname.endsWith('/fish-reset.html'))){
   event.respondWith((async()=>{
     const cache=await caches.open(CACHE);
     try{
       const fresh=await fetch(event.request);
       if(fresh.ok)cache.put(new Request(url.origin+url.pathname),fresh.clone());
       return fresh;
     }catch{
       return await cache.match(new Request(url.origin+url.pathname),{ignoreSearch:true})||Response.error();
     }
   })());
   return;
 }
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

