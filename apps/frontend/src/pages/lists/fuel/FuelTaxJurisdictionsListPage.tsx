import { fuelTaxJurisdictionsCatalogClient } from "../../../api/catalogs-fuel";
import { FuelCatalogListPage } from "./FuelCatalogListPage";

export function FuelTaxJurisdictionsListPage() {
  return (
    <FuelCatalogListPage client={fuelTaxJurisdictionsCatalogClient} displayName="Fuel Tax Jurisdictions" breadcrumbPath="Lists & Catalogs / Fuel / Tax Jurisdictions" />
  );
}
