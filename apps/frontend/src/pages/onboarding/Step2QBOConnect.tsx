import { getQboConnectionStatus, getQboAuthorizeStartUrl } from "../../api/forensic";
import { useQuery } from "@tanstack/react-query";

export type QboStepData = {
  connected?: boolean;
  realm_id?: string | null;
  connected_at?: string | null;
};

type Props = {
  companyId: string;
  value: QboStepData;
  disabled?: boolean;
  onChange: (patch: QboStepData) => void;
};

export function Step2QBOConnect({ companyId, value, disabled, onChange }: Props) {
  const statusQuery = useQuery({
    queryKey: ["onboarding", "qbo-status", companyId],
    enabled: Boolean(companyId),
    queryFn: () => getQboConnectionStatus(companyId),
  });

  const connected = statusQuery.data?.connected ?? value.connected ?? false;

  function handleConnect() {
    if (!companyId) return;
    onChange({ ...value, connected, realm_id: statusQuery.data?.realm_id ?? null });
    window.location.href = getQboAuthorizeStartUrl(companyId);
  }

  return (
    <div className="space-y-3" data-testid="onboarding-step-qbo">
      <h2 className="text-base font-semibold text-gray-900">Connect QuickBooks Online</h2>
      <p className="text-sm text-gray-600">
        Authorize QBO so invoices, bills, payments, and journal entries sync automatically. You can complete this later from Accounting settings.
      </p>

      <div className="rounded border border-gray-200 bg-white p-3 text-sm">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-gray-400"}`}
          />
          <span className="font-medium text-gray-900">{connected ? "Connected" : "Not connected"}</span>
        </div>
        {statusQuery.data?.realm_id ? (
          <div className="mt-1 text-xs text-gray-600">Realm: {statusQuery.data.realm_id}</div>
        ) : null}
      </div>

      <button
        type="button"
        disabled={disabled || !companyId}
        onClick={handleConnect}
        className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {connected ? "Reconnect QBO" : "Connect QBO"}
      </button>
    </div>
  );
}
