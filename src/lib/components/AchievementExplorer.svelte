<script lang="ts">
  import type { AchievementSort as Sort, AchievementFilter as Filter } from "../view-state";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import * as Pagination from "#lib/components/ui/pagination/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import * as Table from "#lib/components/ui/table/index.js";
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import type { SteamData } from "../../types";
  import { flattenAchievements, type AchievementRow } from "../derive";
  import { computeImpactByApp, itemKey, type PlanItem } from "../plan";
  import { formatDate, pctRate, signed2, signed5 } from "../format";

  let {
    query = $bindable(""), filter = $bindable<Filter>("all"), sort = $bindable<Sort>("rarity"), ascending = $bindable(false), page = $bindable(0),
    data,
    items,
    onToggle,
    onGame,
  }: {
    query?: string; filter?: Filter; sort?: Sort; ascending?: boolean; page?: number;
    data: SteamData;
    items: PlanItem[];
    onToggle: (item: PlanItem) => void;
    onGame: (appid: number) => void;
  } = $props();
  const pageSize = 50;
  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "unlocked", label: "Unlocked" },
    { value: "locked", label: "Locked" },
    { value: "rare", label: "Under 5%" },
    { value: "recent", label: "Recent unlocks" },
  ];
  let all = $derived(flattenAchievements(data));
  let impact = $derived(computeImpactByApp(data.games, items));
  let planned = $derived(new Set(items.map(itemKey)));
  let rows = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const result = all.filter(
      (a) =>
        (!q ||
          a.name.toLowerCase().includes(q) ||
          a.game.toLowerCase().includes(q) ||
          (a.description ?? "").toLowerCase().includes(q)) &&
        (filter === "all" ||
          (filter === "unlocked" && a.unlocked) ||
          (filter === "locked" && !a.unlocked) ||
          (filter === "rare" && a.globalRate != null && a.globalRate < 5) ||
          (filter === "recent" && a.unlocked && !!a.unlockTime)),
    );
    return result.sort((a, b) => {
      let value = 0;
      if (sort === "game") value = a.game.localeCompare(b.game);
      if (sort === "name") value = a.name.localeCompare(b.name);
      if (sort === "rarity") {
        if (a.globalRate == null && b.globalRate != null) return 1;
        if (b.globalRate == null && a.globalRate != null) return -1;
        value = (a.globalRate ?? 0) - (b.globalRate ?? 0);
      }
      if (sort === "impact")
        value =
          (a.unlocked ? -Infinity : (impact.get(a.appid) ?? -Infinity)) -
          (b.unlocked ? -Infinity : (impact.get(b.appid) ?? -Infinity));
      if (sort === "date")
        value =
          (Date.parse(a.unlockTime ?? "") || 0) -
          (Date.parse(b.unlockTime ?? "") || 0);
      return (
        (ascending ? value : -value) ||
        a.game.localeCompare(b.game) ||
        a.name.localeCompare(b.name)
      );
    });
  });
  let pages = $derived(Math.max(1, Math.ceil(rows.length / pageSize)));
  let currentPage = $derived(Math.min(page, pages - 1));
  let visible = $derived(
    rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
  );
  function planItem(a: AchievementRow): PlanItem {
    return {
      kind: "achievement",
      appid: a.appid,
      game: a.game,
      apiName: a.apiName,
      name: a.name,
    };
  }
  function chooseFilter(value: Filter) {
    filter = value;
    page = 0;
    if (value === "recent") {
      sort = "date";
      ascending = false;
    }
  }
</script>

