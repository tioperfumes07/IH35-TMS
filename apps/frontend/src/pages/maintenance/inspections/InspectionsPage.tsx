import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirmUpload, requestUploadUrl } from "../../../api/docs";
import {
  archiveMaintenanceInspection,
  attachMaintenanceInspectionPhoto,
  createMaintenanceInspection,
  listMaintenanceInspections,
  type MaintenanceInspectionRow,
  updateMaintenanceInspection,
} from "../../../api/maintenance";
import { listUnits } from "../../../api/mdata";
import { getSafetyDvirSubmissions } from "../../../api/safety";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";

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

async function uploadInspectionPhoto(file: File, unitId: string) {
  const { file_id, presigned_url } = await requestUploadUrl({
    original_filename: file.name,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
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

  const listQ = useQuery({
    queryKey: ["maintenance", "inspections", companyId],
    queryFn: () => listMaintenanceInspections(companyId),
    enabled: Boolean(companyId),
  });

  const unitsQ = useQuery({
    queryKey: ["mdata", "units", companyId],
    queryFn: () => listUnits({ operating_company_id: companyId, status: "Active" }),
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

  const units = useMemo(
    () => (unitsQ.data?.units ?? []) as Array<{ id: string; unit_number?: string }>,
    [unitsQ.data?.units]
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
        const docsFileId = await uploadInspectionPhoto(photoFile, draft.unit_id);
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
        const docsFileId = await uploadInspectionPhoto(photoFile, draft.unit_id || String(editing.unit_id));
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

  return (
    <div className="space-y-3" data-testid="maint-inspections-page">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900">Inspections</h2>
        <Button type="button" onClick={() => { setCreateOpen(true); setDraft(EMPTY_DRAFT); setPhotoFile(null); }}>
          + Create Inspection
        </Button>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <table className="w-full text-left text-xs">
          <thead className="text-[11px] uppercase text-gray-600">
            <tr>
              <th className="py-1">Date</th>
              <th className="py-1">Type</th>
              <th className="py-1">Unit</th>
              <th className="py-1">Inspector</th>
              <th className="py-1">Outcome</th>
              <th className="py-1">DVIR</th>
              <th className="py-1">Photos</th>
              <th className="py-1">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(listQ.data?.rows ?? []).map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="py-1">{String(row.inspection_date ?? row.scheduled_date ?? "—")}</td>
                <td className="py-1">{row.inspection_type_label ?? row.inspection_type}</td>
                <td className="py-1">{String(row.unit_number ?? row.unit_id ?? "—")}</td>
                <td className="py-1">{String(row.inspector_name ?? "—")}</td>
                <td className="py-1">{String(row.outcome ?? row.status ?? "—")}</td>
                <td className="py-1">{row.dvir_submission_id ? "Linked" : "—"}</td>
                <td className="py-1">{String(row.photo_count ?? 0)}</td>
                <td className="py-1 space-x-2">
                  <button type="button" className="text-blue-700 underline" onClick={() => openEdit(row)}>
                    Edit
                  </button>
                  <button type="button" className="text-red-700 underline" onClick={() => archiveMutation.mutate(row)}>
                    Archive
                  </button>
                </td>
              </tr>
            ))}
            {(listQ.data?.rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={8} className="py-3 text-gray-500">
                  No inspections logged yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal
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
            <select
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              value={draft.unit_id}
              onChange={(e) => setDraft((d) => ({ ...d, unit_id: e.target.value }))}
            >
              <option value="">Select unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_number ?? u.id}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-gray-600">Inspection type</span>
            <select
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
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
            <label className="block">
              <span className="text-xs text-gray-600">Link DVIR submission</span>
              <select
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={draft.dvir_submission_id}
                onChange={(e) => setDraft((d) => ({ ...d, dvir_submission_id: e.target.value }))}
              >
                <option value="">No DVIR link</option>
                {(dvirQ.data?.submissions ?? []).map((sub: Record<string, unknown>) => (
                  <option key={String(sub.id)} value={String(sub.id)}>
                    {String(sub.type ?? "dvir")} · {String(sub.submitted_at ?? sub.id)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-gray-600">Scheduled date</span>
              <input
                type="date"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={draft.scheduled_date}
                onChange={(e) => setDraft((d) => ({ ...d, scheduled_date: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-600">Inspection date</span>
              <input
                type="date"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={draft.inspection_date}
                onChange={(e) => setDraft((d) => ({ ...d, inspection_date: e.target.value }))}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-gray-600">Inspector</span>
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              value={draft.inspector_name}
              onChange={(e) => setDraft((d) => ({ ...d, inspector_name: e.target.value }))}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-gray-600">Mileage</span>
              <input
                type="number"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={draft.mileage}
                onChange={(e) => setDraft((d) => ({ ...d, mileage: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-600">Outcome</span>
              <select
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
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
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
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
