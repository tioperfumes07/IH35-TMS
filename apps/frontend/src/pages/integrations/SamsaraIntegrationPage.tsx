import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { disableSamsaraIntegration, getSamsaraOwnerConfig, saveSamsaraOwnerConfig } from "../../api/samsara";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { resolveSamsaraVisualStatus } from "../../lib/integration-telematics-status";

export function SamsaraIntegrationPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [apiToken, setApiToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [orgId, setOrgId] = useState("");

  const configQuery = useQuery({
    queryKey: ["integrations", "samsara", "config", companyId],
    queryFn: () => getSamsaraOwnerConfig(companyId),
    enabled: Boolean(companyId),
  });

  const publicHealth = useMemo(() => {
    const d = configQuery.data;
    if (!d) return undefined;
    return {
      is_configured: d.is_configured,
      is_enabled: d.is_enabled,
      last_health_status: d.last_health_status,
      last_health_check_at: d.last_health_check_at,
      last_error: d.last_error,
    };
  }, [configQuery.data]);

  const statusVis = resolveSamsaraVisualStatus(publicHealth);

  async function postConfig() {
    if (!companyId) throw new Error("missing_company");
    return saveSamsaraOwnerConfig({
      operating_company_id: companyId,
      api_token: apiToken,
      webhook_secret: webhookSecret,
      samsara_org_id: orgId.trim() || null,
    });
  }

  const saveMutation = useMutation({
    mutationFn: postConfig,
    onSuccess: async () => {
      pushToast("Samsara settings saved", "success");
      setApiToken("");
      setWebhookSecret("");
      await queryClient.invalidateQueries({ queryKey: ["integrations", "samsara"] });
    },
    onError: (e: unknown) => {
      pushToast(e instanceof Error ? e.message : "Save failed", "error");
    },
  });

  const testMutation = useMutation({
    mutationFn: postConfig,
    onSuccess: async () => {
      pushToast("Test connection completed (see health status)", "info");
      setApiToken("");
      setWebhookSecret("");
      await queryClient.invalidateQueries({ queryKey: ["integrations", "samsara"] });
    },
    onError: () => pushToast("Test connection failed", "error"),
  });

  const disableMutation = useMutation({
    mutationFn: () => {
      if (!companyId) throw new Error("missing_company");
      return disableSamsaraIntegration(companyId);
    },
    onSuccess: async () => {
      pushToast("Samsara integration disabled", "info");
      setApiToken("");
      setWebhookSecret("");
      setOrgId("");
      await queryClient.invalidateQueries({ queryKey: ["integrations", "samsara"] });
    },
    onError: () => pushToast("Disable failed", "error"),
  });

  if (!companyId) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Select an operating company to configure Samsara.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Samsara" subtitle="Telematics integration (MVP foundation — API wired post-MVP)" />

      <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <div className="mb-3 flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
              statusVis.dot === "green"
                ? "bg-emerald-500"
                : statusVis.dot === "yellow"
                  ? "bg-amber-400"
                  : statusVis.dot === "red"
                    ? "bg-red-500"
                    : "bg-slate-400"
            }`}
          />
          <span className="font-medium text-slate-900">{statusVis.label}</span>
        </div>
        <dl className="grid grid-cols-1 gap-2 text-xs text-slate-600">
          <div>
            <dt className="font-semibold text-slate-700">Last health check</dt>
            <dd>{configQuery.data?.last_health_check_at ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-700">Status</dt>
            <dd>{configQuery.data?.last_health_status ?? "—"}</dd>
          </div>
          {configQuery.data?.last_error ? (
            <div>
              <dt className="font-semibold text-slate-700">Last error</dt>
              <dd className="whitespace-pre-wrap text-red-700">{configQuery.data.last_error}</dd>
            </div>
          ) : null}
          <div>
            <dt className="font-semibold text-slate-700">Org id on file</dt>
            <dd>{configQuery.data?.samsara_org_id ?? "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Configure Samsara</h2>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">API token</span>
            <input
              type="password"
              autoComplete="off"
              className="w-full rounded border border-slate-300 px-2 py-1"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Webhook secret</span>
            <input
              type="password"
              autoComplete="off"
              className="w-full rounded border border-slate-300 px-2 py-1"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Samsara org id</span>
            <input
              type="text"
              className="w-full rounded border border-slate-300 px-2 py-1"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              placeholder="Optional until live API"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            disabled={saveMutation.isPending || !apiToken || !webhookSecret}
            onClick={() => saveMutation.mutate()}
          >
            Save &amp; test connection
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 disabled:opacity-50"
            disabled={testMutation.isPending || !apiToken || !webhookSecret}
            onClick={() => testMutation.mutate()}
          >
            Test connection
          </button>
          <button
            type="button"
            className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 disabled:opacity-50"
            disabled={disableMutation.isPending || !configQuery.data?.is_configured}
            onClick={() => disableMutation.mutate()}
          >
            Disable
          </button>
        </div>
      </div>
    </div>
  );
}
