import { cdlRestrictionsCatalogClient } from "../../../../api/lists-drivers-catalogs";
import { DriversReferenceCatalogPage } from "../DriversReferenceCatalogPage";

export function Catalog() {
  return (
    <DriversReferenceCatalogPage
      client={cdlRestrictionsCatalogClient}
      displayName="CDL Restrictions"
      catalogKey="restrictions"
    />
  );
}
