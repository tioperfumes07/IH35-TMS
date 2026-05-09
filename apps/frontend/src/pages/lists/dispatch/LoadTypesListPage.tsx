import { loadTypesCatalogClient } from "../../../api/catalogs-dispatch";
import { DispatchCatalogListPage } from "./DispatchCatalogListPage";

export function LoadTypesListPage() {
  return (
    <DispatchCatalogListPage client={loadTypesCatalogClient} displayName="Load Types" breadcrumbPath="Lists & Catalogs / Dispatch / Load Types" />
  );
}
