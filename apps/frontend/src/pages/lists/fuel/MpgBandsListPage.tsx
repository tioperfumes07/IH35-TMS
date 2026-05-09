import { mpgBandsCatalogClient } from "../../../api/catalogs-fuel";
import { FuelCatalogListPage } from "./FuelCatalogListPage";

export function MpgBandsListPage() {
  return (
    <FuelCatalogListPage client={mpgBandsCatalogClient} displayName="MPG Bands" breadcrumbPath="Lists & Catalogs / Fuel / MPG Bands" />
  );
}
