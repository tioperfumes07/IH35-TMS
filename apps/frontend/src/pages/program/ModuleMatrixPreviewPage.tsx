/**
 * Module matrix scoreboard — owner-approved layout preview (2026-08-08).
 * Box 1 (Required) is sourced from docs/specs/scoreboard/modules/maintenance.required.json.
 * Audited / Done remain SAMPLE until live R/M/D wiring.
 * Design lock: docs/specs/scoreboard/MODULE-MATRIX-SCOREBOARD-LOCKED.md
 */
import { Link } from "react-router-dom";
import maintRequired from "@scoreboard/modules/maintenance.required.json";

type Tri = "done" | "audited" | "unaudited" | "na";
type AdSample = "done" | "audited" | "unaudited";

type RequiredColumn = {
  id: string;
  group: string;
  label: string;
};

type RequiredLeaf = {
  id: string;
  tab: string;
  sub?: string;
  route_hint: string;
  required: string[];
};

type RequiredMap = {
  module: string;
  entity_default: string;
  columns: RequiredColumn[];
  leaves: RequiredLeaf[];
};

const REQUIRED_MAP = maintRequired as RequiredMap;
const COLS = REQUIRED_MAP.columns;

/** SAMPLE Audited/Done only — keyed by leaf id × column id. Missing → unaudited. */
const SAMPLE_AD: Record<string, Partial<Record<string, AdSample>>> = {
  "wo.create": {
    driver: "audited",
    customer: "unaudited",
    vendor: "done",
    unit: "done",
    trailer: "audited",
    load: "unaudited",
    ap_bill: "audited",
    expense: "audited",
    gl_je: "audited",
    inventory: "done",
    "scenario.maintenance": "done",
  },
  "wo.source.is": {
    driver: "done",
    vendor: "done",
    unit: "done",
    ap_bill: "audited",
    expense: "audited",
    gl_je: "audited",
    inventory: "done",
    "scenario.maintenance": "done",
  },
  "wo.source.es": {
    driver: "audited",
    vendor: "done",
    unit: "done",
    ap_bill: "unaudited",
    expense: "unaudited",
    gl_je: "unaudited",
    "scenario.maintenance": "done",
  },
  "wo.source.ac": {
    driver: "audited",
    vendor: "done",
    unit: "done",
    trailer: "unaudited",
    load: "unaudited",
    ap_bill: "unaudited",
    expense: "unaudited",
    gl_je: "unaudited",
    inventory: "audited",
    "scenario.maintenance": "done",
    "scenario.insurance": "audited",
  },
  "pm.schedule.create": {
    unit: "done",
    "scenario.maintenance": "done",
  },
  "defects.convert_to_wo": {
    driver: "done",
    unit: "done",
    trailer: "unaudited",
    "scenario.maintenance": "audited",
  },
};

function Cell({ state }: { state: Tri }) {
  if (state === "na") {
    return (
      <div className="cell3" aria-label="Not applicable">
        <span className="bx req-n">·</span>
        <span className="bx empty" />
        <span className="bx empty" />
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className="cell3" aria-label="Required audited done">
        <span className="bx req-y">✓</span>
        <span className="bx map-y">✓</span>
        <span className="bx done-y">✓</span>
      </div>
    );
  }
  if (state === "audited") {
    return (
      <div className="cell3" aria-label="Required audited not done">
        <span className="bx req-y">✓</span>
        <span className="bx map-w">●</span>
        <span className="bx done-n">✕</span>
      </div>
    );
  }
  return (
    <div className="cell3" aria-label="Required not audited">
      <span className="bx req-y">✓</span>
      <span className="bx map-n">✕</span>
      <span className="bx done-n">✕</span>
    </div>
  );
}

const MODULES = [
  "Home", "Dispatch", "Drivers", "Fleet", "Trailers", "Maintenance", "Safety", "Insurance",
  "Legal", "Accounting", "Banking", "Settlements", "Fuel", "Factoring", "Customers", "Vendors",
  "Lists", "Reports", "Inventory", "Compliance", "Cash flow", "Finance hub", "Tasks",
  "Notifications", "System", "Program",
] as const;

type Row =
  | { kind: "section"; label: string }
  | {
      kind: "leaf";
      leaf: RequiredLeaf;
      indent: 1 | 2;
      pct: number;
      cells: Tri[];
    };

function cellState(leafId: string, colId: string, required: Set<string>): Tri {
  if (!required.has(colId)) return "na";
  return SAMPLE_AD[leafId]?.[colId] ?? "unaudited";
}

function leafPct(cells: Tri[]): number {
  const owed = cells.filter((c) => c !== "na");
  if (owed.length === 0) return 0;
  const done = owed.filter((c) => c === "done").length;
  return Math.round((done / owed.length) * 100);
}

