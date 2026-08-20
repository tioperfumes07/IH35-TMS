#!/usr/bin/env node
/**
 * ACCT-F5660 — the CHAIN-05 backlog poster route must exist and stay correctly shaped.
 *
 * Every other invocation of maybePostBankCategorizationToGl fires only AT categorize time, so a
 * transaction categorized while BANK_FEED_GL_POSTING_ENABLED was OFF (or whose best-effort post
 * failed) was stuck forever: categorized + tagged + matched_journal_entry_id NULL — measured live on
 * USMCA: 32 categorized / 28 tagged, only 8 with a JE; the linked-bank panels' bank→JE drill was
 * permanently dark for the rest. POST /api/v1/banking/transactions/post-categorized-backlog
 * re-invokes the SAME idempotent poster per stuck row.
 *
 * Shape locked here:
 *   1. the route exists;
 *   2. its backlog SELECT targets exactly status='categorized' AND matched_journal_entry_id IS NULL;
 *   3. it calls maybePostBankCategorizationToGl (reuse, no new GL math);
 *   4. the poster loop runs AFTER the withCompanyScope read closes — the loop must not appear inside
 *      the scope callback (the ACCT-F5651 lock-order lesson: never await a self-connecting poster
 *      while holding an open scoped transaction).
 *
 * Run:  node scripts/verify-bank-feed-backlog-poster-route.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-feed-backlog-poster-route";
const FILE = "apps/backend/src/banking/categorization.routes.ts";

export function analyze(src) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const routeIdx = code.indexOf('"/api/v1/banking/transactions/post-categorized-backlog"');
  if (routeIdx < 0) {
    failures.push(`${FILE}: the post-categorized-backlog route is missing (ACCT-F5660) — stuck categorized rows can never gain their JE.`);
    return failures;
  }
  const nextRouteIdx = code.indexOf("app.post(", routeIdx + 1);
  const block = code.slice(routeIdx, nextRouteIdx > 0 ? nextRouteIdx : routeIdx + 4000);
  if (!/status = 'categorized'/.test(block) || !/matched_journal_entry_id IS NULL/.test(block)) {
    failures.push(`${FILE}: the backlog SELECT must target status='categorized' AND matched_journal_entry_id IS NULL — anything broader reposts already-posted rows; anything narrower strands part of the backlog.`);
  }
  if (!/maybePostBankCategorizationToGl\(/.test(block)) {
    failures.push(`${FILE}: the backlog route must reuse maybePostBankCategorizationToGl — no new GL math.`);
  }
  const scopeMatch = /await withCompanyScope\([\s\S]*?\n    \}\);/.exec(block);
  if (scopeMatch && /maybePostBankCategorizationToGl\(/.test(scopeMatch[0])) {
    failures.push(`${FILE}: the poster loop must run AFTER the withCompanyScope read closes, never inside it (ACCT-F5651 lock-order lesson).`);
  }
  return failures;
}

export function run() {
  return analyze(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
}

if (process.argv.includes("--selftest")) {
  const GOOD = `
  app.post("/api/v1/banking/transactions/post-categorized-backlog", async (req, reply) => {
    const backlogIds = await withCompanyScope(user.uuid, opco, async (client) => {
      const res = await client.query(
        \`SELECT bt.id FROM banking.bank_transactions bt WHERE bt.status = 'categorized' AND bt.matched_journal_entry_id IS NULL\`
      );
      return res.rows.map((r) => r.id);
    });
    for (const id of backlogIds) {
      await maybePostBankCategorizationToGl({ companyId: opco, actorUserUuid: user.uuid, bankTransactionId: id });
    }
  });
  app.post("/api/v1/banking/other", async () => {});
`;
  const good = analyze(GOOD);
  if (good.length) throw new Error(`[${LABEL}] selftest PASS fixture FAILED: ${good.join("; ")}`);

  const BAD_MISSING = `app.post("/api/v1/banking/transactions/bulk-categorize", async () => {});`;
  if (!analyze(BAD_MISSING).length) throw new Error(`[${LABEL}] selftest REGRESSION (route deleted) should FAIL but passed`);

  const BAD_INSIDE_SCOPE = `
  app.post("/api/v1/banking/transactions/post-categorized-backlog", async (req, reply) => {
    await withCompanyScope(user.uuid, opco, async (client) => {
      const res = await client.query(
        \`SELECT bt.id FROM banking.bank_transactions bt WHERE bt.status = 'categorized' AND bt.matched_journal_entry_id IS NULL\`
      );
      for (const r of res.rows) {
        await maybePostBankCategorizationToGl({ companyId: opco, actorUserUuid: user.uuid, bankTransactionId: r.id });
      }
    });
  });
  app.post("/api/v1/banking/other", async () => {});
`;
  const badScope = analyze(BAD_INSIDE_SCOPE);
  if (!badScope.some((f) => f.includes("AFTER the withCompanyScope"))) {
    throw new Error(`[${LABEL}] selftest REGRESSION (poster inside the scope) should FAIL the lock-order check but got: ${badScope.join("; ") || "(clean)"}`);
  }

  console.log(`[${LABEL}] selftest: PASS — good green; deleted-route and poster-inside-scope both red`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — the backlog poster route exists, targets exactly the stuck rows, reuses the poster, and posts outside the read scope`);
