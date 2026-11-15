/**
 * ROUND 9.4 Board 16 — docs/design/v3/Dispatch-BookLoad-Spec.dc.html
 * Measurement board: live Book Load field sizes vs the fix. Layout-only; same engines.
 */
import { Link } from "react-router-dom";
import { PageHeader, V3_HEADER_ACTION_STYLE } from "../../components/forms/shared/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { V3Panel } from "../../components/v3/V3Panel";
import { currentOriginHref, withReturnContext } from "../../lib/returnContext";
import { useLocation } from "react-router-dom";
import { V3 } from "../../design/v3-tokens";
import "../../assets/fonts/v3-maintenance/board-box.css";

type SpecRow = {
  id: string;
  field: string;
  live: string;
  fix: string;
  rule: string;
};

const ROWS: SpecRow[] = [
  { id: "modal", field: "Modal", live: "≈1,259 wide · column A ends ~120px above column B (empty white block)", fix: "1,260 center or 760 side panel; A and B balanced", rule: "owner: side panel + center" },
  { id: "load", field: "Load #", live: "288 × 28", fix: "110 × 32, right-aligned", rule: "5–6 digits" },
  { id: "customer", field: "Customer", live: "288 × 28", fix: "fills the row", rule: "long names" },
  { id: "money", field: "Linehaul / Fuel surcharge", live: "$0.00 boxes, small, mixed widths", fix: "equal quarters with Total, $3,200.00 right-aligned", rule: "QuickBooks money" },
  { id: "location", field: "Location / Address", live: "576 / 576 on staggered rows (labels misaligned)", fix: "one row: 1fr / 1.4fr, labels on one baseline", rule: "—" },
  { id: "csz", field: "City / State / ZIP", live: "381 / 381 / 381 (all equal)", fix: "City fills · State 64 · ZIP 88", rule: "owner: out of proportion" },
  { id: "appt", field: "Appointment date", live: "91 × 17 inside a grey box (shorter than every other box)", fix: "150 × 32, MM/DD/YYYY + calendar", rule: "QuickBooks date" },
  { id: "time", field: "Time window", live: "141–157 × 31", fix: "150 × 32", rule: "one height" },
  { id: "miles", field: "Practical / Shortest / Empty miles", live: "112 × 27 inside wide cells", fix: "box fills the cell, 32 tall, right-aligned", rule: "—" },
  { id: "drivers", field: "Driver list", live: "11 drivers; 4 in ALL CAPS (HUGO GAYTAN, EDUARDO AZAEL FLORES ORTIZ, JOSE ANTONIO VICENTE MARTINEZ, LUIS ARMANDO SOSA PEREZ, RUBEN PEDRO PEREZ GARCIA); shows Samsara # only", fix: "every active driver, proper case, usual truck + last load + status", rule: "owner: proper case" },
  { id: "missing", field: "Driver missing from list", live: "Concepcion Cordova Dominguez, Genaro Guerrero Chavez, Vicente Santos Contreras, Pedro Abraham Lopez Collado, Rafael Rogelio Rivero Reynoso (active in mdata.drivers) are not in the picker", fix: "list = all Active non-sample drivers", rule: "why T163 shows a raw id" },
  { id: "inputs", field: "Every input", live: "28 / 31 / 17 tall mixed", fix: "32 everywhere", rule: "one height" },
];

const COLUMNS: Array<ParityColumn<SpecRow>> = [
  { key: "field", label: "Field (live Book load)", sortable: true },
  { key: "live", label: "Live today (measured, CSS px)", sortable: false },
  { key: "fix", label: "Fix", sortable: false },
  { key: "rule", label: "Rule", sortable: true },
];

export default function BookLoadSpecBoardPage() {
  const { pathname, search } = useLocation();
  const originHref = currentOriginHref(pathname, search);
  const openWizard = withReturnContext("/dispatch/book-load?book_load=1", originHref);

  return (
    <div data-v3-board="Dispatch-BookLoad-Spec" data-testid="book-load-spec-board" style={{ lineHeight: "normal", fontFamily: V3.font, color: V3.ink, display: "flex", flexDirection: "column", gap: 12 }}>
      <PageHeader
        variant="v3"
        crumb="Dispatch › Book load"
        title="Book load — live today vs fix"
        subtitle="Measured in Chrome 7:11 PM CT on app.ih35dispatch.com"
        actions={
          <>
            <span style={{ ...V3_HEADER_ACTION_STYLE, cursor: "default" }}>Layout only · same engines</span>
            <Link to={openWizard} style={{ ...V3_HEADER_ACTION_STYLE, textDecoration: "none" }}>
              Every field, live measurement → fix
            </Link>
          </>
        }
      />

      <V3Panel
        board
        title="Every field, live measurement → fix"
        viewAllHref={openWizard}
        viewAllLabel="View all →"
        testId="book-load-spec-panel"
      >
        <ParityTable
          appearance="board"
          rows={ROWS}
          columns={COLUMNS}
          rowKey={(r) => r.id}
          storageKey="dispatch-book-load-spec"
          emptyText="No rows."
          tableTestId="book-load-spec-table"
        />
      </V3Panel>
    </div>
  );
}
