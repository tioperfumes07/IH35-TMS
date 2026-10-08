import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { getInsuranceFleetCovered, type InsuranceCoverageType, type InsuranceFleetCoveredUnit } from "../../api/insurance";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatUsdCents } from "../../lib/money";

const POLICY_437539_TIV_CENTS = 104_054_000;
const formatMoney = (cents: number | null) => cents == null ? "—" : formatUsdCents(cents);
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const dataValue = (value: string | number | null | undefined) => value == null || value === "" ? <span className="font-semibold text-red-700">DATA GAP</span> : value;

function policyCell(row: InsuranceFleetCoveredUnit, type: InsuranceCoverageType) {
  if (row.vehicle_type === "trailer" && type === "auto_liability") return <span className="inline-flex rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-1.5 py-0.5 text-xs font-semibold text-[#4B5563]">N/A</span>;
  const coverage = row.coverages.find((item) => item.coverage_type === type);
  if (!coverage) return <span className="inline-flex rounded-sm border border-red-300 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-800">MISSING</span>;
  return <Link className="inline-flex rounded-sm border border-gray-400 bg-white px-1.5 py-0.5 text-xs font-semibold text-gray-800 underline" to={`/safety/insurance/policies/${coverage.policy_id}`}>{coverage.policy_number} · {coverage.expiry_date}</Link>;
}

