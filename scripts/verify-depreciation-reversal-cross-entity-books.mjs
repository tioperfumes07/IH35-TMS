#!/usr/bin/env node
/**
 * ACCT-F5641 — postDepreciation books the depreciation JE on the TITLE-HOLDER
 * (fixed_assets.owner_operating_company_id), not the asset's own home/operating company, whenever the
 * two differ (a leased/cross-entity fixed asset — FLT-04). reverseSchedule's "depreciation" branch
 * looked up and voided the posted JE under input.operatingCompanyId unconditionally — for a
 * cross-entity asset that query matches ZERO rows (the JE lives under a DIFFERENT
 * operating_company_id), so `!je` was silently treated identically to "already reversed" and the
 * period was skipped. With every period cross-entity, the reversal returns
 * { result: "nothing_to_reverse" } — a false all-clear — while the real, posted depreciation JE
 * stands forever with no code path in the repo able to reverse it (permanent stranded balance on the
 * title-holder's Accumulated Depreciation / Depreciation Expense accounts).
 *
 * This guard proves reverseSchedule resolves the SAME booksCompanyId postDepreciation resolves
 * (fixed_assets.owner_operating_company_id) before looking up/voiding the JE, restores the
 * asset-home GUC/company id before touching the asset-home-scoped schedule-row table, and that the
 * "prepaid" reversal kind (which has no owner-company concept) is unaffected.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const src = fs.readFileSync(`${root}/apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts`, "utf8");

  const fnMatch = src.match(/async function reverseSchedule\(\s*[\s\S]*?\n\}\n/);
  if (!fnMatch) {
    failures.push("reverseSchedule function not found");
    return failures;
  }
  const body = fnMatch[0];

  if (!/kind === "depreciation"/.test(body) || !/owner_operating_company_id/.test(body)) {
    failures.push("reverseSchedule must resolve owner_operating_company_id (booksCompanyId) for the 'depreciation' kind before looking up the posted JE — the JE was booked on the title-holder, not the asset's own operating company (FLT-04)");
  }

  // The JE header SELECT and the journal_entries UPDATE must key on booksCompanyId, not the raw
  // input.operatingCompanyId — else the lookup still 0-matches for a cross-entity asset.
  if (!/FROM accounting\.journal_entries WHERE id = \$1::uuid AND operating_company_id = \$2::uuid[\s\S]{0,40}\[jeId, booksCompanyId\]/.test(body)) {
    failures.push("the JE header SELECT must be parameterized with booksCompanyId, not input.operatingCompanyId, so a cross-entity depreciation JE is actually found");
  }
  if (!/operatingCompanyId:\s*booksCompanyId/.test(body)) {
    failures.push("postVoidReversal must be called with operatingCompanyId: booksCompanyId for the depreciation reversal, matching where the original JE and its postings actually live");
  }
  if (!/\[jeId, booksCompanyId, actor\.userId, input\.reason\]/.test(body)) {
    failures.push("the journal_entries status-flip UPDATE must be parameterized with booksCompanyId, not input.operatingCompanyId");
  }

  // The schedule-row table (depreciation_schedule_rows / prepaid_amortization_rows) lives under the
  // asset's own home company — the UPDATE on ${cfg.table} must stay on input.operatingCompanyId, not
  // drift onto booksCompanyId, or the reversal would silently miss the row entirely for a cross-entity
  // asset (the exact same bug shape, just relocated).
  if (!/UPDATE \$\{cfg\.table\}[\s\S]{0,400}\[row\.id, input\.operatingCompanyId, actor\.userId\]/.test(body)) {
    failures.push("the schedule-row UPDATE (${cfg.table}) must stay scoped to input.operatingCompanyId (the asset's own home company), not booksCompanyId");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-depr-reversal-cross-entity-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const good = `
async function reverseSchedule(
  kind, input, actor
) {
  const cfg = REVERSAL_CONFIG[kind];
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(\`SELECT set_config('app.operating_company_id', $1::text, true)\`, [input.operatingCompanyId]);

    let booksCompanyId = input.operatingCompanyId;
    if (kind === "depreciation") {
      const assetRes = await client.query(
        \`SELECT owner_operating_company_id::text FROM accounting.fixed_assets WHERE operating_company_id = $1::uuid AND id = $2::uuid LIMIT 1\`,
        [input.operatingCompanyId, input.assetId]
      );
      const owner = assetRes.rows[0]?.owner_operating_company_id;
      if (!owner) throw new AmortizationPostingError("OWNER_BOOKS_MISSING", "x");
      booksCompanyId = owner;
    }

    const rows = await client.query(\`SELECT id::text FROM \${cfg.table} WHERE operating_company_id = $1::uuid FOR UPDATE\`, [input.operatingCompanyId]);

    for (const row of rows.rows) {
      const jeId = row.posted_journal_entry_id;
      await client.query(\`SELECT set_config('app.operating_company_id', $1::text, true)\`, [booksCompanyId]);
      const header = await client.query(
        \`SELECT entry_date::text, status FROM accounting.journal_entries WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1 FOR UPDATE\`,
        [jeId, booksCompanyId]
      );
      const je = header.rows[0];
      if (!je || je.status === "voided") { continue; }

      const reversal = await postVoidReversal(client, { operatingCompanyId: booksCompanyId, entityType: "journal_entry", entityId: jeId }, { userId: actor.userId });

      await client.query(
        \`UPDATE accounting.journal_entries SET status = 'voided' WHERE id = $1::uuid AND operating_company_id = $2::uuid\`,
        [jeId, booksCompanyId, actor.userId, input.reason]
      );

      await client.query(\`SELECT set_config('app.operating_company_id', $1::text, true)\`, [input.operatingCompanyId]);

      await client.query(
        \`UPDATE \${cfg.table} SET posted = false WHERE id = $1::uuid AND operating_company_id = $2::uuid\`,
        [row.id, input.operatingCompanyId, actor.userId]
      );
    }
  });
}
`;
  mk("apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts", good);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression: back to the original bug — booksCompanyId never resolved, JE lookup/void keyed on
  // input.operatingCompanyId throughout (the exact pre-fix shape).
  mk(
    "apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts",
    good
      .replace(/let booksCompanyId[\s\S]*?booksCompanyId = owner;\n    \}/, "const booksCompanyId = input.operatingCompanyId;")
      .replace(/\[jeId, booksCompanyId\]/g, "[jeId, input.operatingCompanyId]")
      .replace(/operatingCompanyId: booksCompanyId/g, "operatingCompanyId: input.operatingCompanyId")
      .replace(/\[jeId, booksCompanyId, actor\.userId, input\.reason\]/g, "[jeId, input.operatingCompanyId, actor.userId, input.reason]")
  );
  const f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: the pre-fix shape (booksCompanyId never resolved from owner_operating_company_id) should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-depreciation-reversal-cross-entity-books --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-depreciation-reversal-cross-entity-books — OK");
}
