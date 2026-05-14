import { useQuery } from "@tanstack/react-query";
import { getLaunchReadiness, type LaunchTile } from "../../api/launch-readiness";
import { PageHeader } from "../../components/layout/PageHeader";
import { colors, typography } from "../../design/tokens";

function dotClass(status: LaunchTile["status"]): string {
  if (status === "green") return "bg-emerald-500";
  if (status === "yellow") return "bg-amber-400";
  return "bg-red-500";
}

function TileRow({ label, tile }: { label: string; tile: LaunchTile }) {
  return (
    <div className="flex items-start gap-3 rounded border border-gray-100 bg-white px-3 py-2">
      <span className={`mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${dotClass(tile.status)}`} />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-900">{label}</div>
        <div className="text-xs text-gray-600">{tile.detail}</div>
      </div>
    </div>
  );
}

export function LaunchReadinessPage() {
  const q = useQuery({
    queryKey: ["admin", "launch-readiness"],
    queryFn: getLaunchReadiness,
    refetchInterval: 30_000,
  });

  if (q.isError) {
    return (
      <div className="space-y-3">
        <PageHeader title="Launch readiness" subtitle="Owner / Administrator" />
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Could not load readiness data. Confirm you are signed in as Owner or Administrator.
        </div>
      </div>
    );
  }

  const data = q.data;

  return (
    <div className="space-y-6" style={{ fontFamily: typography.fontSans }}>
      <PageHeader
        title="Launch readiness"
        subtitle={data ? `Updated ${new Date(data.generated_at).toLocaleString()}` : "Loading…"}
      />

      {q.isLoading || !data ? (
        <div className="text-sm text-gray-500">Loading checks…</div>
      ) : (
        <>
          {data.errors?.length ? (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Partial data: {data.errors.join(" · ")}
            </div>
          ) : null}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">System status</h2>
            <div className="grid gap-2 md:grid-cols-2">
              <TileRow label="API healthcheck" tile={data.system_status.api_healthcheck} />
              <TileRow label="QBO sync worker" tile={data.system_status.qbo_sync_worker} />
              <TileRow label="QBO outbox dispatcher" tile={data.system_status.qbo_outbox_dispatcher} />
              <TileRow label="Scheduled reports worker" tile={data.system_status.scheduled_reports_worker} />
              <TileRow label="Plaid (production)" tile={data.system_status.plaid} />
              <TileRow label="Email queue activity" tile={data.system_status.email_queue} />
              <TileRow label="WhatsApp" tile={data.system_status.whatsapp} />
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Migrations</h2>
            <div
              className="rounded border border-gray-200 bg-white p-4 text-sm"
              style={{ borderColor: colors.sidebarBorder }}
            >
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <div className="text-xs uppercase text-gray-500">Applied</div>
                  <div className="text-lg font-semibold text-gray-900">{data.migrations.applied_count}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Pending files</div>
                  <div className="text-lg font-semibold text-gray-900">{data.migrations.pending_count}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Checksum mismatches</div>
                  <div className="text-lg font-semibold text-gray-900">{data.migrations.checksum_mismatch_count}</div>
                </div>
              </div>
              {data.migrations.pending_filenames.length ? (
                <div className="mt-3 max-h-32 overflow-auto rounded bg-gray-50 p-2 font-mono text-[11px] text-gray-700">
                  {data.migrations.pending_filenames.join(", ")}
                </div>
              ) : null}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Master data counts</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["Active drivers", data.master_counts.drivers_active],
                  ["Active units", data.master_counts.units_active],
                  ["Customers", data.master_counts.customers],
                  ["Vendors", data.master_counts.vendors],
                  ["Plaid-linked bank accounts", data.master_counts.bank_accounts_plaid_linked],
                  ["Loads (30d)", data.master_counts.loads_last_30_days],
                  ["Bank transactions (30d)", data.master_counts.bank_transactions_last_30_days],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded border border-gray-100 bg-white px-3 py-2">
                  <div className="text-xs uppercase text-gray-500">{label}</div>
                  <div className="text-lg font-semibold text-gray-900">{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Critical workflows</h2>
            <div className="grid gap-2 md:grid-cols-2">
              <TileRow label={`Settlements (30d): ${data.critical_workflows.settlements_last_30_days}`} tile={data.critical_workflows.settlements_workflow} />
              <TileRow
                label={`Open settlement disputes: ${data.critical_workflows.settlement_disputes_open}`}
                tile={data.critical_workflows.settlement_disputes_workflow}
              />
              <TileRow
                label={`Cash advances pending owner: ${data.critical_workflows.cash_advances_pending_owner_approval}`}
                tile={data.critical_workflows.cash_advances_workflow}
              />
              <TileRow
                label={`QBO sync alerts unresolved: ${data.critical_workflows.qbo_sync_errors_unresolved}`}
                tile={data.critical_workflows.qbo_sync_errors_workflow}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