export function FleetCoveredPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const query = useQuery({
    queryKey: ["insurance", "fleet-covered", companyId],
    enabled: Boolean(companyId),
    queryFn: () => getInsuranceFleetCovered(companyId).then((result) => result.units),
  });
  const rows = query.data ?? [];
  const coveredRows = useMemo(() => rows.filter((row) => row.coverages.length > 0), [rows]);
  const totals = useMemo(() => coveredRows.reduce((sum, row) => ({
    tiv: sum.tiv + (row.insured_value_cents ?? 0),
    premium: sum.premium + row.premium_per_month_cents,
  }), { tiv: 0, premium: 0 }), [coveredRows]);
  const tivDifference = totals.tiv - POLICY_437539_TIV_CENTS;
  const allocationMethods = useMemo(() => [...new Set(coveredRows.flatMap((row) => row.coverages.map((coverage) => coverage.allocation_method)))], [coveredRows]);

  const columns = useMemo<Array<ParityColumn<InsuranceFleetCoveredUnit>>>(() => [
    {
      key: "unit_number",
      label: "Unit #",
      sortable: true,
      alwaysVisible: true,
      render: (row) =>
        row.unit_id
          ? <EntityLink kind="unit" id={row.unit_id} label={row.unit_number} className="text-[var(--accent-green)] underline" />
          : row.equipment_id
            ? <EntityLink kind="trailer" id={row.equipment_id} label={row.unit_number} className="text-[var(--accent-green)] underline" />
            : row.unit_number,
    },
    { key: "vehicle_type", label: "Type", sortable: true, render: (row) => label(row.vehicle_type) },
    { key: "vehicle_class", label: "Class", sortable: true, render: (row) => label(row.vehicle_class) },
    { key: "year_make_model", label: "Year Make Model", sortable: true, sortValue: (row) => `${row.year ?? ""} ${row.make ?? ""} ${row.model ?? ""}`, render: (row) => dataValue([row.year, row.make, row.model].filter(Boolean).join(" ")) },
    { key: "vin", label: "VIN", sortable: true, render: (row) => dataValue(row.vin) },
    { key: "status", label: "Status", sortable: true, render: (row) => label(row.status) },
    { key: "auto_liability", label: "Auto Liability", sortable: true, sortValue: (row) => row.coverages.find((c) => c.coverage_type === "auto_liability")?.policy_number ?? "", render: (row) => policyCell(row, "auto_liability") },
    { key: "physical_damage", label: "Physical Damage", sortable: true, sortValue: (row) => row.coverages.find((c) => c.coverage_type === "physical_damage")?.policy_number ?? "", render: (row) => policyCell(row, "physical_damage") },
    { key: "cargo", label: "Cargo", sortable: true, sortValue: (row) => row.coverages.find((c) => c.coverage_type === "cargo")?.policy_number ?? "", render: (row) => policyCell(row, "cargo") },
    { key: "insured_value_cents", label: "Insured Value", sortable: true, render: (row) => row.coverages.length > 0 && row.insured_value_cents == null ? <span className="font-semibold text-red-700">DATA GAP</span> : formatMoney(row.insured_value_cents), exportValue: (row) => formatMoney(row.insured_value_cents) },
    { key: "premium_per_month_cents", label: "Premium/mo", sortable: true, render: (row) => <>{formatMoney(row.premium_per_month_cents)}<span className="block text-xs text-[#6B7280]">{[...new Set(row.coverages.map((c) => c.allocation_method))].map(label).join(", ") || "—"}</span></>, exportValue: (row) => formatMoney(row.premium_per_month_cents) },
    { key: "cost_per_thousand", label: "Cost/mo per $1,000", sortable: true, sortValue: (row) => row.insured_value_cents ? row.premium_per_month_cents / row.insured_value_cents : null, render: (row) => row.insured_value_cents ? formatMoney(Math.round(row.premium_per_month_cents * 100000 / row.insured_value_cents)) : "—" },
    { key: "deductible", label: "Deductible", render: () => "NOT STORED" },
    { key: "covered_since", label: "Covered Since", sortable: true, render: (row) => row.covered_since ?? "—" },
  ], []);

  if (!companyId) return <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">Select an operating company to view covered fleet.</div>;
  if (query.isError) return <ListErrorState status={0} message="Failed to load covered fleet." onRetry={() => void query.refetch()} />;

  return <div className="space-y-4">
    <header className="rounded-sm border border-gray-200 bg-white p-4">
      <h2 className="text-xs font-semibold text-[#0F1219]">Fleet Covered</h2>
      <p className="mt-1 text-xs text-[#4B5563]">One row per active tractor or trailer, with current policy and allocated monthly economics.</p>
      <p className="mt-2 text-xs font-medium text-[#1F2A44]">Premium allocation: {allocationMethods.length ? allocationMethods.map(label).join(", ") : "—"}</p>
    </header>
    {/* DSP-TBL (owner ruling 2026-09-05): footerCells replaces the raw 2-row footer. Row 1
        (Totals) migrates 1:1 -- one cell per column, keyed, follows reorder/hide automatically.
        Row 2 (the Policy 437539 TIV reconciliation line) was a second, unrelated <tr> the old
        raw-footer prop happened to allow bolting on; footerCells is one row by design (DSP-TBL's
        own spec: "footer rendered from the same ordered visible column list as the header"), so
        that comparison line moves to its own paragraph right below the table -- same information,
        same order on the page, no longer inside ParityTable's own footer machinery. */}
    <ParityTable rows={rows} columns={columns} rowKey={(row) => row.asset_id} loading={query.isPending} storageKey="insurance-fleet-covered" emptyText="No active fleet assets." enableColumnResize enableColumnReorder exportFilename="insurance-fleet-covered.csv" footerCells={{
      unit_number: <span className={coveredRows.length === 34 ? "text-[#0F1219]" : "text-red-700"}>Totals · {coveredRows.length} covered units {coveredRows.length === 34 ? "" : "· expected 34"}</span>,
      insured_value_cents: <span>{formatMoney(totals.tiv)}</span>,
      premium_per_month_cents: <span>{formatMoney(totals.premium)}</span>,
    }} />
    <p className="text-xs text-[#1F2A44]" data-testid="fleet-covered-policy-tiv-diff">
      Policy 437539 TIV {formatMoney(POLICY_437539_TIV_CENTS)} · Difference{" "}
      <span className={`font-semibold ${tivDifference === 0 ? "text-[#1F2A44]" : "text-red-700"}`}>{formatMoney(tivDifference)}</span>
    </p>
    <p className="text-xs text-[#6B7280]">Deductible is shown as — because the current policy schema does not store a deductible; no value is inferred.</p>
  </div>;
}
