#!/usr/bin/env node
/**
 * Rule-17 guard: prepaid expenses forward EntityLinks + JE reverse mapping (Law §9).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-prepaid-expenses-entitylink-reverse";
const PREPAID_PAGE = "apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx";
const PREPAID_API = "apps/frontend/src/api/prepaid-expenses.ts";
const PREPAID_ROUTES = "apps/backend/src/accounting/prepaid-expenses.routes.ts";
const JE_DETAIL = "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx";
const ENTITY_LINK = "apps/frontend/src/components/shared/EntityLink.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertPrepaidExpensesEntitylinkReverse(candidate = null) {
  const errors = [];
  const prepaid = candidate?.prepaid ?? read(PREPAID_PAGE);
  const api = candidate?.api ?? read(PREPAID_API);
  const routes = candidate?.routes ?? read(PREPAID_ROUTES);
  const jeDetail = read(JE_DETAIL);
  const entityLink = read(ENTITY_LINK);

  if (!prepaid.includes("useSearchParams")) {
    errors.push(`${PREPAID_PAGE}: must honor ?asset_id= reverse drill param`);
  }
  if (!/purchase_je_id/.test(prepaid) || !/kind=["']journal_entry["']/.test(prepaid)) {
    errors.push(`${PREPAID_PAGE}: detail must EntityLink purchase_je_id → journal_entry`);
  }
  // ACCT-F5067: CLS-LINKAGE-ONEWAY — API must resolve JE/account human labels; FE must not entityLabel(null, id).
  if (!/purchase_je_memo/.test(prepaid) || !/journal_entry_memo/.test(prepaid)) {
    errors.push(`${PREPAID_PAGE}: must render purchase_je_memo + schedule journal_entry_memo (not UUID-only)`);
  }
  if (/entityLabel\(\s*null\s*,\s*(?:detail\.|row\.)?(?:purchase_je_id|posted_journal_entry_id|asset_account_id)/.test(prepaid)) {
    errors.push(`${PREPAID_PAGE}: must not entityLabel(null, …) for JE/GL ids — resolve human labels from API`);
  }
  if (!/asset_account_number/.test(prepaid) || !/asset_account_name/.test(prepaid)) {
    errors.push(`${PREPAID_PAGE}: must render asset_account_number/name from detail API`);
  }
  if (!/purchase_je_memo/.test(routes) || !/journal_entry_memo/.test(routes)) {
    errors.push("prepaid-expenses.routes.ts: detail/schedule must JOIN journal_entries for memo/date labels");
  }
  if (!/asset_account_number/.test(routes) || !/LEFT JOIN catalogs\.accounts/.test(routes)) {
    errors.push("prepaid-expenses.routes.ts: detail must JOIN catalogs.accounts for GL labels");
  }
  if (!/asset_account_id/.test(prepaid) || !/kind=["']account["']/.test(prepaid)) {
    errors.push(`${PREPAID_PAGE}: detail must EntityLink GL accounts (asset/expense/payment)`);
  }
  if (!/case ["']prepaid_asset["']:/.test(jeDetail) || !/case ["']prepaid_amortization["']:/.test(jeDetail)) {
    errors.push(`${JE_DETAIL}: postingEntityKind must map prepaid_asset + prepaid_amortization`);
  }
  if (!entityLink.includes("prepaid_asset") || !/\/accounting\/prepaid-expenses\?asset_id=/.test(entityLink)) {
    errors.push(`${ENTITY_LINK}: must resolve prepaid_asset → /accounting/prepaid-expenses?asset_id=`);
  }
  if (!prepaid.includes("createPrepaidExpense({") || !prepaid.includes("operating_company_id: companyId")) {
    errors.push(`${PREPAID_PAGE}: Create must invoke the selected-company prepaid writer`);
  }
  if (!api.includes('apiRequest<PrepaidAssetDetail>("/api/v1/accounting/prepaid-expenses", { method: "POST", body })')) {
    errors.push(`${PREPAID_API}: create must POST its body to the canonical route`);
  }
  if (!routes.includes('app.post("/api/v1/accounting/prepaid-expenses"') || !routes.includes("INSERT INTO accounting.prepaid_assets") || !routes.includes("INSERT INTO accounting.prepaid_amortization_rows")) {
    errors.push(`${PREPAID_ROUTES}: create must persist the canonical asset and schedule rows`);
  }
  return errors;
}

function selftest() {
  const source = { prepaid: read(PREPAID_PAGE), api: read(PREPAID_API), routes: read(PREPAID_ROUTES) };
  const errors = assertPrepaidExpensesEntitylinkReverse(source);
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  const mutations = [
    ["prepaid", "createPrepaidExpense({"],
    ["prepaid", "operating_company_id: companyId"],
    ["api", '{ method: "POST", body }'],
    ["routes", 'app.post("/api/v1/accounting/prepaid-expenses"'],
    ["routes", "INSERT INTO accounting.prepaid_assets"],
    ["routes", "INSERT INTO accounting.prepaid_amortization_rows"],
  ];
  for (const [key, token] of mutations) {
    // RE-ANCHOR (found stale 2026-08-29): "operating_company_id: companyId" appears TWICE in
    // PrepaidExpensesPage.tsx (an unrelated listCatalogAccounts query, plus the real
    // createPrepaidExpense payload this mutation targets). A non-global .replace() only killed the
    // first (unrelated) occurrence, leaving the real create-path token intact, so the assertion
    // kept passing and the mutation silently escaped detection. .replaceAll() clears every
    // occurrence, including the unrelated one — harmless, since this fixture is discarded after
    // the assertion runs.
    const mutated = { ...source, [key]: source[key].replaceAll(token, "BROKEN_PREPAID_CREATE_PATH") };
    if (mutated[key] === source[key]) throw new Error(`${LABEL}: selftest fixture drifted for ${token}`);
    if (assertPrepaidExpensesEntitylinkReverse(mutated).length === 0) throw new Error(`${LABEL}: mutation escaped for ${token}`);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} create-path mutations rejected`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertPrepaidExpensesEntitylinkReverse();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
