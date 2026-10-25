import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { categorizeBankTransaction, rejectBankTransactionSuggestion } from "../../../api/banking";
import { useToast } from "../../../components/Toast";
import { formatDateUS } from "../../../lib/formatDate";
import { formatUsd } from "../../../lib/money";
import { MoneyCell } from "../../../components/shared/MoneyCell";
import { userFacingApiError } from "../../../lib/api-error-message";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

export type NeedsCategorizingRow = {
  id: string;
  date: string | null;
  description: string;
  suggestedAccount: string | null;
  suggestedAccountId: string | null;
  unit: string | null;
  amountCents: number;
  categoryKind?: string;
};

type Props = {
  companyId: string;
  rows: NeedsCategorizingRow[];
  onChange: (row: NeedsCategorizingRow) => void;
  onAccepted?: () => void;
};

function missing(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  return s ? s : "—";
}

/**
 * C-64 — Needs categorizing queue on Banking Home.
 * Date 132px · Description · Suggested account · Unit · Amount · Accept / Change / Reject.
 * 443.343-C: per-line only — never auto-accept, never bulk-accept.
 */
export function NeedsCategorizingQueue({ companyId, rows, onChange, onAccepted }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const acceptOne = useMutation({
    mutationFn: async (row: NeedsCategorizingRow) => {
      if (!row.suggestedAccountId) {
        throw new Error("No suggested account — use Change to pick one.");
      }
      return categorizeBankTransaction(row.id, companyId, {
        category_kind: row.categoryKind || "expense",
        gl_account_id: row.suggestedAccountId,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["banking"] });
      onAccepted?.();
    },
  });

  const rejectOne = useMutation({
    mutationFn: async (row: NeedsCategorizingRow) => rejectBankTransactionSuggestion(row.id, companyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["banking"] });
      onAccepted?.();
    },
  });

  const columns: Array<ParityColumn<NeedsCategorizingRow>> = [
    {
      key: "date",
      label: "Date",
      sortable: true,
      minWidth: 132,
      sortValue: (row) => row.date,
      render: (row) => (row.date ? formatDateUS(row.date) : "—"),
    },
    {
      key: "description",
      label: "Description",
      sortable: true,
      sortValue: (row) => row.description,
      cellClass: "text-left text-[#0F1219]",
      render: (row) => missing(row.description),
    },
    {
      key: "suggestedAccount",
      label: "Suggested account",
      sortable: true,
      sortValue: (row) => row.suggestedAccount,
      cellClass: "text-[#1F2A44]",
      render: (row) => missing(row.suggestedAccount),
    },
    { key: "unit", label: "Unit", sortable: true, sortValue: (row) => row.unit, render: (row) => missing(row.unit) },
    {
      key: "amountCents",
      label: "Amount",
      kind: "money",
      sortable: true,
      minWidth: 120,
      sortValue: (row) => row.amountCents,
      render: (row) => (
        <MoneyCell cents={row.amountCents / 100} format={formatUsd} drill={{ entity: { kind: "bank_transaction", id: row.id } }} />
      ),
    },
  ];

  return (
    <section
      className="rounded-sm border border-[#E5E7EB] bg-white"
      data-testid="needs-categorizing-queue"
      data-c64-needs-categorizing="1"
    >
      {/* 443.99 — the shared ParityTable (was a hand-rolled HTML table): sortable headers, gear, export. */}
      <ParityTable<NeedsCategorizingRow>
        title="Needs categorizing"
        embedded
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        emptyText="Nothing waiting to categorize"
        storageKey="banking-needs-categorizing"
        exportFilename="needs-categorizing"
        rowTestId={(row) => `needs-cat-row-${row.id}`}
        suppressToolbarRange
        rowActions={(row) => (
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              disabled={!row.suggestedAccountId || busyId === row.id}
              className="inline-flex h-[28px] items-center rounded-sm bg-[#14314F] px-2 text-xs font-bold text-white disabled:opacity-40"
              data-testid={`needs-cat-accept-${row.id}`}
              onClick={() => {
                setBusyId(row.id);
                acceptOne
                  .mutateAsync(row)
                  .then(() => pushToast("Accepted suggestion.", "success"))
                  .catch((err) => pushToast(userFacingApiError(err, "Could not accept suggestion"), "error"))
                  .finally(() => setBusyId(null));
              }}
            >
              Accept
            </button>
            <button
              type="button"
              className="inline-flex h-[28px] items-center rounded-sm border border-[#E5E7EB] px-2 text-xs font-medium text-[#1F2A44] hover:bg-[#F7F8FA]"
              data-testid={`needs-cat-change-${row.id}`}
              onClick={() => onChange(row)}
            >
              Change
            </button>
            <button
              type="button"
              disabled={busyId === row.id}
              className="inline-flex h-[28px] items-center rounded-sm border border-[#E5E7EB] px-2 text-xs font-medium text-red-700 hover:bg-[#F7F8FA] disabled:opacity-40"
              data-testid={`needs-cat-reject-${row.id}`}
              onClick={() => {
                setBusyId(row.id);
                rejectOne
                  .mutateAsync(row)
                  .then(() => pushToast("Suggestion rejected.", "success"))
                  .catch((err) => pushToast(userFacingApiError(err, "Could not reject suggestion"), "error"))
                  .finally(() => setBusyId(null));
              }}
            >
              Reject
            </button>
          </div>
        )}
      />
      <div className="flex items-center justify-between border-t border-[#E5E7EB] px-3 py-2">
        <p className="text-xs text-[#6B7280]">
          {rows.length} row{rows.length === 1 ? "" : "s"} · suggestions only — never auto-matched · no apply all
        </p>
      </div>
    </section>
  );
}
