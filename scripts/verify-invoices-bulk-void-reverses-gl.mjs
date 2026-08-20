#!/usr/bin/env node
/**
 * ACCT-F5638 — accounting.invoices has three independent void writers: the direct
 * POST /invoices/:id/void route (invoices.routes.ts) and governance/void-cancel-executors.ts's
 * executeInvoice both call postVoidReversal behind isVoidEnforcementEnabled before flipping status;
 * invoices-bulk.routes.ts's set_status("void") action was a bare status-flip UPDATE with no GL
 * reversal call at all — the third writer never got the same treatment. An invoice voided through the
 * bulk endpoint kept its original DR ar_control / CR revenue journal entry posted forever with no
 * reversing entry, while the invoice record itself read as cleanly voided — a silent GL-vs-subledger
 * tie-out gap (overstated A/R + revenue), not a visible failure. Confirmed unexercised in prod (no
 * invoice.bulk_set_status audit events with a void transition exist), so this is a live structural
 * gap, not yet observed money damage.
 *
 * This guard proves the bulk void branch calls the existing postVoidReversal (reuse, not new GL
 * math), gated by isVoidEnforcementEnabled, BEFORE the status-flip UPDATE — mirroring the pattern
 * already proven for bills-bulk.routes.ts under ACCT-F5634.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const src = fs.readFileSync(`${root}/apps/backend/src/accounting/invoices-bulk.routes.ts`, "utf8");

  if (!src.includes('} from "./void.service.js"')) {
    failures.push("invoices-bulk.routes.ts must import the shared void primitives from void.service.js");
    return failures;
  }
  if (!src.includes("postVoidReversal") || !src.includes("isVoidEnforcementEnabled")) {
    failures.push("invoices-bulk.routes.ts must call postVoidReversal gated by isVoidEnforcementEnabled for the set_status(void) branch");
    return failures;
  }

  const setStatusMatch = src.match(/if \(action === "set_status"\) \{[\s\S]*?\n  \} else if \(action === "mark_sent"\)/);
  if (!setStatusMatch) {
    failures.push('could not locate the "if (action === \\"set_status\\")" branch to check');
    return failures;
  }
  const block = setStatusMatch[0];

  const reversalIdx = block.indexOf("postVoidReversal(");
  const updateIdx = block.indexOf("UPDATE accounting.invoices");
  if (reversalIdx === -1) {
    failures.push("the set_status branch must call postVoidReversal — a bare UPDATE with no GL reversal is the exact bug this guard exists to catch");
  } else if (updateIdx === -1) {
    failures.push("could not locate the status-flip UPDATE to check ordering against the reversal call");
  } else if (reversalIdx > updateIdx) {
    failures.push("postVoidReversal must run BEFORE the status-flip UPDATE (atomic reversal-then-flip, matching the direct /void route and executeInvoice)");
  }

  if (!/isVoidEnforcementEnabled\(/.test(block)) {
    failures.push("the void reversal must be gated by isVoidEnforcementEnabled, matching every other invoice-void writer");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-invoices-bulk-void-gl-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const good = `
import { auditVoid, isVoidEnforcementEnabled, pgDateColumnToIsoDay, postVoidReversal } from "./void.service.js";

  if (action === "set_status") {
    const voidClient = client;
    let reversal = null;
    if (statusPayload.status === "void") {
      const flagOn = await isVoidEnforcementEnabled(voidClient, operatingCompanyId, actorUserId);
      if (flagOn) {
        reversal = await postVoidReversal(voidClient, {}, {});
      }
    }
    const updateRes = await client.query(\`UPDATE accounting.invoices SET status = $3 WHERE id = $1\`, []);
  } else if (action === "mark_sent")
`;
  mk("apps/backend/src/accounting/invoices-bulk.routes.ts", good);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: the original bug — a bare UPDATE, no postVoidReversal call anywhere in the branch.
  mk(
    "apps/backend/src/accounting/invoices-bulk.routes.ts",
    good
      .replace(/let reversal = null;[\s\S]*?\n    \}\n    const updateRes/, "const updateRes")
  );
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 1): bare status-flip UPDATE with no postVoidReversal call should be caught");

  // Regression 2: reversal call present but AFTER the UPDATE (non-atomic ordering).
  mk(
    "apps/backend/src/accounting/invoices-bulk.routes.ts",
    `
import { auditVoid, isVoidEnforcementEnabled, pgDateColumnToIsoDay, postVoidReversal } from "./void.service.js";

  if (action === "set_status") {
    const voidClient = client;
    const updateRes = await client.query(\`UPDATE accounting.invoices SET status = $3 WHERE id = $1\`, []);
    if (statusPayload.status === "void") {
      const flagOn = await isVoidEnforcementEnabled(voidClient, operatingCompanyId, actorUserId);
      if (flagOn) {
        const reversal = await postVoidReversal(voidClient, {}, {});
      }
    }
  } else if (action === "mark_sent")
`
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 2): postVoidReversal running AFTER the status UPDATE should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-invoices-bulk-void-reverses-gl --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-invoices-bulk-void-reverses-gl — OK");
}
