import { useQuery } from "@tanstack/react-query";
import { getLoadRealDrivenMiles, type LoadRealDrivenLeg } from "../../api/telematics";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { formatNumberTable } from "../../lib/money";
import { formatDateTimeUS } from "../../lib/formatDate";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";

/**
 * ORDER-2026-09-04 three-mile comparison on one load: practical (billed), short (paid) and REAL DRIVEN
 * (odometer). Real miles come only from geofence enter/exit or device-recorded stop times; a missing leg
 * shows "—" with its reason, never a number borrowed from practical or short.
 */
type Props = { operatingCompanyId: string; loadId: string };

function mi(v: number | null | undefined): string {
  return v == null ? "—" : `${formatNumberTable(v, 1)} mi`;
}

const LEG_COLUMNS: ParityColumn<LoadRealDrivenLeg>[] = [
  { key: "sequence_number", label: "Stop", alwaysVisible: true, render: (l) => String(l.sequence_number) },
  { key: "kind", label: "Leg", render: (l) => (l.kind === "deadhead" ? "Deadhead (from previous load)" : "Loaded") },
  { key: "from_at", label: "From", render: (l) => (l.from_at ? formatDateTimeUS(l.from_at) : "—") },
  { key: "to_at", label: "To", render: (l) => (l.to_at ? formatDateTimeUS(l.to_at) : "—") },
  {
    key: "miles",
    label: "Real driven",
    sortValue: (l) => l.miles,
    render: (l) =>
      l.miles != null ? <span title={l.source ?? undefined}>{mi(l.miles)}</span> : <span className="text-gray-500" title={l.reason ?? undefined}>— {l.reason}</span>,
  },
];

export function LoadRealDrivenMilesSection({ operatingCompanyId, loadId }: Props) {
  const query = useQuery({
    queryKey: ["telematics", "load-real-driven-miles", operatingCompanyId, loadId],
    queryFn: () => getLoadRealDrivenMiles(operatingCompanyId, loadId),
    enabled: Boolean(operatingCompanyId && loadId),
  });
  const c = query.data?.comparison;
  return (
    <div className="space-y-3" data-testid="load-detail-real-driven-miles">
      <div className="text-xs font-semibold text-gray-600">Miles — billed vs paid vs really driven</div>
      <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3">
        {query.isError ? (
          <ListErrorState status={0} message="Could not load real driven miles." onRetry={() => void query.refetch()} />
        ) : query.isLoading ? (
          <div className="text-xs text-gray-500">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div>
                <div className="text-section-header font-bold uppercase tracking-wide text-[#4B5563]">Practical (billed)</div>
                <div className="text-xs font-semibold text-slate-900">{mi(c?.practical_miles)}</div>
              </div>
              <div>
                <div className="text-section-header font-bold uppercase tracking-wide text-[#4B5563]">Short (paid)</div>
                <div className="text-xs font-semibold text-slate-900">{mi(c?.short_miles)}</div>
              </div>
              <div>
                <div className="text-section-header font-bold uppercase tracking-wide text-[#4B5563]">Real driven (loaded)</div>
                <div className="text-xs font-semibold text-slate-900" title={c?.real_driven_loaded_reason ?? undefined}>{mi(c?.real_driven_loaded_miles)}</div>
              </div>
              <div>
                <div className="text-section-header font-bold uppercase tracking-wide text-[#4B5563]">Driven − billed</div>
                <div className="text-xs font-semibold text-slate-900">{mi(c?.real_minus_practical_miles)}</div>
              </div>
            </div>
            {c?.real_driven_loaded_miles == null && c?.real_driven_loaded_reason ? (
              <p className="text-xs text-gray-600">Real driven miles not measurable: {c.real_driven_loaded_reason}</p>
            ) : null}
            {query.data?.unit ? (
              <div className="text-xs text-gray-600">
                Truck <EntityLink kind="unit" id={query.data.unit.id} label={query.data.unit.unit_number ?? "Unit"} />
              </div>
            ) : null}
            <ParityTable appearance="board"
              embedded
              rows={query.data?.legs ?? []}
              columns={LEG_COLUMNS}
              rowKey={(l) => l.stop_id}
              storageKey="load-real-driven-legs"
              exportFilename="load-real-driven-legs"
              tableTestId="load-real-driven-legs"
              emptyText="This load has no stops."
            />
          </>
        )}
      </div>
    </div>
  );
}
