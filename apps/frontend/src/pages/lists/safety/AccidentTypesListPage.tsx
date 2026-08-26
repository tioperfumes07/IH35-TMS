import { accidentTypesGenericCatalogClient } from "../../../api/catalogs-safety";
import { SafetyGenericCatalogListPage } from "./SafetyGenericCatalogListPage";

export function AccidentTypesListPage() {
  return (
    <SafetyGenericCatalogListPage
      client={accidentTypesGenericCatalogClient}
      displayName="Accident Types"
      breadcrumbPath="Lists & Catalogs / Safety / Accident Types"
    />
  );
}
