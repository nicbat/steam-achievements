import { useMemo } from "react";
import type { SteamData } from "../types";
import { averageCompletion, countedGames, flooredRate } from "../lib/steam";
import { MeanValue } from "../components/MeanValue";

export function HowItWorks({ data }: { data: SteamData }) {
  const avg = useMemo(() => averageCompletion(data.games), [data.games]);
  const counted = useMemo(() => countedGames(data.games), [data.games]);

  // A concrete worked example pulled from the user's own library.
  const sample = useMemo(() => {
    const withPartial = counted.filter(
      (g) => g.achievements_unlocked > 0 && g.achievements_unlocked < g.achievements_total,
    );
    return withPartial.slice(0, 3).map((g) => ({
      name: g.name,
      u: g.achievements_unlocked,
      t: g.achievements_total,
      raw: (100 * g.achievements_unlocked) / g.achievements_total,
      floored: flooredRate(g.achievements_unlocked, g.achievements_total),
    }));
  }, [counted]);

  return (
    <section className="view how">
      <div className="view__head">
        <h2 className="view__title">How it&rsquo;s calculated</h2>
      </div>

      <div className="how__card">
        <h3 className="how__h">The method Steam uses</h3>
        <ol className="how__steps">
          <li>
            <b>Count only games you&rsquo;ve started.</b> A game joins the average once you&rsquo;ve unlocked{" "}
            <b>at least one</b> achievement in it. Owned-but-untouched games are ignored — right now{" "}
            <b>{avg.countedGames.toLocaleString()}</b> of your games count.
          </li>
          <li>
            <b>Floor each game&rsquo;s percentage.</b> A game at {sample[0] ? `${sample[0].u}/${sample[0].t}` : "7/9"} is{" "}
            {sample[0] ? sample[0].raw.toFixed(2) : "77.78"}% — Steam drops the decimals to{" "}
            <b>{sample[0] ? sample[0].floored : 77}%</b>. Always rounds <i>down</i>.
          </li>
          <li>
            <b>Average those floored numbers</b>, then <b>floor again</b> for the badge. Your exact mean is{" "}
            <b><MeanValue value={avg.mean} /></b>, which Steam displays as <b>{avg.displayed}%</b>.
          </li>
        </ol>
      </div>

      {sample.length > 0 && (
        <div className="how__card">
          <h3 className="how__h">Worked from your own library</h3>
          <table className="how__table">
            <thead>
              <tr>
                <th>Game</th>
                <th className="r">Unlocked</th>
                <th className="r">Raw %</th>
                <th className="r">Counts as</th>
              </tr>
            </thead>
            <tbody>
              {sample.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td className="r">
                    {s.u}/{s.t}
                  </td>
                  <td className="r how__dim" title={`${s.raw.toFixed(5)}%`}>
                    {s.raw.toFixed(2)}%
                  </td>
                  <td className="r">
                    <b>{s.floored}%</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="how__note">
            Each game contributes its <b>floored</b> value — the raw percentage&rsquo;s decimals never reach the
            average. That&rsquo;s why the number you see can sit a point below the &ldquo;real&rdquo; math.
          </p>
        </div>
      )}

      <div className="how__card how__card--warn">
        <h3 className="how__h">Things that surprise people ⚠️</h3>
        <ul className="how__warn">
          <li>
            <b>Starting a new game lowers your average.</b> It enters the pool at a low percentage and drags the mean
            down. It&rsquo;s temporary — finishing it pulls you back up — but the dip is real. (See it happen on the
            &ldquo;average over time&rdquo; chart in Overview.)
          </li>
          <li>
            <b>One unlock may not move the number at all.</b> Unlocking 1 of 80 achievements is +1.25% raw — but once
            floored and averaged across {avg.countedGames.toLocaleString()} games it can round to no visible change.
          </li>
          <li>
            <b>Achievement count doesn&rsquo;t matter, only the percentage.</b> A 100% game with 5 achievements is worth
            exactly as much to your average as a 100% game with 500.
          </li>
          <li>
            <b>Perfect games are pure ballast.</b> You currently have <b>{avg.perfectGames}</b> game
            {avg.perfectGames === 1 ? "" : "s"} at 100% — each one is a full 100 pulling your mean up.
          </li>
          <li>
            <b>Finishing a nearly-done game beats scattering unlocks.</b> Taking a game from 96% to 100% adds a clean +4
            to that game&rsquo;s contribution; one achievement each across four fresh games can even go negative. The
            Optimizer ranks moves by exactly this.
          </li>
        </ul>
      </div>
    </section>
  );
}
