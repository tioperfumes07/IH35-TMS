import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { apiRequest } from "../../../api/client";
import { listDrivers } from "../../../api/mdata";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Button } from "../../../components/Button";
import { PageHeader } from "../../../components/forms/shared/PageHeader";
import { EldEditHistoryTimeline, type EldEditHistoryEntry } from "../../../components/safety/EldEditHistoryTimeline";

type EldAuditTrailResponse = {
  driver_uuid: string;
  driver_name: string | null;
  from: string;
  to: string;
  edits: EldEditHistoryEntry[];
  read_only: true;
  pdf_payload: {
    title: string;
    generated_at: string;
    driver_uuid: string;
    driver_name: string | null;
    period: { from: string; to: string };
    edits: EldEditHistoryEntry[];
    fmcsa_notice: string;
  };
};

function defaultFromDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

function defaultToDate() {
  return new Date().toISOString().slice(0, 10);
}

export function EldAuditTrailViewer() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const printRef = useRef<HTMLDivElement>(null);
  const [driverUuid, setDriverUuid] = useState("");
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(defaultToDate);

  const driversQuery = useQuery({
    queryKey: ["mdata", "drivers", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listDrivers({ operating_company_id: companyId }),
  });

  const historyQuery = useQuery({
    queryKey: ["safety", "eld-audit-trail", companyId, driverUuid, from, to],
    enabled: Boolean(companyId && driverUuid && from && to),
    queryFn: () => {
      const params = new URLSearchParams({
        operating_company_id: companyId,
        driver: driverUuid,
        from,
        to,
      });
      return apiRequest<EldAuditTrailResponse>(`/api/safety/eld/audit-trail?${params.toString()}`);
    },
  });

  const driverOptions = useMemo(
    () =>
      (driversQuery.data?.drivers ?? [])
        .map((driver) => ({
          value: driver.id,
          label: `${driver.first_name} ${driver.last_name}`.trim() || driver.id,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [driversQuery.data?.drivers]
  );

  const exportPdf = () => {
    if (!historyQuery.data) return;
    const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!popup) return;
    const payload = historyQuery.data.pdf_payload;
    const rows = payload.edits
      .map(
        (edit) => `
          <tr>
            <td>${edit.edited_at}</td>
            <td>${edit.field_name}</td>
            <td>${edit.before_state ?? ""}</td>
            <td>${edit.after_state ?? ""}</td>
            <td>${edit.edited_by}</td>
            <td>${edit.reason}</td>
          </tr>
        `
      )
      .join("");
    popup.document.write(`
      <html>
        <head><title>${payload.title}</title></head>
        <body>
          <h1>${payload.title}</h1>
          <p>Driver: ${payload.driver_name ?? payload.driver_uuid}</p>
          <p>Period: ${payload.period.from} to ${payload.period.to}</p>
          <p>Generated: ${payload.generated_at}</p>
          <p>${payload.fmcsa_notice}</p>
          <table border="1" cellpadding="6" cellspacing="0" width="100%">
            <thead>
              <tr>
                <th>Edited At</th>
                <th>Field</th>
                <th>Before</th>
                <th>After</th>
                <th>Edited By</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `);
    popup.document.close();
    setTimeout(() => popup.print(), 500);
  };

  if (!companyId) {
    return <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">Select an operating company.</div>;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="ELD Audit Trail"
        subtitle="Read-only FMCSA edit history from mirrored Samsara HOS log edits"
        breadcrumb={[
          { label: "Safety", href: "/safety" },
          { label: "ELD Audit Trail" },
        ]}
        actions={
          <Button variant="secondary" onClick={exportPdf} disabled={!historyQuery.data?.edits.length}>
            <Download className="mr-1 inline h-4 w-4" />
            Export PDF for DOT
          </Button>
        }
      />

      <section className="rounded border border-gray-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm text-gray-700">
            Driver
            <select
              className="mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm"
              value={driverUuid}
              onChange={(event) => setDriverUuid(event.target.value)}
            >
              <option value="">Select driver…</option>
              {driverOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700">
            From
            <input
              type="date"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="text-sm text-gray-700">
            To
            <input
              type="date"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section ref={printRef} className="rounded border border-gray-200 bg-white p-4 print:border-0">
        {historyQuery.isLoading ? <p className="text-sm text-gray-500">Loading edit history…</p> : null}
        {driverUuid && !historyQuery.isLoading ? (
          historyQuery.data?.edits.length ? (
            <EldEditHistoryTimeline driverUuid={driverUuid} operatingCompanyId={companyId} />
          ) : (
            <p className="text-sm text-gray-600">No edits found for the selected driver and date range.</p>
          )
        ) : null}
        {!driverUuid ? <p className="text-sm text-gray-600">Choose a driver to view the audit trail.</p> : null}
      </section>
    </div>
  );
}
