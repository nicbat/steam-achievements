<script lang="ts">
  import * as Table from "#lib/components/ui/table/index.js";
  import * as Chart from "#lib/components/ui/chart/index.js";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { AreaChart, BarChart, ScatterChart, Tooltip } from "layerchart";
  import type { SteamData } from "../../types";
  import { flooredRate } from "../steam";
  let { data, onGame }: { data: SteamData; onGame: (appid: number) => void } =
    $props();
  let chartWidth = $state(0);
  const blue = "var(--primary)";
  const gold = "var(--gold)";
  const chartConfig = {
    cumulative: { label: "Achievements", color: blue },
    avg: { label: "Average completion", color: gold },
    count: { label: "Count", color: blue },
    completion: { label: "Completion", color: blue },
  };
  const bands = [
    { label: "<1%", lo: 0, hi: 1 },
    { label: "1–5%", lo: 1, hi: 5 },
    { label: "5–10%", lo: 5, hi: 10 },
    { label: "10–25%", lo: 10, hi: 25 },
    { label: "25–50%", lo: 25, hi: 50 },
    { label: "50%+", lo: 50, hi: 101 },
  ];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthLabel = (value: number) =>
    new Date(value).toLocaleDateString(undefined, {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    });
  const numberLabel = (value: number) =>
    Number.isInteger(value) ? value.toLocaleString() : "";
  const history = $derived.by(() => {
    const totals = new Map(
      data.games
        .filter((g) => g.has_achievements && g.achievements_total > 0)
        .map((g) => [g.appid, g.achievements_total]),
    );
    const events = data.games
      .flatMap((g) =>
        g.achievements
          .filter((a) => a.unlocked && a.unlock_time)
          .map((a) => ({ time: Date.parse(a.unlock_time!), appid: g.appid })),
      )
      .filter((e) => Number.isFinite(e.time) && e.time > 0)
      .sort((a, b) => a.time - b.time);
    const unlocks = new Map<number, number>();
    const byMonth = new Map<
      number,
      { count: number; avg: number; cumulative: number }
    >();
    let sum = 0,
      counted = 0,
      cumulative = 0;
    for (const event of events) {
      const previous = unlocks.get(event.appid) ?? 0,
        total = totals.get(event.appid) ?? 0;
      if (total) {
        if (previous === 0) counted++;
        sum += flooredRate(previous + 1, total) - flooredRate(previous, total);
      }
      unlocks.set(event.appid, previous + 1);
      const d = new Date(event.time),
        month = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      byMonth.set(month, {
        count: (byMonth.get(month)?.count ?? 0) + 1,
        avg: counted ? sum / counted : 0,
        cumulative: ++cumulative,
      });
    }
    const timeline = [...byMonth].map(([month, entry]) => ({
      month,
      ...entry,
    }));
    const years = [
      ...new Set(timeline.map((p) => new Date(p.month).getUTCFullYear())),
    ].sort((a, b) => b - a);
    return {
      timeline,
      years,
      byMonth,
      max: Math.max(1, ...timeline.map((p) => p.count)),
      count: events.length,
    };
  });
  const rarity = $derived(
    bands.map((b) => ({
      ...b,
      count: data.games.reduce(
        (sum, g) =>
          sum +
          g.achievements.filter(
            (a) =>
              a.unlocked &&
              a.global_completion_rate_pct != null &&
              a.global_completion_rate_pct >= b.lo &&
              a.global_completion_rate_pct < b.hi,
          ).length,
        0,
      ),
    })),
  );
  const distribution = $derived(
    [
      { label: "0%", lo: 0, hi: 1 },
      { label: "1–24%", lo: 1, hi: 25 },
      { label: "25–49%", lo: 25, hi: 50 },
      { label: "50–74%", lo: 50, hi: 75 },
      { label: "75–99%", lo: 75, hi: 100 },
      { label: "100%", lo: 100, hi: 101 },
    ].map((b) => ({
      ...b,
      count: data.games.filter(
        (g) =>
          g.has_achievements &&
          g.achievements_total > 0 &&
          flooredRate(g.achievements_unlocked, g.achievements_total) >= b.lo &&
          flooredRate(g.achievements_unlocked, g.achievements_total) < b.hi,
      ).length,
    })),
  );
  const scatter = $derived(
    data.games
      .filter(
        (g) =>
          g.has_achievements &&
          g.achievements_total > 0 &&
          g.playtime_forever_min > 0,
      )
      .map((g) => ({
        appid: g.appid,
        name: g.name,
        hours: Number((g.playtime_forever_min / 60).toFixed(1)),
        completion: flooredRate(g.achievements_unlocked, g.achievements_total),
      })),
  );
  const dateTicks = $derived.by(() => {
    const count = Math.min(chartWidth < 600 ? 3 : 6, history.timeline.length);
    return Array.from(
      { length: count },
      (_, index) =>
        history.timeline[
          Math.round(
            (index * (history.timeline.length - 1)) / Math.max(1, count - 1),
          )
        ].month,
    );
  });
  const xDomain = $derived(
    history.timeline.length === 1
      ? [
          history.timeline[0].month - 86400000 * 15,
          history.timeline[0].month + 86400000 * 15,
        ]
      : undefined,
  );
