import { useMemo, type ReactNode } from "react";
import type { SteamData } from "../types";
import { averageCompletion, accountAgeYears, formatHours } from "../lib/steam";
import { flattenAchievements } from "../lib/derive";
import { pctRate, formatDate } from "../lib/format";
import { AchIcon } from "./AchIcon";
import { MeanValue } from "./MeanValue";

interface Props {
  data: SteamData;
}

interface TileProps {
  value: ReactNode;
  label: string;
  tone?: "accent" | "gold" | "green";
}

function Tile({ value, label, tone }: TileProps) {
  return (
    <div className="tile">
      <div className={`tile__v${tone ? ` tile__v--${tone}` : ""}`}>{value}</div>
      <div className="tile__k">{label}</div>
    </div>
  );
}

export function ProfileOverview({ data }: Props) {
  const { player, totals, games } = data;
  const avg = averageCompletion(games);
  const age = accountAgeYears(player.account_created);

  const rarest = useMemo(
    () =>
      flattenAchievements(data)
        .filter((a) => a.unlocked && a.globalRate != null)
        .sort((a, b) => (a.globalRate ?? 0) - (b.globalRate ?? 0))
        .slice(0, 12),
    [data],
  );

  return (
    <section className="overview">
      <header className="profile">
        {player.avatar && (
          <img className="profile__avatar" src={player.avatar} alt={player.persona_name ?? "avatar"} />
        )}
        <div className="profile__meta">
          <h1 className="profile__name">{player.persona_name ?? data.steamid64}</h1>
          <div className="profile__facts">
            {player.steam_level != null && <span>Level {player.steam_level}</span>}
            {player.country && <span>{player.country}</span>}
            {age != null && <span>{age} yr account</span>}
            {player.badge_count != null && <span>{player.badge_count} badges</span>}
          </div>
        </div>
        {player.profile_url && (
          <a className="profile__link" href={player.profile_url} target="_blank" rel="noreferrer">
            View on Steam &#8599;
          </a>
        )}
      </header>

      <div className="tiles">
        <Tile value={totals.owned_games.toLocaleString()} label="Owned games" />
        <Tile value={`${formatHours(totals.total_playtime_hours)}h`} label="Total playtime" />
        <Tile
          value={totals.total_achievements_unlocked.toLocaleString()}
          label={`of ${totals.total_achievements.toLocaleString()} unlocked`}
          tone="gold"
        />
        <Tile
          value={<MeanValue value={avg.mean} />}
          label={`Avg completion · ${avg.countedGames} games`}
          tone="accent"
        />
        <Tile value={String(avg.perfectGames)} label="Perfect games" tone="green" />
        <Tile value={totals.games_with_achievements.toLocaleString()} label="Games with achievements" />
      </div>

      <p className="overview__note">
        Average completion uses Steam&rsquo;s method — each game rounded down, then averaged — which Steam shows as a
        whole number (<b>{avg.displayed}%</b>). The dimmed decimals above are the exact figure. Data collected{" "}
        {new Date(data.collected_at).toLocaleString()}.
      </p>

      {rarest.length > 0 && (
        <div className="rarest">
          <div className="rarest__head">
            <h3 className="rarest__title">Your rarest unlocks</h3>
            <span className="rarest__sub">Achievements you&rsquo;ve earned that few other players have</span>
          </div>
          <ul className="rarest__list">
            {rarest.map((a) => (
              <li className="rarest__row" key={a.id} title={a.description ?? undefined}>
                <AchIcon src={a.icon} locked={false} size={26} />
                <span className="rarest__name">{a.name}</span>
                <span className="rarest__game">{a.game}</span>
                <span className="rarest__rate">{pctRate(a.globalRate)}</span>
                <span className="rarest__date">{formatDate(a.unlockTime)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
