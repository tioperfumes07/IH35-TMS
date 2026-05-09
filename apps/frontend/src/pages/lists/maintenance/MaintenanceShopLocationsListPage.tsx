import { maintenanceShopLocationsCatalogClient } from "../../../api/catalogs-maintenance";
import { MaintenanceCatalogListPage } from "./MaintenanceCatalogListPage";

export function MaintenanceShopLocationsListPage() {
  return (
    <MaintenanceCatalogListPage client={maintenanceShopLocationsCatalogClient} displayName="Maintenance Shop Locations" breadcrumbPath="Lists & Catalogs / Maintenance / Shop Locations" />
  );
}
