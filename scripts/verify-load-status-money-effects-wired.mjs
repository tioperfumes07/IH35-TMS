#!/usr/bin/env node
/**
 * verify-load-status-money-effects-wired.mjs — ACCT-F166 / LV-TXN-004.
 *
 * EVERY endpoint that writes `mdata.loads.status` must apply the load-status money side-effects
 * through the shared `applyLoadStatusMoneyEffects()`.
 *
 * WHY THIS EXISTS. There were TWO status-writing endpoints and only ONE carried the money:
 *   PATCH /api/v1/dispatch/loads/:id/transition  -> revenue latch AND settlement ping
 *   PATCH /api/v1/mdata/loads/:id/status         -> delivery-evidence latch ONLY
 * The office Kanban's only status control calls the SECOND
 * (Dispatch.tsx onStatusDrop -> api/loads.ts updateLoadStatus -> /api/v1/mdata/loads/:id/status),
 * so every load a dispatcher dragged to delivered recognised NO revenue and opened NO driver
 * settlement. CC-3 proved it live on USMCA load L-20260802-0258: every step HTTP 200, status
 * `delivered`, then `driver_finance.driver_settlements` UNCHANGED at 0 with `n_tup_ins` still 11,
 * `accounting.posting_batches` for that load = 0, and zero settlement audit events. Nothing failed
 * and nothing was reported — the money simply never happened.
 *
 * ★ WHY THE OBVIOUS GUARD WOULD HAVE MISSED IT, which is the whole design note here: a guard pointed
 * at the dispatch endpoint alone passes today and would have passed throughout the entire period the
 * product was broken. EACH ENDPOINT WAS INTERNALLY CONSISTENT; they disagreed with EACH OTHER. So
 * this guard scans for the SHAPE — any route file that writes loads.status — instead of checking the
 * files someone already knew about. That is what makes it catch the NEXT third endpoint.
 *
 * WHAT IT ASSERTS
 *   A. the shared service exists and still calls BOTH primitives (revenue latch + settlement ping) —
 *      a "fix" that quietly drops one of them is the same defect wearing the shared function's name;
 *   B. every backend route file containing an UPDATE to `mdata.loads` that sets `status` also calls
 *      `applyLoadStatusMoneyEffects` — discovered by scanning, not enumerated;
 *   C. neither known endpoint re-inlines `postLoadRevenueLatch` / `pingSettlementOnLoadEvent`
 *      directly, because a third private copy is exactly how the two paths drifted apart the first
 *      time (the finding's own words: "Do NOT duplicate the latch logic in a third place").
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-status-money-effects-wired";
const SCAN_ROOT = path.join("apps", "backend", "src");
const SHARED = path.join("apps", "backend", "src", "accounting", "load-status-money-effects.service.ts");
const SHARED_FN = "applyLoadStatusMoneyEffects";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === "__tests__") continue;
      walk(p, out);
    } else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

/** An UPDATE of mdata.loads that assigns `status` — the shape that must carry the money effects. */
const WRITES_LOAD_STATUS = /UPDATE\s+mdata\.loads[\s\S]{0,400}?\bSET\b[\s\S]{0,400}?\bstatus\s*=/i;

/**
 * TWO LISTS, because "not wired" and "correctly not wired" are different facts and collapsing them
 * loses the one that matters.
 *
 * PENDING_WIRE_BASELINE — REAL gaps, shrink-only. Never ADD to it to make a build pass; a NEW status
 * writer must be wired. Entries leave only by being WIRED.
 *
 * PROVEN_NO_OP — paths verified NOT to need the call, each with the evidence. These are not
 * exemptions: `applyLoadStatusMoneyEffects` acts only when the target status is a revenue-latch
 * status (delivered_pending_docs / completed_docs_received) or a settlement-ping status (in_transit /
 * delivered_pending_docs — verified by reading pingSettlementOnLoadEvent's own switch). A writer that
 * can only ever produce a status outside BOTH sets cannot post anything, and forcing a call there
 * would be ceremony that teaches the next reader the guard is arbitrary.
 */
