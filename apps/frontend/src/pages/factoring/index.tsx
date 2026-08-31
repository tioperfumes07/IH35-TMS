import { useSearchParams } from "react-router-dom";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
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
const TAB_IDS = new Set<string>(SUBNAV.map((t) => t.id));

export function parseFactoringIndexTab(raw: string | null): TabId {
  if (raw && TAB_IDS.has(raw)) return raw as TabId;
  return "submit_to_factor";
}

export function FactoringIndexPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseFactoringIndexTab(searchParams.get("tab"));
  const setTab = (next: TabId) => {
    const params = new URLSearchParams(searchParams);
    if (next === "submit_to_factor") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="space-y-3">
      <NavyPageSubNav
        items={SUBNAV.map((item) => ({ label: item.label, to: `#${item.id}` }))}
        activeId={tab}
        onTabChange={(id) => setTab(id as TabId)}
        itemIds={SUBNAV.map((item) => item.id)}
      />

      {tab === "submit_to_factor" ? <SubmissionQueue /> : null}
      {tab === "workqueue" ? <SubmissionWorkqueue /> : null}
      {tab === "batch_wizard" ? <BatchWizard /> : null}
      {tab === "factors" ? <FactorAdmin /> : null}
      {tab === "reserves" ? <ReserveDashboard /> : null}
    </div>
  );
}

export { FactorAdmin };
