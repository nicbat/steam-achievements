#!/usr/bin/env python3
"""
Analyze steam_data.json and rank the highest-impact achievements for raising
your Steam "average game completion rate".

IMPORTANT — matches Steam's real formula:
  * Each game's completion % is FLOORED to a whole number (Steam never shows
    fractional game completion, e.g. 5/6 = 83.3% is displayed as 83%).
  * The average = mean of those floored per-game percentages, over every game
    in which you've unlocked >=1 achievement.
  * The displayed average is then floored again.
This per-game flooring is why the site shows 32% while a naive raw-rate mean
gives 33%.

Consequences for strategy:
  * Unlocking one achievement helps only as much as it bumps that game's
    FLOORED %. In a game with N<=100 achievements each unlock adds >=1 point,
    so it always bumps. In a game with N>100 (e.g. 361) one unlock may add
    nothing until several stack up -> such games are near-worthless per unlock.
  * Fewest-achievement games give the biggest bump per unlock (100/N points).
  * Starting a brand-new game adds it to the averaged set; that only helps if
    the game's floored rate beats your current average.
"""

import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, "steam_data.json")))
games = data["games"]


def floored_rate(unlocked, total):
    return math.floor(100 * unlocked / total) if total else 0


started = [g for g in games if g["has_achievements"] and g["achievements_unlocked"] >= 1]
n = len(started)
floored = [floored_rate(g["achievements_unlocked"], g["achievements_total"]) for g in started]
avg = sum(floored) / n

print("=" * 72)
print("CURRENT AVERAGE GAME COMPLETION RATE  (Steam's floor-each-game method)")
print("=" * 72)
print(f"  Games counted (>=1 achievement unlocked): {n}")
print(f"  Mean of floored per-game %               : {avg:.4f}%")
print(f"  Steam-displayed value (floored again)    : {math.floor(avg)}%")
print(f"  Perfect games (100%)                     : "
      f"{sum(1 for r in floored if r == 100)}")
print()


def locked(g):
    return [a for a in g["achievements"] if not a["unlocked"]]


def easiest_locked(g):
    """The locked achievement with the highest global completion rate."""
    cands = [a for a in locked(g) if a["global_completion_rate_pct"] is not None]
    return max(cands, key=lambda a: a["global_completion_rate_pct"]) if cands else None


# ---------------------------------------------------------------------------
# A) Started games: bump from unlocking ONE more achievement.
#    Any single locked achievement moves unlocked u -> u+1, so the floored-%
#    gain is identical within a game; only "which" matters for ease.
# ---------------------------------------------------------------------------
rowsA = []
for g in started:
    u, t = g["achievements_unlocked"], g["achievements_total"]
    if u >= t:
        continue
    bump = floored_rate(u + 1, t) - floored_rate(u, t)   # whole points on this game
    if bump <= 0:
        continue   # >100-achievement games where one unlock changes nothing
    e = easiest_locked(g)
    rowsA.append({
        "game": g["name"], "u": u, "t": t,
        "impact": bump / n,
        "easiest": e["name"] if e else "(unknown)",
        "easiest_global": e["global_completion_rate_pct"] if e else None,
    })
rowsA.sort(key=lambda r: (r["impact"],
                          r["easiest_global"] if r["easiest_global"] is not None else -1),
           reverse=True)

print("=" * 72)
print("A) BEST SINGLE UNLOCK IN GAMES YOU'VE STARTED  (+avg per one achievement)")
print("=" * 72)
print(f"   {'+avg':>6}  {'unlk/tot':>9}  {'easy%':>6}  game  ->  easiest achievement left")
for r in rowsA[:20]:
    ez = f"{r['easiest_global']:.1f}" if r["easiest_global"] is not None else "  ?"
    print(f"   {r['impact']:+6.3f}  {r['u']:>4}/{r['t']:<4}  {ez:>6}  "
          f"{r['game']}  ->  {r['easiest']}")
print()

# ---------------------------------------------------------------------------
# A2) Almost-perfect started games: points from reaching 100%.
# ---------------------------------------------------------------------------
near = []
for g in started:
    u, t = g["achievements_unlocked"], g["achievements_total"]
    rem = t - u
    if 0 < rem <= 3:
        gain = (100 - floored_rate(u, t)) / n
        near.append((gain, rem, floored_rate(u, t), g["name"]))
near.sort(reverse=True)
print("=" * 72)
print("A2) ALMOST-PERFECT GAMES (1-3 from 100%)  -> completing = clean big win")
print("=" * 72)
print(f"   {'+avg':>6}  {'left':>4}  {'now%':>5}  game")
for gain, rem, now, name in near[:20]:
    print(f"   {gain:+6.3f}  {rem:>4}  {now:>5}  {name}")
print()

# ---------------------------------------------------------------------------
# B) New games to start (0 unlocked). Adding floored rate r moves the average
#    by (r - avg) / (n + 1). Show impact of first-easiest unlock vs full 100%.
# ---------------------------------------------------------------------------
unstarted = [g for g in games if g["has_achievements"] and g["achievements_unlocked"] == 0]
rowsB = []
for g in unstarted:
    t = g["achievements_total"]
    e = easiest_locked(g)
    r_one = floored_rate(1, t)
    rowsB.append({
        "game": g["name"], "t": t,
        "impact_one": (r_one - avg) / (n + 1),
        "impact_full": (100 - avg) / (n + 1),
        "easiest": e["name"] if e else "(unknown)",
        "easiest_global": e["global_completion_rate_pct"] if e else None,
    })
rowsB.sort(key=lambda r: (r["impact_one"],
                          r["easiest_global"] if r["easiest_global"] is not None else -1),
           reverse=True)
print("=" * 72)
print("B) NEW GAMES WORTH STARTING (0 unlocked)")
print("   +avg(1)=points from the first (easiest) unlock; +avg(all)=from 100%")
print("=" * 72)
print(f"   {'+avg(1)':>8}  {'+avg(all)':>9}  {'total':>5}  {'easy%':>6}  game")
for r in rowsB[:15]:
    ez = f"{r['easiest_global']:.1f}" if r["easiest_global"] is not None else "  ?"
    print(f"   {r['impact_one']:+8.3f}  {r['impact_full']:+9.3f}  "
          f"{r['t']:>5}  {ez:>6}  {r['game']}")
print()
print("=" * 72)
print(f"Starting a game only helps if its floored rate beats your average "
      f"({avg:.1f}%).")
print("Negative +avg(1) => getting only one achievement there LOWERS your avg.")
print("=" * 72)
