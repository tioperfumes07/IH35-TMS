import { ApiError, apiRequest } from "../api/client";
import { getCustomerDetail, getDriver, getUnit } from "../api/mdata";
import type { EntityPickerKind } from "../components/parity/entityPickerRegistry";

export const HELD_ENTITY_MERGED_MESSAGE = "This driver record was merged — reselect.";

const KIND_NOUN: Partial<Record<EntityPickerKind, string>> = {
  driver: "driver",
  unit: "unit",
  trailer: "trailer",
  customer: "customer",
};

export function heldEntityMergedMessage(kind: EntityPickerKind): string {
  const noun = KIND_NOUN[kind] ?? "record";
  return `This ${noun} record was merged — reselect.`;
}

function isSelectableDriver(status: string | undefined, deactivatedAt: string | null | undefined, moneyRoster: boolean): boolean {
  if (deactivatedAt) return false;
  if (status === "Inactive" || status === "Terminated") return false;
  if (moneyRoster) return status === "Active" || status === "Probation" || !status;
  return status !== "Inactive";
}

/** True when the held FK is still a selectable roster row for this company. */
export async function heldEntityIsSelectable(
  kind: EntityPickerKind,
  id: string,
  operatingCompanyId: string,
  opts?: { driverRoster?: "active" | "active_or_probation" }
): Promise<boolean> {
  const trimmed = id.trim();
  if (!trimmed || !operatingCompanyId) return false;
  try {
    if (kind === "driver") {
      const driver = await getDriver(trimmed, operatingCompanyId);
      return isSelectableDriver(
        driver.status,
        driver.deactivated_at,
        opts?.driverRoster === "active_or_probation"
      );
    }
    if (kind === "unit") {
      const unit = await getUnit(trimmed, operatingCompanyId);
      const deactivated = (unit as { deactivated_at?: string | null }).deactivated_at;
      return !deactivated;
    }
    if (kind === "trailer") {
      const row = await apiRequest<{ id: string; deactivated_at?: string | null } | { equipment: { id: string; deactivated_at?: string | null } }>(
        `/api/v1/mdata/equipment/${encodeURIComponent(trimmed)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
      );
      const equipment = "equipment" in row && row.equipment ? row.equipment : (row as { id: string; deactivated_at?: string | null });
      return !equipment.deactivated_at;
    }
    if (kind === "customer") {
      const detail = await getCustomerDetail(trimmed, operatingCompanyId);
      const customer = detail.customer as { deactivated_at?: string | null };
      return !customer?.deactivated_at;
    }
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) return false;
    throw err;
  }
  return true;
}
