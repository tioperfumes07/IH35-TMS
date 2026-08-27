import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { cancelLeaveRequest, listMyLeaveRequests } from "../api/scheduler";
import { PwaButton } from "../components/PwaButton";
import { PwaCard } from "../components/PwaCard";
import { useToast } from "../components/Toast";

function formatIsoDate(value: unknown, locale: string) {
  const s = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { timeZone: "UTC" });
}

const PAGE_SIZE = 25;

export function LeaveRequestListPage() {
  const { t, i18n } = useTranslation();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const listQuery = useQuery({
    queryKey: ["driver", "scheduler", "my-requests", page],
    queryFn: () => listMyLeaveRequests(PAGE_SIZE, page * PAGE_SIZE),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelLeaveRequest(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["driver", "scheduler", "my-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["driver", "scheduler", "range"] });
      pushToast(t("scheduler.cancelled_ok"), "success");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        pushToast(t("scheduler.cancel_failed"), "error");
        return;
      }
      pushToast(t("scheduler.cancel_failed"), "error");
    },
  });

  const rows = listQuery.data?.requests ?? [];
  const totalCount = listQuery.data?.total_count ?? 0;

  useEffect(() => {
    if (!listQuery.isFetching && page > 0 && rows.length === 0 && totalCount <= page * PAGE_SIZE) {
      setPage(Math.max(0, Math.ceil(totalCount / PAGE_SIZE) - 1));
    }
  }, [listQuery.isFetching, page, rows.length, totalCount]);

  return (
    <div className="min-h-screen bg-pwa-bg px-3 py-3 pb-28">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <Link to="/scheduler" className="inline-flex min-h-11 items-center gap-2 text-sm text-pwa-text-secondary">
          <ArrowLeft className="h-4 w-4" />
          {t("scheduler.back_schedule")}
        </Link>
        <h1 className="text-lg font-semibold text-pwa-text-primary">{t("scheduler.requests_title")}</h1>
        <PwaCard>
          {listQuery.isLoading ? (
            <p className="text-sm text-pwa-text-secondary">{t("common.loading")}</p>
          ) : listQuery.isError ? (
            <p className="text-sm text-red-400">{t("scheduler.load_error")}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-pwa-text-secondary">{t("scheduler.no_requests")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((row) => {
                const id = String(row.id ?? "");
                const status = String(row.status ?? "");
                const num = String(row.request_number ?? "");
                const leaveType = String(row.leave_type ?? "");
                const pending = status === "pending_review";
                return (
                  <li key={id} className="rounded-lg border border-pwa-border bg-[#121827] p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-pwa-text-primary">
                          {num} · {leaveType}
                        </p>
                        <p className="mt-1 text-pwa-text-secondary">
                          {formatIsoDate(row.start_date, i18n.language)} → {formatIsoDate(row.end_date, i18n.language)}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-wide text-pwa-text-secondary">{status.replace(/_/g, " ")}</p>
                      </div>
                      {pending ? (
                        <PwaButton
                          type="button"
                          variant="ghost"
                          className="min-h-9 shrink-0 px-2 py-1 text-xs"
                          disabled={cancelMut.isPending}
                          onClick={() => cancelMut.mutate(id)}
                        >
                          {t("scheduler.cancel_request")}
                        </PwaButton>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {!listQuery.isLoading && !listQuery.isError && totalCount > PAGE_SIZE ? (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-pwa-border pt-3">
              <PwaButton
                type="button"
                variant="ghost"
                className="min-h-9 px-3 py-1 text-xs"
                disabled={page === 0 || listQuery.isFetching}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                {t("common.previous")}
              </PwaButton>
              <span className="text-xs text-pwa-text-secondary">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} {t("common.of")} {totalCount}
              </span>
              <PwaButton
                type="button"
                variant="ghost"
                className="min-h-9 px-3 py-1 text-xs"
                disabled={(page + 1) * PAGE_SIZE >= totalCount || listQuery.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                {t("common.next")}
              </PwaButton>
            </div>
          ) : null}
        </PwaCard>
      </div>
    </div>
  );
}
