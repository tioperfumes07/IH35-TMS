import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { entityLabel } from "../../../lib/entity-label";
import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/useAuth";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Button } from "../../../components/Button";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import {
  createFeatureFlag,
  deleteFeatureFlagOverride,
  fetchAllFeatureFlags,
  setFeatureFlagOverride,
  updateFeatureFlag,
} from "../../../lib/feature-flags-client";
import { listMyCompanies } from "../../../api/org";

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
  const queryClient = useQueryClient();
  const allowed = auth.user?.role === "Owner";
  const [newFlagKey, setNewFlagKey] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [tenantOverrideCompanyId, setTenantOverrideCompanyId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["feature-flags-admin"],
    queryFn: fetchAllFeatureFlags,
    enabled: allowed,
  });

  // Entities the owner can target a per-entity override at — so they pick "IH35 TRANSP" from a
  // dropdown instead of pasting a company UUID.
  const companiesQuery = useQuery({
    queryKey: ["my-companies"],
    queryFn: listMyCompanies,
    enabled: allowed,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["feature-flags-admin"] });

  const createMutation = useMutation({
    mutationFn: () =>
      createFeatureFlag({
        flag_key: newFlagKey.trim(),
        description: newDescription.trim() || undefined,
      }),
    onSuccess: () => {
      setNewFlagKey("");
      setNewDescription("");
      setError(null);
      invalidate();
    },
    onError: (err: Error) => setError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { flagKey: string; default_enabled?: boolean; rollout_pct?: number }) =>
      updateFeatureFlag(input.flagKey, {
        default_enabled: input.default_enabled,
        rollout_pct: input.rollout_pct,
      }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err: Error) => setError(err.message),
  });

  const overrideMutation = useMutation({
    mutationFn: (input: { flag_key: string; operating_company_id?: string; enabled: boolean }) =>
      setFeatureFlagOverride(input),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteOverrideMutation = useMutation({
    mutationFn: (uuid: string) => deleteFeatureFlagOverride(uuid),
    onSuccess: invalidate,
    onError: (err: Error) => setError(err.message),
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
            <input
              type="checkbox"
              checked={row.default_enabled}
              onChange={(e) =>
                updateMutation.mutate({ flagKey: row.flag_key, default_enabled: e.target.checked })
              }
            />
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
            <>
              <input
                type="range"
                min={0}
                max={100}
                value={Number(row.rollout_pct ?? 0)}
                onChange={(e) =>
                  updateMutation.mutate({ flagKey: row.flag_key, rollout_pct: Number(e.target.value) })
                }
              />
              <div className="text-xs text-gray-600">{Number(row.rollout_pct ?? 0).toFixed(0)}%</div>
            </>
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
                <button
                  type="button"
                  className="text-red-600 underline"
                  onClick={() => deleteOverrideMutation.mutate(override.uuid)}
                >
                  remove
                </button>
              </li>
            ))}
            {row.overrides.length === 0 ? <li className="text-gray-400">none</li> : null}
          </ul>
        ),
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        alwaysVisible: true,
        render: (row) => (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const operatingCompanyId = tenantOverrideCompanyId.trim();
              if (!operatingCompanyId) {
                setError("operating_company_id required for tenant override");
                return;
              }
              overrideMutation.mutate({
                flag_key: row.flag_key,
                operating_company_id: operatingCompanyId,
                enabled: true,
              });
            }}
          >
            Tenant override ON
          </Button>
        ),
      },
    ],
    [deleteOverrideMutation, overrideMutation, tenantOverrideCompanyId, updateMutation],
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
      <PageHeader title="Feature Flags" subtitle="Per-tenant rollout and per-user overrides" />

      {error ? <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-sm border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Create flag</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="rounded-sm border border-gray-300 px-2 py-1 text-sm"
            placeholder="flag_key"
            value={newFlagKey}
            onChange={(e) => setNewFlagKey(e.target.value)}
          />
          <input
            className="min-w-[240px] rounded-sm border border-gray-300 px-2 py-1 text-sm"
            placeholder="description"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
          <select
            className="min-w-[280px] rounded-sm border border-gray-300 px-2 py-1 text-sm"
            value={tenantOverrideCompanyId}
            onChange={(e) => setTenantOverrideCompanyId(e.target.value)}
            aria-label="Entity for per-entity (tenant) override"
          >
            <option value="">Select entity for override…</option>
            {(companiesQuery.data?.companies ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {(c.short_name || c.legal_name)} ({c.code})
              </option>
            ))}
          </select>
          <Button
            type="button"
            disabled={!newFlagKey.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Add flag
          </Button>
        </div>
      </section>

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
