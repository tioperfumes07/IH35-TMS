import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { createCashAdvanceRequest } from "../api/cashAdvanceRequests";
import { PwaButton } from "../components/PwaButton";
import { PwaCard } from "../components/PwaCard";
import { useToast } from "../components/Toast";

export function CashAdvanceNewPage() {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [reason, setReason] = useState("");
  const [amountDollars, setAmountDollars] = useState("");
  const [recoveryDollars, setRecoveryDollars] = useState("");

  const submitMut = useMutation({
    mutationFn: () => {
      const amt = Math.round(Number(amountDollars) * 100);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("amount");
      const recRaw = recoveryDollars.trim();
      let proposed_recovery_per_settlement_cents: number | undefined;
      if (recRaw.length > 0) {
        const c = Math.round(Number(recRaw) * 100);
        if (!Number.isFinite(c) || c <= 0) throw new Error("recovery");
        proposed_recovery_per_settlement_cents = c;
      }
      return createCashAdvanceRequest({
        requested_amount_cents: amt,
        reason: reason.trim(),
        proposed_recovery_per_settlement_cents,
        submitted_via: "pwa",
      });
    },
    onSuccess: () => {
      pushToast(t("cash_advance.submitted_ok"), "success");
      navigate("/cash-advance");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 400) {
        pushToast(t("cash_advance.validation_error"), "error");
        return;
      }
      pushToast(t("cash_advance.submit_failed"), "error");
    },
  });

  function handleSubmit() {
    const r = reason.trim();
    if (r.length < 10) {
      pushToast(t("cash_advance.reason_min"), "error");
      return;
    }
    submitMut.mutate();
  }

  return (
    <div className="min-h-screen bg-pwa-bg px-3 py-3 pb-28">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <Link to="/cash-advance" className="inline-flex min-h-11 items-center gap-2 text-sm text-pwa-text-secondary">
          <ArrowLeft className="h-4 w-4" />
          {t("cash_advance.back_list")}
        </Link>
        <h1 className="text-lg font-semibold text-pwa-text-primary">{t("cash_advance.new_title")}</h1>
        <PwaCard title={t("cash_advance.amount_title")}>
          <input
            inputMode="decimal"
            className="w-full rounded-lg border border-pwa-border bg-[#0d1320] px-3 py-2 text-sm text-pwa-text-primary"
            placeholder={t("cash_advance.amount_usd_ph")}
            value={amountDollars}
            onChange={(e) => setAmountDollars(e.target.value)}
          />
        </PwaCard>
        <PwaCard title={t("cash_advance.recovery_title")}>
          <p className="mb-2 text-xs text-pwa-text-secondary">{t("cash_advance.recovery_hint")}</p>
          <input
            inputMode="decimal"
            className="w-full rounded-lg border border-pwa-border bg-[#0d1320] px-3 py-2 text-sm text-pwa-text-primary"
            placeholder={t("cash_advance.recovery_ph")}
            value={recoveryDollars}
            onChange={(e) => setRecoveryDollars(e.target.value)}
          />
        </PwaCard>
        <PwaCard title={t("cash_advance.reason_title")}>
          <textarea
            className="min-h-[96px] w-full rounded-lg border border-pwa-border bg-[#0d1320] px-3 py-2 text-sm text-pwa-text-primary"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("cash_advance.reason_ph")}
          />
        </PwaCard>
        <PwaButton type="button" className="w-full" disabled={submitMut.isPending} onClick={handleSubmit}>
          {submitMut.isPending ? t("common.loading") : t("cash_advance.submit")}
        </PwaButton>
      </div>
    </div>
  );
}
