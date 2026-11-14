<script lang="ts">
  import type { Freshness } from "#lib/backup.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { formatDate } from "#lib/format.js";
  import type { Game, Achievement } from "../../types";
  import { itemKey, type PlanItem } from "../plan";
  let {
    game,
    items,
    freshness = {},
    onToggle,
    onClose,
  }: {
    game: Game | null;
    items: PlanItem[];
    freshness?: Freshness[string];
    onToggle: (item: PlanItem) => void;
    onClose: () => void;
  } = $props();

  let query = $state("");
  let status = $state("all");
  let page = $state(0);
  $effect(() => { game?.appid; query = ""; status = "all"; });
  const pageSize = 50;
  const keys = $derived(new Set(items.map(itemKey)));
  const achievements = $derived(
    (game?.achievements ?? []).filter(
      (a) =>
        (status === "all" ||
          (status === "locked" ? !a.unlocked : a.unlocked)) &&
        `${a.name} ${a.description ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ),
  );
  const pageCount = $derived(
    Math.max(1, Math.ceil(achievements.length / pageSize)),
  );
  const visibleAchievements = $derived(
    achievements.slice(page * pageSize, (page + 1) * pageSize),
  );
  const hoursPlayed = $derived(
    ((game?.playtime_forever_min ?? 0) / 60).toFixed(1),
  );
  $effect(() => {
    query;
    status;
    game?.appid;
    page = 0;
  });
  function item(a: Achievement): PlanItem {
    return {
      kind: "achievement",
      appid: game!.appid,
      game: game!.name,
      apiName: a.api_name,
      name: a.name,
    };
  }
</script>

<Dialog.Root
  open={!!game}
  onOpenChange={(open) => {
    if (!open) onClose();
  }}
>
  <Dialog.Content
    class="game-dialog max-h-[85dvh] overflow-y-auto sm:max-w-3xl"
    showCloseButton={false}
  >
    {#if game}
      <header>
        <div>
          <Dialog.Title>{game.name}</Dialog.Title>
          <Dialog.Description>
            {game.achievements_unlocked} / {game.achievements_total} unlocked · {hoursPlayed}
            hours played
          </Dialog.Description>
          <p class="muted" title={freshness[game.appid]?.noAchievementSchema ?? freshness[game.appid]?.progressUnavailable ?? freshness[game.appid]?.progress}>
            {freshness[game.appid]?.noAchievementSchema
                  ? `No achievement schema · Checked ${formatDate(freshness[game.appid].noAchievementSchema!)}`
                  : freshness[game.appid]?.progressUnavailable
                    ? `Progress unavailable · Checked ${formatDate(freshness[game.appid].progressUnavailable!)}`
                    : freshness[game.appid]?.progress
              ? `Checked with Steam ${formatDate(freshness[game.appid].progress!)}`
              : "Not checked with Steam"}
          </p>
        </div>
        <Button
          variant="outline"
          onclick={onClose}
          aria-label="Close game details">×</Button
        >
      </header>
      <div class="filters">
        <div class="field grow">
          <Label for="game-achievement-search">Search achievements</Label><Input
            id="game-achievement-search"
            aria-label="Search game achievements"
            placeholder="Find an achievement…"
            bind:value={query}
          />
        </div>
        <div class="field">
          <Label for="game-achievement-status">Achievement status</Label
          ><NativeSelect.Root
            id="game-achievement-status"
            aria-label="Achievement status"
            bind:value={status}
            ><NativeSelect.Option value="all"
              >All achievements</NativeSelect.Option
            ><NativeSelect.Option value="locked">Locked</NativeSelect.Option
            ><NativeSelect.Option value="unlocked">Unlocked</NativeSelect.Option
            ></NativeSelect.Root
          >
        </div>
      </div>
      <div class="achievements">
        {#each visibleAchievements as achievement (achievement.api_name)}
          {@const planned = keys.has(itemKey(item(achievement)))}
          <article>
            {#if achievement.icon}<img
                src={achievement.unlocked
                  ? achievement.icon
                  : (achievement.icon_gray ?? achievement.icon)}
                alt=""
                width="40"
                height="40"
                loading="lazy"
              />{:else}<div class="icon" aria-hidden="true">◇</div>{/if}
            <div class="body">
              <h3>{achievement.name}</h3>
              {#if achievement.description}<p>{achievement.description}</p>{/if}
              <small
                >{achievement.global_completion_rate_pct == null
                  ? "Global rate unavailable"
                  : `${achievement.global_completion_rate_pct.toFixed(1)}% of players`}{achievement.unlock_time
                  ? ` · ${new Date(achievement.unlock_time).toLocaleDateString()}`
                  : ""}</small
              >
            </div>
            {#if achievement.unlocked}<Badge variant="secondary">Unlocked</Badge
              >{:else}<Button
                variant="outline"
                aria-pressed={planned}
                aria-label={`${planned ? "Remove" : "Add"} ${achievement.name} ${planned ? "from" : "to"} plan`}
                onclick={() => onToggle(item(achievement))}
                >{planned ? "✓ Planned" : "Add to plan"}</Button
              >{/if}
          </article>
        {:else}{#if query || status !== "all"}<div class="empty"><p>No matching achievements.</p><Button variant="outline" onclick={()=>{query="";status="all";}}>Clear filters</Button></div>{:else}<p class="empty">No achievement details are available for this game.</p>{/if}{/each}
      </div>
      {#if achievements.length > pageSize}
        <nav class="pagination" aria-label="Achievement pages">
          <Button
            variant="outline"
            disabled={page === 0}
            onclick={() => (page -= 1)}>Previous</Button
          ><span aria-live="polite"
            >Page {page + 1} of {pageCount} · {achievements.length} achievements</span
          ><Button
            variant="outline"
            disabled={page + 1 >= pageCount}
            onclick={() => (page += 1)}>Next</Button
          >
        </nav>
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>

<style>
  .pagination {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    margin-top: 16px;
    font-size: 14px;
    color: var(--muted-foreground);
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    align-items: flex-start;
  }
  p,
  small {
    color: var(--muted-foreground);
    line-height: 1.5;
  }
  .filters {
    display: flex;
    gap: 10px;
    margin: 20px 0;
  }
  .filters :global(input) {
    flex: 1;
    min-width: 0;
  }
  .achievements {
    display: grid;
  }
  article {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 17px 0;
    border-top: 1px solid var(--border);
  }
  img,
  .icon {
    border-radius: 6px;
    flex-shrink: 0;
  }
  .icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    background: var(--secondary);
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  h3 {
    font-size: 14px;
    margin: 0;
  }
  article p {
    font-size: 14px;
    margin: 4px 0;
  }
  small {
    font-size: 14px;
  }
  .empty {
    padding: 24px 0;
  }
  @media (max-width: 520px) {
    .filters {
      flex-direction: column;
    }
    article {
      gap: 9px;
    }
    article img,
    .icon {
      display: none;
    }
  }
</style>
