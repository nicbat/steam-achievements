<script lang="ts">
 import {untrack} from 'svelte';
 import {nextBatch} from '#lib/import-model.js';
 import ImportMonitor from './ImportMonitor.svelte';
 import {Button} from '#lib/components/ui/button/index.js';
 import {Input} from '#lib/components/ui/input/index.js';
 import {Label} from '#lib/components/ui/label/index.js';
 import {Progress} from '#lib/components/ui/progress/index.js';
 import * as Card from '#lib/components/ui/card/index.js';
 import * as Alert from '#lib/components/ui/alert/index.js';
 import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
 import * as Collapsible from '#lib/components/ui/collapsible/index.js';
 import type {ImportView} from '#lib/import-controller.js';
 let {state: importState,enabled,profile='',oncheck,onresume,onpause,onskip,ondiscard,onallow,onretry,onexport,onfile,ondemo,oncollector,onsaved,onnew,hasSaved=false,unsaved=false}:{state:ImportView;enabled:boolean;profile?:string;oncheck:(profile:string,mode:'quick'|'full')=>void;onresume:()=>void;onpause:()=>void;onskip:()=>void;ondiscard:()=>void;onallow:()=>void;onretry:()=>void;onexport:()=>void;onfile:()=>void;ondemo:()=>void;oncollector:()=>void;onsaved:()=>void;onnew:()=>void;hasSaved?:boolean;unsaved?:boolean}=$props();
 let input=$state(untrack(()=>profile)),confirm=$state<'discard'|'allow'|'skip'|null>(null),now=$state(Date.now()),showLog=$state(false);
 $effect(()=>{const timer=setInterval(()=>now=Date.now(),1000);return()=>clearInterval(timer)});
 const cp=$derived(importState.checkpoint);const pending=$derived(new Set(cp?.operations.map(o=>o.appid)??[]).size);const total=$derived(cp?.selected.length??0);const done=$derived(total-pending);const inProgress=$derived(['checking','running'].includes(importState.stage));
 const limited=$derived(!!cp&&cp.retryAt>now);const budget=$derived(!!cp&&cp.calls+(cp.phase==='lookup'?3:nextBatch(cp.operations).length)>cp.allowance);
