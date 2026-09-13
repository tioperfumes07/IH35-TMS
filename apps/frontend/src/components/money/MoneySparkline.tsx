import { MONEY_DATAVIZ_PALETTE } from "../../design/money-design-system";

// ROUND-20.8 A6 — ONE SPARKLINE PER KPI WHERE A TREND EXISTS, on the validated dataviz palette
// (#2a78d6 / #1baf7a / #eda100). No other series color is permitted here — this file is the only
// place a money-module tile is allowed to draw one, so the guard only needs to scan this one file
// for stray hex values inside an <svg>.
//
// Two variants, both driven by REAL data only — never a fabricated trend:
//   "fill"  — a single proportion (a %, an hours-until-stale ratio) as a filled bar. Used for
//             uncategorized-rate / staleness, where the "trend" IS the live proportion, not a
//             30-day history this app does not query yet.
//   "line"  — an actual 30-day point series, when the caller has one. Omit the sparkline entirely
//             (do not render this component) rather than invent points for a tile with no real
//             history behind it yet — a fabricated trend is worse than no trend (see
//             "silent-failures-manufacture-a-plausible-normal-value").

type FillProps = { kind: "fill"; pct: number; colorHex: string };
type LineProps = { kind: "line"; points: number[]; colorHex?: string };

export function MoneySparkline(props: FillProps | LineProps) {
  if (props.kind === "fill") {
    const pct = Math.max(0, Math.min(100, props.pct));
    return (
      <svg className="mt-2 block h-[7px] w-full" viewBox="0 0 120 7" preserveAspectRatio="none" aria-hidden="true">
        <rect x="0" y="0" width="120" height="7" rx="3.5" fill="#eef2f6" />
        <rect x="0" y="0" width={(pct / 100) * 120} height="7" rx="3.5" fill={props.colorHex} />
      </svg>
    );
  }
  const { points, colorHex = MONEY_DATAVIZ_PALETTE.blue } = props;
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const coords = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * 120;
      const y = 18 - ((v - min) / span) * 16;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="mt-2 block h-5 w-full" viewBox="0 0 120 20" preserveAspectRatio="none" aria-hidden="true">
      <polyline fill="none" stroke={colorHex} strokeWidth="2" points={coords} />
    </svg>
  );
}
