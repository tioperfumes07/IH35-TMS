import { useLocation, useNavigate } from "react-router-dom";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { FINANCE_HUB_LOAN_WIZARD_FLAG } from "../../api/financeLoanWizard";
import { FINANCE_HUB_CALCULATOR_FLAG } from "../../api/financeCalculator";

const baseTabs = [
  { id: "overview", label: "Overview", to: "/finance" },
  { id: "projections", label: "Projections", to: "/finance/projections" },
  { id: "scenarios", label: "Scenarios", to: "/finance/scenarios" },
];

export function FinanceModuleTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { selectedCompanyId } = useCompanyContext();
  // Loan Wizard tab only appears once its OFF-by-default flag is enabled (Tier-3 gate).
  const { enabled: loanWizardEnabled } = useFeatureFlag(FINANCE_HUB_LOAN_WIZARD_FLAG, selectedCompanyId ?? undefined);
  const { enabled: calculatorEnabled } = useFeatureFlag(FINANCE_HUB_CALCULATOR_FLAG, selectedCompanyId ?? undefined);
  const tabs = [
    ...baseTabs,
    ...(loanWizardEnabled ? [{ id: "loan-wizard", label: "Loan Wizard", to: "/finance/loan-wizard" }] : []),
    ...(calculatorEnabled ? [{ id: "calculator", label: "Calculator", to: "/finance/calculator" }] : []),
  ];

  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex space-x-6" aria-label="Finance">
        {tabs.map((tab) => {
          const isActive = currentPath === tab.to;
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.to)}
              className={[
                "whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium",
                isActive
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
