import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { DatePicker } from "../../components/forms/DatePicker";
import { BoardSection } from "../../components/v3/BoardSection";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { apiRequest } from "../../api/client";
import { companyToday } from "../../lib/businessDate";
import { entityLabel } from "../../lib/entity-label";
import { userFacingApiError } from "../../lib/api-error-message";
import { MoneyCell } from "../../components/shared/MoneyCell";
import { formatQuantityTable, formatUsdCents } from "../../lib/money";
import { useLocation, useSearchParams } from "react-router-dom";
import { resolveBackHref } from "../../lib/returnContext";

type PreviewLine = {
  invoice_number: string;
  customer_name?: string;
  invoice_id?: string | null;
  customer_id?: string | null;
  customer_display_name?: string | null;
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


// Display-only preview columns — 1:1 with the former hand-rolled table (order, labels,
// currency formatting, sign all unchanged). No action controls live in these cells.
const PREVIEW_COLUMNS: Array<ParityColumn<PreviewLine>> = [
  {
    key: "invoice_number",
    label: "Invoice",
    sortable: true,
    render: (row) => (
      <EntityLink
        kind="invoice"
        id={row.invoice_id}
        label={entityLabel(row.invoice_number, row.invoice_id, "Invoice")}
        data-testid="faro-import-invoice-link"
      />
    ),
  },
  {
    key: "customer_name",
    label: "Customer",
    sortable: true,
    render: (row) => (
      <EntityLink
        kind="customer"
        id={row.customer_id}
        label={entityLabel(row.customer_display_name ?? row.customer_name, row.customer_id, "Customer")}
        data-testid="faro-import-customer-link"
      />
    ),
  },
  {
    key: "gross_amount_cents",
    label: "Gross",
    sortable: true,
    render: (row) =>
      row.invoice_id ? (
        <MoneyCell cents={Number(row.gross_amount_cents ?? 0)} drill={{ entity: { kind: "invoice", id: row.invoice_id } }} />
      ) : (
        formatUsdCents(row.gross_amount_cents)
      ),
  },
  {
    key: "advance_amount_cents",
    label: "Advance",
    sortable: true,
    render: (row) =>
      row.invoice_id ? (
        <MoneyCell cents={Number(row.advance_amount_cents ?? 0)} drill={{ entity: { kind: "invoice", id: row.invoice_id } }} />
      ) : (
        formatUsdCents(row.advance_amount_cents)
      ),
  },
  {
    key: "reserve_amount_cents",
    label: "Reserve",
    sortable: true,
    render: (row) =>
      row.invoice_id ? (
        <MoneyCell cents={Number(row.reserve_amount_cents ?? 0)} drill={{ entity: { kind: "invoice", id: row.invoice_id } }} />
      ) : (
        formatUsdCents(row.reserve_amount_cents)
      ),
  },
  {
    key: "net_amount_cents",
    label: "Net",
    sortable: true,
    render: (row) =>
      row.invoice_id ? (
        <MoneyCell cents={Number(row.net_amount_cents ?? 0)} drill={{ entity: { kind: "invoice", id: row.invoice_id } }} />
      ) : (
        formatUsdCents(row.net_amount_cents)
      ),
  },
];

export function FaroImportPage() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  // ROUND 8.20 board18 — honor ?ret= from Factoring Home (fallback /factoring).
  const factoringBackHref = resolveBackHref({ searchParams, pathname, fallback: "/factoring" });
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [statementDate, setStatementDate] = useState(companyToday());
  const [preview, setPreview] = useState<PreviewResponse | null>(null);

  const mutation = useMutation({
    mutationFn: async (previewOnly: boolean) => {
      if (!selectedCompanyId) throw new Error("company_required");
      return apiRequest<PreviewResponse | CommitResponse>(`/api/v1/factoring/import/faro`, {
        method: "POST",
        body: {
          operating_company_id: selectedCompanyId,
          csv_text: csvText,
          statement_date: statementDate,
          source_filename: fileName || undefined,
          preview_only: previewOnly,
        },
      });
    },
    onSuccess: (data) => {
      if ("preview" in data && data.preview) {
        setPreview(data);
        pushToast("Preview ready", "success");
        return;
      }
      const commit = data as CommitResponse;
      pushToast(`Imported ${formatQuantityTable(commit.line_count, 0)} lines (${formatQuantityTable(commit.invoices_updated, 0)} invoices, ${formatQuantityTable(commit.reserve_movements, 0)} reserves)`, "success");
      setPreview(null);
      setCsvText("");
      setFileName("");
    },
    onError: (error: unknown) => {
      pushToast(userFacingApiError(error, "Import failed"), "error");
    },
  });

  const previewRows = useMemo(() => preview?.lines ?? [], [preview]);

  return (
    <div className="space-y-3" data-testid="faro-import-page">
      <PageHeader
        backHref={factoringBackHref}
        breadcrumb={["Factoring", "Faro CSV Import"]}
        title="Faro CSV Import"
        subtitle="Upload Faro factoring statement CSV → invoice updates + reserve movements"
      />

      {!selectedCompanyId ? (
        <BoardSection title="Faro CSV Import" testId="faro-import-need-company">
          <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company to import a Faro statement.</p>
        </BoardSection>
      ) : (
        <BoardSection title="Upload" testId="faro-import-upload-board">
          <div className="space-y-3 px-3.5 py-2">
            <label className="block text-xs text-[#4B5563]">
              Statement date
              <DatePicker
                className="mt-1 block w-full max-w-xs"
                value={statementDate}
                onChange={setStatementDate}
              />
            </label>

            <label className="block text-xs text-[#4B5563]">
              Faro CSV file
              <input
                type="file"
                accept=".csv,text/csv"
                className="mt-1 block w-full max-w-md text-xs text-[#0F1219]"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setFileName(file.name);
                  setCsvText(await file.text());
                  setPreview(null);
                }}
              />
            </label>

            {fileName ? <p className="text-xs text-[#6B7280]">Selected: {fileName}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                disabled={!selectedCompanyId || !csvText || mutation.isPending}
                onClick={() => mutation.mutate(true)}
              >
                Preview
              </Button>
              {/* OWNER LAW 2026-10-02 competing-engine audit: committing created Faro fundings, chargebacks and reserve
                  movements outside the purchase engine. Faro's report is previewed and compared, never posted. */}
              <span className="text-xs text-[#4B5563]">Preview only — purchases are created on Factoring → Submit to Factor.</span>
            </div>
          </div>
        </BoardSection>
      )}

      {preview ? (
        <BoardSection
          title={`Preview — ${formatQuantityTable(preview.line_count, 0)} line${preview.line_count === 1 ? "" : "s"}`}
          testId="faro-import-preview-board"
        >
          <ParityTable appearance="board"
            columns={PREVIEW_COLUMNS}
            rows={previewRows}
            rowKey={(row) => row.invoice_number}
            storageKey="factoring-faro-import-preview"
            tableTestId="faro-import-preview-table"
            emptyText="No preview lines."
          />
        </BoardSection>
      ) : null}
    </div>
  );
}
