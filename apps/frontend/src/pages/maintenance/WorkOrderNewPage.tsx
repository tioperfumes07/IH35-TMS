import { Navigate, useSearchParams } from "react-router-dom";

/**
 * D24 — Create Work Order is a modal on Maintenance Home, never a blank full-page shell.
 * Legacy deep links (/maintenance/work-orders/new?unit_id=…) redirect into ?create_wo=1 so the
 * wizard opens as the same CreateWorkOrderModal already mounted on MaintenanceHome.
 * Route retained (never delete).
 */
export function WorkOrderNewPage() {
  const [searchParams] = useSearchParams();
  const unitId = searchParams.get("unit_id")?.trim() ?? "";
  const equipmentId = searchParams.get("equipment_id")?.trim() ?? "";
  const next = new URLSearchParams();
  next.set("create_wo", "1");
  if (unitId) next.set("unit_id", unitId);
  if (equipmentId) next.set("equipment_id", equipmentId);
  return <Navigate to={`/maintenance?${next.toString()}`} replace />;
}
