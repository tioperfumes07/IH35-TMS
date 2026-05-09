import { maintenanceVendorsCatalogClient } from "../../../api/catalogs-maintenance";
import { MaintenanceCatalogListPage } from "./MaintenanceCatalogListPage";

export function MaintenanceVendorsListPage() {
  return (
    <MaintenanceCatalogListPage client={maintenanceVendorsCatalogClient} displayName="Maintenance Vendors" breadcrumbPath="Lists & Catalogs / Maintenance / Vendors" />
  );
}
