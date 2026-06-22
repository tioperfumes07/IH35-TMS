import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSamsaraOwnerConfig, saveSamsaraOwnerConfig } from "../../api/samsara";

export type SamsaraStepData = {
  configured?: boolean;
  org_id?: string | null;
  last_health_status?: string | null;
};

type Props = {
  companyId: string;
  value: SamsaraStepData;
  disabled?: boolean;
  onChange: (patch: SamsaraStepData) => void;
};

export function Step3SamsaraConnect({ companyId, value, disabled, onChange }: Props) {
  const qc = useQueryClient();
  const [apiToken, setApiToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [orgId, setOrgId] = useState(value.org_id ?? "");
  const [error, setError] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ["onboarding", "samsara-config", companyId],
    enabled: Boolean(companyId),
    queryFn: () => getSamsaraOwnerConfig(companyId),
  });

  const testMutation = useMutation({
    mutationFn: () =>
      saveSamsaraOwnerConfig({
        operating_company_id: companyId,
        api_token: apiToken,
        webhook_secret: webhookSecret,
        samsara_org_id: orgId.trim() || null,
      }),
    onSuccess: async (data) => {
      setError(null);
      setApiToken("");
      setWebhookSecret("");
      onChange({
        ...value,
        configured: data.is_configured,
        org_id: data.samsara_org_id,
        last_health_status: data.last_health_status,
      });
      await qc.invalidateQueries({ queryKey: ["onboarding", "samsara-config", companyId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const configured = configQuery.data?.is_configured ?? value.configured ?? false;
  const healthStatus = configQuery.data?.last_health_status ?? value.last_health_status ?? null;

  return (
    <div className="space-y-3" data-testid="onboarding-step-samsara">
      <h2 className="text-base font-semibold text-gray-900">Connect Samsara</h2>
      <p className="text-sm text-gray-600">
        Enter your Samsara API key to pull your initial fleet inventory and enable live telematics.
      </p>

      <div className="rounded border border-gray-200 bg-white p-3 text-sm">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${configured ? "bg-emerald-500" : "bg-gray-400"}`} />
          <span className="font-medium text-gray-900">{configured ? "Configured" : "Not configured"}</span>
        </div>
        <div className="mt-1 text-xs text-gray-600">Last health status: {healthStatus ?? "—"}</div>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-gray-700">API key</span>
        <input
          type="password"
          autoComplete="off"
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          value={apiToken}
          disabled={disabled}
          onChange={(e) => setApiToken(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-gray-700">Webhook secret</span>
        <input
          type="password"
          autoComplete="off"
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          value={webhookSecret}
          disabled={disabled}
          onChange={(e) => setWebhookSecret(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-gray-700">Samsara org id</span>
        <input
          type="text"
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          value={orgId}
          disabled={disabled}
          onChange={(e) => setOrgId(e.target.value)}
        />
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="button"
        disabled={disabled || !companyId || !apiToken || !webhookSecret || testMutation.isPending}
        onClick={() => testMutation.mutate()}
        className="rounded bg-[#1F2A44] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        Test connection &amp; pull fleet
      </button>
    </div>
  );
}
