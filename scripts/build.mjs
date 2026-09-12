import {build} from 'esbuild';
import {mkdir,readFile,writeFile,copyFile,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const env={...process.env};
try{for(const line of (await readFile('.env.local','utf8')).split(/\r?\n/)){const match=line.match(/^([A-Z_]+)=(.*)$/);if(match&&!env[match[1]])env[match[1]]=match[2].trim().replace(/^['"]|['"]$/g,'');}}catch{}
await mkdir('dist',{recursive:true});
const publicKey=env.SUPABASE_PUBLISHABLE_KEY||'';
if(publicKey.startsWith('sb_secret_'))throw new Error('Utiliser une publishable key, jamais une clé secrète Supabase.');
if(publicKey.split('.').length===3){try{const payload=JSON.parse(Buffer.from(publicKey.split('.')[1],'base64url').toString());if(payload.role==='service_role')throw new Error('Une clé service_role ne peut pas être publiée dans le navigateur.');}catch(error){if(error.message.includes('service_role'))throw error;}}
await build({entryPoints:['src/app.js'],outfile:'dist/app.js',bundle:true,minify:true,format:'esm',target:['es2022'],define:{__SUPABASE_URL__:JSON.stringify(env.SUPABASE_URL || ''),__SUPABASE_KEY__:JSON.stringify(env.SUPABASE_PUBLISHABLE_KEY || '')}});
for(const name of ['index.html','styles.css','icon.svg','manifest.webmanifest'])await copyFile(`public/${name}`,`dist/${name}`);
await writeFile('dist/.nojekyll','');
const hash=createHash('sha256').update(await readFile('dist/app.js')).update(await readFile('dist/styles.css')).update(await readFile('dist/index.html')).digest('hex').slice(0,12);
const sw=`const CACHE='cockpit-${hash}';const ASSETS=['./','./index.html','./app.js','./styles.css','./icon.svg','./manifest.webmanifest'];self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('cockpit-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return r;}).catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match('./index.html'):Response.error()))));});`;
await writeFile('dist/sw.js',sw);
await cp('dist','docs',{recursive:true});
console.log(`Built dist/ and docs/ (${hash}). Live mode ${env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY?'configured':'not configured'}.`);
