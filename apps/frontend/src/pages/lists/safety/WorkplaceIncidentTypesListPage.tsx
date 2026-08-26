import { workplaceIncidentTypesCatalogClient } from "../../../api/catalogs-safety";
import { SafetyGenericCatalogListPage } from "./SafetyGenericCatalogListPage";

export function WorkplaceIncidentTypesListPage() {
  return (
    <SafetyGenericCatalogListPage
      client={workplaceIncidentTypesCatalogClient}
      displayName="Workplace Incident Types"
      breadcrumbPath="Lists & Catalogs / Safety / Workplace Incident Types"
    />
  );
}
