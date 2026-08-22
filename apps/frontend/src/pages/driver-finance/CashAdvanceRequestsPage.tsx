import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { cashAdvanceRequestsOfficeApi, type CashAdvanceRequestRow } from "../../api/cashAdvanceRequests";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { DriverPickerWithCreate } from "../../components/drivers/DriverPickerWithCreate";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { PageHeader } from "../../components/layout/PageHeader";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { useStagedListFilters } from "../../components/table";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { entityLabel } from "../../lib/entity-label";

const EMPTY_FILTERS = {
  driverId: "",
};

function formatUsdFromCents(cents: unknown) {
  const n = Number(cents ?? 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n / 100);
}

// Maker<>checker (migration 202607380000, I4): a request's reviewer can never be the office user
// who created it. Owner/Administrator requests auto-approve at create (no checker needed, so this
// never fires for their own submissions since they're never left "pending"). For every other role
// this disables Approve for the submitter — the CHECK constraint is the source of truth server-side;
// this is the client-side guard so the maker never even sees an enabled Approve button.
function isMakerOfRequest(row: CashAdvanceRequestRow, currentUserId: string): boolean {
  const submittedBy = String((row as Record<string, unknown>).submitted_by_user_id ?? "");
  return Boolean(submittedBy) && Boolean(currentUserId) && submittedBy === currentUserId;
}

