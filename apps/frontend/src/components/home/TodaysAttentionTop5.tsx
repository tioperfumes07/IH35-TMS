import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { dismissOwnerAttentionItem, fetchOwnerTodaysAttention } from "../../api/home.js";
import { AttentionItemCard } from "./AttentionItemCard.js";

type Props = { operatingCompanyId: string | null | undefined };

export function TodaysAttentionTop5({ operatingCompanyId }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cid = operatingCompanyId ?? "";
  const [dismissError, setDismissError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["owner", "todays-attention", cid],
    queryFn: () => fetchOwnerTodaysAttention(cid),
    enabled: Boolean(cid),
    refetchInterval: 15 * 60 * 1000,
    retry: false,
  });

  const dismissMutation = useMutation({
    mutationFn: (itemId: string) => dismissOwnerAttentionItem(cid, itemId),
    onMutate: () => setDismissError(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "todays-attention", cid] });
    },
    onError: (error) => setDismissError(error instanceof Error ? error.message : "Failed to dismiss attention item"),
  });

  if (query.isError) return null;

  const items = query.data?.items ?? [];
  const totalSources = query.data?.totalSources ?? 10;
  const sourcesRan = query.data?.sourcesRan ?? 0;
  const skippedSources = query.data?.skippedSources ?? [];
  // GO-20 deferred slice 5 — cooling-customer monitoring is deliberately not built yet
  // (owner ruling 2026-09-02: revisit at launch). This source always skips today because its
  // table doesn't exist; say so honestly rather than silently omitting it (fuel-planner
  // null-not-zero pattern — never let a deferred feature look like a working zero-count).
  const coolingCustomersUnavailable = skippedSources.includes("cooling_customers");

  if (query.isLoading) {
    return (
      <section className="rounded-sm border border-slate-300 bg-white" aria-label="Today's attention — top priority items">
        <div className="border-b border-slate-300 bg-slate-100/60 px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Today's Attention</span>
        </div>
        <div className="space-y-2 p-3">
          <div className="h-16 animate-pulse rounded-sm bg-slate-100" />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-sm border border-slate-300 bg-white" aria-label="Today's attention — top priority items">
      <div className="flex items-center justify-between border-b border-slate-300 bg-slate-100/60 px-3 py-2">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Today's Attention</span>
          <span className="ml-2 rounded-full bg-[#1F2A44] px-2 py-0.5 text-xs font-bold text-white">
            {sourcesRan} of {totalSources} sources reporting
          </span>
          {items.length > 0 ? (
            <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
              {items.length} item{items.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        {query.data?.computed_at ? (
          <span className="text-xs text-slate-400">
            Updated {new Date(query.data.computed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        ) : null}
      </div>
      <div className="space-y-2 p-3">
        {dismissError ? <p role="alert" className="text-xs text-red-700">{dismissError}</p> : null}
        {coolingCustomersUnavailable ? (
          <p className="text-[11px] text-slate-400">Cooling customers monitoring: unavailable.</p>
        ) : null}
        {items.length === 0 ? (
          <p className="text-xs text-slate-500">
            No priority items right now. {sourcesRan} of {totalSources} attention sources are reporting.
          </p>
        ) : (
          items.map((item, idx) => (
            <AttentionItemCard
              key={item.item_id}
              item={item}
              rank={idx + 1}
              onAction={(url) => navigate(url)}
              onDismiss={(itemId) => dismissMutation.mutate(itemId)}
              dismissing={dismissMutation.isPending && dismissMutation.variables === item.item_id}
            />
          ))
        )}
      </div>
    </section>
  );
}
