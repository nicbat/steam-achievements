<script lang="ts">
  import * as Card from "#lib/components/ui/card/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import collector from "../../assets/collector.py?raw";
  import { Button } from "#lib/components/ui/button/index.js";
  let { onBack, onFile }: { onBack: () => void; onFile: () => void } = $props();
  let key = $state(""),
    profile = $state(""),
    copied = $state(false),
    copyError = $state("");
  function resetCopy() { copied = false; copyError = ""; }
  const ident = $derived.by(() => {
    const s = profile.trim();
    const match = s.match(
      /^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/(?:id|profiles)\/([^/?#]+)\/?(?:[?#].*)?$/i,
    );
    try {
      return match ? decodeURIComponent(match[1]) : s;
    } catch {
      return "";
    }
  });
  const valid = $derived(
    /^[a-z\d][a-z\d_-]*$/i.test(ident) && /^[a-f\d]{32}$/i.test(key.trim()),
  );
  const command = $derived(
    `python3 collector.py ${/^[a-z\d][a-z\d_-]*$/i.test(ident) ? ident : "YOUR_STEAMID"} --key ${/^[a-f\d]{32}$/i.test(key.trim()) ? key.trim() : "YOUR_API_KEY"}`,
  );
  function download() {
    const url = URL.createObjectURL(
      new Blob([collector], { type: "text/x-python" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "collector.py";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copy() {
    resetCopy();
    try {
      await navigator.clipboard.writeText(command);
      copied = true;
    } catch {
      copied = false;
      copyError = "Could not copy. Select the command below and copy it manually.";
    }
  }
</script>

<div class="guide">
  <Button variant="ghost" onclick={onBack}>Back</Button>
  <h2>Import your Steam data</h2>
  <p>Run the collector, then open the JSON file here. Python 3 required.</p>
  <Card.Root layout="padded">
    <h2>1. Get an API key</h2>
    <p>
      <a
        href="https://steamcommunity.com/dev/apikey"
        target="_blank"
        rel="noreferrer">Open Steam’s key page</a
      >. Sign in and use localhost as the domain.
    </p>
    <Label
      >API key<Input
        type="password"
        autocomplete="off"
        bind:value={key}
        oninput={resetCopy}
        placeholder="Steam Web API key"
      /></Label
    >
  </Card.Root>
  <Card.Root layout="padded">
    <h2>2. Run the collector</h2>
    <Label
      >Steam profile<Input
        bind:value={profile}
        oninput={resetCopy}
        placeholder="Profile link or SteamID"
      /></Label
    >
    <div class="row">
      <Button onclick={download}>Download collector.py</Button><Button
        variant="outline"
        disabled={!valid}
        onclick={copy}>{copied ? "Copied" : "Copy command"}</Button
      >
    </div>
    {#if copyError}<p role="status">{copyError}</p>{/if}
    <pre>{command}</pre>
    <p>Run in the download folder. Large libraries may take several minutes.</p>
    <p>
      If games are missing, set your Steam profile and Game details to Public.
    </p>
  </Card.Root>
  <Card.Root layout="padded">
    <h2>3. Open the file</h2>
    <p>Choose steam_data.json from the collector’s folder.</p>
    <Button onclick={onFile}>Open data file</Button>
  </Card.Root>
  <p>
    Your key is sent only to Steam by the collector. This page does not send or
    save it.
  </p>
</div>
