import { escrowTypesCatalogClient } from "../../../api/catalogs-driver";
import { DriverCatalogListPage } from "./DriverCatalogListPage";

export function EscrowTypesListPage() {
  return (
    <DriverCatalogListPage
      client={escrowTypesCatalogClient}
      displayName="Escrow Types"
      breadcrumbPath="Lists & Catalogs / Driver / Escrow Types"
      optionalBooleans={[{ key: "may_draw_escrow", label: "May draw escrow" }]}
    />
  );
}
