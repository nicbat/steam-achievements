<script lang="ts">
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { Progress } from "#lib/components/ui/progress/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import type { SteamData } from "../../types";
  import {
    averageCompletion,
    accountAgeYears,
    formatHours,
    flooredRate,
  } from "../steam";
  import { flattenAchievements } from "../derive";
  import { projectAverage, type PlanItem } from "../plan";
  import { pctRate, formatDate } from "../format";
  let {
    data,
    items,
    onGame,
  }: { data: SteamData; items: PlanItem[]; onGame: (appid: number) => void } =
    $props();
  const avg = $derived(averageCompletion(data.games));
  const projected = $derived(projectAverage(data.games, items));
  const age = $derived(accountAgeYears(data.player.account_created));
  const rarest = $derived(
    flattenAchievements(data)
      .filter((a) => a.unlocked && a.globalRate != null)
      .sort((a, b) => a.globalRate! - b.globalRate!)
      .slice(0, 8),
  );
  const almost = $derived(
    data.games
      .filter(
        (g) =>
          g.has_achievements &&
          g.achievements_unlocked > 0 &&
          g.achievements_unlocked < g.achievements_total,
      )
      .sort(
        (a, b) =>
          a.achievements_total -
            a.achievements_unlocked -
            (b.achievements_total - b.achievements_unlocked) ||
          flooredRate(b.achievements_unlocked, b.achievements_total) -
            flooredRate(a.achievements_unlocked, a.achievements_total),
      )
      .slice(0, 6),
  );
  const stats = $derived([
    {
      label: "Average completion",
      value: `${avg.mean.toFixed(2)}%`,
      detail: `${avg.countedGames} games`,
      accent: true,
    },
    {
      label: "Perfect games",
      value: avg.perfectGames.toLocaleString(),
      detail: "",
    },
    {
      label: "Achievements",
      value: data.totals.total_achievements_unlocked.toLocaleString(),
      detail: `of ${data.totals.total_achievements.toLocaleString()} available`,
    },
    {
      label: "Time played",
      value: `${formatHours(data.totals.total_playtime_hours)}h`,
      detail: `${data.totals.owned_games.toLocaleString()} games`,
    },
  ]);
</script>

