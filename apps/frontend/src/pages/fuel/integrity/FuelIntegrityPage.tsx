/**
 * E-21/E-22 Fuel Integrity tab — per-transaction GPS verdict, fraud classification, and derived
 * pump time/state, with the "why" behind every one. Both backing endpoints are computed-on-read
 * and write nothing (apps/backend/src/fuel/fuel-integrity-verdicts.service.ts,
 * fuel-gps-verdict.service.ts, fuel-time-derivation.service.ts) — this screen is the first UI for
 * engines E-19..E-22, which previously had live endpoints and no screen.
 */
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getFuelIntegrityVerdicts,
  getFuelTimeDerivations,
  humanizeSummaryKey,
  fraudClassificationLabel,
  gpsVerdictLabel,
  notPurchaseReasonLabel,
  type CardRowVerdict,
  type RelayFillGpsVerdict,
  type FuelTimeDerivation,
  type FraudClassification,
  type GpsVerdict,
} from "../../../api/fuel-integrity";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { StatusBadge } from "../../../components/layout/StatusBadge";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { MoneyListToolbar } from "../../../components/table/MoneyListToolbar";
import { FuelBoardSection } from "../FuelBoardSection";
import { formatDateTimeUS, formatDateUS } from "../../../lib/formatDate";
import { formatUsdCentsTable, formatNumberTable } from "../../../lib/money";

const LINK = "text-[#1F2A44] hover:underline";

function fraudBadgeVariant(value: FraudClassification): "crit" | "warn" | "positive" | "neutral" {
  if (value === "finding") return "crit";
  if (value === "suspicion") return "warn";
  if (value === "none") return "positive";
  return "neutral";
}

function verdictBadgeVariant(value: GpsVerdict): "crit" | "positive" | "neutral" {
  if (value === "match") return "positive";
  if (value === "held") return "crit";
  return "neutral";
}

