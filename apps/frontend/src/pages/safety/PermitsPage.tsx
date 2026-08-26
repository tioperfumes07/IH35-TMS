import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DatePicker } from "../../components/forms/DatePicker";
import { formatDateUS } from "../../lib/formatDate";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveSafetyPermit,
  createSafetyPermit,
  getSafetyPermits,
  restoreSafetyPermit,
  updatePermitRenewalReminder,
  type SafetyPermitType,
} from "../../api/safety";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { userFacingApiError } from "../../lib/api-error-message";

type Props = {
  operatingCompanyId: string;
};

type PermitRow = Record<string, unknown>;

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
  if (severity === "warning") return "bg-slate-100 text-slate-700";
  if (severity === "ok") return "bg-slate-100 text-slate-700";
  return "bg-gray-100 text-gray-700";
}

const emptyDraft = {
  permit_type: "state_operating_authority" as SafetyPermitType,
  permit_number: "",
  issuing_state: "TX",
  holder_name: "",
  issued_date: "",
  expiry_date: "",
  unit_id: "",
  notes: "",
};

export function PermitsPage({ operatingCompanyId }: Props) {
  // SAF-B30 drill-through: EntityLink routes here with ?permit_id=, but nothing read it, so the link
  // navigated and then did nothing — a facade. Same highlight pattern as TransfersListPage
  // (?transfer_id=), which is the in-repo precedent for a table-only surface with no drawer.
  const [searchParams] = useSearchParams();
  const deepLinkPermitId = searchParams.get("permit_id")?.trim() || "";
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

  const renewalAlerts = permitsQuery.isError ? [] : permitsQuery.data?.renewal_alerts ?? [];
  const permits = permitsQuery.isError ? [] : permitsQuery.data?.permits ?? [];
  const reminder = permitsQuery.isError ? undefined : permitsQuery.data?.renewal_reminder;

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
        unit_id: draft.unit_id || null,
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

  // Migrated to the shared QBO-parity grid — columns, order, severity badge, and the per-row
  // Archive/Restore action are preserved verbatim (§7 additive-only).
  const permitColumns: Array<ParityColumn<PermitRow>> = [
    {
      key: "permit_type",
      label: "Type",
      sortable: true,
      render: (row) => PERMIT_TYPE_LABELS[(row.permit_type as SafetyPermitType) ?? "other"] ?? String(row.permit_type ?? ""),
    },
    { key: "permit_number", label: "Number", sortable: true, render: (row) => String(row.permit_number || "—") },
    { key: "issuing_state", label: "State", sortable: true, render: (row) => String(row.issuing_state || "—") },
    { key: "holder_name", label: "Holder", sortable: true, render: (row) => String(row.holder_name || "—") },
    { key: "expiry_date", label: "Expiry", sortable: true, render: (row) => (row.expiry_date ? formatDateUS(row.expiry_date) : "—") },
    {
      key: "renewal_severity",
      label: "Status",
      render: (row) => (
        <span className={`rounded-sm px-1.5 py-0.5 font-semibold ${severityClass(String(row.renewal_severity ?? ""))}`}>
          {row.archived_at ? "Archived" : String(row.renewal_severity ?? "—")}
        </span>
      ),
    },
    {
      key: "action",
      label: "Action",
      render: (row) =>
        row.archived_at ? (
          <button type="button" className="text-slate-700 underline" onClick={() => restoreMutation.mutate(String(row.id))}>
            Restore
          </button>
        ) : (
          <button type="button" className="text-red-700 underline" onClick={() => archiveMutation.mutate(String(row.id))}>
            Archive
          </button>
        ),
    },
  ];

  return (
    <div className="space-y-3" data-testid="permits-page">
      <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs text-slate-600">
        Track operating authority, IFTA, oversize/overweight, and hazmat permits with configurable renewal alerts.
      </div>

      <div
        className="rounded-sm border border-slate-200 bg-slate-50 p-3"
        data-testid="permits-renewal-dashboard"
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase text-slate-700">Renewal alerts</span>
          <span className="text-[10px] text-slate-700">
            Alert window: {String((reminder as { days_before_expiry?: number })?.days_before_expiry ?? 30)} days before expiry
          </span>
          <div className="ml-auto flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={365}
              value={reminderDays}
              onChange={(event) => setReminderDays(event.target.value)}
              className="w-16 rounded-sm border border-slate-300 px-2 py-1 text-xs"
              data-testid="permits-reminder-days-input"
            />
            <button
              type="button"
              className="rounded-sm bg-slate-700 px-2 py-1 text-xs font-semibold text-white"
              disabled={permitsQuery.isError || reminderMutation.isPending}
              onClick={() => reminderMutation.mutate()}
            >
              Save alert window
            </button>
          </div>
        </div>
        {reminderMutation.isError ? (
          <p className="mb-2 text-xs text-red-700" data-testid="permits-reminder-error">
            {userFacingApiError(reminderMutation.error, "Could not save the permit renewal alert window.")}
          </p>
        ) : null}
        {!permitsQuery.isError && (renewalAlerts.length === 0 ? (
          <p className="text-xs text-slate-700">No permits due for renewal within the alert window.</p>
        ) : (
          <ul className="space-y-1">
            {renewalAlerts.map((row) => (
              <li key={String(row.id)} className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                <span className={`rounded-sm px-1.5 py-0.5 font-semibold ${severityClass(String(row.renewal_severity ?? ""))}`}>
                  {String(row.days_to_expiry ?? "—")}d
                </span>
                <span>{PERMIT_TYPE_LABELS[(row.permit_type as SafetyPermitType) ?? "other"] ?? row.permit_type}</span>
                <span>{String(row.holder_name || row.permit_number || "—")}</span>
                <span className="text-slate-700">expires {row.expiry_date ? formatDateUS(row.expiry_date) : "—"}</span>
              </li>
            ))}
          </ul>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-sm bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
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

      {permitsQuery.isError ? (
        <ListErrorState
          title="Couldn't load permits"
          status={0}
          message={(permitsQuery.error as Error)?.message}
          onRetry={() => void permitsQuery.refetch()}
        />
      ) : (
        <ParityTable<PermitRow>
          columns={permitColumns}
          rows={activePermits}
          rowKey={(row) => String(row.id)}
          rowClassName={(row) =>
            deepLinkPermitId && String(row.id) === deepLinkPermitId ? "bg-slate-100 ring-1 ring-slate-400" : ""
          }
          loading={permitsQuery.isLoading}
          emptyText="No permits tracked yet. Use + Create permit to book operating authority and compliance documents."
          storageKey="safety-permits"
          exportFilename="permits"
          tableTestId="permits-table"
        />
      )}

      {(archiveMutation.isError || restoreMutation.isError) ? (
        <p className="text-xs text-red-700" data-testid="permits-archive-restore-error">
          {userFacingApiError(
            archiveMutation.error ?? restoreMutation.error,
            "Could not archive or restore the permit.",
          )}
        </p>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" data-testid="permits-create-modal">
          <div className="w-full max-w-lg rounded-sm border border-gray-200 bg-white p-4 shadow-lg">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Create permit</h3>
            <div className="grid gap-2">
              <label className="text-xs">
                Permit type
                <SelectCombobox
                  value={draft.permit_type}
                  onChange={(event) => setDraft((prev) => ({ ...prev, permit_type: event.target.value as SafetyPermitType }))}
                  className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
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
                  className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
                />
              </label>
              {draft.permit_type === "state_operating_authority" ? (
                <label className="text-xs">
                  Issuing state
                  <SelectCombobox
                    value={draft.issuing_state}
                    onChange={(event) => setDraft((prev) => ({ ...prev, issuing_state: event.target.value }))}
                    className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
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
                  className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="text-xs">
                Unit (optional)
                <div className="mt-1">
                  {/* CREATE chrome: unit owes first-row inline create (picker law), not filter mode. */}
                  <EntityPicker
                    kind="unit"
                    operatingCompanyId={operatingCompanyId}
                    value={draft.unit_id || null}
                    onChange={(next) => setDraft((prev) => ({ ...prev, unit_id: next ?? "" }))}
                    enabled={createOpen && Boolean(operatingCompanyId)}
                    allowCreate
                    placeholder="Company-wide permit"
                    dataField="safety-permit-unit"
                  />
                </div>
              </label>
              <div className="text-xs">
                <label htmlFor="safety-permit-expiry-date">Expiry date</label>
                <DatePicker
                  id="safety-permit-expiry-date"
                  value={draft.expiry_date}
                  onChange={(next) => setDraft((prev) => ({ ...prev, expiry_date: next }))}
                  className="mt-1 w-full"
                />
              </div>
              <label className="text-xs">
                Notes
                <textarea
                  value={draft.notes}
                  onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
                  className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
                  rows={2}
                />
              </label>
            </div>
            <div className="mt-4 flex flex-col items-end gap-2">
              {createMutation.isError ? (
                <p className="w-full text-xs text-red-700" data-testid="permit-create-error">
                  {userFacingApiError(createMutation.error, "Could not create the permit.")}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
              <button type="button" className="rounded-sm border px-3 py-1 text-xs" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded-sm bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
                disabled={!draft.expiry_date || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                Create
              </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
