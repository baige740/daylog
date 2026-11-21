const CACHE='daylog-shell-v12';
const files=['./','index.html','app.js','article.js','boot.js','auth.js','auth.css','icons.js','styles.css','extras.js','extras.css','media.js','insights.js','journal.js','market.js','market.json','article.html','article.css','writing.js','forest.webp','lxgwwenkai-common.woff2','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(files)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 const previousShell=keys.some(key=>key.startsWith('daylog-shell-')&&key!==CACHE);
 await Promise.all(keys.filter(key=>key.startsWith('daylog-shell-')&&key!==CACHE).map(key=>caches.delete(key)));
 await self.clients.claim();
 if(previousShell){
  const clients=await self.clients.matchAll({type:'window'});
  clients.forEach(client=>client.navigate(client.url).catch(()=>null));
 }
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==location.origin)return;
 const scope=new URL(self.registration.scope).pathname;
 if(!url.pathname.startsWith(scope))return;
 event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   const cached=await cache.match(event.request,{ignoreSearch:true});
   const network=fetch(event.request).then(response=>{
     if(response.ok)cache.put(event.request,response.clone());
     return response;
   }).catch(()=>null);
   if(event.request.mode==='navigate')return await network||cached||Response.error();
   if(cached){event.waitUntil(network);return cached}
   const fresh=await network;
   return fresh||Response.error();
 })());
});

