import { entityLabel } from "../../lib/entity-label";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listDriverStatusSuggestions, respondDriverStatusSuggestion } from "../../api/driver";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorState } from "../../components/ListErrorState";

const SNOOZE_MS = 5 * 60 * 1000;

export function StatusSuggestionPrompt() {
  const queryClient = useQueryClient();
  const [snoozedUntilById, setSnoozedUntilById] = useState<Record<string, number>>({});

  const query = useQuery({
    queryKey: ["driver", "status-suggestions"],
    queryFn: listDriverStatusSuggestions,
    refetchInterval: 30_000,
  });

  const respondMutation = useMutation({
    mutationFn: (input: { id: string; response: "confirmed" | "overridden" | "dismissed" | "expired" }) =>
      respondDriverStatusSuggestion(input.id, { response: input.response }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["driver", "status-suggestions"] }),
  });

  const active = useMemo(() => {
    const suggestions = query.data?.suggestions ?? [];
    const now = Date.now();
    return suggestions.find((item) => now >= (snoozedUntilById[item.id] ?? 0)) ?? null;
  }, [query.data?.suggestions, snoozedUntilById]);

  if (query.isError) {
    return (
      <ListErrorState
        title="Couldn't load status suggestions"
        status={0}
        message={query.error instanceof Error ? query.error.message : undefined}
        onRetry={() => void query.refetch()}
        className="border-b border-slate-200 bg-slate-100"
      />
    );
  }
  if (!active) return null;

  return (
    <div className="fixed inset-0 z-61 flex items-end justify-center bg-black/35 p-3">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
        <p className="text-sm font-semibold text-slate-900">Status suggestion</p>
        <p className="mt-1 text-sm text-slate-700">
          Looks like you’re underway on load{" "}
          <EntityLink
            kind="driver_app_load"
            id={active.load_id}
            label={entityLabel(active.load_number, active.load_id, "Load")}
            className="font-semibold text-slate-700 hover:underline"
          />
          . Mark as <span className="font-semibold">{active.suggested_to.replace("_", " ")}</span>?
        </p>
        <p className="mt-1 text-xs text-slate-500">{active.reason}</p>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-sm border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => {
              setSnoozedUntilById((current) => ({ ...current, [active.id]: Date.now() + SNOOZE_MS }));
            }}
          >
            Snooze 5m
          </button>
          <button
            type="button"
            className="rounded-sm border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => void respondMutation.mutateAsync({ id: active.id, response: "dismissed" })}
          >
            No
          </button>
          <button
            type="button"
            className="rounded-sm bg-[#1f2a44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f1729]"
            onClick={() => void respondMutation.mutateAsync({ id: active.id, response: "confirmed" })}
          >
            Yes
          </button>
        </div>
      </div>
    </div>
  );
}
