import { patchUnit } from "../../api/mdata";
import { properEnumOrFilterLabel } from "../../lib/properDisplayText";
import { QuickAvailabilityToggle } from "./QuickAvailabilityToggle";
import { PlatesTable } from "./PlatesTable";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { SelectCombobox } from "../shared/SelectCombobox";
import { useToast } from "../Toast";
import type { UnitLifecycleStatus } from "./StatusChangeModal";

const STATUS_OPTIONS: Array<{ value: UnitLifecycleStatus; label: string }> = [
  { value: "InService", label: "Active (In Service)" },
  { value: "OutOfService", label: "Out of Service" },
  { value: "InMaintenance", label: "In Maintenance" },
  { value: "Damaged", label: "Damaged" },
  { value: "Sold", label: "Sold" },
  { value: "Transferred", label: "Transferred" },
];

export function IdentityStatusHeader({
  unitId,
  companyId,
  unit,
  plates,
  latestPosition,
  onQuickAvailability,
  quickAvailabilityPending = false,
  onStatusSaved,
  onRequestStatusChange,
}: {
  unitId: string;
  companyId: string;
  unit: Record<string, unknown>;
  plates: Array<Record<string, unknown>>;
  latestPosition: Record<string, unknown> | null;
  onQuickAvailability: (value: "available" | "booked" | "holding" | null) => void;
  quickAvailabilityPending?: boolean;
  onStatusSaved: () => void;
  onRequestStatusChange: (next?: UnitLifecycleStatus) => void;
}) {
  const { pushToast } = useToast();
  const currentStatus = String(unit.status ?? "InService");
  const quick = (unit.quick_availability as "available" | "booked" | "holding" | null) ?? null;
  const known = STATUS_OPTIONS.some((o) => o.value === currentStatus);

  const locationLabel =
    latestPosition?.lat != null
      ? `${Number(latestPosition.lat).toFixed(4)}, ${Number(latestPosition.lng).toFixed(4)}`
      : "Location unavailable";

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            <EntityLinkOrTombstone kind="unit" id={unitId} name={String(unit.unit_number ?? "")} noun="Unit" /> · {[unit.year, unit.make, unit.model].filter(Boolean).join(" ")}
          </h2>
          <p className="text-xs text-gray-600">VIN {String(unit.vin ?? "—")}</p>
          <p className="text-xs text-gray-600">
            Current location: {locationLabel}
            {latestPosition?.captured_at ? ` · ${String(latestPosition.captured_at)}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-xs text-gray-600">
            <span className="block">Status</span>
            <SelectCombobox
              id="vp-identity-status"
              className="mt-1 w-56"
              value={currentStatus}
              onChange={(e) => {
                const next = e.target.value as UnitLifecycleStatus;
                if (next === currentStatus) return;
                if (next === "InService") {
                  void patchUnit(unitId, companyId, { status: "InService" })
                    .then(() => {
                      onStatusSaved();
                      pushToast("Unit status updated", "success");
                    })
                    .catch((error) => {
                      pushToast(error instanceof Error ? error.message : "Failed to update unit status", "error");
                    });
                  return;
                }
                onRequestStatusChange(next);
              }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
              {!known ? <option value={currentStatus}>{properEnumOrFilterLabel(currentStatus)}</option> : null}
            </SelectCombobox>
          </div>
          <QuickAvailabilityToggle value={quick} disabled={quickAvailabilityPending} onChange={onQuickAvailability} />
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
    </section>
  );
}
