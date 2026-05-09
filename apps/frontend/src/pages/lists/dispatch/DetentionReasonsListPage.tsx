import { detentionReasonsCatalogClient } from "../../../api/catalogs-dispatch";
import { DispatchCatalogListPage } from "./DispatchCatalogListPage";

export function DetentionReasonsListPage() {
  return (
    <DispatchCatalogListPage client={detentionReasonsCatalogClient} displayName="Detention Reasons" breadcrumbPath="Lists & Catalogs / Dispatch / Detention Reasons" />
  );
}
