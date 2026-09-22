/* Keeps field/index.html for use with no network. The kept copy answers first, since a weak signal
   hangs a fetch instead of failing it; the network then replaces the copy for the next load. */
const CACHE='r2r-field-v1', PAGE='./';
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c=>c.add(PAGE))); });
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.mode!=='navigate') return;
  const fresh=fetch(e.request).then(r=>{ if(r.ok){ const copy=r.clone(); caches.open(CACHE).then(c=>c.put(PAGE,copy)); } return r; });
  e.respondWith(caches.match(PAGE).then(kept=>{ if(kept){ e.waitUntil(fresh.catch(()=>{})); return kept; } return fresh; }));
});
