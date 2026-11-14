<script lang="ts">
  import type { Freshness } from "#lib/backup.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import * as Pagination from "#lib/components/ui/pagination/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Progress } from "#lib/components/ui/progress/index.js";
  import * as Table from "#lib/components/ui/table/index.js";
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import type { SteamData, Game } from "../../types";
  import { flooredRate } from "../steam";
  import { formatDate, hoursFromMin } from "../format";
  import { itemKey, lockedItems, type PlanItem } from "../plan";
  let {
    data,
    items,
    freshness = {},
    onToggle,
    onGame,
  }: {
    data: SteamData;
    items: PlanItem[];
    freshness?: Freshness[string];
    onToggle: (item: PlanItem) => void;
    onGame: (appid: number) => void;
  } = $props();
  type Sort = "name" | "playtime" | "completion" | "last";
  let query = $state("");
  type Filter = "all" | "achievements" | "almost" | "planned" | "completed";
  let filter = $state<Filter>("all");
  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "achievements", label: "With achievements" },
    { value: "almost", label: "Almost finished" },
    { value: "planned", label: "In my plan" },
    { value: "completed", label: "Completed" },
  ];
  let sort = $state<Sort>("playtime");
  let ascending = $state(false);
  let page = $state(0);
  const pageSize = 50;
  let planned = $derived(new Set(items.map(itemKey)));
  let plannedGames = $derived(new Set(items.map((item) => item.appid)));
  let rows = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return data.games
      .filter(
        (g) =>
          (!q || g.name.toLowerCase().includes(q)) &&
          (filter === "all" ||
            (filter === "achievements" && g.has_achievements) ||
            (filter === "almost" &&
              completion(g) >= 80 &&
              completion(g) < 100) ||
            (filter === "planned" && plannedGames.has(g.appid)) ||
            (filter === "completed" && completion(g) === 100)),
      )
      .sort((a, b) => {
        let value = 0;
        if (sort === "name") value = a.name.localeCompare(b.name);
        if (sort === "playtime")
          value = a.playtime_forever_min - b.playtime_forever_min;
        if (sort === "completion") value = completion(a) - completion(b);
        if (sort === "last")
          value =
            (Date.parse(a.last_played ?? "") || 0) -
            (Date.parse(b.last_played ?? "") || 0);
        return (ascending ? value : -value) || a.name.localeCompare(b.name);
      });
  });
  let pages = $derived(Math.max(1, Math.ceil(rows.length / pageSize)));
  let currentPage = $derived(Math.min(page, pages - 1));
  let visible = $derived(
    rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
  );
  function completion(game: Game) {
    return game.has_achievements
      ? flooredRate(game.achievements_unlocked, game.achievements_total)
      : -1;
  }
  function toggleGame(game: Game) {
    const locked = lockedItems(game);
    const allPlanned = locked.every((item) => planned.has(itemKey(item)));
    const changes = allPlanned
      ? locked
      : locked.filter((item) => !planned.has(itemKey(item)));
    for (const item of changes) onToggle(item);
  }
</script>

<Card.Root class="panel game-library">
  <header class="section-heading">
    <span class="muted" aria-live="polite"
      >{rows.length.toLocaleString()} games</span
    >
  </header>
  <div class="toolbar">
    <div class="field grow min-w-0">
      <Label for="games-search">Search games</Label>
      <Input
        id="games-search"
        type="search"
        aria-label="Search games"
        placeholder="Search your library"
        bind:value={query}
        oninput={() => (page = 0)}
      />
    </div>
    <div class="field">
      <Label for="games-sort">Sort games</Label>
      <NativeSelect.Root
        id="games-sort"
        aria-label="Sort games"
        value={sort}
        onchange={(event) => {
          sort = event.currentTarget.value as Sort;
          ascending = sort === "name";
          page = 0;
        }}
        ><NativeSelect.Option value="playtime">Playtime</NativeSelect.Option
        ><NativeSelect.Option value="completion">Completion</NativeSelect.Option
        ><NativeSelect.Option value="name">Game name</NativeSelect.Option
        ><NativeSelect.Option value="last">Last played</NativeSelect.Option
        ></NativeSelect.Root
      >
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
    type="single"
    value={filter}
    onValueChange={(value) => {
      if (value) {
        filter = value as Filter;
        page = 0;
      }
    }}
    variant="outline"
    class="chips !w-full !flex-wrap !justify-start"
    aria-label="Filter games"
  >
    {#each filters as f}<ToggleGroup.Item value={f.value}
        >{f.label}</ToggleGroup.Item
      >{/each}
  </ToggleGroup.Root>
  <div class="table-scroll">
    <Table.Root class="data-table">
      <Table.Header
        ><Table.Row
          ><Table.Head>Game</Table.Head><Table.Head>Playtime</Table.Head
          ><Table.Head>Completion</Table.Head><Table.Head
            >Last played</Table.Head
          ><Table.Head><span class="sr-only">Plan</span></Table.Head></Table.Row
        ></Table.Header
      ><Table.Body>
        {#each visible as game (game.appid)}
          {@const rate = completion(game)}
          {@const locked = lockedItems(game)}
          {@const allPlanned =
            locked.length > 0 &&
            locked.every((item) => planned.has(itemKey(item)))}
          <Table.Row
            ><Table.Cell
              ><Button
                variant="link"
                class="text-button game-name"
                onclick={() => onGame(game.appid)}
                >{game.name} <span aria-hidden="true">↗</span></Button
              ><small
                class="block muted"
                title={freshness[game.appid]?.noAchievementSchema ?? freshness[game.appid]?.progressUnavailable ?? freshness[game.appid]?.progress}
                >{freshness[game.appid]?.noAchievementSchema
                  ? `No achievement schema · Checked ${formatDate(freshness[game.appid].noAchievementSchema!)}`
                  : freshness[game.appid]?.progressUnavailable
                    ? `Progress unavailable · Checked ${formatDate(freshness[game.appid].progressUnavailable!)}`
                    : freshness[game.appid]?.progress
                  ? `Checked ${formatDate(freshness[game.appid].progress!)}${Date.now() - Date.parse(freshness[game.appid].progress!) > 7 * 86400000 ? " · Overdue" : ""}`
                  : "Not checked"}</small
              ></Table.Cell
            ><Table.Cell>{hoursFromMin(game.playtime_forever_min)}h</Table.Cell>
            <Table.Cell
              >{#if rate < 0}<span class="muted">No achievements</span
                >{:else}<div class="completion-cell">
                  <Progress
                    max={100}
                    value={rate}
                    aria-label={`${game.name} completion`}
                  ></Progress><span class:positive={rate === 100}
                    >{rate}%
                    <small class="muted"
                      >{game.achievements_unlocked}/{game.achievements_total}</small
                    ></span
                  >
                </div>{/if}</Table.Cell
            >
            <Table.Cell class="muted">{formatDate(game.last_played)}</Table.Cell
            ><Table.Cell
              >{#if locked.length}<Button
                  size="sm"
                  variant={allPlanned ? "secondary" : "outline"}
                  aria-pressed={allPlanned}
                  aria-label={`${allPlanned ? "Remove" : "Plan"} remaining achievements for ${game.name}`}
                  onclick={() => toggleGame(game)}
                  >{allPlanned ? "✓ Planned" : "Plan 100%"}</Button
                >{/if}</Table.Cell
            >
          </Table.Row>
        {:else}<Table.Row
            ><Table.Cell colspan={5} class="empty-state"
              >No games match these filters.</Table.Cell
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
    aria-label="Games pages"
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
