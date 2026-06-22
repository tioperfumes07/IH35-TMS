/**
 * CLOSURE-13 — USMCA Activation Panel (admin-only).
 * Shows current state, 16-item checklist, transition button, emergency rollback.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../auth/useAuth";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";

type ChecklistItem = { id: string; label: string; required_for: string; completed: boolean };
type ActivationState = "hidden" | "soft_launch" | "pilot_drivers" | "full_active" | "rollback";

type ActivationData = {
  state: ActivationState;
  checklist: ChecklistItem[];
  go_live_target_date: string;
  activated_at?: string | null;
};

const STATE_BADGE: Record<ActivationState, string> = {
  hidden: "bg-gray-100 text-gray-700",
  soft_launch: "bg-yellow-100 text-yellow-800",
  pilot_drivers: "bg-slate-100 text-slate-700",
  full_active: "bg-green-100 text-green-800",
  rollback: "bg-red-100 text-red-800",
};

const NEXT_STATE: Record<ActivationState, ActivationState | null> = {
  hidden: "soft_launch",
  soft_launch: "pilot_drivers",
  pilot_drivers: "full_active",
  full_active: null,
  rollback: "hidden",
};

function useActivationState() {
  return useQuery({
    queryKey: ["usmca", "activation", "state"],
    queryFn: () => apiRequest<ActivationData>("/api/v1/usmca/activation/state"),
    staleTime: 30_000,
  });
}

export function USMCAActivationPanel() {
  const auth = useAuth();
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [rollbackConfirm, setRollbackConfirm] = useState("");

  const stateQuery = useActivationState();

  const transitionMutation = useMutation({
    mutationFn: (requested_state: ActivationState) =>
      apiRequest("/api/v1/usmca/activation/transition", {
        method: "POST",
        body: { requested_state },
      }),
    onSuccess: () => {
      pushToast("State transition successful", "success");
      void qc.invalidateQueries({ queryKey: ["usmca", "activation"] });
    },
    onError: (e: Error) => pushToast(e.message || "Transition failed", "error"),
  });

  const checklistMutation = useMutation({
    mutationFn: ({ item_id, completed }: { item_id: string; completed: boolean }) =>
      apiRequest("/api/v1/usmca/activation/checklist-item", {
        method: "PATCH",
        body: { item_id, completed },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["usmca", "activation"] }),
  });

  if (auth.user?.role !== "Owner") {
    return <div className="p-6 text-sm text-gray-500">Owner access required for USMCA Activation.</div>;
  }

  const data = stateQuery.data;
  const currentState = data?.state ?? "hidden";
  const nextState = NEXT_STATE[currentState];
  const allRequiredComplete = data?.checklist
    .filter((item) => item.required_for === nextState)
    .every((item) => item.completed) ?? false;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold">USMCA Activation</h2>
        <span className={`rounded px-3 py-1 text-sm font-semibold ${STATE_BADGE[currentState]}`}>
          {currentState.replace(/_/g, " ").toUpperCase()}
        </span>
        {data?.go_live_target_date && (
          <span className="text-sm text-gray-500">Go-live target: {data.go_live_target_date}</span>
        )}
      </div>

      {stateQuery.isError && <ListErrorBanner onRetry={() => void stateQuery.refetch()} />}

      {/* 16-item checklist */}
      <div className="rounded border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold">Activation Checklist (16 items)</h3>
        <div className="space-y-2">
          {(data?.checklist ?? []).map((item) => (
            <label key={item.id} className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={item.completed}
                onChange={(e) => checklistMutation.mutate({ item_id: item.id, completed: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-slate-700"
              />
              <span className={item.completed ? "text-gray-400 line-through" : "text-gray-800"}>{item.label}</span>
              <span className="ml-auto text-xs text-gray-400">→ {item.required_for.replace(/_/g, " ")}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Transition button */}
      {nextState && (
        <button
          type="button"
          disabled={!allRequiredComplete || transitionMutation.isPending}
          onClick={() => transitionMutation.mutate(nextState)}
          className="rounded bg-[#1F2A44] px-4 py-2 text-sm font-medium text-white hover:bg-[#1F2A44] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {transitionMutation.isPending ? "Transitioning…" : `Transition to ${nextState.replace(/_/g, " ")}`}
        </button>
      )}

      {/* Emergency rollback */}
      {currentState !== "rollback" && currentState !== "hidden" && (
        <div className="rounded border border-red-200 bg-red-50 p-4">
          <h4 className="mb-2 text-sm font-semibold text-red-700">Emergency Rollback</h4>
          <p className="mb-3 text-xs text-red-600">Type DEACTIVATE to confirm emergency rollback.</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={rollbackConfirm}
              onChange={(e) => setRollbackConfirm(e.target.value)}
              placeholder="Type DEACTIVATE"
              className="flex-1 rounded border border-red-300 px-2 py-1 text-sm"
            />
            <button
              type="button"
              disabled={rollbackConfirm !== "DEACTIVATE" || transitionMutation.isPending}
              onClick={() => { setRollbackConfirm(""); transitionMutation.mutate("rollback"); }}
              className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
            >
              Rollback
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
