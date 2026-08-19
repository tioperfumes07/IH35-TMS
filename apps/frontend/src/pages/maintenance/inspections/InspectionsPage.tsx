import { humanizeEnumLabel } from "../../../lib/humanizeEnumLabel";
import { useMemo, useState } from "react";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirmUpload, requestUploadUrlFromFile } from "../../../api/docs";
import {
  archiveMaintenanceInspection,
  attachMaintenanceInspectionPhoto,
  createMaintenanceInspection,
  listMaintenanceInspections,
  type MaintenanceInspectionRow,
  updateMaintenanceInspection,
} from "../../../api/maintenance";
import { getSafetyDvirSubmissions } from "../../../api/safety";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { Combobox } from "../../../components/Combobox";
import { useSearchParams } from "react-router-dom";

type InspectionDraft = {
  unit_id: string;
  inspection_type: MaintenanceInspectionRow["inspection_type"];
  status: MaintenanceInspectionRow["status"];
  scheduled_date: string;
  inspection_date: string;
  inspector_name: string;
  mileage: string;
  outcome: MaintenanceInspectionRow["outcome"] | "";
  notes: string;
  dvir_submission_id: string;
  is_ad_hoc: boolean;
};

const EMPTY_DRAFT: InspectionDraft = {
  unit_id: "",
  inspection_type: "annual_dot",
  status: "scheduled",
  scheduled_date: "",
  inspection_date: "",
  inspector_name: "",
  mileage: "",
  outcome: "",
  notes: "",
  dvir_submission_id: "",
  is_ad_hoc: false,
};

const TYPE_OPTIONS: Array<{ value: MaintenanceInspectionRow["inspection_type"]; label: string }> = [
  { value: "annual_dot", label: "Annual DOT" },
  { value: "pre_trip", label: "Pre-trip" },
  { value: "post_trip", label: "Post-trip" },
  { value: "custom", label: "Custom" },
];

