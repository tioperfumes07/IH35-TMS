import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listAllDrivers } from "../../../api/mdata";
import { getSafetyKpis } from "../../../api/safety";
import { DrillKpiCard } from "../../../components/layout/DrillKpiCard";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatDateUS } from "../../../lib/formatDate";
import { formatPersonName } from "../../../lib/formatPersonName";
import type { Driver } from "../../../types/api";

type Cohort = "all" | "medical" | "contact" | "cdl";
const hasContact = (driver: Driver) => Boolean(driver.emergency_contact_name?.trim() && (driver.emergency_contact_phone_primary?.trim() || driver.emergency_contact_phone_alternate?.trim()));
const inCohort = (driver: Driver, cohort: Cohort) => cohort === "medical" ? Boolean(driver.dot_medical_expires_at) : cohort === "cdl" ? Boolean(driver.cdl_expires_at) : cohort === "contact" ? hasContact(driver) : true;
const countValue = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

/** Read-only qualification inventory, not a dispatch-eligibility engine. */
export function DriverQualificationMatrix({ companyId }: { companyId: string }) {
  const [cohort, setCohort] = useState<Cohort>("all");
  const [summarySource, setSummarySource] = useState<"fines" | "alerts" | null>(null);
  const roster = useQuery({
    queryKey: ["safety-cards", "drivers", companyId, ""],
    queryFn: () => listAllDrivers({ operating_company_id: companyId, status: "Active" }),
    enabled: Boolean(companyId),
  });
  const kpis = useQuery({ queryKey: ["safety", "kpis", companyId], queryFn: () => getSafetyKpis(companyId), enabled: Boolean(companyId) });
  const columns = useMemo<ParityColumn<Driver>[]>(() => {
    const record = (row: Driver, label: string) => <EntityLink kind="driver" id={row.id} label={label} />;
    const date = (row: Driver, value: string | null) => record(row, value ? formatDateUS(value) : "Add date");
    return [
      { key: "first_name", label: "Driver", render: (row) => record(row, formatPersonName(`${row.first_name} ${row.last_name}`)), sortValue: (row) => `${row.first_name} ${row.last_name}`, exportValue: (row) => formatPersonName(`${row.first_name} ${row.last_name}`) },
      { key: "cdl_expires_at", label: "CDL", sortable: true, sortValue: (row) => row.cdl_expires_at ?? "", render: (row) => date(row, row.cdl_expires_at) },
      { key: "dot_medical_expires_at", label: "DOT medical", sortable: true, sortValue: (row) => row.dot_medical_expires_at ?? "", render: (row) => date(row, row.dot_medical_expires_at) },
      { key: "visa_expires_at", label: "B-1 visa", sortable: true, sortValue: (row) => row.visa_expires_at ?? "", render: (row) => date(row, row.has_b1_visa || /^b[- ]?1$/i.test(row.visa_type ?? "") ? row.visa_expires_at || row.b1_visa_expires_date : null) },
      { key: "emergency_contact_name", label: "Emergency contact", sortable: true, sortValue: (row) => (hasContact(row) ? "On file" : "Add contact"), render: (row) => record(row, hasContact(row) ? "On file" : "Add contact") },
      { key: "samsara_driver_id", label: "Samsara", sortable: true, sortValue: (row) => (row.samsara_driver_id ? "Linked" : "Link driver"), render: (row) => record(row, row.samsara_driver_id ? "Linked" : "Link driver") },
      { key: "dq_file", label: "DQ file", render: (row) => record(row, "Review records"), sortable: false, exportValue: () => "Status not supplied by roster" },
    ];
  }, []);
  if (!companyId) return <p className="text-xs text-slate-600">Select a company to view driver qualification files.</p>;
  if (roster.isError) return <ListErrorState title="Couldn't load driver qualifications" status={0} message={roster.error instanceof Error ? roster.error.message : undefined} onRetry={() => void roster.refetch()} />;
  const drivers = roster.data?.drivers;
  const ratio = (key: Cohort) => drivers ? `${drivers.filter((driver) => inCohort(driver, key)).length} of ${drivers.length}` : null;
  return <section className="min-w-0 space-y-3" aria-label="Driver qualification files">
    <div className="grid min-w-0 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      <DrillKpiCard label="Active drivers" value={drivers?.length} onClick={() => setCohort("all")} active={cohort === "all"} />
      <DrillKpiCard label="DOT medical date on file" value={ratio("medical")} onClick={() => setCohort("medical")} active={cohort === "medical"} />
      <DrillKpiCard label="Emergency contact" value={ratio("contact")} onClick={() => setCohort("contact")} active={cohort === "contact"} />
      <DrillKpiCard label="CDL date on file" value={ratio("cdl")} onClick={() => setCohort("cdl")} active={cohort === "cdl"} />
      <DrillKpiCard label="Drivers with open fines" value={kpis.isError ? null : countValue(kpis.data?.drivers_with_open_fines)} onClick={() => setSummarySource("fines")} hint="View both source registers" />
      <DrillKpiCard label="Critical integrity alerts" value={kpis.isError ? null : countValue(kpis.data?.critical_integrity_alerts)} onClick={() => setSummarySource("alerts")} hint="View count definition and source" />
    </div>
    {summarySource ? <aside className="rounded-sm border border-slate-200 bg-white p-3 text-xs" aria-label="Summary source registers">
      {summarySource === "fines" ? <>
        <p>This count is distinct drivers across open or contested civil fines and pending, approved or disputed internal fines. Voided fines are excluded; deactivated civil fines are excluded. These registers include other statuses too — select the stated statuses when reviewing.</p>
        <div className="mt-2 flex flex-wrap gap-3"><Link to="/safety/external-fines">Civil fine register →</Link><Link to="/safety/internal-fines">Internal fine register →</Link></div>
      </> : <>
        <p>This count includes critical alerts that are unresolved or investigating and not currently snoozed. The source register includes other alerts too; select Critical and review those resolution states.</p>
        <Link className="mt-2 inline-block" to="/safety/integrity-alerts">Integrity alert register →</Link>
      </>}
      <button className="mt-2 block underline" type="button" onClick={() => setSummarySource(null)}>Close source details</button>
    </aside> : null}
    {kpis.isError ? <p role="alert" className="text-xs text-slate-600">Safety summary unavailable. Open the source records or retry the page.</p> : null}
    <div className="min-w-0 overflow-hidden rounded-sm border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <h3 className="text-xs font-bold uppercase text-slate-700">Driver qualification matrix</h3>
        <button type="button" className="text-xs underline" onClick={() => setCohort("all")}>View all active drivers →</button>
      </div>
      <ParityTable key={`${companyId}:${cohort}`} columns={columns} rows={(drivers ?? []).filter((driver) => inCohort(driver, cohort))} rowKey={(row) => row.id} loading={roster.isPending} />
      <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-600">Dates indicate recorded expirations, not verified document completion. Missing information can be added in the driver record. This read-only view does not block dispatch, booking, settlement or pay. DQ-file completion is not supplied by the roster; review the source records.</p>
    </div>
  </section>;
}
