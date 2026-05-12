import { useNavigate } from "react-router-dom";
import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";

const TABS = [
  { id: "contracts", label: "Contracts", to: "/legal/contracts" },
  { id: "templates", label: "Templates", to: "/legal/templates" },
  { id: "policies", label: "Policies", to: "/legal/policies" },
  { id: "attorney-review", label: "Attorney Review", to: "/legal/attorney-review" },
  { id: "matters", label: "Matters", to: "/legal/matters" },
  { id: "reports", label: "Reports", to: "/legal/reports" },
] as const;

export function LegalModuleTabs({ activeTabId }: { activeTabId: (typeof TABS)[number]["id"] }) {
  const navigate = useNavigate();
  return (
    <SecondaryNavTabs
      tabs={TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
      activeId={activeTabId}
      onChange={(next) => {
        const target = TABS.find((tab) => tab.id === next);
        if (target) navigate(target.to);
      }}
      className="rounded border border-gray-200"
    />
  );
}
