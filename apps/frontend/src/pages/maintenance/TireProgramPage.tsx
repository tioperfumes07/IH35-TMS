import { useMemo, useState } from "react";
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
  type MaintenanceTireRecordRow,
} from "../../api/maintenance";
import { listUnits } from "../../api/mdata";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

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
  const [unitId, setUnitId] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<MaintenanceTireRecordRow | null>(null);
  const [mountOpen, setMountOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [action, setAction] = useState<"rotate" | "replace" | "tread" | null>(null);
  const [mountDraft, setMountDraft] = useState<MountDraft>(EMPTY_MOUNT);
  const [brandName, setBrandName] = useState("");
  const [toPosition, setToPosition] = useState("");
  const [treadDepth, setTreadDepth] = useState("");

  const unitsQ = useQuery({
    queryKey: ["mdata", "units", companyId, "tire-program"],
    queryFn: () => listUnits({ operating_company_id: companyId, status: "Active" }),
    enabled: Boolean(companyId),
  });

  const brandsQ = useQuery({
    queryKey: ["maintenance", "tire-brands", companyId],
    queryFn: () => listMaintenanceTireBrands(companyId),
    enabled: Boolean(companyId),
  });

  const layoutQ = useQuery({
    queryKey: ["maintenance", "tire-layout", companyId, unitId],
    queryFn: () => getMaintenanceTireLayout(companyId, { unit_id: unitId }),
    enabled: Boolean(companyId && unitId),
  });

  const eventsQ = useQuery({
    queryKey: ["maintenance", "tire-events", companyId, unitId],
    queryFn: () => listMaintenanceTireEvents(companyId, { unit_id: unitId }),
    enabled: Boolean(companyId && unitId),
  });

  const alertsQ = useQuery({
    queryKey: ["maintenance", "tire-alerts", companyId],
    queryFn: () => listMaintenanceTireAlerts(companyId),
    enabled: Boolean(companyId),
  });

  const units = useMemo(
    () => (unitsQ.data?.units ?? []) as Array<{ id: string; unit_number?: string }>,
    [unitsQ.data?.units]
  );

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["maintenance", "tire-layout", companyId, unitId] }),
      queryClient.invalidateQueries({ queryKey: ["maintenance", "tire-events", companyId, unitId] }),
      queryClient.invalidateQueries({ queryKey: ["maintenance", "tire-alerts", companyId] }),
    ]);
  };

  const mountMutation = useMutation({
    mutationFn: () =>
      createMaintenanceTireRecord({
        operating_company_id: companyId,
        unit_id: unitId,
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
          <div key={slot.code} className="rounded border border-gray-200 bg-white p-3 text-xs">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium text-gray-900">{slot.label}</span>
              {slot.record?.is_low_tread ? (
                <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700">
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

  return (
    <div className="space-y-4" data-testid="maint-tire-program-page">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Tire Program</h2>
          <p className="text-xs text-gray-500">
            Per-axle tire records with rotation, replacement history, brand tracking, and tread depth alerts.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={!companyId} onClick={() => setBrandOpen(true)}>
            + Create Brand
          </Button>
          <Button
            type="button"
            disabled={!companyId || !unitId}
            onClick={() => {
              setMountDraft(EMPTY_MOUNT);
              setMountOpen(true);
            }}
          >
            + Create Tire Record
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded border border-gray-200 bg-white p-3 md:grid-cols-[1fr_auto]">
        <label className="text-xs text-gray-700">
          Vehicle
          <select
            className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            data-testid="tire-program-unit-select"
          >
            <option value="">Select unit…</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.unit_number ?? unit.id}
              </option>
            ))}
          </select>
        </label>
        <div className="self-end text-xs text-gray-600" data-testid="tire-program-alert-count">
          Low tread alerts: {alertsQ.data?.count ?? 0}
        </div>
      </div>

      {unitId ? (
        <div className="space-y-4">
          {renderPositionGrid("Steer", groupedPositions.steer)}
          {renderPositionGrid("Drive", groupedPositions.drive)}
          {groupedPositions.trailer.length > 0 ? renderPositionGrid("Trailer", groupedPositions.trailer) : null}

          <section data-testid="tire-program-history">
            <h3 className="mb-2 text-xs font-semibold uppercase text-gray-600">Rotation / replacement history</h3>
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] uppercase text-gray-500">
                <tr>
                  <th className="py-1">When</th>
                  <th className="py-1">Event</th>
                  <th className="py-1">Position</th>
                  <th className="py-1">Tread</th>
                  <th className="py-1">Notes</th>
                </tr>
              </thead>
              <tbody>
                {(eventsQ.data?.rows ?? []).map((event) => (
                  <tr key={event.id} className="border-t border-gray-100">
                    <td className="py-1">{event.created_at ?? "—"}</td>
                    <td className="py-1">{event.event_type_label ?? event.event_type}</td>
                    <td className="py-1">
                      {event.from_position_code && event.to_position_code
                        ? `${event.from_position_code} → ${event.to_position_code}`
                        : event.to_position_code ?? "—"}
                    </td>
                    <td className="py-1">
                      {event.tread_depth_32nds != null ? `${event.tread_depth_32nds}/32` : "—"}
                      {event.is_low_tread_alert ? " · alert" : ""}
                    </td>
                    <td className="py-1">{event.notes || "—"}</td>
                  </tr>
                ))}
                {(eventsQ.data?.rows ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-3 text-gray-500">
                      No tire events yet for this unit.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </div>
      ) : (
        <div className="rounded border border-dashed border-gray-300 p-6 text-sm text-gray-500">
          Select a vehicle to view steer/drive tire layout and history.
        </div>
      )}

      <Modal open={mountOpen} onClose={() => setMountOpen(false)} title="+ Create Tire Record">
        <div className="space-y-3 text-sm">
          <label className="block text-xs">
            Position
            <select
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1"
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
            <select
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1"
              value={mountDraft.brand_id}
              onChange={(e) => {
                const brand = (brandsQ.data?.rows ?? []).find((b) => b.id === e.target.value);
                setMountDraft((d) => ({
                  ...d,
                  brand_id: e.target.value,
                  brand_name: brand?.name ?? d.brand_name,
                }));
              }}
            >
              <option value="">Select brand…</option>
              {(brandsQ.data?.rows ?? []).map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Serial number
            <input
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1"
              value={mountDraft.serial_number}
              onChange={(e) => setMountDraft((d) => ({ ...d, serial_number: e.target.value }))}
            />
          </label>
          <label className="block text-xs">
            Tread depth (32nds)
            <input
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1"
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

      <Modal open={brandOpen} onClose={() => setBrandOpen(false)} title="+ Create Brand">
        <div className="space-y-3 text-sm">
          <label className="block text-xs">
            Brand name
            <input
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1"
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
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1"
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
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1"
                value={mountDraft.serial_number}
                onChange={(e) => setMountDraft((d) => ({ ...d, serial_number: e.target.value }))}
              />
            </label>
            <label className="block text-xs">
              Starting tread (32nds)
              <input
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1"
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
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1"
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
