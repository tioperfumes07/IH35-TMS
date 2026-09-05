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
// Usage: node scripts/verify-fleet-table-header-design-contract.mjs [--selftest]

import { readFileSync } from "node:fs";

const FILE = "apps/frontend/src/components/FleetTable.tsx";

function audit(src) {
  const f = [];

  if (!/import\s*\{[^}]*colors[^}]*typography[^}]*\}\s*from\s*"\.\.\/design\/tokens"/.test(src) &&
      !/import\s*\{[^}]*typography[^}]*colors[^}]*\}\s*from\s*"\.\.\/design\/tokens"/.test(src)) {
    f.push(`${FILE}: must import { colors, typography } from "../design/tokens"`);
  }

  // The <thead> wrapper must not re-introduce a competing background/text-color class — the
  // contract's background lives on each <th>, matching TableHeaderCell's own inline style.
  if (/<thead\s+className="[^"]*bg-/.test(src)) {
    f.push(`${FILE}: <thead> must not paint its own background class — style each <th> to colors.tableHeaderBg instead (row-level bg drifts out of sync with TableHeaderCell)`);
  }

  // Every bare `<th` (not the shared TableHeaderCell component) inside the table header must
  // carry colors.tableHeaderBg somewhere in its own opening tag. We scan each `<th ... >` block
  // up to its closing `>` and require the token pairing.
  const theadBlock = (src.match(/<thead>([\s\S]*?)<\/thead>/) ?? [])[1];
  if (!theadBlock) {
    f.push(`${FILE}: <thead> block not found — has the fleet table header markup moved?`);
  } else {
    const thOpenTags = theadBlock.match(/<th\b[^>]*>/g) ?? [];
    for (const tag of thOpenTags) {
      // Pull the full element (tag through matching style block) — cheap heuristic: look at the
      // 400 chars following the tag open for the style prop, since style blocks are multi-line.
      const idx = theadBlock.indexOf(tag);
      const chunk = theadBlock.slice(idx, idx + 400);
      if (!/colors\.tableHeaderBg/.test(chunk)) {
        f.push(`${FILE}: a <th> header cell is missing colors.tableHeaderBg — every header cell must match the design-contract shade (${tag.trim()})`);
      }
    }
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
    const mutated = src.replace(
      /<thead>/,
      '<thead className="bg-gray-50 text-[11px] uppercase text-gray-600">'
    );
    if (audit(mutated).length === 0) {
      console.error("SELFTEST FAIL: reverted <thead> background did not trip");
      process.exit(1);
    }
    const stripped = src.replace(/colors\.tableHeaderBg/g, "colors.tableHeaderBg /* removed */".replace(/colors\.tableHeaderBg/, "'#EEF2F6'"));
    if (audit(stripped).length === 0) {
      console.error("SELFTEST FAIL: removing colors.tableHeaderBg from a header cell did not trip");
      process.exit(1);
    }
    console.log("SELFTEST OK: guard trips on regression");
  }

  console.log("PASS verify-fleet-table-header-design-contract");
}

main();
