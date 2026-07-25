import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { resolveApiUrl } from "../../api/client";

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

export function Form2290Filings() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();

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
    return <div className="rounded-sm border border-gray-200 bg-white p-4 text-xs text-slate-600">Select an operating company.</div>;
  }

  const filings = (filingsQ.data?.filings ?? []) as Filing[];
  const deadline = deadlineQ.data as { deadline?: string; days_remaining?: number; current_draft?: Filing | null } | undefined;

  return (
    <div className="space-y-4 rounded-sm border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Form 2290 filings</h2>
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

      <ParityTable<Filing>
        columns={columns}
        rows={filings}
        rowKey={(filing) => String(filing.id)}
        loading={filingsQ.isLoading}
        emptyText="No filings yet."
        storageKey="compliance-form-2290-filings"
        exportFilename="form-2290-filings"
      />
    </div>
  );
}
