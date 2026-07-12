/**
 * GAP-24 — usage example for <FreshnessIndicator>: the Samsara data-freshness pill (L1–L4, green/amber/red).
 * Reference for wiring the pill into any dispatch row/panel that shows Samsara-sourced telematics. The
 * `lastFetchedAt` + `cacheTier` come from the telematics read path (fresh live pull = L1, escalating cache
 * tiers L2–L4). Not a route — a documented example so the component's contract is exercised + discoverable.
 */
import { FreshnessIndicator, type FreshnessCacheTier } from "./FreshnessIndicator";

const nowIso = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000).toISOString();

// Each row shows a representative (tier, age) combination and the color it resolves to.
const EXAMPLES: { label: string; lastFetchedAt: string | null; cacheTier: FreshnessCacheTier | null }[] = [
  { label: "L1 live, 5s old → green", lastFetchedAt: nowIso(5), cacheTier: 1 },
  { label: "L2 cached, 20s old → green", lastFetchedAt: nowIso(20), cacheTier: 2 },
  { label: "L3 cached, 45s old → amber", lastFetchedAt: nowIso(45), cacheTier: 3 },
  { label: "L2 cached, 3m old → red (stale)", lastFetchedAt: nowIso(180), cacheTier: 2 },
  { label: "L4 fallback → red", lastFetchedAt: nowIso(10), cacheTier: 4 },
  { label: "no data → red", lastFetchedAt: null, cacheTier: null },
];

export function FreshnessIndicatorUsageExample() {
  return (
    <div className="space-y-2 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Samsara freshness pill — tiers &amp; colors</h3>
      <table className="text-[13px]">
        <tbody>
          {EXAMPLES.map((ex) => (
            <tr key={ex.label} className="align-middle">
              <td className="py-1 pr-4">
                <FreshnessIndicator lastFetchedAt={ex.lastFetchedAt} cacheTier={ex.cacheTier} />
              </td>
              <td className="py-1 text-slate-600">{ex.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
