import { useQuery } from "@tanstack/react-query";
import { EntityLink } from "./EntityLink";
import { settlementLabel, type SettlementNumberSource } from "../../lib/settlementNumber";
import { loadSettlementRef } from "../../lib/settlementRefLoader";

/**
 * ALL-SEATS LAW (owner, 2026-09-13, verbatim): "in every window where we have a load number, we
 * must also have a column with a pre-settlement, or settlement or tour number." Nobody hand-rolls
 * this column again — this is the ONE component. Rules, enforced by
 * scripts/verify-settlement-ref-beside-load.mjs:
 *   - renders through settlementNumber.ts's settlementLabel()/settlementNumber() — the only
 *     human-visible number is driver_finance.driver_settlements.source_document_ref, NEVER
 *     display_id (the retired internal S-YYYY-NNNN counter).
 *   - an OPEN tour renders "Open" (not blank, not a number).
 *   - NO link at all renders "Not on a tour" — plainly, never an empty cell.
 *   - a real settlement number deep-links to it (EntityLink kind="settlement").
 *
 * LOADS FENCE — this component only READS presettlement_link_id (via the settlement-refs endpoint
 * or a caller-supplied prop); it never writes load status, tour, or trip linkage.
 */
export type SettlementRefData = SettlementNumberSource & { presettlement_link_id?: string | null };

type Props = {
  loadId: string;
  operatingCompanyId: string;
  /**
   * Pre-fetched settlement/tour data for this load, when the caller's own query already projects
   * presettlement_link_id + the joined settlement fields (preferred for a table of many rows —
   * avoids a request per cell). Pass `undefined` (omit) to let this component fetch it itself via
   * a shared batched loader (fine for a single detail view, or a short list that isn't already
   * enriched).
   */
  settlement?: SettlementRefData | null;
};

export function SettlementRefCell({ loadId, operatingCompanyId, settlement }: Props) {
  const shouldFetch = settlement === undefined;
  const query = useQuery({
    queryKey: ["settlement-ref", operatingCompanyId, loadId],
    queryFn: () => loadSettlementRef(operatingCompanyId, loadId),
    enabled: shouldFetch && Boolean(operatingCompanyId) && Boolean(loadId),
    staleTime: 60_000,
  });

  const resolved: SettlementRefData | null = shouldFetch ? (query.data ?? null) : settlement;

  // No presettlement_link_id at all — plainly say so, never an empty cell (14 loads qualify today
  // per the Lead's own audit; this is expected state for those, not an error).
  if (!resolved?.presettlement_link_id) {
    return <span className="text-gray-500">Not on a tour</span>;
  }

  const label = settlementLabel(resolved);
  if (label === "Open") {
    return <span className="font-medium text-slate-700">Open</span>;
  }
  // A closed settlement whose AlwaysTrack document number hasn't been stamped yet — a real,
  // distinct case from "no settlement at all" (never collapse the two into the same bare dash).
  if (label === "—") {
    return (
      <span className="cursor-help border-b border-dotted border-gray-400 text-gray-500" title="Settlement closed, document number not yet stamped">
        —
      </span>
    );
  }

  return <EntityLink kind="settlement" id={resolved.presettlement_link_id} label={label} />;
}
