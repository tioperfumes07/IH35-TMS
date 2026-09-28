#!/usr/bin/env node
/**
 * ROUND 172 MATCH LAW — refuse a factoring advance whose load's PO does not match
 * the caller's expected_customer_po (Faro purchase PO string).
 *
 * Asserts the create route:
 *   1. accepts optional expected_customer_po on the create body
 *   2. returns error "factoring_po_mismatch" when neither customer_wo_number nor
 *      customer_po_number equals that string exactly
 *
 * Never map on amount + customer. Never map on date proximity.
 */
import fs from "node:fs";
import path from "node:path";

export function run(root = process.cwd()) {
  const failures = [];
  const routesPath = path.join(root, "apps/backend/src/accounting/factoring-advances.routes.ts");
  if (!fs.existsSync(routesPath)) {
    failures.push("factoring-advances.routes.ts missing");
    return failures;
  }
  const src = fs.readFileSync(routesPath, "utf8");

  if (!/expected_customer_po:\s*z\.string\(\)/.test(src)) {
    failures.push("createBodySchema must accept expected_customer_po");
  }
  if (!src.includes('error: "factoring_po_mismatch"') && !src.includes("error: 'factoring_po_mismatch'")) {
    failures.push("create route must refuse with error factoring_po_mismatch");
  }
  if (!src.includes("customer_wo_number") || !src.includes("customer_po_number")) {
    failures.push("PO match check must read load customer_wo_number and customer_po_number");
  }
  // Exact equality — no ILIKE / amount / customer-name fallback in the refuse block.
  const mismatchIdx = src.indexOf("factoring_po_mismatch");
  if (mismatchIdx < 0) {
    failures.push("factoring_po_mismatch string missing");
  } else {
    const window = src.slice(Math.max(0, mismatchIdx - 1200), mismatchIdx + 200);
    if (/ILIKE/.test(window)) {
      failures.push("PO match must be exact equality, not ILIKE");
    }
    if (/amount|customer_name|legal_name/.test(window) && !/expected_customer_po/.test(window)) {
      failures.push("PO match window must not fall back to amount/customer name");
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-faro-advance-po-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${path.dirname(rel)}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  mk(
    "apps/backend/src/accounting/factoring-advances.routes.ts",
    `
const createBodySchema = z.object({
  expected_customer_po: z.string().trim().min(1).max(120).optional(),
});
if (wo !== poWant && po !== poWant) {
  return { code: 409 as const, error: "factoring_po_mismatch" };
}
SELECT l.customer_wo_number, l.customer_po_number FROM mdata.loads l
`
  );
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));
  mk(
    "apps/backend/src/accounting/factoring-advances.routes.ts",
    `const createBodySchema = z.object({ notes: z.string().optional() });\n`
  );
  if (!run(tmp).length) throw new Error("FAIL fail: missing PO gate not caught");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-faro-advance-po-matches-load --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error("FAIL verify-faro-advance-po-matches-load:");
    for (const x of f) console.error(" -", x);
    process.exit(1);
  }
  console.log("OK verify-faro-advance-po-matches-load");
}
