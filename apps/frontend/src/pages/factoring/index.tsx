import { useState } from "react";
import { NavLink } from "react-router-dom";
import { BatchWizard } from "./BatchWizard";
import { FactorAdmin } from "./FactorAdmin";
import { ReserveDashboard } from "./ReserveDashboard";

const SUBNAV = [
  { id: "batch_wizard", label: "Batch Wizard", href: "/factoring/batches/new" },
  { id: "factors", label: "Factors", href: "/factoring/factors" },
  { id: "reserves", label: "Reserves", href: "/factoring/reserves" },
] as const;

export function FactoringIndexPage() {
  const [tab, setTab] = useState<(typeof SUBNAV)[number]["id"]>("batch_wizard");

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded bg-[#1A1F36] px-2 py-1 text-[11px] text-white">
        <div className="flex min-w-max gap-4">
          {SUBNAV.map((item) => (
            <NavLink
              key={item.id}
              to={item.href}
              className={({ isActive }) => (isActive || tab === item.id ? "border-b border-white pb-0.5 font-semibold" : "")}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>

      {tab === "batch_wizard" ? <BatchWizard /> : null}
      {tab === "factors" ? <FactorAdmin /> : null}
      {tab === "reserves" ? <ReserveDashboard /> : null}
    </div>
  );
}

export { FactorAdmin };
