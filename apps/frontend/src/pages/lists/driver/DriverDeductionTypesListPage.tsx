import { driverDeductionTypesCatalogClient } from "../../../api/catalogs-driver";
import { DriverCatalogListPage } from "./DriverCatalogListPage";

export function DriverDeductionTypesListPage() {
  return (
    <DriverCatalogListPage client={driverDeductionTypesCatalogClient} displayName="Driver Deduction Types" breadcrumbPath="Lists & Catalogs / Driver / Driver Deduction Types" />
  );
}
