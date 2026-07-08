import { useState } from "react";
import { BatchWizard } from "./BatchWizard";
import { FactorAdmin } from "./FactorAdmin";
import { ReserveDashboard } from "./ReserveDashboard";
import { SubmissionQueue } from "./SubmissionQueue";
import { SubmissionWorkqueue } from "./SubmissionWorkqueue";

type TabId = "submit_to_factor" | "workqueue" | "batch_wizard" | "factors" | "reserves";

const SUBNAV: { id: TabId; label: string }[] = [
  { id: "submit_to_factor", label: "Submit to Factor" },
  { id: "workqueue", label: "Workqueue" },
  { id: "batch_wizard", label: "Batch Wizard" },
  { id: "factors", label: "Factors" },
  { id: "reserves", label: "Reserves" },
];

export function FactoringIndexPage() {
  const [tab, setTab] = useState<TabId>("submit_to_factor");

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-sm bg-[#1f2a44] px-2 py-1 text-[11px] text-white">
        <div className="flex min-w-max gap-4">
          {SUBNAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "border-b border-white pb-0.5 font-semibold" : "opacity-70 hover:opacity-100"}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "submit_to_factor" ? <SubmissionQueue /> : null}
      {tab === "workqueue" ? <SubmissionWorkqueue /> : null}
      {tab === "batch_wizard" ? <BatchWizard /> : null}
      {tab === "factors" ? <FactorAdmin /> : null}
      {tab === "reserves" ? <ReserveDashboard /> : null}
    </div>
  );
}

export { FactorAdmin };
