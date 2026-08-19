import { useEffect, useState } from "react";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/useAuth";
import { getArrivingSoon, logArrivingSoonView, type ArrivingSoonCard as ArrivingSoonCardType } from "../../api/maintenance";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ArrivingSoonFilterBar } from "./components/ArrivingSoonFilterBar";
import { ArrivingSoonCard } from "./components/ArrivingSoonCard";
import { ConvertIssueToWOModal } from "./components/ConvertIssueToWOModal";
import { entityLabel } from "../../lib/entity-label";

type Props = {
  operatingCompanyId: string;
};

// §7 severity styling — single red (severe), single amber (warning), slate (info).
function severityChip(severity: string) {
  const s = severity.toLowerCase();
  if (s === "severe") return "border-[#A32D2D] bg-[#fbeaea] text-[#A32D2D]";
  if (s === "warning") return "border-[#854F0B] bg-[#fdf3e6] text-[#854F0B]";
  return "border-gray-300 bg-gray-100 text-gray-600";
}

function formatDest(card: ArrivingSoonCardType): string {
  const place = [card.final_dest_city, card.final_dest_state].filter(Boolean).join(", ");
  const name = card.final_dest_name?.trim();
  const label = name || place || "—";
  return card.final_dest_is_yard ? `${label} (yard)` : label;
}

