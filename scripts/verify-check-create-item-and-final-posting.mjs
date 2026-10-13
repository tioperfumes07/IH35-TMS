#!/usr/bin/env node
/**
 * verify-check-create-item-and-final-posting — LEAD 443.113, Codex deep wiring audit DEGH-03 + DEGH-04.
 *
 * DEGH-03: a CATEGORY check line took "any active item whose default expense account = the line's account ... LIMIT 1".
 *   Several items share an account (USMCA: 17 account groups / 101 items), so the line silently named an arbitrary item.
 *   LAW: the line's item is the one the operator NAMED (validated: this company, active, same account) or the ONE active
 *   item on that account; zero or several are refused by name (CATEGORY_ITEM_REQUIRED / CATEGORY_ITEM_AMBIGUOUS).
 * DEGH-04: with the expense GL flag off, or when the poster refused (PostingEngineError), createCheck kept the check and
 *   returned 201 'unposted'. LAW: a check exists only if it posts — flag off refuses (CHECK_GL_POSTING_DISABLED), a posting
 *   refusal refuses (CHECK_POSTING_REFUSED) and the transaction rolls back.
 *
 * Static (no DB): reads apps/backend/src/accounting/checks/check-create.service.ts. Behaviour is proven by
 * check-create-item-and-final-posting.db.test.ts + check-create-posting-refusal.db.test.ts (both fail on the old code).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-check-create-item-and-final-posting";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/accounting/checks/check-create.service.ts";

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function checkCreateCheck(raw) {
  const src = stripComments(raw);
  const problems = [];
  // DEGH-03
  if (/default_expense_account_id\s*=\s*\$2::uuid[\s\S]{0,120}?LIMIT\s+1/.test(src)) {
    problems.push("DEGH-03: a category line still picks an item by account with LIMIT 1 (arbitrary item).");
  }
  if (!/resolveCheckCategoryItem\(\s*client,\s*operating_company_id,\s*resolved\.account_id,\s*line\.item_id/.test(src)) {
    problems.push("DEGH-03: category lines no longer resolve their item through resolveCheckCategoryItem with the named item.");
  }
  const resolver = src.match(/export async function resolveCheckCategoryItem[\s\S]*?\n}\n/);
  if (!resolver) problems.push("DEGH-03: resolveCheckCategoryItem is missing.");
  else {
    const r = resolver[0];
    if (!/"CATEGORY_ITEM_AMBIGUOUS"/.test(r)) problems.push("DEGH-03: several items on the account are not refused (CATEGORY_ITEM_AMBIGUOUS).");
    if (!/"CATEGORY_ITEM_REQUIRED"/.test(r)) problems.push("DEGH-03: no item on the account is not refused (CATEGORY_ITEM_REQUIRED).");
    if (!/"CATEGORY_ITEM_ACCOUNT_MISMATCH"/.test(r)) problems.push("DEGH-03: a named item on another account is not refused.");
    if (!/candidates\.length === 1\) return candidates\[0\]\.id/.test(r)) problems.push("DEGH-03: only exactly ONE eligible item may be inferred.");
    if (!/operating_company_id = \$2::uuid/.test(r)) problems.push("DEGH-03: the named item is not scoped to the company.");
  }
  // DEGH-04
  if (/leave unposted/.test(src) || /catch \(err\) \{\s*if \(!\(err instanceof PostingEngineError\)\) throw err;\s*\}/.test(src)) {
    problems.push("DEGH-04: a PostingEngineError is swallowed and the check is kept unposted.");
  }
  if (!/"CHECK_GL_POSTING_DISABLED"/.test(src)) problems.push("DEGH-04: flag-off no longer refuses the check (CHECK_GL_POSTING_DISABLED).");
  if (!/"CHECK_POSTING_REFUSED"/.test(src)) problems.push("DEGH-04: a posting refusal no longer refuses the check (CHECK_POSTING_REFUSED).");
  if (/if \(await isEnabled\(client, EXPENSE_GL_POSTING_FLAG_KEY/.test(src)) {
    problems.push("DEGH-04: posting is again optional on the flag (a final check could be saved unposted).");
  }
  return problems;
}

function selftest() {
  const real = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");
  let ok = true;
  const ex = (name, cond) => { if (!cond) { console.error(`SELFTEST FAIL: ${name}`); ok = false; } };
  ex("real check-create passes", checkCreateCheck(real).length === 0);
  const oldLimit1 = `const categoryItemId = (await client.query(\`SELECT id::text FROM catalogs.items WHERE operating_company_id = $1::uuid AND default_expense_account_id = $2::uuid AND deactivated_at IS NULL LIMIT 1\`, [a, b])).rows[0]?.id;`;
  ex("the old LIMIT 1 item pick is caught", checkCreateCheck(real + "\n" + oldLimit1).some((p) => p.startsWith("DEGH-03")));
  ex("dropping the named-item resolver call is caught",
    checkCreateCheck(real.replace(/resolveCheckCategoryItem\(client, operating_company_id, resolved\.account_id, line\.item_id \?\? null\)/, "null")).length > 0);
  ex("dropping the ambiguity refusal is caught", checkCreateCheck(real.replaceAll('"CATEGORY_ITEM_AMBIGUOUS"', '"ITEM_NOT_FOUND"')).length > 0);
  ex("inferring from several items is caught",
    checkCreateCheck(real.replace("candidates.length === 1) return candidates[0].id", "candidates.length >= 1) return candidates[0].id")).length > 0);
  const swallow = real + `\nfunction x(){ try { f(); } catch (err) {\n if (!(err instanceof PostingEngineError)) throw err;\n } }`;
  ex("a swallowed PostingEngineError is caught", checkCreateCheck(swallow).some((p) => p.startsWith("DEGH-04")));
  ex("flag-off refusal removed is caught", checkCreateCheck(real.replaceAll('"CHECK_GL_POSTING_DISABLED"', '"X"')).length > 0);
  ex("posting optional on the flag is caught",
    checkCreateCheck(real + "\n if (await isEnabled(client, EXPENSE_GL_POSTING_FLAG_KEY, {})) {}").length > 0);
  ex("a rule mentioned only in a comment does not count",
    checkCreateCheck(real.replaceAll('"CHECK_POSTING_REFUSED"', '"Y"') + '\n// "CHECK_POSTING_REFUSED"').length > 0);
  console.log(ok ? `${LABEL} --selftest PASS (9/9)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes("--selftest")) selftest();
const problems = checkCreateCheck(fs.readFileSync(path.join(ROOT, SERVICE), "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — check category lines name their item (no account→item guess); a check exists only if it posts.`);
