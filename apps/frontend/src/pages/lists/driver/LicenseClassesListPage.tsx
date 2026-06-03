import { licenseClassesCatalogClient } from "../../../api/catalogs-driver";
import { DriverCatalogListPage } from "./DriverCatalogListPage";

export function LicenseClassesListPage() {
  return (
    <DriverCatalogListPage
      client={licenseClassesCatalogClient}
      displayName="License Classes"
      breadcrumbPath="Lists & Catalogs / Driver / License Classes"
    />
  );
}
