import { Link } from "react-router-dom";
import { maintenanceVendorsCatalogClient } from "../../../api/catalogs-maintenance";
import { MaintenanceCatalogListPage } from "./MaintenanceCatalogListPage";

export function MaintenanceVendorsListPage() {
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-600">
        Full vendor master with CSV import and WO history:{" "}
        <Link className="font-medium text-[#1F2A44] underline" to="/maintenance/vendors">
          Maintenance Vendors hub
        </Link>
        .
      </p>
      <MaintenanceCatalogListPage client={maintenanceVendorsCatalogClient} displayName="Maintenance Vendors" breadcrumbPath="Lists & Catalogs / Maintenance / Vendors" />
    </div>
  );
}
