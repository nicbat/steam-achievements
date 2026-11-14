#!/usr/bin/env python3
"""
Collect a Steam user's data into structured JSON for downstream analysis.

Per game it gathers playtime, per-achievement unlock status, each achievement's
global unlock rate (rarity), and its icon URLs (unlocked + grayscale) from the
game schema. API calls are serialized, spaced, and limited to 1,000 by default.
Failures stop collection without replacing the output; retries are manual.

Output: steam_data.json (see the shape near the bottom of main()).

Standard library only — no `pip install` required. Runs on any Python 3.

Usage:
    python3 steam_collect.py PROFILE --key YOUR_API_KEY [--workers N] [--max-calls N] [--output FILE]

The key can also come from the STEAM_WEB_API_KEY env var or a key.env file
(STEAM_WEB_API_KEY=... on one line); the --key flag wins if given.
"""

import argparse
import concurrent.futures
import json
import os
import sys
import threading
import time
import datetime as dt
import urllib.error
import urllib.parse
import urllib.request

# Standard library only — no `pip install` needed. Run with plain `python3`.

API = "https://api.steampowered.com"
HERE = os.path.dirname(os.path.abspath(__file__))
KEY_FILE = os.path.join(HERE, "key.env")
DEFAULT_WORKERS = 1
MAX_CALLS = 1000
_calls = 0
_last_start = None
_stop_reason = None
_request_lock = threading.Lock()


class CollectionStopped(RuntimeError):
    """A shared failure stops all workers without publishing partial output."""


def reset_requests(max_calls=1000):
    global MAX_CALLS, _calls, _last_start, _stop_reason
    MAX_CALLS, _calls, _last_start, _stop_reason = max_calls, 0, None, None


def stop_requests(reason):
    global _stop_reason
    _stop_reason = reason
    raise CollectionStopped(reason)

_print_lock = threading.Lock()


def load_key(cli_key=None):
    """Resolve the API key: --key arg > STEAM_WEB_API_KEY env var > key.env file."""
    if cli_key:
        return cli_key.strip()
    env = os.environ.get("STEAM_WEB_API_KEY")
    if env:
        return env.strip()
    try:
        with open(KEY_FILE) as f:
            for line in f:
                if line.startswith("STEAM_WEB_API_KEY="):
                    return line.split("=", 1)[1].strip()
    except FileNotFoundError:
        pass
    raise SystemExit(
        "No Steam API key found. Pass it on the command line:\n"
        "    python3 collector.py YOUR_STEAMID --key YOUR_API_KEY\n"
        "(or set the STEAM_WEB_API_KEY env var, or put it in key.env)"
    )


def get(path, **params):
    """Serialize and budget upstream calls across every worker; never auto-retry."""
    global _calls, _last_start
    # Hold the lock through the response so a denial stops queued workers before
    # another call starts. Extra workers only overlap local processing.
    with _request_lock:
        if _stop_reason:
            raise CollectionStopped(_stop_reason)
        if _calls >= MAX_CALLS:
            stop_requests("API call allowance reached. No output was replaced. Increase --max-calls explicitly if needed.")
        if _last_start is not None:
            time.sleep(max(0, 0.5 - (time.monotonic() - _last_start)))
        params["key"] = KEY
        url = f"{API}/{path}?" + urllib.parse.urlencode(params)
        _last_start = time.monotonic()
        _calls += 1
        try:
            with urllib.request.urlopen(url, timeout=15) as r:
                payload = r.read(2097153)
                if len(payload) > 2097152:
                    stop_requests("Steam response exceeded the safe size limit. No output was replaced.")
                result = json.loads(payload.decode("utf-8"))
                if not isinstance(result, dict):
                    stop_requests("Steam returned malformed data. No output was replaced.")
                return result
        except urllib.error.HTTPError as e:
            try:
                if path == "ISteamUserStats/GetPlayerAchievements/v1" and e.code in (400, 403):
                    try:
                        stats = json.loads(e.read(2097152)).get("playerstats", {})
                        error = stats.get("error", "").strip().lower().rstrip(".")
                        if stats.get("success") is False and error in (
                            "requested app has no stats", "requested app has no stats for this user",
                            "profile is not public", "profile is private", "private profile",
                        ):
                            return None
                    except (ValueError, AttributeError, TypeError):
                        pass
                if e.code in (400, 404) and path.startswith("ISteamUserStats/"):
                    return None
                stop_requests(f"Steam returned HTTP {e.code}. Collection stopped; no output was replaced. Retry manually later.")
            finally:
                e.close()
        except (urllib.error.URLError, TimeoutError, OSError, ValueError, UnicodeError):
            # Never include exception text: urllib errors may contain the key URL.
            stop_requests("Steam request failed or returned malformed data. Collection stopped; no output was replaced.")


