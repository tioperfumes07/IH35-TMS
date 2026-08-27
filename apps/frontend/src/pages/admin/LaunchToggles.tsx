import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { resolveApiUrl } from "../../api/client";
import { useMemo, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { userFacingApiError } from "../../lib/api-error-message";
import { ConfirmModal } from "../../components/shared/ConfirmModal";

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
  const [pendingAction, setPendingAction] = useState<{
    carrierId: string;
    companyCode: string;
    action: "launch" | "rollback";
    notes: string;
  } | null>(null);

  const togglesQuery = useQuery({
    queryKey: ["admin-launch-toggles"],
    queryFn: fetchLaunchToggles,
    enabled: Boolean(allowed && auth.user),
  });

  const actionMutation = useMutation({
    mutationFn: (input: { carrierId: string; companyCode: string; action: "launch" | "rollback"; notes: string }) =>
      postToggleAction(input.carrierId, input.action, input.notes),
    onSuccess: async () => {
      setError(null);
      setNotes("");
      setPendingId(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-launch-toggles"] });
      await queryClient.invalidateQueries({ queryKey: ["org", "my-companies"] });
    },
    onError: (err) => setError(userFacingApiError(err, "Toggle action failed")),
  });

  const rows = togglesQuery.data?.toggles ?? [];

  const columns = useMemo((): Array<ParityColumn<LaunchToggle>> => {
    return [
      {
        key: "carrier",
        label: "Carrier",
        sortable: true,
        sortValue: (row) => row.short_name || row.legal_name || row.company_code,
        render: (row) => (
          <>
            <div className="font-medium">{row.short_name || row.legal_name}</div>
            <div className="text-xs text-gray-500">{row.company_code}</div>
          </>
        ),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        sortValue: (row) => (row.is_active ? "Launched" : "Hidden"),
        render: (row) =>
          row.is_active ? (
            <span className="rounded-sm bg-green-100 px-2 py-0.5 text-xs text-green-800">Launched</span>
          ) : (
            <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Hidden</span>
          ),
      },
      {
        key: "last_action",
        label: "Last action",
        sortable: true,
        sortValue: (row) => row.launched_at ?? row.rollback_at ?? "",
        render: (row) => (
          <div className="text-xs text-gray-600">
            {row.launched_at ? (
              <div>
                Launched {new Date(row.launched_at).toLocaleString()}
                {row.launched_by_email ? ` by ${row.launched_by_email}` : null}
              </div>
            ) : row.rollback_at ? (
              <div>Rolled back {new Date(row.rollback_at).toLocaleString()}</div>
            ) : (
              <span>—</span>
            )}
            {row.notes ? <div className="mt-1 italic">{row.notes}</div> : null}
          </div>
        ),
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) =>
          !row.is_active ? (
            <Button
              type="button"
              className="h-8 px-3 text-xs"
              disabled={actionMutation.isPending}
              onClick={() => {
                setPendingAction({
                  carrierId: row.operating_company_id,
                  companyCode: row.company_code,
                  action: "launch",
                  notes: notes.trim(),
                });
              }}
            >
              {pendingId === row.operating_company_id && actionMutation.isPending ? "Launching…" : "Launch"}
            </Button>
          ) : (
            <Button
              variant="secondary"
              type="button"
              className="h-8 px-3 text-xs"
              disabled={actionMutation.isPending}
              onClick={() => {
                setPendingAction({
                  carrierId: row.operating_company_id,
                  companyCode: row.company_code,
                  action: "rollback",
                  notes: notes.trim(),
                });
              }}
            >
              {pendingId === row.operating_company_id && actionMutation.isPending ? "Rolling back…" : "Rollback"}
            </Button>
          ),
      },
    ];
  }, [actionMutation, notes, pendingId]);

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

      {error ? <div className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <label className="block max-w-xl text-sm">
        <span className="font-medium text-gray-700">Launch notes (optional)</span>
        <textarea
          className="mt-1 w-full rounded-sm border border-gray-300 p-2 text-sm"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Cutover checklist reference, ticket id, etc."
        />
      </label>

      {togglesQuery.isError ? (
        <ListErrorState
          title="Couldn't load launch toggles"
          status={0}
          message={(togglesQuery.error as Error)?.message}
          onRetry={() => void togglesQuery.refetch()}
        />
      ) : (
        <div className="overflow-auto rounded-sm border border-gray-200 bg-white p-2">
          <ParityTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.operating_company_id}
            loading={togglesQuery.isLoading}
            storageKey="admin-launch-toggles"
            emptyText="No carriers configured for launch toggles."
            tableTestId="admin-launch-toggles-table"
            rowTestId={(row) => `admin-launch-toggles-row-${row.operating_company_id}`}
          />
        </div>
      )}

      <ConfirmModal
        open={Boolean(pendingAction)}
        title={pendingAction?.action === "rollback" ? "Rollback this carrier?" : "Launch this carrier?"}
        message={
          pendingAction
            ? pendingAction.action === "rollback"
              ? `Rollback ${pendingAction.companyCode}? This hides the carrier from the switcher again.`
              : `Launch ${pendingAction.companyCode} for office users with access?`
            : ""
        }
        confirmLabel={pendingAction?.action === "rollback" ? "Rollback carrier" : "Launch carrier"}
        danger={pendingAction?.action === "rollback"}
        onClose={() => setPendingAction(null)}
        onConfirm={async () => {
          if (!pendingAction) return;
          const input = pendingAction;
          setPendingId(input.carrierId);
          await actionMutation.mutateAsync(input);
        }}
      />
    </div>
  );
}
