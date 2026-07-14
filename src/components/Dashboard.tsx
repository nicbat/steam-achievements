import { useMemo, useState } from "react";
import type { SteamData } from "../types";
import { averageCompletion } from "../lib/steam";
import { projectAverage } from "../lib/plan";
import { useWide, usePersistedBool } from "../lib/hooks";
import { usePlan } from "../context/PlanContext";
import { Nav, type ViewKey } from "./Nav";
import { PlanPill } from "./PlanPill";
import { PlanDrawer } from "./PlanDrawer";
import { ProfileOverview } from "./ProfileOverview";
import { Achievements } from "../views/Achievements";
import { Library } from "../views/Library";
import { Optimizer } from "../views/Optimizer";
import { HowItWorks } from "../views/HowItWorks";
import { lazy, Suspense } from "react";

const Trends = lazy(() => import("../views/Trends").then((m) => ({ default: m.Trends })));

export function Dashboard({ data, onReset }: { data: SteamData; onReset: () => void }) {
  const plan = usePlan();
  const wide = useWide();
  const [view, setView] = useState<ViewKey>("overview");
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = usePersistedBool("achievement-atlas:planPinned", false);
  const docked = pinned && wide;

  const base = useMemo(() => averageCompletion(data.games), [data.games]);
  const proj = useMemo(() => projectAverage(data.games, plan.items), [data.games, plan.items]);
  const delta = proj.mean - base.mean;

  return (
    <div className={`app__inner${docked ? " app__inner--docked" : ""}`}>
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">
          &#9670;
        </span>
        <span className="brand__name">Achievement Atlas</span>
        <div className="brand__spacer" />
        {!docked && <PlanPill count={plan.items.length} delta={delta} onClick={() => setOpen(true)} />}
        <button className="brand__reset" onClick={onReset}>
          Replace data
        </button>
      </div>

      <Nav active={view} onChange={setView} />
      {view === "overview" && (
        <>
          <ProfileOverview data={data} />
          <Suspense fallback={<p className="view__count">Loading charts…</p>}>
            <Trends data={data} />
          </Suspense>
        </>
      )}
      {view === "achievements" && <Achievements data={data} />}
      {view === "library" && <Library data={data} />}
      {view === "optimizer" && <Optimizer data={data} />}
      {view === "howitworks" && <HowItWorks data={data} />}

      {open && !docked && <div className="scrim" onClick={() => setOpen(false)} />}
      {(docked || open) && (
        <PlanDrawer
          data={data}
          base={base}
          proj={proj}
          docked={docked}
          pinned={pinned}
          wide={wide}
          onClose={() => setOpen(false)}
          onTogglePin={() => setPinned(!pinned)}
        />
      )}
    </div>
  );
}
