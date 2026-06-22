import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

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

  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);
    void fetch(
      `/api/v1/border-crossing/history?operating_company_id=${encodeURIComponent(selectedCompanyId)}`,
      { credentials: "include" }
    )
      .then((res) => res.json())
      .then((data: { crossings?: CrossingRow[] }) => setRows(data.crossings ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [selectedCompanyId]);

  const pdfUrl =
    selected && selectedCompanyId
      ? `/api/v1/border-crossing/${selected.id}/emanifest.pdf?operating_company_id=${encodeURIComponent(selectedCompanyId)}`
      : null;

  return (
    <div data-testid="border-crossing-history-page" className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Border Crossing History"
        subtitle="Past wizard completions with eManifest re-download"
        actions={
          <Link to="/dispatch/border-crossing" className="rounded border px-3 py-1.5 text-sm">
            New crossing
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="overflow-x-auto rounded border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Direction</th>
                <th className="px-3 py-2">Port</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">eManifest</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-gray-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-gray-500">
                    No completed crossings yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`cursor-pointer border-t hover:bg-gray-50 ${selected?.id === row.id ? "bg-slate-100" : ""}`}
                    onClick={() => setSelected(row)}
                  >
                    <td className="px-3 py-2">{row.planned_crossing_date ?? row.crossing_date}</td>
                    <td className="px-3 py-2 capitalize">{row.direction}</td>
                    <td className="px-3 py-2">{row.port_of_entry}</td>
                    <td className="px-3 py-2">{row.unit_number ?? "—"}</td>
                    <td className="px-3 py-2">{row.emanifest_reference ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <aside className="rounded border bg-white p-4 text-sm">
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
                <a href={pdfUrl} className="inline-block rounded border px-3 py-1.5" target="_blank" rel="noreferrer">
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