def normalize_ident(ident):
    """Accept a SteamID64, vanity name, or a copied Steam Community profile URL."""
    ident = ident.strip()
    if ident.startswith(("steamcommunity.com/", "www.steamcommunity.com/")):
        ident = "https://" + ident
    if "://" in ident:
        url = urllib.parse.urlsplit(ident)
        parts = url.path.strip("/").split("/")
        if (url.scheme not in ("http", "https")
                or url.hostname not in ("steamcommunity.com", "www.steamcommunity.com")
                or len(parts) != 2 or parts[0] not in ("id", "profiles")):
            raise ValueError("Use a Steam Community /id/name or /profiles/SteamID64 profile URL.")
        ident = parts[1]
        if parts[0] == "profiles" and not (ident.isdigit() and len(ident) == 17):
            raise ValueError("A /profiles/ URL must contain a 17-digit SteamID64.")
    if not ident or any(c in ident for c in "/?#") or any(c.isspace() for c in ident):
        raise ValueError("Enter a SteamID64, vanity name, or Steam Community profile URL.")
    return ident


def resolve_steamid(ident):
    try:
        ident = normalize_ident(ident)
    except ValueError as e:
        raise SystemExit(str(e)) from None
    if ident.isdigit() and len(ident) == 17:
        return ident
    data = get("ISteamUser/ResolveVanityURL/v1", vanityurl=ident)
    resp = (data or {}).get("response", {})
    if resp.get("success") == 1:
        return resp["steamid"]
    raise SystemExit(f"Could not resolve vanity name '{ident}': {resp}")


