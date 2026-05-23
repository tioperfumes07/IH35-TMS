import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirmDriverArrivalPrompt, dismissDriverArrivalPrompt, listDriverArrivalPrompts } from "../../api/driver";

const REPROMPT_AFTER_MS = 5 * 60 * 1000;

export function ArrivalPrompt() {
  const queryClient = useQueryClient();
  const [snoozedUntilByPrompt, setSnoozedUntilByPrompt] = useState<Record<string, number>>({});

  const promptsQuery = useQuery({
    queryKey: ["driver", "arrival-prompts"],
    queryFn: listDriverArrivalPrompts,
    refetchInterval: 30_000,
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => confirmDriverArrivalPrompt(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["driver", "arrival-prompts"] }),
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => dismissDriverArrivalPrompt(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["driver", "arrival-prompts"] }),
  });

  const activePrompt = useMemo(() => {
    const prompts = promptsQuery.data?.prompts ?? [];
    const now = Date.now();
    return prompts.find((prompt) => now >= (snoozedUntilByPrompt[prompt.id] ?? 0)) ?? null;
  }, [promptsQuery.data?.prompts, snoozedUntilByPrompt]);

  if (!activePrompt) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/35 p-3">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
        <p className="text-sm font-semibold text-slate-900">Arrival check</p>
        <p className="mt-1 text-sm text-slate-700">
          You appear to be at <span className="font-semibold">{activePrompt.stop_name ?? "the stop"}</span>. Are you arrived?
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Distance: {activePrompt.distance_at_trigger_ft} ft · Load {activePrompt.load_number ?? activePrompt.load_id.slice(0, 8)}
        </p>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => {
              void dismissMutation.mutateAsync(activePrompt.id);
              setSnoozedUntilByPrompt((current) => ({ ...current, [activePrompt.id]: Date.now() + REPROMPT_AFTER_MS }));
            }}
            disabled={dismissMutation.isPending || confirmMutation.isPending}
          >
            No / Later
          </button>
          <button
            type="button"
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            onClick={() => void confirmMutation.mutateAsync(activePrompt.id)}
            disabled={dismissMutation.isPending || confirmMutation.isPending}
          >
            Yes, arrived
          </button>
        </div>
      </div>
    </div>
  );
}
