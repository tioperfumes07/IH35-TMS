import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {Link, useLocation, useNavigate, useSearchParams} from "react-router-dom";
import { currentOriginHref, withReturnContext } from "../../../lib/returnContext";
import { legalMattersApi, type LegalMatterListRow } from "../../../api/legal-matters";
import { Button } from "../../../components/Button";
import { PageHeader } from "../../../components/layout/PageHeader";
import { BoardSection } from "../../../components/v3/BoardSection";
import { resolveBackHref } from "../../../lib/returnContext";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityMultiSelect } from "../../../components/EntityMultiSelect";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { LegalModuleTabs } from "../LegalModuleTabs";
import { MultiSelectDropdown } from "../../../components/forms/MultiSelectDropdown";
import { CollapsedListFilters, useStagedListFilters } from "../../../components/table";
import { formatDateUS } from "../../../lib/formatDate";
import { formatQuantityTable } from "../../../lib/money";
import { companyToday } from "../../../lib/businessDate";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../../lib/api-error-message";
import { properEnumOrFilterLabel } from "../../../lib/properDisplayText";
import { statusOptions } from "../../../lib/statusListParams";

const STATUS_FILTER_OPTIONS = statusOptions({
  open: "Open",
  investigating: "Investigating",
  litigation: "Litigation",
  settled: "Settled",
  dismissed: "Dismissed",
  judgment: "Judgment",
  closed: "Closed",
});

const MATTER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function matterDetailPath(id: string): string | null {
  const normalized = id.trim();
  return MATTER_ID_RE.test(normalized) ? `/legal/matters/${normalized}` : null;
}

const ISO_DATE_DIGITS = /^(\d{4})-(\d{2})-(\d{2})/;

// LEGAL-MATTERS-SOL-COUNTDOWN-TZ-OFFBYONE: statute_of_limitations_at is a SQL `date` column; the
// default pg driver parses it to a JS Date at the BACKEND's local midnight, which serializes as a
// full UTC ISO instant (e.g. "2026-08-31T00:00:00.000Z" on a UTC-TZ backend). The previous
// implementation built `new Date(dateStr)` then called `.setHours(0,0,0,0)`, which re-derives the
// calendar day from that instant in the VIEWER's browser timezone — for any negative-UTC-offset
// viewer (all of the continental US, including this company's own Central Time), that shifts the
// target day back by one, understating urgency on a statute-of-limitations deadline. Fixed by
// parsing the calendar-date digits directly (never constructing a Date from the string, same rule
// formatDate.ts documents) and diffing against "today" in the company's own timezone
// (businessDate.ts's companyToday()) via UTC-anchored calendar math (same pattern as addDaysIso).
// Exported for the LEGAL-MATTERS-SOL-COUNTDOWN-TZ-OFFBYONE regression test.
export function daysUntil(dateStr: unknown) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const m = ISO_DATE_DIGITS.exec(dateStr);
  if (!m) return null;
  const [, y, mo, d] = m;
  const targetUTC = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  const [ty, tmo, td] = companyToday().split("-").map(Number);
  const todayUTC = Date.UTC(ty, tmo - 1, td);
  return Math.round((targetUTC - todayUTC) / (24 * 3600 * 1000));
}

/**
 * LEAD 443.334 — Legal › Lawsuits is this same board locked to type "lawsuit" (legal.matters is the canonical lawsuit
 * record: reserve JE, driver / unit / load / claim links). `fixedType` pins the type filter and retitles the board.
 */
export type LegalMattersListPageProps = { fixedType?: "lawsuit" };

