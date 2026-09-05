#!/usr/bin/env node
// B.1 (owner order 2026-09-05, docs/bus/CODER-SEQUENCE-NUMBERED-2026-09-05.md CC-2 §6): "banking
// matcher: suggest exact cents +-5d to expenses/bills ... suggested_* + confidence; POST
// /banking/transactions/suggest; Accept->match never auto-post; guard rendered."
//
// This guard pins the three load-bearing facts about the implementation:
//   1. POST /api/v1/banking/transactions/suggest exists and REUSES findCandidates (the existing,
//      already-reviewed exact-cents/+-5d/memo-similarity matcher) — no second, duplicate matching
//      algorithm, and no call into the posting engine from this route (a suggestion must never post).
//   2. The frontend calls it (suggestBankTransactionMatches) and renders a suggestion affordance.
//   3. "Accept -> match never auto-post": the suggestion badge's onClick opens the EXISTING Match
//      drawer (setMatchDrawerTxId), never a direct accept/post call — accepting a suggestion must
//      go through the one reviewed accept path, not a second one grown here.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-suggest-matches-wired";
const ROUTE_FILE = "apps/backend/src/banking/p7-wave2.routes.ts";
const VIEW_FILE = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];

  const routeRaw = readRel(root, ROUTE_FILE);
  if (!routeRaw) {
    problems.push(`missing ${ROUTE_FILE}`);
  } else {
    const routeSrc = maskComments(routeRaw);
    const routeStart = routeSrc.indexOf('"/api/v1/banking/transactions/suggest"');
    if (routeStart < 0) {
      problems.push(`${ROUTE_FILE}: POST /api/v1/banking/transactions/suggest route not found`);
    } else {
      // Bound the route body: from the route registration to the next `app.` call (next route).
      const nextRouteIdx = routeSrc.indexOf("\n  app.", routeStart + 10);
      const routeBody = routeSrc.slice(routeStart, nextRouteIdx > 0 ? nextRouteIdx : routeSrc.length);
      if (!/findCandidates\(/.test(routeBody)) {
        problems.push(`${ROUTE_FILE}: /transactions/suggest must reuse findCandidates, not a second matching algorithm`);
      }
      if (/postSourceTransaction|PostingEngineError|storeMatch\(/.test(routeBody)) {
        problems.push(`${ROUTE_FILE}: /transactions/suggest must never post or persist a match itself — it is read-only`);
      }
    }
  }

  const viewRaw = readRel(root, VIEW_FILE);
  if (!viewRaw) {
    problems.push(`missing ${VIEW_FILE}`);
  } else {
    const viewSrc = maskComments(viewRaw);
    if (!/suggestBankTransactionMatches/.test(viewSrc)) {
      problems.push(`${VIEW_FILE}: must call suggestBankTransactionMatches (bulk suggest)`);
    }
    // The suggestion badge's onClick must open the Match drawer (setMatchDrawerTxId), not call an
    // accept/post function directly — this is the structural half of "Accept never auto-posts".
    // Scoped to the SINGLE <button>...</button> element containing the marker (nearest enclosing
    // <button before it, nearest </button> after) — not a fixed char window, which would also catch
    // an unrelated sibling control (e.g. the adjacent "Post" ActionButton in the same action cell).
    const markerIdx = viewSrc.indexOf("banking-suggested-match-");
    const elStart = markerIdx < 0 ? -1 : viewSrc.lastIndexOf("<button", markerIdx);
    const elEndTag = markerIdx < 0 ? -1 : viewSrc.indexOf("</button>", markerIdx);
    const badgeBlock = elStart < 0 || elEndTag < 0 ? "" : viewSrc.slice(elStart, elEndTag + "</button>".length);
    if (markerIdx < 0 || !/onClick=\{[\s\S]{0,80}setMatchDrawerTxId/.test(badgeBlock)) {
      problems.push(`${VIEW_FILE}: the suggested-match badge must open the existing Match drawer (setMatchDrawerTxId), never accept/post directly`);
    }
    if (/(acceptBankReconMatch|postTransaction\()/.test(badgeBlock)) {
      problems.push(`${VIEW_FILE}: the suggested-match badge must not call accept/post directly`);
    }
  }

  return problems;
}

function fail(messages) {
  console.error(`${LABEL} FAIL:`);
  for (const m of messages) console.error(`  - ${m}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) fail(baseline);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "banking-suggest-guard-"));
  try {
    fs.mkdirSync(path.join(tmpRoot, path.dirname(ROUTE_FILE)), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, path.dirname(VIEW_FILE)), { recursive: true });
    // Planted stub: a duplicate matching algorithm (no findCandidates) that ALSO posts, and a badge
    // that accepts directly instead of opening the drawer.
    fs.writeFileSync(
      path.join(tmpRoot, ROUTE_FILE),
      `
  app.post("/api/v1/banking/transactions/suggest", {}, async (req, reply) => {
    const amount = req.body.amount_cents;
    await postSourceTransaction(client, {});
  });
  app.get("/api/v1/banking/other", {}, async () => {});
`
    );
    fs.writeFileSync(
      path.join(tmpRoot, VIEW_FILE),
      `<button data-testid={\`banking-suggested-match-\${tx.id}\`} onClick={() => void acceptBankReconMatch(tx)}>Suggested</button>`
    );
    const planted = collectProblems(tmpRoot);
    // Expect: no findCandidates reuse, posts directly (2 route problems), missing
    // suggestBankTransactionMatches call, badge doesn't open drawer, badge calls accept directly (3
    // view problems) = 5 total.
    if (planted.length !== 5) {
      console.error(
        `${LABEL} SELFTEST FAIL: expected 5 problems on the planted pre-fix stub, got ${planted.length}: ${JSON.stringify(planted)}`
      );
      process.exit(1);
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length > 0) fail(problems);
  console.log(`${LABEL} OK — bulk suggest reuses findCandidates, never posts, badge opens the existing Match drawer`);
}