const PENDING_WIRE_BASELINE = new Set([
  // EMPTY — every mdata.loads.status writer now applies the shared money side-effects, or is proven
  // below not to need them. Keep it empty: a NEW status writer must be wired, never listed here.
]);

const PROVEN_NO_OP = new Set([
  // cancellation writes the LITERAL 'cancelled'. Not a latch status and not a ping status, so both
  // primitives are unreachable from here. A cancelled load MUST NOT recognise revenue or open a
  // settlement — the absence of the call is the correct behaviour, proven rather than assumed.
  path.join("apps", "backend", "src", "dispatch", "cancellation.service.ts"),
  // abandonment writes 'abandoned' / 'driver_walkoff' (migration 0094). Neither is a latch or ping
  // status, and this service already runs its OWN escrow/settlement money path — wiring it would risk
  // double-handling the very money it already books.
  path.join("apps", "backend", "src", "driver-finance", "abandonment.service.ts"),
]);

export function findViolations(root = ROOT) {
  const problems = [];

  // ── A. the shared service must exist and still do BOTH things ──────────────────────────────────
  const sharedPath = path.join(root, SHARED);
  if (!fs.existsSync(sharedPath)) {
    problems.push({ where: SHARED, why: "shared load-status money-effects service is missing — every endpoint is free to diverge again" });
  } else {
    const src = stripComments(fs.readFileSync(sharedPath, "utf8"));
    if (!new RegExp(`export\\s+async\\s+function\\s+${SHARED_FN}\\b`).test(src)) {
      problems.push({ where: SHARED, why: `${SHARED_FN} is not exported — renamed or removed` });
    }
    if (!/postLoadRevenueLatch\s*\(/.test(src)) {
      problems.push({ where: SHARED, why: "shared service no longer calls postLoadRevenueLatch — revenue recognition would go dark on every path at once" });
    }
    if (!/pingSettlementOnLoadEvent\s*\(/.test(src)) {
      problems.push({ where: SHARED, why: "shared service no longer calls pingSettlementOnLoadEvent — no driver settlement would ever open" });
    }
  }

  // ── B. every status-writing route must call it — found by SHAPE, not by a known-files list ─────
  for (const abs of walk(path.join(root, SCAN_ROOT))) {
    const rel = path.relative(root, abs);
    if (rel === SHARED) continue;
    const src = stripComments(fs.readFileSync(abs, "utf8"));
    if (!WRITES_LOAD_STATUS.test(src)) continue;
    if (src.includes(`${SHARED_FN}(`)) continue;
    if (PENDING_WIRE_BASELINE.has(rel) || PROVEN_NO_OP.has(rel)) continue;
    problems.push({
      where: rel,
      why: `writes mdata.loads.status but never calls ${SHARED_FN}() — a load moved through this path recognises no revenue and opens no settlement`,
    });
  }

  // ── C. no endpoint may re-inline the primitives (that is how the two paths drifted apart) ──────
  for (const abs of walk(path.join(root, SCAN_ROOT))) {
    const rel = path.relative(root, abs);
    if (rel === SHARED) continue;
    const src = stripComments(fs.readFileSync(abs, "utf8"));
    if (!WRITES_LOAD_STATUS.test(src)) continue;
    if (PENDING_WIRE_BASELINE.has(rel) || PROVEN_NO_OP.has(rel)) continue;
    if (/postLoadRevenueLatch\s*\(|pingSettlementOnLoadEvent\s*\(/.test(src)) {
      problems.push({
        where: rel,
        why: "calls postLoadRevenueLatch/pingSettlementOnLoadEvent directly from a status-writing route — use the shared service; a private copy is how the two endpoints diverged",
      });
    }
  }

  return problems;
}

function report(problems) {
  if (problems.length === 0) {
    console.log(`${LABEL} — OK (every load-status write path applies the money side-effects)`);
    return 0;
  }
  console.error(`${LABEL} FAIL — ${problems.length} violation(s):`);
  for (const p of problems) console.error(`  ${p.where}: ${p.why}`);
  console.error("  A status change that skips these is silent: HTTP 200, status updated, no revenue, no settlement, no error.");
  return 1;
}

/** Mutation-proven: plant the defect => RED, restore => GREEN. */
async function selftest() {
  const failures = [];
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "loadmoney-guard-"));
  const routeRel = path.join(SCAN_ROOT, "mdata", "loads.routes.ts");
  const GOOD_SHARED = fs.readFileSync(path.join(ROOT, SHARED), "utf8");
  const GOOD_ROUTE =
    "const q = `UPDATE mdata.loads SET status = $1 WHERE id = $2`;\n" +
    `await ${SHARED_FN}({ client, operatingCompanyId, loadId, targetStatus, actorUserId });\n`;

  const write = (sharedSrc, routeSrc) => {
    fs.rmSync(path.join(tmp, "apps"), { recursive: true, force: true });
    const put = (rel, body) => {
      const abs = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    };
    if (sharedSrc !== null) put(SHARED, sharedSrc);
    put(routeRel, routeSrc);
  };

  write(GOOD_SHARED, GOOD_ROUTE);
  if (findViolations(tmp).length !== 0) failures.push("case1 FAIL — a wired status route must be GREEN.");

  // Mutation 1 — THE PRODUCTION DEFECT: a status-writing route with no money effects.
  write(GOOD_SHARED, "const q = `UPDATE mdata.loads SET status = $1 WHERE id = $2`;\n");
  if (findViolations(tmp).length === 0) failures.push("case2 FAIL — a status write with no money effects must go RED.");

  // Mutation 2 — the shared service silently loses the settlement ping.
  write(GOOD_SHARED.replace(/pingSettlementOnLoadEvent\s*\(/g, "noopPing("), GOOD_ROUTE);
  if (findViolations(tmp).length === 0) failures.push("case3 FAIL — dropping the settlement ping must go RED.");

  // Mutation 3 — the shared service silently loses the revenue latch.
  write(GOOD_SHARED.replace(/postLoadRevenueLatch\s*\(/g, "noopLatch("), GOOD_ROUTE);
  if (findViolations(tmp).length === 0) failures.push("case4 FAIL — dropping the revenue latch must go RED.");

  // Mutation 4 — a route re-inlines the primitives instead of using the shared service.
  write(
    GOOD_SHARED,
    "const q = `UPDATE mdata.loads SET status = $1`;\nawait postLoadRevenueLatch({});\nawait pingSettlementOnLoadEvent(client, {});\n"
  );
  if (findViolations(tmp).length === 0) failures.push("case5 FAIL — re-inlining the primitives must go RED.");

  // Mutation 5 — shared service deleted entirely.
  write(null, GOOD_ROUTE);
  if (findViolations(tmp).length === 0) failures.push("case6 FAIL — a missing shared service must go RED.");

  // Mutation 6 — the wiring written only in a COMMENT must not read as wiring.
  write(GOOD_SHARED, `// ${SHARED_FN}({ client })\nconst q = \`UPDATE mdata.loads SET status = $1\`;\n`);
  if (findViolations(tmp).length === 0) failures.push("case7 FAIL — wiring written only in a comment must go RED.");

  // Mutation 7 — a file that does NOT write loads.status is not required to call it (no false positive).
  write(GOOD_SHARED, "const q = `SELECT status FROM mdata.loads WHERE id = $1`;\n");
  if (findViolations(tmp).length !== 0) failures.push("case8 FAIL — a non-status-writing file must stay GREEN.");

  write(GOOD_SHARED, GOOD_ROUTE);
  if (findViolations(tmp).length !== 0) failures.push("case9 FAIL — restore must return GREEN.");

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    for (const x of failures) console.error(`${LABEL} ${x}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST PASS — wired GREEN; unwired status write, dropped ping, dropped latch, re-inlined ` +
      `primitives, missing service and comment-only wiring each RED; a read-only loads query stays GREEN; restore GREEN`
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? await selftest() : report(findViolations()));
}
