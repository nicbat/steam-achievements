import { useState } from "react";
import collectorSrc from "../assets/collector.py?raw";

/** Pull a SteamID64 or vanity name out of whatever the user pasted — a bare id,
 *  a bare vanity, or a full profile URL (…/profiles/7656… or …/id/vanity). */
function parseSteamRef(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const prof = s.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (prof) return prof[1];
  const vanity = s.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
  if (vanity) return decodeURIComponent(vanity[1]);
  return s;
}

export function GetStarted({ onBack }: { onBack: () => void }) {
  const [key, setKey] = useState("");
  const [id, setId] = useState("");

  const keyShown = key.trim() || "YOUR_API_KEY";
  const parsedId = parseSteamRef(id);
  const idShown = parsedId || "YOUR_STEAMID_OR_VANITY";
  // Show a hint only when we actually unwrapped a profile URL into something else.
  const detected = parsedId && parsedId !== id.trim() ? parsedId : "";

  const command = `python3 collector.py ${idShown} --key ${keyShown}`;

  function downloadCollector() {
    const blob = new Blob([collectorSrc], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "collector.py";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="guide">
      <button className="linkbtn guide__back" onClick={onBack}>
        &#8592; Back
      </button>
      <h1 className="guide__title">Generate your steam_data.json</h1>
      <p className="guide__lede">
        The Steam API can&rsquo;t be called from a browser (no CORS), so a tiny script runs on your machine
        instead. Your API key <b>never leaves your computer</b> — this page only helps you assemble the command.
      </p>

      <ol className="steps">
        <li className="step-card">
          <div className="step-card__n">1</div>
          <div className="step-card__body">
            <h3>Get a Steam Web API key</h3>
            <p>
              Register one (free, instant) — for the domain field just enter anything, e.g. <code>localhost</code>.
            </p>
            <p className="step-card__note">
              <b>Sign in to Steam first.</b> The key page looks blank or “dead” if you&rsquo;re not logged in — it
              silently redirects to the login screen. Log in in the same browser, then open the link. Your account
              also needs to be Steam-Guard-enabled and have spent at least $5 (Valve&rsquo;s requirement for API keys).
            </p>
            <div className="btnrow">
              <a className="btn" href="https://store.steampowered.com/login/" target="_blank" rel="noreferrer">
                1. Sign in to Steam &#8599;
              </a>
              <a className="btn btn--accent" href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer">
                2. Open key page &#8599;
              </a>
            </div>
            <p className="step-card__note">
              If it still won&rsquo;t load, try <code>steamcommunity.com/dev/apikey</code> directly, or the dev landing
              page <code>steamcommunity.com/dev</code>.
            </p>
            <input
              className="field"
              type="text"
              placeholder="Paste your API key here"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              spellCheck={false}
            />
          </div>
        </li>

        <li className="step-card">
          <div className="step-card__n">2</div>
          <div className="step-card__body">
            <h3>Download the collector &amp; run it</h3>
            <p>
              Needs only <b>Python 3</b> — no <code>pip install</code>, no dependencies (macOS &amp; most Linux
              already have it; Windows: install from python.org or the Microsoft Store). Paste your{" "}
              <b>profile link</b> (or a SteamID64 / vanity name) — the command below fills in automatically with
              your key, so there&rsquo;s no file to create.
            </p>
            <input
              className="field"
              type="text"
              placeholder="Profile URL (steamcommunity.com/id/… or /profiles/…), or a SteamID64 / vanity"
              value={id}
              onChange={(e) => setId(e.target.value)}
              spellCheck={false}
            />
            {detected && (
              <p className="step-card__note">
                Detected from link: <code>{detected}</code>
              </p>
            )}
            <div className="btnrow">
              <button className="btn" onClick={downloadCollector}>
                &#8681; Download collector.py
              </button>
              <CopyButton text={command} label="Copy command" />
            </div>
            <pre className="cmd">
              <code>{command}</code>
            </pre>
            <p className="step-card__note">
              Runs in a few seconds (~10–15s even for a large library) and writes steam_data.json next to the script.
            </p>
          </div>
        </li>

        <li className="step-card">
          <div className="step-card__n">3</div>
          <div className="step-card__body">
            <h3>Upload the file here</h3>
            <p>Come back, hit “Back”, and drop in the generated steam_data.json. It&rsquo;s parsed entirely in your browser.</p>
            <button className="btn btn--accent" onClick={onBack}>
              Back to upload
            </button>
          </div>
        </li>
      </ol>
    </section>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }
  return (
    <button className="btn" onClick={copy}>
      {done ? "Copied ✓" : label}
    </button>
  );
}
