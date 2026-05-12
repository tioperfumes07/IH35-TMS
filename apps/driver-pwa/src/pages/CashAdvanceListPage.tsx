import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { cancelCashAdvanceRequest, listMyCashAdvanceRequests } from "../api/cashAdvanceRequests";
import { PwaButton } from "../components/PwaButton";
import { PwaCard } from "../components/PwaCard";
import { useToast } from "../components/Toast";

function formatUsd(cents: unknown) {
  const n = Number(cents ?? 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n / 100);
}

export function CashAdvanceListPage() {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const listQuery = useQuery({
    queryKey: ["driver", "cash-advance-requests"],
    queryFn: listMyCashAdvanceRequests,
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelCashAdvanceRequest(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["driver", "cash-advance-requests"] });
      pushToast(t("cash_advance.cancelled_ok"), "success");
    },
    onError: () => pushToast(t("cash_advance.cancel_failed"), "error"),
  });

  const rows = listQuery.data?.requests ?? [];

  return (
    <div className="min-h-screen bg-pwa-bg px-3 py-3 pb-28">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <Link to="/home" className="inline-flex min-h-11 items-center gap-2 text-sm text-pwa-text-secondary">
          <ArrowLeft className="h-4 w-4" />
          {t("cash_advance.back_home")}
        </Link>
        <h1 className="text-lg font-semibold text-pwa-text-primary">{t("cash_advance.title")}</h1>
        <Link to="/cash-advance/new" className="block">
          <PwaButton className="w-full">{t("cash_advance.new_request")}</PwaButton>
        </Link>
        <PwaCard title={t("cash_advance.history")}>
          {listQuery.isLoading ? (
            <p className="text-sm text-pwa-text-secondary">{t("common.loading")}</p>
          ) : listQuery.isError ? (
            <p className="text-sm text-red-400">{t("cash_advance.load_error")}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-pwa-text-secondary">{t("cash_advance.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((row) => {
                const id = String(row.id ?? "");
                const status = String(row.status ?? "");
                const pending = status === "pending";
                const disp = String(row.display_id ?? "");
                return (
                  <li key={id} className="rounded-lg border border-pwa-border bg-[#121827] p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-pwa-text-primary">{disp}</p>
                        <p className="mt-1 text-pwa-text-secondary">{formatUsd(row.requested_amount_cents)}</p>
                        {row.is_above_policy ? (
                          <p className="mt-1 text-xs text-amber-300">{t("cash_advance.above_policy_flag")}</p>
                        ) : null}
                        <p className="mt-1 text-xs uppercase tracking-wide text-pwa-text-secondary">
                          {status.replace(/_/g, " ")}
                        </p>
                      </div>
                      {pending ? (
                        <PwaButton
                          type="button"
                          variant="ghost"
                          className="min-h-9 shrink-0 px-2 py-1 text-xs"
                          disabled={cancelMut.isPending}
                          onClick={() => cancelMut.mutate(id)}
                        >
                          {t("cash_advance.cancel")}
                        </PwaButton>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </PwaCard>
      </div>
    </div>
  );
}
