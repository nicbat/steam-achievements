<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Progress } from "#lib/components/ui/progress/index.js";
  import { Slider } from "#lib/components/ui/slider/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import * as Alert from "#lib/components/ui/alert/index.js";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import * as Sheet from "#lib/components/ui/sheet/index.js";
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import * as Chart from "#lib/components/ui/chart/index.js";
  import { BarChart } from "layerchart";
  let dialogOpen = $state(false),
    sheetOpen = $state(false),
    threshold = $state(25);
  const chartData = [
    { name: "Unlocked", count: 18 },
    { name: "Remaining", count: 6 },
  ];
</script>

<svelte:head><title>UI gallery · Achievement Atlas</title></svelte:head>
<main class="mx-auto max-w-6xl p-4 sm:p-8 space-y-8">
  <header>
    <Button href="/" variant="link">Back to the app</Button>
    <h1>Shared UI gallery</h1>
    <p class="muted">
      Development review surface using the actual nova shadcn-svelte components.
    </p>
  </header>
  <Card.Root
    ><Card.Header
      ><Card.Title>Actions</Card.Title><Card.Description
        >Shared sizes, keyboard focus, wrapping and disabled states.</Card.Description
      ></Card.Header
    ><Card.Content class="flex flex-wrap gap-3"
      ><Button>Start import</Button><Button variant="outline"
        >Export backup</Button
      ><Button variant="ghost">View details</Button><Button
        variant="destructive">Delete local data</Button
      ><Button disabled>Saving…</Button><Button
        variant="outline"
        onclick={() => (dialogOpen = true)}>Open dialog</Button
      ><Button variant="outline" onclick={() => (sheetOpen = true)}
        >Open plan sheet</Button
      ></Card.Content
    ></Card.Root
  >
  <Card.Root
    ><Card.Header><Card.Title>Fields</Card.Title></Card.Header><Card.Content
      class="grid gap-6 sm:grid-cols-2"
      ><div class="space-y-2">
        <Label for="gallery-profile">Steam profile link</Label><Input
          id="gallery-profile"
          placeholder="https://steamcommunity.com/id/yourname"
          aria-describedby="gallery-help"
        />
        <p id="gallery-help" class="muted">
          Your profile and Game details must be public.
        </p>
      </div>
      <div class="space-y-2">
        <Label for="gallery-invalid">Invalid profile example</Label><Input
          id="gallery-invalid"
          value="not a profile link"
          aria-invalid="true"
          aria-describedby="gallery-error"
        />
        <p id="gallery-error" class="text-destructive">
          Enter a Steam profile link or SteamID.
        </p>
      </div>
      <div class="space-y-2">
        <Label for="gallery-sort">Sort library</Label><NativeSelect.Root
          id="gallery-sort"
          ><NativeSelect.Option>Completion</NativeSelect.Option
          ><NativeSelect.Option>Playtime</NativeSelect.Option
          ></NativeSelect.Root
        >
      </div>
      <div class="space-y-2">
        <Label>Minimum global unlock rate: {threshold}%</Label><Slider
          type="single"
          bind:value={threshold}
          aria-label="Minimum global unlock rate"
          class="min-h-11"
        />
      </div></Card.Content
    ></Card.Root
  >
  <div class="grid gap-6 sm:grid-cols-2">
    <Alert.Root
      ><Alert.Title>Saved in this browser</Alert.Title><Alert.Description
        >Your library and plan are available here. Export a backup to keep a
        separate copy.</Alert.Description
      ></Alert.Root
    ><Alert.Root variant="destructive"
      ><Alert.Title>Changes could not be saved</Alert.Title><Alert.Description
        >Your previous saved library is intact. Retry saving or export the
        unsaved changes.</Alert.Description
      ></Alert.Root
    >
  </div>
  <Card.Root
    ><Card.Header><Card.Title>Progress and game rows</Card.Title></Card.Header
    ><Card.Content class="space-y-4"
      ><div class="flex flex-wrap gap-2">
        <Badge>Planned</Badge><Badge variant="secondary">Completed</Badge><Badge
          variant="outline">Inactive · not in this snapshot</Badge
        >
      </div>
      <div class="flex justify-between gap-4">
        <strong>Example game</strong><span>18 / 24 unlocked · 75%</span>
      </div>
      <Progress value={75} aria-label="Example game completion" />
      <p class="muted">
        Imported 12 of 20 games. Results saved after each batch.
      </p>
      <Progress value={60} aria-label="12 of 20 games imported" /></Card.Content
    ></Card.Root
  >
  <Card.Root
    ><Card.Header
      ><Card.Title>Chart typography and color</Card.Title><Card.Description
        >Example game: 18 achievements unlocked, 6 remaining.</Card.Description
      ></Card.Header
    ><Card.Content
      ><Chart.Container
        config={{ count: { label: "Achievements", color: "var(--primary)" } }}
        class="h-64 !aspect-auto"
        ><BarChart
          data={chartData}
          x="name"
          y="count"
          series={[
            {
              key: "count",
              label: "Achievements",
              value: "count",
              color: "var(--primary)",
            },
          ]}
          props={{
            yAxis: {
              format: (n: number) => (Number.isInteger(n) ? String(n) : ""),
            },
          }}>{#snippet tooltip()}<Chart.Tooltip />{/snippet}</BarChart
        ></Chart.Container
      ></Card.Content
    ></Card.Root
  >
  <Card.Root
    ><Card.Header
      ><Card.Title>No matching games</Card.Title><Card.Description
        >Try a different search or remove a filter.</Card.Description
      ></Card.Header
    ><Card.Footer><Button variant="outline">Clear filters</Button></Card.Footer
    ></Card.Root
  >
</main>
<Dialog.Root bind:open={dialogOpen}
  ><Dialog.Content
    ><Dialog.Header
      ><Dialog.Title>Review your import</Dialog.Title><Dialog.Description
        >8 games will be checked. Your last saved library stays available while
        the import runs.</Dialog.Description
      ></Dialog.Header
    ><Dialog.Footer
      ><Button variant="outline" onclick={() => (dialogOpen = false)}
        >Go back</Button
      ><Button onclick={() => (dialogOpen = false)}>Start import</Button
      ></Dialog.Footer
    ></Dialog.Content
  ></Dialog.Root
>
<Sheet.Root bind:open={sheetOpen}
  ><Sheet.Content
    ><Sheet.Header
      ><Sheet.Title>Your plan</Sheet.Title><Sheet.Description
        >Targets are saved with their profile in this browser.</Sheet.Description
      ></Sheet.Header
    >
    <div class="p-4 space-y-4">
      <p>Example achievement</p>
      <Badge variant="outline">Planned</Badge><Button
        variant="outline"
        onclick={() => (sheetOpen = false)}>Close plan</Button
      >
    </div></Sheet.Content
  ></Sheet.Root
>
