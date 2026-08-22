import { entityLabel } from "../../../lib/entity-label";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { EntityLink } from "../../../components/shared/EntityLink";
import { formatDateUS } from "../../../lib/formatDate";
import { titleize } from "../../../lib/titleize";
import {
  getSettlementDispute,
  listSettlementDisputes,
  markSettlementDisputeUnderReview,
  resolveSettlementDispute,
  type SettlementDisputeRow,
  type SettlementDisputeStatus,
} from "../../../api/driverFinance";
import { Button } from "../../../components/Button";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useStagedListFilters } from "../../../components/table";
import { useToast } from "../../../components/Toast";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useListState } from "../../../components/list-state";
import { userFacingApiError } from "../../../lib/api-error-message";

const EMPTY_FILTERS = {
  driverId: "",
};

function money(cents: number | null | undefined) {
  return `$${((Number(cents ?? 0) || 0) / 100).toFixed(2)}`;
}

function statusBadgeClass(status: SettlementDisputeStatus) {
  if (status === "open") return "bg-slate-100 text-slate-700";
  if (status === "under_review") return "bg-slate-100 text-slate-700";
  if (status === "resolved_in_favor" || status === "partially_resolved") return "bg-slate-100 text-slate-700";
  if (status === "withdrawn") return "bg-gray-100 text-gray-700";
  return "bg-red-100 text-red-700";
}

