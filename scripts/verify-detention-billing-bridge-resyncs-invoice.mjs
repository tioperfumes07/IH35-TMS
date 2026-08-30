#!/usr/bin/env node
/**
 * ACCT-F5624 — bridgeDetentionToBilling raises mdata.loads.rate_total_cents when a detention charge
 * is bridged to billing, but a draft/proforma invoice minted at booking time is a snapshot that is
 * never re-read on its own. Both callers (detention-approval.service.ts's approveDetentionRequest and
 * detention.routes.ts's standalone bridge-billing route) then either called buildInvoiceFromLoad
 * directly (which is a pure idempotent LOOKUP once any non-void invoice exists — it does not update
 * the line/total) or nothing at all — so the detention amount never reached the invoice, while
 * detention_requests.status still flipped to 'invoiced' and the customer notification still fired.
 *
 * The fix wires resyncProformaInvoiceFromLoadRate (the SAME function update-load.service.ts /
 * loads.routes.ts already use for a plain rate edit) into bridgeDetentionToBilling itself, using the
 * fresh RETURNING rate_total_cents from the UPDATE that raised it — so both callers get the fix at
 * the single point where the rate actually changes.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const src = fs.readFileSync(`${root}/apps/backend/src/dispatch/detention.service.ts`, "utf8");

  const fnMatch = src.match(/export async function bridgeDetentionToBillingInClientTx\s*\([\s\S]*?\n\}/);
  if (!fnMatch) {
    failures.push("bridgeDetentionToBillingInClientTx function not found in detention.service.ts");
    return failures;
  }
  const fnBody = fnMatch[0];

  if (!fnBody.includes("resyncProformaInvoiceFromLoadRate")) {
    failures.push("bridgeDetentionToBilling must call resyncProformaInvoiceFromLoadRate after raising rate_total_cents");
    return failures;
  }

  // The rate_total_cents UPDATE must RETURNING the new value, and the resync call must use it —
  // not a stale pre-update value, and not a hardcoded/recomputed amount that could drift from what
  // was actually committed.
  if (!/UPDATE\s+mdata\.loads[\s\S]{0,900}?RETURNING\s+rate_total_cents/i.test(fnBody)) {
    failures.push("the rate_total_cents UPDATE must RETURNING rate_total_cents so the fresh value can be used");
  }
  if (!/resyncProformaInvoiceFromLoadRate\([\s\S]{0,300}?newRateTotalCents:\s*Number\(/.test(fnBody)) {
    failures.push("resyncProformaInvoiceFromLoadRate must be called with the fresh RETURNING'd rate_total_cents, not a stale value");
  }

  const importSrc = src.slice(0, src.indexOf(fnMatch[0]));
  if (!importSrc.includes('from "../accounting/resync-proforma-from-load-rate.js"')) {
    failures.push("detention.service.ts must import resyncProformaInvoiceFromLoadRate from accounting/resync-proforma-from-load-rate.js");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-detention-billing-bridge-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const good = `
import { resyncProformaInvoiceFromLoadRate } from "../accounting/resync-proforma-from-load-rate.js";

export async function bridgeDetentionToBillingInClientTx(client, userId, operatingCompanyId, eventId) {
  return withCompany(userId, operatingCompanyId, async (client) => {
    const loadUpdate = await client.query(
      \`UPDATE mdata.loads
        SET rate_total_cents = COALESCE(rate_total_cents, 0) + $2
        WHERE id = $1
        RETURNING rate_total_cents\`,
      [row.load_id, amount]
    );
    await resyncProformaInvoiceFromLoadRate(client, {
      loadId: String(row.load_id),
      operatingCompanyId,
      newRateTotalCents: Number(loadUpdate.rows[0]?.rate_total_cents ?? 0),
      userId,
    });
    return { ok: true };
  });
}
`;
  mk("apps/backend/src/dispatch/detention.service.ts", good);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: the resync call is removed entirely (the original bug).
  mk(
    "apps/backend/src/dispatch/detention.service.ts",
    good.replace(/await resyncProformaInvoiceFromLoadRate\([\s\S]*?\}\);\n/, "")
  );
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: missing resync call should be caught");

  // Regression 2: RETURNING is dropped, so there is no fresh value to resync with.
  mk("apps/backend/src/dispatch/detention.service.ts", good.replace("RETURNING rate_total_cents", ""));
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: missing RETURNING rate_total_cents should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-detention-billing-bridge-resyncs-invoice --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-detention-billing-bridge-resyncs-invoice — OK");
}
