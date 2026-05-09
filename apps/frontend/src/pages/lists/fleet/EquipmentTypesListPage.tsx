import { equipmentTypesFleetCatalogClient } from "../../../api/catalogs-fleet";
import { FleetCatalogListPage } from "./FleetCatalogListPage";

export function EquipmentTypesListPage() {
  return <FleetCatalogListPage client={equipmentTypesFleetCatalogClient} displayName="Equipment Types" breadcrumbPath="Lists & Catalogs / Fleet / Equipment Types" />;
}
