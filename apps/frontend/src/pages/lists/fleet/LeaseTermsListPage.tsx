import { leaseTermsCatalogClient } from "../../../api/catalogs-fleet";
import { FleetCatalogListPage } from "./FleetCatalogListPage";

export function LeaseTermsListPage() {
  return (
    <FleetCatalogListPage client={leaseTermsCatalogClient} displayName="Lease Terms" breadcrumbPath="Lists & Catalogs / Fleet / Lease Terms" />
  );
}
