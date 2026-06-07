import { PageHeader } from "../../../components/layout/PageHeader";
import { MobileOptimizedTable } from "../../../components/shared/MobileOptimizedTable";
import latestReport from "../../../audit/mobile-responsive/latest-report.json";
import "../../../styles/mobile-responsive-tweaks.css";

type AuditIssue = {
  id: string;
  rule: string;
  file: string;
  message: string;
  suggested_fix: string;
  owner_module: string;
};

type AuditReport = {
  generated_at: string;
  viewport: { width: number; height: number };
  scanned_file_count: number;
  issue_count: number;
  issues: AuditIssue[];
};

export function MobileAuditReport() {
  const report = latestReport as AuditReport;

  return (
    <div className="mobile-audit-scope mx-auto max-w-6xl space-y-4" data-testid="mobile-audit-report">
      <PageHeader
        title="Mobile Responsive Audit"
        subtitle="375×667 viewport static scan — flags touch targets, tables, modals"
      />

      <section className="rounded border border-gray-200 bg-white p-4">
        <dl className="grid gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase text-gray-500">Viewport</dt>
            <dd className="text-sm font-medium">
              {report.viewport.width}×{report.viewport.height}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500">Files scanned</dt>
            <dd className="text-sm font-medium">{report.scanned_file_count}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500">Open issues</dt>
            <dd className="text-sm font-medium">{report.issue_count}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500">Last run</dt>
            <dd className="text-sm font-medium">{report.generated_at || "Not yet generated in CI"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">Flagged issues</h2>
        <MobileOptimizedTable
          rows={report.issues}
          rowKey={(row) => row.id}
          emptyMessage="No issues flagged — run the auditor in CI to refresh."
          columns={[
            { key: "rule", header: "Rule", render: (row) => row.rule },
            { key: "file", header: "File", render: (row) => row.file },
            { key: "message", header: "Finding", render: (row) => row.message },
            { key: "owner", header: "Owner", render: (row) => row.owner_module },
            { key: "fix", header: "Suggested fix", render: (row) => row.suggested_fix },
          ]}
        />
      </section>
    </div>
  );
}
