import { medicalCardStatusCatalogClient } from "../../../../api/lists-drivers-catalogs";
import { DriversReferenceCatalogPage } from "../DriversReferenceCatalogPage";

export function Catalog() {
  return (
    <DriversReferenceCatalogPage
      client={medicalCardStatusCatalogClient}
      displayName="Medical Card Status"
      catalogKey="medical-card-status"
    />
  );
}
