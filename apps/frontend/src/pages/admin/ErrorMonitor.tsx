import { useMemo, useState } from "react";
import { resolveApiUrl } from "../../api/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";

type BufferedErrorRecord = {
  ts: number;
  kind: "client" | "server";
  message: string;
  detail?: Record<string, unknown>;
};

async function fetchRecentErrors(): Promise<{ errors: BufferedErrorRecord[] }> {
  const res = await fetch(resolveApiUrl("/api/v1/admin/error-monitor/recent"), { credentials: "include" });
  const body = (await res.json()) as { errors?: BufferedErrorRecord[]; error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return { errors: Array.isArray(body.errors) ? body.errors : [] };
}

function formatTs(ts: number): string {
  try {
    return new Date(ts).toISOString();
  } catch {
    return String(ts);
  }
}

export function ErrorMonitorPage() {
  const auth = useAuth();
  const allowed = auth.user?.role === "Owner";

  const query = useQuery({
    queryKey: ["admin-error-monitor-recent"],
    queryFn: fetchRecentErrors,
    enabled: Boolean(allowed && auth.user),
    refetchInterval: 15_000,
  });

  const rows = query.data?.errors ?? [];
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const counts = useMemo(() => {
    let client = 0;
    let server = 0;
    for (const r of rows) {
      if (r.kind === "client") client += 1;
      if (r.kind === "server") server += 1;
    }
    return { client, server };
  }, [rows]);

  if (!allowed) {
    return (
      <div className="space-y-3">
        <PageHeader title="Error monitor" subtitle="Buffered client + server errors (last window)" />
        <p className="text-sm text-gray-600">Owner access is required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Error monitor" subtitle={`Buffered errors — client: ${counts.client}, server: ${counts.server}`} />

      {query.isLoading ? <p className="text-sm text-gray-600">Loading…</p> : null}
      {query.isError ? (
        <p className="text-sm text-red-700">Failed to load errors ({String((query.error as Error)?.message ?? query.error)}).</p>
      ) : null}

      <div className="overflow-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs text-gray-800">
          <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">Message</th>
              <th className="px-3 py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, idx) => {
                const key = `${row.ts}-${idx}`;
                const open = Boolean(expanded[key]);
                return (
                  <tr key={key} className="border-t border-gray-100 align-top">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-gray-700">{formatTs(row.ts)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          row.kind === "server" ? "bg-red-50 text-red-800" : "bg-blue-50 text-blue-800"
                        }`}
                      >
                        {row.kind}
                      </span>
                    </td>
                    <td className="px-3 py-2">{row.message}</td>
                    <td className="px-3 py-2">
                      {row.detail ? (
                        <button
                          type="button"
                          className="text-xs text-blue-700 underline"
                          onClick={() => setExpanded((s) => ({ ...s, [key]: !open }))}
                        >
                          {open ? "Hide" : "Show"}
                        </button>
                      ) : (
                        "—"
                      )}
                      {open && row.detail ? (
                        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-[11px] text-gray-800">
                          {JSON.stringify(row.detail, null, 2)}
                        </pre>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className="px-3 py-4 text-sm text-gray-600" colSpan={4}>
                  No buffered errors yet (this resets on process restart).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
