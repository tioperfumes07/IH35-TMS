import { medicalCardStatusesCatalogClient } from "../../../api/catalogs-driver";
import { DriverCatalogListPage } from "./DriverCatalogListPage";

export function MedicalCardStatusesListPage() {
  return (
    <DriverCatalogListPage
      client={medicalCardStatusesCatalogClient}
      displayName="Medical Card Status"
      breadcrumbPath="Lists & Catalogs / Driver / Medical Card Status"
    />
  );
}
