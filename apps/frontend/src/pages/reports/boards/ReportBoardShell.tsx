/**
 * Rows 79-84 — the Reports viewer shell the five report boards share (V3-Reports-*.dc.html): sub-nav, header with
 * the source line, Print · Export PDF · Export XLSX, and the report tab strip. Export XLSX writes exactly the rows the
 * board's table shows (same exceljs writer the ParityTable uses); Export PDF opens the print dialog (Save as PDF).
 */
import React, { type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../../components/forms/shared/PageHeader";
import { NavyPageSubNav, type NavyPageSubNavItem } from "../../../components/layout/NavyPageSubNav";
import { V3_REPORT_HEADER_BTN, V3_REPORT_HEADER_BTN_PRIMARY } from "../../../components/v3/V3StatusPill";
import { REPORTS_SUB_NAV_ITEMS } from "../ReportsSubNav";
import { downloadXlsx } from "../../../components/parity/useParityServerView";
import { resolveBackHref } from "../../../lib/returnContext";
import { REPORT_BOARDS, type ReportBoardId } from "./reportBoardCatalog";

export type ReportBoardXlsx = { filename: string; header: string[]; body: Array<Array<string | number>> };

// V3-Reports-*.dc.html header buttons: 28px · 0 12px · radius 6 · 600 12px (border-box — the button's 28px includes its rule).
const BTN_OUTLINE: React.CSSProperties = V3_REPORT_HEADER_BTN;
const BTN_PRIMARY: React.CSSProperties = V3_REPORT_HEADER_BTN_PRIMARY;

/** The report boards' navy bar, as drawn: Reports · Category hub · Run report · the five boards · Cancellations ·
 *  Invoice Search · Scheduled (custom) · Audit (V3-Reports-Loads.dc.html). Built from the Reports nav's own entries. */
function reportBoardNavItems(): NavyPageSubNavItem[] {
  const by = (label: string) => REPORTS_SUB_NAV_ITEMS.find((i) => i.label === label);
  const head = ["Reports", "Category hub", "Run report"].map(by).filter((i): i is NavyPageSubNavItem => Boolean(i));
  const tail = ["Cancellations", "Invoice Search", "Scheduled (custom)", "Audit"].map(by).filter((i): i is NavyPageSubNavItem => Boolean(i));
  return [...head, ...REPORT_BOARDS.map((b) => ({ label: b.tab, to: b.href })), ...tail];
}

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
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  // ROUND 8.20 board25 — Reports Home attaches ?ret=; board shell Back must restore origin.
  const reportsBackHref = resolveBackHref({ searchParams, pathname, fallback: "/reports" });
  const exportXlsx = () => {
    const sheet = xlsx();
    if (sheet) void downloadXlsx(sheet.filename, sheet.header, sheet.body);
  };
  return (
    <div
      data-testid={`${id}-board`}
      data-report-board={id}
      data-v3-board={entry.v3Board}
      style={{ fontFamily: "Inter, sans-serif", display: "flex", flexDirection: "column", gap: 12 }}
    >
      {/* V3-Reports-*.dc.html: crumb "Reports › <tab>", ← Back · title 700 18px · source line, then the navy bar. */}
      <PageHeader
        variant="v3"
        crumb={`Reports › ${entry.tab}`}
        title={entry.label}
        subtitle={subtitle}
        backHref={reportsBackHref}
        actions={
          <div className="print:hidden" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" style={BTN_OUTLINE} onClick={() => window.print()} data-testid={`${id}-print`}>
              Print
            </button>
            <button
              type="button"
              style={BTN_OUTLINE}
              title="Opens the print dialog — choose Save as PDF"
              onClick={() => window.print()}
              data-testid={`${id}-export-pdf`}
            >
              Export PDF
            </button>
            <button type="button" style={BTN_PRIMARY} onClick={exportXlsx} data-testid={`${id}-export-xlsx`}>
              Export XLSX
            </button>
          </div>
        }
      />
      <div className="print:hidden" data-testid="report-board-tabs" style={{ marginTop: -8 }}>
        <NavyPageSubNav items={reportBoardNavItems()} />
      </div>
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
