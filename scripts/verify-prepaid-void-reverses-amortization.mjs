#!/usr/bin/env node
/**
 * ACCT-F5640 — POST /api/v1/accounting/prepaid-expenses/:id/void only ever reversed the original
 * 'prepaid_purchase' capitalization entry (Dr Prepaid Asset / Cr AP-or-Cash). amortization-posting
 * .service.ts posts each amortization period as its OWN source-linked JE tagged
 * 'prepaid_amortization' — a DIFFERENT source_transaction_type than the purchase — so a prepaid asset
 * voided after ≥1 amortization period had already posted left those amortization JEs standing while
 * fully reversing the original capitalization. Net effect: the Prepaid Asset control account lands at
 * a permanent negative balance equal to the amortized-to-date amount, with no repair path (once
 * status='voided', postPrepaidAmortization refuses to run). Void is defined everywhere else in this
 * codebase as "undo the whole financial event" — a voided prepaid asset must net its control account
 * to zero, not to a stranded remainder.
 *
 * This guard proves the void route also reverses cumulative posted amortization (reusing the SAME
 * postVoidReversal primitive with entityType 'prepaid_amortization' — no new GL math) and refuses to
 * flip status if that reversal fails, mirroring the existing prepaid_purchase reversal guard exactly.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];

  const routeSrc = fs.readFileSync(`${root}/apps/backend/src/accounting/prepaid-expenses.routes.ts`, "utf8");
  const voidRouteMatch = routeSrc.match(
    /"\/api\/v1\/accounting\/prepaid-expenses\/:id\/void"[\s\S]*?\n {2}\);/
  );
  if (!voidRouteMatch) {
    failures.push("could not locate the prepaid-expenses /void route to check");
  } else {
    const body = voidRouteMatch[0];
    if (!/entityType:\s*"prepaid_amortization"/.test(body)) {
      failures.push("the void route must call postVoidReversal with entityType: \"prepaid_amortization\" to reverse cumulative posted amortization — reversing only the original purchase entry strands a negative balance whenever any amortization has already posted");
    }
    if (!/posted\s*=\s*true/.test(body)) {
      failures.push("the void route must check for posted amortization rows before deciding whether an amortization reversal is required");
    }
    if (!/amortizationReversal\.reversal_journal_entry_id/.test(body)) {
      failures.push("the void route must refuse to void (not silently proceed) if the amortization reversal fails to produce a reversal_journal_entry_id, mirroring the existing prepaid_purchase reversal guard");
    }
    // Ordering: the amortization-reversal gate must run BEFORE the status-flip UPDATE, so a failed
    // reversal never leaves the asset marked voided.
    const amortIdx = body.indexOf('entityType: "prepaid_amortization"');
    const updateIdx = body.indexOf("SET status = 'voided'");
    if (amortIdx > -1 && updateIdx > -1 && amortIdx > updateIdx) {
      failures.push("the amortization reversal must run BEFORE the status-flip UPDATE (atomic reversal-then-flip)");
    }
  }

  const voidServiceSrc = fs.readFileSync(`${root}/apps/backend/src/accounting/void.service.ts`, "utf8");
  if (!/\|\s*"prepaid_amortization"/.test(voidServiceSrc)) {
    failures.push("void.service.ts's VoidableEntityType union must include \"prepaid_amortization\" so postVoidReversal/readOriginalGlPostings can reverse it generically");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-prepaid-void-amort-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const goodRoute = `
  app.post(
    "/api/v1/accounting/prepaid-expenses/:id/void",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      return withCompanyScope(user.uuid, oci, async (client) => {
        const reversal = await postVoidReversal(client, { entityType: "prepaid_purchase" });
        const hadPostedAmortization = await client.query(
          \`SELECT EXISTS(SELECT 1 FROM accounting.prepaid_amortization_rows WHERE posted = true) AS exists\`
        );
        let amortizationReversal = { reversal_journal_entry_id: null };
        if (hadPostedAmortization.rows[0]?.exists) {
          amortizationReversal = await postVoidReversal(client, { entityType: "prepaid_amortization" });
          if (!amortizationReversal.reversal_journal_entry_id) {
            return reply.code(409).send({ error: "prepaid_void_amortization_reversal_failed" });
          }
        }
        await client.query(\`UPDATE accounting.prepaid_assets SET status = 'voided' WHERE id = $1\`, []);
      });
    }
  );
`;
  const goodVoidService = `export type VoidableEntityType = "prepaid_purchase" | "prepaid_amortization";`;

  mk("apps/backend/src/accounting/prepaid-expenses.routes.ts", goodRoute);
  mk("apps/backend/src/accounting/void.service.ts", goodVoidService);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: the amortization reversal call removed entirely (the original bug).
  mk(
    "apps/backend/src/accounting/prepaid-expenses.routes.ts",
    goodRoute.replace(
      /const hadPostedAmortization[\s\S]*?\n {8}\}\n {8}await client\.query/,
      "        await client.query"
    )
  );
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 1): missing amortization reversal call should be caught");
  mk("apps/backend/src/accounting/prepaid-expenses.routes.ts", goodRoute); // restore

  // Regression 2: the failure-refusal check dropped (silently proceeds even if reversal failed).
  mk(
    "apps/backend/src/accounting/prepaid-expenses.routes.ts",
    goodRoute.replace(
      'if (!amortizationReversal.reversal_journal_entry_id) {\n            return reply.code(409).send({ error: "prepaid_void_amortization_reversal_failed" });\n          }\n        ',
      ""
    )
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 2): missing refusal-on-failed-reversal check should be caught");
  mk("apps/backend/src/accounting/prepaid-expenses.routes.ts", goodRoute); // restore

  // Regression 3: VoidableEntityType union missing prepaid_amortization.
  mk("apps/backend/src/accounting/void.service.ts", `export type VoidableEntityType = "prepaid_purchase";`);
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 3): missing prepaid_amortization union member should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-prepaid-void-reverses-amortization --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-prepaid-void-reverses-amortization — OK");
}
