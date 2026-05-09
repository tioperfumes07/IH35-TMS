import { workOrderStatusesCatalogClient } from "../../../api/catalogs-maintenance";
import { MaintenanceCatalogListPage } from "./MaintenanceCatalogListPage";

export function WorkOrderStatusesListPage() {
  return (
    <MaintenanceCatalogListPage client={workOrderStatusesCatalogClient} displayName="Work Order Statuses" breadcrumbPath="Lists & Catalogs / Maintenance / Work Order Statuses" />
  );
}
