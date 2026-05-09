import { maintenancePriorityLevelsCatalogClient } from "../../../api/catalogs-maintenance";
import { MaintenanceCatalogListPage } from "./MaintenanceCatalogListPage";

export function MaintenancePriorityLevelsListPage() {
  return (
    <MaintenanceCatalogListPage client={maintenancePriorityLevelsCatalogClient} displayName="Maintenance Priority Levels" breadcrumbPath="Lists & Catalogs / Maintenance / Priority Levels" />
  );
}
