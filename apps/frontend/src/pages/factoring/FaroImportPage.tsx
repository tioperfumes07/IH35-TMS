import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { apiRequest } from "../../api/client";

type PreviewLine = {
  invoice_number: string;
  customer_name?: string;
  gross_amount_cents: number;
  advance_amount_cents: number;
  reserve_amount_cents: number;
  fee_amount_cents: number;
  chargeback_amount_cents: number;
  net_amount_cents: number;
  due_on?: string;
};

type PreviewResponse = {
  preview: true;
  line_count: number;
  headers: string[];
  lines: PreviewLine[];
  statement_date?: string;
};

type CommitResponse = {
  ok: true;
  import_id: string;
  line_count: number;
  invoices_updated: number;
  reserve_movements: number;
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function FaroImportPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [statementDate, setStatementDate] = useState(new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<PreviewResponse | null>(null);

  const mutation = useMutation({
    mutationFn: async (previewOnly: boolean) => {
      if (!selectedCompanyId) throw new Error("company_required");
      return apiRequest<PreviewResponse | CommitResponse>(`/api/v1/factoring/import/faro`, {
        method: "POST",
        body: JSON.stringify({
          operating_company_id: selectedCompanyId,
          csv_text: csvText,
          statement_date: statementDate,
          source_filename: fileName || undefined,
          preview_only: previewOnly,
        }),
      });
    },
    onSuccess: (data) => {
      if ("preview" in data && data.preview) {
        setPreview(data);
        pushToast("Preview ready", "success");
        return;
      }
      const commit = data as CommitResponse;
      pushToast(`Imported ${commit.line_count} lines (${commit.invoices_updated} invoices, ${commit.reserve_movements} reserves)`, "success");
      setPreview(null);
      setCsvText("");
      setFileName("");
    },
    onError: (error: Error) => {
      pushToast(error.message || "Import failed", "error");
    },
  });

  const previewRows = useMemo(() => preview?.lines ?? [], [preview]);

  return (
    <div className="space-y-4">
      <PageHeader title="Faro CSV Import" subtitle="Upload Faro factoring statement CSV → invoice updates + reserve movements" />

      <div className="rounded border border-[#2A3150] bg-[#12182B] p-4 space-y-3">
        <label className="block text-xs text-slate-300">
          Statement date
          <input
            type="date"
            className="mt-1 block w-full max-w-xs rounded border border-[#2A3150] bg-[#0B1020] px-2 py-1 text-sm text-white"
            value={statementDate}
            onChange={(e) => setStatementDate(e.target.value)}
          />
        </label>

        <label className="block text-xs text-slate-300">
          Faro CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            className="mt-1 block w-full max-w-md text-sm text-slate-200"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setFileName(file.name);
              setCsvText(await file.text());
              setPreview(null);
            }}
          />
        </label>

        {fileName ? <p className="text-xs text-slate-400">Selected: {fileName}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!companyId || !csvText || mutation.isPending}
            onClick={() => mutation.mutate(true)}
          >
            Preview
          </Button>
          <Button
            disabled={!companyId || !csvText || mutation.isPending}
            onClick={() => mutation.mutate(false)}
          >
            Commit import
          </Button>
        </div>
      </div>

      {preview ? (
        <div className="rounded border border-blue-500/40 bg-[#12182B] p-4">
          <h3 className="mb-2 text-sm font-semibold text-white">
            Preview — {preview.line_count} line{preview.line_count === 1 ? "" : "s"}
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs text-slate-200">
              <thead>
                <tr className="border-b border-[#2A3150] text-slate-400">
                  <th className="px-2 py-1">Invoice</th>
                  <th className="px-2 py-1">Customer</th>
                  <th className="px-2 py-1">Gross</th>
                  <th className="px-2 py-1">Advance</th>
                  <th className="px-2 py-1">Reserve</th>
                  <th className="px-2 py-1">Net</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.invoice_number} className="border-b border-[#1E2440]">
                    <td className="px-2 py-1">{row.invoice_number}</td>
                    <td className="px-2 py-1">{row.customer_name ?? "—"}</td>
                    <td className="px-2 py-1">{currency.format(row.gross_amount_cents / 100)}</td>
                    <td className="px-2 py-1">{currency.format(row.advance_amount_cents / 100)}</td>
                    <td className="px-2 py-1">{currency.format(row.reserve_amount_cents / 100)}</td>
                    <td className="px-2 py-1">{currency.format(row.net_amount_cents / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
