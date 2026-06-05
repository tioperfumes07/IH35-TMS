/**
 * CLOSURE-4 P5-T12 + CLOSURE-5 P5-T13 + CLOSURE-6 P5-T14 — additive Drivers sub-tabs.
 * Lane A: Disputes · Lane B: Auto-deductions + Team Splits · do not remove other tabs when merging.
 */
import { NavLink, useLocation } from "react-router-dom";
import { DriversPage as CanonicalDriversPage } from "../Drivers";
import { DRIVERS_SUBNAV, type DriversSubnavId } from "../../components/drivers/DRIVERS_TABS_CONFIG";
import { DRIVERS_SUBTAB_PATH, driversSubtabFromPath } from "../../router/route-manifest";
import { AutoDeductionPoliciesPanel } from "./AutoDeductionPolicies";
import { useSettlementDisputes } from "../../hooks/useSettlementDisputes";
import { SettlementDisputeList } from "./SettlementDisputeList";
import { TeamSplitConfigPanel } from "./TeamSplitConfig";

export const DRIVERS_AUTO_DEDUCTIONS_SUBTAB_ID = "auto_deductions" as const;
export const DRIVERS_AUTO_DEDUCTIONS_SUBTAB_PATH = "/drivers/auto-deductions";
export const DRIVERS_DISPUTES_SUBTAB_ID = "disputes" as const;
export const DRIVERS_DISPUTES_SUBTAB_PATH = "/drivers/disputes";
export const DRIVERS_TEAM_SPLITS_SUBTAB_ID = "team_splits" as const;
export const DRIVERS_TEAM_SPLITS_SUBTAB_PATH = "/drivers/team-splits";

type ExtendedSubtabId =
  | DriversSubnavId
  | typeof DRIVERS_AUTO_DEDUCTIONS_SUBTAB_ID
  | typeof DRIVERS_DISPUTES_SUBTAB_ID
  | typeof DRIVERS_TEAM_SPLITS_SUBTAB_ID;

const EXTENDED_SUBNAV: Array<{ id: ExtendedSubtabId; label: string; to: string }> = [
  ...DRIVERS_SUBNAV.slice(0, 8).map((tab) => ({ id: tab.id, label: tab.label, to: DRIVERS_SUBTAB_PATH[tab.id] })),
  { id: DRIVERS_AUTO_DEDUCTIONS_SUBTAB_ID, label: "Auto-deductions", to: DRIVERS_AUTO_DEDUCTIONS_SUBTAB_PATH },
  { id: DRIVERS_TEAM_SPLITS_SUBTAB_ID, label: "Team Splits", to: DRIVERS_TEAM_SPLITS_SUBTAB_PATH },
  { id: DRIVERS_DISPUTES_SUBTAB_ID, label: "Disputes", to: DRIVERS_DISPUTES_SUBTAB_PATH },
  ...DRIVERS_SUBNAV.slice(8).map((tab) => ({ id: tab.id, label: tab.label, to: DRIVERS_SUBTAB_PATH[tab.id] })),
];

type DriversPageProps = {
  initialSubnav?: ExtendedSubtabId;
};

function DriversExtendedSubnav({ activeSubtab }: { activeSubtab: string }) {
  const { openCount } = useSettlementDisputes();

  return (
    <div className="overflow-x-auto border-b border-gray-200 bg-white px-2 py-1" data-testid="drivers-extended-subnav">
      <div className="flex min-w-max gap-4">
        {EXTENDED_SUBNAV.map((tab) => {
          const active = activeSubtab === tab.id;
          const badge = tab.id === DRIVERS_DISPUTES_SUBTAB_ID && openCount > 0 ? ` (${openCount})` : "";
          return (
            <NavLink
              key={`${tab.id}-${tab.to}`}
              to={tab.to}
              data-testid={
                tab.id === DRIVERS_AUTO_DEDUCTIONS_SUBTAB_ID
                  ? "drivers-auto-deductions-tab"
                  : tab.id === DRIVERS_TEAM_SPLITS_SUBTAB_ID
                    ? "drivers-team-splits-tab"
                    : tab.id === DRIVERS_DISPUTES_SUBTAB_ID
                      ? "drivers-disputes-tab"
                      : undefined
              }
              className={`pb-0.5 text-xs font-semibold ${
                active ? "border-b-2 border-[#1f2a44] text-[#1f2a44]" : "border-b-2 border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
              {badge}
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
  const showTeamSplits = subnavTab === DRIVERS_TEAM_SPLITS_SUBTAB_ID || location.pathname === DRIVERS_TEAM_SPLITS_SUBTAB_PATH;
  const showDisputes = subnavTab === DRIVERS_DISPUTES_SUBTAB_ID || location.pathname === DRIVERS_DISPUTES_SUBTAB_PATH;

  if (showAutoDeductions) {
    return (
      <div className="space-y-3" data-testid="drivers-page-auto-deductions">
        <DriversExtendedSubnav activeSubtab={DRIVERS_AUTO_DEDUCTIONS_SUBTAB_ID} />
        <AutoDeductionPoliciesPanel />
      </div>
    );
  }

  if (showTeamSplits) {
    return (
      <div className="space-y-3" data-testid="drivers-page-team-splits">
        <DriversExtendedSubnav activeSubtab={DRIVERS_TEAM_SPLITS_SUBTAB_ID} />
        <TeamSplitConfigPanel />
      </div>
    );
  }

  if (showDisputes) {
    return (
      <div className="space-y-3" data-testid="drivers-page-disputes">
        <DriversExtendedSubnav activeSubtab={DRIVERS_DISPUTES_SUBTAB_ID} />
        <SettlementDisputeList />
      </div>
    );
  }

  return <CanonicalDriversPage initialSubnav={initialSubnav as DriversSubnavId | undefined} />;
}

export { CanonicalDriversPage };
