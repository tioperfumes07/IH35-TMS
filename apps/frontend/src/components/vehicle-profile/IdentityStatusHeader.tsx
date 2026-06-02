import { useState } from "react";
import { patchUnit } from "../../api/mdata";
import { QuickAvailabilityToggle } from "./QuickAvailabilityToggle";
import { StatusChangeModal } from "./StatusChangeModal";
import { PlatesTable } from "./PlatesTable";

const STATUSES = ["InService", "OutOfService", "InMaintenance", "Sold", "Damaged", "Transferred"] as const;

export function IdentityStatusHeader({
  unitId,
  companyId,
  unit,
  plates,
  latestPosition,
  onQuickAvailability,
  onStatusSaved,
}: {
  unitId: string;
  companyId: string;
  unit: Record<string, unknown>;
  plates: Array<Record<string, unknown>>;
  latestPosition: Record<string, unknown> | null;
  onQuickAvailability: (value: "available" | "booked" | "holding" | null) => void;
  onStatusSaved: () => void;
}) {
  const [modalStatus, setModalStatus] = useState<(typeof STATUSES)[number] | null>(null);
  const currentStatus = String(unit.status ?? "InService");
  const quick = (unit.quick_availability as "available" | "booked" | "holding" | null) ?? null;

  const locationLabel =
    latestPosition?.lat != null
      ? `${Number(latestPosition.lat).toFixed(4)}, ${Number(latestPosition.lng).toFixed(4)}`
      : "Location unavailable";

  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {String(unit.unit_number ?? unitId)} · {[unit.year, unit.make, unit.model].filter(Boolean).join(" ")}
          </h2>
          <p className="text-xs text-gray-600">VIN {String(unit.vin ?? "—")}</p>
          <p className="text-xs text-gray-600">
            Current location: {locationLabel}
            {latestPosition?.captured_at ? ` · ${String(latestPosition.captured_at)}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <label className="text-xs text-gray-600">
            Status
            <select
              className="ml-2 rounded border px-2 py-1 text-sm"
              value={currentStatus}
              onChange={(e) => {
                const next = e.target.value as (typeof STATUSES)[number];
                if (next === currentStatus) return;
                if (next === "InService") {
                  void patchUnit(unitId, { status: "InService" }).then(onStatusSaved);
                  return;
                }
                setModalStatus(next);
              }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <QuickAvailabilityToggle value={quick} onChange={onQuickAvailability} />
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 md:grid-cols-4">
        <div>Title: {String(unit.title_status ?? "—")}</div>
        <div>Lien: {String(unit.lien_holder ?? "—")}</div>
        <div>IRP: {String(unit.texas_irp_number ?? "—")}</div>
        <div>SCT: {String(unit.sct_permit_number ?? "—")}</div>
      </div>
      <PlatesTable
        unitId={unitId}
        companyId={companyId}
        plates={plates.map((p) => ({
          id: String(p.id),
          country: String(p.country),
          jurisdiction: String(p.jurisdiction),
          plate_number: String(p.plate_number),
          expiration: (p.expiration as string) ?? null,
          status: String(p.status),
        }))}
      />
      <StatusChangeModal
        open={modalStatus !== null}
        targetStatus={modalStatus ?? "InService"}
        unitId={unitId}
        onClose={() => setModalStatus(null)}
        onSaved={onStatusSaved}
      />
    </section>
  );
}
