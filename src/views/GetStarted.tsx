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
      <h1 className="guide__title">Get your steam_data.json</h1>
      <p className="guide__lede">
        Steam&rsquo;s API can&rsquo;t be called from a browser, so you run a small script on your own machine to
        create the file. Your API key <b>stays on your computer</b> — this page just helps you build the command.
      </p>

      <ol className="steps">
        <li className="step-card">
          <div className="step-card__n">1</div>
          <div className="step-card__body">
            <h3>Get a Steam Web API key</h3>
            <p>
              It&rsquo;s free and instant. In the domain field, type anything — <code>localhost</code> works.
            </p>
            <p className="step-card__note">
              <b>Sign in to Steam first</b>, or the key page shows up blank (it redirects to login). Your account also
              needs Steam Guard on and at least $5 spent — Valve requires this for API keys.
            </p>
            <div className="btnrow">
              <a className="btn" href="https://store.steampowered.com/login/" target="_blank" rel="noreferrer">
                1. Sign in to Steam &#8599;
              </a>
              <a className="btn btn--accent" href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer">
                2. Open key page &#8599;
              </a>
            </div>
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
            <h3>Download the collector and run it</h3>
            <p>
              Needs <b>Python 3</b> only — no <code>pip install</code>. (macOS and most Linux have it already; on
              Windows, get it from python.org or the Microsoft Store.) Paste your <b>profile link</b> — or a
              SteamID64 or vanity name — and the command below updates automatically.
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
              Takes a few seconds (~10–15s for a large library) and saves steam_data.json next to the script.
            </p>
          </div>
        </li>

        <li className="step-card">
          <div className="step-card__n">3</div>
          <div className="step-card__body">
            <h3>Upload it here</h3>
            <p>Go back and drop in your steam_data.json. It&rsquo;s read entirely in your browser — nothing is uploaded.</p>
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
