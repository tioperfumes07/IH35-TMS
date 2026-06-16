import { useQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";

type ObservabilityStatus = {
  sentry_configured: boolean;
  sentry_org_url: string | null;
  recent_errors_url: string | null;
  healthz_url: string;
};

async function fetchObservabilityStatus(): Promise<ObservabilityStatus> {
  const res = await fetch(resolveApiUrl("/api/v1/admin/observability"), { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ObservabilityStatus;
}

export function ObservabilityPage() {
  const auth = useAuth();
  const allowed =
    auth.user?.role === "Owner" || auth.user?.role === "Administrator";

  const query = useQuery({
    queryKey: ["admin-observability"],
    queryFn: fetchObservabilityStatus,
    enabled: Boolean(allowed && auth.user),
  });

  if (!allowed) {
    return (
      <div className="p-6">
        <PageHeader title="Observability" />
        <p className="text-sm text-red-600 mt-4">Access restricted to Owner or Administrator.</p>
      </div>
    );
  }

  const data = query.data;

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader title="Observability" />

      {query.isLoading && (
        <p className="mt-4 text-sm text-gray-500">Loading…</p>
      )}

      {query.isError && (
        <p className="mt-4 text-sm text-red-600">
          Failed to load observability status.
        </p>
      )}

      {data && (
        <div className="mt-6 space-y-4">
          <StatusRow
            label="Sentry"
            value={
              data.sentry_configured ? (
                <span className="text-green-700 font-medium">Configured ✓</span>
              ) : (
                <span className="text-yellow-700 font-medium">
                  Not configured — set SENTRY_DSN env var
                </span>
              )
            }
          />

          {data.sentry_org_url && (
            <StatusRow
              label="Sentry organization"
              value={
                <a
                  href={data.sentry_org_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline text-sm"
                >
                  {data.sentry_org_url}
                </a>
              }
            />
          )}

          {data.recent_errors_url && (
            <StatusRow
              label="Recent errors"
              value={
                <a
                  href={data.recent_errors_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline text-sm"
                >
                  Open in Sentry →
                </a>
              }
            />
          )}

          <StatusRow
            label="Health check"
            value={
              <a
                href={data.healthz_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline text-sm"
              >
                {data.healthz_url}
              </a>
            }
          />
        </div>
      )}
    </div>
  );
}

function StatusRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="w-40 shrink-0 text-sm text-gray-500">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
