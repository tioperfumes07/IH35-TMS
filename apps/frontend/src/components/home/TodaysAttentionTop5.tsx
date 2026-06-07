/**
 * GAP-65 — TodaysAttentionTop5
 *
 * Displays the Owner's ranked top-5 attention items fetched from
 * GET /api/v1/owner/todays-attention.
 *
 * Mounted at the top of OwnerHome, above all existing cards.
 * Uses graceful degradation: if the endpoint is unavailable, the section
 * hides rather than breaking the page.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { dismissOwnerAttentionItem, fetchOwnerTodaysAttention } from "../../api/home.js";
import { AttentionItemCard } from "./AttentionItemCard.js";

type Props = {
  operatingCompanyId: string | null | undefined;
};

export function TodaysAttentionTop5({ operatingCompanyId }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cid = operatingCompanyId ?? "";

  const query = useQuery({
    queryKey: ["owner", "todays-attention", cid],
    queryFn: () => fetchOwnerTodaysAttention(cid),
    enabled: Boolean(cid),
    refetchInterval: 15 * 60 * 1000, // re-poll every 15 min
    retry: false,
  });

  const dismissMutation = useMutation({
    mutationFn: (itemId: string) => dismissOwnerAttentionItem(cid, itemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "todays-attention", cid] });
    },
  });

  // Hide section completely on error or when loading for the first time
  if (query.isError) return null;

  const items = query.data?.items ?? [];

  // Don't render if no attention items
  if (!query.isLoading && items.length === 0) return null;

  return (
    <section
      className="rounded border border-violet-200 bg-white"
      aria-label="Today's attention — top priority items"
    >
      <div className="flex items-center justify-between border-b border-violet-200 bg-violet-50/60 px-3 py-2">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
            Today's Attention
          </span>
          {!query.isLoading && items.length > 0 ? (
            <span className="ml-2 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">
              {items.length}
            </span>
          ) : null}
        </div>
        {query.data?.computed_at ? (
          <span className="text-[10px] text-slate-400">
            Updated {new Date(query.data.computed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        ) : null}
      </div>

      <div className="space-y-2 p-3">
        {query.isLoading ? (
          <>
            <div className="h-16 animate-pulse rounded bg-slate-100" />
            <div className="h-16 animate-pulse rounded bg-slate-100" />
            <div className="h-16 animate-pulse rounded bg-slate-100" />
          </>
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
