import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateUS } from "../../../lib/formatDate";
import {
  getSafetyIncident,
  listSafetyIncidents,
  uploadSafetyIncidentPhoto,
} from "../../../api/safety";
import { Button } from "../../../components/Button";
import { formatCentsDisplay } from "../../../components/forms/MoneyInput";
import { DamageReportCreatorModal } from "./DamageReportCreatorModal";

// SC2 — damage-report surface. Deliberately DOES NOT reuse the shared SafetyIncidentsClusterSurface
// (which still serves cargo claims + trailer interchanges with the old location+description stub
// creator) so this block's full wizard stays inside the damage-report lane and cannot regress the
// other two incident surfaces.

const PAGE_TEST_ID = "damage-reports-page";

type Props = {
  operatingCompanyId: string;
};

export function DamageReportsSurface({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const listQuery = useQuery({
    queryKey: ["safety", "incidents", "damage_report", operatingCompanyId],
    queryFn: () => listSafetyIncidents(operatingCompanyId, "damage_report"),
    enabled: Boolean(operatingCompanyId),
  });

  const detailQuery = useQuery({
    queryKey: ["safety", "incident-detail", selectedId, operatingCompanyId],
    queryFn: () => getSafetyIncident(String(selectedId), operatingCompanyId),
    enabled: Boolean(selectedId) && Boolean(operatingCompanyId),
  });

  const rows = listQuery.data?.incidents ?? [];
  const detail = detailQuery.data?.incident ?? null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["safety", "incidents"] });
  };

  const onPhotoSelected = async (file: File | null) => {
    if (!file || !selectedId) return;
    setUploading(true);
    try {
      await uploadSafetyIncidentPhoto(selectedId, operatingCompanyId, file);
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
    <div className="space-y-3" data-testid={PAGE_TEST_ID}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 bg-white px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">Damage Reports</div>
          <div className="text-[11px] text-slate-500">
            Equipment and property damage events with photos and investigation status.
          </div>
        </div>
        <Button size="sm" data-testid={`${PAGE_TEST_ID}-create-btn`} onClick={() => setCreatorOpen(true)}>
          + Create damage report
        </Button>
      </div>

      <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
        <table className="min-w-full text-xs" data-testid={`${PAGE_TEST_ID}-table`}>
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-left">Location</th>
              <th className="px-2 py-1 text-left">Amount</th>
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={String(row.id)}
                className="border-t border-gray-100"
                data-testid={`${PAGE_TEST_ID}-row-${String(row.id)}`}
              >
                <td className="px-2 py-1">{formatDateUS(row.incident_at)}</td>
                <td className="px-2 py-1">{String(row.location ?? "—")}</td>
                <td className="px-2 py-1">
                  ${formatCentsDisplay(Number(row.damage_amount_cents ?? 0))}
                </td>
                <td className="px-2 py-1">{String(row.status ?? "open")}</td>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    className="text-slate-700 underline"
                    onClick={() => setSelectedId(String(row.id))}
                  >
                    Open report
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-center text-slate-500">
                  No records found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedId ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid={`${PAGE_TEST_ID}-drawer`}>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">Open report</div>
            <button type="button" className="text-xs text-slate-500 underline" onClick={() => setSelectedId(null)}>
              Close
            </button>
          </div>
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-slate-600">Location: </span>
              {String(detail?.location ?? "—")}
            </div>
            <div>
              <span className="text-slate-600">Description: </span>
              {String(detail?.description ?? "—")}
            </div>
            <div>
              <span className="text-slate-600">Estimated damage: </span>${formatCentsDisplay(Number(detail?.damage_amount_cents ?? 0))}
            </div>
            <div className="space-y-1">
              <div className="text-slate-600">Photos ({photoCount})</div>
              <input
                type="file"
                accept="image/*"
                data-testid={`${PAGE_TEST_ID}-photo-input`}
                disabled={uploading}
                onChange={(e) => void onPhotoSelected(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        </div>
      ) : null}

      {creatorOpen ? (
        <DamageReportCreatorModal
          operatingCompanyId={operatingCompanyId}
          onClose={() => setCreatorOpen(false)}
          onCreated={refresh}
        />
      ) : null}
    </div>
  );
}
