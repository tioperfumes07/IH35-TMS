import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMaintenancePmSchedule,
  generateMaintenancePmWorkOrder,
  listMaintenancePmSchedules,
  type PmScheduleRow,
} from "../../../api/maintenance";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { userFacingApiError } from "../../../lib/api-error-message";
import { ListErrorState } from "../../../components/ListErrorState";
import { useSearchParams } from "react-router-dom";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const PM_TYPE_OPTIONS = [
  { value: "oil", label: "Oil" },
  { value: "tires", label: "Tires" },
  { value: "dot_inspection", label: "DOT inspection" },
  { value: "brake", label: "Brake" },
  { value: "transmission", label: "Transmission" },
  { value: "coolant", label: "Coolant" },
  { value: "other", label: "Other" },
] as const;

const INTERVAL_KIND_OPTIONS = [
  { value: "miles", label: "Miles" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
] as const;

type IntervalKind = (typeof INTERVAL_KIND_OPTIONS)[number]["value"];

type CreateDraft = {
  unit_id: string;
  pm_type: string;
  interval_kind: IntervalKind;
  interval_value: string;
};

const EMPTY_DRAFT: CreateDraft = {
  unit_id: "",
  pm_type: "oil",
  interval_kind: "miles",
  interval_value: "10000",
};

export function PmSchedulePage() {
  const [searchParams] = useSearchParams();
  const highlightedScheduleId = searchParams.get("schedule_id")?.trim() || "";
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<CreateDraft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ["maintenance", "pm-schedule", companyId],
    queryFn: () => listMaintenancePmSchedules(companyId),
    enabled: Boolean(companyId),
  });

  const createM = useMutation({
    mutationFn: (body: {
      operating_company_id: string;
      unit_id: string;
      pm_type: string;
      interval_kind: IntervalKind;
      interval_value: number;
    }) => createMaintenancePmSchedule(body),
    onSuccess: async () => {
      setFormOpen(false);
      setDraft(EMPTY_DRAFT);
      setFormError(null);
      await qc.invalidateQueries({ queryKey: ["maintenance", "pm-schedule", companyId] });
    },
    onError: (err: unknown) => {
      setFormError(userFacingApiError(err, "Failed to create PM schedule"));
    },
  });

  const generateM = useMutation({
    mutationFn: (id: string) => generateMaintenancePmWorkOrder(id, companyId),
  });

  const rows = listQ.data?.rows ?? [];

  const columns = useMemo<ParityColumn<PmScheduleRow>[]>(
    () => [
      { key: "unit_id", label: "Unit", render: (row) => <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_display_id} noun="Unit" /> },
      { key: "pm_type", label: "PM Type", sortable: true, render: (row) => row.pm_type },
      { key: "interval_value", label: "Interval", render: (row) => `${row.interval_value} ${row.interval_kind}` },
      { key: "status", label: "Status", sortable: true, render: (row) => row.status },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => (
          <button
            type="button"
            className="rounded-sm border border-gray-300 px-2 py-0.5 text-[11px]"
            onClick={() => generateM.mutate(row.id)}
            disabled={generateM.isPending}
          >
            Generate WO
          </button>
        ),
      },
    ],
    [generateM],
  );

  function openCreateForm() {
    setDraft(EMPTY_DRAFT);
    setFormError(null);
    setFormOpen(true);
  }

  function submitCreate() {
    const unitId = draft.unit_id.trim();
    const pmType = draft.pm_type.trim();
    const intervalValue = Number.parseInt(draft.interval_value, 10);

    if (!companyId) {
      setFormError("Select an operating company first.");
      return;
    }
    if (!unitId || unitId === NIL_UUID) {
      setFormError("Select a real unit.");
      return;
    }
    if (pmType.length < 2) {
      setFormError("PM type is required.");
      return;
    }
    if (!Number.isFinite(intervalValue) || intervalValue <= 0) {
      setFormError("Interval must be a positive whole number.");
      return;
    }

    setFormError(null);
    createM.mutate({
      operating_company_id: companyId,
      unit_id: unitId,
      pm_type: pmType,
      interval_kind: draft.interval_kind,
      interval_value: intervalValue,
    });
  }

  const canSubmit =
    Boolean(draft.unit_id) &&
    draft.unit_id !== NIL_UUID &&
    draft.pm_type.trim().length >= 2 &&
    Number.parseInt(draft.interval_value, 10) > 0 &&
    !createM.isPending;

  return (
    <div className="space-y-3" data-testid="pm-schedule-page">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">PM Schedule</h2>
        <Button type="button" onClick={openCreateForm} disabled={!companyId} data-testid="pm-schedule-create-open">
          + Create
        </Button>
      </div>
      <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
        <div className="mb-2 text-xs text-gray-500">Due-soon threshold is company-configurable (days/miles/hours).</div>
        {listQ.isError ? (
          <ListErrorState
            title="Couldn't load PM schedules"
            status={0}
            message={(listQ.error as Error)?.message}
            onRetry={() => void listQ.refetch()}
          />
        ) : (
          <ParityTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            rowClassName={(row) => (row.id === highlightedScheduleId ? "bg-slate-100 ring-1 ring-slate-400" : "")}
            loading={listQ.isLoading}
            storageKey="maintenance-pm-schedule"
            emptyText="No PM schedules yet."
          />
        )}
      </div>

      <Modal
        variant="drawer"
        open={formOpen}
        title="Create PM Schedule"
        onClose={() => {
          if (createM.isPending) return;
          setFormOpen(false);
          setFormError(null);
        }}
      >
        <div className="space-y-3 text-sm" data-testid="pm-schedule-create-form">
          <label className="block">
            <span className="text-xs text-gray-600">Unit</span>
            <EntityPicker
              kind="unit"
              operatingCompanyId={companyId}
              value={draft.unit_id || null}
              onChange={(next) => setDraft((d) => ({ ...d, unit_id: next ?? "" }))}
              placeholder="Select unit"
              enabled={Boolean(companyId) && formOpen}
              nestedInDrawer
              dataTestId="pm-schedule-unit"
            />
          </label>

          <label className="block">
            <span className="text-xs text-gray-600">PM type</span>
            <select
              className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
              value={draft.pm_type}
              onChange={(e) => setDraft((d) => ({ ...d, pm_type: e.target.value }))}
              data-testid="pm-schedule-pm-type"
            >
              {PM_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-gray-600">Interval kind</span>
              <select
                className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
                value={draft.interval_kind}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, interval_kind: e.target.value as IntervalKind }))
                }
                data-testid="pm-schedule-interval-kind"
              >
                {INTERVAL_KIND_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-600">Interval value</span>
              <input
                type="number"
                min={1}
                step={1}
                className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
                value={draft.interval_value}
                onChange={(e) => setDraft((d) => ({ ...d, interval_value: e.target.value }))}
                data-testid="pm-schedule-interval-value"
              />
            </label>
          </div>

          {formError ? <p className="text-xs text-red-600">{formError}</p> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setFormOpen(false);
                setFormError(null);
              }}
              disabled={createM.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitCreate}
              disabled={!canSubmit}
              data-testid="pm-schedule-create-submit"
            >
              {createM.isPending ? "Creating…" : "+ Create"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
