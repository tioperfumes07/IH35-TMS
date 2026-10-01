/**
 * E-42 — Dashcam viewer (Round 306). Reads telematics.dashcam_clips (rows when E-12 ticks).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateTimeUS } from "../../lib/formatDate";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityPicker } from "../../components/EntityPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useStagedListFilters } from "../../components/table";

type DashcamClipRow = {
  id: string;
  unit_id: string;
  unit_number: string | null;
  triggered_at: string | null;
  duration_sec: number;
  camera_facing: string;
  samsara_clip_url: string;
  samsara_clip_id: string;
  trigger_kind: string;
  linked_harsh_event_id: string | null;
  retention_expires_at: string | null;
};

function listDashcamClips(companyId: string, params: { unitId?: string; limit?: number } = {}) {
  const q = new URLSearchParams({ operating_company_id: companyId });
  if (params.unitId) q.set("unit_id", params.unitId);
  if (params.limit != null) q.set("limit", String(params.limit));
  return apiRequest<{ rows: DashcamClipRow[] }>(`/api/v1/telematics/dashcam-clips?${q.toString()}`);
}

const EMPTY = { unitId: "" };

export function DashcamViewerPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const unitIdFromUrl = searchParams.get("unit_id")?.trim() ?? "";
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [applied, setApplied] = useState(() => ({ ...EMPTY, unitId: unitIdFromUrl }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY,
    onApply: (next) => {
      setApplied(next);
      const params = new URLSearchParams(searchParams);
      if (next.unitId) params.set("unit_id", next.unitId);
      else params.delete("unit_id");
      setSearchParams(params, { replace: true });
    },
  });

  useEffect(() => {
    setApplied((prev) => ({ ...prev, unitId: unitIdFromUrl }));
  }, [unitIdFromUrl]);

  const effectiveUnitId = applied.unitId.trim() || undefined;
  const clipsQ = useQuery({
    queryKey: ["telematics", "dashcam-clips", companyId, effectiveUnitId ?? ""],
    queryFn: () => listDashcamClips(companyId, { unitId: effectiveUnitId, limit: 99 }),
    enabled: Boolean(companyId),
  });

  const rows = useMemo(() => (clipsQ.isError ? [] : clipsQ.data?.rows ?? []), [clipsQ.data?.rows, clipsQ.isError]);
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const columns = useMemo<ParityColumn<DashcamClipRow>[]>(
    () => [
      {
        key: "triggered_at",
        label: "Triggered",
        sortable: true,
        render: (row) => (row.triggered_at ? `${formatDateTimeUS(row.triggered_at)} CT` : "—"),
      },
      {
        key: "unit_id",
        label: "Unit",
        render: (row) => <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" />,
      },
      { key: "camera_facing", label: "Camera", sortable: true, render: (row) => row.camera_facing },
      { key: "trigger_kind", label: "Trigger", sortable: true, render: (row) => row.trigger_kind.replace(/_/g, " ") },
      { key: "duration_sec", label: "Seconds", sortable: true, render: (row) => String(row.duration_sec) },
      {
        key: "linked_harsh_event_id",
        label: "Harsh event",
        render: (row) =>
          row.linked_harsh_event_id ? (
            <Link to={`/safety/safety-events?event_id=${row.linked_harsh_event_id}`} className="underline text-slate-700">
              Open
            </Link>
          ) : (
            "—"
          ),
      },
      {
        key: "action",
        label: "Action",
        alwaysVisible: true,
        render: (row) => (
          <Button size="sm" variant="secondary" onClick={() => setSelectedId(row.id)}>
            Play
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4 p-4" data-testid="dashcam-viewer-page">
      <PageHeader
        title="Dashcam"
        subtitle="Samsara dashcam clips by unit — harsh-event and on-demand. Clips arrive when the harsh-events poll ticks."
      />
      <div className="flex flex-wrap gap-2 text-xs">
        <Link to="/safety/safety-events" className="text-slate-700 underline">
          Safety events
        </Link>
      </div>

      {clipsQ.isError ? (
        <ListErrorState
          title="Couldn't load dashcam clips"
          status={0}
          message={(clipsQ.error as Error)?.message}
          onRetry={() => void clipsQ.refetch()}
        />
      ) : null}

      <div className="flex flex-wrap items-end gap-3" data-testid="dashcam-filters">
        <label className="text-xs text-slate-600">
          Unit
          <EntityPicker
            kind="unit"
            operatingCompanyId={companyId}
            value={staged.draft.unitId || null}
            onChange={(next) => staged.setDraft((d) => ({ ...d, unitId: next ?? "" }))}
            allowCreate={false}
            placeholder="All units"
            className="mt-1"
            dataTestId="dashcam-filter-unit"
          />
        </label>
        <Button type="button" size="sm" onClick={staged.apply} disabled={!staged.dirty}>
          Apply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            staged.cancel();
            setApplied(EMPTY);
            const params = new URLSearchParams(searchParams);
            params.delete("unit_id");
            setSearchParams(params, { replace: true });
          }}
        >
          Reset
        </Button>
      </div>

      {!clipsQ.isError ? (
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={clipsQ.isLoading}
          storageKey="safety-dashcam-viewer"
          emptyText="No dashcam clips yet — rows arrive when the harsh-events / dashcam poll ticks."
          exportFilename="dashcam-clips"
        />
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl space-y-3 rounded-sm bg-white p-4 shadow-lg">
            <h3 className="text-xs font-semibold text-slate-900">
              <EntityLinkOrTombstone kind="unit" id={selected.unit_id} name={selected.unit_number} noun="Unit" /> ·{" "}
              {selected.camera_facing}
            </h3>
            <video
              className="w-full rounded-sm border border-slate-200"
              controls
              preload="metadata"
              src={selected.samsara_clip_url}
              data-testid="dashcam-player"
            />
            <div className="flex justify-end">
              <Button size="sm" variant="tertiary" onClick={() => setSelectedId(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
