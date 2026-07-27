import { driverDeductionTypesCatalogClient } from "../../../api/catalogs-driver";
import { DriverCatalogListPage } from "./DriverCatalogListPage";

export function DriverDeductionTypesListPage() {
  return (
    <DriverCatalogListPage
      client={driverDeductionTypesCatalogClient}
      displayName="Driver Deduction Types"
      breadcrumbPath="Lists & Catalogs / Driver / Driver Deduction Types"
      optionalBooleans={[
        { key: "may_draw_escrow", label: "May draw escrow" },
        { key: "survives_separation", label: "Survives separation" },
      ]}
    />
  );
}
