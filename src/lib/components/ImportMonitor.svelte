<script lang="ts">
 import {tick} from 'svelte';
 import {Check, Circle, Minus, Pause} from '@lucide/svelte';
 import {Button} from '#lib/components/ui/button/index.js';
 import type {ImportView} from '#lib/import-controller.js';
 let {state:importState}:{state:ImportView}=$props();
 const cp=$derived(importState.checkpoint);
 const pending=$derived(new Set(cp?.operations.map(op=>op.appid)??[]));
 const active=$derived(new Set(importState.activeGames??[]));
 const failed=$derived(new Set(cp?.failures.map(f=>f.appid)??[]));
 const skipped=$derived(new Set(cp?.failures.filter(f=>f.code==='user_skipped').map(f=>f.appid)??[]));
 const games=$derived(new Map(cp?.candidate?.games.map(game=>[game.appid,game])??[]));
 let viewport:HTMLDivElement|undefined=$state();
 let following=$state(true);
 let now=$state(Date.now());
 $effect(()=>{if(importState.batchStartedAt){now=Date.now();const timer=setInterval(()=>now=Date.now(),1000);return()=>clearInterval(timer);}});
 const elapsed=$derived(importState.batchStartedAt?Math.max(0,Math.floor((now-importState.batchStartedAt)/1000)):0);
 let scrollTop=$state(0);
 const start=$derived(Math.max(0,Math.floor(scrollTop/64)-3));
 const visible=$derived(cp?.selected.slice(start,start+12)??[]);
 const firstActive=$derived(importState.activeGames?.[0]);
 async function follow(){
  following=true;await tick();
  const index=cp?.selected.indexOf(firstActive??-1)??-1;
  if(index>=0&&viewport){const lastFullRow=Math.floor(Math.max(0,viewport.scrollHeight-viewport.clientHeight)/64)*64;viewport.scrollTop=Math.min(index*64,lastFullRow);}
 }
 $effect(()=>{if(firstActive&&following)void follow();});
 function status(id:number){
  if(cp?.blockedOperation?.appid===id)return 'Needs attention';
  if(active.has(id))return 'Checking';
  if(pending.has(id))return importState.stage==='paused'?'Waiting to resume':'Waiting';
  if(skipped.has(id))return 'Skipped';
  if(cp?.freshness[id]?.noAchievementSchema)return 'No achievements';
  if(failed.has(id)||cp?.freshness[id]?.progressUnavailable)return 'Some data unavailable';
  return 'Checked';
 }
</script>
{#if cp?.selected.length}
 <section aria-label="Game progress" class="space-y-2">
  <div class="flex min-h-9 items-center justify-between gap-2">
   <h3 class="text-sm font-medium">Games</h3>
   {#if firstActive&&!following}<Button variant="ghost" size="sm" onclick={follow}>Show current games</Button>{:else}<span class="text-xs text-muted-foreground">{importState.stage==='running'?(active.size?`Checking ${active.size} games (${elapsed}s)`:importState.pauseRequested?'Finishing…':'Saving progress…'):importState.stage==='complete'?'Finished':'Saved progress'}</span>{/if}
  </div>
  <!-- Keyboard focus lets keyboard users scroll the game list. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div bind:this={viewport} class="relative h-48 sm:h-60 overflow-y-auto rounded-lg border border-border bg-background/30 overscroll-contain" onwheel={()=>following=false} ontouchmove={()=>following=false} onkeydown={(event)=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End'].includes(event.key))following=false}} onscroll={(event)=>scrollTop=event.currentTarget.scrollTop} tabindex="0" role="region" aria-label="Selected games">
   <ul class="divide-y divide-border">
    {#if start}<li aria-hidden="true" class="border-0!" style:height={`${start*64}px`}></li>{/if}
    {#each visible as id, index (id)}
     {@const label=status(id)}
     <li aria-posinset={start+index+1} aria-setsize={cp.selected.length} data-game-id={id} class={["flex h-16 items-center gap-3 px-3",active.has(id)&&"bg-primary/5"]}>
      <span class="shrink-0" class:text-primary={active.has(id)||label==='Checked'} class:text-muted-foreground={!active.has(id)&&label!=='Checked'} aria-hidden="true">
       {#if active.has(id)}<Circle class="size-4 fill-primary/20"/>{:else if label==='Checked'}<Check class="size-4"/>{:else if label==='Needs attention'}<Pause class="size-4"/>{:else if pending.has(id)}<Circle class="size-4"/>{:else}<Minus class="size-4"/>{/if}
      </span>
      <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium" title={games.get(id)?.name??`Game ${id}`}>{games.get(id)?.name??`Game ${id}`}</p><p class="text-xs text-muted-foreground">{label}</p></div>
     </li>
    {/each}
    {#if cp.selected.length>start+visible.length}<li aria-hidden="true" class="border-0!" style:height={`${(cp.selected.length-start-visible.length)*64}px`}></li>{/if}
   </ul>
  </div>
 </section>
{/if}
