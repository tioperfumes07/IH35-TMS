#!/usr/bin/env node
/**
 * GUARD: creating a SOLD item must name the account its invoice line will credit.
 *
 * ACCT-F190 / Cascade FAIL-L2. `catalogs/items.routes.ts` declared
 * `default_income_account_id: z.string().uuid().optional()` on create while the UI required it — so
 * every non-UI caller, and any UI path that skipped the field, created an item that can never post
 * revenue.
 *
 * MEASURED ON PROD WITH THE ORIGIN TEST APPLIED, because the raw count would be meaningless: 221 of
 * 243 items have no income account, but 226 of those items are QBO clones whose NULL is EXPECTED
 * STATE under parallel books. Classified by origin, the real finding is
 *
 *     TMS-native items: 17     with NO income account: 16     (Service 10/11, NonInventory 6/6)
 *
 * and 16,552 of 21,215 invoice_lines reference an item. An item with no income account has nothing
 * to credit when its line posts. Cascade reported 6/7 on USMCA — exact; the class is simply wider.
 *
 * THE SCOPE BOUNDARY IS THE SUBTLE PART, and it is asserted here rather than trusted:
 * qbo-sync/items-write-sql.ts inserts CLONES of QBO items that legitimately carry no local account
 * mapping. Requiring an income account THERE would break the import — the fix must bind the
 * user-facing create route and nothing else. A guard that only checked "the field is required
 * somewhere" would happily pass a change that broke the importer.
 *
 * Run:  node scripts/verify-item-income-account-required.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = "apps/backend/src/catalogs/items.routes.ts";
const QBO_WRITER = "apps/backend/src/qbo-sync/items-write-sql.ts";
const LABEL = "verify-item-income-account-required";

const read = (rel) => {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};
/** Comments stripped: this fix ships with a comment naming every token checked below. */
const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

export function collectProblems(routesSrc, qboSrc) {
  const problems = [];
  if (routesSrc == null) return [`missing ${ROUTES}`];
  const r = strip(routesSrc);

  if (!/INCOME_ACCOUNT_REQUIRED_TYPES/.test(r)) {
    problems.push(
      `${ROUTES} does not define INCOME_ACCOUNT_REQUIRED_TYPES — a sold item can be created with no ` +
        `income account and its invoice line will have nothing to credit (ACCT-F190).`
    );
    return problems;
  }
  // The three types QuickBooks itself requires an income account for.
  for (const t of ["Service", "Inventory", "NonInventory"]) {
    const set = /INCOME_ACCOUNT_REQUIRED_TYPES\s*=\s*new Set\(\[([^\]]*)\]/.exec(r)?.[1] ?? "";
    if (!new RegExp(`["']${t}["']`).test(set)) {
      problems.push(`${ROUTES} INCOME_ACCOUNT_REQUIRED_TYPES omits '${t}', which is sold to a customer.`);
    }
  }
  if (!/superRefine/.test(r) || !/default_income_account_id/.test(r)) {
    problems.push(`${ROUTES} must enforce the requirement in the create schema (superRefine).`);
  } else {
    const refine = /superRefine\(([\s\S]{0,1200}?)\n\s{2}\}\)/.exec(r)?.[0] ?? r;
    if (!/INCOME_ACCOUNT_REQUIRED_TYPES\.has\(/.test(refine)) {
      problems.push(
        `${ROUTES} superRefine does not gate on INCOME_ACCOUNT_REQUIRED_TYPES — either it requires the ` +
          `account for EVERY type (which blocks Bundle/Discount/Charge) or for none.`
      );
    }
    if (!/!b\.default_income_account_id|default_income_account_id\s*==\s*null/.test(refine)) {
      problems.push(`${ROUTES} superRefine does not actually test default_income_account_id.`);
    }
  }

  // SCOPE BOUNDARY: the QBO clone writer must stay unconstrained.
  if (qboSrc != null && /INCOME_ACCOUNT_REQUIRED_TYPES|default_income_account_id is required/.test(strip(qboSrc))) {
    problems.push(
      `${QBO_WRITER} has acquired the income-account requirement. QBO clones legitimately carry no ` +
        `local account mapping — enforcing it there BREAKS THE IMPORT. The requirement belongs to the ` +
        `user-facing create route only.`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const routes = read(ROUTES);
  const qbo = read(QBO_WRITER);
  const baseline = collectProblems(routes, qbo);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL — clean tree is not green:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  // Every mutation runs through the REAL checker and must come back RED. Four guards found on
  // 2026-08-08 had selftests that could not fail; those shapes are avoided here deliberately.
  const mutations = [
    ["requirement removed entirely", routes.replaceAll("INCOME_ACCOUNT_REQUIRED_TYPES", "UNUSED_SET"), qbo],
    // NOTE: these two must target the SET, not the first occurrence of the type name — `z.enum` on
    // line 12 lists the same strings, and my first attempt mutated THAT instead, leaving the Set
    // intact. The guard correctly stayed green and the SELFTEST caught my bad mutation, which is the
    // selftest doing its job in the less obvious direction.
    [
      "Service dropped from the required set",
      routes.replace(/new Set\(\["Service", /, 'new Set(['),
      qbo,
    ],
    [
      "NonInventory dropped from the required set",
      routes.replace(/, "NonInventory"\]\)/, "])"),
      qbo,
    ],
    ["superRefine no longer tests the field", routes.replace(/!b\.default_income_account_id/, "false"), qbo],
    [
      "requirement leaked into the QBO clone writer (would break the import)",
      routes,
      (qbo ?? "") + "\nif (INCOME_ACCOUNT_REQUIRED_TYPES.has(t)) throw new Error('x');",
    ],
  ];
  const inert = [];
  for (const [why, rr, qq] of mutations) {
    if (rr === routes && qq === qbo) {
      inert.push(`${why} — MUTATION INERT (changed nothing; proves nothing)`);
      continue;
    }
    if (collectProblems(rr, qq).length === 0) inert.push(`${why} — NOT DETECTED`);
  }
  if (inert.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of inert) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — ${mutations.length}/${mutations.length} mutations detected (incl. the scope-boundary leak that would break the QBO import)`);
  process.exit(0);
}

const problems = collectProblems(read(ROUTES), read(QBO_WRITER));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} issue(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — Service/Inventory/NonInventory require an income account on create, Bundle/Discount/` +
    `Charge are deliberately exempt, and the QBO clone writer is unconstrained.`
);
