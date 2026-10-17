// TABLE_DATE_OMIT: this table has no date column by design — one row per static-scan finding; the run time is shown once above the table ("Last run").
import { PageHeader } from "../../../components/layout/PageHeader";
import { ParityTable } from "../../../components/parity/ParityTable";
import latestReport from "../../../audit/mobile-responsive/latest-report.json";
import "../../../styles/mobile-responsive-tweaks.css";
import { formatDateTimeUS } from "../../../lib/formatDate";

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

      <section className="rounded-sm border border-gray-200 bg-white p-4">
        <dl className="grid gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase text-gray-500">Viewport</dt>
            <dd className="text-xs font-medium">
              {report.viewport.width}×{report.viewport.height}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500">Files scanned</dt>
            <dd className="text-xs font-medium">{report.scanned_file_count}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500">Open issues</dt>
            <dd className="text-xs font-medium">{report.issue_count}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500">Last run</dt>
            <dd className="text-xs font-medium">{formatDateTimeUS(report.generated_at) || "Not yet generated in CI"}</dd>
          </div>
        </dl>
      </section>

      {/* LEAD 443.181 — the app's one table. An audit finding is a static-scan line, not a record: no row route. */}
      <ParityTable<AuditIssue>
        title="Flagged issues"
        tableTestId="mobile-audit-issues-table"
        storageKey="ih35.admin.mobile-audit-issues.v1"
        rows={report.issues}
        rowKey={(row) => row.id}
        emptyText="No issues flagged — run the auditor in CI to refresh."
        columns={[
          { key: "rule", label: "Rule" },
          { key: "file", label: "File" },
          { key: "message", label: "Finding", allowWrap: true },
          { key: "owner_module", label: "Owner" },
          { key: "suggested_fix", label: "Suggested fix", allowWrap: true },
        ]}
      />
    </div>
  );
}
