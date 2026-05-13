import { useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchHomeAttentionList, type HomeAttentionListItem, type HomeAttentionSeverity } from "../../api/home";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";

const SEVERITY_ICON: Record<HomeAttentionSeverity, { Icon: typeof Info; className: string }> = {
  info: { Icon: Info, className: "text-blue-600" },
  warning: { Icon: AlertTriangle, className: "text-amber-600" },
  error: { Icon: AlertCircle, className: "text-orange-700" },
  critical: { Icon: ShieldAlert, className: "text-red-600" },
};

type Props = {
  operatingCompanyId: string | null | undefined;
};

export function AttentionList({ operatingCompanyId }: Props) {
  const navigate = useNavigate();
  const companyId = operatingCompanyId ?? "";

  const query = useQuery({
    queryKey: ["home", "attention-list", companyId],
    queryFn: () => fetchHomeAttentionList(companyId),
    enabled: Boolean(companyId),
  });

  if (!companyId) {
    return <div className="py-3 text-sm text-slate-500">Select an operating company to load attention items.</div>;
  }

  if (query.isLoading) {
    return (
      <div className="space-y-2 py-2">
        <div className="h-5 animate-pulse rounded bg-slate-100" />
        <div className="h-5 animate-pulse rounded bg-slate-100" />
        <div className="h-5 animate-pulse rounded bg-slate-100" />
      </div>
    );
  }

  if (query.isError) {
    const { status, message } = formatQueryErrorDetail(query.error);
    return (
      <ListErrorState
        title="Couldn't load attention list"
        status={status}
        message={message}
        onRetry={() => void query.refetch()}
        className="py-4"
      />
    );
  }

  const visible = (query.data?.items ?? []).filter((item) => item.count > 0);

  if (visible.length === 0) {
    return <div className="py-3 text-sm text-slate-500">No items requiring attention.</div>;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {visible.map((item: HomeAttentionListItem) => {
        const { Icon, className } = SEVERITY_ICON[item.severity] ?? SEVERITY_ICON.info;
        return (
          <li key={`${item.type}-${item.title}-${item.action_url}`}>
            <button
              type="button"
              className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50/80"
              onClick={() => navigate(item.action_url)}
            >
              <Icon className={`h-5 w-5 shrink-0 ${className}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900">{item.title}</div>
                <div className="mt-0.5 text-xs text-slate-600">
                  Count {item.count}
                  {item.action_label ? <span className="text-slate-500"> — {item.action_label}</span> : null}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
