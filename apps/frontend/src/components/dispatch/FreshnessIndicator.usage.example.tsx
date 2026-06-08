/**
 * GAP-24 usage example — import FreshnessIndicator into dispatch table columns.
 * Block 3 (ETA columns) can wire this without editing DispatchBoard.tsx directly.
 */
import { FreshnessIndicator } from "./FreshnessIndicator";

type GpsFreshnessRow = {
  id: string;
  samsara_last_fetched_at: string | null;
  samsara_cache_tier: 1 | 2 | 3 | 4 | null;
};

/** Example column cell for a dispatch load GPS freshness column. */
export function DispatchGpsFreshnessCell({ row }: { row: GpsFreshnessRow }) {
  return (
    <FreshnessIndicator
      lastFetchedAt={row.samsara_last_fetched_at}
      cacheTier={row.samsara_cache_tier}
    />
  );
}

/**
 * Example DispatchList column header + cell wiring:
 *
 * <th>GPS</th>
 * ...
 * <td>
 *   <DispatchGpsFreshnessCell row={load} />
 * </td>
 */
