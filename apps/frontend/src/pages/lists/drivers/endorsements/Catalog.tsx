import { cdlEndorsementsCatalogClient } from "../../../../api/lists-drivers-catalogs";
import { DriversReferenceCatalogPage } from "../DriversReferenceCatalogPage";

export function Catalog() {
  return (
    <DriversReferenceCatalogPage
      client={cdlEndorsementsCatalogClient}
      displayName="CDL Endorsements"
      catalogKey="endorsements"
    />
  );
}
