import { useMemo, useState } from "react";
import { formatDateUS } from "../../lib/formatDate";
import { EntityLink } from "../../components/shared/EntityLink";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createInternalFine, disputeInternalFine, getInternalFines, voidInternalFine } from "../../api/safety";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { listInternalFineReasons, createInternalFineReason } from "../../api/catalogs-safety";
import { Modal } from "../../components/Modal";
import { listDispatchLoads, type DispatchStatus } from "../../api/dispatch";
import { DriverPickerWithCreate } from "../../components/drivers/DriverPickerWithCreate";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { companyToday } from "../../lib/businessDate";
import { useAuth } from "../../auth/useAuth";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

type InternalFineRow = Record<string, unknown>;

type Props = {
  operatingCompanyId: string;
};

// FD1: related-load picker lists every load regardless of lifecycle state (a fine can reference any load).
const ALL_DISPATCH_STATUSES: DispatchStatus[] = [
  "unassigned",
  "assigned_not_dispatched",
  "dispatched",
  "in_transit",
  "delivered_pending_docs",
  "completed_docs_received",
  "cancelled",
  "abandoned",
  "driver_walkoff",
  "driver_no_show",
];

export function InternalFinesPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // SAF-F12: which fine a lifecycle action is open for, and which action.
  const [lifecycleTarget, setLifecycleTarget] = useState<{ row: InternalFineRow; action: "dispute" | "void" } | null>(null);
  const [form, setForm] = useState({
    driver_uuid: "",
    reason_uuid: "",
    related_load_uuid: "",
    amount: 25,
    imposed_date: companyToday(),
    status: "pending",
    notes: "",
  });

  const query = useQuery({
    queryKey: ["safety", "internal-fines", operatingCompanyId],
    queryFn: () => getInternalFines(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  // FIX 1 — reason picker: owner-managed internal-fine-reasons catalog (active only).
  const reasonsQuery = useQuery({
    queryKey: ["catalogs", "safety", "internal-fine-reasons", "picker", operatingCompanyId],
    queryFn: () => listInternalFineReasons(operatingCompanyId, { is_active: "true", limit: 200 }),
    enabled: Boolean(operatingCompanyId),
  });

  // FIX 1 — optional related-load picker (same list source as the dispatch board).
  const loadsQuery = useQuery({
    queryKey: ["dispatch", "loads", "internal-fine-picker", operatingCompanyId],
    queryFn: () =>
      listDispatchLoads({
        operating_company_id: operatingCompanyId,
        view: "loads",
        limit: 200,
        offset: 0,
        status: ALL_DISPATCH_STATUSES,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const reasons = reasonsQuery.data?.rows ?? [];

  // SAF-F24: inline "+ Add new reason" — Law §4 requires the create affordance INSIDE the dropdown
  // (was an external <Link> to /lists), opening a mini-create without leaving the page. On success the
  // catalog refetches and the new reason is auto-selected.
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [newReason, setNewReason] = useState({ reason_code: "", reason_name: "", default_amount: 0 });
  const createReasonMutation = useMutation({
    mutationFn: () =>
      createInternalFineReason(operatingCompanyId, {
        reason_code: newReason.reason_code.trim(),
        reason_name: newReason.reason_name.trim(),
        default_amount: newReason.default_amount,
        is_active: true,
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["catalogs", "safety", "internal-fine-reasons", "picker", operatingCompanyId] });
      setForm((v) => ({ ...v, reason_uuid: String(created.id) }));
      setReasonModalOpen(false);
      setNewReason({ reason_code: "", reason_name: "", default_amount: 0 });
    },
  });
  const ADD_REASON_SENTINEL = "__add_reason__";
  const loads = loadsQuery.data?.loads ?? [];

  const createMutation = useMutation({
    mutationFn: () => {
      // Build a clean payload: omit optional UUIDs when empty (backend zod rejects "" for uuid fields).
      // Amount stays a DOLLAR number — the backend does Math.round(amount*100) for the liability itself.
      const approverUuid = form.status === "approved" ? user?.uuid ?? undefined : undefined;
      const body: Record<string, unknown> = {
        driver_uuid: form.driver_uuid,
        reason_uuid: form.reason_uuid,
        amount: form.amount,
        imposed_date: form.imposed_date,
        status: form.status,
      };
      if (form.related_load_uuid) body.related_load_uuid = form.related_load_uuid;
      if (approverUuid) body.approved_by_user_uuid = approverUuid;
      if (form.notes.trim()) body.notes = form.notes.trim();
      return createInternalFine(operatingCompanyId, body);
    },
    onSuccess: async () => {
      setForm((prev) => ({ ...prev, notes: "", related_load_uuid: "" }));
      await queryClient.invalidateQueries({ queryKey: ["safety", "internal-fines", operatingCompanyId] });
    },
  });

  const missing = useMemo(() => {
    const parts: string[] = [];
    if (!form.driver_uuid) parts.push("a driver");
    if (!form.reason_uuid) parts.push("a reason");
    return parts;
  }, [form.driver_uuid, form.reason_uuid]);

  const canCreate = missing.length === 0 && !createMutation.isPending;
  const approverName = user?.email ?? user?.uuid ?? null;
  // SAF-F12 role gates mirror the server: dispute = Owner/Administrator/Safety, void = Owner/Administrator.
  const canDispute = user?.role === "Owner" || user?.role === "Administrator" || user?.role === "Safety";
  const canVoid = user?.role === "Owner" || user?.role === "Administrator";

  // Migrated to the shared QBO-parity grid — columns and order are preserved verbatim (§7 additive-only).
  const columns: Array<ParityColumn<InternalFineRow>> = [
    { key: "imposed_date", label: "Date", sortable: true, render: (row) => formatDateUS(row.imposed_date) },
    { key: "driver_id", label: "Driver", render: (row) => <EntityLink kind="driver" id={row.driver_id as string | undefined} /> },
    { key: "reason_code", label: "Reason", render: (row) => String(row.reason_code ?? row.reason_name ?? "—") },
    { key: "amount", label: "Amount", render: (row) => `$${Number(row.amount ?? 0).toFixed(2)}` },
    { key: "status", label: "Status", sortable: true, render: (row) => toStatusLabel(String(row.status ?? "pending")) },
    {
      key: "driver_liability_id",
      label: "Liability",
      render: (row) =>
        row.driver_liability_id ? (
          <EntityLink kind="liability" id={String(row.driver_liability_id)} label={String(row.driver_liability_id).slice(0, 8)} />
        ) : (
          "—"
        ),
    },
    {
      // SAF-F12: the page had NO row action at all, so a fine imposed on a driver could never be
      // disputed or voided even though the schema has always accepted both states. Void is
      // Owner/Administrator-only (governance: void is reason-required and role-gated); dispute is
      // open to the safety desk. A fine already converted to a liability is refused by the server
      // and the error names the dependent liability — never a silent cascade.
      key: "actions",
      label: "Actions",
      render: (row) => {
        const isVoided = Boolean(row.voided_at) || String(row.status ?? "") === "voided";
        const isConverted = Boolean(row.driver_liability_id) || String(row.status ?? "") === "converted_to_liability";
        if (isVoided) return <span className="text-slate-400">Voided</span>;
        return (
          <div className="flex items-center gap-2">
            {canDispute && !isConverted ? (
              <button
                type="button"
                className="text-[#1f2a44] underline"
                data-testid={`internal-fine-dispute-${String(row.id ?? "")}`}
                onClick={() => setLifecycleTarget({ row, action: "dispute" })}
              >
                Dispute
              </button>
            ) : null}
            {canVoid && !isConverted ? (
              <button
                type="button"
                className="text-[#dc2626] underline"
                data-testid={`internal-fine-void-${String(row.id ?? "")}`}
                onClick={() => setLifecycleTarget({ row, action: "void" })}
              >
                Void
              </button>
            ) : null}
            {isConverted ? <span className="text-slate-400">Converted — reverse the liability first</span> : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="grid gap-2 md:grid-cols-6">
          <DriverPickerWithCreate
            operatingCompanyId={operatingCompanyId}
            value={form.driver_uuid || null}
            onChange={(next) => setForm((v) => ({ ...v, driver_uuid: next ?? "" }))}
            placeholder="Search by driver"
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          />
          <SelectCombobox
            value={form.reason_uuid}
            onChange={(e) => {
              // SAF-F24: the sentinel opens the mini-create instead of selecting a reason.
              if (e.target.value === ADD_REASON_SENTINEL) {
                setReasonModalOpen(true);
                return;
              }
              setForm((v) => ({ ...v, reason_uuid: e.target.value }));
            }}
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
            data-testid="internal-fine-reason-picker"
          >
            <option value="" disabled>
              Select a reason
            </option>
            {/* Law §4: inline "+ Add new" as the first row inside the dropdown. */}
            <option value={ADD_REASON_SENTINEL}>+ Add new reason…</option>
            {reasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.reason_name}
              </option>
            ))}
          </SelectCombobox>
          {/* M-1 (GUARD inline FAIL): this is the inline-create fine AMOUNT (sent to createInternalFine as
              dollars; display is $row.amount.toFixed(2)). dollars-mode MoneyInput; amount stays a DOLLAR
              number, byte-for-byte (the backend does Math.round(amount*100) for the liability). */}
          <MoneyInput valueDollars={form.amount || null} onChangeDollars={(d) => setForm((v) => ({ ...v, amount: d ?? 0 }))} ariaLabel="Fine amount (USD)" placeholder="Amount (USD)" />
          <DatePicker value={form.imposed_date} onChange={(next) => setForm((v) => ({ ...v, imposed_date: next }))} className="rounded-sm border border-gray-300 px-2 py-1 text-xs" />
          <SelectCombobox value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value }))} className="rounded-sm border border-gray-300 px-2 py-1 text-xs">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
          </SelectCombobox>
          <SelectCombobox
            value={form.related_load_uuid}
            onChange={(e) => setForm((v) => ({ ...v, related_load_uuid: e.target.value }))}
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="" disabled>
              Related load (optional)
            </option>
            {loads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.load_number}
              </option>
            ))}
          </SelectCombobox>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-sm bg-[#1F2A44] px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canCreate}
            title={missing.length > 0 ? "Select a driver and a reason" : undefined}
            onClick={() => canCreate && createMutation.mutate()}
          >
            + Create Internal Fine
          </button>
          {/* FIX 2 — no silent dead control: explain WHY the button is disabled. */}
          {missing.length > 0 ? (
            <span className="text-[11px] text-gray-500">Select a driver and a reason to create the fine.</span>
          ) : null}
          {/* FIX 3 (frontend) — approver transparency: approving instantly creates a driver liability. */}
          {form.status === "approved" && approverName ? (
            <span className="text-[11px] text-gray-600">Approving as {approverName} — creates a recoverable driver liability on save.</span>
          ) : null}
          {/* SAF-F24: the external "Add reason in catalog" Link is removed — reason creation is now the
              inline "+ Add new reason…" row inside the picker (Law §4). */}
        </div>
      </div>

      <Modal open={reasonModalOpen} onClose={() => setReasonModalOpen(false)} title="New internal-fine reason">
        <div className="space-y-2 text-xs" data-testid="internal-fine-reason-create-modal">
          <label className="block">
            <span className="text-slate-600">Reason code</span>
            <input
              className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
              value={newReason.reason_code}
              onChange={(e) => setNewReason((v) => ({ ...v, reason_code: e.target.value }))}
              placeholder="e.g. LATE_BOL"
            />
          </label>
          <label className="block">
            <span className="text-slate-600">Reason name</span>
            <input
              className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
              value={newReason.reason_name}
              onChange={(e) => setNewReason((v) => ({ ...v, reason_name: e.target.value }))}
              placeholder="e.g. Late BOL submission"
            />
          </label>
          <label className="block">
            <span className="text-slate-600">Default amount (USD)</span>
            <MoneyInput
              valueDollars={newReason.default_amount || null}
              onChangeDollars={(d) => setNewReason((v) => ({ ...v, default_amount: d ?? 0 }))}
              ariaLabel="Default amount (USD)"
              placeholder="0.00"
            />
          </label>
          {createReasonMutation.isError ? (
            <p className="text-[11px] text-red-600">{(createReasonMutation.error as Error)?.message ?? "Could not create the reason."}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="rounded-sm border border-gray-300 px-3 py-1" onClick={() => setReasonModalOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded-sm bg-[#1F2A44] px-3 py-1 font-semibold text-white disabled:opacity-50"
              disabled={!newReason.reason_code.trim() || !newReason.reason_name.trim() || createReasonMutation.isPending}
              onClick={() => createReasonMutation.mutate()}
            >
              {createReasonMutation.isPending ? "Adding…" : "Add reason"}
            </button>
          </div>
        </div>
      </Modal>

      <ParityTable<InternalFineRow>
        columns={columns}
        rows={query.data?.fines ?? []}
        rowKey={(row) => String(row.id)}
        loading={query.isLoading}
        emptyText="No internal fines found."
        storageKey="safety-internal-fines"
        exportFilename="internal-fines"
      />

      {/* SAF-F12: reason-required lifecycle shell, reused from the accounting void contract.
          postsReversingEntry={false} — a safety fine void posts no GL entry; claiming it would be a lie. */}
      <VoidReasonModal
        open={Boolean(lifecycleTarget)}
        title={lifecycleTarget?.action === "void" ? "Void Internal Fine" : "Dispute Internal Fine"}
        entityRef={
          lifecycleTarget
            ? `${String(lifecycleTarget.row.reason_code ?? lifecycleTarget.row.reason_name ?? "Internal fine")} · $${Number(
                lifecycleTarget.row.amount ?? 0
              ).toFixed(2)} · ${formatDateUS(lifecycleTarget.row.imposed_date)}`
            : undefined
        }
        minLength={3}
        postsReversingEntry={false}
        onClose={() => setLifecycleTarget(null)}
        onSubmit={async (reason) => {
          if (!lifecycleTarget) return;
          const id = String(lifecycleTarget.row.id ?? "");
          if (lifecycleTarget.action === "void") {
            await voidInternalFine(id, operatingCompanyId, reason);
          } else {
            await disputeInternalFine(id, operatingCompanyId, reason);
          }
          await queryClient.invalidateQueries({ queryKey: ["safety", "internal-fines", operatingCompanyId] });
          setLifecycleTarget(null);
        }}
      />
    </div>
  );
}

function toStatusLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "pending") return "Pending";
  if (normalized === "approved") return "Approved";
  if (normalized === "denied") return "Denied";
  if (normalized === "paid") return "Paid";
  if (normalized === "disputed") return "Disputed";
  if (normalized === "converted_to_liability") return "Converted to Liability";
  if (normalized === "voided") return "Voided";
  return value || "Pending";
}
