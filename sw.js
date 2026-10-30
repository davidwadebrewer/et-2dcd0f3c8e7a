// Ember & Thorn private build eed3b58a62: decrypts game files on demand. The key never leaves this device.
const VER='eed3b58a62', CN='et-pages-'+VER, BASE=new URL('./',self.location).href, G=BASE+'g/';
let KEY=null, MAN=null;
function idbGet(){return new Promise(res=>{try{const o=indexedDB.open('et-pages',1);o.onupgradeneeded=()=>o.result.createObjectStore('kv');
  o.onsuccess=()=>{try{const q=o.result.transaction('kv').objectStore('kv').get('key');q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null)}catch(e){res(null)}};o.onerror=()=>res(null)}catch(e){res(null)}});}
async function getKey(){
  if(KEY) return KEY;
  const k=await idbGet(); if(!k) return null;
  let b=k.replace(/-/g,'+').replace(/_/g,'/'); while(b.length%4) b+='=';
  KEY=await crypto.subtle.importKey('raw',Uint8Array.from(atob(b),c=>c.charCodeAt(0)),'AES-GCM',false,['decrypt']); return KEY;
}
async function dec(buf,aad){const key=await getKey();return crypto.subtle.decrypt({name:'AES-GCM',iv:buf.slice(0,12),additionalData:new TextEncoder().encode(aad)},key,buf.slice(12));}
function getMan(){
  if(!MAN) MAN=(async()=>{const r=await fetch(BASE+'m.bin',{cache:'no-cache'});if(!r.ok) throw new Error('m '+r.status);
    return JSON.parse(new TextDecoder().decode(await dec(new Uint8Array(await r.arrayBuffer()),'manifest')));})().catch(e=>{MAN=null;throw e;});
  return MAN;
}
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('et-pages-')&&k!==CN).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{const k=e.data&&e.data.k;if(k){let b=k.replace(/-/g,'+').replace(/_/g,'/');while(b.length%4)b+='=';
  crypto.subtle.importKey('raw',Uint8Array.from(atob(b),c=>c.charCodeAt(0)),'AES-GCM',false,['decrypt']).then(x=>{KEY=x;}).catch(()=>{});}});
async function body(rel){
  const ck=G+rel; let c=null; try{c=await caches.open(CN);}catch(e){}
  if(c){const hit=await c.match(ck);if(hit) return {buf:await hit.arrayBuffer(),type:hit.headers.get('content-type')};}
  const man=await getMan(), ent=man[rel]; if(!ent) return null;
  const r=await fetch(BASE+'d/'+ent[0]); if(!r.ok) throw new Error('blob '+r.status);
  const buf=await dec(new Uint8Array(await r.arrayBuffer()),rel);
  if(c) c.put(ck,new Response(buf.slice(0),{headers:{'content-type':ent[1]}})).catch(()=>{});
  return {buf,type:ent[1]};
}
async function handle(req){
  const u=new URL(req.url); let rel=decodeURIComponent(u.pathname.slice(new URL(G).pathname.length)); if(rel===''||rel.endsWith('/')) rel+='index.html';
  if(!(await getKey())) return req.mode==='navigate'?Response.redirect(BASE,302):new Response('private',{status:403});
  let b; try{b=await body(rel);}catch(e){return new Response('Could not load '+rel,{status:502});}
  if(!b) return new Response('Not found',{status:404});
  const n=b.buf.byteLength, rg=req.headers.get('range'), h={'content-type':b.type,'accept-ranges':'bytes','cache-control':'no-store'};
  const mm=rg&&/bytes=(\d*)-(\d*)/.exec(rg);
  if(mm){let s=mm[1]===''?Math.max(0,n-(+mm[2])):+mm[1], e=mm[1]!==''&&mm[2]!==''?Math.min(+mm[2],n-1):n-1;
    if(s>=n) return new Response(null,{status:416,headers:{'content-range':'bytes */'+n}});
    return new Response(b.buf.slice(s,e+1),{status:206,headers:Object.assign(h,{'content-range':`bytes ${s}-${e}/${n}`,'content-length':String(e-s+1)})});}
  h['content-length']=String(n); return new Response(b.buf,{status:200,headers:h});
}
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||!e.request.url.startsWith(G))return;e.respondWith(handle(e.request));});
