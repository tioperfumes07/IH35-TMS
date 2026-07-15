#!/usr/bin/env node
// verify-settlement-approval-canonical.mjs
// P2.4a regression guard. settlements/approval.service.ts was repointed off the RETIRE settlement
// store (settlement.settlement / settlement.settlement_line) onto the canonical driver_finance.*
// store (driver_finance.driver_settlements / driver_finance.settlement_lines). This guard fails if
// the service ever again references a RETIRE settlement table, so the repoint cannot silently
// regress. Import-safe (exports run(); only prints/exits when invoked directly).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-approval-canonical";
const SERVICE = path.join(ROOT, "apps/backend/src/settlements/approval.service.ts");
const ROUTES = path.join(ROOT, "apps/backend/src/settlements/approval.routes.ts");
// The whole approval module (service + routes) must stay off the RETIRE settlement.* store.
const TARGETS = [SERVICE, ROUTES];

// RETIRE tables the service must never touch again. Require a SQL context keyword
// (FROM/INTO/UPDATE/JOIN) immediately before the table so this fires ONLY on real SQL — not on the
// prose in the header doc-comment that legitimately names the RETIRE tables to explain the repoint.
const SQLCTX = "(?:FROM|INTO|UPDATE|JOIN)\\s+";
const FORBIDDEN = [
  { re: new RegExp(SQLCTX + "settlement\\.settlement_line\\b", "i"), name: "settlement.settlement_line (RETIRE — use driver_finance.settlement_lines)" },
  { re: new RegExp(SQLCTX + "settlement\\.settlement\\b(?!_line)", "i"), name: "settlement.settlement (RETIRE — use driver_finance.driver_settlements)" },
];
// Canonical anchors that MUST be present (proves the file is still wired to the canonical store).
const REQUIRED = [
  /driver_finance\.driver_settlements/,
  /driver_finance\.settlement_lines/,
];

export function run() {
  const failures = [];
  for (const target of TARGETS) {
    const rel = path.relative(ROOT, target);
    if (!fs.existsSync(target)) {
      failures.push(`${rel} not found — approval module moved? update this guard.`);
      continue;
    }
    const src = fs.readFileSync(target, "utf8");
    for (const f of FORBIDDEN) {
      // reset lastIndex (regexes carry the "i" flag but not "g", so exec is stateless — still explicit)
      const m = f.re.exec(src);
      if (m) {
        const line = src.slice(0, m.index).split("\n").length;
        failures.push(`${rel}:${line} references RETIRE table ${f.name}`);
      }
    }
  }

  // Canonical anchors + entity-scope invariant live in the service file.
  if (fs.existsSync(SERVICE)) {
    const svc = fs.readFileSync(SERVICE, "utf8");
    const relSvc = path.relative(ROOT, SERVICE);
    for (const r of REQUIRED) {
      if (!r.test(svc)) failures.push(`${relSvc} missing canonical anchor ${r} — repoint incomplete`);
    }
    // Finding-1 regression guard: checkAllLinesApproved must bind operating_company_id (settlement_lines
    // RLS is role-scoped, not entity-scoped). Extract the function body and require the scope key.
    const fn = /export async function checkAllLinesApproved\b[\s\S]*?\n}/.exec(svc);
    if (!fn) {
      failures.push(`${relSvc} checkAllLinesApproved not found — update this guard.`);
    } else if (!/operating_company_id\s*=\s*\$\d/.test(fn[0])) {
      // Require an actual SQL bind (operating_company_id = $N), not merely the term in a comment,
      // so a scope-stripping regression cannot hide behind prose that mentions the column.
      failures.push(`${relSvc} checkAllLinesApproved does not bind operating_company_id = $N (entity-scope IDOR risk)`);
    }
  }
  return failures;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error(`[${LABEL}] FAILED — ${failures.length} issue(s):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.error(`\napproval.service.ts must read/write ONLY the canonical driver_finance.* settlement`);
    console.error(`store. RETIRE settlement.* tables are read-only during retirement — never write/FK them.`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — approval.service.ts is wired to the canonical driver_finance.* store.`);
}
