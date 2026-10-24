import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";

const TABS = [
  { id: "landing", label: "Landing", to: "/insurance" },
  { id: "policies", label: "Policies", to: "/insurance/policies" },
  { id: "fleet-covered", label: "Fleet Covered", to: "/insurance/fleet-covered" },
  { id: "type-catalog", label: "Type Catalog", to: "/insurance/type-catalog" },
  { id: "coverage-gaps", label: "Coverage Gaps", to: "/insurance/coverage-gaps" },
  { id: "claims", label: "Claims", to: "/insurance/claims" },
] as const;

export function InsuranceModuleTabs() {
  return (
    <NavyPageSubNav
      items={TABS.map((tab) => ({ label: tab.label, to: tab.to }))}
    />
  );
}