</script>

<section class="trends" bind:clientWidth={chartWidth}>
  <Card.Root class="chart-card">
    <div class="chart-heading">
      <div>
        <h2>Achievements over time</h2>
      </div>
      <strong>{history.count.toLocaleString()}<span>dated unlocks</span></strong
      >
    </div>
    {#if history.timeline.length}<Chart.Container
        config={chartConfig}
        class="!aspect-auto chart"
      >
        <AreaChart
          padding={{ left: 48, right: 12, top: 12, bottom: 28 }}
          data={history.timeline}
          x="month"
          y="cumulative"
          {xDomain}
          series={[
            {
              key: "cumulative",
              label: "Achievements",
              value: "cumulative",
              color: blue,
            },
          ]}
          grid={{ x: false, y: true }}
          rule={false}
          props={{
            xAxis: { ticks: dateTicks, format: monthLabel },
            yAxis: { format: numberLabel },
            area: { fillOpacity: 0.15, strokeWidth: 2 },
          }}
        >
          {#snippet tooltip()}<Chart.Tooltip
              labelFormatter={(value) => monthLabel(Number(value))}
            />{/snippet}
        </AreaChart>
      </Chart.Container>{:else}<p class="empty">
        No dated unlocks in this export yet.
      </p>{/if}
  </Card.Root>
  <Card.Root class="chart-card">
    <div class="chart-heading">
      <div>
        <h2>Average completion over time</h2>
        <p>Estimate from dated unlocks.</p>
      </div>
    </div>
    {#if history.timeline.length}<Chart.Container
        config={chartConfig}
        class="!aspect-auto chart"
      >
        <AreaChart
          padding={{ left: 48, right: 12, top: 12, bottom: 28 }}
          data={history.timeline}
          x="month"
          y="avg"
          {xDomain}
          series={[
            {
              key: "avg",
              label: "Average completion",
              value: "avg",
              color: gold,
            },
          ]}
          grid={{ x: false, y: true }}
          rule={false}
          props={{
            xAxis: { ticks: dateTicks, format: monthLabel },
            yAxis: { format: (v: number) => `${v}%` },
            area: { fillOpacity: 0.12, strokeWidth: 2 },
          }}
        >
          {#snippet tooltip()}<Chart.Tooltip
              labelFormatter={(value) => monthLabel(Number(value))}
            />{/snippet}
        </AreaChart>
      </Chart.Container>{:else}<p class="empty">
        No dated unlocks to reconstruct your average.
      </p>{/if}
  </Card.Root>
  <div class="chart-pair">
    <Card.Root class="chart-card">
      <div class="chart-heading">
        <div>
          <h2>Rarity of your unlocks</h2>
        </div>
      </div>
      <Chart.Container config={chartConfig} class="!aspect-auto chart compact">
        <BarChart
          padding={{ left: 40, right: 12, top: 12, bottom: 28 }}
          data={rarity}
          x="label"
          y="count"
          series={[
            {
              key: "count",
              label: "Achievements",
              value: "count",
              color: blue,
            },
          ]}
          rule={false}
          grid={{ x: false, y: true }}
          props={{ yAxis: { format: numberLabel }, bars: { radius: 4 } }}
        >
          {#snippet tooltip()}<Chart.Tooltip />{/snippet}
        </BarChart>
      </Chart.Container>
    </Card.Root>
    <Card.Root class="chart-card">
      <div class="chart-heading">
        <div>
          <h2>Library completion</h2>
        </div>
      </div>
      <Chart.Container config={chartConfig} class="!aspect-auto chart compact">
        <BarChart
          padding={{ left: 40, right: 12, top: 12, bottom: 28 }}
          data={distribution}
          x="label"
          y="count"
          series={[
            { key: "count", label: "Games", value: "count", color: gold },
          ]}
          rule={false}
          grid={{ x: false, y: true }}
          props={{ yAxis: { format: numberLabel }, bars: { radius: 4 } }}
        >
          {#snippet tooltip()}<Chart.Tooltip />{/snippet}
        </BarChart>
      </Chart.Container>
    </Card.Root>
  </div>
  <Card.Root class="chart-card">
    <div class="chart-heading">
      <div>
        <h2>Unlock cadence</h2>
        <p>Brighter months have more unlocks.</p>
      </div>
    </div>
    {#if history.years.length}<div class="heatmap">
        <div class="heat-row heat-head">
          <span></span>{#each months as month}<span>{month}</span>{/each}
        </div>
        {#each history.years as year}<div class="heat-row">
            <span class="year">{year}</span
            >{#each months as month, index}{@const count =
                history.byMonth.get(Date.UTC(year, index, 1))?.count ?? 0}
              <div
                class="heat-cell"
                title={`${month} ${year}: ${count} unlocks`}
                style:background={count
                  ? `color-mix(in srgb, var(--primary) ${20 + (80 * count) / history.max}%, var(--card))`
                  : "var(--muted)"}
              >
                <span class="sr-only">{month} {year}: {count} unlocks</span>
              </div>{/each}
          </div>{/each}
      </div>{:else}<p class="empty">
        No dated unlocks in this export yet.
      </p>{/if}
  </Card.Root>
  <Card.Root class="chart-card">
    <div class="chart-heading">
      <div>
        <h2>Playtime vs completion</h2>
        <p>Select a game to see its achievements.</p>
      </div>
    </div>
    {#if scatter.length}<Chart.Container
        config={chartConfig}
        class="!aspect-auto chart scatter"
      >
        <ScatterChart
          padding={{ left: 48, right: 12, top: 12, bottom: 28 }}
          data={scatter}
          x="hours"
          y="completion"
          yDomain={[0, 100]}
          xBaseline={0}
          cRange={[blue]}
          rule={false}
          onTooltipClick={(_event, details) => onGame(details.data.appid)}
          props={{
            points: { r: 4, fillOpacity: 0.65 },
            xAxis: { format: (v: number) => `${v}h` },
            yAxis: { format: (v: number) => `${v}%` },
          }}
        >
          {#snippet tooltip({ context })}<Tooltip.Root variant="none"
              >{#if context.tooltip.data}<div class="tip">
                  <strong>{context.tooltip.data.name}</strong><span
                    >{context.tooltip.data.hours}h played · {context.tooltip
                      .data.completion}% complete</span
                  >
                </div>{/if}</Tooltip.Root
            >{/snippet}
        </ScatterChart>
      </Chart.Container>
      <Collapsible.Root class="chart-data">
        <Collapsible.Trigger class="min-h-11 text-primary underline"
          >Browse plotted games</Collapsible.Trigger
        >
        <Collapsible.Content>
          <div class="game-links">
            {#each scatter as game}<Button
                variant="ghost"
                class="w-full justify-between"
                onclick={() => onGame(game.appid)}
                ><span>{game.name}</span><span
                  >{game.hours}h · {game.completion}%</span
                ></Button
              >{/each}
          </div>
        </Collapsible.Content></Collapsible.Root
      >{:else}<p class="empty">
        Play a game with achievements to see it here.
      </p>{/if}
  </Card.Root>
  <Card.Root class="chart-card">
    <Collapsible.Root>
      <Collapsible.Trigger class="min-h-11 text-primary underline"
        >View chart data as tables</Collapsible.Trigger
      >
      <Collapsible.Content class="space-y-6 mt-4">
        <div>
          <h3>Unlock history and reconstructed average</h3>
          <div class="max-h-80 overflow-auto">
            <Table.Root
              ><Table.Header
                ><Table.Row
                  ><Table.Head>Month</Table.Head><Table.Head>Unlocks</Table.Head
                  ><Table.Head>Cumulative</Table.Head><Table.Head
                    >Average</Table.Head
                  ></Table.Row
                ></Table.Header
              ><Table.Body
                >{#each history.timeline as point}<Table.Row
                    ><Table.Cell>{monthLabel(point.month)}</Table.Cell
                    ><Table.Cell>{point.count}</Table.Cell><Table.Cell
                      >{point.cumulative}</Table.Cell
                    ><Table.Cell>{point.avg.toFixed(2)}%</Table.Cell></Table.Row
                  >{/each}</Table.Body
              ></Table.Root
            >
          </div>
        </div>
        <div>
          <h3>Rarity of your unlocks</h3>
          <Table.Root
            ><Table.Header
              ><Table.Row
                ><Table.Head>Global unlock rate</Table.Head><Table.Head
                  >Your unlocks</Table.Head
                ></Table.Row
              ></Table.Header
            ><Table.Body
              >{#each rarity as band}<Table.Row
                  ><Table.Cell>{band.label}</Table.Cell><Table.Cell
                    >{band.count}</Table.Cell
                  ></Table.Row
                >{/each}</Table.Body
            ></Table.Root
          >
        </div>
        <div>
          <h3>Library completion</h3>
          <Table.Root
            ><Table.Header
              ><Table.Row
                ><Table.Head>Completion</Table.Head><Table.Head
                  >Games</Table.Head
                ></Table.Row
              ></Table.Header
            ><Table.Body
              >{#each distribution as band}<Table.Row
                  ><Table.Cell>{band.label}</Table.Cell><Table.Cell
                    >{band.count}</Table.Cell
                  ></Table.Row
                >{/each}</Table.Body
            ></Table.Root
          >
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  </Card.Root>
</section>

<style>
  .trends {
    display: grid;
    gap: 20px;
    --color-primary: var(--primary);
    --color-surface-100: var(--card);
    --color-surface-200: var(--border);
    --color-surface-300: var(--border);
    --color-surface-content: var(--foreground);
  }
  :global(.chart-card) {
    min-width: 0;
    padding: 22px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--card);
  }
  .chart-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 26px;
  }
  .chart-heading h2 {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
  }
  .chart-heading p {
    font-size: 14px;
    color: var(--muted-foreground);
    margin: 7px 0 0;
    line-height: 1.5;
  }
  .chart-heading > strong {
    font-size: 23px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .chart-heading > strong span {
    font-size: 14px;
    font-weight: 400;
    color: var(--muted-foreground);
    display: block;
    margin-top: 5px;
  }
  :global(.chart) {
    height: 250px;
    min-width: 0;
    font-size: 14px;
  }
  :global(.chart.compact) {
    height: 230px;
  }
  :global(.chart.scatter) {
    height: 300px;
  }
  .chart-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  .tip {
    padding: 10px 12px;
    font-size: 14px;
    background: var(--popover);
    color: var(--foreground);
    border: 1px solid var(--border);
    border-radius: 7px;
    box-shadow: 0 4px 15px #0003;
  }
  .tip strong {
    display: block;
    font-weight: 600;
    margin-bottom: 5px;
    max-width: 240px;
    white-space: normal;
  }
  .tip span {
    color: var(--muted-foreground);
  }
  .heatmap {
    position: relative;
    min-width: 0;
    display: grid;
    gap: 7px;
    overflow-x: auto;
  }
  .heat-row {
    display: grid;
    grid-template-columns: 42px repeat(12, minmax(23px, 1fr));
    gap: 7px;
    min-width: 420px;
    align-items: center;
  }
  .heat-head {
    font-size: 10px;
    text-align: center;
    color: var(--muted-foreground);
    margin-bottom: 3px;
  }
  .year {
    font-size: 14px;
    color: var(--muted-foreground);
  }
  .heat-cell {
    height: 25px;
    border-radius: 4px;
  }
  .empty {
    padding: 40px 10px;
    color: var(--muted-foreground);
    font-size: 14px;
    text-align: center;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  :global(.chart-data) {
    margin-top: 15px;
    border-top: 1px solid var(--border);
    padding-top: 14px;
    font-size: 14px;
    color: var(--muted-foreground);
  }

  .game-links {
    max-height: 250px;
    overflow: auto;
    margin-top: 12px;
  }
  .game-links :global(button) {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 15px;
    background: transparent;
    border: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    padding: 9px;
    cursor: pointer;
  }
  .game-links :global(button):hover {
    background: var(--muted);
    color: var(--foreground);
  }

  :global(.chart .lc-axis text) {
    fill: var(--muted-foreground);
  }
  :global(.chart .lc-grid line) {
    stroke: var(--border);
    opacity: 0.6;
  }
  @media (max-width: 850px) {
    .chart-pair {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 500px) {
    :global(.chart-card) {
      padding: 16px 10px;
    }
    .chart-heading {
      padding: 0 5px;
    }
    .chart-heading > strong {
      font-size: 19px;
    }
    :global(.chart) {
      height: 220px;
    }
    :global(.chart.scatter) {
      height: 260px;
    }
    .heatmap {
      position: relative;
      min-width: 0;
      padding-bottom: 8px;
    }
  }
</style>