<section class="overview">
  <header class="profile">
    {#if data.player.avatar}<img
        class="avatar"
        src={data.player.avatar}
        alt=""
      />{/if}
    <div>
      <h2>{data.player.persona_name ?? data.steamid64}</h2>
      <p>
        {#if data.player.steam_level != null}Level {data.player
            .steam_level}{/if}{#if age != null}<span>{age} year account</span
          >{/if}{#if data.player.country}<span>{data.player.country}</span>{/if}
      </p>
    </div>
    <Button
      variant="outline"
      class="steam-link"
      href={`https://steamcommunity.com/profiles/${data.steamid64}`}
      target="_blank"
      rel="noreferrer">Steam profile ↗</Button
    >
  </header>
  <div class="stats">
    {#each stats as stat}<Card.Root
        class={stat.accent ? "stat accent" : "stat"}
      >
        <h2>{stat.label}</h2>
        <strong>{stat.value}</strong>
        {#if stat.detail}<p>{stat.detail}</p>{/if}
      </Card.Root>{/each}
  </div>
  <Collapsible.Root>
    <Collapsible.Trigger class="text-sm text-primary underline min-h-11"
      >About these numbers</Collapsible.Trigger
    >
    <Collapsible.Content class="muted text-sm"
      >Steam displays {avg.displayed}%. Each game is rounded down before
      averaging; only started games count. Snapshot collected {formatDate(
        data.collected_at,
      )}.</Collapsible.Content
    >
  </Collapsible.Root>
  {#if items.length}<Card.Root class="projection !flex-row">
      <div>
        <strong>Your plan</strong>
        <p>
          {items.length} achievement{items.length === 1 ? "" : "s"} across {new Set(
            items.map((i) => i.appid),
          ).size} games
        </p>
      </div>
      <div class="projection-value">
        {avg.mean.toFixed(2)}% <span>→</span>
        <b>{projected.mean.toFixed(2)}%</b><small
          >{projected.mean - avg.mean >= 0 ? "+" : ""}{(
            projected.mean - avg.mean
          ).toFixed(2)} points</small
        >
      </div>
    </Card.Root>{/if}
  <section class="block">
    <div class="section-head">
      <div>
        <h2>Close to the finish</h2>
      </div>
    </div>
    {#if almost.length}<div class="almost-grid">
        {#each almost as game}<Button
            variant="ghost"
            class="game-card !h-auto !block !whitespace-normal"
            onclick={() => onGame(game.appid)}
            ><img
              src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`}
              alt=""
              loading="lazy"
              onerror={(event) => {
                (event.currentTarget as HTMLImageElement).style.display =
                  "none";
              }}
            />
            <div class="game-info">
              <strong>{game.name}</strong>
              <div class="game-detail">
                <span
                  >{game.achievements_total - game.achievements_unlocked} left</span
                ><span
                  >{flooredRate(
                    game.achievements_unlocked,
                    game.achievements_total,
                  )}%</span
                >
              </div>
              <Progress
                value={(100 * game.achievements_unlocked) /
                  game.achievements_total}
                aria-label={`${game.name} completion`}
              />
            </div></Button
          >{/each}
      </div>{:else}<p class="empty">
        Start earning achievements in a game to see your next finish here.
      </p>{/if}
  </section>
  <section class="block">
    <div class="section-head"><div><h2>Your rarest unlocks</h2></div></div>
    {#if rarest.length}<div class="rare-list">
        {#each rarest as achievement}<Button
            variant="ghost"
            class="rare-row !h-auto !justify-start"
            onclick={() => onGame(achievement.appid)}
            title={achievement.description ?? undefined}
            >{#if achievement.icon}<img
                src={achievement.icon}
                alt=""
                loading="lazy"
                onerror={(event) => {
                  (event.currentTarget as HTMLImageElement).style.display =
                    "none";
                }}
              />{:else}<span class="icon-fallback">◆</span>{/if}<span
              class="rare-title"
              ><strong>{achievement.name}</strong><span>{achievement.game}</span
              ></span
            ><span class="rare-rate"
              >{pctRate(achievement.globalRate)}<small>of players</small></span
            ><time>{formatDate(achievement.unlockTime)}</time></Button
          >{/each}
      </div>{:else}<p class="empty">
        Unlock achievements with global rarity data to see your collection here.
      </p>{/if}
  </section>
</section>

<style>
  .overview {
    display: grid;
    gap: 24px;
  }
  .profile {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .avatar {
    width: 64px;
    height: 64px;
    border-radius: 12px;
  }
  .profile h2 {
    margin: 0;
    font-size: 26px;
    font-weight: 650;
    letter-spacing: -0.6px;
  }
  .profile p {
    margin: 6px 0 0;
    color: var(--muted-foreground);
    font-size: 14px;
  }
  .profile p span {
    margin-left: 14px;
  }
  :global(.steam-link) {
    margin-left: auto;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
  .stats :global(.stat) {
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--card);
  }
  .stats h2 {
    font-size: 14px;
    font-weight: 500;
    color: var(--muted-foreground);
    margin: 0 0 14px;
  }
  .stats strong {
    font-size: 29px;
    letter-spacing: -1px;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  .stats :global(.accent strong) {
    color: var(--primary);
  }
  .stats p {
    font-size: 14px;
    color: var(--muted-foreground);
    margin: 8px 0 0;
  }
  :global(.projection) {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 22px;
    background: var(--card);
  }
  :global(.projection) p {
    font-size: 14px;
    color: var(--muted-foreground);
    margin: 5px 0 0;
  }
  .projection-value {
    font-size: 22px;
    font-variant-numeric: tabular-nums;
  }
  .projection-value span {
    margin: 0 8px;
    color: var(--muted-foreground);
  }
  .projection-value b {
    color: var(--primary);
  }
  .projection-value small {
    display: block;
    font-size: 14px;
    text-align: right;
    color: var(--muted-foreground);
    margin-top: 4px;
  }
  .section-head {
    display: flex;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .section-head h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
  .almost-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }
  :global(.game-card) {
    overflow: hidden;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 9px;
    padding: 0;
    text-align: left;
    color: inherit;
    cursor: pointer;
    font: inherit;
  }
  :global(.game-card > img) {
    width: 100%;
    aspect-ratio: 460/160;
    object-fit: cover;
    display: block;
  }
  .game-info {
    padding: 14px;
  }
  .game-info strong {
    display: block;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    font-size: 14px;
    font-weight: 550;
  }
  .game-detail {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    color: var(--muted-foreground);
    margin: 12px 0 8px;
  }
  .rare-list {
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }
  :global(.rare-row) {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    color: inherit;
    font: inherit;
    text-align: left;
    padding: 13px 18px;
    background: var(--card);
    border: 0;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
  }
  :global(.rare-row):last-child {
    border: 0;
  }
  :global(.rare-row > img),
  .icon-fallback {
    width: 36px;
    height: 36px;
    border-radius: 5px;
    object-fit: cover;
  }
  .rare-title {
    flex: 1;
    min-width: 0;
  }
  .rare-title strong {
    font-size: 14px;
    font-weight: 550;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rare-title > span {
    font-size: 14px;
    display: block;
    margin-top: 4px;
    color: var(--muted-foreground);
  }
  .rare-rate {
    font-size: 14px;
    color: var(--primary);
    text-align: right;
  }
  .rare-rate small {
    display: block;
    font-size: 14px;
    color: var(--muted-foreground);
    margin-top: 3px;
  }
  :global(.rare-row) time {
    font-size: 14px;
    color: var(--muted-foreground);
    min-width: 95px;
    text-align: right;
  }
  .empty {
    color: var(--muted-foreground);
    padding: 24px;
    border: 1px dashed var(--border);
    border-radius: 9px;
    font-size: 14px;
  }
  @media (max-width: 800px) {
    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .almost-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 500px) {
    .profile {
      flex-wrap: wrap;
    }
    :global(.steam-link) {
      margin-left: 80px;
    }
    .stats :global(.stat) {
      padding: 15px;
    }
    .stats strong {
      font-size: 25px;
    }
    .almost-grid {
      grid-template-columns: 1fr;
    }
    :global(.rare-row) time {
      display: none;
    }
    :global(.projection) {
      align-items: flex-start;
      flex-direction: column;
    }
    .projection-value small {
      text-align: left;
    }
  }
</style>
