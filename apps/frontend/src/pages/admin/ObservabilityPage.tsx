import { useQuery, type UseQueryResult } from "@tanstack/react-query";
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

// ACC-18 (2026-09-03) — the "Health check" row above only linked OUT to raw /healthz JSON; nothing
// in the app rendered what it actually asserts. GET /api/v1/healthz is public (no credentials
// needed — see health.routes.ts), so this fetch never sends the admin session cookie.
type HealthzCheck = {
  name: string;
  ok: boolean;
  tier: "critical" | "warning" | string;
  duration_ms?: number;
  error?: string;
};
type HealthzPayload = {
  ok: boolean;
  git_sha?: string;
  checks: HealthzCheck[];
};
const LEDGER_CHECK_PREFIX = "ledger.";

async function fetchHealthzChecks(healthzUrl: string): Promise<HealthzPayload> {
  const res = await fetch(healthzUrl);
  if (!res.ok && res.status !== 503) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as HealthzPayload;
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

  // ACC-18 — a second query, not the first, so a healthz outage never blocks the page's own
  // Sentry/observability status above from rendering.
  const healthzQuery = useQuery({
    queryKey: ["admin-observability", "healthz-checks", query.data?.healthz_url],
    queryFn: () => fetchHealthzChecks(query.data!.healthz_url),
    enabled: Boolean(allowed && auth.user && query.data?.healthz_url),
    refetchInterval: 30_000,
  });

  if (!allowed) {
    return (
      <div className="p-6">
        <PageHeader title="Observability" />
        <p className="text-xs text-red-600 mt-4">Access restricted to Owner or Administrator.</p>
      </div>
    );
  }

  const data = query.data;

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader title="Observability" />

      {query.isLoading && (
        <p className="mt-4 text-xs text-gray-500">Loading…</p>
      )}

      {query.isError && (
        <p className="mt-4 text-xs text-red-600">
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
                <span className="text-slate-700 font-medium">
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
                  className="text-slate-700 underline text-xs"
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
                  className="text-slate-700 underline text-xs"
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
                className="text-slate-700 underline text-xs"
              >
                {data.healthz_url}
              </a>
            }
          />

          <HealthzChecksSection query={healthzQuery} />
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
      <span className="w-40 shrink-0 text-xs text-gray-500">{label}</span>
      <span className="text-xs">{value}</span>
    </div>
  );
}

/** ACC-18 — renders every /healthz check by name, not just the ledger.* ones, so this stays true
 * the day a new critical check is added; ledger.* checks are called out with their own heading
 * since those are the ones ACC-18 specifically named ("a health endpoint with zero financial
 * checks means nothing watches the books"). */
function HealthzChecksSection({ query }: { query: UseQueryResult<HealthzPayload, Error> }) {
  if (query.isLoading) {
    return <p className="mt-2 text-xs text-gray-500">Loading health checks…</p>;
  }
  if (query.isError || !query.data) {
    return <p className="mt-2 text-xs text-red-600">Failed to load /healthz checks.</p>;
  }
  const checks = query.data.checks ?? [];
  const ledgerChecks = checks.filter((c) => c.name.startsWith(LEDGER_CHECK_PREFIX));
  const otherChecks = checks.filter((c) => !c.name.startsWith(LEDGER_CHECK_PREFIX));

  return (
    <div className="mt-2 border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#14314F]">
          Health checks{query.data.git_sha ? ` — build ${query.data.git_sha.slice(0, 7)}` : ""}
        </h2>
        {/* §7 palette: green is reserved for the Class pill only — OK uses the neutral slate
            token, not a color-bearing status class. Red stays FAIL-only, matching the same
            red-for-broken-system convention already used across this admin surface
            (ErrorMonitor.tsx, LaunchReadinessPage.tsx, LaunchToggles.tsx). */}
        <span
          className={`rounded-sm px-2 py-0.5 text-xs font-semibold uppercase ${
            query.data.ok ? "bg-slate-100 text-slate-700" : "bg-red-100 text-red-800"
          }`}
          data-testid="healthz-overall-status"
        >
          {query.data.ok ? "OK" : "Attention needed"}
        </span>
      </div>

      {ledgerChecks.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Ledger / financial ({ledgerChecks.length})
          </h3>
          <HealthzCheckTable checks={ledgerChecks} />
        </div>
      )}

      {otherChecks.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Infrastructure ({otherChecks.length})
          </h3>
          <HealthzCheckTable checks={otherChecks} />
        </div>
      )}
    </div>
  );
}

function HealthzCheckTable({ checks }: { checks: HealthzCheck[] }) {
  return (
    <table className="mt-1 w-full text-xs" data-testid="healthz-check-table">
      <tbody className="divide-y divide-slate-100">
        {checks.map((c) => (
          <tr key={c.name} data-testid="healthz-check-row">
            <td className="py-1 pr-2 font-mono text-slate-700">{c.name}</td>
            <td className="py-1 pr-2 text-slate-500">{c.tier}</td>
            <td className="py-1 pr-2 text-slate-500">{c.duration_ms != null ? `${c.duration_ms}ms` : "—"}</td>
            <td className="py-1 text-right">
              <span
                className={
                  c.ok
                    ? "rounded-sm bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700"
                    : "rounded-sm bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-800"
                }
              >
                {c.ok ? "OK" : (c.error ?? "FAIL")}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
