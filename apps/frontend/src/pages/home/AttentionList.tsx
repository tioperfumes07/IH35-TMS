import { useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { fetchHomeAttentionList, type HomeAttentionListItem, type HomeAttentionSeverity } from "../../api/home";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";

const SEVERITY_ICON: Record<HomeAttentionSeverity, { Icon: typeof Info; className: string }> = {
  info: { Icon: Info, className: "text-slate-700" },
  warning: { Icon: AlertTriangle, className: "text-amber-600" },
  error: { Icon: AlertCircle, className: "text-orange-700" },
  critical: { Icon: ShieldAlert, className: "text-red-600" },
};

function subscribeMinLg(callback: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getMinLg() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return window.matchMedia("(min-width: 1024px)").matches;
}

type Props = {
  operatingCompanyId: string | null | undefined;
  /** On viewports below `lg`, show at most this many rows until expanded. Omit to always show all. */
  maxVisibleWhenCollapsed?: number | null;
};

export function AttentionList({ operatingCompanyId, maxVisibleWhenCollapsed = null }: Props) {
  const navigate = useNavigate();
  const companyId = operatingCompanyId ?? "";
  const [expanded, setExpanded] = useState(false);
  const isLg = useSyncExternalStore(subscribeMinLg, getMinLg, () => true);

  useEffect(() => {
    if (isLg) setExpanded(false);
  }, [isLg]);

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
    return <div className="py-3 text-sm text-slate-500">No attention items</div>;
  }

  const shouldCollapse = maxVisibleWhenCollapsed != null && !isLg && !expanded;
  const limit = shouldCollapse ? maxVisibleWhenCollapsed! : visible.length;
  const shown = visible.slice(0, limit);
  const collapsedCount = visible.length - shown.length;

  return (
    <>
      <ul className="divide-y divide-slate-100">
        {shown.map((item: HomeAttentionListItem) => {
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
      {maxVisibleWhenCollapsed != null && !isLg && collapsedCount > 0 && !expanded ? (
        <div className="border-t border-slate-100 px-3 py-2">
          <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => setExpanded(true)}>
            Show {collapsedCount} more
          </Button>
        </div>
      ) : null}
      {maxVisibleWhenCollapsed != null && !isLg && expanded && visible.length > maxVisibleWhenCollapsed ? (
        <div className="border-t border-slate-100 px-3 py-2">
          <Button type="button" variant="tertiary" size="sm" className="w-full" onClick={() => setExpanded(false)}>
            Show fewer
          </Button>
        </div>
      ) : null}
    </>
  );
}
