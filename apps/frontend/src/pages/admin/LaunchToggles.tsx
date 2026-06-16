import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { resolveApiUrl } from "../../api/client";
import { useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";

type LaunchToggle = {
  operating_company_id: string;
  company_code: string;
  legal_name: string;
  short_name: string | null;
  is_active: boolean;
  hidden: boolean;
  launched_at: string | null;
  launched_by_user_id: string | null;
  launched_by_email: string | null;
  rollback_at: string | null;
  notes: string | null;
};

async function fetchLaunchToggles(): Promise<{ toggles: LaunchToggle[] }> {
  const res = await fetch(resolveApiUrl("/api/v1/admin/launch-toggles"), { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function postToggleAction(
  carrierId: string,
  action: "launch" | "rollback",
  notes?: string
): Promise<unknown> {
  const res = await fetch(resolveApiUrl(`/api/v1/admin/launch-toggles/${carrierId}/${action}`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: true, notes: notes || undefined }),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
  return payload;
}

export function LaunchTogglesPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const allowed = auth.user?.role === "Owner";
  const [notes, setNotes] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const togglesQuery = useQuery({
    queryKey: ["admin-launch-toggles"],
    queryFn: fetchLaunchToggles,
    enabled: Boolean(allowed && auth.user),
  });

  const actionMutation = useMutation({
    mutationFn: ({ carrierId, action }: { carrierId: string; action: "launch" | "rollback" }) =>
      postToggleAction(carrierId, action, notes),
    onSuccess: async () => {
      setError(null);
      setNotes("");
      setPendingId(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-launch-toggles"] });
      await queryClient.invalidateQueries({ queryKey: ["org", "my-companies"] });
    },
    onError: (err) => setError(String((err as Error)?.message ?? err)),
  });

  if (!allowed) {
    return (
      <div className="p-6">
        <PageHeader title="Launch toggles" subtitle="Owner access required." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader
        title="Launch toggles"
        subtitle="Go-live workflow for hidden operating carriers (USMCA July 2026 cutover)."
      />

      {error ? <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <label className="block max-w-xl text-sm">
        <span className="font-medium text-gray-700">Launch notes (optional)</span>
        <textarea
          className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Cutover checklist reference, ticket id, etc."
        />
      </label>

      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Carrier</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Last action</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(togglesQuery.data?.toggles ?? []).map((toggle) => (
              <tr key={toggle.operating_company_id} className="border-t border-gray-100">
                <td className="px-3 py-3">
                  <div className="font-medium">{toggle.short_name || toggle.legal_name}</div>
                  <div className="text-xs text-gray-500">{toggle.company_code}</div>
                </td>
                <td className="px-3 py-3">
                  {toggle.is_active ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">Launched</span>
                  ) : (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Hidden</span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-gray-600">
                  {toggle.launched_at ? (
                    <div>
                      Launched {new Date(toggle.launched_at).toLocaleString()}
                      {toggle.launched_by_email ? ` by ${toggle.launched_by_email}` : null}
                    </div>
                  ) : toggle.rollback_at ? (
                    <div>Rolled back {new Date(toggle.rollback_at).toLocaleString()}</div>
                  ) : (
                    <span>—</span>
                  )}
                  {toggle.notes ? <div className="mt-1 italic">{toggle.notes}</div> : null}
                </td>
                <td className="px-3 py-3">
                  {!toggle.is_active ? (
                    <Button
                      type="button"
                      className="h-8 px-3 text-xs"
                      disabled={actionMutation.isPending}
                      onClick={() => {
                        if (!window.confirm(`Launch ${toggle.company_code} for office users with access?`)) return;
                        setPendingId(toggle.operating_company_id);
                        void actionMutation.mutateAsync({
                          carrierId: toggle.operating_company_id,
                          action: "launch",
                        });
                      }}
                    >
                      {pendingId === toggle.operating_company_id && actionMutation.isPending ? "Launching…" : "Launch"}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      type="button"
                      className="h-8 px-3 text-xs"
                      disabled={actionMutation.isPending}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Rollback ${toggle.company_code}? This hides the carrier from the switcher again.`
                          )
                        ) {
                          return;
                        }
                        setPendingId(toggle.operating_company_id);
                        void actionMutation.mutateAsync({
                          carrierId: toggle.operating_company_id,
                          action: "rollback",
                        });
                      }}
                    >
                      {pendingId === toggle.operating_company_id && actionMutation.isPending
                        ? "Rolling back…"
                        : "Rollback"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