function sectionForLeaf(leaf: RequiredLeaf): string {
  if (leaf.id.startsWith("wo.")) return "Work Orders";
  if (leaf.id.startsWith("pm.")) return "Preventive";
  if (
    leaf.id.startsWith("in_transit.") ||
    leaf.id.startsWith("arriving_soon.") ||
    leaf.id.startsWith("damage_") ||
    leaf.id.startsWith("driver_reports.") ||
    leaf.id.startsWith("severe_") ||
    leaf.id.startsWith("road_service.") ||
    leaf.id.startsWith("defects.") ||
    leaf.id.startsWith("pre_flight_")
  ) {
    return "Operational queues";
  }
  if (leaf.id.startsWith("parts_inventory.")) return "Parts Inventory";
  return "Master data / programs";
}

function buildRows(): Row[] {
  const rows: Row[] = [];
  let lastSection = "";
  for (const leaf of REQUIRED_MAP.leaves) {
    const section = sectionForLeaf(leaf);
    if (section !== lastSection) {
      rows.push({ kind: "section", label: section });
      lastSection = section;
    }
    const req = new Set(leaf.required);
    const cells = COLS.map((c) => cellState(leaf.id, c.id, req));
    const indent: 1 | 2 = leaf.id.startsWith("wo.source.") ? 2 : 1;
    rows.push({
      kind: "leaf",
      leaf,
      indent,
      pct: leafPct(cells),
      cells,
    });
  }
  return rows;
}

const ROWS = buildRows();

function pctClass(n: number) {
  if (n >= 80) return "hi";
  if (n >= 40) return "mid";
  return "lo";
}

function boardMetrics() {
  let requiredCells = 0;
  let doneCells = 0;
  let buildQueue = 0;
  for (const row of ROWS) {
    if (row.kind !== "leaf") continue;
    for (const st of row.cells) {
      if (st === "na") continue;
      requiredCells += 1;
      if (st === "done") doneCells += 1;
      else buildQueue += 1;
    }
  }
  const modulePct = requiredCells === 0 ? 0 : Math.round((doneCells / requiredCells) * 100);
  return {
    modulePct,
    leafCount: REQUIRED_MAP.leaves.length,
    colCount: COLS.length,
    requiredCells,
    doneCells,
    buildQueue,
  };
}

const METRICS = boardMetrics();