</script>
<div class="stack">
 {#if !cp && importState.stage!=='complete'}
  <Card.Root><Card.Header><Card.Title>{hasSaved?'Refresh your Steam library':'Import your Steam library'}</Card.Title><Card.Description>{hasSaved?'Choose a refresh to review before importing.':'Paste your public profile to get started.'}</Card.Description></Card.Header><Card.Content>
   <form onsubmit={(e)=>{e.preventDefault();oncheck(input,e.submitter?.getAttribute('data-mode')==='full'?'full':'quick')}} class="stack">
    <div class="space-y-2"><Label for="steam-profile">Steam profile link or SteamID</Label><Input id="steam-profile" bind:value={input} placeholder="https://steamcommunity.com/id/yourname" required disabled={!enabled||inProgress} aria-describedby="profile-help"/><p id="profile-help" class="muted">Profile and Game details must be public.</p></div>
    {#if hasSaved}<p class="muted text-sm">Quick refresh checks new, changed and recently played games. Full recheck checks every game.</p>{/if}
    <div class="row flex-wrap">{#if hasSaved}<Button type="submit" data-mode="quick" disabled={!enabled||inProgress}>Quick refresh</Button><Button type="submit" data-mode="full" variant="outline" disabled={!enabled||inProgress}>Full recheck</Button>{:else}<Button type="submit" disabled={!enabled||inProgress}>{importState.stage==='checking'?'Checking profile…':'Check profile'}</Button>{/if}<Button variant="outline" onclick={onfile}>Open a data file</Button><Button variant="ghost" onclick={ondemo}>Explore demo</Button></div>
   </form>
   {#if !enabled}<p class="muted mt-4">Live imports are unavailable on this server. Files and the sample library still work.</p>{/if}
  </Card.Content></Card.Root>
 {:else if cp}
  <Card.Root><Card.Header><Card.Title>{importState.stage==='review'?'Review your import':importState.stage==='checking'?'Checking your profile':importState.stage==='running'?'Importing your library':importState.stage==='complete'?'Import complete':'Import paused'}</Card.Title><Card.Description>{cp.candidate?.player.persona_name??cp.profile}</Card.Description></Card.Header><Card.Content class="space-y-5">
   {#if importState.stage==='paused'||importState.stage==='failed'}<p role="status">{importState.reason}</p>{/if}
   {#if cp.candidate}
    {#if importState.stage==='review'}
     <p>{cp.mode==='full'?'Full recheck checks every game. Review the work below before starting.':'Quick refresh checks new, changed and recently played games. Review the work below before starting.'}</p>
     <dl class="flex flex-wrap gap-x-10 gap-y-4"><div><dt class="muted text-sm">Library</dt><dd class="text-2xl font-semibold">{cp.candidate.games.length} {cp.candidate.games.length===1?'game':'games'}</dd></div><div><dt class="muted text-sm">To check</dt><dd class="text-2xl font-semibold">{total} {total===1?'game':'games'}</dd></div><div><dt class="muted text-sm">Estimated API calls</dt><dd class="text-2xl font-semibold">{cp.operations.length}</dd></div></dl>
     {#if !cp.candidate.games.length}<Alert.Root><Alert.Title>Empty Steam library</Alert.Title><Alert.Description>Continuing replaces your saved library with an empty one. Your plans stay saved.</Alert.Description></Alert.Root>{/if}
    {:else}<div class="space-y-2"><div class="flex items-baseline justify-between gap-3"><strong>{done} / {total} games processed</strong><span class="text-sm text-muted-foreground tabular-nums">{total?Math.floor(done/total*100):100}%</span></div><Progress value={done} max={Math.max(total,1)} class="motion-reduce:[&_[data-slot=progress-indicator]]:transition-none" aria-label="Processed selected games"/><p class="min-h-5 text-xs text-muted-foreground" role="status">{unsaved?'Not saved. Keep this tab open.':importState.stage==='complete'?'Library saved in this browser.':importState.pauseRequested?'Finishing the current group before pausing.':'Progress saves automatically in this browser.'}</p></div>{/if}
   {/if}
   {#if importState.stage==='paused'&&cp.retryAt>0}<p class="min-h-5 text-sm text-muted-foreground">{limited?`Resume after ${new Date(cp.retryAt).toLocaleTimeString()}.`:'Ready to resume.'}</p>{/if}
   <div class="row flex-wrap import-actions">
    {#if inProgress}<Button onclick={onpause} disabled={importState.pauseRequested}>{importState.pauseRequested?'Pausing…':'Pause import'}</Button>
    {:else if unsaved}<Button onclick={onretry}>Retry saving</Button><Button variant="outline" onclick={onexport}>Export unsaved results</Button>
    {:else if importState.stage==='complete'}<Button onclick={onsaved}>View library</Button><Button variant="outline" onclick={onnew}>Check another profile</Button>
    {:else if budget}<Button onclick={()=>confirm='allow'}>Allow up to 1,000 more calls</Button>
    {:else}<Button onclick={onresume} disabled={limited||!enabled}>{importState.stage==='review'?'Start import':cp.phase==='lookup'?'Try again':'Resume import'}</Button>{/if}
    {#if cp.blockedOperation&&importState.stage==='paused'&&!unsaved}<Button variant="outline" disabled={importState.saving} onclick={()=>confirm='skip'}>Skip this game</Button>{/if}
    {#if importState.stage!=='complete'}<Button variant="outline" onclick={()=>confirm='discard'} disabled={importState.saving}>Discard import progress</Button>{/if}
    {#if hasSaved&&importState.stage!=='complete'}<Button variant="ghost" onclick={onsaved}>View saved library</Button>{/if}
   </div>
   {#if cp.candidate&&importState.stage!=='review'}<ImportMonitor state={importState}/>{/if}
   {#if cp.log?.length}
    <section aria-label="Import activity">
     <Collapsible.Root bind:open={showLog}>
      <Collapsible.Trigger class="text-primary min-h-11 text-sm">{showLog?'Hide diagnostic log':'Diagnostic log'}</Collapsible.Trigger>
      <Collapsible.Content class="space-y-2">
       <p class="text-xs text-muted-foreground">Latest {cp.log.length} events, oldest first. Updates arrive after each group of games.</p>
       <ol class="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border text-sm" aria-label="Recent import events">
        {#each cp.log as entry}<li class="space-y-1 px-3 py-2"><time class="block text-xs text-muted-foreground" datetime={entry.at}>{new Date(entry.at).toLocaleTimeString()}</time><p class="break-words">{entry.message}</p></li>{/each}
       </ol>
      </Collapsible.Content>
     </Collapsible.Root>
    </section>
   {/if}
   <Collapsible.Root><Collapsible.Trigger class="text-primary min-h-11">Import details{cp.failures.length ? ` · ${cp.failures.length} unavailable` : ''}</Collapsible.Trigger><Collapsible.Content class="space-y-2 text-sm text-muted-foreground"><p>{cp.calls.toLocaleString()} / {cp.allowance.toLocaleString()} API calls accounted for. Unconfirmed requests stay counted; retries require your action.</p><p>{cp.mode==='quick'?'Quick refresh checks new, changed and recently played games.':'Full recheck checks every game.'} Your saved library stays available until the import finishes.</p>{#if cp.candidate}<p>SteamID: {cp.candidate.steamid64}</p>{/if}{#each cp.failures as failure}<p>Game {failure.appid} · {failure.kind}: {failure.message}</p>{/each}</Collapsible.Content></Collapsible.Root>
  </Card.Content></Card.Root>
 {/if}
 {#if importState.reason&&!cp}<Alert.Root><Alert.Title>Import status</Alert.Title><Alert.Description>{importState.reason}</Alert.Description></Alert.Root>{/if}
 <div class="row flex-wrap"><Collapsible.Root><Collapsible.Trigger class="text-primary min-h-11 text-sm">More options</Collapsible.Trigger><Collapsible.Content><Button variant="ghost" onclick={oncollector}>Collector instructions</Button><p class="muted text-sm">Profile lookup uses up to 3 API calls. Files stay in this browser.</p></Collapsible.Content></Collapsible.Root></div>
</div>
<AlertDialog.Root open={confirm!==null} onOpenChange={(v)=>{if(!v)confirm=null}}><AlertDialog.Content><AlertDialog.Header><AlertDialog.Title>{confirm==='allow'?'Allow another 1,000 calls?':confirm==='skip'?'Skip this game?':'Discard unfinished import?'}</AlertDialog.Title><AlertDialog.Description>{confirm==='allow'?`${cp?.calls??0} calls remain counted. The total allowance will become ${(cp?.allowance??1000)+1000}. Estimated unfinished work: ${cp?.operations.length??0} calls.`:confirm==='skip'?`Skip the remaining checks for ${cp?.candidate?.games.find(g=>g.appid===cp.blockedOperation?.appid)?.name??'this game'}. Keep existing results and continue with other games.`:'The last complete library and all plans stay unchanged. The unfinished import checkpoint will be removed. A dispatched request may still finish.'}</AlertDialog.Description></AlertDialog.Header><AlertDialog.Footer><AlertDialog.Cancel>Go back</AlertDialog.Cancel><AlertDialog.Action onclick={()=>{const action=confirm;confirm=null;if(action==='allow')onallow();else if(action==='skip')onskip();else ondiscard();}}>{confirm==='allow'?'Add allowance and resume':confirm==='skip'?'Skip game':'Discard import progress'}</AlertDialog.Action></AlertDialog.Footer></AlertDialog.Content></AlertDialog.Root>

<style>
 .import-actions :global(button:first-child) { min-width: 144px; }
</style>
