/**
 * CLOSURE-4 P5-T12 — additive Drivers "Auto-deductions" sub-tab.
 * Lane A may add Disputes tab in this file; do not remove other tabs when merging.
 */
import { NavLink, useLocation } from "react-router-dom";
import { DriversPage as CanonicalDriversPage } from "../Drivers";
import { DRIVERS_SUBNAV, type DriversSubnavId } from "../../components/drivers/DRIVERS_TABS_CONFIG";
import { DRIVERS_SUBTAB_PATH, driversSubtabFromPath } from "../../router/route-manifest";
import { AutoDeductionPoliciesPanel } from "./AutoDeductionPolicies";

export const DRIVERS_AUTO_DEDUCTIONS_SUBTAB_ID = "auto_deductions" as const;
export const DRIVERS_AUTO_DEDUCTIONS_SUBTAB_PATH = "/drivers/auto-deductions";

const EXTENDED_SUBNAV: Array<{ id: DriversSubnavId | typeof DRIVERS_AUTO_DEDUCTIONS_SUBTAB_ID; label: string; to: string }> = [
  ...DRIVERS_SUBNAV.slice(0, 8).map((tab) => ({ id: tab.id, label: tab.label, to: DRIVERS_SUBTAB_PATH[tab.id] })),
  { id: DRIVERS_AUTO_DEDUCTIONS_SUBTAB_ID, label: "Auto-deductions", to: DRIVERS_AUTO_DEDUCTIONS_SUBTAB_PATH },
  ...DRIVERS_SUBNAV.slice(8).map((tab) => ({ id: tab.id, label: tab.label, to: DRIVERS_SUBTAB_PATH[tab.id] })),
];

type DriversPageProps = {
  initialSubnav?: DriversSubnavId | typeof DRIVERS_AUTO_DEDUCTIONS_SUBTAB_ID;
};

function DriversAutoDeductionsSubnav({ activeSubtab }: { activeSubtab: string }) {
  return (
    <div className="overflow-x-auto border-b border-gray-200 bg-white px-2 py-1" data-testid="drivers-auto-deductions-subnav">
      <div className="flex min-w-max gap-4">
        {EXTENDED_SUBNAV.map((tab) => {
          const active = activeSubtab === tab.id;
          return (
            <NavLink
              key={tab.id}
              to={tab.to}
              data-testid={tab.id === DRIVERS_AUTO_DEDUCTIONS_SUBTAB_ID ? "drivers-auto-deductions-tab" : undefined}
              className={`pb-0.5 text-xs font-semibold ${
                active ? "border-b-2 border-[#1f2a44] text-[#1f2a44]" : "border-b-2 border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

export function DriversPage({ initialSubnav }: DriversPageProps = {}) {
  const location = useLocation();
  const subnavTab = (initialSubnav ?? driversSubtabFromPath(location.pathname)) as string;
  const showAutoDeductions =
    subnavTab === DRIVERS_AUTO_DEDUCTIONS_SUBTAB_ID || location.pathname === DRIVERS_AUTO_DEDUCTIONS_SUBTAB_PATH;

  if (!showAutoDeductions) {
    return <CanonicalDriversPage initialSubnav={initialSubnav as DriversSubnavId | undefined} />;
  }

  return (
    <div className="space-y-3" data-testid="drivers-page-auto-deductions">
      <DriversAutoDeductionsSubnav activeSubtab={DRIVERS_AUTO_DEDUCTIONS_SUBTAB_ID} />
      <AutoDeductionPoliciesPanel />
    </div>
  );
}

export { CanonicalDriversPage };
