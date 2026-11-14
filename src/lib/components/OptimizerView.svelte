<script lang="ts">
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Slider } from "#lib/components/ui/slider/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import { Button } from "#lib/components/ui/button/index.js";

  import type { SteamData, Game, Achievement } from "../../types";
  import { optimize } from "../optimizer";
  import {
    itemKey,
    lockedItems,
    marginalImpactMany,
    projectAverage,
    type PlanItem,
  } from "../plan";
  import { averageCompletion, flooredRate } from "../steam";
  let {
    data,
    items,
    onAdd,
    onGame,
    preferences = {},
    onPreferences = () => {},
  }: {
    data: SteamData;
    items: PlanItem[];
    onAdd: (items: PlanItem[]) => void;
    onGame: (appid: number) => void;
    preferences?: { optimizerFloor?: number; optimizerTarget?: number };
    onPreferences?: (patch: {
      optimizerFloor: number;
      optimizerTarget: number;
    }) => void;
  } = $props();
  const base = $derived(averageCompletion(data.games));
  const projection = $derived(projectAverage(data.games, items));
  const opt = $derived(optimize(data.games));
  const keys = $derived(new Set(items.map(itemKey)));
  const gameMap = $derived(
    new Map(data.games.map((game) => [game.appid, game])),
  );
  const floor = $derived(preferences.optimizerFloor ?? 25);
  const target = $derived(preferences.optimizerTarget ?? base.displayed);
  function setFloor(value: number) {
    onPreferences({ optimizerFloor: value, optimizerTarget: target });
  }
  function setTarget(value: number) {
    onPreferences({ optimizerFloor: floor, optimizerTarget: value });
  }
  function asItems(game: Game, achievements: Achievement[]): PlanItem[] {
    return achievements.map((a) => ({
      kind: "achievement",
      appid: game.appid,
      game: game.name,
      apiName: a.api_name,
      name: a.name,
    }));
  }
  function planned(candidates: PlanItem[]) {
    return (
      candidates.length > 0 &&
      candidates.every((item) => keys.has(itemKey(item)))
    );
  }
  function add(candidates: PlanItem[]) {
    onAdd(candidates.filter((item) => !keys.has(itemKey(item))));
  }
  function impact(candidates: PlanItem[]) {
    const n = marginalImpactMany(data.games, [], candidates);
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
  }
  const finder = $derived.by(() =>
    data.games
      .filter((g) => g.has_achievements && g.achievements_total > 0)
      .map((game) => {
        const candidates = game.achievements.filter(
          (a) =>
            !a.unlocked &&
            a.global_completion_rate_pct != null &&
            a.global_completion_rate_pct >= floor,
        );
        return {
          game,
          candidates: asItems(game, candidates),
          current: flooredRate(
            game.achievements_unlocked,
            game.achievements_total,
          ),
          reach: flooredRate(
            game.achievements_unlocked + candidates.length,
            game.achievements_total,
          ),
        };
      })
      .filter(
        (row) =>
          row.current < target && row.reach >= target && row.candidates.length,
      )
      .sort(
        (a, b) => b.reach - a.reach || a.game.name.localeCompare(b.game.name),
      ),
  );
  const easy = $derived(
    data.games
      .flatMap((game) =>
        game.achievements
          .filter((a) => !a.unlocked && a.global_completion_rate_pct != null)
          .map((achievement) => ({ game, achievement })),
      )
      .sort(
        (a, b) =>
          b.achievement.global_completion_rate_pct! -
          a.achievement.global_completion_rate_pct!,
      )
      .slice(0, 24),
  );
</script>

