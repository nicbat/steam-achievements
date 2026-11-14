<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import type { Dataset } from "#lib/backup.js";
  let {
    dataset,
    unsaved = false,
    onexport,
    onrestore,
    ondelete,
    onretry,
    onexportunsaved,
  }: {
    dataset: Dataset;
    unsaved?: boolean;
    onexport: () => void;
    onrestore: () => void;
    ondelete: () => void;
    onretry: () => void;
    onexportunsaved: () => void;
  } = $props();
</script>

<div class="grid gap-6 lg:grid-cols-2">
  <Card.Root
    ><Card.Header
      ><Card.Title>Backup and restore</Card.Title><Card.Description
        >Keep a copy of your library and plans.</Card.Description
      ></Card.Header
    ><Card.Content class="space-y-4"
      ><div class="row flex-wrap">
        <Button onclick={onexport}>Export backup</Button><Button
          variant="outline"
          onclick={onrestore}>Restore or open file</Button
        >
      </div>
      <Collapsible.Root
        ><Collapsible.Trigger class="min-h-11 text-sm text-primary underline"
          >Backup details</Collapsible.Trigger
        ><Collapsible.Content class="space-y-2 text-sm muted"
          ><p>
            Includes your library, all profiles’ plans, preferences and check
            dates. API keys and temporary permissions are excluded.
          </p>
          <p>
            Files stay in this browser. You’ll review any replacement before
            restoring.
          </p>
          <p>
            There is no cloud sync. Clearing browser data or losing this device
            can lose custom plans; Steam cannot recreate them.
          </p></Collapsible.Content
        ></Collapsible.Root
      ></Card.Content
    ></Card.Root
  >
  <Card.Root
    ><Card.Header
      ><Card.Title
        >{dataset.active?.player.persona_name ??
          dataset.active?.steamid64 ??
          "No saved library"}</Card.Title
      ><Card.Description
        >{dataset.active?.games.length ?? 0} games · {Object.keys(dataset.plans)
          .length} saved plans</Card.Description
      ></Card.Header
    ><Card.Content
      >{#if Object.keys(dataset.plans).length}<Collapsible.Root
          ><Collapsible.Trigger class="min-h-11 text-sm text-primary underline"
            >Plans by profile</Collapsible.Trigger
          ><Collapsible.Content
            >{#each Object.entries(dataset.plans) as [sid, items]}<p
                class="muted text-sm"
              >
                {sid} · {items.length} targets
              </p>{/each}</Collapsible.Content
          ></Collapsible.Root
        >{:else}<p class="muted">Saved in this browser.</p>{/if}</Card.Content
    ></Card.Root
  >
  {#if unsaved}<Card.Root
      ><Card.Header
        ><Card.Title>Changes not saved</Card.Title><Card.Description
          >Keep this tab open until you save or export.</Card.Description
        ></Card.Header
      ><Card.Content class="row flex-wrap"
        ><Button onclick={onretry}>Retry saving</Button><Button
          variant="outline"
          onclick={onexportunsaved}>Export unsaved changes</Button
        ></Card.Content
      ></Card.Root
    >{/if}
  <Card.Root
    ><Card.Header
      ><Card.Title>Delete local data</Card.Title><Card.Description
        >Clear this browser’s library, plans and unfinished import.</Card.Description
      ></Card.Header
    ><Card.Content
      ><Button variant="destructive" onclick={ondelete}
        >Delete local data…</Button
      ></Card.Content
    ></Card.Root
  >
</div>
