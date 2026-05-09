import { payRateTemplatesCatalogClient } from "../../../api/catalogs-driver";
import { DriverCatalogListPage } from "./DriverCatalogListPage";

export function PayRateTemplatesListPage() {
  return (
    <DriverCatalogListPage client={payRateTemplatesCatalogClient} displayName="Pay Rate Templates" breadcrumbPath="Lists & Catalogs / Driver / Pay Rate Templates" />
  );
}
