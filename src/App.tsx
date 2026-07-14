import { useState } from "react";
import type { SteamData } from "./types";
import { loadData, saveData, clearData } from "./lib/storage";
import { Upload } from "./components/Upload";
import { GetStarted } from "./views/GetStarted";
import { PlanProvider } from "./context/PlanContext";
import { Dashboard } from "./components/Dashboard";

export function App() {
  const [data, setData] = useState<SteamData | null>(() => loadData());
  const [showGuide, setShowGuide] = useState(false);

  function handleLoad(next: SteamData) {
    saveData(next);
    setData(next);
  }

  function handleReset() {
    clearData();
    setData(null);
  }

  if (data) {
    return (
      <div className="app">
        <PlanProvider key={data.steamid64} data={data}>
          <Dashboard data={data} onReset={handleReset} />
        </PlanProvider>
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
            <h1 className="landing__title">See your Steam completion, mapped.</h1>
            <p className="landing__lede">
              Upload the <code>steam_data.json</code> from the collector to explore every achievement, your
              rarest unlocks, and the moves that raise your completion rate the most.
            </p>
            <Upload onLoad={handleLoad} />
            <p className="landing__guide">
              Don&rsquo;t have the file yet?{" "}
              <button className="linkbtn" onClick={() => setShowGuide(true)}>
                Generate it in 3 steps &#8594;
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
