import { useParams, Link } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getDriverLoad, type DriverLoad } from "../../api/driver";
import { titleize } from "../../lib/titleize";
import { useState } from "react";
import { ReportIssueModal } from "./ReportIssueModal";
import { entityLabel } from "../../lib/entity-label";
import { ListErrorState } from "../../components/ListErrorState";

export function DriverLoadDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [reportOpen, setReportOpen] = useState(false);
  const q = useQuery({
    queryKey: ["driver", "load", id],
    queryFn: () => getDriverLoad(String(id)),
    enabled: Boolean(id),
  });

  if (!id) return null;
  if (q.isLoading) return <p className="text-sm text-gray-600">…</p>;
  if (q.isError) {
    return (
      <ListErrorState
        title="Couldn't load assigned load"
        status={0}
        message={q.error instanceof Error ? q.error.message : undefined}
        onRetry={() => void q.refetch()}
      />
    );
  }
  if (!q.data) return <p className="text-sm text-red-600">Load not found.</p>;
  const load = q.data;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Link className="text-xs text-slate-600" to="/driver/loads">
          ← {t("driver.loads_title")}
        </Link>
        <button type="button" className="text-xs font-semibold text-red-800" onClick={() => setReportOpen(true)}>
          {t("driver.report_issue")}
        </button>
      </div>
      <h2 className="text-base font-semibold">
        <EntityLink kind="load" id={load.id} label={entityLabel(load.display_id, load.id, "Load")} /> — {t("driver.load_detail")}
      </h2>
      <p className="text-xs text-slate-600">
        {t("driver.customer")}: <EntityLink kind="customer" id={load.customer_id} label={entityLabel(load.customer_name, load.customer_id, "Customer")} />
      </p>
      <div className="rounded-sm border border-slate-200 bg-white p-2">
        <p className="text-[11px] font-semibold uppercase text-slate-500">{t("driver.stops")}</p>
        <ul className="mt-1 space-y-1 text-xs">
          {load.stops.map((s: DriverLoad["stops"][number]) => (
            <li key={s.id}>
              {titleize(s.type)} · {s.city}, {s.state} · {titleize(s.status)}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-sm border border-slate-200 bg-white p-2">
        <p className="text-[11px] font-semibold text-slate-600">{t("driver.bol")}</p>
        <iframe
          title="rate-confirmation"
          className="mt-2 h-64 w-full border border-slate-100"
          srcDoc={load.rate_confirmation_html}
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
      <ReportIssueModal
        open={reportOpen}
        loadId={load.id}
        loadDisplayId={load.display_id}
        onClose={() => setReportOpen(false)}
      />
    </div>
  );
}
