import { loadTypesCatalogClient } from "../../../api/catalogs-dispatch";
import { DispatchCatalogListPage } from "./DispatchCatalogListPage";

export function LoadTypesListPage() {
  return (
    <DispatchCatalogListPage
      catalogKey="load-types"
      title="Load Types"
      description="Manage the load type catalog used for dispatch planning and lane matching."
      client={loadTypesCatalogClient}
    />
  );
}
