import { maintenanceServiceTasksCatalogClient } from "../../../api/catalogs-maintenance";
import { MaintenanceCatalogListPage } from "./MaintenanceCatalogListPage";

export function MaintenanceServiceTasksListPage() {
  return (
    <MaintenanceCatalogListPage client={maintenanceServiceTasksCatalogClient} displayName="Maintenance Service Tasks" breadcrumbPath="Lists & Catalogs / Maintenance / Service Tasks" />
  );
}
