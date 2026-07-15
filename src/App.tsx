import { useState } from "react";
import type { SteamData } from "./types";
import { loadData, saveData, clearData } from "./lib/storage";
import { isSteamData } from "./lib/steam";
import { Upload } from "./components/Upload";
import { GetStarted } from "./views/GetStarted";
import { PlanProvider } from "./context/PlanContext";
import { Dashboard } from "./components/Dashboard";
import { Footer } from "./components/Footer";

export function App() {
  const [data, setData] = useState<SteamData | null>(() => loadData());
  const [demo, setDemo] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  function handleLoad(next: SteamData) {
    saveData(next);
    setDemo(false);
    setData(next);
  }

  function handleReset() {
    clearData();
    setDemo(false);
    setData(null);
  }

  async function loadDemo() {
    setDemoError(null);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}demo.json`);
      const parsed: unknown = await res.json();
      if (!isSteamData(parsed)) {
        setDemoError("Couldn't load the demo data.");
        return;
      }
      setDemo(true);
      setData(parsed); // demo is not saved — reloading returns to this page
    } catch {
      setDemoError("Couldn't load the demo data.");
    }
  }

  if (data) {
    return (
      <div className="app">
        <PlanProvider key={data.steamid64} data={data}>
          <Dashboard data={data} onReset={handleReset} demo={demo} />
        </PlanProvider>
        <Footer />
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app__inner">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            &#9670;
          </span>
          <span className="brand__name">Achievement Atlas</span>
        </div>

        {showGuide ? (
          <GetStarted onBack={() => setShowGuide(false)} />
        ) : (
          <div className="landing">
            <div className="landing__hero">
              <div className="landing__copy">
                <h1 className="landing__title">See where your Steam completion really stands.</h1>
                <p className="landing__lede">
                  A dashboard for your achievements: every unlock, your rarest wins, and the exact moves that raise
                  your completion percentage the most.
                </p>
                <div className="landing__cta">
                  <button className="btn btn--accent btn--lg" onClick={loadDemo}>
                    <span aria-hidden="true">&#9654;</span> Explore the live demo
                  </button>
                  <button className="linkbtn linkbtn--strong" onClick={() => setShowGuide(true)}>
                    Get your file in 3 steps &#8594;
                  </button>
                </div>
                {demoError && <p className="upload-error">{demoError}</p>}
              </div>
              <LandingPreview />
            </div>

            <div className="landing__feats">
              <div className="feat">
                <div className="feat__i" aria-hidden="true">&#9636;</div>
                <h3 className="feat__t">Steam-exact math</h3>
                <p className="feat__d">Completion figured the way Steam does it — the number here matches your profile.</p>
              </div>
              <div className="feat">
                <div className="feat__i" aria-hidden="true">&#9670;</div>
                <h3 className="feat__t">Your rarest unlocks</h3>
                <p className="feat__d">Surface the achievements almost nobody else managed to earn.</p>
              </div>
              <div className="feat">
                <div className="feat__i" aria-hidden="true">&#8599;</div>
                <h3 className="feat__t">The optimizer</h3>
                <p className="feat__d">The exact moves that raise your average most — planned and exportable.</p>
              </div>
            </div>

            <Upload compact onLoad={handleLoad} />
            <p className="landing__privacy">
              Runs entirely in your browser — your data and API key never leave your machine.
            </p>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}

/** A static, decorative thumbnail of the dashboard — shows the payoff before you commit
 *  to running the collector. Illustrative sample figures, not live data. */
function LandingPreview() {
  return (
    <div className="landing__preview" aria-hidden="true">
      <div className="lp">
        <div className="lp__bar">
          <span className="lp__mark">&#9670;</span>
          <span className="lp__name">Achievement Atlas</span>
        </div>
        <div className="lp__tiles">
          <div className="lp__tile">
            <div className="lp__v lp__v--a">
              32<span className="lp__frac">.48</span>
            </div>
            <div className="lp__k">Avg completion</div>
          </div>
          <div className="lp__tile">
            <div className="lp__v lp__v--g">7,332</div>
            <div className="lp__k">Achievements</div>
          </div>
          <div className="lp__tile">
            <div className="lp__v lp__v--green">41</div>
            <div className="lp__k">Perfect games</div>
          </div>
          <div className="lp__tile">
            <div className="lp__v">1,204</div>
            <div className="lp__k">Owned games</div>
          </div>
        </div>
        <div className="lp__list">
          <div className="lp__rowhead">Your rarest unlocks</div>
          {[
            { n: "The Hard Way", r: "0.4%" },
            { n: "Speedrun Legend", r: "2.1%" },
            { n: "Golden Berry", r: "3.7%" },
          ].map((a) => (
            <div className="lp__row" key={a.n}>
              <span className="lp__ic" />
              <span className="lp__nm">{a.n}</span>
              <span className="lp__rt">{a.r}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
