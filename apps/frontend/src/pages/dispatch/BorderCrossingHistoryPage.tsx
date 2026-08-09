import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { CustomsTimePill } from "../../components/dispatch/CustomsTimePill";
import { resolveApiUrl } from "../../api/client";
import { formatDateUS } from "../../lib/formatDate";

type CrossingRow = {
  id: string;
  crossing_date: string;
  planned_crossing_date: string | null;
  direction: string;
  port_of_entry: string;
  commodity: string | null;
  emanifest_reference: string | null;
  emanifest_status: string | null;
  customs_broker_status: string | null;
  wizard_completed_at: string | null;
  unit_number: string | null;
  driver_name: string | null;
  load_number: string | null;
};

export function BorderCrossingHistoryPage() {
  const { selectedCompanyId } = useCompanyContext();
  const [rows, setRows] = useState<CrossingRow[]>([]);
  const [selected, setSelected] = useState<CrossingRow | null>(null);
  const [loading, setLoading] = useState(false);
  // C-07: never swallow fetch failures into an empty table (looks like "no crossings").
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setLoadError(null);
    void fetch(resolveApiUrl(`/api/v1/border-crossing/history?operating_company_id=${encodeURIComponent(selectedCompanyId)}`),
      { credentials: "include" }
    )
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Border crossing history failed (${res.status})`);
        }
        return res.json() as Promise<{ crossings?: CrossingRow[] }>;
      })
      .then((data) => setRows(data.crossings ?? []))
      .catch((err: unknown) => {
        setRows([]);
        setLoadError(err instanceof Error ? err.message : "Failed to load border crossing history");
      })
      .finally(() => setLoading(false));
  }, [selectedCompanyId]);

  const pdfUrl =
    selected && selectedCompanyId
      ? `/api/v1/border-crossing/${selected.id}/emanifest.pdf?operating_company_id=${encodeURIComponent(selectedCompanyId)}`
      : null;

  // Migrated to the shared QBO-parity grid — columns and order preserved; row click still opens the
  // detail aside (§7 additive-only).
  const columns: Array<ParityColumn<CrossingRow>> = [
    { key: "crossing_date", label: "Date", sortable: true, render: (row) => formatDateUS(row.planned_crossing_date ?? row.crossing_date) },
    { key: "direction", label: "Direction", sortable: true, className: "capitalize", cellClass: "capitalize" },
    {
      key: "port_of_entry",
      label: "Port",
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <span>{row.port_of_entry}</span>
          {selectedCompanyId && row.port_of_entry && row.direction ? (
            <CustomsTimePill
              operatingCompanyId={selectedCompanyId}
              crossingPoint={row.port_of_entry}
              direction={row.direction as "northbound" | "southbound"}
            />
          ) : null}
        </div>
      ),
    },
    { key: "unit_number", label: "Unit", sortable: true, render: (row) => row.unit_number ?? "—" },
    { key: "emanifest_reference", label: "eManifest", render: (row) => row.emanifest_reference ?? "—" },
  ];

  return (
    <div data-testid="border-crossing-history-page" className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Border Crossing History"
        subtitle="Past wizard completions with eManifest re-download"
        actions={
          <Link to="/dispatch/border-crossing" className="rounded-sm border px-3 py-1.5 text-sm">
            New crossing
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {loadError ? (
          <div
            className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            data-testid="border-crossing-history-error"
            role="alert"
          >
            {loadError}
          </div>
        ) : (
        <ParityTable<CrossingRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyText="No completed crossings yet."
          onRowClick={(row) => setSelected(row)}
          storageKey="dispatch-border-crossing-history"
          exportFilename="border-crossing-history"
        />
        )}

        <aside className="rounded-sm border bg-white p-4 text-sm">
          {!selected ? (
            <p className="text-gray-500">Select a row for detail.</p>
          ) : (
            <div className="space-y-2">
              <h3 className="font-semibold">Crossing detail</h3>
              <p>
                <span className="text-gray-500">Commodity:</span> {selected.commodity ?? "—"}
              </p>
              <p>
                <span className="text-gray-500">Driver:</span> {selected.driver_name ?? "—"}
              </p>
              <p>
                <span className="text-gray-500">Load:</span> {selected.load_number ?? "—"}
              </p>
              <p>
                <span className="text-gray-500">Broker status:</span> {selected.customs_broker_status ?? "—"}
              </p>
              {pdfUrl ? (
                <a href={pdfUrl} className="inline-block rounded-sm border px-3 py-1.5" target="_blank" rel="noreferrer">
                  Re-download eManifest PDF
                </a>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