<section class="optimizer">
  <Card.Root layout="padded" class="optimizer-summary">
    <div><small>Current average</small><strong>{base.displayed}%</strong></div>
    <span class="arrow">→</span>
    <div>
      <small>With your plan</small><strong class="accent"
        >{projection.displayed}%</strong
      >
    </div>
    <p>
      {items.length} planned achievements<br /><span
        >{projection.mean - base.mean >= 0 ? "+" : ""}{(
          projection.mean - base.mean
        ).toFixed(2)} average points</span
      >
    </p>
  </Card.Root>
  <div class="columns">
    <Card.Root layout="padded">
      <div class="section-head">
        <h2>Almost perfect</h2>
        <span>{opt.nearPerfect.length} games</span>
      </div>
      {#each opt.nearPerfect as suggestion (suggestion.appid)}
        {@const game = gameMap.get(suggestion.appid)!}{@const candidates =
          lockedItems(game)}
        <div class="suggestion">
          <div class="row">
            <div class="body">
              <Button
                variant="link"
                class="game"
                onclick={() => onGame(game.appid)}>{game.name}</Button
              >
              <p>{suggestion.remaining} left · {suggestion.nowPct}% complete</p>
            </div>
            <span class="impact">{impact(candidates)}</span><Button
              variant="outline"
              disabled={planned(candidates) || !candidates.length}
              onclick={() => add(candidates)}
              >{planned(candidates) ? "✓ Planned" : "+ Finish"}</Button
            >
          </div>
          <div class="remaining">
            {#each game.achievements.filter((a) => !a.unlocked) as a}<span
                >{a.name}
                <b
                  >{a.global_completion_rate_pct == null
                    ? "—"
                    : `${a.global_completion_rate_pct.toFixed(1)}%`}</b
                ></span
              >{/each}
          </div>
        </div>
      {:else}<p class="empty">No almost-perfect games.</p>{/each}
    </Card.Root>
    <Card.Root layout="padded">
      <div class="section-head">
        <h2>Best next unlocks</h2>
        <span>Started games</span>
      </div>
      {#each opt.started.slice(0, 18) as suggestion (suggestion.appid)}
        {@const game = gameMap.get(suggestion.appid)!}{@const achievement =
          game.achievements.find((a) => a.api_name === suggestion.easiestApi) ??
          game.achievements.find((a) => !a.unlocked)}
        {#if achievement}{@const candidates = asItems(game, [achievement])}
          <div class="suggestion row">
            <div class="body">
              <Button
                variant="link"
                class="game"
                onclick={() => onGame(game.appid)}>{game.name}</Button
              >
              <p>
                {achievement.name} · {suggestion.unlocked}/{suggestion.total}
              </p>
            </div>
            <span class="impact">{impact(candidates)}</span><Button
              variant="outline"
              disabled={planned(candidates)}
              onclick={() => add(candidates)}
              >{planned(candidates) ? "✓ Planned" : "Add to plan"}</Button
            >
          </div>{/if}
      {:else}<p class="empty">No next unlocks found.</p>{/each}
    </Card.Root>
  </div>
  <Card.Root layout="padded">
    <div class="section-head">
      <h2>Find your next game</h2>
      <span>{finder.length} matches</span>
    </div>
    <p class="muted">
      Global unlock rates are a guide, not a difficulty rating.
    </p>
    <div class="sliders">
      <div class="slider-field">
        <Label>Minimum global unlock rate <b>{floor}%</b></Label><Slider
          type="single"
          id="rarity-floor"
          aria-label="Minimum global unlock rate"
          min={0}
          max={100}
          value={floor}
          onValueChange={setFloor}
          class="min-h-11 mt-2"
        />
      </div>
      <div class="slider-field">
        <Label>Target game completion <b>{target}%</b></Label><Slider
          type="single"
          id="completion-target"
          aria-label="Target game completion"
          min={0}
          max={100}
          value={target}
          onValueChange={setTarget}
          class="min-h-11 mt-2"
        />
      </div>
      <Button variant="outline" onclick={() => setTarget(base.displayed)}
        >Use my average</Button
      >
    </div>
    {#each finder as { game, candidates, current, reach } (game.appid)}<div
        class="suggestion row"
      >
        <div class="body">
          <Button variant="link" class="game" onclick={() => onGame(game.appid)}
            >{game.name}</Button
          >
          <p>
            {current}% → {reach}% · {candidates.length} qualifying achievements
          </p>
        </div>
        <span class="impact">{impact(candidates)}</span>
        <div class="row controls">
          <Button
            variant="outline"
            disabled={planned(candidates)}
            onclick={() => add(candidates)}
            >{planned(candidates) ? "✓ Planned" : "+ Reach target"}</Button
          ><Button
            variant="outline"
            disabled={planned(lockedItems(game))}
            onclick={() => add(lockedItems(game))}>Plan 100%</Button
          >
        </div>
      </div>{:else}<p class="empty">
        Lower either threshold to find more games.
      </p>{/each}
  </Card.Root>
  <Card.Root layout="padded">
    <div class="section-head">
      <h2>Common achievements still locked</h2>
      <span>Top {easy.length}</span>
    </div>
    <div class="easy-grid">
      {#each easy as { game, achievement } (`${game.appid}:${achievement.api_name}`)}{@const candidates =
          asItems(game, [achievement])}
        <div class="suggestion row">
          <div class="body">
            <h3>{achievement.name}</h3>
            <Button
              variant="link"
              class="game secondary"
              onclick={() => onGame(game.appid)}>{game.name}</Button
            >
            <p>
              {achievement.global_completion_rate_pct!.toFixed(1)}% of players · {impact(
                candidates,
              )} points
            </p>
          </div>
          <Button
            variant="outline"
            disabled={planned(candidates)}
            onclick={() => add(candidates)}
            >{planned(candidates) ? "✓ Planned" : "Add to plan"}</Button
          >
        </div>{:else}<p class="empty">
          No locked achievements with global rates.
        </p>{/each}
    </div>
  </Card.Root>
  <Collapsible.Root
    ><Collapsible.Trigger class="min-h-11 text-sm text-primary underline"
      >How projections work</Collapsible.Trigger
    ><Collapsible.Content class="muted text-sm"
      >Individual impacts use your current library. The projection combines your
      plan using Steam’s rounded-down game averages.</Collapsible.Content
    ></Collapsible.Root
  >
</section>

<style>
  .optimizer {
    display: grid;
    gap: 24px;
  }
  .muted {
    font-size: 14px;
    line-height: 1.6;
    color: var(--muted-foreground);
  }
  :global(.optimizer-summary) {
    display: flex;
    align-items: center;
    gap: 24px;
    flex-direction: row;
    flex-wrap: wrap;
  }
  :global(.optimizer-summary) small {
    display: block;
    font-size: 14px;
    letter-spacing: normal;
    color: var(--muted-foreground);
  }
  :global(.optimizer-summary) strong {
    display: block;
    font-size: 32px;
    letter-spacing: -0.7px;
    margin-top: 8px;
  }
  :global(.accent),
  .impact {
    color: var(--primary);
  }
  :global(.optimizer-summary) p {
    margin-left: auto;
    font-size: 14px;
    line-height: 1.8;
  }
  :global(.optimizer-summary) p span {
    color: var(--muted-foreground);
  }
  .arrow {
    color: var(--muted-foreground);
    font-size: 24px;
  }
  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }
  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  h2 {
    font-size: 24px;
    margin: 0;
  }
  .section-head > span {
    font-size: 14px;
    color: var(--muted-foreground);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .suggestion {
    padding: 16px 0;
    border-top: 1px solid var(--border);
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  :global(.game) {
    border: 0;
    padding: 0;
    background: transparent;
    text-align: left;
    color: inherit;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  :global(.game):hover {
    text-decoration: underline;
  }
  .body p {
    font-size: 14px;
    line-height: 1.5;
    color: var(--muted-foreground);
    margin: 5px 0 0;
  }
  .impact {
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
  .remaining {
    display: grid;
    gap: 5px;
    margin-top: 10px;
    font-size: 14px;
    color: var(--muted-foreground);
  }
  .remaining span {
    display: flex;
    justify-content: space-between;
  }
  .remaining b {
    font-weight: 400;
  }
  .sliders {
    display: flex;
    gap: 28px;
    align-items: center;
    margin: 24px 0;
  }
  .slider-field {
    flex: 1;
    min-width: 0;
  }
  .sliders :global(label) {
    flex: 1;
    font-size: 14px;
  }
  .sliders b {
    float: right;
  }
  .sliders :global([data-slot="slider"]) {
    width: 100%;
    margin-top: 14px;
    accent-color: var(--primary);
  }
  .easy-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 30px;
  }
  h3 {
    font-size: 14px;
    margin: 0 0 5px;
  }
  :global(.secondary) {
    font-size: 14px;
    color: var(--muted-foreground);
  }
  .empty {
    font-size: 14px;
    color: var(--muted-foreground);
    padding: 20px 0;
  }

  @media (max-width: 1000px) {
    .columns {
      grid-template-columns: 1fr;
    }
    .controls {
      flex-wrap: wrap;
      justify-content: flex-end;
    }
  }
  @media (max-width: 650px) {
    :global(.optimizer-summary) {
      gap: 16px;
      flex-wrap: wrap;
    }
    :global(.optimizer-summary) strong {
      font-size: 34px;
    }
    :global(.optimizer-summary) p {
      width: 100%;
      margin: 0;
    }
    .easy-grid {
      grid-template-columns: 1fr;
    }
    .sliders {
      align-items: stretch;
      flex-direction: column;
    }
    .controls {
      max-width: 140px;
    }
    .row {
      gap: 8px;
    }
    .impact {
      font-size: 14px;
    }
  }
</style>
