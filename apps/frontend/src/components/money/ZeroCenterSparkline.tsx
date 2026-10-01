/**
 * C-64 — 30-day balance sparkline with a centre zero line (Where the money is rail).
 * When no real series exists, omit the sparkline rather than invent points.
 */
export function ZeroCenterSparkline({
  points,
  colorHex = "#2a78d6",
}: {
  points: number[];
  colorHex?: string;
}) {
  if (points.length < 2) return null;
  const maxAbs = Math.max(...points.map((v) => Math.abs(v)), 1);
  const midY = 14;
  const coords = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * 120;
      const y = midY - (v / maxAbs) * 12;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      className="block h-7 w-[88px] shrink-0"
      viewBox="0 0 120 28"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-testid="zero-center-sparkline"
    >
      <line x1="0" y1={midY} x2="120" y2={midY} stroke="#E5E7EB" strokeWidth="1" />
      <polyline fill="none" stroke={colorHex} strokeWidth="1.5" points={coords} />
    </svg>
  );
}
