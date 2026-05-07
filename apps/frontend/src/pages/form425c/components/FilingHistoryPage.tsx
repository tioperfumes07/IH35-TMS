import { Button } from "../../../components/Button";

type Props = {
  reports: Array<Record<string, unknown>>;
  onOpen: (id: string) => void;
  onMarkFiled: (id: string) => void;
  onAmend: (id: string) => void;
};

export function FilingHistoryPage({ reports, onOpen, onMarkFiled, onAmend }: Props) {
  return (
    <section className="rounded border border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Filing History</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-xs">
          <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-2 py-2">Reporting Month</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Filed Date</th>
              <th className="px-2 py-2">Filed By</th>
              <th className="px-2 py-2">Amended?</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reports.map((report) => (
              <tr key={String(report.id)}>
                <td className="px-2 py-2">{String(report.reporting_month ?? "")}</td>
                <td className="px-2 py-2">{String(report.status ?? "")}</td>
                <td className="px-2 py-2">{String(report.filed_at ?? "—")}</td>
                <td className="px-2 py-2">{String(report.filed_by_user_id ?? "—")}</td>
                <td className="px-2 py-2">{report.amended_from_uuid ? "Yes" : "No"}</td>
                <td className="px-2 py-2">
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => onOpen(String(report.id))}>
                      Open
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => onMarkFiled(String(report.id))}>
                      Mark Filed
                    </Button>
                    <Button size="sm" onClick={() => onAmend(String(report.id))}>
                      Amend
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {reports.length === 0 ? (
              <tr>
                <td className="px-2 py-4 text-gray-500" colSpan={6}>
                  No reports created yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
