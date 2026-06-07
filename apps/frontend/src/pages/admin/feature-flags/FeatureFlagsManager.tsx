import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/useAuth";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Button } from "../../../components/Button";
import {
  createFeatureFlag,
  deleteFeatureFlagOverride,
  fetchAllFeatureFlags,
  setFeatureFlagOverride,
  updateFeatureFlag,
} from "../../../lib/feature-flags-client";

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
    const map = new Map<string, Array<{ uuid: string; flag_key: string; operating_company_id: string | null; user_uuid: string | null; enabled: boolean }>>();
    for (const row of query.data?.overrides ?? []) {
      const list = map.get(row.flag_key) ?? [];
      list.push(row);
      map.set(row.flag_key, list);
    }
    return map;
  }, [query.data?.overrides]);

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

      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <section className="rounded border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Create flag</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            placeholder="flag_key"
            value={newFlagKey}
            onChange={(e) => setNewFlagKey(e.target.value)}
          />
          <input
            className="min-w-[240px] rounded border border-gray-300 px-2 py-1 text-sm"
            placeholder="description"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
          <input
            className="min-w-[280px] rounded border border-gray-300 px-2 py-1 text-sm"
            placeholder="tenant override company UUID"
            value={tenantOverrideCompanyId}
            onChange={(e) => setTenantOverrideCompanyId(e.target.value)}
          />
          <Button
            type="button"
            disabled={!newFlagKey.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Add flag
          </Button>
        </div>
      </section>

      <section className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Flags</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-2 py-2">Key</th>
                <th className="px-2 py-2">Default</th>
                <th className="px-2 py-2">Rollout %</th>
                <th className="px-2 py-2">Overrides</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.flags ?? []).map((flag) => {
                const overrides = overridesByFlag.get(flag.flag_key) ?? [];
                return (
                  <tr key={flag.flag_key} className="border-b align-top">
                    <td className="px-2 py-2">
                      <div className="font-medium text-gray-900">{flag.flag_key}</div>
                      <div className="text-xs text-gray-500">{flag.description ?? "—"}</div>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={flag.default_enabled}
                        onChange={(e) =>
                          updateMutation.mutate({ flagKey: flag.flag_key, default_enabled: e.target.checked })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Number(flag.rollout_pct ?? 0)}
                        onChange={(e) =>
                          updateMutation.mutate({ flagKey: flag.flag_key, rollout_pct: Number(e.target.value) })
                        }
                      />
                      <div className="text-xs text-gray-600">{Number(flag.rollout_pct ?? 0).toFixed(0)}%</div>
                    </td>
                    <td className="px-2 py-2">
                      <ul className="space-y-1 text-xs">
                        {overrides.map((row) => (
                          <li key={row.uuid} className="flex items-center gap-2">
                            <span>
                              {row.user_uuid ? `user ${row.user_uuid.slice(0, 8)}…` : `tenant ${row.operating_company_id?.slice(0, 8)}…`}
                              {" → "}
                              {row.enabled ? "on" : "off"}
                            </span>
                            <button
                              type="button"
                              className="text-red-600 underline"
                              onClick={() => deleteOverrideMutation.mutate(row.uuid)}
                            >
                              remove
                            </button>
                          </li>
                        ))}
                        {overrides.length === 0 ? <li className="text-gray-400">none</li> : null}
                      </ul>
                    </td>
                    <td className="px-2 py-2">
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
                            flag_key: flag.flag_key,
                            operating_company_id: operatingCompanyId,
                            enabled: true,
                          });
                        }}
                      >
                        Tenant override ON
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {(query.data?.flags ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-sm text-gray-500">
                    No flags yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
