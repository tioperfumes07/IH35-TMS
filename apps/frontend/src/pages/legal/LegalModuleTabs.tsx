import { useNavigate } from "react-router-dom";
import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";

const LEGAL_TABS = [
  { id: "contracts", label: "Contracts", to: "/legal/contracts" },
  { id: "templates", label: "Templates", to: "/legal/templates" },
  { id: "policies", label: "Policies", to: "/legal/policies" },
  { id: "attorney-review", label: "Attorney Review", to: "/legal/attorney-review" },
] as const;

export function LegalModuleTabs({ activeTabId }: { activeTabId: (typeof LEGAL_TABS)[number]["id"] }) {
  const navigate = useNavigate();
  return (
    <SecondaryNavTabs
      tabs={LEGAL_TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
      activeId={activeTabId}
      onChange={(next) => {
        const target = LEGAL_TABS.find((tab) => tab.id === next);
        if (target) navigate(target.to);
      }}
      className="rounded border border-gray-200"
    />
  );
}
