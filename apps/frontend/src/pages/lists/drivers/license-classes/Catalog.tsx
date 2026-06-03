import { licenseClassesCatalogClient } from "../../../../api/lists-drivers-catalogs";
import { DriversReferenceCatalogPage } from "../DriversReferenceCatalogPage";

export function Catalog() {
  return (
    <DriversReferenceCatalogPage
      client={licenseClassesCatalogClient}
      displayName="License Classes"
      catalogKey="license-classes"
    />
  );
}
