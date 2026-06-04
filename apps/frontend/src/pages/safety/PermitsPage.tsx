import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveSafetyPermit,
  createSafetyPermit,
  getSafetyPermits,
  restoreSafetyPermit,
  updatePermitRenewalReminder,
  type SafetyPermitType,
} from "../../api/safety";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

type Props = {
  operatingCompanyId: string;
};

const PERMIT_TYPE_LABELS: Record<SafetyPermitType, string> = {
  state_operating_authority: "State operating authority",
  ifta_sticker: "IFTA sticker",
  oversize_overweight: "Oversize / overweight",
  hazmat: "Hazmat",
  other: "Other",
};

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

function severityClass(severity: string) {
  if (severity === "expired") return "bg-red-100 text-red-800";
  if (severity === "warning") return "bg-amber-100 text-amber-800";
  if (severity === "ok") return "bg-green-100 text-green-800";
  return "bg-gray-100 text-gray-700";
}

const emptyDraft = {
  permit_type: "state_operating_authority" as SafetyPermitType,
  permit_number: "",
  issuing_state: "TX",
  holder_name: "",
  issued_date: "",
  expiry_date: "",
  notes: "",
};

export function PermitsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [reminderDays, setReminderDays] = useState("30");
  const [showArchived, setShowArchived] = useState(false);

  const permitsQuery = useQuery({
    queryKey: ["safety", "permits", operatingCompanyId, showArchived],
    queryFn: () => getSafetyPermits(operatingCompanyId, { include_archived: showArchived }),
    enabled: Boolean(operatingCompanyId),
  });

  const renewalAlerts = permitsQuery.data?.renewal_alerts ?? [];
  const permits = permitsQuery.data?.permits ?? [];
  const reminder = permitsQuery.data?.renewal_reminder;

  const activePermits = useMemo(
    () => permits.filter((row) => !row.archived_at),
    [permits]
  );

  const createMutation = useMutation({
    mutationFn: () =>
      createSafetyPermit(operatingCompanyId, {
        operating_company_id: operatingCompanyId,
        permit_type: draft.permit_type,
        permit_number: draft.permit_number,
        issuing_state: draft.permit_type === "state_operating_authority" ? draft.issuing_state : null,
        holder_name: draft.holder_name,
        issued_date: draft.issued_date || null,
        expiry_date: draft.expiry_date,
        notes: draft.notes || null,
      }),
    onSuccess: async () => {
      setCreateOpen(false);
      setDraft(emptyDraft);
      await queryClient.invalidateQueries({ queryKey: ["safety", "permits", operatingCompanyId] });
    },
  });

  const reminderMutation = useMutation({
    mutationFn: () =>
      updatePermitRenewalReminder(operatingCompanyId, {
        days_before_expiry: Number(reminderDays),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety", "permits", operatingCompanyId] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveSafetyPermit(id, operatingCompanyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety", "permits", operatingCompanyId] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreSafetyPermit(id, operatingCompanyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety", "permits", operatingCompanyId] });
    },
  });

  return (
    <div className="space-y-3" data-testid="permits-page">
      <div className="rounded border border-gray-200 bg-white p-3 text-xs text-slate-600">
        Track operating authority, IFTA, oversize/overweight, and hazmat permits with configurable renewal alerts.
      </div>

      <div
        className="rounded border border-amber-200 bg-amber-50 p-3"
        data-testid="permits-renewal-dashboard"
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase text-amber-900">Renewal alerts</span>
          <span className="text-[10px] text-amber-800">
            Alert window: {String((reminder as { days_before_expiry?: number })?.days_before_expiry ?? 30)} days before expiry
          </span>
          <div className="ml-auto flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={365}
              value={reminderDays}
              onChange={(event) => setReminderDays(event.target.value)}
              className="w-16 rounded border border-amber-300 px-2 py-1 text-xs"
              data-testid="permits-reminder-days-input"
            />
            <button
              type="button"
              className="rounded bg-amber-800 px-2 py-1 text-xs font-semibold text-white"
              disabled={reminderMutation.isPending}
              onClick={() => reminderMutation.mutate()}
            >
              Save alert window
            </button>
          </div>
        </div>
        {renewalAlerts.length === 0 ? (
          <p className="text-xs text-amber-800">No permits due for renewal within the alert window.</p>
        ) : (
          <ul className="space-y-1">
            {renewalAlerts.map((row) => (
              <li key={String(row.id)} className="flex flex-wrap items-center gap-2 text-xs text-amber-900">
                <span className={`rounded px-1.5 py-0.5 font-semibold ${severityClass(String(row.renewal_severity ?? ""))}`}>
                  {String(row.days_to_expiry ?? "—")}d
                </span>
                <span>{PERMIT_TYPE_LABELS[(row.permit_type as SafetyPermitType) ?? "other"] ?? row.permit_type}</span>
                <span>{String(row.holder_name || row.permit_number || "—")}</span>
                <span className="text-amber-700">expires {String(row.expiry_date ?? "—")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
          data-testid="permits-create-btn"
          onClick={() => setCreateOpen(true)}
        >
          + Create permit
        </button>
        <label className="ml-auto flex items-center gap-1 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-[980px] w-full text-left text-xs" data-testid="permits-table">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
            <tr>
              <th className="px-2 py-1">Type</th>
              <th className="px-2 py-1">Number</th>
              <th className="px-2 py-1">State</th>
              <th className="px-2 py-1">Holder</th>
              <th className="px-2 py-1">Expiry</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {activePermits.map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="px-2 py-1">
                  {PERMIT_TYPE_LABELS[(row.permit_type as SafetyPermitType) ?? "other"] ?? row.permit_type}
                </td>
                <td className="px-2 py-1">{String(row.permit_number || "—")}</td>
                <td className="px-2 py-1">{String(row.issuing_state || "—")}</td>
                <td className="px-2 py-1">{String(row.holder_name || "—")}</td>
                <td className="px-2 py-1">{String(row.expiry_date ?? "—")}</td>
                <td className="px-2 py-1">
                  <span className={`rounded px-1.5 py-0.5 font-semibold ${severityClass(String(row.renewal_severity ?? ""))}`}>
                    {row.archived_at ? "Archived" : String(row.renewal_severity ?? "—")}
                  </span>
                </td>
                <td className="px-2 py-1">
                  {row.archived_at ? (
                    <button
                      type="button"
                      className="text-blue-700 underline"
                      onClick={() => restoreMutation.mutate(String(row.id))}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="text-red-700 underline"
                      onClick={() => archiveMutation.mutate(String(row.id))}
                    >
                      Archive
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {activePermits.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-3 text-center text-gray-500">
                  No permits tracked yet. Use + Create permit to book operating authority and compliance documents.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" data-testid="permits-create-modal">
          <div className="w-full max-w-lg rounded border border-gray-200 bg-white p-4 shadow-lg">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Create permit</h3>
            <div className="grid gap-2">
              <label className="text-xs">
                Permit type
                <SelectCombobox
                  value={draft.permit_type}
                  onChange={(event) => setDraft((prev) => ({ ...prev, permit_type: event.target.value as SafetyPermitType }))}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                >
                  {Object.entries(PERMIT_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </SelectCombobox>
              </label>
              <label className="text-xs">
                Permit number
                <input
                  value={draft.permit_number}
                  onChange={(event) => setDraft((prev) => ({ ...prev, permit_number: event.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                />
              </label>
              {draft.permit_type === "state_operating_authority" ? (
                <label className="text-xs">
                  Issuing state
                  <SelectCombobox
                    value={draft.issuing_state}
                    onChange={(event) => setDraft((prev) => ({ ...prev, issuing_state: event.target.value }))}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                  >
                    {US_STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </SelectCombobox>
                </label>
              ) : null}
              <label className="text-xs">
                Holder name
                <input
                  value={draft.holder_name}
                  onChange={(event) => setDraft((prev) => ({ ...prev, holder_name: event.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="text-xs">
                Expiry date
                <input
                  type="date"
                  value={draft.expiry_date}
                  onChange={(event) => setDraft((prev) => ({ ...prev, expiry_date: event.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="text-xs">
                Notes
                <textarea
                  value={draft.notes}
                  onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                  rows={2}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded border px-3 py-1 text-xs" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
                disabled={!draft.expiry_date || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
