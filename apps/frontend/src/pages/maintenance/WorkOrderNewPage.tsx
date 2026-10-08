import { useNavigate, useSearchParams } from "react-router-dom";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { CreateWorkOrderModal } from "./components/CreateWorkOrderModal";

/**
 * D24 — Create Work Order is the same canonical CreateWorkOrderModal wherever it is opened.
 * Legacy deep links (/maintenance/work-orders/new?unit_id=… or ?equipment_id=…) mount the modal
 * directly on this retained route (never a blank full-page shell) with the unit/equipment
 * prefilled; closing or creating returns to Maintenance Home.
 */
export function WorkOrderNewPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const unitId = searchParams.get("unit_id")?.trim() ?? "";
  const equipmentId = searchParams.get("equipment_id")?.trim() ?? "";
  const companyId = typeof selectedCompanyId === "string" ? selectedCompanyId : "";
  const goHome = () => navigate("/maintenance", { replace: true });
  if (!companyId) return null;
  return (
    <CreateWorkOrderModal
      open
      operatingCompanyId={companyId}
      initialValues={{ unit_id: unitId, equipment_id: equipmentId }}
      onClose={goHome}
      onCreated={goHome}
    />
  );
}
