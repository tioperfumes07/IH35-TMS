import { fuelStopReasonCodesCatalogClient } from "../../../api/catalogs-fuel";
import { FuelCatalogListPage } from "./FuelCatalogListPage";

export function FuelStopReasonCodesListPage() {
  return (
    <FuelCatalogListPage client={fuelStopReasonCodesCatalogClient} displayName="Fuel Stop Reason Codes" breadcrumbPath="Lists & Catalogs / Fuel / Stop Reason Codes" />
  );
}