export function FuelIntegrityPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");

  const cardSectionRef = useRef<HTMLDivElement | null>(null);
  const relaySectionRef = useRef<HTMLDivElement | null>(null);
  const derivedSectionRef = useRef<HTMLDivElement | null>(null);
  const scrollTo = (ref: typeof cardSectionRef) => () => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const verdictsQuery = useQuery({
    queryKey: ["fuel", "integrity", "verdicts", companyId],
    queryFn: () => getFuelIntegrityVerdicts(companyId),
    enabled: Boolean(companyId),
  });

  const derivationsQuery = useQuery({
    queryKey: ["fuel", "integrity", "time-derivations", companyId],
    queryFn: () => getFuelTimeDerivations(companyId),
    enabled: Boolean(companyId),
  });

  const cardCols: ParityColumn<CardRowVerdict>[] = [
    {
      key: "transaction_at",
      label: "Date", sortable: true,
      render: (row) => formatDateTimeUS(row.transaction_at),
    },
    { key: "unit_number", label: "Unit", sortable: true, render: (row) => row.unit_number ?? "—" },
    { key: "fuel_type", label: "Fuel type", sortable: true, render: (row) => row.fuel_type ?? "—" },
    {
      key: "gallons",
      label: "Gallons",
      render: (row) => <span className="tabular-nums">{formatNumberTable(row.gallons, 2)}</span>,
    },
    {
      key: "total_cost_cents",
      label: "Cost",
      render: (row) => <span className="tabular-nums">{formatUsdCentsTable(row.total_cost_cents)}</span>,
    },
    {
      key: "is_purchase",
      label: "Purchase?",
      render: (row) =>
        row.is_purchase ? (
          <span className="text-[#1F2A44]">Yes</span>
        ) : (
          <span className="text-[#4B5563]" title={row.not_purchase_reason ?? undefined}>
            No — {notPurchaseReasonLabel(row.not_purchase_reason)}
          </span>
        ),
    },
    {
      key: "fraud_classification",
      label: "Fraud classification",
      render: (row) => (
        <StatusBadge variant={fraudBadgeVariant(row.fraud_classification)}>
          {fraudClassificationLabel(row.fraud_classification)}
        </StatusBadge>
      ),
    },
    {
      key: "suspicion_count",
      label: "Suspicion count",
      render: (row) => <span className="tabular-nums">{row.suspicion_count}</span>,
    },
    {
      key: "rules_matched",
      label: "Rules matched", sortable: true,
      render: (row) => (row.rules_matched.length === 0 ? "—" : row.rules_matched.join(", ")),
    },
    {
      key: "why",
      label: "Why", sortable: true,
      allowWrap: true,
      render: (row) => row.why,
    },
  ];

  const relayCols: ParityColumn<RelayFillGpsVerdict>[] = [
    {
      key: "pump_time",
      label: "Pump time", sortable: true,
      render: (row) => formatDateTimeUS(row.pump_time),
    },
    { key: "station", label: "Station", sortable: true, render: (row) => row.station || "—" },
    {
      key: "gallons",
      label: "Gallons",
      render: (row) => <span className="tabular-nums">{formatNumberTable(row.gallons, 2)}</span>,
    },
    {
      key: "card_unit_id",
      label: "Card truck",
      render: (row) =>
        row.card_unit_id ? (
          <EntityLinkOrTombstone kind="unit" id={row.card_unit_id} name={row.card_unit_number} noun="Unit" className={LINK} />
        ) : (
          <span className="text-[#4B5563]">{row.card_unit_number ?? "—"}</span>
        ),
    },
    {
      key: "candidates",
      label: "GPS trucks at pump",
      allowWrap: true,
      render: (row) =>
        row.candidates.length === 0 ? (
          "—"
        ) : (
          <span className="space-x-1">
            {row.candidates.map((c, i) => (
              <span key={`${c.unit_id}-${c.at}`}>
                <EntityLinkOrTombstone kind="unit" id={c.unit_id} name={c.unit_number} noun="Unit" className={LINK} />
                <span className="text-[#6B7280]">@{Math.round(c.metres)}m</span>
                {i < row.candidates.length - 1 ? <span className="text-[#6B7280]">, </span> : null}
              </span>
            ))}
          </span>
        ),
    },
    {
      key: "verdict",
      label: "Verdict",
      render: (row) => (
        <StatusBadge variant={verdictBadgeVariant(row.verdict)}>{gpsVerdictLabel(row.verdict)}</StatusBadge>
      ),
    },
    { key: "why", label: "Why", sortable: true, allowWrap: true, render: (row) => row.why },
  ];

  const derivedCols: ParityColumn<FuelTimeDerivation>[] = [
    { key: "local_date", label: "Date", sortable: true, render: (row) => formatDateUS(row.local_date) },
    { key: "unit_number", label: "Unit", sortable: true, render: (row) => row.unit_number ?? "—" },
    { key: "vendor_name", label: "Vendor", sortable: true, render: (row) => row.vendor_name ?? "—" },
    {
      key: "transaction_at_derived",
      label: "Derived time", sortable: true,
      render: (row) => (row.transaction_at_derived ? formatDateTimeUS(row.transaction_at_derived) : "—"),
    },
    { key: "state_derived", label: "State", sortable: true, render: (row) => row.state_derived ?? "—" },
    { key: "confidence", label: "Confidence", sortable: true, render: (row) => row.confidence ?? "—" },
    { key: "reason", label: "Reason", sortable: true, allowWrap: true, render: (row) => row.reason },
  ];

  const verdicts = verdictsQuery.data;
  const derivations = derivationsQuery.data;
  const summaryEntries = verdicts ? Object.entries(verdicts.summary) : [];
  const q = search.trim().toLowerCase();
  const cardRows = (verdicts?.card_rows ?? []).filter((row) => {
    if (!q) return true;
    return [row.unit_number, row.fuel_type, row.fraud_classification, row.why, ...(row.rules_matched ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
  const relayRows = (verdicts?.relay_fills ?? []).filter((row) => {
    if (!q) return true;
    return [row.station, row.card_unit_number, row.verdict, row.why]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
  const derivedRows = (derivations?.rows ?? []).filter((row) => {
    if (!q) return true;
    return [row.unit_number, row.vendor_name, row.state_derived, row.reason, row.confidence]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  if (!companyId) {
    return (
      <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-700" data-testid="fuel-integrity-page">
        Select an operating company to view fuel integrity.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="fuel-integrity-page">
      {verdictsQuery.isError ? (
        <ListErrorBanner onRetry={() => void verdictsQuery.refetch()} message="Fuel integrity verdicts could not be loaded." />
      ) : (
        /* ROUND 443.250 Fuel Integrity V3 — same getFuelIntegrityVerdicts summary keys; DrillKpiCard → V3KpiTile. */
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}
          data-testid="fuel-integrity-kpi-strip"
          data-fuel-integrity-v3-kpis="1"
        >
          {verdictsQuery.isPending
            ? null
            : summaryEntries.map(([key, value]) => (
                <V3KpiTile
                  key={key}
                  label={humanizeSummaryKey(key)}
                  value={String(value)}
                  onClick={scrollTo(key.startsWith("relay_") ? relaySectionRef : cardSectionRef)}
                  testId={`fuel-integrity-kpi-${key}`}
                />
              ))}
        </div>
      )}

      <MoneyListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search unit, fuel type…"
        onClearAll={() => setSearch("")}
        activeFilterCount={0}
        testIdPrefix="fuel-integrity"
      >
        <span />
      </MoneyListToolbar>

      <div ref={cardSectionRef}>
        <FuelBoardSection title="Card purchases" testId="fuel-integrity-card-v3-panel">
          {verdictsQuery.isError ? (
            <ListErrorBanner onRetry={() => void verdictsQuery.refetch()} />
          ) : (
            <ParityTable
              rows={cardRows}
              columns={cardCols}
              loading={verdictsQuery.isPending}
              storageKey="fuel-integrity-card-purchases"
              emptyText="No card purchases in this window"
              rowKey={(row) => row.fuel_transaction_id}
              suppressToolbarSearch
            />
          )}
        </FuelBoardSection>
      </div>

      <div ref={relaySectionRef}>
        <FuelBoardSection title="Relay fills — was the truck at the pump?" testId="fuel-integrity-relay-v3-panel">
          {verdictsQuery.isError ? (
            <ListErrorBanner onRetry={() => void verdictsQuery.refetch()} />
          ) : (
            <ParityTable
              rows={relayRows}
              columns={relayCols}
              loading={verdictsQuery.isPending}
              storageKey="fuel-integrity-relay-fills"
              emptyText="No Relay fills in this window"
              rowKey={(row) => row.relay_fuel_transaction_id}
              suppressToolbarSearch
            />
          )}
        </FuelBoardSection>
      </div>

      <div ref={derivedSectionRef}>
        <FuelBoardSection
          title="Derived pump time & state"
          subtitle="Computed on read from GPS fuel-stop geofences — writes nothing"
          testId="fuel-integrity-derived-v3-panel"
        >
          {derivationsQuery.isError ? (
            <ListErrorBanner onRetry={() => void derivationsQuery.refetch()} message="Derived pump time/state could not be loaded." />
          ) : (
            <>
              <p className="mb-2 text-xs text-[#4B5563]" data-testid="fuel-integrity-derivation-summary">
                {derivations
                  ? `Of ${derivations.summary.date_only_rows} date-only row(s): ${derivations.summary.with_time} with a derived time, ` +
                    `${derivations.summary.with_state} with a derived state, ${derivations.summary.none} with neither. ` +
                    `Stop source: ${derivations.stop_source}.`
                  : derivationsQuery.isPending
                    ? "Loading…"
                    : "Summary unavailable."}
              </p>
              <ParityTable
                rows={derivedRows}
                columns={derivedCols}
                loading={derivationsQuery.isPending}
                storageKey="fuel-integrity-derived-time-state"
                emptyText="No date-only rows needed pump-time/state derivation in this window"
                rowKey={(row) => row.fuel_transaction_id}
                suppressToolbarSearch
              />
            </>
          )}
        </FuelBoardSection>
      </div>
    </div>
  );
}
