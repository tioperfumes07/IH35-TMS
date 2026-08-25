import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDateUS } from "../../lib/formatDate";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSafetyTrainingRecord, getTrainingCompletions } from "../../api/safety";
import { Button } from "../../components/Button";
import { DriverPickerWithCreate } from "../../components/drivers/DriverPickerWithCreate";
import { EntityLink } from "../../components/shared/EntityLink";
import { Modal } from "../../components/Modal";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { companyToday } from "../../lib/businessDate";
import { entityLabel } from "../../lib/entity-label";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useStagedListFilters } from "../../components/table";
import { userFacingApiError } from "../../lib/api-error-message";
import { PageHeader } from "../../components/forms/shared/PageHeader";

type TrainingRecordRow = Record<string, unknown>;

type Props = {
  operatingCompanyId: string;
};

const EMPTY_FILTERS = { driverId: "" };

function expiryLabel(expiryDate: string | null | undefined) {
  if (!expiryDate) return { text: "No expiry", tone: "text-slate-500" };
  const days = Math.ceil((new Date(`${expiryDate}T00:00:00`).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return { text: "Expired", tone: "text-red-700" };
  if (days <= 30) return { text: `Due in ${days}d`, tone: "text-slate-700" };
  return { text: formatDateUS(expiryDate), tone: "text-slate-700" };
}

export function TrainingRecordsPage({ operatingCompanyId }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkTrainingId = searchParams.get("training_id")?.trim() || "";
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() || "";
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [driverId, setDriverId] = useState("");
  // LST-F5163J + LST-F5191: list reverse filter must write ?driver_id= on Apply.
  // LV-SAFETY-TRAINING-RECORDS-FILTER-SILENT-APPLY — stage until Apply; Cancel restores.
  const [trainingName, setTrainingName] = useState("");
  const [completedAt, setCompletedAt] = useState(companyToday());
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");

  function patchSearchParam(next: { driverId: string }) {
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
      patchSearchParam(next);
    },
  });
  const draft = staged.draft;

  useEffect(() => {
    setApplied((prev) => ({ ...prev, driverId: driverIdFromUrl }));
    if (driverIdFromUrl) setDriverId(driverIdFromUrl);
  }, [driverIdFromUrl]);

  // Sibling verify-training-record-driver-reverse asserts setDriverFilter + setSearchParams + test id.
  function setDriverFilter(next: string) {
    staged.setDraft((d) => ({ ...d, driverId: next }));
  }

  const effectiveDriverId = applied.driverId.trim() || undefined;

  const recordsQuery = useQuery({
    queryKey: ["safety", "training-records", operatingCompanyId, effectiveDriverId],
    queryFn: () =>
      getTrainingCompletions(operatingCompanyId, {
        driver_id: effectiveDriverId,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createSafetyTrainingRecord(operatingCompanyId, {
        driver_id: driverId,
        training_name: trainingName.trim(),
        completed_at: new Date(`${completedAt}T12:00:00`).toISOString(),
        expiry_date: expiryDate || undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setDriverId("");
      setTrainingName("");
      setExpiryDate("");
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: ["safety", "training-records", operatingCompanyId] });
      void queryClient.invalidateQueries({ queryKey: ["safety", "training-completions", operatingCompanyId] });
    },
  });

  const rows = recordsQuery.data?.training_completions ?? [];

  // Migrated to the shared QBO-parity grid — columns, order, and the per-row expiry status tone
  // are preserved verbatim (§7 additive-only).
  const recordColumns: Array<ParityColumn<TrainingRecordRow>> = [
    { key: "completed_at", label: "Completed", sortable: true, render: (row) => formatDateUS(row.completed_at) },
    {
      key: "driver_id",
      label: "Driver",
      render: (row) => {
        const id = String(row.driver_id ?? "").trim();
        if (!id) return "—";
        const driverName = String(row.driver_name ?? "").trim();
        return <EntityLink kind="driver" id={id} label={entityLabel(driverName, id, "Driver")} />;
      },
    },
    {
      key: "training_name",
      label: "Training",
      sortable: true,
      render: (row) => String(row.training_type ?? row.training_name ?? row.name ?? "Training"),
    },
    { key: "expiry_date", label: "Expiry", sortable: true, render: (row) => (row.expiry_date || row.due_at ? formatDateUS(row.expiry_date ?? row.due_at) : "—") },
    {
      key: "status",
      label: "Status",
      render: (row) => {
        const expiry = expiryLabel((row.expiry_date as string | undefined) ?? (row.due_at as string | undefined));
        return <span className={expiry.tone}>{expiry.text}</span>;
      },
    },
  ];

  return (
    <div className="space-y-3" data-testid="training-records-page">
      {/* UI-BACK-BUTTON-MISSING-ENTIRELY: see TrainingProgramsPage.tsx sibling comment. */}
      <PageHeader
        title="Training Records"
        subtitle="Per-driver completion history with expiry tracking."
        breadcrumb={[{ label: "Safety" }, { label: "Training Records" }]}
        backHref="/safety"
        actions={
          <Button size="sm" data-testid="training-records-create-btn" onClick={() => setCreateOpen(true)}>
            + Create Record
          </Button>
        }
      />

      {recordsQuery.isError ? (
        <ListErrorBanner
          message="Training records could not be loaded."
          onRetry={() => void recordsQuery.refetch()}
        />
      ) : (
        <ParityTable<TrainingRecordRow>
          columns={recordColumns}
          rows={rows}
          rowKey={(row) => String(row.id)}
          rowClassName={(row) => deepLinkTrainingId && String(row.id) === deepLinkTrainingId ? "bg-slate-100 ring-1 ring-slate-400" : ""}
          loading={recordsQuery.isLoading}
          emptyText="No training records found."
          storageKey="safety-training-records"
          exportFilename="training-records"
          tableTestId="training-records-table"
          rowTestId={(row) => `training-record-row-${String(row.id)}`}
          filterBar={
            <div className="relative flex flex-wrap items-end gap-2" data-testid="training-records-filters">
              <label className="text-[11px] text-slate-600">
                Driver
                <EntityPicker
                  kind="driver"
                  operatingCompanyId={operatingCompanyId}
                  value={draft.driverId || null}
                  onChange={(next) => setDriverFilter(next ?? "")}
                  allowCreate={false}
                  placeholder="All drivers"
                  className="mt-1"
                  dataTestId="training-records-filter-driver"
                />
              </label>
              <Button type="button" size="sm" data-testid="training-records-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
                Apply
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                data-testid="training-records-filter-cancel"
                onClick={staged.cancel}
                disabled={!staged.dirty}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                data-testid="training-records-filter-reset"
                onClick={() => {
                  staged.cancel();
                  setApplied(EMPTY_FILTERS);
                  patchSearchParam(EMPTY_FILTERS);
                }}
              >
                Reset
              </Button>
            </div>
          }
        />
      )}

      <Modal variant="drawer" open={createOpen} onClose={() => setCreateOpen(false)} title="Create Training Record">
        <form
          className="space-y-3"
          data-testid="training-record-create-modal"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <label className="block text-xs text-slate-600">
            Driver
            <div className="mt-1">
              <DriverPickerWithCreate
                operatingCompanyId={operatingCompanyId}
                value={driverId || null}
                onChange={(next) => setDriverId(next ?? "")}
                open={createOpen}
                placeholder="Select driver"
                dataField="training-record-driver"
              />
            </div>
          </label>
          <label className="block text-xs text-slate-600">
            Training name
            <input
              value={trainingName}
              onChange={(event) => setTrainingName(event.target.value)}
              className="mt-1 block h-8 w-full rounded-sm border border-gray-200 px-2 text-xs"
              data-testid="training-record-name"
              required
            />
          </label>
          <label className="block text-xs text-slate-600">
            Completed date
            <DatePicker
              value={completedAt}
              onChange={setCompletedAt}
              max={new Date().toISOString().slice(0, 10)}
              className="mt-1 block w-full"
              data-testid="training-record-completed"
            />
          </label>
          <label className="block text-xs text-slate-600">
            Expiry date (optional)
            <DatePicker
              value={expiryDate}
              onChange={(next) => setExpiryDate(next)}
              className="mt-1 block h-8 w-full"
              data-testid="training-record-expiry"
            />
          </label>
          <label className="block text-xs text-slate-600">
            Notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-1 block min-h-16 w-full rounded-sm border border-gray-200 px-2 py-1 text-xs"
              data-testid="training-record-notes"
            />
          </label>
          {createMutation.isError ? (
            <p className="text-xs text-red-700" data-testid="training-record-create-error">
              {userFacingApiError(createMutation.error, "Could not create the training record.")}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={createMutation.isPending} data-testid="training-record-submit">
              Create Record
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default TrainingRecordsPage;
