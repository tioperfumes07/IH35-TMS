import { useParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";

export function ReportsRunPlaceholderPage() {
  const { reportId } = useParams<{ reportId: string }>();
  return (
    <div className="space-y-3">
      <PageHeader title="Report Runner" subtitle="Interactive runner ships in T11.16.2" />
      <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">
        Runner UI for <span className="font-semibold">{reportId ?? "report"}</span> is queued for T11.16.2.
      </div>
    </div>
  );
}