def iso(epoch):
    if not epoch:
        return None
    return dt.datetime.fromtimestamp(epoch, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def collect_player(sid):
    player = {"steamid64": sid}
    s = (get("ISteamUser/GetPlayerSummaries/v2", steamids=sid) or {}).get("response", {}).get("players", [{}])
    s = s[0] if s else {}
    vis = {1: "private_or_friends", 3: "public"}.get(s.get("communityvisibilitystate"))
    player.update({
        "persona_name": s.get("personaname"),
        "profile_url": s.get("profileurl"),
        "real_name": s.get("realname"),
        "country": s.get("loccountrycode"),
        "account_created": iso(s.get("timecreated")),
        "last_logoff": iso(s.get("lastlogoff")),
        "visibility": vis,
        "avatar": s.get("avatarfull"),
    })
    lvl = (get("IPlayerService/GetSteamLevel/v1", steamid=sid) or {}).get("response", {})
    player["steam_level"] = lvl.get("player_level")
    b = (get("IPlayerService/GetBadges/v1", steamid=sid) or {}).get("response", {})
    player["xp"] = b.get("player_xp")
    player["badge_count"] = len(b.get("badges", []))
    bans = (get("ISteamUser/GetPlayerBans/v1", steamids=sid) or {}).get("players", [{}])
    bans = bans[0] if bans else {}
    player["bans"] = {
        "vac_banned": bans.get("VACBanned"),
        "vac_ban_count": bans.get("NumberOfVACBans"),
        "community_banned": bans.get("CommunityBanned"),
        "economy_ban": bans.get("EconomyBan"),
        "game_ban_count": bans.get("NumberOfGameBans"),
    }
    return player


def schema_icons(appid):
    """api_name -> {'icon', 'icon_gray'} from the game's achievement schema."""
    data = get("ISteamUserStats/GetSchemaForGame/v2", appid=appid)
    if data is None:
        return {}
    game = data.get("game")
    if not isinstance(game, dict):
        stop_requests("Steam returned malformed achievement details. No output was replaced.")
    stats = game.get("availableGameStats")
    if stats is None:
        return {}
    if not isinstance(stats, dict):
        stop_requests("Steam returned malformed achievement details. No output was replaced.")
    achs = stats.get("achievements", [])
    if not isinstance(achs, list) or any(not isinstance(a, dict) or not isinstance(a.get("name"), str) or not a["name"] for a in achs):
        stop_requests("Steam returned malformed achievement details. No output was replaced.")
    out = {}
    for a in achs:
        out[a.get("name", "")] = {"icon": a.get("icon"), "icon_gray": a.get("icongray")}
    return out


def process_game(g):
    """Fetch achievements + rarity + icons for one owned game. Returns a rec dict."""
    appid = g["appid"]
    name = g.get("name", f"app_{appid}")
    pf = g.get("playtime_forever", 0)
    rec = {
        "appid": appid,
        "name": name,
        "playtime_forever_min": pf,
        "playtime_forever_hours": round(pf / 60, 2),
        "playtime_2weeks_min": g.get("playtime_2weeks", 0),
        "playtime_windows_min": g.get("playtime_windows_forever", 0),
        "playtime_mac_min": g.get("playtime_mac_forever", 0),
        "playtime_linux_min": g.get("playtime_linux_forever", 0),
        "last_played": iso(g.get("rtime_last_played")),
        "has_achievements": False,
        "achievements_total": 0,
        "achievements_unlocked": 0,
        "completion_rate_pct": None,
        "achievements": [],
    }

    icons = schema_icons(appid)
    if not icons:
        return rec

    player = get("ISteamUserStats/GetPlayerAchievements/v1", steamid=STEAMID, appid=appid, l="english")
    pstats = (player or {}).get("playerstats", {})
    if not (pstats.get("success") and "achievements" in pstats):
        return rec

    player_ach = pstats["achievements"]
    if not player_ach:
        return rec

    gdata = get("ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2", gameid=appid)
    global_pct = {}
    for a in (gdata or {}).get("achievementpercentages", {}).get("achievements", []):
        try:
            global_pct[a["name"]] = float(a["percent"])
        except (TypeError, ValueError):
            pass

    for a in player_ach:
        api_name = a.get("apiname", "")
        rate = global_pct.get(api_name)
        ic = icons.get(api_name, {})
        rec["achievements"].append({
            "api_name": api_name,
            "name": a.get("name") or api_name,
            "description": a.get("description"),
            "unlocked": bool(a.get("achieved")),
            "unlock_time": iso(a.get("unlocktime")),
            # Steam's API only reports global percentages to 1 decimal place, so
            # extra precision here would be fake — 4 dp is already generous headroom.
            "global_completion_rate_pct": round(rate, 4) if rate is not None else None,
            "icon": ic.get("icon"),
            "icon_gray": ic.get("icon_gray"),
        })

    total = len(player_ach)
    unlocked = sum(1 for a in player_ach if a.get("achieved"))
    rec["has_achievements"] = True
    rec["achievements_total"] = total
    rec["achievements_unlocked"] = unlocked
    rec["completion_rate_pct"] = round(100 * unlocked / total, 2) if total else 0.0
    return rec


def positive_workers(value):
    try:
        workers = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError("workers must be a positive integer") from None
    if not 1 <= workers <= 4:
        raise argparse.ArgumentTypeError("workers must be between 1 and 4")
    return workers


def positive_calls(value):
    try:
        calls = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError("max-calls must be a positive integer") from None
    if calls < 1:
        raise argparse.ArgumentTypeError("max-calls must be a positive integer")
    return calls


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("profile", help="SteamID64, vanity name, or Steam Community profile URL")
    parser.add_argument("--key", "-k", help="Steam API key (also read from STEAM_WEB_API_KEY or key.env)")
    parser.add_argument("--workers", type=positive_workers, default=DEFAULT_WORKERS)
    parser.add_argument("--max-calls", type=positive_calls, default=1000, help="Total API attempt allowance (default 1000); explicit increase permits more calls")
    parser.add_argument("--output", "-o", default=os.path.join(HERE, "steam_data.json"), help="Output JSON path")
    args = parser.parse_args()
    ident, workers, cli_key = args.profile, args.workers, args.key

    reset_requests(args.max_calls)
    global KEY, STEAMID
    KEY = load_key(cli_key)
    STEAMID = resolve_steamid(ident)
    print(f"Resolved '{ident}' -> {STEAMID}")

    player = collect_player(STEAMID)
    print(f"Player: {player.get('persona_name')} (level {player.get('steam_level')})")

    owned = get("IPlayerService/GetOwnedGames/v1", steamid=STEAMID, include_appinfo=1, include_played_free_games=1)
    if owned is None:
        raise SystemExit("Steam could not return the game library. Check your API key and connection, then retry.")
    owned_games = owned.get("response", {}).get("games", [])
    if not owned_games:
        raise SystemExit("No owned games (game details likely private).")
    owned_games.sort(key=lambda g: g.get("name", "").lower())
    total_games = len(owned_games)
    print(f"{total_games} owned games. Fetching with {workers} workers...\n")

    games = [None] * total_games
    done = 0
    start = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(process_game, g): idx for idx, g in enumerate(owned_games)}
        for fut in concurrent.futures.as_completed(futures):
            idx = futures[fut]
            rec = fut.result()
            games[idx] = rec
            done += 1
            with _print_lock:
                tag = (
                    f"{rec['achievements_unlocked']}/{rec['achievements_total']} "
                    f"({rec['completion_rate_pct']}%)"
                    if rec["has_achievements"]
                    else "no achievements"
                )
                print(f"  [{done}/{total_games}] {rec['name']}: {tag}")

    total_min = sum(g["playtime_forever_min"] for g in games)
    data = {
        "collected_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "steamid64": STEAMID,
        "player": player,
        "totals": {
            "owned_games": len(games),
            "games_played": sum(1 for g in games if g["playtime_forever_min"] > 0),
            "games_with_achievements": sum(1 for g in games if g["has_achievements"]),
            "total_playtime_min": total_min,
            "total_playtime_hours": round(total_min / 60, 2),
            "total_achievements": sum(g["achievements_total"] for g in games),
            "total_achievements_unlocked": sum(g["achievements_unlocked"] for g in games),
        },
        "games": games,
    }

    out = os.path.abspath(os.path.expanduser(args.output))
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    t = data["totals"]
    elapsed = time.time() - start
    print(f"\nWrote {out} in {elapsed:.0f}s")
    print(f"  {t['owned_games']} games, {t['total_playtime_hours']}h, "
          f"{t['total_achievements_unlocked']}/{t['total_achievements']} achievements")


if __name__ == "__main__":
    KEY = ""
    STEAMID = ""
    try:
        main()
    except CollectionStopped as error:
        raise SystemExit(str(error)) from None
