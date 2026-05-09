import { conditionCodesCatalogClient } from "../../../api/catalogs-fleet";
import { FleetCatalogListPage } from "./FleetCatalogListPage";

export function ConditionCodesListPage() {
  return <FleetCatalogListPage client={conditionCodesCatalogClient} displayName="Condition Codes" breadcrumbPath="Lists & Catalogs / Fleet / Condition Codes" />;
}
