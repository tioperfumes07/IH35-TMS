import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";

type MigrationHealth = {
  applied: string[];
  expected: string[];
  missingInDB: string[];
  extraInDB: string[];
  ok: boolean;
};

async function fetchMigrationHealth(): Promise<{ status: number; body: MigrationHealth }> {
  const res = await fetch("/api/v1/admin/health/migrations", { credentials: "include" });
  const body = (await res.json()) as MigrationHealth;
  return { status: res.status, body };
}

export function MigrationStatusPage() {
  const auth = useAuth();
  const allowed = auth.user?.role === "Owner";

  const query = useQuery({
    queryKey: ["admin-migration-health"],
    queryFn: fetchMigrationHealth,
    enabled: Boolean(allowed && auth.user),
  });

  const missing = useMemo(() => new Set(query.data?.body.missingInDB ?? []), [query.data]);
  const extra = useMemo(() => new Set(query.data?.body.extraInDB ?? []), [query.data]);

  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copySql(name: string) {
    setCopyError(null);
    try {
      const res = await fetch(`/api/v1/admin/migrations/file?name=${encodeURIComponent(name)}`, {
        credentials: "include",
      });
      const payload = (await res.json()) as { sql?: string; error?: string };
      if (!res.ok || !payload.sql) {
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      await navigator.clipboard.writeText(payload.sql);
      setCopied(name);
      window.setTimeout(() => setCopied(null), 1500);
    } catch (e) {
      setCopyError(String((e as Error)?.message ?? e));
    }
  }

  if (!allowed) {
    return (
      <div className="space-y-3">
        <PageHeader title="Migration status" subtitle="Compare applied migrations with repo SQL files" />
        <p className="text-sm text-gray-600">Owner access is required.</p>
      </div>
    );
  }

  const rows = query.data?.body.expected ?? [];
  const applied = query.data?.body.applied ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Migration status"
        subtitle="Expected migrations from db/migrations (+ backend migrations), compared with database ledger"
      />

      {query.isLoading ? <p className="text-sm text-gray-600">Loading migration health…</p> : null}
      {query.isError ? (
        <p className="text-sm text-red-700">Failed to load migration health ({String((query.error as Error)?.message ?? query.error)}).</p>
      ) : null}

      {query.data ? (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-800">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                query.data.body.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
              }`}
            >
              {query.data.body.ok ? "In sync" : "Drift detected"}
            </span>
            <span className="text-xs text-gray-600">HTTP {query.data.status}</span>
            {query.data.status === 503 ? (
              <span className="text-xs text-amber-700">
                Service unavailable until migration drift is cleared.
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Expected (repo)</div>
              <ul className="mt-2 max-h-[420px] space-y-1 overflow-auto rounded border border-gray-100 bg-gray-50 p-2">
                {rows.map((name) => (
                  <li key={name} className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 inline-block h-2 w-2 rounded-full ${missing.has(name) ? "bg-red-500" : "bg-green-500"}`} />
                      <span className="break-all font-mono text-xs">{name}</span>
                    </div>
                    {missing.has(name) ? (
                      <button
                        type="button"
                        className="shrink-0 rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100"
                        onClick={() => copySql(name)}
                      >
                        {copied === name ? "Copied" : "Copy SQL"}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Applied (database)</div>
              <ul className="mt-2 max-h-[420px] space-y-1 overflow-auto rounded border border-gray-100 bg-gray-50 p-2">
                {applied.length ? (
                  applied.map((name) => (
                    <li key={name} className="flex items-start gap-2">
                      <span
                        className={`mt-1 inline-block h-2 w-2 rounded-full ${extra.has(name) ? "bg-amber-500" : "bg-gray-300"}`}
                      />
                      <span className="break-all font-mono text-xs">{name}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-gray-600">No applied migrations returned.</li>
                )}
              </ul>
              {query.data.body.extraInDB.length ? (
                <p className="mt-2 text-xs text-amber-800">
                  Extra in DB (not present in repo): {query.data.body.extraInDB.join(", ")}
                </p>
              ) : null}
            </div>
          </div>

          {copyError ? <p className="mt-3 text-xs text-red-700">{copyError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