async function uploadInspectionPhoto(file: File, unitId: string, operatingCompanyId: string) {
  const { file_id, presigned_url } = await requestUploadUrlFromFile(file, {
    // File under the VIEWED entity, not the uploader's default_company_id (backend fallback).
    operating_company_id: operatingCompanyId || undefined,
    entity_links: unitId ? [{ entity_type: "unit", entity_id: unitId }] : undefined,
  });
  await fetch(presigned_url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  await confirmUpload(file_id);
  return file_id;
}

export function InspectionsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceInspectionRow | null>(null);
  const [draft, setDraft] = useState<InspectionDraft>(EMPTY_DRAFT);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [searchParams] = useSearchParams();
  const deepLinkInspectionId = searchParams.get("inspection_id")?.trim() ?? "";

  const listQ = useQuery({
    queryKey: ["maintenance", "inspections", companyId],
    queryFn: () => listMaintenanceInspections(companyId),
    enabled: Boolean(companyId),
  });

  const dvirQ = useQuery({
    queryKey: ["safety", "dvir", companyId, draft.unit_id],
    queryFn: () =>
      getSafetyDvirSubmissions(companyId, {
        unit_id: draft.unit_id || undefined,
        limit: 50,
      }),
    enabled: Boolean(companyId) && (draft.inspection_type === "pre_trip" || draft.inspection_type === "post_trip"),
  });

  const dvirOptions = useMemo(
    () =>
      (dvirQ.data?.submissions ?? []).map((submission: Record<string, unknown>) => ({
        value: String(submission.id ?? ""),
        label: `${humanizeEnumLabel(String(submission.type ?? "DVIR"))} · ${
          submission.submitted_at ? String(submission.submitted_at) : "Date unavailable"
        }`,
      })).filter((option) => option.value),
    [dvirQ.data?.submissions],
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["maintenance", "inspections", companyId] });
  };

  const buildPayload = () => ({
    operating_company_id: companyId,
    unit_id: draft.unit_id,
    inspection_type: draft.inspection_type,
    status: draft.status,
    scheduled_date: draft.scheduled_date || undefined,
    inspection_date: draft.inspection_date || undefined,
    inspector_name: draft.inspector_name || undefined,
    mileage: draft.mileage ? Number(draft.mileage) : undefined,
    outcome: draft.outcome || undefined,
    notes: draft.notes,
    dvir_submission_id: draft.dvir_submission_id || undefined,
    is_ad_hoc: draft.is_ad_hoc,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const created = await createMaintenanceInspection(buildPayload());
      if (photoFile && created.id) {
        const docsFileId = await uploadInspectionPhoto(photoFile, draft.unit_id, companyId);
        await attachMaintenanceInspectionPhoto(String(created.id), {
          operating_company_id: companyId,
          docs_file_id: docsFileId,
        });
      }
      return created;
    },
    onSuccess: async () => {
      setCreateOpen(false);
      setDraft(EMPTY_DRAFT);
      setPhotoFile(null);
      await refresh();
      pushToast("Inspection created", "success");
    },
    onError: () => pushToast("Failed to create inspection", "error"),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("No inspection selected");
      const updated = await updateMaintenanceInspection(String(editing.id), buildPayload());
      if (photoFile && editing.id) {
        const docsFileId = await uploadInspectionPhoto(photoFile, draft.unit_id || String(editing.unit_id), companyId);
        await attachMaintenanceInspectionPhoto(String(editing.id), {
          operating_company_id: companyId,
          docs_file_id: docsFileId,
        });
      }
      return updated;
    },
    onSuccess: async () => {
      setEditing(null);
      setDraft(EMPTY_DRAFT);
      setPhotoFile(null);
      await refresh();
      pushToast("Inspection updated", "success");
    },
    onError: () => pushToast("Failed to update inspection", "error"),
  });

  const archiveMutation = useMutation({
    mutationFn: (row: MaintenanceInspectionRow) =>
      archiveMaintenanceInspection(String(row.id), companyId, "Archived from inspections list"),
    onSuccess: async () => {
      await refresh();
      pushToast("Inspection archived", "success");
    },
    onError: () => pushToast("Failed to archive inspection", "error"),
  });

  const openEdit = (row: MaintenanceInspectionRow) => {
    setEditing(row);
    setDraft({
      unit_id: String(row.unit_id ?? ""),
      inspection_type: row.inspection_type,
      status: row.status,
      scheduled_date: String(row.scheduled_date ?? ""),
      inspection_date: String(row.inspection_date ?? ""),
      inspector_name: String(row.inspector_name ?? ""),
      mileage: row.mileage != null ? String(row.mileage) : "",
      outcome: row.outcome ?? "",
      notes: String(row.notes ?? ""),
      dvir_submission_id: String(row.dvir_submission_id ?? ""),
      is_ad_hoc: Boolean(row.is_ad_hoc),
    });
    setPhotoFile(null);
  };

  const formOpen = createOpen || Boolean(editing);
  const rows = listQ.data?.rows ?? [];

  const columns = useMemo<ParityColumn<MaintenanceInspectionRow>[]>(
    () => [
      { key: "inspection_date", label: "Date", sortable: true, render: (row) => String(row.inspection_date ?? row.scheduled_date ?? "—") },
      { key: "inspection_type", label: "Type", sortable: true, render: (row) => row.inspection_type_label ?? row.inspection_type },
      { key: "unit_number", label: "Unit", sortable: true, render: (row) => <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" /> },
      { key: "inspector_name", label: "Inspector", sortable: true, render: (row) => String(row.inspector_name ?? "—") },
      { key: "outcome", label: "Outcome", sortable: true, render: (row) => humanizeEnumLabel(row.outcome ?? row.status ?? "—") },
      {
        key: "dvir_submission_id",
        label: "DVIR",
        render: (row) => (
          <EntityLinkOrTombstone
            kind="dvir"
            id={row.dvir_submission_id}
            name={
              row.dvir_type && row.dvir_submitted_at
                ? `${humanizeEnumLabel(row.dvir_type)} · ${String(row.dvir_submitted_at).slice(0, 10)}`
                : row.dvir_type
            }
            noun="DVIR"
          />
        ),
      },
      { key: "photo_count", label: "Photos", render: (row) => String(row.photo_count ?? 0) },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) => (
          <div className="space-x-2">
            <button type="button" className="text-slate-700 underline" onClick={() => openEdit(row)}>
              Edit
            </button>
            <button type="button" className="text-red-700 underline" onClick={() => archiveMutation.mutate(row)}>
              Archive
            </button>
          </div>
        ),
      },
    ],
    [archiveMutation],
  );

  return (
    <div className="space-y-3" data-testid="maint-inspections-page">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900">Inspections</h2>
        <Button type="button" onClick={() => { setCreateOpen(true); setDraft(EMPTY_DRAFT); setPhotoFile(null); }}>
          + Create Inspection
        </Button>
      </div>

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => String(row.id)}
          rowClassName={(row) => deepLinkInspectionId === String(row.id) ? "bg-slate-100 ring-1 ring-slate-400" : ""}
          loading={listQ.isPending}
          storageKey="maintenance-inspections"
          emptyText="No inspections logged yet."
          exportFilename="inspections"
        />
      </div>

      <Modal
        variant="drawer"
        open={formOpen}
        title={editing ? "Edit Inspection" : "Create Inspection"}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
          setDraft(EMPTY_DRAFT);
          setPhotoFile(null);
        }}
      >
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-xs text-gray-600">Unit</span>
            <EntityPicker
              kind="unit"
              operatingCompanyId={companyId}
              value={draft.unit_id || null}
              onChange={(next) => setDraft((d) => ({ ...d, unit_id: next ?? "" }))}
              placeholder="Select unit…"
              enabled={Boolean(companyId) && formOpen}
              nestedInDrawer
            />
          </label>

          <label className="block">
            <span className="text-xs text-gray-600">Inspection type</span>
            <select
              className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
              value={draft.inspection_type}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  inspection_type: e.target.value as InspectionDraft["inspection_type"],
                  dvir_submission_id: "",
                }))
              }
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {(draft.inspection_type === "pre_trip" || draft.inspection_type === "post_trip") ? (
            <div className="block">
              <label htmlFor="maintenance-inspection-dvir-picker" className="text-xs text-gray-600">Link DVIR submission</label>
              <Combobox
                id="maintenance-inspection-dvir-picker"
                className="mt-1"
                options={dvirOptions}
                value={draft.dvir_submission_id || null}
                onChange={(next) => setDraft((d) => ({ ...d, dvir_submission_id: next ?? "" }))}
                placeholder="No DVIR link"
                loading={dvirQ.isLoading}
                error={dvirQ.isError ? "Couldn't load DVIR submissions" : undefined}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-gray-600">Scheduled date</span>
              <DatePicker
                className="mt-1 w-full"
                value={draft.scheduled_date}
                onChange={(next) => setDraft((d) => ({ ...d, scheduled_date: next }))}
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-600">Inspection date</span>
              <DatePicker
                className="mt-1 w-full"
                value={draft.inspection_date}
                onChange={(next) => setDraft((d) => ({ ...d, inspection_date: next }))}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-gray-600">Inspector</span>
            <input
              className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
              value={draft.inspector_name}
              onChange={(e) => setDraft((d) => ({ ...d, inspector_name: e.target.value }))}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-gray-600">Mileage</span>
              <input
                type="number"
                className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
                value={draft.mileage}
                onChange={(e) => setDraft((d) => ({ ...d, mileage: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-600">Outcome</span>
              <select
                className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
                value={draft.outcome ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, outcome: e.target.value as InspectionDraft["outcome"] }))}
              >
                <option value="">—</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="pending">Pending</option>
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={draft.is_ad_hoc}
              onChange={(e) => setDraft((d) => ({ ...d, is_ad_hoc: e.target.checked }))}
            />
            Ad-hoc inspection
          </label>

          <label className="block">
            <span className="text-xs text-gray-600">Notes</span>
            <textarea
              className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
              rows={3}
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </label>

          <label className="block">
            <span className="text-xs text-gray-600">Photo upload (docs module)</span>
            <input
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-xs"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              onClick={() => (editing ? updateMutation.mutate() : createMutation.mutate())}
              disabled={!draft.unit_id || createMutation.isPending || updateMutation.isPending}
            >
              {editing ? "Save Inspection" : "Create Inspection"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
