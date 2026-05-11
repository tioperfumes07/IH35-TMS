import { detentionReasonsCatalogClient } from "../../../api/catalogs-dispatch";
import { DispatchCatalogListPage } from "./DispatchCatalogListPage";

export function DetentionReasonsListPage() {
  return (
    <DispatchCatalogListPage
      catalogKey="detention-reasons"
      title="Detention Reasons"
      description="Manage detention reason codes used on dispatch delays and billing notes."
      client={detentionReasonsCatalogClient}
    />
  );
}
