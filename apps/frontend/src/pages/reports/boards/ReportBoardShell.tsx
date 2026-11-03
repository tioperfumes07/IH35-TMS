/**
 * Rows 79-84 — the Reports viewer shell the five report boards share (V3-Reports-*.dc.html): sub-nav, header with
 * the source line, Print · Export PDF · Export XLSX, and the report tab strip. Export XLSX writes exactly the rows the
 * board's table shows (same exceljs writer the ParityTable uses); Export PDF opens the print dialog (Save as PDF).
 */
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { PageHeader } from "../../../components/layout/PageHeader";
import { downloadXlsx } from "../../../components/parity/useParityServerView";
import { V3 } from "../../../design/v3-tokens";
import { ReportsSubNav } from "../ReportsSubNav";
import { REPORT_BOARDS, type ReportBoardId } from "./reportBoardCatalog";

export type ReportBoardXlsx = { filename: string; header: string[]; body: Array<Array<string | number>> };

const BUTTON = "rounded-sm border border-[#DDE1E7] bg-white px-3 py-1 text-xs font-medium text-[#111827] hover:bg-[#F3F5F8]";

export function ReportBoardShell({
  id,
  subtitle,
  xlsx,
  children,
}: {
  id: ReportBoardId;
  subtitle: string;
  xlsx: () => ReportBoardXlsx | null;
  children: ReactNode;
}) {
  const entry = REPORT_BOARDS.find((b) => b.id === id)!;
  const exportXlsx = () => {
    const sheet = xlsx();
    if (sheet) void downloadXlsx(sheet.filename, sheet.header, sheet.body);
  };
  return (
    <div className="space-y-3" data-testid={`${id}-board`} data-report-board={id}>
      <ReportsSubNav />
      <PageHeader
        title={entry.label}
        subtitle={subtitle}
        backHref="/reports"
        breadcrumb={["Reports", entry.tab]}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <button type="button" className={BUTTON} onClick={() => window.print()} data-testid={`${id}-print`}>
              Print
            </button>
            <button
              type="button"
              className={BUTTON}
              title="Opens the print dialog — choose Save as PDF"
              onClick={() => window.print()}
              data-testid={`${id}-export-pdf`}
            >
              Export PDF
            </button>
            <button type="button" className={BUTTON} onClick={exportXlsx} data-testid={`${id}-export-xlsx`}>
              Export XLSX
            </button>
          </div>
        }
      />
      <nav aria-label="Reports" className="flex flex-wrap gap-1 print:hidden" data-testid="report-board-tabs">
        {REPORT_BOARDS.map((b) => (
          <NavLink
            key={b.id}
            to={b.href}
            className="rounded-sm px-3 py-1 text-xs font-semibold"
            style={({ isActive }) => ({
              background: isActive ? V3.shell : V3.surface,
              color: isActive ? "#FFFFFF" : V3.ink,
              border: `1px solid ${V3.border}`,
            })}
          >
            {b.tab}
          </NavLink>
        ))}
      </nav>
      {children}
    </div>
  );
}

export function ReportKpiGrid({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }} data-testid="report-board-kpis">
      {children}
    </div>
  );
}

export function ReportMeasuredNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-sm border border-[#DDE1E7] bg-[#F3F5F8] px-3 py-2 text-xs text-[#5B6576]" data-testid="report-board-measured">
      <strong className="text-[#111827]">Measured · </strong>
      {children}
    </p>
  );
}