export function ModuleMatrixPreviewPage() {
  return (
    <div className="ih35mm" data-testid="module-matrix-preview">
      <style>{CSS}</style>

      <div className="banner">
        <b>PREVIEW.</b> Box 1 Required is live from{" "}
        <code>docs/specs/scoreboard/modules/maintenance.required.json</code>
        {" "}({METRICS.leafCount} leaves). Audited / Done are still SAMPLE until live R/M/D wiring.
      </div>

      <nav className="tabs">
        <Link className="tab" to="/program">Scenario tracker</Link>
        <span className="tab active">Module matrix</span>
        <Link className="tab" to="/program/legacy-scoreboard">Legacy certification board</Link>
      </nav>

      <header className="hd">
        <div className="t">Program — Module matrix scoreboards</div>
        <div className="s">
          One shell · 26 module boards. Each board shows only the columns that module’s tabs / sub-tabs can need.
          Cell = <b>Required</b> · <b>Audited</b> · <b>Done</b>. Tab % and module % roll up from required cells only.
        </div>
        <div className="synced">
          Active board: <b>Maintenance</b> · Entity: <b>{REQUIRED_MAP.entity_default}</b> ·{" "}
          <span className="synced-note">Required map imported · Audited/Done sample</span>
        </div>
      </header>

      <div className="module-rail">
        <div className="lbl">26 module boards — open one at a time (columns scoped per module)</div>
        {MODULES.map((m) => (
          <span key={m} className={m === "Maintenance" ? "mod-pill on" : "mod-pill dim"}>
            {m}
          </span>
        ))}
      </div>

      <div className="metrics">
        <div className="metric amb">
          <div className="n">{METRICS.modulePct}%</div>
          <div className="l">Maintenance module %<br />(done ÷ required · sample A/D)</div>
        </div>
        <div className="metric">
          <div className="n">{METRICS.leafCount}</div>
          <div className="l">Leaves on this board<br />(from required JSON)</div>
        </div>
        <div className="metric">
          <div className="n">{METRICS.colCount}</div>
          <div className="l">Scoped columns<br />(not all system cards)</div>
        </div>
        <div className="metric">
          <div className="n">{METRICS.requiredCells}</div>
          <div className="l">Required cells<br />(box 1 green)</div>
        </div>
        <div className="metric good">
          <div className="n">{METRICS.doneCells}</div>
          <div className="l">Done cells<br />(sample all 3 green)</div>
        </div>
        <div className="metric big">
          <div className="n">{METRICS.buildQueue}</div>
          <div className="l">Build queue<br />(required, not done · sample)</div>
        </div>
      </div>

      <h2>
        Maintenance matrix{" "}
        <span className="sub">left = module tree · top = scoped columns · cell = R / M / D</span>
      </h2>

      <div className="legend">
        <span>
          <span className="tri">
            <span className="bx req-y">R</span>
            <span className="bx map-w">A</span>
            <span className="bx done-y">D</span>
          </span>{" "}
          Required · Audited · Done
        </span>
        <span><span className="bx req-y">✓</span> Required / complete</span>
        <span><span className="bx map-w">●</span> Audited / in progress (not done)</span>
        <span><span className="bx map-n">✕</span> Required but not audited → Done also ✕</span>
        <span><span className="bx req-n">·</span> Not applicable (not in %)</span>
      </div>

      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="leaf" rowSpan={2}>Module leaf</th>
              <th className="grp" colSpan={6}>Linkage targets</th>
              <th className="grp" colSpan={4}>Money / economics</th>
              <th className="grp" colSpan={2}>Process cards</th>
            </tr>
            <tr>
              {COLS.map((c) => (
                <th key={c.id} className="col">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => {
              if (row.kind === "section") {
                return (
                  <tr key={`s-${i}`} className="section">
                    <td colSpan={1 + COLS.length}>{row.label}</td>
                  </tr>
                );
              }
              return (
                <tr key={row.leaf.id}>
                  <td className={`leaf-cell indent-${row.indent}`}>
                    <span className="tab-name">{row.leaf.tab}</span>
                    {row.leaf.sub ? <span className="sub">{row.leaf.sub}</span> : null}
                    <span className={`pct ${pctClass(row.pct)}`}>{row.pct}%</span>
                  </td>
                  {row.cells.map((st, j) => (
                    <td key={COLS[j].id} className="gc">
                      <Cell state={st} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="note">
        <b>Cell law:</b> Required + not audited → ✓ ✕ ✕ (both 2 and 3 red). Required + audited/in progress → ✓ ● ✕
        (box 2 yellow, box 3 red). Complete → ✓ ✓ ✓. Insurance claim is N/A on normal Create WO — required on
        Accident repair / damage accident path only. PM Schedule requires unit + Maint WO only.
      </div>

      <div className="foot">
        Design lock: <code>docs/specs/scoreboard/MODULE-MATRIX-SCOREBOARD-LOCKED.md</code>
        {" · "}
        Required map: <code>docs/specs/scoreboard/modules/maintenance.required.json</code>
        {" · "}
        <Link to="/program">Scenario tracker</Link>
        {" · "}
        <Link to="/program/legacy-scoreboard">Legacy board</Link>
      </div>
    </div>
  );
}

export default ModuleMatrixPreviewPage;

const CSS = `
.ih35mm{--navy:#1f2a44;--navy-dk:#0f1729;--slate:#334155;--slate-lt:#64748b;--bg:#f8fafc;--card:#fff;--line:#e2e8f0;--green:#16a34a;--green-bg:#dcfce7;--red:#dc2626;--red-bg:#fee2e2;--amber:#d97706;--amber-bg:#fef3c7;--accent-bg:#e8eef7;--gray-bg:#f1f5f9;color:var(--navy);font-size:14px;padding:0 4px 40px}
.ih35mm *{box-sizing:border-box}
.ih35mm .banner{background:var(--amber-bg);border:1px solid #fde68a;color:#78350f;border-radius:10px;padding:10px 14px;font-size:12.5px;margin-bottom:14px;line-height:1.5}
.ih35mm .banner b{color:#92400e}
.ih35mm .tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:14px;flex-wrap:wrap}
.ih35mm .tab{padding:9px 14px;font-size:13px;font-weight:600;color:var(--slate-lt);text-decoration:none;border-bottom:2px solid transparent}
.ih35mm .tab.active{color:var(--navy);border-bottom-color:var(--navy)}
.ih35mm .hd{background:linear-gradient(135deg,var(--navy),var(--navy-dk));color:#fff;padding:16px 20px;border-radius:10px}
.ih35mm .hd .t{font-size:18px;font-weight:700}
.ih35mm .hd .s{color:#94a3b8;font-size:12px;margin-top:6px;line-height:1.55}
.ih35mm .hd .synced{margin-top:10px;font-size:12px;color:#e2e8f0}
.ih35mm .hd .synced b{color:#fff}
.ih35mm .hd .synced-note{color:#94a3b8}
.ih35mm .module-rail{display:flex;flex-wrap:wrap;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:14px 0}
.ih35mm .module-rail .lbl{width:100%;font-size:10px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:var(--slate-lt);margin-bottom:2px}
.ih35mm .mod-pill{font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;border:1px solid var(--line);background:var(--gray-bg);color:var(--slate)}
.ih35mm .mod-pill.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.ih35mm .mod-pill.dim{opacity:.55}
.ih35mm .metrics{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:0 0 16px}
.ih35mm .metric{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 13px}
.ih35mm .metric .n{font-size:22px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.ih35mm .metric .l{font-size:10px;color:var(--slate-lt);text-transform:uppercase;letter-spacing:.3px;margin-top:8px;line-height:1.3}
.ih35mm .metric.good .n{color:var(--green)}.ih35mm .metric.amb .n{color:var(--amber)}.ih35mm .metric.big .n{color:var(--red)}
.ih35mm h2{font-size:13.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--slate);margin:22px 0 10px;border-bottom:1px solid var(--line);padding-bottom:8px}
.ih35mm h2 .sub{text-transform:none;letter-spacing:0;color:var(--slate-lt);font-weight:400;font-size:12px;margin-left:8px}
.ih35mm .legend{display:flex;gap:14px;flex-wrap:wrap;margin:0 0 12px;font-size:12px;color:var(--slate)}
.ih35mm .legend span{display:inline-flex;align-items:center;gap:6px}
.ih35mm .tri{display:inline-grid;grid-template-columns:repeat(3,14px);gap:2px}
.ih35mm .bx{width:14px;height:14px;border-radius:3px;border:1px solid rgba(0,0,0,.08);display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;line-height:1}
.ih35mm .bx.req-y,.ih35mm .bx.map-y,.ih35mm .bx.done-y{background:var(--green-bg);color:var(--green);border-color:#86efac}
.ih35mm .bx.map-w{background:var(--amber-bg);color:var(--amber);border-color:#fde68a}
.ih35mm .bx.req-n{background:transparent;color:#cbd5e1;border-color:transparent}
.ih35mm .bx.map-n,.ih35mm .bx.done-n{background:var(--red-bg);color:var(--red);border-color:#fecaca}
.ih35mm .bx.empty{background:transparent;border-color:transparent}
.ih35mm .scroll{overflow-x:auto;border-radius:10px;border:1px solid var(--line);background:var(--card)}
.ih35mm table{width:100%;border-collapse:collapse;min-width:1100px}
.ih35mm th,.ih35mm td{padding:7px 8px;text-align:left;border-bottom:1px solid var(--line);font-size:12.5px;vertical-align:middle}
.ih35mm th{background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.25px;color:var(--slate-lt)}
.ih35mm th.col{text-align:center;min-width:72px;max-width:88px;white-space:normal;line-height:1.25;padding:8px 4px}
.ih35mm th.grp{text-align:center;color:var(--navy);border-bottom:2px solid var(--line);background:var(--accent-bg)}
.ih35mm th.leaf{min-width:220px;text-align:left}
.ih35mm td.leaf-cell{white-space:nowrap}
.ih35mm td.leaf-cell .tab-name{font-weight:700;color:var(--navy)}
.ih35mm td.leaf-cell .sub{color:var(--slate-lt);font-size:11.5px;margin-left:6px}
.ih35mm td.leaf-cell.indent-1{padding-left:18px}
.ih35mm td.leaf-cell.indent-2{padding-left:32px}
.ih35mm td.leaf-cell .pct{display:inline-block;margin-left:8px;font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:var(--gray-bg);color:var(--slate);font-variant-numeric:tabular-nums}
.ih35mm td.leaf-cell .pct.hi{background:var(--green-bg);color:var(--green)}
.ih35mm td.leaf-cell .pct.mid{background:var(--amber-bg);color:var(--amber)}
.ih35mm td.leaf-cell .pct.lo{background:var(--red-bg);color:var(--red)}
.ih35mm td.gc{text-align:center;padding:6px 4px}
.ih35mm tr.section td{background:#f8fafc;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.35px;color:var(--slate)}
.ih35mm .cell3{display:inline-grid;grid-template-columns:repeat(3,16px);gap:2px;justify-content:center}
.ih35mm .cell3 .bx{width:16px;height:16px;font-size:10px}
.ih35mm .note{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;margin-top:16px;font-size:13px;color:#78350f;line-height:1.55}
.ih35mm .foot{color:var(--slate-lt);font-size:11.5px;margin-top:18px;line-height:1.6}
.ih35mm .foot a{color:var(--navy);font-weight:600}
.ih35mm code{background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:12px}
@media(max-width:900px){.ih35mm .metrics{grid-template-columns:repeat(2,1fr)}}
`;
