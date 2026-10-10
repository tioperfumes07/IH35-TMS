#!/usr/bin/env node
/**
 * GUARD — ROUND 443.7: ONE POST, ALL OR NOTHING, AND AN HONEST RESULT.
 *
 * MEASURED on main 745714fe5d (settlement-creator.routes.ts): the factor auto-submit and billing sync ran after COMMIT,
 * failures were console.warn'ed, and the route still returned ok: true. :247-255 booked loads in their own committed
 * transaction (a refused post stranded them — reproduced on prod forks, ROUND 443.3/443.4).
 *
 * PART b (shipped)
 *   1. the post response carries stages {documents, ledger, factoring, billing}; ok = overallOk(stages) — no literal ok: true
 *   2. a failed after-commit stage is stored (audit event) and retryable (retry-after-commit route)
 *   3. a billing sync that swallowed a per-load error (reason "error") is a failure; a Faro load waiting for the owner's
 *      submit (owner law ROUND 315) is OK
 *   4. the drawer shows every stage in plain English and offers Retry
 * PART a (single transaction; CC-2 443.14 bookLoadOnClient; Lead ruling Option A)
 *   5. the post route runs admission, seeding and the post inside ONE withCurrentUser transaction; after-book extras
 *      run only after it commits
 *   6. the seeder books with bookLoadOnClient (never bookLoad's own transaction) and delivers each delivered load
 *      before booking the next (same truck)
 *   7. the preview books + delivers inside a savepoint it always rolls back, and discards dispatch's after-commit queue
 *   8. Option A: the Creator adopts the tour settlement born in this transaction (never an earlier one), upgrades the
 *      booking's pay lines (pay_mismatch otherwise), and the load-bookended ping steps aside during a Creator post
 * Run: node scripts/verify-settlement-creator-atomic-post.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-atomic-post";
const F = {
  routes: "apps/backend/src/driver-finance/settlement-creator.routes.ts",
  after: "apps/backend/src/driver-finance/settlement-creator-after-commit.ts",
  drawer: "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx",
  test: "apps/backend/src/driver-finance/__tests__/settlement-creator-after-commit.test.ts",
  seed: "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts",
  svc: "apps/backend/src/driver-finance/settlement-creator.service.ts",
  ping: "apps/backend/src/driver-finance/settlements-load-bookended.service.ts",
};

export function problems(src) {
  const p = [];
  const post = src.routes.slice(src.routes.indexOf('"/api/v1/driver-finance/settlement-creator/post"'), src.routes.indexOf("retry-after-commit"));
  if (/reply\.code\(200\)\.send\(\{\s*ok: true/.test(post)) p.push("the post route still answers a literal ok: true");
  if (!/ok: overallOk\(stages\)/.test(post) || !/\bstages,/.test(post)) p.push("the post response must carry stages and ok = overallOk(stages)");
  if (/console\.warn\([^)]*settlement_creator_(faro|billing)/.test(src.routes)) p.push("an after-commit failure is only logged");
  if (!/await recordAfterCommit\(/.test(post) || !/retry-after-commit/.test(src.routes)) p.push("after-commit stages must be stored and retryable");
  if (!/results\[i\]\?\.reason === "error"/.test(src.after)) p.push('a billing sync per-load "error" must count as a failure');
  if (!/AUTO_SUBMIT_REFUSED_REASON\) perLoad\.push\(\{ load_number: l\.load_number, status: "owner_submits" \}\)/.test(src.after)) p.push("a Faro load waiting for the owner's submit (ROUND 315) must be OK, not a failure");
  if (!/data-testid="sc-post-stages"/.test(src.drawer) || !/data-testid="sc-post-retry"/.test(src.drawer)) p.push("the drawer must show every stage and offer Retry");
  if (!/faro_api_down/.test(src.test)) p.push("forced factor-submit failure test missing");
  if (!/await assertCreatorDraftAdmissible\(client, draft\);\s*const seeded = await ensureDispatchedLoadsForCreator\(client[\s\S]{0,200}return postSettlementCreatorInClientTx\(client/.test(post)) p.push("admission, seeding and the post must run in ONE transaction");
  if (!/for \(const run of afterBook\) run\(\);/.test(post)) p.push("after-book extras must run only after the commit");
  if (/\bbookLoad\(/.test(src.seed.replace(/\/\/[^\n]*/g, "")) || !/bookLoadOnClient\(client/.test(src.seed)) p.push("the seeder must book with bookLoadOnClient on the Creator transaction");
  if (!/await deliverLoadThroughDispatch\(client, actor\.uuid/.test(src.seed)) p.push("each delivered load must be delivered before the next is booked (same truck)");
  if (!/await ensureDispatchedLoadsForCreator\(client, \{ uuid: actorUserId, role: actorRole \}, draft\);/.test(src.svc) || !/afterCommitRollbackTo\(client, afterCommitMarkAt\)/.test(src.svc)) p.push("the preview must book inside its rolled-back savepoint and discard the after-commit queue");
  if (!/s\.created_at = now\(\)/.test(src.svc) || !/"pay_mismatch"/.test(src.svc)) p.push("Option A: adopt only the tour settlement born in this transaction; refuse pay_mismatch");
  if (!/current_setting\('app\.settlement_creator_post', true\)/.test(src.ping)) p.push("the load-bookended ping must step aside during a Creator post");
  return p;
}

function selftest() {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  const good = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  const m = (k, from, to) => ({ ...good, [k]: good[k].replace(from, to) });
  const bad = [];
  if (problems(good).length) bad.push(`real tree flagged: ${problems(good).join("; ")}`);
  if (!problems(m("routes", "ok: overallOk(stages),", "ok: true,")).some((x) => /literal ok: true/.test(x))) bad.push("a literal ok: true passed");
  if (!problems(m("routes", "await recordAfterCommit(user.uuid, afterInput, after);", "")).some((x) => /stored/.test(x))) bad.push("an unstored failure passed");
  if (!problems(m("after", 'results[i]?.reason === "error"', "false")).some((x) => /billing/.test(x))) bad.push("a swallowed billing error passed");
  if (!problems(m("drawer", 'data-testid="sc-post-stages"', 'data-testid="x"')).some((x) => /drawer/.test(x))) bad.push("a hidden result passed");
  if (!problems(m("seed", "bookLoadOnClient(client as never, input)", "bookLoad(input)")).some((x) => /bookLoadOnClient/.test(x))) bad.push("a separate-transaction booking passed");
  if (!problems(m("svc", "s.created_at = now()", "true")).some((x) => /Option A/.test(x))) bad.push("adopting an earlier tour passed");
  if (bad.length) { console.error(`${LABEL} SELFTEST FAILED:\n  - ${bad.join("\n  - ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST OK — 7/7 (real tree passes; literal ok, unstored failure, swallowed billing error, hidden result, separate-transaction booking, earlier-tour adoption each caught)`);
  process.exit(0);
}
if (process.argv.includes("--selftest")) selftest();
const src = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
const p = problems(src);
if (p.length) { console.error(`${LABEL} FAIL\n  - ${p.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL} OK — every post reports documents / ledger / factoring / billing; ok only when all succeeded; failures stored and retryable; one transaction from booking to close; one settlement per post.`);
