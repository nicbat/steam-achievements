import type { Achievement, SteamData } from '../types';
import type { ImportOperation, OperationSuccess, ProgressRow, SchemaRow, RarityRow } from './import-types';
export type Freshness = Record<string, {progress?: string; schema?: string; rarity?: string; progressUnavailable?: string; noAchievementSchema?: string}>;
export const operationKey=(o:ImportOperation)=>`${o.appid}:${o.kind}`;
const stale=(date:string|undefined,days:number,now:number)=>!date||now-Date.parse(date)>=days*86400000||Date.parse(date)>now||!Number.isFinite(Date.parse(date));
export const hasNoAchievementSchema=(fields:Freshness[string]|undefined,now=Date.now())=>!!fields?.noAchievementSchema&&!stale(fields.noAchievementSchema,7,now);
export function pendingWork(operations:ImportOperation[],freshness:Freshness,now=Date.now()):ImportOperation[]{
 const games=new Map<number,ImportOperation[]>();
 for(const op of operations){if(hasNoAchievementSchema(freshness[op.appid],now))continue;const ops=games.get(op.appid)??[];ops.push(op);games.set(op.appid,ops);}
 return [...games.values()].flatMap(ops=>[...ops.filter(o=>o.kind==='schema'),...ops.filter(o=>o.kind!=='schema')]);
}
export function selectWork(next:SteamData,previous:SteamData|null,freshness:Freshness,mode:'quick'|'full',now=Date.now()):ImportOperation[]{
 const old=new Map(previous?.steamid64===next.steamid64?previous.games.map(g=>[g.appid,g]):[]);
 return next.games.flatMap(g=>{
  const p=old.get(g.appid),f=previous?.steamid64===next.steamid64?(freshness[g.appid]??{}):{};
  if(hasNoAchievementSchema(f,now))return [];
  const selected=mode==='full'||!p||!f.progress||p.playtime_forever_min!==g.playtime_forever_min||p.last_played!==g.last_played||g.playtime_2weeks_min>0;
  if(!selected)return [];
  const ops:ImportOperation[]=[];
  if(!p?.achievements.length||stale(f.schema,7,now))ops.push({appid:g.appid,kind:'schema'});
  const progressUnavailable=p&&p.playtime_forever_min===g.playtime_forever_min&&p.last_played===g.last_played&&!stale(f.progressUnavailable,1,now);
  if(!progressUnavailable)ops.push({appid:g.appid,kind:'progress'});
  if(!p?.achievements.length||stale(f.rarity,1,now))ops.push({appid:g.appid,kind:'rarity'});
  return ops;
 });
}
export function candidateLibrary(next:SteamData,previous:SteamData|null):SteamData{
 const old=new Map(previous?.steamid64===next.steamid64?previous.games.map(g=>[g.appid,g]):[]);
 return {...next,games:next.games.map(g=>{const p=old.get(g.appid);return p?{...g,has_achievements:p.has_achievements,achievements_total:p.achievements_total,achievements_unlocked:p.achievements_unlocked,completion_rate_pct:p.completion_rate_pct,achievements:structuredClone(p.achievements)}:g})};
}
export function applyOperation(data:SteamData,result:OperationSuccess):void{
 const game=data.games.find(g=>g.appid===result.appid);if(!game)throw Error('Result is outside the selected library.');
 const existing=new Map(game.achievements.map(a=>[a.api_name,a]));
 const empty=(id:string):Achievement=>({api_name:id,name:id,description:null,unlocked:false,unlock_time:null,global_completion_rate_pct:null,icon:null,icon_gray:null});
 if(result.kind==='schema'&&!result.data.length)return;
 if(result.kind==='schema')game.achievements=(result.data as SchemaRow[]).map(r=>({...empty(r.api_name),...existing.get(r.api_name),...r}));
 else if(result.kind==='progress'){
  for(const r of result.data as ProgressRow[]){const a=existing.get(r.api_name)??empty(r.api_name);existing.set(r.api_name,{...a,unlocked:r.unlocked,unlock_time:r.unlock_time,name:a.name===a.api_name?r.name:a.name,description:a.description??r.description});}
  game.achievements=[...existing.values()];
 }else for(const r of result.data as RarityRow[]){const a=existing.get(r.api_name);if(a)a.global_completion_rate_pct=r.global_completion_rate_pct;}
 game.achievements_total=game.achievements.length;game.achievements_unlocked=game.achievements.filter(a=>a.unlocked).length;game.has_achievements=game.achievements_total>0;
 game.completion_rate_pct=game.achievements_total?100*game.achievements_unlocked/game.achievements_total:null;
}
export function summarize(data:SteamData):SteamData{
 const g=data.games;return {...data,collected_at:new Date().toISOString(),totals:{owned_games:g.length,games_played:g.filter(x=>x.playtime_forever_min>0).length,games_with_achievements:g.filter(x=>x.has_achievements).length,total_playtime_min:g.reduce((n,x)=>n+x.playtime_forever_min,0),total_playtime_hours:g.reduce((n,x)=>n+x.playtime_forever_min,0)/60,total_achievements:g.reduce((n,x)=>n+x.achievements_total,0),total_achievements_unlocked:g.reduce((n,x)=>n+x.achievements_unlocked,0)}};
}
export function nextBatch(operations:ImportOperation[]):ImportOperation[]{const games=new Set<number>();const batch:ImportOperation[]=[];for(const op of operations){if(!games.has(op.appid)&&games.size===3)break;games.add(op.appid);batch.push(op);if(batch.length===9)break;}return batch;}
