import { useQuery } from "@tanstack/react-query";
import { entityLabel } from "../../../lib/entity-label";
import { useMemo } from "react";
import { useAuth } from "../../../auth/useAuth";
import { PageHeader } from "../../../components/layout/PageHeader";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { fetchAllFeatureFlags } from "../../../lib/feature-flags-client";

type OverrideRow = {
  uuid: string;
  flag_key: string;
  operating_company_id: string | null;
  user_uuid: string | null;
  enabled: boolean;
};

type FlagRow = {
  flag_key: string;
  description: string | null;
  default_enabled: boolean;
  rollout_pct: number;
  per_entity_only?: boolean;
  overrides: OverrideRow[];
};

export function FeatureFlagsManager() {
  const auth = useAuth();
  const allowed = auth.user?.role === "Owner";

  const query = useQuery({
    queryKey: ["feature-flags-admin"],
    queryFn: fetchAllFeatureFlags,
    enabled: allowed,
  });

  const overridesByFlag = useMemo(() => {
    const map = new Map<string, OverrideRow[]>();
    for (const row of query.data?.overrides ?? []) {
      const list = map.get(row.flag_key) ?? [];
      list.push(row);
      map.set(row.flag_key, list);
    }
    return map;
  }, [query.data?.overrides]);

  const rows: FlagRow[] = useMemo(
    () =>
      (query.data?.flags ?? []).map((flag) => ({
        ...flag,
        overrides: overridesByFlag.get(flag.flag_key) ?? [],
      })),
    [query.data?.flags, overridesByFlag],
  );

  const columns: Array<ParityColumn<FlagRow>> = useMemo(
    () => [
      {
        key: "flag_key",
        label: "Key",
        sortable: true,
        render: (row) => (
          <>
            <div className="font-medium text-gray-900">{row.flag_key}</div>
            <div className="text-xs text-gray-500">{row.description ?? "—"}</div>
          </>
        ),
      },
      {
        key: "default_enabled",
        label: "Default",
        sortable: true,
        sortValue: (row) => (row.per_entity_only ? -1 : row.default_enabled ? 1 : 0),
        render: (row) =>
          row.per_entity_only ? (
            <span className="text-xs text-gray-600" data-testid="per-entity-only-notice">
              Per-entity only — enable via a tenant override. Global default / rollout do not apply.
            </span>
          ) : (
            <span className={row.default_enabled ? "text-slate-700" : "text-gray-500"}>
              {row.default_enabled ? "On" : "Off"}
            </span>
          ),
      },
      {
        key: "rollout_pct",
        label: "Rollout %",
        sortable: true,
        sortValue: (row) => (row.per_entity_only ? -1 : Number(row.rollout_pct ?? 0)),
        render: (row) =>
          row.per_entity_only ? (
            <span className="text-xs text-gray-400">—</span>
          ) : (
            <span className="text-xs text-gray-600">{Number(row.rollout_pct ?? 0).toFixed(0)}%</span>
          ),
      },
      {
        key: "overrides",
        label: "Overrides",
        sortable: true,
        sortValue: (row) => row.overrides.length,
        render: (row) => (
          <ul className="space-y-1 text-xs">
            {row.overrides.map((override) => (
              <li key={override.uuid} className="flex items-center gap-2">
                <span>
                  {override.user_uuid
                    ? entityLabel(null, override.user_uuid, "User")
                    : entityLabel(null, override.operating_company_id, "Tenant")}
                  {" → "}
                  {override.enabled ? "on" : "off"}
                </span>
              </li>
            ))}
            {row.overrides.length === 0 ? <li className="text-gray-400">none</li> : null}
          </ul>
        ),
      },
    ],
    [],
  );

  if (!allowed) {
    return (
      <div className="p-6">
        <PageHeader title="Feature Flags" subtitle="Owner access required" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="feature-flags-manager">
      <PageHeader title="Feature Flags" subtitle="Read-only rollout and override status" />

      <div className="rounded-sm border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800" data-testid="feature-flags-read-only">
        Display only. Flag changes are managed through the controlled release workflow.
      </div>

      <section className="rounded-sm border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Flags</h2>
        {query.isError ? (
          <ListErrorState
            title="Couldn't load feature flags"
            status={0}
            message={(query.error as Error)?.message}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <ParityTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.flag_key}
            loading={query.isLoading}
            storageKey="admin-feature-flags"
            emptyText="No flags yet."
            tableTestId="feature-flags-table"
            rowTestId={(row) => `feature-flags-row-${row.flag_key}`}
          />
        )}
      </section>
    </div>
  );
}
