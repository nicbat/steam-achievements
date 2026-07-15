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
            <h1 className="landing__title">See where your Steam completion really stands.</h1>
            <p className="landing__lede">
              A dashboard for your achievements: every unlock, your rarest wins, and the exact moves that raise your
              completion percentage the most. Runs entirely in your browser — nothing is uploaded.
            </p>
            <Upload onLoad={handleLoad} />
            <div className="landing__actions">
              <button className="linkbtn" onClick={() => setShowGuide(true)}>
                Don&rsquo;t have your file yet? Get it in 3 steps &#8594;
              </button>
              <button className="linkbtn" onClick={loadDemo}>
                Or explore a live demo &#8594;
              </button>
            </div>
            {demoError && <p className="upload-error">{demoError}</p>}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
