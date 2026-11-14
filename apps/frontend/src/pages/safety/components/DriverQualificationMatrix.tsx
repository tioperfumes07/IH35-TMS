import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { listAllDrivers } from "../../../api/mdata";
import { getSafetyKpis } from "../../../api/safety";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { V3Panel } from "../../../components/v3/V3Panel";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatCalendarDateUS } from "../../../lib/formatDate";
import { formatPersonName } from "../../../lib/formatPersonName";
import { currentOriginHref, withReturnContext } from "../../../lib/returnContext";
import type { Driver } from "../../../types/api";

type Cohort = "all" | "medical" | "contact" | "cdl";
const COHORTS: readonly Cohort[] = ["all", "medical", "contact", "cdl"];
const parseCohort = (raw: string | null): Cohort =>
  COHORTS.includes(raw as Cohort) ? (raw as Cohort) : "all";
const hasContact = (driver: Driver) =>
  Boolean(
    driver.emergency_contact_name?.trim() &&
      (driver.emergency_contact_phone_primary?.trim() || driver.emergency_contact_phone_alternate?.trim()),
  );
const inCohort = (driver: Driver, cohort: Cohort) =>
  cohort === "medical"
    ? Boolean(driver.dot_medical_expires_at)
    : cohort === "cdl"
      ? Boolean(driver.cdl_expires_at)
      : cohort === "contact"
        ? hasContact(driver)
        : true;
const countValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Read-only qualification inventory, not a dispatch-eligibility engine. */
export function DriverQualificationMatrix({ companyId }: { companyId: string }) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // ROUND 8.20 board24 — fine/alert register links carry `ret` so Back restores Driver Files (+ cohort).
  const originHref = currentOriginHref(location.pathname, location.search);
  const safetyHref = (target: string) => withReturnContext(target, originHref);
  // ROUND 8.20 board24 — cohort is URL SoT so profile Back restores the filtered matrix.
  const cohort = parseCohort(searchParams.get("cohort"));
  const setCohort = (next: Cohort) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "all") p.delete("cohort");
        else p.set("cohort", next);
        return p;
      },
      { replace: true },
    );
  };
  const summaryRaw = searchParams.get("summary");
  const summarySource = summaryRaw === "fines" || summaryRaw === "alerts" ? summaryRaw : null;
  const setSummarySource = (next: "fines" | "alerts" | null) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (!next) p.delete("summary");
        else p.set("summary", next);
        return p;
      },
      { replace: true },
    );
  };
  const roster = useQuery({
    queryKey: ["safety-cards", "drivers", companyId, ""],
    queryFn: () => listAllDrivers({ operating_company_id: companyId, status: "Active" }),
    enabled: Boolean(companyId),
  });
  const kpis = useQuery({
    queryKey: ["safety", "kpis", companyId],
    queryFn: () => getSafetyKpis(companyId),
    enabled: Boolean(companyId),
  });
  const columns = useMemo<ParityColumn<Driver>[]>(() => {
    // SF2 — board status dots (green on file / amber missing / slate unknown). Never invent dates.
    const statusDot = (tone: "ok" | "missing" | "unknown") => (
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          display: "inline-block",
          background: tone === "ok" ? "#15803D" : tone === "missing" ? "#B45309" : "#94A3B8",
          flexShrink: 0,
        }}
      />
    );
    const statusCell = (row: Driver, label: string, tone: "ok" | "missing" | "unknown") => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", textAlign: "left" }}>
        {statusDot(tone)}
        <EntityLink kind="driver" id={row.id} label={label} />
      </span>
    );
    const record = (row: Driver, label: string) => <EntityLink kind="driver" id={row.id} label={label} />;
    // N24 / ROW 167 — expiry is a calendar day; midnight-UTC timestamps must not shift Central.
    const date = (row: Driver, value: string | null) =>
      statusCell(row, value ? formatCalendarDateUS(value) || "Add date" : "Add date", value ? "ok" : "missing");
    return [
      {
        key: "first_name",
        label: "Driver",
        className: "text-left",
        render: (row) => record(row, formatPersonName(`${row.first_name} ${row.last_name}`)),
        sortValue: (row) => `${row.first_name} ${row.last_name}`,
        exportValue: (row) => formatPersonName(`${row.first_name} ${row.last_name}`),
      },
      {
        key: "cdl_expires_at",
        label: "CDL",
        className: "text-left",
        sortable: true,
        sortValue: (row) => row.cdl_expires_at ?? "",
        render: (row) => date(row, row.cdl_expires_at),
      },
      {
        key: "dot_medical_expires_at",
        label: "DOT medical",
        className: "text-left",
        sortable: true,
        sortValue: (row) => row.dot_medical_expires_at ?? "",
        render: (row) => date(row, row.dot_medical_expires_at),
      },
      {
        key: "visa_expires_at",
        label: "B-1 visa",
        className: "text-left",
        sortable: true,
        sortValue: (row) => row.visa_expires_at ?? "",
        render: (row) =>
          date(
            row,
            row.has_b1_visa || /^b[- ]?1$/i.test(row.visa_type ?? "")
              ? row.visa_expires_at || row.b1_visa_expires_date
              : null,
          ),
      },
      {
        key: "emergency_contact_name",
        label: "Emergency contact",
        className: "text-left",
        sortable: true,
        sortValue: (row) => (hasContact(row) ? "On file" : "Add contact"),
        render: (row) =>
          statusCell(row, hasContact(row) ? "On file" : "Add contact", hasContact(row) ? "ok" : "missing"),
      },
      {
        key: "samsara_driver_id",
        label: "Samsara",
        className: "text-left",
        sortable: true,
        sortValue: (row) => (row.samsara_driver_id ? "Linked" : "Link driver"),
        render: (row) =>
          statusCell(row, row.samsara_driver_id ? "Linked" : "Link driver", row.samsara_driver_id ? "ok" : "missing"),
      },
      {
        key: "dq_file",
        label: "DQ file",
        className: "text-left",
        render: (row) => statusCell(row, "Review records", "unknown"),
        sortable: false,
        exportValue: () => "Status not supplied by roster",
      },
    ];
  }, []);
  if (!companyId) return <p className="text-xs text-slate-600">Select a company to view driver qualification files.</p>;
  if (roster.isError)
    return (
      <ListErrorState
        title="Couldn't load driver qualifications"
        status={0}
        message={roster.error instanceof Error ? roster.error.message : undefined}
        onRetry={() => void roster.refetch()}
      />
    );
  const drivers = roster.data?.drivers;
  const ratio = (key: Cohort) =>
    drivers ? `${drivers.filter((driver) => inCohort(driver, key)).length} of ${drivers.length}` : null;
  // ROUND 8.20 board24 — KPI tiles use shareable href (URL SoT cohort/summary), not onClick-only.
  const cohortHref = (next: Cohort) => {
    const p = new URLSearchParams(searchParams);
    p.delete("summary");
    if (next === "all") p.delete("cohort");
    else p.set("cohort", next);
    const qs = p.toString();
    return `${location.pathname}${qs ? `?${qs}` : ""}`;
  };
  const summaryHref = (next: "fines" | "alerts") => {
    const p = new URLSearchParams(searchParams);
    p.set("summary", next);
    return `${location.pathname}?${p.toString()}`;
  };
  return (
    <section className="min-w-0 space-y-3" aria-label="Driver qualification files">
      <div className="grid min-w-0 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <V3KpiTile
          label="Active drivers"
          value={drivers ? String(drivers.length) : "—"}
          href={cohortHref("all")}
          testId="dq-kpi-active-drivers"
        />
        <V3KpiTile
          label="DOT medical on file"
          value={ratio("medical") ?? "—"}
          title="Recorded expiration date, not verified document completion"
          href={cohortHref("medical")}
          testId="dq-kpi-medical"
        />
        <V3KpiTile
          label="Emergency contact"
          value={ratio("contact") ?? "—"}
          href={cohortHref("contact")}
          testId="dq-kpi-contact"
        />
        <V3KpiTile
          label="CDL date on file"
          value={ratio("cdl") ?? "—"}
          href={cohortHref("cdl")}
          testId="dq-kpi-cdl"
        />
        <V3KpiTile
          label="Open fines"
          value={
            kpis.isError || countValue(kpis.data?.drivers_with_open_fines) == null
              ? "—"
              : `${kpis.data?.drivers_with_open_fines} drivers`
          }
          href={summaryHref("fines")}
          title="View both fine source registers"
          testId="dq-kpi-fines"
        />
        <V3KpiTile
          label="Critical integrity alerts"
          value={
            kpis.isError || countValue(kpis.data?.critical_integrity_alerts) == null
              ? "—"
              : String(kpis.data?.critical_integrity_alerts)
          }
          tone="red"
          href={summaryHref("alerts")}
          title="View count definition and source"
          testId="dq-kpi-alerts"
        />
      </div>
      {summarySource ? (
        <aside className="rounded-sm border border-slate-200 bg-white p-3 text-xs" aria-label="Summary source registers">
          {summarySource === "fines" ? (
            <>
              <p>
                This count is distinct drivers across open or contested civil fines and pending, approved or disputed
                internal fines. Voided fines are excluded; deactivated civil fines are excluded. These registers include
                other statuses too — select the stated statuses when reviewing.
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                <Link to={safetyHref("/safety/external-fines")} data-testid="dq-civil-fines-link">
                  Civil fine register →
                </Link>
                <Link to={safetyHref("/safety/internal-fines")} data-testid="dq-internal-fines-link">
                  Internal fine register →
                </Link>
              </div>
            </>
          ) : (
            <>
              <p>
                This count includes critical alerts that are unresolved or investigating and not currently snoozed. The
                source register includes other alerts too; select Critical and review those resolution states.
              </p>
              <Link
                className="mt-2 inline-block"
                to={safetyHref("/safety/integrity-alerts")}
                data-testid="dq-integrity-alerts-link"
              >
                Integrity alert register →
              </Link>
            </>
          )}
          <button className="mt-2 block underline" type="button" onClick={() => setSummarySource(null)}>
            Close source details
          </button>
        </aside>
      ) : null}
      {kpis.isError ? (
        <p role="alert" className="text-xs text-slate-600">
          Safety summary unavailable. Open the source records or retry the page.
        </p>
      ) : null}
      <V3Panel
        title="Driver qualification matrix"
        viewAllLabel="View all active drivers →"
        onViewAll={() => setCohort("all")}
        footer="Dates indicate recorded expirations, not verified document completion. Missing information can be added in the driver record. This read-only view does not block dispatch, booking, settlement or pay. DQ-file completion is not supplied by the roster; review the source records."
      >
        <ParityTable
          key={`${companyId}:${cohort}`}
          appearance="board"
          columns={columns}
          rows={(drivers ?? []).filter((driver) => inCohort(driver, cohort))}
          rowKey={(row) => row.id}
          loading={roster.isPending}
        />
      </V3Panel>
    </section>
  );
}
