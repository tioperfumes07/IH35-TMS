import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";

type Filing = Record<string, unknown>;

async function apiGet(path: string) {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error(`request_failed_${res.status}`);
  return res.json();
}

async function apiPost(path: string, body?: unknown) {
  const res = await fetch(path, {
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

  if (!companyId) {
    return <div className="rounded border border-gray-200 bg-white p-4 text-xs text-slate-600">Select an operating company.</div>;
  }

  const filings = (filingsQ.data?.filings ?? []) as Filing[];
  const deadline = deadlineQ.data as { deadline?: string; days_remaining?: number; current_draft?: Filing | null } | undefined;

  return (
    <div className="space-y-4 rounded border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Form 2290 filings</h2>
          <p className="text-xs text-slate-600">
            HVUT annual filing · due {deadline?.deadline ?? "Aug 31"} ({deadline?.days_remaining ?? "—"} days remaining)
          </p>
        </div>
        <button
          type="button"
          className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          disabled={generateMutation.isPending}
          onClick={() => generateMutation.mutate()}
        >
          Generate draft
        </button>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 text-left text-slate-600">
            <th className="py-2">Tax period</th>
            <th>Status</th>
            <th>Total tax</th>
          </tr>
        </thead>
        <tbody>
          {filings.map((filing) => (
            <tr key={String(filing.id)} className="border-b border-gray-100">
              <td className="py-2">
                {String(filing.tax_period_start)} → {String(filing.tax_period_end)}
              </td>
              <td>{String(filing.filing_status)}</td>
              <td>${Number(filing.total_tax_due ?? 0).toFixed(2)}</td>
            </tr>
          ))}
          {filings.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-3 text-slate-500">
                No filings yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
