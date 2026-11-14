<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.js";
  import * as Alert from "#lib/components/ui/alert/index.js";
  import * as AlertDialog from "#lib/components/ui/alert-dialog/index.js";
  let confirmClear = $state(false);
  import * as Card from "#lib/components/ui/card/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import type { SteamData } from "../../types";
  import {
    itemKey,
    toMarkdown,
    toJson,
    parsePlanJson,
    projectAverage,
    type PlanItem,
  } from "../plan";
  import { averageCompletion } from "../steam";
  let {
    data,
    items,
    onRemove,
    onClear,
    onMerge,
    onClose,
    showHeading = false,
    onBrowse,
  }: {
    data: SteamData;
    items: PlanItem[];
    onRemove: (key: string) => void;
    onClear: () => void;
    onMerge: (items: PlanItem[]) => void;
    onClose: () => void;
    showHeading?: boolean;
    onBrowse: () => void;
  } = $props();
  let error = $state("");
  let fileInput: HTMLInputElement;
  const base = $derived(averageCompletion(data.games));
  const projected = $derived(projectAverage(data.games, items));
  const groups = $derived.by(() => {
    const result = new Map<number, PlanItem[]>();
    for (const item of items)
      result.set(item.appid, [...(result.get(item.appid) ?? []), item]);
    return [...result];
  });
  function status(item: PlanItem) {
    const achievement = data.games
      .find((g) => g.appid === item.appid)
      ?.achievements.find((a) => a.api_name === item.apiName);
    return !achievement
      ? "Inactive"
      : achievement.unlocked
        ? "Completed"
        : "Planned";
  }
  function download(extension: "md" | "json") {
    const content =
      extension === "md" ? toMarkdown(data, items) : toJson(data, items);
    const url = URL.createObjectURL(
      new Blob([content], {
        type: extension === "md" ? "text/markdown" : "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `achievement-plan.${extension}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    error = "";
    if (!file) return;
    try {
      const imported = parsePlanJson(await file.text(), data.steamid64);
      if (!imported.length)
        throw new Error("No valid achievement targets in this plan.");
      onMerge(imported);
    } catch (err) {
      error =
        err instanceof Error ? err.message : "Could not import this plan.";
    }
  }
</script>

<Card.Root layout="padded" class="plan-panel" aria-label="Your plan">
  {#if showHeading}<header>
    <div><h2>Your plan <small>{items.length}</small></h2></div>
    <Button variant="outline" onclick={onClose} aria-label="Close plan"
      >×</Button
    >
  </header>{/if}
  <Card.Root layout="padded" class="plan-projection">
    <span>{base.displayed}%</span><span aria-hidden="true">→</span><strong
      >{projected.displayed}%</strong
    >
  </Card.Root>
  <p class="muted">
    {projected.mean - base.mean >= 0 ? "+" : ""}{(
      projected.mean - base.mean
    ).toFixed(2)} percentage points
  </p>
  <div class="plan-list">
    {#each groups as [appid, entries] (appid)}
      <section>
        <h3>
          {data.games.find((g) => g.appid === appid)?.name ?? entries[0].game}
        </h3>
        {#each entries as item (itemKey(item))}<div class="plan-item">
            <span
              >{item.name}{#if status(item) !== "Planned"}<Badge
                  variant="outline"
                  class="mt-1 block w-fit"
                  title={status(item) === "Inactive"
                    ? "Not available in this snapshot; kept in your backup."
                    : undefined}>{status(item)}</Badge
                >{/if}</span
            ><Button
              variant="ghost"
              size="icon"
              class="remove"
              onclick={() => onRemove(itemKey(item))}
              aria-label={`Remove ${item.name} from plan`}>×</Button
            >
          </div>{/each}
      </section>
    {:else}<p class="empty">Add achievements to build your plan.</p><Button variant="outline" onclick={onBrowse}>Find achievements</Button>{/each}
  </div>
  <footer>
    <Button
      variant="default"
      disabled={!items.length}
      onclick={() => download("md")}>Download checklist</Button
    >
    <div class="actions">
      <Button
        variant="outline"
        disabled={!items.length}
        onclick={() => download("json")}>Export JSON</Button
      ><Button variant="outline" onclick={() => fileInput.click()}
        >Import plan</Button
      ><Button
        variant="outline"
        disabled={!items.length}
        onclick={() => (confirmClear = true)}>Clear</Button
      >
    </div>
    <input
      bind:this={fileInput}
      type="file"
      accept=".json,application/json"
      hidden
      onchange={importFile}
    />{#if error}<Alert.Root variant="destructive"
        ><Alert.Title>Could not import plan</Alert.Title><Alert.Description
          >{error}</Alert.Description
        ></Alert.Root
      >{/if}
  </footer>
</Card.Root>

<AlertDialog.Root bind:open={confirmClear}>
  <AlertDialog.Content>
    <AlertDialog.Header
      ><AlertDialog.Title>Clear this profile’s plan?</AlertDialog.Title
      ><AlertDialog.Description
        >Remove all targets, including completed and inactive ones. Your Steam
        achievements stay unchanged.</AlertDialog.Description
      ></AlertDialog.Header
    >
    <AlertDialog.Footer
      ><AlertDialog.Cancel>Keep plan</AlertDialog.Cancel><AlertDialog.Action
        onclick={() => {
          onClear();
          confirmClear = false;
        }}>Clear plan</AlertDialog.Action
      ></AlertDialog.Footer
    >
  </AlertDialog.Content>
</AlertDialog.Root>

<style>
  :global(.plan-panel) {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
  header,
  .actions,
  .plan-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  h2 {
    margin: 4px 0;
    font-size: 24px;
  }
  h3 {
    font-size: 14px;
    margin: 20px 0 8px;
  }
  small,
  .muted,
  .empty {
    color: var(--muted-foreground);
  }
  small {
    font-size: 14px;
  }
  :global(.plan-projection) {
    display: flex;
    gap: 16px;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    font-size: 30px;
  }
  :global(.plan-projection) strong {
    color: var(--primary);
  }
  .muted {
    font-size: 14px;
    margin: 0;
  }
  .plan-list {
    max-height: 55vh;
    overflow: auto;
  }
  .plan-item {
    font-size: 14px;
    padding: 9px 0;
    border-bottom: 1px solid var(--border);
  }
  :global(.remove) {
    background: transparent;
    border: 0;
    color: inherit;
    font-size: 20px;
    cursor: pointer;
  }
  .actions {
    flex-wrap: wrap;
    justify-content: flex-start;
    margin-top: 10px;
  }
  .empty {
    font-size: 14px;
    line-height: 1.7;
  }
  footer {
    margin-top: auto;
  }
</style>
