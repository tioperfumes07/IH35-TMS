import { useLocation, useNavigate } from "react-router-dom";

const tabs = [
  { id: "overview", label: "Overview", to: "/finance" },
  { id: "projections", label: "Projections", to: "/finance/projections" },
  { id: "scenarios", label: "Scenarios", to: "/finance/scenarios" },
];

export function FinanceModuleTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

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
