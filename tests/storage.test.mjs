import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
async function moduleUrl(file, deps={}) { let {outputText}=ts.transpileModule(await readFile(new URL(file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});for(const [name,url]of Object.entries(deps))outputText=outputText.replaceAll(JSON.stringify(name),JSON.stringify(url)).replaceAll(`'${name}'`,JSON.stringify(url));return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`; }
const steam=await moduleUrl('../src/lib/steam.ts');const plan=await moduleUrl('../src/lib/plan.ts',{'./steam':steam});const backup=await moduleUrl('../src/lib/backup.ts',{'./steam':steam,'./plan':plan});
const {loadDataset,saveDataset,deleteDataset,resetCorruptDataset,StorageError}=await import(await moduleUrl('../src/lib/browser-storage.ts',{'./backup':backup,'./plan':plan}));
const sample=JSON.parse(await readFile(new URL('../public/demo.json',import.meta.url),'utf8'));
function reset(){globalThis.indexedDB=new IDBFactory();const m=new Map();globalThis.localStorage={get length(){return m.size;},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
test('concurrent writers cannot clobber each other',async()=>{
 reset();const d=await loadDataset();assert.equal(d.revision,0);
 const results=await Promise.allSettled([saveDataset({...d,preferences:{planPinned:true}},0),saveDataset({...d,preferences:{planPinned:false}},0)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const failure=results.find(r=>r.status==='rejected').reason;assert.ok(failure instanceof StorageError);assert.equal(failure.kind,'conflict');assert.equal((await loadDataset()).revision,1);
});
test('deletion tombstone prevents stale imports and legacy resurrection',async()=>{
 reset();const initial=await loadDataset();const saved=await saveDataset({...initial,active:sample},0);const deleted=await deleteDataset(saved.revision);
 await assert.rejects(saveDataset(saved,saved.revision),e=>e.kind==='conflict');
 // Even using a current revision cannot bypass deletion generation.
 await assert.rejects(saveDataset(saved,deleted.revision),e=>e.kind==='conflict');
 localStorage.setItem('achievement-atlas:data',JSON.stringify(sample));const loaded=await loadDataset();assert.equal(loaded.active,null);assert.equal(loaded.generation,1);
});
test('migration commits active library, all plans, and preferences together',async()=>{
 reset();localStorage.setItem('achievement-atlas:data',JSON.stringify(sample));localStorage.setItem('achievement-atlas:plan:76561198000000001','[]');localStorage.setItem('achievement-atlas:planPinned','1');localStorage.setItem('achievement-atlas:wsf:floor','30');
 const migrated=await loadDataset();assert.equal(migrated.active.steamid64,sample.steamid64);assert.deepEqual(migrated.plans,{'76561198000000001':[]});assert.equal(migrated.preferences.optimizerFloor,30);assert.equal(migrated.preferences.planPinned,true);assert.equal(localStorage.length,0);assert.equal((await loadDataset()).revision,1);
});
test('corrupt legacy is preserved for recovery and distinguished from absence',async()=>{
 reset();localStorage.setItem('achievement-atlas:data','broken');await assert.rejects(loadDataset(),e=>e.kind==='corrupt'&&e.recoveryRecords['achievement-atlas:data']==='broken');assert.equal(localStorage.getItem('achievement-atlas:data'),'broken');
});
test('unavailable storage is not silently reported as an empty library',async()=>{reset();globalThis.indexedDB=undefined;await assert.rejects(loadDataset(),e=>e.kind==='unavailable');});
test('failed candidate validation leaves prior committed data untouched',async()=>{reset();const d=await loadDataset();const saved=await saveDataset({...d,active:sample},0);await assert.rejects(saveDataset({...saved,preferences:{optimizerTarget:999}},saved.revision));assert.equal((await loadDataset()).active.steamid64,sample.steamid64);assert.equal((await loadDataset()).revision,1);});

test('quota failure aborts migration without removing recoverable legacy records',async()=>{
 reset();localStorage.setItem('achievement-atlas:data',JSON.stringify(sample));
 const original=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(){throw new DOMException('Disk full','QuotaExceededError');};
 try {await assert.rejects(loadDataset(),e=>e.kind==='unavailable');assert.ok(localStorage.getItem('achievement-atlas:data'));}
 finally {IDBObjectStore.prototype.put=original;}
 assert.equal((await loadDataset()).active.steamid64,sample.steamid64);
});

test('version-one IndexedDB active snapshot migrates with local plans',async()=>{
 reset();
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('achievement-atlas',1);r.onupgradeneeded=()=>r.result.createObjectStore('snapshots');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 await new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put(sample,'active');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
 localStorage.setItem('achievement-atlas:plan:76561198000000001','[]');
 const result=await loadDataset();assert.equal(result.active.steamid64,sample.steamid64);assert.ok(result.plans['76561198000000001']);assert.equal(result.revision,1);
});
async function writeRawDataset(value) {
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('achievement-atlas',2);r.onupgradeneeded=()=>{for(const name of ['datasets','snapshots'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 await new Promise((resolve,reject)=>{const tx=db.transaction('datasets','readwrite');tx.objectStore('datasets').put(value,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
}
async function capturedRecovery() {try{await loadDataset();assert.fail('Expected corrupt storage');}catch(e){assert.equal(e.kind,'corrupt');return e.recoveryRecords;}}
test('explicit corrupt reset preserves known revisions and creates a non-resurrecting tombstone',async()=>{
 reset();await writeRawDataset({version:1,revision:7,generation:4,active:'corrupt'});const captured=await capturedRecovery();
 const cleared=await resetCorruptDataset(captured);assert.equal(cleared.revision,8);assert.equal(cleared.generation,5);assert.equal(cleared.active,null);
 localStorage.setItem('achievement-atlas:data',JSON.stringify(sample));assert.equal((await loadDataset()).active,null);
});
test('corrupt reset rejects data changed since recovery preview and never deletes a valid dataset',async()=>{
 reset();await writeRawDataset({version:1,revision:3,generation:1,active:'corrupt'});const captured=await capturedRecovery();
 const valid={version:1,revision:4,generation:1,active:sample,plans:{},preferences:{},freshness:{},refreshes:{},checkpoint:null};await writeRawDataset(valid);
 await assert.rejects(resetCorruptDataset(captured),e=>e.kind==='conflict');assert.equal((await loadDataset()).active.steamid64,sample.steamid64);
 await assert.rejects(resetCorruptDataset({dataset:valid}),e=>e.kind==='conflict');assert.equal((await loadDataset()).revision,4);
});
test('legacy recovery reset compares captured records before clearing them',async()=>{
 reset();localStorage.setItem('achievement-atlas:data','broken');const captured=await capturedRecovery();
 localStorage.setItem('achievement-atlas:planPinned','1');await assert.rejects(resetCorruptDataset(captured),e=>e.kind==='conflict');assert.equal(localStorage.getItem('achievement-atlas:data'),'broken');
 const updated=await capturedRecovery();const cleared=await resetCorruptDataset(updated);assert.equal(cleared.generation,1);assert.equal(localStorage.length,0);assert.equal((await loadDataset()).active,null);
});
test('quota failure during corrupt reset leaves original recovery data intact',async()=>{
 reset();localStorage.setItem('achievement-atlas:data','broken');const captured=await capturedRecovery();const original=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(){throw new DOMException('Disk full','QuotaExceededError');};
 try{await assert.rejects(resetCorruptDataset(captured),e=>e.kind==='unavailable');assert.equal(localStorage.getItem('achievement-atlas:data'),'broken');}finally{IDBObjectStore.prototype.put=original;}
 assert.deepEqual(await capturedRecovery(),captured);
});
test('corrupt legacy IndexedDB snapshot resets only after its captured value still matches',async()=>{
 reset();const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('achievement-atlas',1);r.onupgradeneeded=()=>r.result.createObjectStore('snapshots');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 await new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put({broken:true},'active');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
 localStorage.setItem('achievement-atlas:plan:76561198000000001','[]');const captured=await capturedRecovery();assert.deepEqual(captured.active,{broken:true});
 const next=await resetCorruptDataset(captured);assert.equal(next.active,null);assert.equal(next.generation,1);assert.equal(localStorage.length,0);assert.deepEqual((await loadDataset()).plans,{});
});
