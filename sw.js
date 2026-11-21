const CACHE='daylog-shell-v7';
const files=['./','index.html','app.js','icons.js','styles.css','journal.js','market.js','market.json','article.html','article.js','article.css','writing.js','lxgwwenkai-lite-gb2312.woff2','forest.webp','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(files)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('daylog-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==location.origin)return;
 if(!files.some(f=>new URL(f,self.registration.scope).pathname===url.pathname))return;
 event.respondWith(fetch(event.request).then(response=>{
   if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)))}return response
 }).catch(()=>caches.match(event.request).then(cached=>cached||Response.error())))
});

