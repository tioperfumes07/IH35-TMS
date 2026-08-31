import { useState } from "react";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { ApiError, apiRequest, resolveApiUrl } from "../../../api/client";
import { userFacingApiError } from "../../../lib/api-error-message";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Button } from "../../../components/Button";
import { ListErrorState } from "../../../components/ListErrorState";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { PageHeader } from "../../../components/forms/shared/PageHeader";
import { EldEditHistoryTimeline, type EldEditHistoryEntry } from "../../../components/safety/EldEditHistoryTimeline";
import { useToast } from "../../../components/Toast";
import { companyToday, addDaysIso } from "../../../lib/businessDate";

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

// Central Time (CLAUDE.md §8 "Central Time always" / businessDate.ts) — `.toISOString().slice(0,10)`
// returns the UTC calendar date, which after ~19:00 Central has already rolled to tomorrow and
// silently shrinks/shifts the default 7-day audit window.
function defaultFromDate() {
  return addDaysIso(companyToday(), -7);
}

function defaultToDate() {
  return companyToday();
}

async function downloadEldAuditPdf(params: {
  operatingCompanyId: string;
  driverUuid: string;
  from: string;
  to: string;
}) {
  const qs = new URLSearchParams({
    operating_company_id: params.operatingCompanyId,
    driver: params.driverUuid,
    from: params.from,
    to: params.to,
  });
  const response = await fetch(resolveApiUrl(`/api/safety/eld/audit-trail/export.pdf?${qs.toString()}`), {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    const isJson = response.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await response.json() : await response.text();
    throw new ApiError(response.status, payload);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? `ELD_Edit_History_${params.to}.pdf`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function EldAuditTrailViewer() {
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const [driverUuid, setDriverUuid] = useState("");
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(defaultToDate);
  const [exporting, setExporting] = useState(false);

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

  const exportPdf = () => {
    if (!companyId || !driverUuid || !historyQuery.data?.edits?.length) return;
    setExporting(true);
    void downloadEldAuditPdf({
      operatingCompanyId: companyId,
      driverUuid,
      from,
      to,
    })
      .then(() => pushToast("ELD audit PDF downloaded", "success"))
      .catch((error: Error) => pushToast(userFacingApiError(error, "Failed to export ELD audit PDF"), "error"))
      .finally(() => setExporting(false));
  };

  if (!companyId) {
    return <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-600">Select an operating company.</div>;
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
          <Button
            variant="secondary"
            onClick={exportPdf}
            disabled={!historyQuery.data?.edits?.length || exporting}
            data-testid="eld-audit-export-pdf"
          >
            <Download className="mr-1 inline h-4 w-4" />
            {exporting ? "Exporting…" : "Export PDF for DOT"}
          </Button>
        }
      />

      <section className="rounded-sm border border-gray-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm text-gray-700">
            Driver
            <div className="mt-1">
              <DriverPickerWithCreate
                operatingCompanyId={companyId}
                value={driverUuid || null}
                onChange={(next) => setDriverUuid(next ?? "")}
                placeholder="Search driver…"
                dataField="eld-audit-driver"
              />
            </div>
          </label>
          <div className="text-sm text-gray-700">
            <label htmlFor="eld-audit-from">From</label>
            <DatePicker
              id="eld-audit-from"
              className="mt-1 w-full"
              value={from}
              onChange={(next) => setFrom(next)}
            />
          </div>
          <div className="text-sm text-gray-700">
            <label htmlFor="eld-audit-to">To</label>
            <DatePicker
              id="eld-audit-to"
              className="mt-1 w-full"
              value={to}
              onChange={(next) => setTo(next)}
            />
          </div>
        </div>
      </section>

      <section className="p-4 print:border-0">
        {/* ELD-AUDIT-TRAIL-FALSE-EMPTY-ON-503 — this used to gate the three branches on the derived
            booleans isLoading (= isPending && isFetching) and isError. TanStack Query v5 can leave a
            query in status "pending" while isFetching is momentarily false (a retry backoff window
            that here never completes a second attempt), so isLoading and isError were BOTH false —
            and "!isLoading && !isError" was wrongly treated as a successful empty result, silently
            rendering "No edits found" for what was actually a 503 (source unavailable) that had never
            resolved. Confirmed live and reproducible: the backend consistently 503s for this tenant,
            and the false-empty text showed every time. Driving the branches off the primitive `status`
            (isPending/isError/isSuccess) instead has no such gap: those three are mutually exclusive
            and exhaustive, with no "not loading, not errored, but also not actually successful" hole. */}
        {driverUuid && historyQuery.isPending ? <p className="text-sm text-gray-500">Loading edit history…</p> : null}
        {driverUuid && historyQuery.isError ? (
          <div data-testid="eld-audit-trail-query-error">
            <ListErrorState
              title="Couldn't load ELD audit trail"
              status={historyQuery.error instanceof ApiError ? historyQuery.error.status : 0}
              message={userFacingApiError(historyQuery.error, "Couldn't load ELD audit trail.")}
              onRetry={() => void historyQuery.refetch()}
            />
          </div>
        ) : null}
        {driverUuid && historyQuery.isSuccess ? (
          historyQuery.data.edits?.length ? (
            <EldEditHistoryTimeline
              driverUuid={driverUuid}
              operatingCompanyId={companyId}
              edits={historyQuery.data.edits}
              from={historyQuery.data.from}
              to={historyQuery.data.to}
            />
          ) : (
            <p className="text-sm text-gray-600">No edits found for the selected driver and date range.</p>
          )
        ) : null}
        {!driverUuid ? <p className="text-sm text-gray-600">Choose a driver to view the audit trail.</p> : null}
      </section>
    </div>
  );
}
