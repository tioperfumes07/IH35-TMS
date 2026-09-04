import { useMemo } from "react";
import { resolveApiUrl } from "../../api/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

type BufferedErrorRecord = {
  ts: number;
  kind: "client" | "server";
  message: string;
  detail?: Record<string, unknown>;
};

type ErrorRow = BufferedErrorRecord & { id: string };

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

const COLUMNS: Array<ParityColumn<ErrorRow>> = [
  {
    key: "ts",
    label: "Time",
    sortable: true,
    sortValue: (row) => row.ts,
    render: (row) => (
      <span className="whitespace-nowrap font-mono text-[11px] text-gray-700">{formatTs(row.ts)}</span>
    ),
  },
  {
    key: "kind",
    label: "Kind",
    sortable: true,
    render: (row) => (
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          row.kind === "server" ? "bg-red-50 text-red-800" : "bg-slate-100 text-slate-700"
        }`}
      >
        {row.kind}
      </span>
    ),
  },
  {
    key: "message",
    label: "Message",
    sortable: true,
    render: (row) => <span className="text-gray-800">{row.message}</span>,
  },
  {
    key: "detail",
    label: "Detail",
    sortable: true,
    sortValue: (row) => (row.detail ? 1 : 0),
    render: (row) => <span className="text-gray-700">{row.detail ? "Available" : "—"}</span>,
  },
];

export function ErrorMonitorPage() {
  const auth = useAuth();
  const allowed = auth.user?.role === "Owner";

  const query = useQuery({
    queryKey: ["admin-error-monitor-recent"],
    queryFn: fetchRecentErrors,
    enabled: Boolean(allowed && auth.user),
    refetchInterval: 15_000,
  });

  const rows: ErrorRow[] = useMemo(
    () => (query.data?.errors ?? []).map((row, idx) => ({ ...row, id: `${row.ts}-${idx}` })),
    [query.data?.errors],
  );

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
        <p className="text-xs text-gray-600">Owner access is required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Error monitor" subtitle={`Buffered errors — client: ${counts.client}, server: ${counts.server}`} />

      {query.isError ? (
        <ListErrorState
          title="Couldn't load error monitor"
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <div className="overflow-auto rounded-sm border border-gray-200 bg-white p-2">
          <ParityTable
            rows={rows}
            columns={COLUMNS}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            storageKey="admin-error-monitor"
            emptyText="No buffered errors yet (this resets on process restart)."
            tableTestId="admin-error-monitor-table"
            rowTestId={(row) => `admin-error-monitor-row-${row.id}`}
            renderExpanded={(row) =>
              row.detail ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Detail (JSON)</div>
                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-sm border border-gray-200 bg-white p-3 text-[11px] text-gray-800">
                    {JSON.stringify(row.detail, null, 2)}
                  </pre>
                </div>
              ) : (
                <span className="text-xs text-gray-500">No detail payload for this error.</span>
              )
            }
          />
        </div>
      )}
    </div>
  );
}