export function SettlementDisputesTab({ companyId }: { companyId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  // LST-F5182 — visible EntityPicker (URL seed + DriverPickerWithCreate without URL write is not reverse chrome).
  // LV-DRIVER-FINANCE-SETTLEMENT-DISPUTES-FILTER-SILENT-APPLY — stage until Apply; URL on Apply/Reset.
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";
  const requestedDisputeId = searchParams.get("dispute_id")?.trim() ?? "";
  const [status, setStatus] = useState<"open" | "all">("open");
  const [selected, setSelected] = useState<SettlementDisputeRow | null>(null);

  function patchListSearchParam(next: { driverId: string }) {
    const p = new URLSearchParams(searchParams);
    if (next.driverId) p.set("driver_id", next.driverId);
    else p.delete("driver_id");
    setSearchParams(p, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: driverIdFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchListSearchParam(next);
    },
  });
  const filterDraft = staged.draft;

  useEffect(() => {
    setApplied((prev) => ({ ...prev, driverId: driverIdFromUrl }));
  }, [driverIdFromUrl]);

  function setDriverId(next: string) {
    staged.setDraft((d) => ({ ...d, driverId: next }));
  }

  const effectiveDriverId = applied.driverId.trim();
  const [resolution, setResolution] = useState<"in_favor" | "rejected" | "partial">("in_favor");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [resolutionAmount, setResolutionAmount] = useState("");
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const disputesQuery = useQuery({
    queryKey: ["driver-finance", "settlement-disputes", companyId, status, effectiveDriverId],
    queryFn: () => listSettlementDisputes(companyId, { status, driver_id: effectiveDriverId || undefined }),
    enabled: Boolean(companyId),
  });

  const selectedDisputeId = selected?.id ?? requestedDisputeId;
  const detailQuery = useQuery({
    queryKey: ["driver-finance", "settlement-disputes", "detail", selectedDisputeId, companyId],
    queryFn: () => getSettlementDispute(selectedDisputeId, companyId),
    enabled: Boolean(selectedDisputeId && companyId),
  });

  function openDispute(row: SettlementDisputeRow | null) {
    const p = new URLSearchParams(searchParams);
    if (row?.id) p.set("dispute_id", row.id);
    else p.delete("dispute_id");
    setSearchParams(p, { replace: true });
    setSelected(row);
  }

  const reviewMutation = useMutation({
    mutationFn: (id: string) => markSettlementDisputeUnderReview(id, { operating_company_id: companyId }),
    onSuccess: async () => {
      pushToast("Dispute marked under review", "success");
      await queryClient.invalidateQueries({ queryKey: ["driver-finance", "settlement-disputes"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Could not mark dispute under review"), "error"),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) =>
      resolveSettlementDispute(id, {
        operating_company_id: companyId,
        resolution,
        resolution_notes: resolutionNotes.trim(),
        resolution_amount_cents:
          resolution === "rejected" ? undefined : Math.max(0, Math.round(Number(resolutionAmount || "0") * 100)) || undefined,
      }),
    onSuccess: async () => {
      pushToast("Dispute resolved", "success");
      openDispute(null);
      setResolution("in_favor");
      setResolutionNotes("");
      setResolutionAmount("");
      await queryClient.invalidateQueries({ queryKey: ["driver-finance", "settlement-disputes"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Could not resolve dispute"), "error"),
  });

  const rows = disputesQuery.data?.disputes ?? [];
  // Empty state renders only once the disputes query settles (never mid-fetch).
  const listState = useListState(disputesQuery, rows.length === 0);
  const detail = detailQuery.data?.dispute ?? selected;
  const openedDaysAgo = useMemo(() => {
    if (!detail?.opened_at) return null;
    const diff = Date.now() - new Date(detail.opened_at).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }, [detail?.opened_at]);

  const resolutionAmountPreviewCents = Math.max(0, Math.round(Number(resolutionAmount || "0") * 100));
  const canResolve =
    Boolean(detail?.id) &&
    resolutionNotes.trim().length >= 20 &&
    (resolution === "rejected" || resolutionAmountPreviewCents > 0);

  const columns = useMemo<ParityColumn<SettlementDisputeRow>[]>(
    () => [
      {
        key: "driver_id",
        label: "Driver Name",
        render: (row) => (
          <EntityLink
            kind="driver"
            id={row.driver_id}
            label={entityLabel(row.driver_name, row.driver_id, "Driver")}
            className="single-line-name"
          />
        ),
      },
      {
        key: "period",
        label: "Settlement Period",
        render: (row) => (
          <span>
            {row.period_start ? formatDateUS(row.period_start) : "—"} to {row.period_end ? formatDateUS(row.period_end) : "—"}
          </span>
        ),
      },
      { key: "dispute_category", label: "Category", render: (row) => row.dispute_category },
      {
        key: "dispute_description",
        label: "Description",
        render: (row) => (
          <span className="max-w-[240px] truncate" title={row.dispute_description}>
            {row.dispute_description}
          </span>
        ),
      },
      {
        key: "disputed_amount_cents",
        label: "Disputed Amount",
        sortable: true,
        render: (row) => money(row.disputed_amount_cents),
      },
      {
        key: "status",
        label: "Status",
        render: (row) => (
          <span className={`rounded-sm px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(row.status)}`}>{row.status}</span>
        ),
      },
      {
        key: "opened_at",
        label: "Opened",
        sortable: true,
        render: (row) => `${Math.max(0, Math.floor((Date.now() - new Date(row.opened_at).getTime()) / 86400000))}d ago`,
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="relative grid gap-2 md:grid-cols-3" data-testid="settlement-disputes-filters">
          <label className="text-xs">
            <div className="mb-1 text-gray-500">Status</div>
            <SelectCombobox
              value={status}
              onChange={(event) => setStatus(event.target.value as "open" | "all")}
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
            >
              <option value="all">All</option>
              <option value="open">Open / Under Review</option>
            </SelectCombobox>
          </label>
          <label className="text-xs">
            <div className="mb-1 text-gray-500">Driver</div>
            <EntityPicker
              kind="driver"
              operatingCompanyId={companyId}
              value={filterDraft.driverId || null}
              onChange={(next) => setDriverId(next ?? "")}
              allowCreate={false}
              placeholder="All drivers"
              className="w-full"
              dataTestId="settlement-disputes-filter-driver"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <Button type="button" size="sm" data-testid="settlement-disputes-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="settlement-disputes-filter-cancel"
              onClick={staged.cancel}
              disabled={!staged.dirty}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="settlement-disputes-filter-reset"
              onClick={() => {
                staged.cancel();
                setApplied(EMPTY_FILTERS);
                patchListSearchParam(EMPTY_FILTERS);
              }}
            >
              Reset
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void disputesQuery.refetch()}>
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {listState.isError ? (
        <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn't load disputes.{" "}
          <button type="button" className="underline" onClick={() => void disputesQuery.refetch()}>
            Retry
          </button>
        </p>
      ) : (
        // ACCT-F3536: always mount ParityTable (Search+Range+gear); raw HTML table had no surface bar.
        <ParityTable<SettlementDisputeRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={listState.isLoading}
          emptyText="No disputes found for current filter."
          storageKey="settlement-disputes"
          exportFilename="settlement-disputes"
          rowActions={(row) => (
            <Button size="sm" variant="secondary" onClick={() => openDispute(row)}>
              Open
            </Button>
          )}
        />
      )}

      {detail ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Dispute Detail</p>
              <p className="text-xs text-gray-500">
                <EntityLink kind="settlement" id={detail.settlement_id} label={entityLabel(detail.settlement_display_id, detail.settlement_id, "Settlement")} /> ·{" "}
                <span
                  title={entityLabel(detail.driver_name, detail.driver_id, "Driver")}
                  className="single-line-name"
                >
                  <EntityLink kind="driver" id={detail.driver_id} label={entityLabel(detail.driver_name, detail.driver_id, "Driver")} />
                </span>
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                openDispute(null);
                setResolution("in_favor");
                setResolutionNotes("");
                setResolutionAmount("");
              }}
            >
              Close
            </Button>
          </div>

          <div className="grid gap-2 text-xs md:grid-cols-2">
            <div className="rounded-sm border border-gray-100 p-2">
              <p className="font-semibold text-gray-700">Dispute</p>
              <p>Category: {titleize(detail.dispute_category)}</p>
              <p>Status: {titleize(detail.status)}</p>
              <p>Opened: {openedDaysAgo ?? "-"} days ago</p>
              <p>Description: {detail.dispute_description}</p>
              {detail.resolution_journal_entry_id ? (
                <p>
                  Resolution JE:{" "}
                  <EntityLink kind="journal_entry" id={detail.resolution_journal_entry_id} label="Open journal entry" />
                </p>
              ) : null}
            </div>
            <div className="rounded-sm border border-gray-100 p-2">
              <p className="font-semibold text-gray-700">Settlement Breakdown</p>
              <p>
                Period: {detail.period_start ? formatDateUS(detail.period_start) : "—"} to{" "}
                {detail.period_end ? formatDateUS(detail.period_end) : "—"}
              </p>
              <p>Gross: {money(Number(detail.gross_pay ?? 0))}</p>
              <p>Deductions: {money(Number(detail.deductions_total ?? 0))}</p>
              <p>Net: {money(Number(detail.net_pay ?? 0))}</p>
            </div>
          </div>

          <div className="mt-3 space-y-2 rounded-sm border border-gray-100 p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Action Panel</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={reviewMutation.isPending || detail.status !== "open"}
                onClick={() => reviewMutation.mutate(detail.id)}
              >
                Review
              </Button>
              <SelectCombobox
                value={resolution}
                onChange={(event) => setResolution(event.target.value as "in_favor" | "rejected" | "partial")}
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="in_favor">Resolve in Favor</option>
                <option value="rejected">Reject</option>
                <option value="partial">Partial</option>
              </SelectCombobox>
              {/* M-1 [HOLD]: dollars-mode; Math.round(resolutionAmount*100)=resolution_amount_cents drives the
                  corrective JE (debit/credit posting) — byte-for-byte, GUARD live-verifies before merge. */}
              <MoneyInput
                valueDollars={resolutionAmount ? Number(resolutionAmount) : null}
                onChangeDollars={(d) => setResolutionAmount(d == null ? "" : String(d))}
                ariaLabel="Adjustment amount (USD)"
                placeholder="Adjustment amount (USD)"
                disabled={resolution === "rejected"}
              />
            </div>
            <textarea
              value={resolutionNotes}
              onChange={(event) => setResolutionNotes(event.target.value)}
              className="min-h-[90px] w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
              placeholder="Resolution notes (minimum 20 chars, required for audit clarity)"
            />

            {resolution === "in_favor" || resolution === "partial" ? (
              <div className="rounded-sm border border-slate-200 bg-slate-100 p-2 text-xs text-slate-700">
                Corrective JE preview: debit and credit entries will be posted for {money(resolutionAmountPreviewCents)}.
              </div>
            ) : null}

            <Button
              size="sm"
              disabled={!canResolve || resolveMutation.isPending || detail.status === "withdrawn"}
              onClick={() => resolveMutation.mutate(detail.id)}
            >
              Resolve
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
