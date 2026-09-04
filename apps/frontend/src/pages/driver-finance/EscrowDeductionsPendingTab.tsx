import { entityLabel } from "../../lib/entity-label";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityLink } from "../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import {
  approvePendingEscrowDeduction,
  listPendingEscrowDeductions,
  rejectPendingEscrowDeduction,
  type EscrowPendingDeduction,
} from "../../api/driverFinance";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/layout/PageHeader";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatUsdCents } from "../../lib/money";
import { userFacingApiError } from "../../lib/api-error-message";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";

function formatMoney(cents: number) {
  return formatUsdCents(cents);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function daysUntil(value: string) {
  const expires = new Date(value).getTime();
  const now = Date.now();
  return Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
}

export function EscrowDeductionsPendingTab() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [selected, setSelected] = useState<EscrowPendingDeduction | null>(null);
  // M-1: dollars-origin override (escrow). Stored as a dollar NUMBER; the *100 → cents seam at submit is
  // unchanged (byte-for-byte). Display via dollars-mode MoneyInput.
  const [overrideAmount, setOverrideAmount] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const pendingQuery = useQuery({
    queryKey: ["driver-finance", "escrow-pending", companyId],
    queryFn: () => listPendingEscrowDeductions(companyId),
    enabled: Boolean(companyId),
  });

  const rows = pendingQuery.data?.data ?? [];
  const isOwner = auth.user?.role === "Owner";

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const overrideAmountCents =
        overrideAmount != null ? Math.round(Math.max(0, overrideAmount) * 100) : undefined;
      return approvePendingEscrowDeduction(selected.id, {
        operating_company_id: companyId,
        override_amount_cents: overrideAmountCents,
        review_notes: reviewNotes.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setSelected(null);
      setOverrideAmount(null);
      setReviewNotes("");
      setErrorMessage("");
      await queryClient.invalidateQueries({ queryKey: ["driver-finance", "escrow-pending", companyId] });
    },
    onError: (err) => {
      const message = userFacingApiError(err, "Request failed");
      setErrorMessage(message);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      return rejectPendingEscrowDeduction(selected.id, {
        operating_company_id: companyId,
        review_notes: reviewNotes.trim(),
      });
    },
    onSuccess: async () => {
      setSelected(null);
      setOverrideAmount(null);
      setReviewNotes("");
      setErrorMessage("");
      await queryClient.invalidateQueries({ queryKey: ["driver-finance", "escrow-pending", companyId] });
    },
    onError: (err) => {
      const message = userFacingApiError(err, "Request failed");
      setErrorMessage(message);
    },
  });

  const selectedAmountDefault = useMemo(() => {
    if (!selected) return null;
    return selected.proposed_amount_cents / 100;
  }, [selected]);

  const columns = useMemo<ParityColumn<EscrowPendingDeduction>[]>(
    () => [
      {
        key: "driver_id",
        label: "Driver Name",
        render: (row) => (
          <EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} />
        ),
      },
      {
        key: "load_id",
        label: "Load #",
        render: (row) =>
          row.load_id ? (
            <EntityLink kind="load" id={row.load_id} label={entityLabel(row.load_number, row.load_id, "Load")} />
          ) : (
            "—"
          ),
      },
      {
        key: "proposed_amount_cents",
        label: "Proposed Amount",
        sortable: true,
        render: (row) => <span className="font-medium">{formatMoney(row.proposed_amount_cents)}</span>,
      },
      {
        key: "proposed_reason",
        label: "Reason",
        render: (row) => (
          <span className="max-w-[320px] truncate" title={row.proposed_reason}>
            {row.proposed_reason}
          </span>
        ),
      },
      {
        key: "proposed_at",
        label: "Proposed At",
        sortable: true,
        render: (row) => formatDateTime(row.proposed_at),
      },
      {
        key: "expires_at",
        label: "Expires At",
        sortable: true,
        render: (row) => {
          const nearExpiry = daysUntil(row.expires_at) <= 3;
          return <span className={nearExpiry ? "font-semibold text-red-600" : ""}>{formatDateTime(row.expires_at)}</span>;
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <PageHeader title="Escrow Deductions Pending Review" subtitle="Auto-proposed abandonment deductions requiring Owner decision." />

      {!isOwner ? (
        <div className="rounded-sm border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900">
          Owner approval required.
        </div>
      ) : null}

      {pendingQuery.isError ? (
        <ListErrorState
          title="Couldn't load pending escrow deductions"
          {...formatQueryErrorDetail(pendingQuery.error)}
          onRetry={() => void pendingQuery.refetch()}
        />
      ) : null}

      {!pendingQuery.isError ? (
        // ACCT-F3534: always mount ParityTable (Search+Range+gear); raw HTML table had no surface bar.
        <ParityTable<EscrowPendingDeduction>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={pendingQuery.isLoading}
          emptyText="No pending escrow deductions"
          storageKey="escrow-deductions-pending"
          exportFilename="escrow-deductions-pending"
          rowActions={(row) => (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSelected(row);
                setOverrideAmount(row.proposed_amount_cents / 100);
                setReviewNotes("");
                setErrorMessage("");
              }}
            >
              Review
            </Button>
          )}
        />
      ) : null}

      <Modal
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setErrorMessage("");
          setOverrideAmount(null);
          setReviewNotes("");
        }}
        title="Review Escrow Deduction"
      >
        {selected ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-sm border border-gray-200 bg-gray-50 p-3 text-xs">
              <div><span className="font-semibold">Driver:</span> <EntityLink kind="driver" id={selected.driver_id} label={entityLabel(selected.driver_name, selected.driver_id, "Driver")} /></div>
              <div><span className="font-semibold">Load:</span> <EntityLink kind="load" id={selected.load_id} label={entityLabel(selected.load_number, selected.load_id, "Load")} /></div>
              <div><span className="font-semibold">Proposed:</span> {formatMoney(selected.proposed_amount_cents)}</div>
              <div><span className="font-semibold">Reason:</span> {selected.proposed_reason}</div>
              <div className="space-y-1">
                <div className="font-semibold">Breakdown JSON</div>
                <pre className="max-h-56 overflow-auto rounded-sm bg-slate-900 p-2 text-xs text-slate-100">
                  {JSON.stringify(selected.proposed_breakdown_json ?? {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="space-y-3 rounded-sm border border-gray-200 p-3">
              <label className="block text-xs font-semibold uppercase text-gray-600">Override Amount (optional)</label>
              {/* M-1: dollars-mode QBO money entry ($ + .00). Value stays a DOLLAR number; the *100 → cents
                  conversion at submit is unchanged (byte-for-byte override_amount_cents). */}
              <MoneyInput
                valueDollars={overrideAmount ?? selectedAmountDefault}
                onChangeDollars={(d) => setOverrideAmount(d)}
                className="w-full"
                ariaLabel="Override amount"
              />

              <label className="block text-xs font-semibold uppercase text-gray-600">Review Notes</label>
              <textarea
                className="min-h-28 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
                value={reviewNotes}
                onChange={(event) => setReviewNotes(event.target.value)}
                placeholder="Explain decision..."
              />

              {errorMessage ? <div className="rounded-sm border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">{errorMessage}</div> : null}

              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={!isOwner || reviewNotes.trim().length < 10}
                  loading={rejectMutation.isPending}
                  onClick={() => void rejectMutation.mutateAsync()}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  className="border-slate-700! bg-slate-700! hover:bg-slate-800!"
                  disabled={!isOwner}
                  loading={approveMutation.isPending}
                  onClick={() => void approveMutation.mutateAsync()}
                >
                  Approve
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