<Card.Root layout="padded" class="achievement-explorer">
  <header class="section-heading">
    <span class="muted" aria-live="polite"
      >{rows.length.toLocaleString()} of {all.length.toLocaleString()}</span
    >
  </header>
  <div class="toolbar">
    <div class="field grow min-w-0">
      <Label for="achievements-search">Search achievements</Label>
      <Input
        id="achievements-search"
        type="search"
        aria-label="Search achievements, descriptions, or games"
        placeholder="Search achievements or games"
        bind:value={query}
        oninput={() => (page = 0)}
      />
    </div>
    <div class="field">
      <Label for="achievements-sort">Sort achievements</Label>
      <NativeSelect.Root
        id="achievements-sort"
        aria-label="Sort achievements"
        value={sort}
        onchange={(event) => {
          sort = event.currentTarget.value as Sort;
          ascending = sort === "name" || sort === "game";
          page = 0;
        }}
      >
        <NativeSelect.Option value="rarity"
          >Global unlock rate</NativeSelect.Option
        ><NativeSelect.Option value="impact"
          >Completion impact</NativeSelect.Option
        ><NativeSelect.Option value="name">Achievement name</NativeSelect.Option
        ><NativeSelect.Option value="game">Game</NativeSelect.Option
        ><NativeSelect.Option value="date">Unlock date</NativeSelect.Option>
      </NativeSelect.Root>
    </div>
    <Button
      variant="outline"
      onclick={() => {
        ascending = !ascending;
        page = 0;
      }}
      aria-label={ascending ? "Sort descending" : "Sort ascending"}
      >{ascending ? "↑ Ascending" : "↓ Descending"}</Button
    >
  </div>
  <ToggleGroup.Root
    spacing={2}
    type="single"
    value={filter}
    onValueChange={(value) => {
      if (value) {
        chooseFilter(value as Filter);
      }
    }}
    variant="outline"
    class="chips !w-full !flex-wrap !justify-start"
    aria-label="Filter achievements"
  >
    {#each filters as f}<ToggleGroup.Item value={f.value}
        >{f.label}</ToggleGroup.Item
      >{/each}
  </ToggleGroup.Root>
  <Collapsible.Root
    ><Collapsible.Trigger class="min-h-11 text-sm text-primary underline"
      >What is impact?</Collapsible.Trigger
    ><Collapsible.Content class="text-sm muted"
      >The change in your completion average from one more unlock, including
      your plan.</Collapsible.Content
    ></Collapsible.Root
  >
  <div class="table-scroll responsive-data">
    <Table.Root class="data-table">
      <Table.Header
        ><Table.Row
          ><Table.Head>Achievement</Table.Head><Table.Head>Game</Table.Head
          ><Table.Head>Global</Table.Head><Table.Head
            >Unlocked / impact</Table.Head
          ><Table.Head><span class="sr-only">Plan</span></Table.Head></Table.Row
        ></Table.Header
      ><Table.Body>
        {#each visible as a (a.id)}
          {@const item = planItem(a)}
          {@const selected = planned.has(itemKey(item))}
          {@const change = impact.get(a.appid)}
          <Table.Row>
            <Table.Cell
              ><div class="achievement-cell">
                {#if a.icon}<img
                    class="achievement-icon"
                    class:locked={!a.unlocked}
                    src={a.icon}
                    alt=""
                    loading="lazy"
                    width="36"
                    height="36"
                  />{/if}
                <div>
                  <strong>{a.name}</strong>{#if a.description}<small
                      class="muted achievement-description line-clamp-1"
                      title={a.description}>{a.description}</small
                    >{/if}
                </div>
              </div></Table.Cell
            >
            <Table.Cell data-label="Game"
              ><Button
                variant="link"
                class="text-button"
                onclick={() => onGame(a.appid)}>{a.game}</Button
              ></Table.Cell
            >
            <Table.Cell data-label="Global unlock rate"
              class={a.globalRate != null && a.globalRate < 5
                ? "rare"
                : undefined}>{pctRate(a.globalRate)}</Table.Cell
            >
            <Table.Cell data-label={a.unlocked ? "Unlocked" : "Completion impact"}
              >{#if a.unlocked}<span class="positive"
                  >✓ {formatDate(a.unlockTime)}</span
                >{:else if change != null}<span
                  class:positive={change >= 0.005}
                  class:negative={change <= -0.005}
                  title={`Exact impact: ${signed5(change)} percentage points`}
                  >{Math.abs(change) < 0.005 ? "0.00" : signed2(change)} pp</span
                >{:else}—{/if}</Table.Cell
            >
            <Table.Cell
              >{#if !a.unlocked}<Button
                  size="sm"
                  variant={selected ? "secondary" : "outline"}
                  aria-pressed={selected}
                  aria-label={`${selected ? "Remove" : "Add"} ${a.name} ${selected ? "from" : "to"} plan`}
                  onclick={() => onToggle(item)}
                  >{selected ? "✓ Planned" : "Add to plan"}</Button
                >{/if}</Table.Cell
            >
          </Table.Row>
        {:else}<Table.Row
            ><Table.Cell colspan={5} class="empty-state"
              >No achievements match these filters. <Button variant="outline" class="mt-3" onclick={()=>{query="";filter="all";page=0;}}>Clear filters</Button></Table.Cell
            ></Table.Row
          >{/each}
      </Table.Body>
    </Table.Root>
  </div>
  <Pagination.Root
    count={rows.length}
    perPage={pageSize}
    page={currentPage + 1}
    onPageChange={(value) => (page = value - 1)}
    class="pagination"
    aria-label="Achievements pages"
  >
    <Pagination.Content class="w-full justify-between flex-wrap gap-2">
      <Pagination.Item><Pagination.Previous /></Pagination.Item>
      <Pagination.Item
        ><span class="muted" aria-live="polite"
          >Page {currentPage + 1} of {pages}</span
        ></Pagination.Item
      >
      <Pagination.Item><Pagination.Next /></Pagination.Item>
    </Pagination.Content>
  </Pagination.Root>
</Card.Root>
