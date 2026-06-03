import { employmentStatusesCatalogClient } from "../../../api/catalogs-driver";
import { DriverCatalogListPage } from "./DriverCatalogListPage";

export function EmploymentStatusesListPage() {
  return (
    <DriverCatalogListPage
      client={employmentStatusesCatalogClient}
      displayName="Employment Status"
      breadcrumbPath="Lists & Catalogs / Driver / Employment Status"
    />
  );
}
