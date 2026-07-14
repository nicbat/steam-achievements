/**
 * The exact average completion, e.g. 32.45%. Steam floors this to a whole number,
 * so the integer part shows in full ink while the decimals — which Steam discards —
 * are dimmed. Two decimals show inline; the full precision and an explanation of the
 * flooring appear on hover.
 */
export function MeanValue({ value, dp = 2, fullDp = 5 }: { value: number; dp?: number; fullDp?: number }) {
  const whole = Math.floor(value);
  // Truncate (not round) the fraction so it can never carry into `whole` and always
  // matches Steam's floor. The epsilon guards float under-representation.
  const frac = (places: number) =>
    Math.floor((value - whole) * 10 ** places + 1e-6)
      .toString()
      .padStart(places, "0");
  return (
    <span
      className="mean"
      title={`Exact mean ${whole}.${frac(fullDp)}% — Steam floors it to ${whole}%, so the decimals aren't counted`}
    >
      {whole}
      <span className="mean__frac">.{frac(dp)}</span>%
    </span>
  );
}
