import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDateUS } from "../../lib/formatDate";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createInternalFine, getInternalFines } from "../../api/safety";
import { listInternalFineReasons } from "../../api/catalogs-safety";
import { listDrivers } from "../../api/mdata";
import { listDispatchLoads, type DispatchStatus } from "../../api/dispatch";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { companyToday } from "../../lib/businessDate";
import { useAuth } from "../../auth/useAuth";

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

  // FIX 1 — driver picker: company-scoped listDrivers (DRIVERPROFILE-1 requires operating_company_id;
  // limit 200 so active drivers past the newest 50 are never silently dropped).
  const driversQuery = useQuery({
    queryKey: ["mdata", "drivers", "internal-fine-picker", operatingCompanyId],
    queryFn: () => listDrivers({ operating_company_id: operatingCompanyId, limit: 200 }),
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

  const drivers = driversQuery.data?.drivers ?? [];
  const reasons = reasonsQuery.data?.rows ?? [];
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

  return (
    <div className="space-y-3">
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="grid gap-2 md:grid-cols-6">
          <SelectCombobox
            value={form.driver_uuid}
            onChange={(e) => setForm((v) => ({ ...v, driver_uuid: e.target.value }))}
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="" disabled>
              Search by driver
            </option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.first_name} {d.last_name}
              </option>
            ))}
          </SelectCombobox>
          <SelectCombobox
            value={form.reason_uuid}
            onChange={(e) => setForm((v) => ({ ...v, reason_uuid: e.target.value }))}
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="" disabled>
              Filter by reason
            </option>
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
          <Link to="/lists/safety/internal-fine-reasons" className="text-[11px] text-[#334155] underline">
            Add reason in catalog
          </Link>
        </div>
      </div>
      <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
            <tr>
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-left">Driver</th>
              <th className="px-2 py-1 text-left">Reason</th>
              <th className="px-2 py-1 text-left">Amount</th>
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-left">Liability</th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.fines ?? []).map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="px-2 py-1">{formatDateUS(row.imposed_date)}</td>
                <td className="px-2 py-1">{String(row.driver_id ?? "—")}</td>
                <td className="px-2 py-1">{String(row.reason_code ?? row.reason_name ?? "—")}</td>
                <td className="px-2 py-1">${Number(row.amount ?? 0).toFixed(2)}</td>
                <td className="px-2 py-1">{toStatusLabel(String(row.status ?? "pending"))}</td>
                <td className="px-2 py-1">{String(row.driver_liability_id ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
