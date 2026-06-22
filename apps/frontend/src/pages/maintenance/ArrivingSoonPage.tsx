import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/useAuth";
import { getArrivingSoon, logArrivingSoonView, type ArrivingSoonCard as ArrivingSoonCardType } from "../../api/maintenance";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ArrivingSoonFilterBar } from "./components/ArrivingSoonFilterBar";
import { ConvertIssueToWOModal } from "./components/ConvertIssueToWOModal";

type Props = {
  operatingCompanyId: string;
};

const LINK = "text-slate-700 hover:underline";

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
  const counts = query.data?.counts ?? { total: 0, severe: 0, warning: 0, info: 0, already_arrived: 0 };

  // Parent row per unit/load; the nested issues[] open in the per-row expand below.
  const columns: Array<ParityColumn<ArrivingSoonCardType>> = [
    {
      key: "unit_number",
      label: "Unit",
      sortable: true,
      render: (card) => (
        <Link to={`/fleet/units/${card.unit_id}`} className={`${LINK} font-semibold`}>
          {card.unit_number}
        </Link>
      ),
    },
    {
      key: "load_display_id",
      label: "Load",
      sortable: true,
      render: (card) => (
        <Link to={`/dispatch/loads/${card.load_id}`} className={LINK}>
          {card.load_display_id}
        </Link>
      ),
    },
    {
      key: "driver_name",
      label: "Driver",
      sortable: true,
      render: (card) =>
        card.driver_id ? (
          <Link to={`/drivers/${card.driver_id}`} className={LINK}>
            {card.driver_name ?? card.driver_id.slice(0, 8)}
          </Link>
        ) : (
          <span className="text-gray-400">Unassigned</span>
        ),
    },
    { key: "final_dest_name", label: "Destination", render: (card) => formatDest(card) },
    { key: "hours_until_yard_arrival", label: "ETA", sortable: true, render: (card) => formatEta(card) },
    {
      key: "total_open_issues",
      label: "Issues",
      sortable: true,
      render: (card) => {
        const top = card.severe_count > 0 ? "severe" : card.warning_count > 0 ? "warning" : "info";
        const label =
          card.severe_count > 0
            ? `${card.severe_count} severe`
            : card.warning_count > 0
              ? `${card.warning_count} warning`
              : `${card.total_open_issues} info`;
        return (
          <span className={`rounded border px-2 py-0.5 text-[11px] ${severityChip(top)}`}>
            ● {label}
          </span>
        );
      },
    },
  ];

  const rowActions = canConvert
    ? (card: ArrivingSoonCardType) => (
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
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
              <span className={`rounded border px-1.5 py-0.5 text-[10px] ${severityChip(issue.severity)}`}>
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
    <div className="space-y-3">
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

      <ParityTable<ArrivingSoonCardType>
        columns={columns}
        rows={cards}
        rowKey={(card) => `${card.load_id}:${card.unit_id}`}
        loading={query.isLoading}
        emptyText="No units arriving with open issues. The shop has nothing to prep right now."
        storageKey="maint-arriving-soon"
        exportFilename="arriving-soon"
        rowActions={rowActions}
        renderExpanded={renderExpanded}
      />

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
