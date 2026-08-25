import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  auditMaintenanceTireTread,
  createMaintenanceTireBrand,
  createMaintenanceTireRecord,
  getMaintenanceTireLayout,
  listMaintenanceTireAlerts,
  listMaintenanceTireBrands,
  listMaintenanceTireEvents,
  replaceMaintenanceTire,
  rotateMaintenanceTire,
  type MaintenanceTireEventRow,
  type MaintenanceTireRecordRow,
} from "../../api/maintenance";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { formatDateTimeUS } from "../../lib/formatDate";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { useSearchParams } from "react-router-dom";

type MountDraft = {
  position_code: string;
  brand_id: string;
  brand_name: string;
  serial_number: string;
  size: string;
  tread_depth_32nds: string;
};

const EMPTY_MOUNT: MountDraft = {
  position_code: "",
  brand_id: "",
  brand_name: "",
  serial_number: "",
  size: "295/75R22.5",
  tread_depth_32nds: "32",
};

export function TireProgramPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [assetKind, setAssetKindState] = useState<"unit" | "trailer">("unit");
  const [assetId, setAssetIdState] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<MaintenanceTireRecordRow | null>(null);
  const [mountOpen, setMountOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [action, setAction] = useState<"rotate" | "replace" | "tread" | null>(null);
  const [mountDraft, setMountDraft] = useState<MountDraft>(EMPTY_MOUNT);
  const [brandName, setBrandName] = useState("");
  const [toPosition, setToPosition] = useState("");
  const [treadDepth, setTreadDepth] = useState("");

  useEffect(() => {
    const trailerId = searchParams.get("equipment_id")?.trim();
    const unitId = searchParams.get("unit_id")?.trim();
    if (trailerId) {
      setAssetKindState("trailer");
      setAssetIdState(trailerId);
    } else if (unitId) {
      setAssetKindState("unit");
      setAssetIdState(unitId);
    }
  }, [searchParams]);

  // LST-F5200 — asset selection writes URL (unit_id / equipment_id).
  function writeAssetToUrl(kind: "unit" | "trailer", id: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("unit_id");
        params.delete("equipment_id");
        if (id) {
          if (kind === "trailer") params.set("equipment_id", id);
          else params.set("unit_id", id);
        }
        return params;
      },
      { replace: true }
    );
  }
  function setAssetKind(kind: "unit" | "trailer") {
    setAssetKindState(kind);
    setAssetIdState("");
    writeAssetToUrl(kind, "");
  }
  function setAssetId(next: string) {
    setAssetIdState(next);
    writeAssetToUrl(assetKind, next);
  }

  const assetParams = assetKind === "trailer" ? { equipment_id: assetId } : { unit_id: assetId };

  const brandsQ = useQuery({
    queryKey: ["maintenance", "tire-brands", companyId],
    queryFn: () => listMaintenanceTireBrands(companyId),
    enabled: Boolean(companyId),
  });

  const layoutQ = useQuery({
    queryKey: ["maintenance", "tire-layout", companyId, assetKind, assetId],
    queryFn: () => getMaintenanceTireLayout(companyId, assetParams),
    enabled: Boolean(companyId && assetId),
  });

  const eventsQ = useQuery({
    queryKey: ["maintenance", "tire-events", companyId, assetKind, assetId],
    queryFn: () => listMaintenanceTireEvents(companyId, assetParams),
    enabled: Boolean(companyId && assetId),
  });

  const alertsQ = useQuery({
    queryKey: ["maintenance", "tire-alerts", companyId],
    queryFn: () => listMaintenanceTireAlerts(companyId),
    enabled: Boolean(companyId),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["maintenance", "tire-layout", companyId, assetKind, assetId] }),
      queryClient.invalidateQueries({ queryKey: ["maintenance", "tire-events", companyId, assetKind, assetId] }),
      queryClient.invalidateQueries({ queryKey: ["maintenance", "tire-alerts", companyId] }),
    ]);
  };

  const mountMutation = useMutation({
    mutationFn: () =>
      createMaintenanceTireRecord({
        operating_company_id: companyId,
        ...assetParams,
        position_code: mountDraft.position_code,
        brand_id: mountDraft.brand_id || undefined,
        brand_name: mountDraft.brand_name,
        serial_number: mountDraft.serial_number,
        size: mountDraft.size,
        tread_depth_32nds: Number(mountDraft.tread_depth_32nds),
      }),
    onSuccess: async () => {
      setMountOpen(false);
      setMountDraft(EMPTY_MOUNT);
      await refresh();
      pushToast("Tire mounted", "success");
    },
    onError: () => pushToast("Failed to mount tire", "error"),
  });

  const brandMutation = useMutation({
    mutationFn: () =>
      createMaintenanceTireBrand({
        operating_company_id: companyId,
        name: brandName,
      }),
    onSuccess: async () => {
      setBrandOpen(false);
      setBrandName("");
      await queryClient.invalidateQueries({ queryKey: ["maintenance", "tire-brands", companyId] });
      pushToast("Tire brand created", "success");
    },
    onError: () => pushToast("Failed to create brand", "error"),
  });

  const rotateMutation = useMutation({
    mutationFn: () =>
      rotateMaintenanceTire({
        operating_company_id: companyId,
        tire_record_id: String(selectedRecord?.id),
        to_position_code: toPosition,
        notes: "Rotation from tire program",
      }),
    onSuccess: async () => {
      setAction(null);
      setSelectedRecord(null);
      setToPosition("");
      await refresh();
      pushToast("Tire rotated", "success");
    },
    onError: () => pushToast("Failed to rotate tire", "error"),
  });

  const replaceMutation = useMutation({
    mutationFn: () =>
      replaceMaintenanceTire({
        operating_company_id: companyId,
        tire_record_id: String(selectedRecord?.id),
        brand_name: mountDraft.brand_name,
        serial_number: mountDraft.serial_number,
        tread_depth_32nds: Number(mountDraft.tread_depth_32nds),
        notes: "Replacement from tire program",
      }),
    onSuccess: async () => {
      setAction(null);
      setSelectedRecord(null);
      setMountDraft(EMPTY_MOUNT);
      await refresh();
      pushToast("Tire replaced", "success");
    },
    onError: () => pushToast("Failed to replace tire", "error"),
  });

  const treadMutation = useMutation({
    mutationFn: () =>
      auditMaintenanceTireTread({
        operating_company_id: companyId,
        tire_record_id: String(selectedRecord?.id),
        tread_depth_32nds: Number(treadDepth),
        notes: "Manual tread audit",
      }),
    onSuccess: async (result) => {
      setAction(null);
      setSelectedRecord(null);
      setTreadDepth("");
      await refresh();
      pushToast(result.is_low_tread_alert ? "Low tread alert recorded" : "Tread depth recorded", "success");
    },
    onError: () => pushToast("Failed to record tread depth", "error"),
  });

  const groupedPositions = useMemo(() => {
    const positions = layoutQ.data?.positions ?? [];
    return {
      steer: positions.filter((p) => p.group === "steer"),
      drive: positions.filter((p) => p.group === "drive"),
      trailer: positions.filter((p) => p.group === "trailer"),
    };
  }, [layoutQ.data?.positions]);

  const openQuickAction = (record: MaintenanceTireRecordRow, next: "rotate" | "replace" | "tread") => {
    setSelectedRecord(record);
    setAction(next);
    if (next === "tread") setTreadDepth(String(record.tread_depth_32nds ?? ""));
    if (next === "replace") {
      setMountDraft({
        ...EMPTY_MOUNT,
        brand_name: String(record.brand_name ?? ""),
        serial_number: "",
        tread_depth_32nds: "32",
      });
    }
  };

  const renderPositionGrid = (title: string, positions: typeof groupedPositions.steer) => (
    <section className="space-y-2" data-testid={`tire-layout-${title.toLowerCase()}`}>
      <h3 className="text-xs font-semibold uppercase text-gray-600">{title}</h3>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {positions.map((slot) => (
          <div key={slot.code} className="rounded-sm border border-gray-200 bg-white p-3 text-xs">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium text-gray-900">{slot.label}</span>
              {slot.record?.is_low_tread ? (
                <span className="rounded-sm bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700">
                  Low tread
                </span>
              ) : null}
            </div>
            {slot.record ? (
              <>
                <div className="text-gray-600">{slot.record.brand_name || "Unknown brand"}</div>
                <div className="text-gray-500">SN {slot.record.serial_number || "—"}</div>
                <div className="text-gray-500">{slot.record.tread_depth_32nds}/32 tread</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button type="button" variant="secondary" onClick={() => openQuickAction(slot.record!, "rotate")}>
                    Rotate
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => openQuickAction(slot.record!, "replace")}>
                    Replace
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => openQuickAction(slot.record!, "tread")}>
                    Tread audit
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-gray-500">Empty position</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );

  const eventRows = eventsQ.data?.rows ?? [];

  const eventColumns = useMemo<ParityColumn<MaintenanceTireEventRow>[]>(
    () => [
      { key: "created_at", label: "When", sortable: true, render: (row) => formatDateTimeUS(row.created_at) || "—" },
      { key: "event_type", label: "Event", sortable: true, render: (row) => row.event_type_label ?? row.event_type },
      {
        key: "to_position_code",
        label: "Position",
        render: (row) =>
          row.from_position_code && row.to_position_code
            ? `${row.from_position_code} → ${row.to_position_code}`
            : row.to_position_code ?? "—",
      },
      {
        key: "tread_depth_32nds",
        label: "Tread",
        render: (row) => `${row.tread_depth_32nds != null ? `${row.tread_depth_32nds}/32` : "—"}${row.is_low_tread_alert ? " · alert" : ""}`,
      },
      { key: "notes", label: "Notes", render: (row) => row.notes || "—" },
    ],
    [],
  );

  return (
    <div className="space-y-4" data-testid="maint-tire-program-page">
      {/* UI-BACK-BUTTON-MISSING-ENTIRELY: see VehiclesMasterDataPage.tsx sibling comment. */}
      <PageHeader
        title="Tire Program"
        subtitle="Per-axle tire records with rotation, replacement history, brand tracking, and tread depth alerts."
        breadcrumb={["Maintenance", "Tire Program"]}
        backHref="/maintenance"
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={!companyId} onClick={() => setBrandOpen(true)}>
              + Create Brand
            </Button>
            <Button
              type="button"
              disabled={!companyId || !assetId}
              onClick={() => {
                setMountDraft(EMPTY_MOUNT);
                setMountOpen(true);
              }}
            >
              + Create Tire Record
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-[auto_1fr_auto]">
        <div className="flex self-end p-1" aria-label="Tire asset type">
          {(["unit", "trailer"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className={`rounded-sm px-3 py-1 text-xs font-medium ${assetKind === kind ? "bg-slate-800 text-white" : "text-gray-600"}`}
              onClick={() => setAssetKind(kind)}
            >
              {kind === "unit" ? "Unit" : "Trailer"}
            </button>
          ))}
        </div>
        <label className="text-xs text-gray-700">
          {assetKind === "unit" ? "Unit" : "Trailer"}
          <EntityPicker
            kind={assetKind}
            operatingCompanyId={companyId}
            value={assetId || null}
            onChange={(next) => setAssetId(next ?? "")}
            placeholder={assetKind === "unit" ? "Select unit…" : "Select trailer…"}
            enabled={Boolean(companyId)}
            className="mt-1 block w-full"
            dataTestId={`tire-program-${assetKind}-select`}
          />
        </label>
        <div className="self-end text-xs text-gray-600" data-testid="tire-program-alert-count">
          Low tread alerts: {alertsQ.data?.count ?? 0}
        </div>
      </div>

      {assetId ? (
        <div className="space-y-4">
          {renderPositionGrid("Steer", groupedPositions.steer)}
          {renderPositionGrid("Drive", groupedPositions.drive)}
          {groupedPositions.trailer.length > 0 ? renderPositionGrid("Trailer", groupedPositions.trailer) : null}

          <section data-testid="tire-program-history">
            <h3 className="mb-2 text-xs font-semibold uppercase text-gray-600">Rotation / replacement history</h3>
            {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to emptyText "No tire events yet for this unit." — an outage
                presenting as a unit with no tire history. */}
            {eventsQ.isError ? (
              <ListErrorState
                title="Couldn't load tire events"
                status={0}
                message={(eventsQ.error as Error)?.message}
                onRetry={() => void eventsQ.refetch()}
              />
            ) : (
            <ParityTable
              rows={eventRows}
              columns={eventColumns}
              rowKey={(row) => row.id}
              loading={eventsQ.isPending}
              storageKey="maintenance-tire-events"
              emptyText={`No tire events yet for this ${assetKind}.`}
            />
            )}
          </section>
        </div>
      ) : (
        <div className="rounded-sm border border-dashed border-gray-300 p-6 text-sm text-gray-500">
          Select a unit or trailer to view its tire layout and history.
        </div>
      )}

      <Modal variant="drawer" open={mountOpen} onClose={() => setMountOpen(false)} title="+ Create Tire Record">
        <div className="space-y-3 text-sm">
          <label className="block text-xs">
            Position
            <select
              className="mt-1 block w-full rounded-sm border border-gray-300 px-2 py-1"
              value={mountDraft.position_code}
              onChange={(e) => setMountDraft((d) => ({ ...d, position_code: e.target.value }))}
            >
              <option value="">Select position…</option>
              {(layoutQ.data?.positions ?? []).map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Brand
            <ReferenceSelect
              value={mountDraft.brand_id || null}
              onChange={(value) => {
                const brand = (brandsQ.data?.rows ?? []).find((b) => b.id === value);
                setMountDraft((d) => ({
                  ...d,
                  brand_id: value ?? "",
                  brand_name: brand?.name ?? d.brand_name,
                }));
              }}
              options={(brandsQ.data?.rows ?? []).map((brand) => ({ value: brand.id, label: brand.name }))}
              createKind="maintenance_tire_brand"
              operatingCompanyId={companyId}
              placeholder="Select brand…"
              onOptionCreated={async (opt) => {
                setMountDraft((d) => ({ ...d, brand_id: opt.value, brand_name: opt.label }));
                await queryClient.invalidateQueries({ queryKey: ["maintenance", "tire-brands", companyId] });
              }}
            />
          </label>
          <label className="block text-xs">
            Serial number
            <input
              className="mt-1 block w-full rounded-sm border border-gray-300 px-2 py-1"
              value={mountDraft.serial_number}
              onChange={(e) => setMountDraft((d) => ({ ...d, serial_number: e.target.value }))}
            />
          </label>
          <label className="block text-xs">
            Tread depth (32nds)
            <input
              className="mt-1 block w-full rounded-sm border border-gray-300 px-2 py-1"
              value={mountDraft.tread_depth_32nds}
              onChange={(e) => setMountDraft((d) => ({ ...d, tread_depth_32nds: e.target.value }))}
            />
          </label>
          <Button
            type="button"
            disabled={!mountDraft.position_code || mountMutation.isPending}
            onClick={() => mountMutation.mutate()}
          >
            Mount tire
          </Button>
        </div>
      </Modal>

      <Modal variant="drawer" open={brandOpen} onClose={() => setBrandOpen(false)} title="+ Create Brand">
        <div className="space-y-3 text-sm">
          <label className="block text-xs">
            Brand name
            <input
              className="mt-1 block w-full rounded-sm border border-gray-300 px-2 py-1"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
            />
          </label>
          <Button type="button" disabled={!brandName.trim() || brandMutation.isPending} onClick={() => brandMutation.mutate()}>
            Save brand
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(action && selectedRecord)}
        onClose={() => {
          setAction(null);
          setSelectedRecord(null);
        }}
        title={action === "rotate" ? "Rotate tire" : action === "replace" ? "Replace tire" : "Tread depth audit"}
      >
        {action === "rotate" ? (
          <div className="space-y-3 text-sm">
            <label className="block text-xs">
              To position
              <select
                className="mt-1 block w-full rounded-sm border border-gray-300 px-2 py-1"
                value={toPosition}
                onChange={(e) => setToPosition(e.target.value)}
              >
                <option value="">Select position…</option>
                {(layoutQ.data?.positions ?? [])
                  .filter((p) => p.code !== selectedRecord?.position_code)
                  .map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.label}
                    </option>
                  ))}
              </select>
            </label>
            <Button type="button" disabled={!toPosition || rotateMutation.isPending} onClick={() => rotateMutation.mutate()}>
              Confirm rotation
            </Button>
          </div>
        ) : null}
        {action === "replace" ? (
          <div className="space-y-3 text-sm">
            <label className="block text-xs">
              New serial number
              <input
                className="mt-1 block w-full rounded-sm border border-gray-300 px-2 py-1"
                value={mountDraft.serial_number}
                onChange={(e) => setMountDraft((d) => ({ ...d, serial_number: e.target.value }))}
              />
            </label>
            <label className="block text-xs">
              Starting tread (32nds)
              <input
                className="mt-1 block w-full rounded-sm border border-gray-300 px-2 py-1"
                value={mountDraft.tread_depth_32nds}
                onChange={(e) => setMountDraft((d) => ({ ...d, tread_depth_32nds: e.target.value }))}
              />
            </label>
            <Button type="button" disabled={replaceMutation.isPending} onClick={() => replaceMutation.mutate()}>
              Confirm replacement
            </Button>
          </div>
        ) : null}
        {action === "tread" ? (
          <div className="space-y-3 text-sm">
            <label className="block text-xs">
              Tread depth (32nds)
              <input
                className="mt-1 block w-full rounded-sm border border-gray-300 px-2 py-1"
                value={treadDepth}
                onChange={(e) => setTreadDepth(e.target.value)}
              />
            </label>
            <Button type="button" disabled={!treadDepth || treadMutation.isPending} onClick={() => treadMutation.mutate()}>
              Save tread audit
            </Button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
