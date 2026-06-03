import { employmentStatusCatalogClient } from "../../../../api/lists-drivers-catalogs";
import { DriversReferenceCatalogPage } from "../DriversReferenceCatalogPage";

export function Catalog() {
  return (
    <DriversReferenceCatalogPage
      client={employmentStatusCatalogClient}
      displayName="Employment Status"
      catalogKey="employment-status"
    />
  );
}