export function CashAdvanceRequestsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  // LINK-F5171/LINK-F5185: settlements:cash_advances reverse — driver's profile can drill into
  // their own pending cash-advance requests.
  // LST-F5175 — visible EntityPicker (URL-only seed is not reverse chrome).
  // LV-DRIVER-FINANCE-CASH-ADVANCE-REQUESTS-FILTER-SILENT-APPLY — stage until Apply; URL on Apply/Reset.
  const [searchParams, setSearchParams] = useSearchParams();
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";
  const requestIdFromUrl = searchParams.get("request_id")?.trim() ?? "";

  function patchListSearchParam(next: { driverId: string }) {
    const nextParams = new URLSearchParams(searchParams);
    if (next.driverId) nextParams.set("driver_id", next.driverId);
    else nextParams.delete("driver_id");
    setSearchParams(nextParams, { replace: true });
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

  const setDriverFilter = (driverId: string) => {
    staged.setDraft((d) => ({ ...d, driverId }));
  };
  const effectiveDriverId = applied.driverId.trim() || undefined;
  const [denyForId, setDenyForId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [approveNotesById, setApproveNotesById] = useState<Record<string, string>>({});
  const [ownerUrlById, setOwnerUrlById] = useState<Record<string, string>>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [newDriverId, setNewDriverId] = useState<string | null>(null);
  const [newAmountCents, setNewAmountCents] = useState<number | null>(null);
  const [newReason, setNewReason] = useState("");

  const role = String(user?.role ?? "");
  const currentUserId = String(user?.uuid ?? "");
  const canEscalateToOwner = ["Owner", "Administrator", "Manager"].includes(role);
  const isOwnerOrAdmin = role === "Owner" || role === "Administrator";

  const createMut = useMutation({
    mutationFn: () => {
      const cents = newAmountCents ?? 0;
      return cashAdvanceRequestsOfficeApi.create(companyId, {
        driver_id: String(newDriverId),
        requested_amount_cents: cents,
        reason: newReason.trim(),
        auto_approve: isOwnerOrAdmin,
      });
    },
    onSuccess: () => {
      pushToast(isOwnerOrAdmin ? "Cash advance created and self-approved" : "Request submitted — awaiting a different approver", "success");
      setCreateOpen(false);
      setNewDriverId(null);
      setNewAmountCents(null);
      setNewReason("");
      void qc.invalidateQueries({ queryKey: ["driver-finance", "cash-advance-requests"] });
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Create failed", "error"),
  });

  const canCreate = Boolean(newDriverId) && (newAmountCents ?? 0) > 0 && newReason.trim().length >= 10;

  const pendingQuery = useQuery({
    queryKey: ["driver-finance", "cash-advance-requests", "pending", companyId, effectiveDriverId],
    queryFn: () => cashAdvanceRequestsOfficeApi.listPending(companyId, effectiveDriverId),
    enabled: Boolean(companyId),
  });
  const exactRequestQuery = useQuery({
    queryKey: ["driver-finance", "cash-advance-requests", "exact", companyId, requestIdFromUrl],
    queryFn: () => cashAdvanceRequestsOfficeApi.get(companyId, requestIdFromUrl),
    enabled: Boolean(companyId && requestIdFromUrl),
  });

  const approveMut = useMutation({
    mutationFn: async (row: CashAdvanceRequestRow) => {
      const id = String(row.id ?? "");
      const notes = approveNotesById[id]?.trim();
      return cashAdvanceRequestsOfficeApi.approve(companyId, id, {
        approval_notes: notes || undefined,
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["driver-finance", "cash-advance-requests", companyId] }),
  });

  const denyMut = useMutation({
    mutationFn: async () => {
      if (!denyForId) throw new Error("missing");
      return cashAdvanceRequestsOfficeApi.deny(companyId, denyForId, { denial_reason: denyReason.trim() });
    },
    onSuccess: () => {
      setDenyForId(null);
      setDenyReason("");
      void qc.invalidateQueries({ queryKey: ["driver-finance", "cash-advance-requests", companyId] });
    },
  });

  const escalateMut = useMutation({
    mutationFn: async (row: CashAdvanceRequestRow) => {
      const id = String(row.id ?? "");
      return cashAdvanceRequestsOfficeApi.escalate(companyId, id);
    },
    onSuccess: (res, row) => {
      const id = String(row.id ?? "");
      if (res.owner_approval_url) setOwnerUrlById((prev) => ({ ...prev, [id]: res.owner_approval_url }));
      void qc.invalidateQueries({ queryKey: ["driver-finance", "cash-advance-requests", companyId] });
      void qc.invalidateQueries({ queryKey: ["home", "owner-cash-advance-pending", companyId] });
    },
  });

  const rows = useMemo(() => {
    const pending = pendingQuery.data?.requests ?? [];
    const exact = exactRequestQuery.data?.request;
    if (!exact || !requestIdFromUrl) return pending;
    const exactId = String(exact.id ?? "");
    return pending.some((row) => String(row.id ?? "") === exactId) ? pending : [exact, ...pending];
  }, [pendingQuery.data?.requests, exactRequestQuery.data?.request, requestIdFromUrl]);
  const busyId = approveMut.variables ? String((approveMut.variables as CashAdvanceRequestRow).id ?? "") : "";
  const escalateBusyId = escalateMut.variables ? String((escalateMut.variables as CashAdvanceRequestRow).id ?? "") : "";

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const ap = a.is_above_policy ? 1 : 0;
        const bp = b.is_above_policy ? 1 : 0;
        if (ap !== bp) return ap - bp;
        return String(a.submitted_at ?? "").localeCompare(String(b.submitted_at ?? ""));
      }),
    [rows]
  );

  const columns = useMemo<ParityColumn<CashAdvanceRequestRow>[]>(
    () => [
      {
        key: "display_id",
        label: "Request",
        sortable: true,
        render: (row) => <span className="font-mono text-xs">{String(row.display_id ?? "")}</span>,
      },
      {
        key: "driver_id",
        label: "Driver",
        render: (row) => {
          const v = String(row.driver_name ?? "");
          const driverId = String(row.driver_id ?? "");
          return (
            <EntityLink
              kind="driver"
              id={driverId}
              label={entityLabel(v, driverId, "Driver")}
              className="single-line-name"
            />
          );
        },
      },
      {
        key: "requested_amount_cents",
        label: "Amount",
        sortable: true,
        render: (row) => formatUsdFromCents(row.requested_amount_cents),
      },
      {
        key: "policy",
        label: "Policy",
        render: (row) => {
          const id = String(row.id ?? "");
          const above = Boolean(row.is_above_policy);
          const waitingOwner =
            Boolean(row.owner_approval_required) && Boolean(row.owner_approval_token_expires_at);
          const ownerUrl = ownerUrlById[id] ?? "";
          if (waitingOwner) {
            return (
              <div className="space-y-1">
                <span className="inline-flex rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  Pending Owner Approval
                </span>
                {ownerUrl ? (
                  <div>
                    <div className="text-[10px] uppercase text-gray-500">Owner link (copy)</div>
                    <input
                      readOnly
                      className="mt-0.5 w-full max-w-xs rounded-sm border border-gray-200 px-1 py-0.5 font-mono text-[10px]"
                      value={ownerUrl}
                      onFocus={(e) => e.target.select()}
                    />
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-500">Link was emailed to Owners. Re-escalate to mint a fresh link.</p>
                )}
              </div>
            );
          }
          if (above) {
            return <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs text-slate-900">Above policy</span>;
          }
          return <span className="text-xs text-gray-500">Within policy</span>;
        },
      },
      {
        key: "submitted_at",
        label: "Submitted",
        sortable: true,
        render: (row) => (
          <span className="text-xs text-gray-600">{String(row.submitted_at ?? "").replace("T", " ").slice(0, 19)}</span>
        ),
      },
      {
        key: "approval_notes",
        label: "Notes",
        render: (row) => {
          const id = String(row.id ?? "");
          return (
            <input
              className="w-40 max-w-full rounded-sm border border-gray-200 px-2 py-1 text-xs"
              placeholder="Approval notes"
              value={approveNotesById[id] ?? ""}
              onChange={(e) => setApproveNotesById((prev) => ({ ...prev, [id]: e.target.value }))}
            />
          );
        },
      },
    ],
    [approveNotesById, ownerUrlById],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cash advance requests"
        subtitle={
          effectiveDriverId
            ? "This driver's own pending requests"
            : "Driver-submitted + office-created requests pending action"
        }
        actions={
          companyId ? (
            <Button onClick={() => setCreateOpen((v) => !v)}>{createOpen ? "Cancel" : "+ Create"}</Button>
          ) : null
        }
      />

      {companyId ? (
        <div className="relative flex flex-wrap items-end gap-3" data-testid="cash-advance-requests-filters">
          <label className="text-[11px] text-slate-600">
            Driver
            <EntityPicker
              kind="driver"
              operatingCompanyId={companyId}
              value={filterDraft.driverId || null}
              onChange={(next) => setDriverFilter(next ?? "")}
              allowCreate={false}
              placeholder="All drivers"
              className="mt-1"
              dataTestId="cash-advance-requests-filter-driver"
            />
          </label>
          <Button type="button" size="sm" data-testid="cash-advance-requests-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
            Apply
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="cash-advance-requests-filter-cancel"
            onClick={staged.cancel}
            disabled={!staged.dirty}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="cash-advance-requests-filter-reset"
            onClick={() => {
              staged.cancel();
              setApplied(EMPTY_FILTERS);
              patchListSearchParam(EMPTY_FILTERS);
            }}
          >
            Reset
          </Button>
        </div>
      ) : null}

      {createOpen ? (
        <div className="space-y-3 border-t border-gray-200 pt-3">
          <p className="text-xs text-gray-600">
            {isOwnerOrAdmin
              ? "As Owner/Administrator you can self-approve on create — no separate approver needed."
              : "Your request will be created pending — a different Admin, Accountant, or Owner must approve it (maker ≠ checker)."}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              {/* Nested +Create via DriverPickerWithCreate (Blueprint 4.2.2.1 / CreateAdvance parity). */}
              <span className="text-xs font-medium text-gray-600">Driver *</span>
              <div className="mt-1">
                <DriverPickerWithCreate
                  operatingCompanyId={companyId}
                  value={newDriverId}
                  onChange={setNewDriverId}
                  placeholder="Search driver…"
                  allowClear
                />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Amount (USD) *</span>
              <MoneyInput
                className="mt-1 h-10 w-full"
                valueCents={newAmountCents}
                onChangeCents={setNewAmountCents}
                ariaLabel="Cash advance amount"
              />
            </label>
            <label className="block md:col-span-1">
              <span className="text-xs font-medium text-gray-600">Reason * (min 10 chars)</span>
              <input
                className="mt-1 h-10 w-full rounded-sm border border-gray-300 px-2 text-sm"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="e.g. Border crossing fee for load SB-1042"
                aria-label="Cash advance reason"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <Button disabled={!canCreate || createMut.isPending} loading={createMut.isPending} onClick={() => createMut.mutate()}>
              {isOwnerOrAdmin ? "Create & self-approve" : "Create request"}
            </Button>
          </div>
        </div>
      ) : null}

      {!companyId ? (
        <p className="text-sm text-gray-600">Select an operating company to view requests.</p>
      ) : pendingQuery.isError ? (
        <p className="text-sm text-red-600">Could not load requests.</p>
      ) : (
        // ACCT-F3532: always mount ParityTable (Search+Range+gear); raw HTML table had no surface bar.
        <ParityTable<CashAdvanceRequestRow>
          columns={columns}
          rows={sorted}
          rowKey={(row) => String(row.id ?? "")}
          loading={pendingQuery.isLoading}
          emptyText="No pending requests."
          storageKey="cash-advance-requests"
          exportFilename="cash-advance-requests"
          rowClassName={(row) =>
            requestIdFromUrl && String(row.id ?? "") === requestIdFromUrl
              ? "bg-slate-100 ring-1 ring-slate-400"
              : ""
          }
          rowActions={(row) => {
            const id = String(row.id ?? "");
            const above = Boolean(row.is_above_policy);
            const waitingOwner =
              Boolean(row.owner_approval_required) && Boolean(row.owner_approval_token_expires_at);
            const isMaker = isMakerOfRequest(row, currentUserId);
            return (
              <div className="space-y-1 whitespace-nowrap">
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    size="sm"
                    disabled={above || isMaker || approveMut.isPending}
                    onClick={() => approveMut.mutate(row)}
                    className={busyId === id ? "opacity-70" : ""}
                    title={isMaker ? "You submitted this request — a different approver is required (maker ≠ checker)." : undefined}
                  >
                    Approve
                  </Button>
                  {above && canEscalateToOwner ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={escalateMut.isPending}
                      onClick={() => escalateMut.mutate(row)}
                      className={escalateBusyId === id ? "opacity-70" : ""}
                    >
                      {waitingOwner ? "Re-send Owner link" : "Escalate to Owner"}
                    </Button>
                  ) : null}
                  <Button size="sm" variant="secondary" onClick={() => setDenyForId(id)}>
                    Deny
                  </Button>
                </div>
                {isMaker ? (
                  <div className="text-right text-[10px] text-slate-700">You submitted this — needs a different approver.</div>
                ) : null}
              </div>
            );
          }}
        />
      )}

      {approveMut.isError ? (
        <p className="text-sm text-red-600">Approve failed — check console or try again.</p>
      ) : null}
      {denyMut.isError ? <p className="text-sm text-red-600">Deny failed.</p> : null}
      {escalateMut.isError ? <p className="text-sm text-red-600">Escalate failed.</p> : null}

      {denyForId ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h2 className="text-base font-semibold text-gray-900">Deny request</h2>
            <p className="mt-1 text-sm text-gray-600">Reason is visible to audit and helps the driver understand the decision.</p>
            <textarea
              className="mt-3 w-full rounded-sm border border-gray-200 p-2 text-sm"
              rows={4}
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Denial reason (required)"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setDenyForId(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={denyReason.trim().length < 1 || denyMut.isPending}
                onClick={() => void denyMut.mutate()}
              >
                Confirm deny
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
