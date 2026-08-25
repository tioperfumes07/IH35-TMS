import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { resolveApiUrl } from "../../api/client";
import { EntityLink } from "../../components/shared/EntityLink";
import { Fragment } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";

type Filing = Record<string, unknown>;

// SAF-F06: these page-local helpers called bare fetch(path), so with
// VITE_API_BASE_URL set and NO /api rewrite on the static site the request hit
// app.ih35dispatch.com and got index.html back with HTTP 200 — res.ok was true, the
// !res.ok guard never fired, and res.json() threw on HTML. Every load failed silently
// and rendered as empty data. resolveApiUrl() is the shared client's URL resolver.
async function apiGet(path: string) {
  const res = await fetch(resolveApiUrl(path), { credentials: "include" });
  if (!res.ok) throw new Error(`request_failed_${res.status}`);
  return res.json();
}

async function apiPost(path: string, body?: unknown) {
  const res = await fetch(resolveApiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`request_failed_${res.status}`);
  return res.json();
}

type Form2290FilingsProps = {
  /** Full /compliance/form-2290 route. Safety Permits embeds this table under its own header. */
  showModuleHeader?: boolean;
};

export function Form2290Filings({ showModuleHeader = true }: Form2290FilingsProps = {}) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const filingId = searchParams.get("filing_id");
  const [generateError, setGenerateError] = useState<string | null>(null);

  const filingsQ = useQuery({
    queryKey: ["compliance", "form-2290", companyId],
    enabled: Boolean(companyId),
    queryFn: () => apiGet(`/api/v1/compliance/form-2290?operating_company_id=${encodeURIComponent(companyId)}`),
  });

  const deadlineQ = useQuery({
    queryKey: ["compliance", "form-2290", "deadline", companyId],
    enabled: Boolean(companyId),
    queryFn: () => apiGet(`/api/v1/compliance/form-2290/upcoming-deadline?operating_company_id=${encodeURIComponent(companyId)}`),
  });

  const generateMutation = useMutation({
    mutationFn: () => {
      const year = new Date().getUTCFullYear();
      const month = new Date().getUTCMonth();
      const periodYear = month >= 6 ? year : year - 1;
      const taxPeriodStart = `${periodYear}-07-01`;
      return apiPost(
        `/api/v1/compliance/form-2290/generate-draft?operating_company_id=${encodeURIComponent(companyId)}`,
        { tax_period_start: taxPeriodStart }
      );
    },
    onMutate: () => setGenerateError(null),
    onSuccess: async (payload: { pdf_base64?: string }) => {
      await queryClient.invalidateQueries({ queryKey: ["compliance", "form-2290", companyId] });
      if (payload.pdf_base64) {
        const blob = new Blob([Uint8Array.from(atob(payload.pdf_base64), (c) => c.charCodeAt(0))], {
          type: "application/pdf",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "form-2290-draft.pdf";
        anchor.click();
        URL.revokeObjectURL(url);
      }
    },
    onError: (error) =>
      setGenerateError(error instanceof Error ? error.message : "Failed to generate Form 2290 draft"),
  });

  const columns = useMemo<ParityColumn<Filing>[]>(
    () => [
      {
        key: "tax_period_start",
        label: "Tax period",
        sortable: true,
        render: (filing) => `${formatDateUS(filing.tax_period_start)} → ${formatDateUS(filing.tax_period_end)}`,
      },
      { key: "filing_status", label: "Status", sortable: true, render: (filing) => String(filing.filing_status) },
      {
        key: "total_tax_due",
        label: "Total tax",
        sortable: true,
        render: (filing) => `$${Number(filing.total_tax_due ?? 0).toFixed(2)}`,
      },
    ],
    []
  );

  if (!companyId) {
    const empty = (
      <div className="rounded-sm border border-gray-200 bg-white p-4 text-xs text-slate-600">
        Select an operating company.
      </div>
    );
    if (!showModuleHeader) return empty;
    return (
      <div className="space-y-4 p-4">
        <PageHeader
          backHref="/compliance"
          breadcrumb={["Compliance", "Form 2290"]}
          title="Form 2290 filings"
          subtitle="HVUT annual filing"
        />
        {empty}
      </div>
    );
  }

  const filings = ((filingsQ.data?.filings ?? []) as Filing[]).filter(
    (filing) => !filingId || String(filing.id) === filingId
  );
  const deadline = deadlineQ.data as
    | {
        deadline?: string;
        days_remaining?: number;
        current_draft?: Filing | null;
        /* SAF-ORPH-04. The annual `deadline` above is the JULY-first-use case (Aug 31, business-day
           shifted). Per IRS Form 2290 instructions the tax is due the LAST DAY OF THE MONTH FOLLOWING
           the month of first use, so a truck placed in service in October is due Nov 30 — a date the
           annual banner alone can never show. These two fields carry the exceptions. */
        per_unit_deadlines?: Array<{ unit_id: string; unit_number: string; first_used_month: string; deadline: string }>;
        units_missing_first_use?: Array<{ unit_id: string | null; unit_number: string | null }>;
      }
    | undefined;
  const perUnit = deadline?.per_unit_deadlines ?? [];
  const missingFirstUse = deadline?.units_missing_first_use ?? [];

  const body = (
    <div className="space-y-4 rounded-sm border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {showModuleHeader ? null : (
            <h2 className="text-sm font-semibold text-slate-900">Form 2290 filings</h2>
          )}
          <p className="text-xs text-slate-600">
            {/* No fabricated fallback. This previously rendered a hardcoded August-31 literal whenever
                the endpoint had not answered — a regulatory date invented by the UI, indistinguishable
                from a real one, and wrong for every vehicle not first used in July. Under Rule 15 an
                unknown filing deadline must read as unknown. Guarded by verify-step 1500. */}
            HVUT annual filing ·{" "}
            {deadline?.deadline
              ? `due ${deadline.deadline} (${deadline.days_remaining} days remaining)`
              : "due date unavailable — could not load the filing deadline"}
          </p>
          {/* SAF-ORPH-04 — the per-unit exceptions. Only vehicles whose own due date DIFFERS from the
              annual one are listed; a July first use is already covered by the line above and repeating
              it would bury the exceptions in noise. Without this the annual banner silently understated
              the obligation for every vehicle first used after July. */}
          {perUnit.length > 0 ? (
            <p className="mt-1 text-xs text-slate-600">
              <span className="font-semibold text-slate-900">
                {perUnit.length} vehicle{perUnit.length === 1 ? "" : "s"} due on a different date
              </span>{" "}
              (first used outside July) ·{" "}
              {perUnit
                .slice()
                .sort((a, b) => a.deadline.localeCompare(b.deadline))
                .slice(0, 4)
                .map((u, idx) => (
                  <Fragment key={u.unit_id}>
                    {idx > 0 ? " · " : ""}
                    <EntityLink kind="unit" id={u.unit_id} label={u.unit_number} /> due {u.deadline}
                  </Fragment>
                ))}
              {perUnit.length > 4 ? ` · +${perUnit.length - 4} more` : ""}
            </p>
          ) : null}
          {/* A unit with no first-use date has an UNCOMPUTABLE federal filing date. That is surfaced, not
              hidden behind a shorter list — an unknown obligation is a risk to raise, and silently
              omitting these units is how one goes unfiled. */}
          {missingFirstUse.length > 0 ? (
            <p className="mt-1 text-xs text-slate-600">
              <span className="font-semibold text-slate-900">
                {missingFirstUse.length} vehicle{missingFirstUse.length === 1 ? "" : "s"} missing a first-use date
              </span>{" "}
              — due date cannot be computed ·{" "}
              {missingFirstUse.slice(0, 6).map((unit, idx) => (
                <Fragment key={unit.unit_id ?? `unresolved-unit-${idx}`}>
                  {idx > 0 ? ", " : ""}
                  {unit.unit_id ? (
                    <EntityLink kind="unit" id={unit.unit_id} label={unit.unit_number ?? "Unit"} />
                  ) : (
                    <span>{unit.unit_number ?? "Unit — not visible"}</span>
                  )}
                </Fragment>
              ))}
              {missingFirstUse.length > 6 ? `, +${missingFirstUse.length - 6} more` : ""}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded-sm bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          disabled={generateMutation.isPending}
          onClick={() => generateMutation.mutate()}
        >
          Generate draft
        </button>
      </div>

      {generateError ? (
        <p role="alert" className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {generateError}
        </p>
      ) : null}

      {deadlineQ.isError ? (
        <ListErrorState
          title="Couldn't load Form 2290 filing deadlines"
          status={0}
          message={(deadlineQ.error as Error)?.message}
          onRetry={() => void deadlineQ.refetch()}
        />
      ) : null}

      {filingsQ.isError ? (
        <ListErrorState
          title="Couldn't load Form 2290 filings"
          status={0}
          message={(filingsQ.error as Error)?.message}
          onRetry={() => void filingsQ.refetch()}
        />
      ) : (
        <ParityTable<Filing>
          columns={columns}
          rows={filings}
          rowKey={(filing) => String(filing.id)}
          loading={filingsQ.isLoading}
          emptyText="No filings yet."
          storageKey="compliance-form-2290-filings"
          exportFilename="form-2290-filings"
        />
      )}
    </div>
  );

  if (!showModuleHeader) return body;

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        backHref="/compliance"
        breadcrumb={["Compliance", "Form 2290"]}
        title="Form 2290 filings"
        subtitle="HVUT annual filing"
      />
      {body}
    </div>
  );
}
