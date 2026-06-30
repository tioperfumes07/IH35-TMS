import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSafetyIncident,
  getSafetyIncident,
  listSafetyIncidents,
  uploadSafetyIncidentPhoto,
  type SafetyIncidentType,
} from "../../../api/safety";
import { Button } from "../../../components/Button";
import { companyNow } from "../../../lib/businessDate";

export type IncidentsClusterConfig = {
  incidentType: SafetyIncidentType;
  title: string;
  subtitle: string;
  pageTestId: string;
  createLabel: string;
  detailLabel: string;
};

type Props = {
  operatingCompanyId: string;
  config: IncidentsClusterConfig;
};

function createDraftIncident(incidentType: SafetyIncidentType): Record<string, unknown> {
  return {
    id: "__create__",
    incident_type: incidentType,
    status: "open",
    incident_at: companyNow(),
    location: "",
    description: "",
  };
}

export function SafetyIncidentsClusterSurface({ operatingCompanyId, config }: Props) {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [uploading, setUploading] = useState(false);

  const listQuery = useQuery({
    queryKey: ["safety", "incidents", config.incidentType, operatingCompanyId],
    queryFn: () => listSafetyIncidents(operatingCompanyId, config.incidentType),
    enabled: Boolean(operatingCompanyId),
  });

  const detailQuery = useQuery({
    queryKey: ["safety", "incident-detail", selected?.id, operatingCompanyId],
    queryFn: () => getSafetyIncident(String(selected?.id), operatingCompanyId),
    enabled: drawerOpen && Boolean(selected?.id) && String(selected?.id) !== "__create__" && Boolean(operatingCompanyId),
  });

  const rows = listQuery.data?.incidents ?? [];
  const createMode = String(selected?.id ?? "") === "__create__";
  const detail = createMode ? selected : detailQuery.data?.incident ?? selected;

  const openRow = (row: Record<string, unknown>) => {
    setSelected(row);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelected(null);
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["safety", "incidents"] });
  };

  const saveCreate = async () => {
    if (!createMode || !selected) return;
    await createSafetyIncident({
      operating_company_id: operatingCompanyId,
      incident_type: config.incidentType,
      location: String(selected.location ?? ""),
      description: String(selected.description ?? ""),
    });
    closeDrawer();
    refresh();
  };

  const onPhotoSelected = async (file: File | null) => {
    if (!file || createMode || !selected?.id) return;
    setUploading(true);
    try {
      await uploadSafetyIncidentPhoto(String(selected.id), operatingCompanyId, file);
      refresh();
      void detailQuery.refetch();
    } finally {
      setUploading(false);
    }
  };

  const photoCount = useMemo(() => {
    const keys = detail?.photo_keys;
    return Array.isArray(keys) ? keys.length : 0;
  }, [detail]);

  return (
    <div className="space-y-3" data-testid={config.pageTestId}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">{config.title}</div>
          <div className="text-[11px] text-slate-500">{config.subtitle}</div>
        </div>
        <Button
          size="sm"
          data-testid={`${config.pageTestId}-create-btn`}
          onClick={() => {
            setSelected(createDraftIncident(config.incidentType));
            setDrawerOpen(true);
          }}
        >
          {config.createLabel}
        </Button>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs" data-testid={`${config.pageTestId}-table`}>
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-left">Location</th>
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100" data-testid={`${config.pageTestId}-row-${String(row.id)}`}>
                <td className="px-2 py-1">{String(row.incident_at ?? "").slice(0, 10)}</td>
                <td className="px-2 py-1">{String(row.location ?? "—")}</td>
                <td className="px-2 py-1">{String(row.status ?? "open")}</td>
                <td className="px-2 py-1">
                  <button type="button" className="text-slate-700 underline" onClick={() => openRow(row)}>
                    {config.detailLabel}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-center text-slate-500">
                  No records found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {drawerOpen ? (
        <div className="rounded border border-gray-200 bg-white p-3" data-testid={`${config.pageTestId}-drawer`}>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">{createMode ? config.createLabel : config.detailLabel}</div>
            <button type="button" className="text-xs text-slate-500 underline" onClick={closeDrawer}>
              Close
            </button>
          </div>
          <div className="space-y-2 text-xs">
            <label className="block">
              <span className="text-slate-600">Location</span>
              <input
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1"
                value={String(detail?.location ?? "")}
                disabled={!createMode}
                onChange={(e) => setSelected((prev) => ({ ...(prev ?? {}), location: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-slate-600">Description</span>
              <textarea
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1"
                rows={3}
                value={String(detail?.description ?? "")}
                disabled={!createMode}
                onChange={(e) => setSelected((prev) => ({ ...(prev ?? {}), description: e.target.value }))}
              />
            </label>
            {!createMode ? (
              <div className="space-y-1">
                <div className="text-slate-600">Photos ({photoCount})</div>
                <input
                  type="file"
                  accept="image/*"
                  data-testid={`${config.pageTestId}-photo-input`}
                  disabled={uploading}
                  onChange={(e) => void onPhotoSelected(e.target.files?.[0] ?? null)}
                />
              </div>
            ) : null}
            {createMode ? (
              <Button size="sm" onClick={() => void saveCreate()}>
                Save
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
