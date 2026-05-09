import { driverPayTypesCatalogClient } from "../../../api/catalogs-driver";
import { DriverCatalogListPage } from "./DriverCatalogListPage";

export function DriverPayTypesListPage() {
  return (
    <DriverCatalogListPage client={driverPayTypesCatalogClient} displayName="Driver Pay Types" breadcrumbPath="Lists & Catalogs / Driver / Driver Pay Types" />
  );
}
