import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";

const TABS = [
  { id: "contracts", label: "Contracts", to: "/legal/contracts" },
  { id: "templates", label: "Templates", to: "/legal/templates" },
  { id: "policies", label: "Policies", to: "/legal/policies" },
  { id: "attorney-review", label: "Attorney Review", to: "/legal/attorney-review" },
  { id: "matters", label: "Matters", to: "/legal/matters" },
  { id: "reports", label: "Reports", to: "/legal/reports" },
] as const;

export function LegalModuleTabs() {
  return (
    <NavyPageSubNav
      items={TABS.map((tab) => ({ label: tab.label, to: tab.to }))}
    />
  );
}