export function LegalMattersListPage({ fixedType }: LegalMattersListPageProps = {}) {
  const { pathname, search: locSearch } = useLocation();
  const originHref = currentOriginHref(pathname, locSearch);
  const legalHref = (target: string) => withReturnContext(target, originHref);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  // ROUND 8.20 board21 — Home KPI/pipeline drills attach ?ret=/legal; Back must honor it.
  const mattersBackHref = resolveBackHref({
    searchParams,
    pathname,
    fallback: "/legal",
  });
  const [status, setStatus] = useState<string[]>([]);
  const [severity, setSeverity] = useState<string[]>([]);
  const [type, setType] = useState<string[]>(fixedType ? [fixedType] : []);
  const relatedDriverId = searchParams.get("related_driver_id")?.trim() || "";
  const equipmentId = searchParams.get("equipment_id")?.trim() || "";
  const insuranceClaimId = searchParams.get("insurance_claim_id")?.trim() || "";
  const insuranceLawsuitId = searchParams.get("insurance_lawsuit_id")?.trim() || "";
  // ROUND 297 audit (forward): the vendor / customer profile drills here with ?vendor_id= / ?customer_id=; the list
  // used to drop it and show every matter of the company.
  const partyVendorId = searchParams.get("vendor_id")?.trim() || "";
  const partyCustomerId = searchParams.get("customer_id")?.trim() || "";
  function clearPartyScope() {
    const p = new URLSearchParams(searchParams);
    p.delete("vendor_id");
    p.delete("customer_id");
    setSearchParams(p, { replace: true });
  }
  // LST-F5181 — visible EntityPicker (URL-only unit_id is not reverse chrome).
  // CLS-ADJACENT-ENTITY-FILTER-SILENT-APPLY — unit FK stages with sibling filters; URL mutates only on Apply.
  const deepLinkUnitId = searchParams.get("unit_id")?.trim() || "";
  const [unitId, setUnitId] = useState(deepLinkUnitId);
  useEffect(() => {
    setUnitId(deepLinkUnitId);
  }, [deepLinkUnitId]);
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(0);
  const resetPage = () => setPage(0);
  function commitUnitFilter(next: string) {
    setUnitId(next);
    const p = new URLSearchParams(searchParams);
    if (next) p.set("unit_id", next);
    else p.delete("unit_id");
    setSearchParams(p, { replace: true });
  }
  const staged = useStagedListFilters({
    applied: { status, severity, type, unitId },
    empty: { status: [] as string[], severity: [] as string[], type: fixedType ? [fixedType] : ([] as string[]), unitId: "" },
    onApply: (next) => {
      setStatus(next.status);
      setSeverity(next.severity);
      setType(fixedType ? [fixedType] : next.type);
      commitUnitFilter(next.unitId);
      resetPage();
    },
  });
  // CLS-SILENT-CAP — this list was capped at 500 server-side with no offset and no total, so matter
  // 501 vanished and the screen had no way to say so. Page size is explicit and the server's own
  // `total` drives the range label, so a truncated view is now visible instead of silent.

  const listQuery = useQuery({
    queryKey: [
      "legal",
      "matters",
      companyId,
      status.join(","),
      severity.join(","),
      type.join(","),
      page,
      relatedDriverId,
      unitId,
      equipmentId,
      insuranceClaimId,
      insuranceLawsuitId,
      partyVendorId,
      partyCustomerId,
    ],
    queryFn: async () => {
      // Codex batch67 — send comma-union to the server BEFORE COUNT/LIMIT (never filter a page locally).
      const result = await legalMattersApi.list(companyId, {
        status: status.length ? status.join(",") : undefined,
        severity: severity.length ? severity.join(",") : undefined,
        type: type.length ? type.join(",") : undefined,
        related_driver_id: relatedDriverId || undefined,
        unit_id: unitId || undefined,
        equipment_id: equipmentId || undefined,
        insurance_claim_id: insuranceClaimId || undefined,
        insurance_lawsuit_id: insuranceLawsuitId || undefined,
        vendor_id: partyVendorId || undefined,
        customer_id: partyCustomerId || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      return result;
    },
    enabled: Boolean(companyId),
  });

  const rows = listQuery.data?.matters ?? [];
  // Fall back to the row count ONLY when the server omits total (older deploy) — never invent a
  // bigger number than the server reported.
  const total = listQuery.data?.total ?? rows.length;
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE + rows.length, total);
  const hasPrev = page > 0;
  const hasNext = rangeEnd < total;

  const columns = useMemo<ParityColumn<LegalMatterListRow>[]>(
    () => [
      {
        key: "matter_number",
        label: "Number",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="matter"
            id={String(row.id ?? "")}
            label={entityLabel(row.matter_number, row.id, "Legal matter")}
            className="font-mono text-xs"
          />
        ),
      },
      { key: "type", label: "Type", sortable: true, render: (row) => properEnumOrFilterLabel(row.type) },
      { key: "status", label: "Status", sortable: true, render: (row) => String(row.status ?? "") },
      { key: "severity", label: "Severity", sortable: true, render: (row) => String(row.severity ?? "") },
      {
        key: "statute_of_limitations_at",
        label: "SOL / hearing",
        sortable: true,
        render: (row) => {
          // LEGAL-HEARING-LIST-COLUMN-STILL-READS-SOL-ONLY-AFTER-FIX: this column's own label
          // promises BOTH SOL and hearing dates, but only ever read statute_of_limitations_at --
          // next_hearing_date (now backend-derived from legal.matter_deadlines when the scalar
          // column is null, see matters.service.ts) never reached this column at all. SOL takes
          // display priority when both are set (matches the column's existing single-value shape
          // and the more legally urgent of the two).
          const displayDate = row.statute_of_limitations_at ?? row.next_hearing_date;
          const sol = daysUntil(displayDate);
          const urgent = sol !== null && sol >= 0 && sol < 14;
          return urgent ? (
            <span className="rounded-sm bg-[#F7F8FA] px-2 py-0.5 text-xs text-[#1F2A44]">SOL {sol}d</span>
          ) : (
            <span className="text-xs text-gray-600">{displayDate ? formatDateUS(displayDate) : "—"}</span>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <PageHeader backHref={mattersBackHref}
        breadcrumb={fixedType ? ["Legal", "Lawsuits"] : ["Legal", "Matters"]}
        title={fixedType ? "Lawsuits" : "Legal matters"}
        subtitle={fixedType ? "Lawsuits where the company is a party — reserve, driver, unit, load and claim links" : "Lawsuits, claims, and regulatory matters"}
        actions={
          <Link to={legalHref("/legal/matters/new")}>
            <Button>+ Create Matter</Button>
          </Link>
        }
      />
      <LegalModuleTabs />
      {!companyId ? (
        <BoardSection title="Legal matters" testId="legal-matters-need-company">
          <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company.</p>
        </BoardSection>
      ) : listQuery.isError ? (
        <ListErrorBanner
          message={userFacingApiError(listQuery.error, "Could not load legal matters. No empty result was assumed.")}
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <>
        {/* CLS-SILENT-CAP — honest range + pager. The server's own `total` is authoritative; the
            label states "showing N of M" so a capped view can never read as "that is all there is". */}
        <div className="mb-2 flex items-center justify-between text-xs text-[#4B5563]">
          <span data-testid="legal-matters-range">
            {total === 0
              ? "No matters"
              : `Showing ${formatQuantityTable(rangeStart, 0)}\u2013${formatQuantityTable(rangeEnd, 0)} of ${formatQuantityTable(total, 0)}`}
            {partyVendorId || partyCustomerId ? (
              <button type="button" data-testid="legal-matters-party-scope" onClick={clearPartyScope} className="ml-2 rounded-sm border border-gray-300 px-2 py-0.5">
                {partyVendorId ? "This vendor only" : "This customer only"} ×
              </button>
            ) : null}
          </span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={!hasPrev || listQuery.isFetching}
              className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext || listQuery.isFetching}
              className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </span>
        </div>
        <ParityTable appearance="board"
          title={fixedType ? "Lawsuits" : "Legal matters"}
          rows={rows}
          columns={columns}
          rowKey={(row) => String(row.id ?? "")}
          onRowClick={(row) => {
            const path = matterDetailPath(String(row.id ?? ""));
            if (path) navigate(path);
          }}
          // Settled-only empty (LIST-EMPTY-1 invariant): see LegalPoliciesPage for the same pattern.
          loading={listQuery.isPending || (listQuery.isFetching && rows.length === 0)}
          storageKey={fixedType ? "legal-lawsuits" : "legal-matters"}
          emptyText={fixedType ? "No lawsuits match filters." : "No matters match filters."}
          // LEGAL-MATTERS-DOUBLE-PAGER-CONTRADICTS-TOTAL (same class as NAMES-MASTER-DOUBLE-PAGER-
          // CONTRADICTS-TOTAL): `rows` is one server-paginated page (limit/offset, PAGE_SIZE=100) out
          // of a real `total` that can span many pages; the external "Showing X-Y of Z / Previous/Next"
          // pager above already reads that real total correctly. Without hidePager, ParityTable's own
          // built-in pager would compute its "of N"/"Page X of Y" from rows.length alone (always
          // PAGE_SIZE, always "Page 1 of 1") and contradict the correct external pager the moment
          // matters exceed one page -- currently masked because there are only 7 real rows (< 100).
          pageSize={PAGE_SIZE}
          hidePager
          filterBar={
            <CollapsedListFilters
              activeFilterCount={(status.length ? 1 : 0) + (severity.length ? 1 : 0) + (type.length && !fixedType ? 1 : 0) + (unitId ? 1 : 0)}
              onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
              testIdPrefix="legal-matters"
              dataAttributes={{ "data-legal-matters-filter-toolbar": "collapsed" }}
            >
              <div className="flex flex-wrap gap-2" data-testid="legal-matters-entity-filters">
                <div className="min-w-[14rem]">
                  <EntityMultiSelect
                    kind="unit"
                    operatingCompanyId={companyId}
                    value={staged.draft.unitId || null}
                    onChange={(next) => staged.setDraft({ ...staged.draft, unitId: next ?? "" })}
                    placeholder="All units"
                    ariaLabel="Filter by unit"
                    dataTestId="legal-matters-filter-unit"
                  />
                </div>
                <MultiSelectDropdown
                  label="Status"
                  options={STATUS_FILTER_OPTIONS}
                  selected={staged.draft.status}
                  onChange={(next) => staged.setDraft({ ...staged.draft, status: next })}
                  allLabel="All statuses"
                  data-testid="legal-matters-status-filter"
                />
                <MultiSelectDropdown
                  label="Severity"
                  options={["critical", "high", "medium", "low"].map((s) => ({ value: s, label: s }))}
                  selected={staged.draft.severity}
                  onChange={(next) => staged.setDraft({ ...staged.draft, severity: next })}
                  allLabel="All severity"
                  data-testid="legal-matters-severity-filter"
                />
                {fixedType ? null : (
                <MultiSelectDropdown
                  label="Type"
                  options={["lawsuit", "claim", "demand_letter", "settlement", "regulatory", "other"].map((s) => ({
                    value: s,
                    label: properEnumOrFilterLabel(s),
                  }))}
                  selected={staged.draft.type}
                  onChange={(next) => staged.setDraft({ ...staged.draft, type: next })}
                  allLabel="All types"
                  data-testid="legal-matters-type-filter"
                />
                )}
              </div>
            </CollapsedListFilters>
          }
        />
        </>
      )}
    </div>
  );
}
