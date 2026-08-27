import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { FINANCE_HUB_LOAN_WIZARD_FLAG } from "../../api/financeLoanWizard";
import { FINANCE_HUB_CALCULATOR_FLAG } from "../../api/financeCalculator";
import { FINANCE_HUB_AMORTIZATION_FLAG } from "../../api/financeAmortization";
import { FINANCE_BREAK_EVEN_UI_FLAG } from "../../api/financeBreakEven";

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
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { selectedCompanyId } = useCompanyContext();
  // Loan Wizard tab only appears once its OFF-by-default flag is enabled (Tier-3 gate).
  const { enabled: loanWizardEnabled } = useFeatureFlag(FINANCE_HUB_LOAN_WIZARD_FLAG, selectedCompanyId ?? undefined);
  const { enabled: calculatorEnabled } = useFeatureFlag(FINANCE_HUB_CALCULATOR_FLAG, selectedCompanyId ?? undefined);
  const { enabled: amortizationEnabled } = useFeatureFlag(FINANCE_HUB_AMORTIZATION_FLAG, selectedCompanyId ?? undefined);
  // F1 Break-Even Analysis tab only appears once its OFF-by-default flag is enabled (owner sign-off gate).
  const { enabled: breakEvenEnabled } = useFeatureFlag(FINANCE_BREAK_EVEN_UI_FLAG, selectedCompanyId ?? undefined);
  const tabs = [
    ...baseTabs,
    ...(breakEvenEnabled ? [{ id: "break-even", label: "Break-Even", to: "/finance/break-even" }] : []),
    ...(loanWizardEnabled ? [{ id: "loan-wizard", label: "Loan Wizard", to: "/finance/loan-wizard" }] : []),
    ...(calculatorEnabled ? [{ id: "calculator", label: "Calculator", to: "/finance/calculator" }] : []),
    ...(amortizationEnabled ? [{ id: "amortization", label: "Amortization", to: "/finance/amortization" }] : []),
  ];

  return (
    <div className="space-y-2 border-b border-gray-200">
      {/*
        FINANCE-TABS-OVERFLOW-HIDDEN-UNREACHABLE: this nav is additive-only by design (comment above --
        "no reorder"; each new flag-gated tab is appended) and has no wrap or scroll of its own, so once
        enough tabs are enabled at once (base 6 + break-even + loan-wizard + calculator + amortization =
        10, verified live) its content (993px) exceeds the container (852px on a common laptop width).
        The ancestor page shell clips with overflow-x: hidden, so the trailing tab(s) -- confirmed
        "Amortization" -- render in the DOM, are flag-enabled and fully functional at their own URL, but
        are UNREACHABLE by click: no scrollbar, no wrap, no visual sign anything is missing. overflow-x-auto
        keeps the overflow inside this nav's own scrollable box instead of past the shell's clip boundary.
      */}
      <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Finance">
        {tabs.map((tab) => {
          const isActive =
            currentPath === tab.to
            || (tab.id === "hub" && currentPath === "/finance/hub");
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.to)}
              className={[
                "whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium",
                isActive
                  ? "border-[#1f2a44] text-[#1f2a44]"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
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
