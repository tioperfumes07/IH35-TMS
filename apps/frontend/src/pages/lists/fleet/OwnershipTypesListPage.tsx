import { ownershipTypesCatalogClient } from "../../../api/catalogs-fleet";
import { FleetCatalogListPage } from "./FleetCatalogListPage";

export function OwnershipTypesListPage() {
  return <FleetCatalogListPage client={ownershipTypesCatalogClient} displayName="Ownership Types" breadcrumbPath="Lists & Catalogs / Fleet / Ownership Types" />;
}
