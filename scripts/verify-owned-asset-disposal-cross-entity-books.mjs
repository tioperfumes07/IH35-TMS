#!/usr/bin/env node
/**
 * ACCT-F5642 — postDepreciation (amortization-posting.service.ts) books every depreciation JE on the
 * TITLE-HOLDER (fixed_assets.owner_operating_company_id), not the asset's own home/operating company,
 * whenever the two differ (FLT-04 — a leased/cross-entity fixed asset) — and the asset row's own
 * asset_account_id/accum_depr_account_id were set up to resolve in THAT owner company's chart of
 * accounts, the same way depreciation already posts against them there. postOwnedAssetDisposal
 * (owned-asset-disposal.service.ts) posted its own disposal JE under input.operatingCompanyId
 * unconditionally — for a cross-entity asset this would create journal_entry_postings rows scoped to
 * the WRONG company referencing account_ids that live in a DIFFERENT company's catalogs.accounts, a
 * cross-entity data-integrity violation (or an outright failed insert, depending on FK enforcement) —
 * not merely a missing-reversal gap like ACCT-F5641's reverseSchedule bug, but the FORWARD-posting
 * sibling of the same root cause.
 *
 * This guard proves postOwnedAssetDisposal resolves the SAME owner_operating_company_id
 * postDepreciation/reverseSchedule resolve, switches to it for the role-account resolution + JE
 * header + postings + source links, and restores the asset-home company before touching
 * fixed_asset_disposals / fixed_assets (both scoped to the asset's own home company).
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const src = fs.readFileSync(`${root}/apps/backend/src/accounting/owned-asset-disposal.service.ts`, "utf8");

  if (!/owner_operating_company_id::text/.test(src)) {
    failures.push("the fixed_assets SELECT must fetch owner_operating_company_id");
  }
  if (!/const booksCompanyId = asset\.owner_operating_company_id;/.test(src)) {
    failures.push("postOwnedAssetDisposal must resolve booksCompanyId from asset.owner_operating_company_id, matching postDepreciation/reverseSchedule's own FLT-04 pattern");
  }

  const fnMatch = src.match(/export async function postOwnedAssetDisposal\([\s\S]*?\n  \}\);\n\}/);
  if (!fnMatch) {
    failures.push("postOwnedAssetDisposal function not found");
    return failures;
  }
  const body = fnMatch[0];

  const gainLossIdx = body.indexOf("resolveRequiredRole(client, booksCompanyId");
  const proceedsIdx = body.indexOf("resolveCashLike(client, booksCompanyId");
  const jeIdx = body.indexOf("operating_company_id: booksCompanyId,");
  const postingRowsIdx = body.indexOf("[booksCompanyId, journalEntry.id]");
  const disposalInsertIdx = body.indexOf("INSERT INTO accounting.fixed_asset_disposals");
  const restoreIdx = body.lastIndexOf("[input.operatingCompanyId]", disposalInsertIdx);

  if (gainLossIdx === -1) failures.push("gain/loss account role must resolve against booksCompanyId, not input.operatingCompanyId");
  if (proceedsIdx === -1) failures.push("cash-like proceeds account role must resolve against booksCompanyId, not input.operatingCompanyId");
  if (jeIdx === -1) failures.push("the disposal JE header must post with operating_company_id: booksCompanyId, matching where the account_ids actually live");
  if (postingRowsIdx === -1) failures.push("the posting-rows SELECT (for source links) must query under booksCompanyId, matching where the JE was just posted");

  if (disposalInsertIdx === -1) {
    failures.push("could not locate the fixed_asset_disposals INSERT to check GUC restoration");
  } else if (restoreIdx === -1 || restoreIdx > disposalInsertIdx) {
    failures.push("the GUC must be restored to input.operatingCompanyId BEFORE the fixed_asset_disposals INSERT (that table lives under the asset's own home company, not the title-holder's)");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-owned-asset-disposal-cross-entity-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const good = `
export async function postOwnedAssetDisposal(input, actor) {
  return withCurrentUser(actor.userId, async (client) => {
    const assetRes = await client.query(
      \`SELECT id::text, name, asset_account_id::text, accum_depr_account_id::text,
              owner_operating_company_id::text
         FROM accounting.fixed_assets WHERE operating_company_id = $1::uuid AND id = $2::uuid FOR UPDATE\`,
      [input.operatingCompanyId, input.assetId]
    );
    const asset = assetRes.rows[0];
    const booksCompanyId = asset.owner_operating_company_id;
    if (!booksCompanyId) throw new OwnedAssetDisposalError("OWNER_BOOKS_MISSING", "x");

    await client.query(\`SELECT set_config('app.operating_company_id', $1::text, true)\`, [booksCompanyId]);
    const gainLossAccount = await resolveRequiredRole(client, booksCompanyId, "gain_loss_on_disposal");
    const proceedsAccount = await resolveCashLike(client, booksCompanyId);

    const journalEntry = await createJournalEntryOnClient(
      client,
      { operating_company_id: booksCompanyId, entry_date: input.disposalDate, postings },
      actor
    );

    const postingRows = await client.query(
      \`SELECT id::text FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid AND journal_entry_uuid = $2::uuid\`,
      [booksCompanyId, journalEntry.id]
    );

    await client.query(\`SELECT set_config('app.operating_company_id', $1::text, true)\`, [input.operatingCompanyId]);

    const disposalRes = await client.query(
      \`INSERT INTO accounting.fixed_asset_disposals (operating_company_id, asset_id, disposal_je_id) VALUES ($1::uuid, $2::uuid, $8::uuid) RETURNING id::text\`,
      [input.operatingCompanyId, input.assetId, proceeds, bookValue, gainLoss, gainLossAccount, journalEntry.id, actor.userId]
    );
  });
}
`;
  mk("apps/backend/src/accounting/owned-asset-disposal.service.ts", good);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: the original bug shape — no owner-company resolution at all, everything under
  // input.operatingCompanyId throughout.
  mk(
    "apps/backend/src/accounting/owned-asset-disposal.service.ts",
    good
      .replace(/owner_operating_company_id::text/, "")
      .replace(/const booksCompanyId = asset\.owner_operating_company_id;[\s\S]*?throw new OwnedAssetDisposalError\("OWNER_BOOKS_MISSING", "x"\);\n    \}\n\n    await client\.query\(`SELECT set_config\('app\.operating_company_id', \$1::text, true\)`, \[booksCompanyId\]\);\n    /, "")
      .replace(/booksCompanyId/g, "input.operatingCompanyId")
  );
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 1): the pre-fix shape (no owner-company resolution) should be caught");

  // Regression 2: booksCompanyId resolved but the GUC/disposal-table restore to input.operatingCompanyId
  // is missing before the fixed_asset_disposals INSERT (still posts under booksCompanyId there).
  mk(
    "apps/backend/src/accounting/owned-asset-disposal.service.ts",
    good.replace(
      "await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);\n\n    const disposalRes",
      "const disposalRes"
    )
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 2): missing GUC restore before fixed_asset_disposals INSERT should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-owned-asset-disposal-cross-entity-books --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-owned-asset-disposal-cross-entity-books — OK");
}
