import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { CreateWorkOrderModal } from "./components/CreateWorkOrderModal";

/** Deep-link target for fleet ActionBar: /maintenance/work-orders/new?unit_id=:id */
export function WorkOrderNewPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const unitId = searchParams.get("unit_id")?.trim() ?? "";
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!open) navigate("/maintenance", { replace: true });
  }, [open, navigate]);

  if (!selectedCompanyId) {
    return <div className="p-4 text-sm text-gray-500">Select a company to create a work order.</div>;
  }

  return (
    <CreateWorkOrderModal
      open={open}
      operatingCompanyId={selectedCompanyId}
      initialValues={unitId ? { unit_id: unitId } : undefined}
      onClose={() => setOpen(false)}
      onCreated={() => setOpen(false)}
    />
  );
}
