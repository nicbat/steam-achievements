import { useRef, useState } from "react";
import type { SteamData } from "../types";
import type { AverageResult } from "../lib/steam";
import { usePlan } from "../context/PlanContext";
import { itemKey, toMarkdown, toJson, parsePlanJson, lockedItems, type PlanItem } from "../lib/plan";
import { signed2, signed5 } from "../lib/format";

interface Props {
  data: SteamData;
  base: AverageResult;
  proj: AverageResult;
  docked: boolean;
  pinned: boolean;
  wide: boolean;
  onClose: () => void;
  onTogglePin: () => void;
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function PlanDrawer({ data, base, proj, docked, pinned, wide, onClose, onTogglePin }: Props) {
  const plan = usePlan();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const gameById = new Map(data.games.map((g) => [g.appid, g]));
  const groups = new Map<number, PlanItem[]>();
  for (const it of plan.items) {
    const arr = groups.get(it.appid) ?? [];
    arr.push(it);
    groups.set(it.appid, arr);
  }
  const pts = proj.mean - base.mean;

  function onImport(file: File) {
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const items = parsePlanJson(String(reader.result));
        if (items.length === 0) {
          setImportError("No valid moves found in that file.");
          return;
        }
        plan.merge(items);
      } catch {
        setImportError("That isn't a valid plan file.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <aside className={`plandrawer${docked ? " plandrawer--docked" : " plandrawer--float"}`} aria-label="Your plan">
      <div className="plandrawer__grip" aria-hidden="true" />
      <div className="plandrawer__h">
        <div className="plandrawer__title">Your plan</div>
        <div className="plandrawer__hactions">
          {wide && (
            <button
              className={`iconbtn${pinned ? " iconbtn--on" : ""}`}
              onClick={onTogglePin}
              title={pinned ? "Unpin (float)" : "Pin open"}
              aria-label={pinned ? "Unpin plan" : "Pin open"}
              aria-pressed={pinned}
            >
              <span aria-hidden="true">&#128204;</span>
            </button>
          )}
          {!docked && (
            <button className="iconbtn" onClick={onClose} title="Close" aria-label="Close plan">
              <span aria-hidden="true">&times;</span>
            </button>
          )}
        </div>
      </div>

      <div className="plandrawer__proj">
        <span className="pnow">{base.displayed}%</span>
        <span className="par">&rarr;</span>
        <span className={`pnext${pts > 0 ? " pnext--up" : ""}`}>{proj.displayed}%</span>
        <span
          className={pts >= 0 ? "pdelta pdelta--up" : "pdelta pdelta--down"}
          title={`exact ${signed5(pts)}`}
        >
          {signed2(pts)} pts
        </span>
      </div>

      <div className="plandrawer__list">
        {plan.items.length === 0 ? (
          <p className="plandrawer__empty">
            No moves yet. Add achievements from any screen with the <b>+</b> button, or from the Optimizer.
          </p>
        ) : (
          [...groups.entries()].map(([appid, its]) => {
            const g = gameById.get(appid);
            const allLocked = g ? lockedItems(g) : [];
            // A game counts as "finishing to 100%" when every locked achievement is planned.
            const plannedKeys = new Set(its.map(itemKey));
            const isFull = allLocked.length > 0 && allLocked.every((i) => plannedKeys.has(itemKey(i)));
            return (
              <div className="pgrp" key={appid}>
                <div className="pgrp__game">{g?.name ?? `App ${appid}`}</div>
                {isFull ? (
                  <div className="pitem">
                    <span className="pitem__n">Finish to 100%</span>
                    <span className="pitem__meta">{its.length} achievements</span>
                    <button
                      className="pitem__x"
                      onClick={() => plan.removeMany(its.map(itemKey))}
                      title="Remove all"
                    >
                      &times;
                    </button>
                  </div>
                ) : (
                  its.map((it) => (
                    <div className="pitem" key={it.apiName}>
                      <span className="pitem__n">{it.name}</span>
                      <button className="pitem__x" onClick={() => plan.remove(itemKey(it))} title="Remove">
                        &times;
                      </button>
                    </div>
                  ))
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="plandrawer__foot">
        <button
          className="btn btn--go"
          disabled={plan.items.length === 0}
          onClick={() => download("achievement-plan.md", toMarkdown(data, plan.items), "text/markdown")}
        >
          &#8681; Download plan (.md)
        </button>
        <div className="plandrawer__minor">
          <button
            className="btn btn--sm"
            disabled={plan.items.length === 0}
            onClick={() => download("achievement-plan.json", toJson(data, plan.items), "application/json")}
          >
            Export JSON
          </button>
          <button className="btn btn--sm" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <button className="btn btn--sm" disabled={plan.items.length === 0} onClick={() => plan.clear()}>
            Clear
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = "";
            }}
          />
        </div>
        {importError && <p className="plandrawer__err">{importError}</p>}
      </div>
    </aside>
  );
}
