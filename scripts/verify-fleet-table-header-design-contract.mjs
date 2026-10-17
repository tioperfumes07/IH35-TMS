#!/usr/bin/env node
// FLEET-TABLE-DESIGN-PARITY-01 (Codex X.7, owner row #21 2026-09-05: "maintenance tables/KPIs on
// the ParityTable design contract").
//
// Root cause: every maintenance table already renders its column headers through the shared,
// token-driven `TableHeaderCell` (components/table/TableHeaderCell.tsx, FROZEN — CC-2 owns it) —
// EXCEPT apps/frontend/src/components/FleetTable.tsx, whose checkbox-select and Edit header cells
// were two bare `<th className="...">` elements inside a `<thead className="bg-gray-50
// text-[11px] uppercase text-gray-600">` wrapper. Every other `<th>` in that same row painted the
// contract's `colors.tableHeaderBg` (#EEF2F6) / `colors.tableHeaderText` / weight 700 via an
// inline style; these two fell back to Tailwind's bg-gray-50/text-gray-600 with no weight — a
// visibly different shade and weight sitting in the SAME header row as the compliant cells.
//
// This guard is static (source-text assertions, no DB/browser) and scoped to the one file this
// PR fixes. It fails the build if:
//   1. FleetTable.tsx's <thead> reverts to painting a background itself (the contract lives on the
//      cells, not the row — see TableHeaderCell.tsx and DESIGN-CONTRACT-LOAD-COSTS-BOARD-2026-09-05.md).
//   2. A bare `<th` re-appears in FleetTable.tsx without pairing `colors.tableHeaderBg` in the same
//      element (i.e. a header cell that isn't `TableHeaderCell` and isn't styled to the token).
//   3. The header row no longer imports `colors`/`typography` from design/tokens.
//
// LEAD 443.181 (owner: "all tables built the same way"): the roster now renders on <ParityTable>, so every header
// cell — checkbox, data columns and the row-actions (Edit) column — is painted by ParityTable itself from the same
// design-contract tokens. The guard now fails if FleetTable.tsx:
//   1. stops rendering on ParityTable, or
//   2. hand-builds a header again (a raw <table> / <thead> / <th> beside it), or
//   3. overrides ParityTable's contract header shade/ink/weight (headerBg / headerInk / headerWeight).
//
// Usage: node scripts/verify-fleet-table-header-design-contract.mjs [--selftest]

import { readFileSync } from "node:fs";

const FILE = "apps/frontend/src/components/FleetTable.tsx";

function audit(src) {
  const f = [];
  if (!/<ParityTable\b/.test(src)) {
    f.push(`${FILE}: the roster must render on <ParityTable> (the one table component carrying the header design contract)`);
  }
  if (/<table[\s>]|<thead[\s>]|<th[\s>]/.test(src)) {
    f.push(`${FILE}: hand-built <table>/<thead>/<th> header markup is back — the header contract lives in ParityTable`);
  }
  if (/\bheader(Bg|Ink|Weight)=/.test(src)) {
    f.push(`${FILE}: must not override ParityTable's contract header shade / ink / weight`);
  }
  return f;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const src = readFileSync(FILE, "utf8");
  const failures = audit(src);

  if (failures.length) {
    console.error("FAIL verify-fleet-table-header-design-contract:");
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }

  if (selftest) {
    const planted = [
      ["hand-built header back", src + '\n<thead className="bg-gray-50"><tr><th>Edit</th></tr></thead>'],
      ["ParityTable dropped", src.replace(/<ParityTable\b/g, "<HandTable")],
      ["header shade overridden", src.replace("<ParityTable<FleetRow>", '<ParityTable<FleetRow> headerBg="#F9FAFB"')],
    ];
    for (const [name, mutated] of planted) {
      if (audit(mutated).length === 0) {
        console.error(`SELFTEST FAIL: ${name} did not trip`);
        process.exit(1);
      }
    }
    console.log("SELFTEST OK: guard trips on regression");
  }

  console.log("PASS verify-fleet-table-header-design-contract");
}

main();
