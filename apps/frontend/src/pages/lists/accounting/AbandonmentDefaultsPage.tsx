import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAbandonmentDefaults, putAbandonmentDefaults } from "../../../api/abandonment";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Button } from "../../../components/Button";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useAuth } from "../../../auth/useAuth";

export function AbandonmentDefaultsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const auth = useAuth();

  const [towing, setTowing] = useState("50000");
  const [ratePerMile, setRatePerMile] = useState("250");
  const [premiumPct, setPremiumPct] = useState("25");
  const [threshold, setThreshold] = useState("100000");

  const defaultsQuery = useQuery({
    queryKey: ["abandonment-defaults", companyId],
    queryFn: () => getAbandonmentDefaults(companyId),
    enabled: Boolean(companyId),
  });

  useEffect(() => {
    const d = defaultsQuery.data;
    if (!d) return;
    setTowing(String(d.default_towing_cost_cents ?? ""));
    setRatePerMile(String(d.default_deadhead_rate_per_mile_cents ?? ""));
    setPremiumPct(String(d.default_replacement_premium_pct ?? ""));
    setThreshold(String(d.require_approval_above_cents ?? ""));
  }, [defaultsQuery.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      putAbandonmentDefaults({
        operating_company_id: companyId,
        default_towing_cost_cents: Number(towing || "0"),
        default_deadhead_rate_per_mile_cents: Number(ratePerMile || "0"),
        default_replacement_premium_pct: Number(premiumPct || "0"),
        require_approval_above_cents: Number(threshold || "0"),
      }),
    onSuccess: () => {
      pushToast("Defaults saved", "success");
      void queryClient.invalidateQueries({ queryKey: ["abandonment-defaults"] });
    },
    onError: (e: unknown) => pushToast(String((e as Error)?.message ?? "Save failed"), "error"),
  });

  const allowed = auth.user?.role === "Owner" || auth.user?.role === "Administrator";

  return (
    <div className="mx-auto max-w-3xl space-y-3 px-3 py-3">
      <PageHeader title="Abandonment defaults" subtitle="Company thresholds for auto-computed abandonment chargebacks." />

      {!companyId ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">Select a company.</div> : null}
      {!allowed ? <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm">Owner/Administrator only.</div> : null}

      <div className="space-y-3 rounded border border-gray-200 bg-white p-4 text-sm">
        <label className="block text-xs font-semibold text-slate-600">
          Default towing (¢)
          <input className="mt-1 w-full rounded border border-gray-300 px-2 py-2" value={towing} onChange={(e) => setTowing(e.target.value.replace(/[^\d]/g, ""))} />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Deadhead rate (¢ / mile)
          <input className="mt-1 w-full rounded border border-gray-300 px-2 py-2" value={ratePerMile} onChange={(e) => setRatePerMile(e.target.value.replace(/[^\d]/g, ""))} />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Replacement premium (%)
          <input className="mt-1 w-full rounded border border-gray-300 px-2 py-2" value={premiumPct} onChange={(e) => setPremiumPct(e.target.value)} />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Require approval above (¢)
          <input className="mt-1 w-full rounded border border-gray-300 px-2 py-2" value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/[^\d]/g, ""))} />
        </label>

        <div className="flex justify-end">
          <Button type="button" onClick={() => void saveMut.mutateAsync()} loading={saveMut.isPending} disabled={!allowed || !companyId}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
