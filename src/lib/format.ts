export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Hours from minutes, one decimal under 100h else whole. */
export function hoursFromMin(min: number): string {
  const h = min / 60;
  if (h === 0) return "0";
  if (h < 100) return h.toFixed(1);
  return Math.round(h).toLocaleString();
}

export function pct(n: number | null): string {
  return n == null ? "—" : `${n.toFixed(1)}%`;
}

/** Decimals shown inline; the full-precision value lives in a hover tooltip. */
export const PCT_DP = 2;
export const PCT_DP_FULL = 5;

/** A signed impact for inline display, e.g. +0.12 / -0.01. */
export function signed2(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(PCT_DP)}`;
}

/** A signed impact at full precision, for tooltips, e.g. +0.00042 / -0.01310. */
export function signed5(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(PCT_DP_FULL)}`;
}

/**
 * A Steam global-completion rate. Steam's API reports these to exactly one
 * decimal place (verified across every achievement), so any extra precision is
 * fake. Show the real value and strip trailing zeros: 74.2% stays, 5.0% → 5%,
 * 100.0% → 100%.
 */
export function pctRate(n: number | null): string {
  return n == null ? "—" : `${Number(n.toFixed(1))}%`;
}
