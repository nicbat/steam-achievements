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
        <h3 className="how__h">Steam&rsquo;s method, in three steps</h3>
        <ol className="how__steps">
          <li>
            <b>Only games you&rsquo;ve started count.</b> A game enters the average once you unlock at least one
            achievement in it. Games you own but never played are ignored — <b>{avg.countedGames.toLocaleString()}</b>{" "}
            of yours count right now.
          </li>
          <li>
            <b>Each game&rsquo;s percentage is rounded down.</b> A game at{" "}
            {sample[0] ? `${sample[0].u}/${sample[0].t}` : "7/9"} is {sample[0] ? sample[0].raw.toFixed(2) : "77.78"}%,
            which Steam counts as <b>{sample[0] ? sample[0].floored : 77}%</b> — decimals are always dropped.
          </li>
          <li>
            <b>Those rounded percentages are averaged</b>, then rounded down again for the badge. Your exact average
            is <b><MeanValue value={avg.mean} /></b>, shown by Steam as <b>{avg.displayed}%</b>.
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
            Each game contributes its rounded-down value, so the decimals never reach the average. That&rsquo;s why
            your badge can sit a point below the exact math.
          </p>
        </div>
      )}

      <div className="how__card how__card--warn">
        <h3 className="how__h">Good to know</h3>
        <ul className="how__warn">
          <li>
            <b>Starting a new game lowers your average.</b> It joins at a low percentage and pulls the number down.
            Finishing it brings you back up, but the dip is real. (Watch it on the &ldquo;average over time&rdquo;
            chart in Overview.)
          </li>
          <li>
            <b>One unlock might not move the number.</b> Unlocking 1 of 80 achievements is only +1.25% for that game,
            and averaged across {avg.countedGames.toLocaleString()} games it can round to no visible change.
          </li>
          <li>
            <b>Only the percentage matters, not the count.</b> A 100% game with 5 achievements counts the same as a
            100% game with 500.
          </li>
          <li>
            <b>Perfect games only help.</b> You have <b>{avg.perfectGames}</b> game
            {avg.perfectGames === 1 ? "" : "s"} at 100% — each adds a full 100 to the average.
          </li>
          <li>
            <b>Finishing a nearly-done game beats spreading unlocks around.</b> Going 96% → 100% adds a clean +4 to
            that game; one unlock each across four fresh games can even lower your average. The Optimizer ranks moves
            by this.
          </li>
        </ul>
      </div>
    </section>
  );
}
