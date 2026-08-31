import { Link } from "react-router-dom";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { FINANCE_HUB_LOAN_WIZARD_FLAG } from "../../api/financeLoanWizard";
import { FINANCE_HUB_CALCULATOR_FLAG } from "../../api/financeCalculator";
import { FINANCE_HUB_AMORTIZATION_FLAG } from "../../api/financeAmortization";
import { FINANCE_BREAK_EVEN_UI_FLAG } from "../../api/financeBreakEven";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";

// FIN-2 unified subnav: one tab set across the whole Finance module. Hub is the real read-only dashboard
// (the sidebar "FINANCE HUB" entry lands here); Statements + AR/AP Aging were previously reachable only from
// the sidebar flyout — surfaced here so every finance page shares the same navigation. Existing tabs are kept
// in place (additive-only, no reorder); the new tabs are appended. Each destination page self-gates behind
// its own feature flag and shows an honest disabled state when off.
const baseTabs = [
  { id: "overview", label: "Overview", to: "/finance/overview" },
  { id: "projections", label: "Projections", to: "/finance/projections" },
  { id: "scenarios", label: "Scenarios", to: "/finance/scenarios" },
  { id: "hub", label: "Hub", to: "/finance" },
  { id: "statements", label: "Statements", to: "/finance/statements" },
  { id: "ar-ap-aging", label: "AR/AP Aging", to: "/finance/ar-ap-aging" },
];

export function FinanceModuleTabs() {
  const { selectedCompanyId } = useCompanyContext();
  const { enabled: loanWizardEnabled } = useFeatureFlag(FINANCE_HUB_LOAN_WIZARD_FLAG, selectedCompanyId ?? undefined);
  const { enabled: calculatorEnabled } = useFeatureFlag(FINANCE_HUB_CALCULATOR_FLAG, selectedCompanyId ?? undefined);
  const { enabled: amortizationEnabled } = useFeatureFlag(FINANCE_HUB_AMORTIZATION_FLAG, selectedCompanyId ?? undefined);
  const { enabled: breakEvenEnabled } = useFeatureFlag(FINANCE_BREAK_EVEN_UI_FLAG, selectedCompanyId ?? undefined);
  const tabs = [
    ...baseTabs,
    ...(breakEvenEnabled ? [{ id: "break-even", label: "Break-Even", to: "/finance/break-even" }] : []),
    ...(loanWizardEnabled ? [{ id: "loan-wizard", label: "Loan Wizard", to: "/finance/loan-wizard" }] : []),
    ...(calculatorEnabled ? [{ id: "calculator", label: "Calculator", to: "/finance/calculator" }] : []),
    ...(amortizationEnabled ? [{ id: "amortization", label: "Amortization", to: "/finance/amortization" }] : []),
  ];

  return (
    <div className="space-y-2">
      <NavyPageSubNav
        items={tabs.map((tab) => ({ label: tab.label, to: tab.to }))}
      />
      <nav
        aria-label="Finance related modules"
        className="flex flex-wrap items-center gap-3 pb-2 text-xs"
        data-testid="finance-cross-module-links"
      >
        <span className="font-semibold text-slate-500">Related:</span>
        <Link className="font-medium text-slate-700 underline-offset-2 hover:underline" to="/accounting">
          Accounting
        </Link>
        <Link className="font-medium text-slate-700 underline-offset-2 hover:underline" to="/cash-flow">
          Cash Flow
        </Link>
        <Link className="font-medium text-slate-700 underline-offset-2 hover:underline" to="/reports/profit-loss">
          Profit &amp; Loss
        </Link>
      </nav>
    </div>
  );
}
