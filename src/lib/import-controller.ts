import type { SteamData } from '../types';
import {isSteamData} from './steam';
import {validateDataset,emptyDataset,validateSnapshot} from './backup';
import type { ImportOperation, StartResponse, BatchResponse, OperationSuccess, ImportError } from './import-types';
import {applyOperation,candidateLibrary,nextBatch,pendingWork,operationKey,selectWork,summarize,type Freshness} from './import-model';
import type { DatasetSession } from './dataset-session';
export interface ImportLogEntry { at:string; message:string; }
export interface Checkpoint {
 version:1;profile:string;mode:'quick'|'full';phase:'lookup'|'review'|'batch';candidate:SteamData|null;
 token:string;expiresAt:string;operations:ImportOperation[];selected:number[];freshness:Freshness;
 calls:number;allowance:number;failures:{appid:number;kind:string;message:string;code?:'user_skipped'}[];retryAt:number;
 blockedOperation?:ImportOperation;
 log?:ImportLogEntry[];
}
export type ImportStage='idle'|'checking'|'review'|'running'|'paused'|'complete'|'failed';
export interface ImportView {stage:ImportStage;reason:string;checkpoint:Checkpoint|null; saving:boolean;activeGames?:number[];batchStartedAt?:number;pauseRequested?:boolean;}
const message=(e:unknown)=>e instanceof Error?e.message:'The request could not be completed.';
export function readCheckpoint(raw:unknown):Checkpoint|null{
 try {
  if(!raw||typeof raw!=='object')return null;const c=raw as Checkpoint;
  if(c.version!==1||!['lookup','review','batch'].includes(c.phase)||typeof c.profile!=='string'||c.profile.length>2048||!['quick','full'].includes(c.mode)||!Number.isSafeInteger(c.calls)||c.calls<0||!Number.isSafeInteger(c.allowance)||c.allowance<1000||!Array.isArray(c.operations)||c.operations.length>30000||!Array.isArray(c.selected)||c.selected.length>10000||!Array.isArray(c.failures)||c.failures.length>30000||!c.freshness||!Number.isFinite(c.retryAt)||c.retryAt<0||typeof c.token!=='string'||c.token.length>48000||typeof c.expiresAt!=='string')return null;
  if(c.phase!=='lookup'&&(!c.candidate||!Number.isFinite(Date.parse(c.expiresAt))))return null;
  if(c.log!==undefined&&(!Array.isArray(c.log)||c.log.length>100||c.log.some(e=>!e||typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at))||typeof e.message!=='string'||e.message.length>1000)))return null;
  if(c.candidate)validateSnapshot(c.candidate);
  const ids=new Set(c.candidate?.games.map(g=>g.appid)??[]);
  if(c.operations.some(o=>!o||!Number.isSafeInteger(o.appid)||!ids.has(o.appid)||!['progress','schema','rarity'].includes(o.kind))||new Set(c.operations.map(operationKey)).size!==c.operations.length)return null;
  if(c.blockedOperation!==undefined){const b=c.blockedOperation;if(c.phase!=='batch'||!b||!Number.isSafeInteger(b.appid)||b.appid<=0||b.appid>2147483647||!['progress','schema','rarity'].includes(b.kind)||!c.operations.some(o=>o.appid===b.appid&&o.kind===b.kind))return null;}
  if(c.selected.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(c.selected).size!==c.selected.length)return null;
  if(c.failures.some(f=>!f||!Number.isSafeInteger(f.appid)||typeof f.kind!=='string'||typeof f.message!=='string'||f.message.length>4096||(f.code!==undefined&&f.code!=='user_skipped')))return null;
  if(c.candidate)validateDataset({...emptyDataset(),freshness:{[c.candidate.steamid64]:c.freshness}});
  const restored=structuredClone(c);
  restored.failures=restored.failures.filter(f=>f.code==='user_skipped'||f.message!=='Skipped achievement checks because this game has no achievement schema. Previously saved values are retained.');
  return restored;
 }catch{return null;}
}
export class ImportController {
 view:ImportView={stage:'idle',reason:'',checkpoint:null,saving:false};private epoch=0;private active=false;private stop=false;private unlock:(()=>void)|null=null;private abort:AbortController|null=null;
 constructor(private store:DatasetSession,private notify:(view:ImportView)=>void){const c=readCheckpoint(store.current.checkpoint);if(c)this.view={stage:'paused',reason:c.blockedOperation?this.blockedReason(c):'Ready to resume your saved import.',checkpoint:c,saving:false};else if(store.current.checkpoint)this.view={stage:'failed',reason:'The saved import is invalid. Discard it before starting again.',checkpoint:null,saving:false};this.emit();}
 private blockedReason(c:Checkpoint){const b=c.blockedOperation!;const name=c.candidate?.games.find(g=>g.appid===b.appid)?.name??`Game ${b.appid}`;const humanKind={progress:'achievement progress',schema:'achievement details',rarity:'rarity data'}[b.kind];return `${name}: Steam denied access to ${humanKind}. Retry or skip this game.`;}
 private emit(){this.notify({...this.view,checkpoint:this.view.checkpoint?structuredClone(this.view.checkpoint):null});}
 private log(message:string){const c=this.view.checkpoint;if(c)c.log=[...(c.log??[]),{at:new Date(Date.now()).toISOString(),message:message.slice(0,1000)}].slice(-100);}
 private state(stage:ImportStage,reason=''){if(stage!=='running'&&stage!=='checking'){this.view.activeGames=[];this.view.batchStartedAt=undefined;this.view.pauseRequested=false;}this.view.stage=stage;this.view.reason=reason;if(reason)this.log(stage==='complete'?`Import complete · ${this.view.checkpoint?.selected.length??0} games processed`:reason);this.emit();}
 private async lock(){if(this.unlock)return;if(!navigator.locks)throw Error('This browser cannot coordinate imports across tabs. Use a local data file instead.');await new Promise<void>((resolve,reject)=>{navigator.locks.request('achievement-atlas:steam-import',{ifAvailable:true},async lock=>{if(!lock){reject(Error('An import is active in another tab. Continue there or pause it first.'));return;}await new Promise<void>(release=>{this.unlock=release;resolve();});}).catch(reject);});}
 private release(){this.unlock?.();this.unlock=null;}
 private async persist(){const c=this.view.checkpoint;this.view.saving=true;this.emit();try{await this.store.update(d=>{d.checkpoint=c?JSON.parse(JSON.stringify(c)):null;});}finally{this.view.saving=false;this.emit();}}
 private async reserve(amount:number){const c=this.view.checkpoint!;if(c.calls+amount>c.allowance){this.state('paused',`The next request would exceed the ${c.allowance.toLocaleString()}-call allowance. Review the remaining work before allowing more.`);return false;}c.calls+=amount;await this.persist();return true;}
 private async request(path:string,body:unknown):Promise<StartResponse|BatchResponse|ImportError>{
  this.abort=new AbortController();const timer=setTimeout(()=>this.abort?.abort(),35000);
  try{const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:this.abort.signal});const text=await response.text();if(text.length>3*1024*1024)throw Error('The server response was too large. Import paused.');let result;try{result=JSON.parse(text);}catch{throw Error('The server response could not be confirmed. Saved work is safe; reserved calls stay counted.');}
   if(!result||typeof result.ok!=='boolean'||!Number.isSafeInteger(result.attempts)||result.attempts<0||result.attempts>20||(result.retryAfterSeconds!==undefined&&(!Number.isFinite(result.retryAfterSeconds)||result.retryAfterSeconds<0||result.retryAfterSeconds>86400))||(!result.ok&&(typeof result.code!=='string'||typeof result.message!=='string'||result.message.length>4096)))throw Error('The server response could not be confirmed. Reserved calls stay counted.');return result;
  }finally{clearTimeout(timer);this.abort=null;}
 }
 async check(profile:string,mode:'quick'|'full'='quick'){
  if(this.active||['checking','running','review'].includes(this.view.stage))return;
  if(this.store.current.checkpoint){this.state('paused','Resume or discard the unfinished import before starting a new one.');return;}
  if(!profile.trim()){this.state('failed','Enter a Steam profile link or SteamID.');return;}
  this.active=true;this.stop=false;this.view.pauseRequested=false;const generation=++this.epoch;
  try{await this.lock();const sid=this.store.current.active?.steamid64;const refreshed=sid?this.store.current.refreshes?.[sid]:undefined;
   if(sid&&profile.includes(sid)&&refreshed&&Date.now()-Date.parse(refreshed)<21600000)throw Error(`Refresh is available after ${new Date(Date.parse(refreshed)+21600000).toLocaleString()}. Your saved library remains available.`);
   this.view.checkpoint={version:1,profile:profile.trim(),mode,phase:'lookup',candidate:null,token:'',expiresAt:'',operations:[],selected:[],freshness:{},calls:0,allowance:1000,failures:[],retryAt:0};
   this.state('checking','Checking the public profile and library.');await this.lookup(generation,false);
  }catch(e){if(generation===this.epoch)this.state('paused',message(e));}finally{this.release();this.active=false;}
 }
 private async lookup(generation:number,renew:boolean){
  const c=this.view.checkpoint!;if(!await this.reserve(3))return;if(generation!==this.epoch||this.stop){if(generation===this.epoch){c.calls-=3;await this.persist();this.state('paused','Import paused before dispatch.');}return;}const result=await this.request('/api/steam/start',{profile:c.candidate?.steamid64??c.profile});if(generation!==this.epoch)return;
  if(result.attempts>3)throw Error('Invalid lookup accounting. Reserved calls stay counted.');
  if(!result.ok){c.calls-=3-result.attempts;c.retryAt=result.retryAfterSeconds?Date.now()+result.retryAfterSeconds*1000:0;await this.persist();this.state('paused',result.message);return;}
  if(!('data'in result)||!isSteamData(result.data)||typeof result.token!=='string'||!Number.isFinite(Date.parse(result.expiresAt)))throw Error('Invalid profile response. Import paused without replacing saved data.');
  c.calls-=3-result.attempts;c.token=result.token;c.expiresAt=result.expiresAt;
  if(renew){if(result.data.steamid64!==c.candidate?.steamid64)throw Error('Profile changed during access verification. Import paused.');const ids=new Set(result.data.games.map(g=>g.appid));c.operations=c.operations.filter(o=>ids.has(o.appid));c.candidate=candidateLibrary(result.data,c.candidate);}
  else {const previous=this.store.current.active;c.freshness=structuredClone(this.store.current.freshness[result.data.steamid64]??{});c.operations=selectWork(result.data,previous,c.freshness,c.mode);c.selected=[...new Set(c.operations.map(o=>o.appid))];c.candidate=candidateLibrary(result.data,previous);c.phase='review';}
  // Resolve vanity references before applying the per-profile cooldown. Keep the
  // verified work and its already-spent setup calls, but prohibit batch dispatch
  // until the persisted deadline. Reload and explicit Resume share this guard.
  const lastRefresh=this.store.current.refreshes?.[result.data.steamid64];
  const cooldownUntil=lastRefresh?Date.parse(lastRefresh)+21600000:0;
  if(Number.isFinite(cooldownUntil)&&cooldownUntil>Date.now()){
   c.retryAt=Math.max(c.retryAt,cooldownUntil);await this.persist();
   this.state('paused',`Refresh is available after ${new Date(cooldownUntil).toLocaleString()}. Profile verification calls stay counted; your saved library remains available.`);return;
  }
  await this.persist();this.state(this.stop?'paused':'review',this.stop?'Paused. Choose Resume when ready.':'Review this profile and the work before starting.');
 }
 pause(reason='Import paused. Saved work can be resumed.'){this.stop=true;this.view.pauseRequested=true;if(this.view.stage==='review'){this.state('paused',reason);this.release();}else if(['running','checking'].includes(this.view.stage)){this.view.reason=`${reason} No more batches will start; the current request may finish.`;this.emit();}}
 invalidate(){this.stop=true;this.epoch++;this.abort?.abort();this.release();this.view={stage:'idle',reason:'',checkpoint:null,saving:false};this.emit();}
 async discard(){this.invalidate();await this.store.update(d=>{d.checkpoint=null;});}
 async allowMore(){if(this.view.stage!=='paused'||!this.view.checkpoint)return;this.view.checkpoint.allowance+=1000;try{await this.persist();await this.resume();}catch(e){this.state('paused',message(e));}}
 async retrySaving(){try{await this.store.retry();const saved=readCheckpoint(this.store.current.checkpoint);if(saved)this.view.checkpoint=saved;this.state('paused','Results saved. Choose Resume to continue.');}catch(e){this.state('paused',message(e));}}
 async skipBlockedGame(){
  if(this.active||this.view.stage!=='paused'||this.view.saving||this.store.unsaved||!this.view.checkpoint?.blockedOperation)return;
  this.active=true;const generation=++this.epoch;
  try{
   await this.lock();if(generation!==this.epoch)return;
   if(this.store.unsaved)throw Error('Save or export unsaved results before skipping a game.');
   const original=this.view.checkpoint;const blocked=original?.blockedOperation;
   if(!original||!blocked||!original.operations.some(o=>operationKey(o)===operationKey(blocked)))throw Error('The blocked operation changed. Review the current import before skipping.');
   const next=structuredClone(original);const skipped=next.operations.filter(o=>o.appid===blocked.appid);
   next.operations=next.operations.filter(o=>o.appid!==blocked.appid);
   for(const op of skipped)next.failures.push({...op,code:'user_skipped',message:`User skipped the remaining ${op.kind} check after Steam denied access. Earlier successful results are kept.`});
   delete next.blockedOperation;
   this.view.saving=true;this.emit();
   await this.store.update(d=>{if(generation!==this.epoch)throw Error('Import changed before the skip could be saved.');d.checkpoint=JSON.parse(JSON.stringify(next));});
   if(generation!==this.epoch)return;
   this.view.checkpoint=next;
   const name=next.candidate?.games.find(g=>g.appid===blocked.appid)?.name??`Game ${blocked.appid}`;
   this.state('paused',`Skipped remaining checks for ${name}. Choose Resume to continue.`);
  }catch(e){if(generation===this.epoch)this.state('paused',this.store.unsaved?'The skip could not be saved. Requests have stopped; retry saving or export unsaved results.':message(e));}
  finally{if(generation===this.epoch){this.view.saving=false;this.emit();}this.release();this.active=false;}
 }
 async resume(){
  if(this.active||!this.view.checkpoint||['checking','running'].includes(this.view.stage))return;
  if(this.view.checkpoint.retryAt>Date.now()){this.state('paused','Requests are temporarily limited. Wait until the displayed time, then choose Resume.');return;}
  this.active=true;this.stop=false;this.view.pauseRequested=false;const generation=++this.epoch;
  try{await this.lock();if(this.store.unsaved)throw Error('New results could not be saved. Retry saving or export unsaved results before continuing.');
   const c=this.view.checkpoint;delete c.blockedOperation;
   c.operations=pendingWork(c.operations,c.freshness);
   // Old checkpoints recorded absence as prose without a date. Recheck that
   // exact outcome once rather than guessing its age or retrying rarity blindly.
   const legacyNoSchema='Steam returned no achievement schema for this game. Previously saved values are retained.';
   const recheck=new Set(c.failures.filter(f=>f.kind==='schema'&&f.code===undefined&&f.message===legacyNoSchema&&c.operations.some(o=>o.appid===f.appid)).map(f=>f.appid));
   for(const appid of recheck)if(!c.operations.some(o=>o.appid===appid&&o.kind==='schema'))c.operations.push({appid,kind:'schema'});
   if(recheck.size){c.operations=pendingWork(c.operations,c.freshness);c.failures=c.failures.filter(f=>!(recheck.has(f.appid)&&f.kind==='schema'&&f.code===undefined&&f.message===legacyNoSchema));}
   if(c.phase==='lookup'){this.state('checking');await this.lookup(generation,false);return;}
   if(c.operations.length&&Date.parse(c.expiresAt)<=Date.now()+5000){this.state('checking','Rechecking access to resume saved work.');await this.lookup(generation,true);if(generation!==this.epoch||this.view.stage!=='review')return;}
   c.phase='batch';this.state('running','Keep this tab open while importing.');await this.persist();
   while(c.operations.length&&!this.stop&&generation===this.epoch){
    if(document.hidden){this.stop=true;break;}
    if(this.stop||document.hidden||generation!==this.epoch){this.stop=true;break;}
    const ops=nextBatch(c.operations);delete c.blockedOperation;if(!await this.reserve(ops.length))return;
    if(generation!==this.epoch)return;if(this.stop||document.hidden){c.calls-=ops.length;await this.persist();this.stop=true;break;}
    const names=[...new Set(ops.map(o=>o.appid))].map(id=>c.candidate!.games.find(g=>g.appid===id)?.name??`Game ${id}`);
    this.view.activeGames=[...new Set(ops.map(o=>o.appid))];this.view.batchStartedAt=Date.now();this.view.reason=`Checking ${names.join(', ')}…`;this.log(this.view.reason);this.emit();
    const result=await this.request('/api/steam/batch',{token:c.token,operations:ops});if(generation!==this.epoch)return;this.view.activeGames=[];this.view.batchStartedAt=undefined;
    if(result.attempts>ops.length)throw Error('Invalid batch accounting. Reserved calls stay counted.');
    if(!result.ok){if(result.code==='expired_permission')c.expiresAt=new Date(0).toISOString();c.calls-=ops.length-result.attempts;c.retryAt=result.retryAfterSeconds?Date.now()+result.retryAfterSeconds*1000:0;await this.persist();this.state('paused',result.message);return;}
    if(!('results'in result)||!Array.isArray(result.results)||typeof result.paused!=='boolean')throw Error('Invalid batch response. Reserved calls stay counted.');
    const requested=new Set(ops.map(operationKey)),seen=new Set<string>();
    for(const r of result.results){if(!r||typeof r!=='object')throw Error('Invalid batch result.');const k=operationKey(r);if(!requested.has(k)||seen.has(k)||!['success','error'].includes(r.status))throw Error('Unexpected batch results. Reserved calls stay counted.');seen.add(k);if(r.status==='error'&&(typeof r.message!=='string'||typeof r.retryable!=='boolean'||typeof r.code!=='string'))throw Error('Invalid error response.');if(r.status==='success'){if(!Array.isArray(r.data)||r.data.length>10000)throw Error('Invalid achievement response.');const names=new Set<string>();for(const row of r.data){if(!row||typeof row.api_name!=='string'||!row.api_name||names.has(row.api_name))throw Error('Invalid or duplicate achievement result.');names.add(row.api_name);if(r.kind==='rarity'&&(!('global_completion_rate_pct'in row)||!Number.isFinite(row.global_completion_rate_pct)||row.global_completion_rate_pct<0||row.global_completion_rate_pct>100))throw Error('Invalid rarity result.');}}}
    // Apply to a clone first so malformed rows cannot half-publish a batch.
    const candidate=structuredClone(c.candidate!);const fresh=structuredClone(c.freshness);const finished=new Set<string>();let failure='';let blocked:ImportOperation|undefined;
    const noAchievementGames=new Set(result.results.filter(r=>r.kind==='schema'&&(r.status==='success'&&!r.data.length||r.status==='error'&&!r.retryable&&r.code==='no_achievement_schema')).map(r=>r.appid));
    for(const r of result.results){
     if(noAchievementGames.has(r.appid)&&r.kind!=='schema'&&r.status==='error'&&!r.retryable&&r.code==='unavailable'){finished.add(operationKey(r));continue;}
     const noSchema=r.kind==='schema'&&(r.status==='success'&&!r.data.length||r.status==='error'&&!r.retryable&&r.code==='no_achievement_schema');
     if(noSchema){fresh[r.appid]={...fresh[r.appid],noAchievementSchema:new Date(Date.now()).toISOString()};finished.add(operationKey(r));continue;}
     if(r.status==='success'){
      applyOperation(candidate,r as OperationSuccess);validateSnapshot(candidate);fresh[r.appid]={...fresh[r.appid],[r.kind]:new Date(Date.now()).toISOString()};
      if(r.kind==='schema')delete fresh[r.appid].noAchievementSchema;
      if(r.kind==='progress')delete fresh[r.appid].progressUnavailable;
      finished.add(operationKey(r));
     }else{if(r.kind==='progress'&&!r.retryable&&['no_stats','unavailable'].includes(r.code))fresh[r.appid]={...fresh[r.appid],progressUnavailable:new Date(Date.now()).toISOString()};failure=r.message;if(r.retryable&&r.code==='steam_access_denied'&&!blocked)blocked={appid:r.appid,kind:r.kind};if(!r.retryable){finished.add(operationKey(r));c.failures.push({appid:r.appid,kind:r.kind,message:r.message});}}
    }
    for(const r of result.results){const name=candidate.games.find(g=>g.appid===r.appid)?.name??`Game ${r.appid}`;const kind={schema:'Achievement details',progress:'Progress',rarity:'Rarity'}[r.kind];this.log(`${name} · ${kind}: ${r.status==='success'?'received':r.code==='no_achievement_schema'?'no achievements; remaining checks skipped':noAchievementGames.has(r.appid)&&!r.retryable?'not needed; no achievements':r.retryable?'paused — '+r.message:'unavailable; existing data kept'}`);}
    this.view.reason='Saving batch results…';
    if(blocked)c.blockedOperation=blocked;
    c.calls-=ops.length-result.attempts;c.candidate=candidate;c.freshness=fresh;c.operations=pendingWork(c.operations.filter(o=>!finished.has(operationKey(o))),fresh);c.retryAt=result.retryAfterSeconds?Date.now()+result.retryAfterSeconds*1000:0;await this.persist();
    this.log(`Batch saved · ${result.attempts} API calls · ${new Set(c.operations.map(o=>o.appid)).size} games remaining`);this.view.reason='Batch saved. Preparing the next games…';this.emit();
    if(c.blockedOperation||result.paused||(!finished.size&&c.operations.length)){this.state('paused',c.blockedOperation?this.blockedReason(c):failure||'No progress was confirmed. Choose Resume to retry unfinished work.');return;}
   }
   if(generation!==this.epoch)return;
   if(this.stop){this.state('paused','Import paused. Saved results are ready when you return; choose Resume.');return;}
   const completed=summarize(c.candidate!);await this.store.update(d=>{d.active=completed;d.freshness[completed.steamid64]=c.freshness;d.refreshes[completed.steamid64]=new Date().toISOString();d.checkpoint=null;});
   this.state('complete',`${c.selected.length} selected games processed. ${c.failures.length} unavailable operations retained prior values. Unselected games keep their earlier check dates.`);
  }catch(e){if(generation===this.epoch)this.state('paused',this.store.unsaved?'Could not save the latest results. Requests have stopped; retry saving or export unsaved results.':message(e));}finally{this.release();this.active=false;}
 }
}
