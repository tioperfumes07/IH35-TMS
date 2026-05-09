import { maintenancePartsCatalogClient } from "../../../api/catalogs-maintenance";
import { MaintenanceCatalogListPage } from "./MaintenanceCatalogListPage";

export function MaintenancePartsListPage() {
  return (
    <MaintenanceCatalogListPage client={maintenancePartsCatalogClient} displayName="Maintenance Parts" breadcrumbPath="Lists & Catalogs / Maintenance / Parts" />
  );
}
