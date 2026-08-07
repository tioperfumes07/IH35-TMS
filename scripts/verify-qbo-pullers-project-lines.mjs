#!/usr/bin/env node
/**
 * verify-qbo-pullers-project-lines.mjs — ACCT-F154. A QBO document importer must project its LINES,
 * not just its header.
 *
 * WHAT WENT WRONG, measured on prod (ACCT-F144). The AP side imported completely: 16,245 bills, ZERO
 * lineless, header ties to lines to the cent. The AR side imported HEADERS ONLY — 11,976 of 11,976
 * QBO-cloned invoices had no lines at all. The line detail had been fetched and stored the entire
 * time; every mirror row carried a `Line` array in payload_json. Nothing needed inventing. It needed
 * projecting, and the importer simply never did it.
 *
 * Nothing failed. Nothing alerted. Every line-level AR report — revenue by item, sales by product,
 * line coding to account_id, source_load_id linkage — returned zero across the entire real financial
 * history, and a report that returns zero looks exactly like a business with no data. That is why it
 * survived so long, and it is the reason this guard exists rather than a note in a doc.
 *
 * ACCT-F146 back-filled the 16,744 missing lines by migration. A back-fill does not fix an importer:
 * the next full re-clone or resumed sync would have recreated header-only invoices and silently undone
 * it. ACCT-F154 fixed the importer. This guard is what stops the pairing from being separated again.
 *
 * THE RULE: any qbo-sync puller that INSERTs into a header table must also INSERT into that header's
 * line table. Header/line pairs are declared explicitly below rather than inferred, because a wrong
 * inference here either misses a real gap or reddens on a puller that legitimately has no lines
 * (payments, vendor credits), and both failures teach people to distrust the guard.
 *
 * Static: reads the puller sources. It proves the importer CONTAINS the projection, not that prod is
 * populated — that is ACCT-F146's tie-out and a live read, deliberately a different check.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-pullers-project-lines";
const DIR = path.join(ROOT, "apps", "backend", "src", "qbo-sync");

/** Documents whose QBO payload carries a `Line` array that MUST be projected. */
export const HEADER_LINE_PAIRS = [
  { file: "qbo-ar-invoices-puller.ts", header: "accounting.invoices", lines: "accounting.invoice_lines" },
  { file: "ap-bills-puller.ts", header: "accounting.bills", lines: "accounting.bill_lines" },
];

const inserts = (src, table) =>
  new RegExp(`INSERT\\s+INTO\\s+${table.replace(".", "\\.")}\\b`, "i").test(src);

export function findHeaderOnlyImporters(dir = DIR, pairs = HEADER_LINE_PAIRS) {
  const offenders = [];
  for (const pair of pairs) {
    const file = path.join(dir, pair.file);
    if (!fs.existsSync(file)) continue; // renamed/removed puller is not this guard's business
    const src = fs.readFileSync(file, "utf8");
    if (inserts(src, pair.header) && !inserts(src, pair.lines)) {
      offenders.push({ ...pair });
    }
  }
  return offenders;
}

function report(offenders) {
  if (!offenders.length) {
    console.log(`${LABEL} OK — every QBO document importer projects its line detail`);
    return 0;
  }
  console.error(`${LABEL} FAIL — ${offenders.length} importer(s) write a header with no lines:\n`);
  for (const o of offenders) {
    console.error(`  - ${o.file}: INSERTs ${o.header} but never ${o.lines}`);
  }
  console.error(
    `\nA header-only import is silent: the invoices look imported, and every line-level report returns\n` +
      `zero — which is indistinguishable from a business with no data. This exact gap hid 11,976\n` +
      `lineless invoices across the entire real AR history (ACCT-F144).\n\n` +
      `Fix: project payload_json->'Line' into the line table. Allowlist the DetailTypes\n` +
      `(SalesItemLineDetail / DiscountLineDetail / DescriptionOnly) — projecting SubTotalLineDetail\n` +
      `restates the header and DOUBLES revenue. Store amounts at abs() with the subtractive sign in\n` +
      `line_type='adjustment', and ON CONFLICT DO NOTHING against the slot unique index so a resumed\n` +
      `sync cannot double the detail.\n`
  );
  return 1;
}

function selftest() {
  const os = require("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qbo-lines-"));
  const pairs = [{ file: "p.ts", header: "accounting.invoices", lines: "accounting.invoice_lines" }];
  const good = `await c.query(\`INSERT INTO accounting.invoices (a) VALUES (1)\`);
                await c.query(\`INSERT INTO accounting.invoice_lines (b) VALUES (2)\`);`;
  const failures = [];

  fs.writeFileSync(path.join(tmp, "p.ts"), good);
  if (findHeaderOnlyImporters(tmp, pairs).length !== 0) failures.push("case1 FAIL — header+lines must be GREEN.");

  fs.writeFileSync(path.join(tmp, "p.ts"), `await c.query(\`INSERT INTO accounting.invoices (a) VALUES (1)\`);`);
  if (findHeaderOnlyImporters(tmp, pairs).length !== 1) failures.push("case2 FAIL — header-only must go RED.");

  fs.writeFileSync(path.join(tmp, "p.ts"), good);
  if (findHeaderOnlyImporters(tmp, pairs).length !== 0) failures.push("case3 FAIL — restore must return GREEN.");

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — GREEN with lines, RED header-only, GREEN on restore`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { createRequire } = await import("node:module");
  globalThis.require = createRequire(import.meta.url);
  process.exit(process.argv.includes("--selftest") ? selftest() : report(findHeaderOnlyImporters()));
}
