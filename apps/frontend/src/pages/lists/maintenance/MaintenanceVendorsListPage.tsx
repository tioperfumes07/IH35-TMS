import { Link, useLocation } from "react-router-dom";
import { currentOriginHref, withReturnContext } from "../../../lib/returnContext";
import { maintenanceVendorsCatalogClient } from "../../../api/catalogs-maintenance";
import { MaintenanceCatalogListPage } from "./MaintenanceCatalogListPage";

export function MaintenanceVendorsListPage() {
  const { pathname, search: locSearch } = useLocation();
  const originHref = currentOriginHref(pathname, locSearch);
  const maintHref = (target: string) => withReturnContext(target, originHref);
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-600">
        Full vendor master with CSV import and WO history:{" "}
        <Link className="font-medium text-[#1F2A44] underline" to={maintHref("/maintenance/vendors")}>
          Maintenance Vendors hub
        </Link>
        .
      </p>
      <MaintenanceCatalogListPage client={maintenanceVendorsCatalogClient} displayName="Maintenance Vendors" breadcrumbPath="Lists & Catalogs / Maintenance / Vendors" />
    </div>
  );
}
