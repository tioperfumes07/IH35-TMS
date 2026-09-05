#!/usr/bin/env node
// STANDING-DIRECTIVES-2026-09-05.md §CC-2 item 2 — Driver Instruction Sheet must carry the
// customer's reference numbers ("rate confirm" in the queue item's shorthand). mdata.loads has
// TWO distinct reference columns (customer_wo_number from 0140_p6_t11171_book_load_v4_wizard_
// fields.sql, customer_po_number from 202606221000_block7_loads_piece_po.sql) -- a load can
// carry both, and the sheet previously showed only WO#/Live#, silently dropping PO# even when
// present. This guard pins that both are read and joined, never picked exclusively, and that
// customer_po_number never gets near a dollar amount (DRIVER-SHEET-NO-PAY, owner order
// 2026-09-04 — reference numbers only, no pay, ever).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-sheet-customer-po-number";
const ROUTES = "apps/backend/src/dispatch/dispatch-sheet.routes.ts";

function read(rel, root = ROOT) {
  return maskComments(readFileSync(join(root, rel), "utf8"));
}

export function collectProblems(root = ROOT) {
  const problems = [];
  let src;
  try {
    src = read(ROUTES, root);
  } catch {
    problems.push(`missing ${ROUTES}`);
    return problems;
  }

  if (!/load\.customer_po_number/.test(src)) {
    problems.push(`${ROUTES}: must read load.customer_po_number — a real, actively-populated column (Book Load wizard + bol-generator.service.ts already use it) that the driver sheet was silently dropping`);
  }
  if (!/load\.customer_wo_number/.test(src)) {
    problems.push(`${ROUTES}: must still read load.customer_wo_number — do not regress the WO# reference while adding PO#`);
  }
  // Regression sentinel for the exact bug this guard exists to catch: an if/else-if chain that
  // picks ONE reference and drops the other when both are present.
  if (/customer_wo_number\s*\?[\s\S]{0,80}:\s*load\.customer_po_number\s*\?/.test(src) || /customer_po_number\s*\?[\s\S]{0,80}:\s*load\.customer_wo_number\s*\?/.test(src)) {
    problems.push(`${ROUTES}: WO# and PO# must be joined together when both are present, not chained as mutually-exclusive fallbacks`);
  }

  // DRIVER-SHEET-NO-PAY boundary: customer_po_number is a document reference, never a cents/rate
  // figure. Catch a future "helpful" rename/reuse of this same field for money.
  if (/customer_po_number[\s\S]{0,40}(_cents|rate_total|linehaul)/i.test(src)) {
    problems.push(`${ROUTES}: customer_po_number must never be paired with a money field — it is a reference number, not pay (DRIVER-SHEET-NO-PAY)`);
  }

  return problems;
}

function fail(messages) {
  console.error(`${LABEL} FAIL:`);
  for (const m of messages) console.error(`  - ${m}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) fail(baseline);

  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");

  const cases = [
    {
      name: "missing PO# entirely",
      content: `commodityRight: load.customer_wo_number ? \`Customer WO# \${load.customer_wo_number}\` : "x",`,
      expectProblems: 1,
    },
    {
      name: "missing WO# entirely",
      content: `commodityRight: load.customer_po_number ? \`PO# \${load.customer_po_number}\` : "x",`,
      expectProblems: 1,
    },
    {
      name: "mutually-exclusive fallback chain (the original bug)",
      content: `commodityRight: load.customer_wo_number ? \`Customer WO# \${load.customer_wo_number}\` : load.customer_po_number ? \`PO# \${load.customer_po_number}\` : "x",`,
      expectProblems: 1,
    },
    {
      name: "good fixture (joined, both read)",
      content: `commodityRight: [load.customer_wo_number ? \`Customer WO# \${load.customer_wo_number}\` : null, load.customer_po_number ? \`PO# \${load.customer_po_number}\` : null].filter(Boolean).join(" · ") || "x",`,
      expectProblems: 0,
    },
  ];

  for (const { name, content, expectProblems } of cases) {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-sheet-po-guard-"));
    try {
      const full = path.join(tmpRoot, ROUTES);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
      const problems = collectProblems(tmpRoot);
      if (problems.length !== expectProblems) {
        console.error(`${LABEL} SELFTEST FAIL: case "${name}" expected ${expectProblems} problem(s), got ${problems.length}: ${JSON.stringify(problems)}`);
        process.exit(1);
      }
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }
  console.log(`${LABEL} SELFTEST OK (${cases.length}/${cases.length} cases)`);
} else {
  const problems = collectProblems();
  if (problems.length > 0) fail(problems);
  console.log(`${LABEL} OK — driver instruction sheet shows both customer WO# and PO# when present, never a money figure`);
}