function formatEta(card: ArrivingSoonCardType): string {
  if (card.already_arrived) return "Arrived";
  const h = card.hours_until_yard_arrival;
  if (h == null) return card.predicted_yard_arrival_at ? new Date(card.predicted_yard_arrival_at).toLocaleString() : "—";
  if (h <= 0) return "Due now";
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function formatReported(iso: string): string {
  return new Date(iso).toLocaleString();
}

// Preview parity (arriving-soon.html): split the old conflated "Issues" column into a plain-text
// "Open Issue" (the most-severe open issue) + a colored "Severity" label. Both derive from data the
// card already carries (issues[] + severe/warning/info_count) — no fabricated column.
const SEV_RANK: Record<string, number> = { severe: 3, warning: 2, info: 1 };

function topSeverity(card: ArrivingSoonCardType): "severe" | "warning" | "info" {
  return card.severe_count > 0 ? "severe" : card.warning_count > 0 ? "warning" : "info";
}

function topIssueLabel(card: ArrivingSoonCardType): string {
  if (card.issues.length === 0) return "—";
  const top = [...card.issues].sort(
    (a, b) => (SEV_RANK[b.severity?.toLowerCase()] ?? 0) - (SEV_RANK[a.severity?.toLowerCase()] ?? 0),
  )[0];
  const base = top.issue_type || top.description || "Open issue";
  const more = card.total_open_issues > 1 ? ` +${card.total_open_issues - 1}` : "";
  return `${base}${more}`;
}

// Preview uses colored severity TEXT (t-red / t-amber), not a pill — match it. §7: red #A32D2D, amber #854F0B.
function severityTextClass(severity: string): string {
  const s = severity.toLowerCase();
  if (s === "severe") return "text-[#A32D2D]";
  if (s === "warning") return "text-[#854F0B]";
  return "text-gray-500";
}

export function ArrivingSoonPage({ operatingCompanyId }: Props) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canConvert = ["Owner", "Administrator", "Manager", "Maintenance"].includes(String(auth.user?.role ?? ""));
  const [withinHours, setWithinHours] = useState(48);
  const [severityMin, setSeverityMin] = useState<"info" | "warning" | "severe">("info");
  const [includeAlreadyArrived, setIncludeAlreadyArrived] = useState(true);
  const [includeNonYard, setIncludeNonYard] = useState(true);
  const [selectedCard, setSelectedCard] = useState<ArrivingSoonCardType | null>(null);

  const query = useQuery({
    queryKey: ["maintenance", "arriving-soon", operatingCompanyId, withinHours, severityMin, includeAlreadyArrived, includeNonYard],
    queryFn: () =>
      getArrivingSoon({
        operating_company_id: operatingCompanyId,
        within_hours: withinHours,
        severity_min: severityMin,
        include_already_arrived: includeAlreadyArrived,
        include_non_yard_destination: includeNonYard,
      }),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!operatingCompanyId) return;
    void logArrivingSoonView(operatingCompanyId);
  }, [operatingCompanyId]);

  const cards = query.data?.cards ?? [];
  const recentConversions = query.data?.recent_conversions ?? [];
  const counts = query.data?.counts ?? { total: 0, severe: 0, warning: 0, info: 0, already_arrived: 0 };
  // MAINT-S03 — settled-only empty (never mid-fetch false-empty; never empty-on-error).
  const listLoading =
    query.isPending || (query.isFetching && cards.length === 0 && !query.isError);

  // Parent row per unit/load; the nested issues[] open in the per-row expand below.
  const columns: Array<ParityColumn<ArrivingSoonCardType>> = [
    {
      key: "unit_number",
      label: "Unit",
      sortable: true,
      render: (card) => (
        <EntityLinkOrTombstone kind="unit" id={card.unit_id} name={card.unit_number} noun="Unit" className="font-semibold" />
      ),
    },
    {
      key: "load_display_id",
      label: "Load",
      sortable: true,
      render: (card) => (
        <EntityLinkOrTombstone kind="load" id={card.load_id} name={card.load_display_id} noun="Load" />
      ),
    },
    {
      key: "driver_name",
      label: "Driver",
      sortable: true,
      render: (card) => (
        <EntityLinkOrTombstone kind="driver" id={card.driver_id} name={card.driver_name} noun="Driver" />
      ),
    },
    { key: "hours_until_yard_arrival", label: "ETA", sortable: true, render: (card) => formatEta(card) },
    { key: "final_dest_name", label: "Destination", render: (card) => formatDest(card) },
    {
      key: "open_issue",
      label: "Open Issue",
      render: (card) => <span className="text-gray-800">{topIssueLabel(card)}</span>,
    },
    {
      key: "severity",
      label: "Severity",
      render: (card) => {
        const s = topSeverity(card);
        return <span className={`font-semibold ${severityTextClass(s)}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>;
      },
    },
    // PREP column (preview's "Prep bay →" WO link) is intentionally DEFERRED, not faked: arriving-soon
    // issues are pre-conversion (the view filters promoted_to_wo_id IS NULL), so there is no prep work
    // order to link to yet — the per-row "Convert to WO" action creates it. Wire once the card carries a
    // prep/promoted WO id from the backend.
  ];

  const rowActions = canConvert
    ? (card: ArrivingSoonCardType) => (
        <button
          type="button"
          className="rounded-sm border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => setSelectedCard(card)}
        >
          Convert to WO
        </button>
      )
    : undefined;

  // Nested issues for the parent row — these are pre-conversion (the view filters promoted_to_wo_id
  // IS NULL), so there is no work order to link to yet; the action is "Convert to WO" above.
  const renderExpanded = (card: ArrivingSoonCardType) => (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        Open issues ({card.total_open_issues})
      </div>
      {card.issues.length === 0 ? (
        <div className="text-xs text-gray-500">No issue detail available.</div>
      ) : (
        <ul className="space-y-1">
          {card.issues.map((issue) => (
            <li key={issue.issue_id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] ${severityChip(issue.severity)}`}>
                {issue.severity}
              </span>
              <span className="font-medium text-gray-800">{issue.issue_type}</span>
              <span className="text-gray-700">{issue.description}</span>
              <span className="ml-auto text-gray-400">{formatReported(issue.reported_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-3" data-testid="maint-arriving-soon">
      <ArrivingSoonFilterBar
        withinHours={withinHours}
        severityMin={severityMin}
        includeAlreadyArrived={includeAlreadyArrived}
        includeNonYard={includeNonYard}
        counts={counts}
        onWithinHoursChange={setWithinHours}
        onSeverityMinChange={setSeverityMin}
        onIncludeAlreadyArrivedChange={setIncludeAlreadyArrived}
        onIncludeNonYardChange={setIncludeNonYard}
      />

      {query.isError ? (
        <div
          className="rounded-sm border border-slate-300 bg-slate-50 p-3 text-xs text-slate-700"
          data-testid="maint-arriving-soon-error"
          role="alert"
        >
          Arriving Soon failed to load for this entity. Retry or check the maintenance arriving-soon API —
          this is not an empty queue.
        </div>
      ) : null}

      {recentConversions.length > 0 ? (
        <section className="rounded-sm border border-slate-200 bg-white p-3" data-testid="maint-arriving-soon-recent-conversions">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recently converted to work orders</div>
          <ul className="divide-y divide-slate-100">
            {recentConversions.map((conversion) => (
              <li key={conversion.issue_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  {conversion.issue_type || conversion.issue_category || conversion.issue_description || "In-transit issue"}
                </span>
                {conversion.unit_id ? (
                  <EntityLink kind="unit" id={conversion.unit_id} label={entityLabel(conversion.unit_number, conversion.unit_id, "Unit")} />
                ) : null}
                {conversion.load_id ? (
                  <EntityLink kind="load" id={conversion.load_id} label={entityLabel(conversion.load_display_id, conversion.load_id, "Load")} />
                ) : null}
                <EntityLink
                  kind="work_order"
                  id={conversion.work_order_id}
                  label={entityLabel(conversion.work_order_display_id, conversion.work_order_id, "Work order")}
                  className="font-semibold"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Desktop/tablet: full parity table. Mobile: stacked cards (same data, no horizontal scroll). */}
      <div className="hidden sm:block">
        <ParityTable<ArrivingSoonCardType>
          columns={columns}
          rows={cards}
          rowKey={(card) => `${card.load_id}:${card.unit_id}`}
          loading={listLoading}
          emptyText="No units arriving with open issues for this entity — arrivals with shop-prep issues populate this queue as loads approach the yard."
          storageKey="maint-arriving-soon"
          exportFilename="arriving-soon"
          rowActions={rowActions}
          renderExpanded={renderExpanded}
        />
      </div>
      <div className="space-y-2 sm:hidden">
        {listLoading ? <div className="text-xs text-gray-500">Loading...</div> : null}
        {!listLoading && !query.isError && cards.length < 1 ? (
          <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs text-gray-500" data-testid="maint-arriving-soon-empty-mobile">
            Nothing to prep for this entity right now.
          </div>
        ) : null}
        {!listLoading && !query.isError
          ? cards.map((card) => (
              <ArrivingSoonCard
                key={`${card.load_id}:${card.unit_id}`}
                card={card}
                canConvert={canConvert}
                onConvert={(c) => setSelectedCard(c)}
              />
            ))
          : null}
      </div>

      <ConvertIssueToWOModal
        open={Boolean(selectedCard)}
        operatingCompanyId={operatingCompanyId}
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        onDone={() => {
          setSelectedCard(null);
          void queryClient.invalidateQueries({ queryKey: ["maintenance", "arriving-soon", operatingCompanyId] });
        }}
      />
    </div>
  );
}
