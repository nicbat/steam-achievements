#!/usr/bin/env python3
"""
Collect a Steam user's data into structured JSON for downstream analysis.

Per game it gathers playtime, per-achievement unlock status, each achievement's
global unlock rate (rarity), and its icon URLs (unlocked + grayscale) from the
game schema. Games are fetched concurrently with a thread pool.

Output: steam_data.json (see the shape near the bottom of main()).

Standard library only — no `pip install` required. Runs on any Python 3.

Usage:
    python3 steam_collect.py [vanity_or_steamid] --key YOUR_API_KEY [--workers N]

The key can also come from the STEAM_WEB_API_KEY env var or a key.env file
(STEAM_WEB_API_KEY=... on one line); the --key flag wins if given.
"""

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
DEFAULT_ID = "76561198197939591"
DEFAULT_WORKERS = 8

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
    """GET {API}/{path}?params using only the standard library (urllib).

    urllib.request.urlopen is thread-safe for independent calls, so no per-thread
    session is needed — the thread pool can share this function directly.
    """
    params["key"] = KEY
    url = f"{API}/{path}?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:  # rate limited — back off
                time.sleep(5 * (attempt + 1))
                continue
            return None
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            time.sleep(2 * (attempt + 1))
            if attempt == 3:
                with _print_lock:
                    print(f"  ! request error {e}", file=sys.stderr)
            continue
    return None


def resolve_steamid(ident):
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
    achs = (data or {}).get("game", {}).get("availableGameStats", {}).get("achievements", [])
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

    player = get("ISteamUserStats/GetPlayerAchievements/v1", steamid=STEAMID, appid=appid, l="english")
    pstats = (player or {}).get("playerstats", {})
    if not (pstats.get("success") and "achievements" in pstats):
        return rec

    player_ach = pstats["achievements"]

    gdata = get("ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2", gameid=appid)
    global_pct = {}
    for a in (gdata or {}).get("achievementpercentages", {}).get("achievements", []):
        try:
            global_pct[a["name"]] = float(a["percent"])
        except (TypeError, ValueError):
            pass

    icons = schema_icons(appid)

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


def main():
    ident = DEFAULT_ID
    workers = DEFAULT_WORKERS
    cli_key = None
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--workers":
            workers = int(args[i + 1])
            i += 2
        elif args[i] in ("--key", "-k"):
            cli_key = args[i + 1]
            i += 2
        else:
            ident = args[i]
            i += 1

    global KEY, STEAMID
    KEY = load_key(cli_key)
    STEAMID = resolve_steamid(ident)
    print(f"Resolved '{ident}' -> {STEAMID}")

    player = collect_player(STEAMID)
    print(f"Player: {player.get('persona_name')} (level {player.get('steam_level')})")

    owned = get("IPlayerService/GetOwnedGames/v1", steamid=STEAMID, include_appinfo=1, include_played_free_games=1)
    owned_games = (owned or {}).get("response", {}).get("games", [])
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

    out = os.path.join(HERE, "steam_data.json")
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
    main()
