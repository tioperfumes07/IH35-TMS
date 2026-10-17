#!/usr/bin/env node
/**
 * verify-settlement-reversal-voids-settlement-lines — SETL-LINES-VOID-GAP.
 *
 * driver_finance.settlement_lines has TWO soft-delete signals: the original `is_active` (its
 * verify-money-line-sums-exclude-voided.mjs-recognized convention) and, since migration
 * 202613490001 (GO-22 void-gap fix), a full voided_at/void_reason/voided_by_user_id register. A
 * settlement can be reversed through TWO code paths — the direct
 * `POST /settlements/:id/reverse` route and the governance `executeDriverSettlement` void/cancel
 * executor — and BOTH must cascade the SAME reversal to the settlement's own settlement_lines rows,
 * stamping BOTH signals, or a settlement reversed through one path leaves its line items reading as
 * still-active/unvoided while the other path's settlement does not.
 *
 * FOUND LIVE 2026-09-05 (CC-1): the governance executor did not touch settlement_lines AT ALL (no
 * is_active write, no voided_at write); the direct route wrote is_active=false but never voided_at/
 * void_reason/voided_by_user_id (dead columns since the day GO-22 added them). Fixed both, same PR.
 *
 * WHAT IT ASSERTS: both `settlements.routes.ts`'s `/reverse` handler and
 * `void-cancel-executors.ts`'s `executeDriverSettlement` contain an `UPDATE
 * driver_finance.settlement_lines` statement that sets `is_active = false` AND all three of
 * `voided_at`, `void_reason`, `voided_by_user_id` -- OR, since Round 35.3's voidDocument()
 * dependency inversion (VOID-DOCUMENT-CALLEES, CC-3, 2026-09-23), delegate to
 * `reverseSettlementForVoid` (driver-finance/void-document-callees.service.ts), the SAME cascade
 * extracted into one shared function both the route and CC-1's future voidDocument() dispatcher
 * call, so it is checked there instead of demanding the SQL sit inline at every call site --
 * still exactly one real implementation, never a silently-removed one.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-reversal-voids-settlement-lines";

const CALLEE_FILE = path.join(ROOT, "apps", "backend", "src", "driver-finance", "void-document-callees.service.ts");
const EXECUTORS_FILE = path.join(ROOT, "apps", "backend", "src", "governance", "void-cancel-executors.ts");
// LEAD 443.192 follow-up: the ONE driver-settlement void cascade, shared by the executor AND reverseSettlementForVoid.
const CASCADE_FILE = path.join(ROOT, "apps", "backend", "src", "driver-finance", "driver-settlement-void-cascade.service.ts");
// LEAD 443.193: the canonical deduction restore (the GL reversal's own unwind), reused for the nothing_to_reverse path.
const RESTORE_FILE = path.join(ROOT, "apps", "backend", "src", "accounting", "settlement-posting", "settlement-posting.service.ts");
const RESTORE_RE = /export async function restoreSettlementDeductionsInClientTx\([\s\S]*?\n\}/;
const ENGINE_FILE = path.join(ROOT, "apps", "backend", "src", "accounting", "cascade-void-engine.service.ts");
const CASCADE_RE = /export async function completeDriverSettlementVoidCascadeInClientTx\([\s\S]*?\n\}/;
function readCascade() {
  // The cascade lived in void-cancel-executors.ts before the 443.192 follow-up moved it to a leaf module — read either.
  for (const f of [CASCADE_FILE, EXECUTORS_FILE]) {
    if (!fs.existsSync(f)) continue;
    const m = fs.readFileSync(f, "utf8").match(CASCADE_RE);
    if (m) return m[0];
  }
  return "";
}

function extractCalleeBody(fnName, src) {
  const re = new RegExp(`export async function ${fnName}\\([\\s\\S]*?\\n\\}`);
  const m = src.match(re);
  return m ? m[0] : null;
}

const TARGETS = [
  {
    file: path.join(ROOT, "apps", "backend", "src", "driver-finance", "settlements.routes.ts"),
    // The route handler body between its path string and the next top-level app. call.
    extract: (src) => {
      const start = src.indexOf('"/api/v1/driver-finance/settlements/:id/reverse"');
      if (start === -1) return null;
      const nextRoute = src.indexOf("\n  app.", start + 10);
      return src.slice(start, nextRoute === -1 ? src.length : nextRoute);
    },
    // Delegation escape hatch: a handler that calls reverseSettlementForVoid is deferring the
    // cascade to that function's own file -- check the real cascade there instead of demanding
    // the SQL sit inline in the route.
    resolveDelegate: (body) => {
      if (!body || !/reverseSettlementForVoid\s*\(/.test(body)) return null;
      if (!fs.existsSync(CALLEE_FILE)) return `${path.relative(ROOT, CALLEE_FILE)}: file missing (delegation target)`;
      const calleeSrc = fs.readFileSync(CALLEE_FILE, "utf8");
      const callee = extractCalleeBody("reverseSettlementForVoid", calleeSrc);
      // 443.192 follow-up: the callee runs the shared cascade instead of an inline lines UPDATE — check that cascade.
      if (callee && !/UPDATE\s+driver_finance\.settlement_lines/.test(callee) && /completeDriverSettlementVoidCascadeInClientTx\s*\(/.test(callee))
        return readCascade() || null;
      return callee;
    },
  },
  {
    file: path.join(ROOT, "apps", "backend", "src", "governance", "void-cancel-executors.ts"),
    extract: (src) => {
      const m = src.match(/const executeDriverSettlement: EntityExecutor = async \(ctx\) => \{[\s\S]*?\n\};/);
      return m ? m[0] : null;
    },
    // LEAD 443.192: the executor runs its line cascade through completeDriverSettlementVoidCascadeInClientTx (same file),
    // the ONE cascade both a fresh void and a header-already-cancelled void go through — check the real cascade there.
    resolveDelegate: (body) => {
      if (!body || !/completeDriverSettlementVoidCascadeInClientTx\s*\(/.test(body)) return null;
      return readCascade() || null;
    },
  },
];

export function check() {
  const offenders = [];
  for (const t of TARGETS) {
    if (!fs.existsSync(t.file)) {
      offenders.push(`${path.relative(ROOT, t.file)}: file missing`);
      continue;
    }
    const src = fs.readFileSync(t.file, "utf8");
    let body = t.extract(src);
    const rel = path.relative(ROOT, t.file);
    if (!body) {
      offenders.push(`${rel}: target function/route body not found`);
      continue;
    }
    let checkedLabel = rel;
    if (t.resolveDelegate && !/UPDATE\s+driver_finance\.settlement_lines/.test(body)) {
      const delegate = t.resolveDelegate(body);
      if (typeof delegate === "string" && delegate.includes(": file missing")) {
        offenders.push(delegate);
        continue;
      }
      if (delegate) {
        body = delegate;
        checkedLabel = `${rel} (via its delegated cascade function)`;
      }
    }
    if (!/UPDATE\s+driver_finance\.settlement_lines/.test(body)) {
      offenders.push(`${checkedLabel}: no cascade UPDATE to settlement_lines found`);
      continue;
    }
    if (!/is_active\s*=\s*false/.test(body)) offenders.push(`${checkedLabel}: cascade does not set is_active = false`);
    if (!/voided_at\s*=/.test(body)) offenders.push(`${checkedLabel}: cascade does not set voided_at`);
    if (!/void_reason\s*=/.test(body)) offenders.push(`${checkedLabel}: cascade does not set void_reason`);
    if (!/voided_by_user_id\s*=/.test(body)) offenders.push(`${checkedLabel}: cascade does not set voided_by_user_id`);
  }
  offenders.push(...cancelledHeaderOffenders());
  return offenders;
}

/**
 * LEAD 443.192 (12:35Z — the "443.167 regroup" cancels): an ALREADY-cancelled settlement header must still get the cascade
 * (lines voided, open bills released) and a void audit. Measured: 24 settlements cancelled by a raw UPDATE outside the engine
 * kept 10 live lines + 1 linked bill and no audit, and executeDriverSettlement's `if (status === "cancelled") return
 * { kind: "already_done" }` made the engine unable to finish them.
 */
export function cancelledHeaderOffenders(src = null) {
  const file = TARGETS[1].file;
  const text = src ?? (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
  const exec = text.match(/const executeDriverSettlement: EntityExecutor = async[\s\S]*?\n\};/)?.[0] ?? "";
  const out = [];
  if (/if \(status === "cancelled"\) return \{ kind: "already_done" \};/.test(exec))
    out.push(`${path.relative(ROOT, file)}: executeDriverSettlement returns already_done for a cancelled header before the line cascade + audit`);
  const cascadeAt = exec.indexOf("completeDriverSettlementVoidCascadeInClientTx(");
  const cancelledAt = exec.indexOf('if (status === "cancelled") {');
  if (cascadeAt < 0 || cancelledAt < 0 || cascadeAt > cancelledAt)
    out.push(`${path.relative(ROOT, file)}: a cancelled header must run completeDriverSettlementVoidCascadeInClientTx before its already-done check`);
  if (!/header_already_cancelled: true/.test(exec)) out.push(`${path.relative(ROOT, file)}: finishing a cancelled header must write the void audit`);
  out.push(...reimbursementReleaseOffenders(text, src === null ? readCascade() : (text.match(CASCADE_RE)?.[0] ?? readCascade())));
  if (src === null) out.push(...calleeReleaseOffenders());
  // LEAD 443.193: no deduction is ever voided by a settlement void; nothing_to_reverse releases them (both paths).
  if (src === null) out.push(...deductionReleaseOffenders());
  return out;
}

/**
 * LEAD 443.192 13:25Z item 3: the void/cancel cascade must release reimbursements like it releases bills. Measured: 8 unpaid
 * USMCA reimbursements stayed status='settled' / applied_to_settlement_id on cancelled P-0085/0090/0091/0092 because
 * completeDriverSettlementVoidCascadeInClientTx never touched driver_reimbursements. Requires: an UPDATE of
 * driver_reimbursements inside the cascade that clears applied_to_settlement_id + settlement_line_id, puts 'settled' back to
 * 'pending', excludes paid (paid_at IS NULL) and voided rows, returns the ids; the executor counts the release as a write
 * (so an already-audited cancelled header is not already_done) and names the ids in its void audit.
 */
export function reimbursementReleaseOffenders(text, cascade) {
  const rel = path.relative(ROOT, TARGETS[1].file);
  const exec = text.match(/const executeDriverSettlement: EntityExecutor = async[\s\S]*?\n\};/)?.[0] ?? "";
  const out = [];
  const upd = cascade.match(/UPDATE\s+driver_finance\.driver_reimbursements\b[\s\S]*?RETURNING[^`]*`/)?.[0] ?? "";
  if (!upd) {
    out.push(`${rel}: completeDriverSettlementVoidCascadeInClientTx does not release driver_reimbursements settled against the voided settlement`);
    return out;
  }
  const bills = cascade.match(/UPDATE\s+driver_finance\.driver_bills\b[\s\S]*?RETURNING[^`]*`/)?.[0] ?? "";
  if (!bills || !/settled_in_settlement_id\s*=\s*NULL/.test(bills) || !/status\s*=\s*'open'/.test(bills))
    out.push(`${rel}: the cascade must release OPEN driver bills from the voided settlement (settled_in_settlement_id = NULL, status = 'open' only)`);
  if (!/applied_to_settlement_id\s*=\s*NULL/.test(upd)) out.push(`${rel}: reimbursement release does not clear applied_to_settlement_id`);
  if (!/settlement_line_id\s*=\s*NULL/.test(upd)) out.push(`${rel}: reimbursement release does not clear settlement_line_id`);
  if (!/'settled'\s+THEN\s+'pending'/.test(upd)) out.push(`${rel}: reimbursement release does not return 'settled' to 'pending'`);
  if (!/paid_at\s+IS\s+NULL/.test(upd)) out.push(`${rel}: reimbursement release must exclude paid rows (paid_at IS NULL)`);
  if (!/voided_at\s+IS\s+NULL/.test(upd)) out.push(`${rel}: reimbursement release must exclude voided rows (voided_at IS NULL)`);
  if (!/reimbursements_released\.length\s*>\s*0/.test(exec))
    out.push(`${rel}: executeDriverSettlement must count released reimbursements as a write (else an audited cancelled header is already_done)`);
  if ((exec.match(/reimbursements_released:\s*cascade\.reimbursements_released/g) ?? []).length < 2)
    out.push(`${rel}: both void audits (cancelled header + fresh void) must name the released reimbursements`);
  return out;
}

/**
 * LEAD 443.192 (13:25Z follow-up): the OTHER settlement-void path — reverseSettlementForVoid (Settlement Creator
 * "Edit = void and repost" + POST /settlements/:id/reverse) — voided lines but left open bills + unpaid reimbursements
 * linked to the cancelled settlement (measured: P-0085, P-0092). It must run the SAME cascade, before the header flip,
 * must not raw-void deductions (voidChildren: false — owner-ruled deduction engine only), and its reversed audit must
 * name the released bills + reimbursements.
 */
export function calleeReleaseOffenders(calleeText = null) {
  const rel = path.relative(ROOT, CALLEE_FILE);
  const text = calleeText ?? (fs.existsSync(CALLEE_FILE) ? fs.readFileSync(CALLEE_FILE, "utf8") : "");
  const body = extractCalleeBody("reverseSettlementForVoid", text) ?? "";
  const out = [];
  const callAt = body.indexOf("completeDriverSettlementVoidCascadeInClientTx(");
  const flipAt = body.search(/UPDATE driver_finance\.driver_settlements\s+SET status = 'cancelled'/);
  if (callAt < 0) {
    out.push(`${rel}: reverseSettlementForVoid does not run completeDriverSettlementVoidCascadeInClientTx (open bills + unpaid reimbursements stay linked to the cancelled settlement)`);
    return out;
  }
  if (flipAt >= 0 && callAt > flipAt) out.push(`${rel}: reverseSettlementForVoid must run the cascade BEFORE the header flips to cancelled`);
  if (/UPDATE\s+driver_finance\.settlement_lines/.test(body)) out.push(`${rel}: reverseSettlementForVoid still voids lines inline AND via the cascade (applied twice)`);
  const callArgs = body.slice(callAt).match(/^completeDriverSettlementVoidCascadeInClientTx\([\s\S]*?\}\)/)?.[0] ?? "";
  if (!/voidChildren:\s*false/.test(callArgs)) out.push(`${rel}: reverseSettlementForVoid must pass voidChildren: false (deductions go only through the owner-ruled deduction engine)`);
  if (!/driver_bills_released:\s*cascade\.driver_bills_released/.test(body)) out.push(`${rel}: the reversed audit must name the released driver bills`);
  if (!/reimbursements_released:\s*cascade\.reimbursements_released/.test(body)) out.push(`${rel}: the reversed audit must name the released reimbursements`);
  return out;
}

/**
 * LEAD 443.193 (Lead 14:05Z (b) + follow-up): a settlement void NEVER voids a deduction, on EITHER path.
 *  - Before: executeVoidCancel('driver_settlement') ran cascadeVoidChildren with driver_settlement_deductions registered as a
 *    voided_at child (a raw stamp forgave an applied-but-uncollected deduction — 0 such rows on prod 2026-10-17), and
 *    reverseSettlementForVoid on nothing_to_reverse left them linked to the cancelled settlement (0 rows today).
 *  - Requires: CASCADE_CHILDREN.driver_settlement has no driver_settlement_deductions entry; the shared cascade releases them
 *    through restoreSettlementDeductionsInClientTx(..., { glPosted: false }) only when glReversalResult is
 *    nothing_to_reverse (a reversed run already restored them); BOTH callers pass glReversalResult: reversal.result and name
 *    deductions_released in every void / reversed audit; the executor counts a release as a write (else an audited cancelled
 *    header is already_done); the restore's never-posted mode releases only plain pending + unvoided rows, never stamps
 *    voided_at, and credits a bucket back only for an application the bucket ledger recorded.
 */
const DRIVER_SETTLEMENT_CHILDREN_RE = /driver_settlement:\s*\[[\s\S]*?\n  \],/;
const readOr = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");
export function deductionReleaseOffenders(srcs = {}) {
  const calleeText = srcs.callee ?? readOr(CALLEE_FILE);
  const execText = srcs.exec ?? readOr(EXECUTORS_FILE);
  const cascade = srcs.cascade ?? readCascade();
  const engine = srcs.engine ?? readOr(ENGINE_FILE);
  const restoreText = srcs.restore ?? readOr(RESTORE_FILE);
  const out = [];
  const R = (f) => path.relative(ROOT, f);

  const children = engine.match(DRIVER_SETTLEMENT_CHILDREN_RE)?.[0] ?? "";
  if (!children) out.push(`${R(ENGINE_FILE)}: CASCADE_CHILDREN.driver_settlement not found`);
  else if (/table:\s*"driver_settlement_deductions"/.test(children))
    out.push(`${R(ENGINE_FILE)}: CASCADE_CHILDREN.driver_settlement registers driver_settlement_deductions — a settlement void would raw-stamp voided_at and forgive the driver's debt`);

  const callAt = cascade.search(/restoreSettlementDeductionsInClientTx\(/);
  if (callAt < 0) {
    out.push(`${R(CASCADE_FILE)}: the settlement void cascade does not release deductions on nothing_to_reverse (restoreSettlementDeductionsInClientTx)`);
  } else {
    const call = cascade.slice(callAt).match(/^restoreSettlementDeductionsInClientTx\([\s\S]*?\}\s*\)/)?.[0] ?? "";
    if (!/glPosted:\s*false/.test(call)) out.push(`${R(CASCADE_FILE)}: the deduction release must use the restore's never-posted mode (glPosted: false)`);
    if (!/glReversalResult\s*===\s*"nothing_to_reverse"/.test(cascade.slice(Math.max(0, callAt - 200), callAt)))
      out.push(`${R(CASCADE_FILE)}: the deduction release must run only when the GL reversal returned nothing_to_reverse (a reversed run already restored them)`);
  }
  if (!/deductions_released:\s*deductionRelease/.test(cascade)) out.push(`${R(CASCADE_FILE)}: the cascade must return the released deduction ids`);

  const calleeBody = extractCalleeBody("reverseSettlementForVoid", calleeText) ?? "";
  const calleeCall = calleeBody.slice(Math.max(0, calleeBody.indexOf("completeDriverSettlementVoidCascadeInClientTx("))).match(/^completeDriverSettlementVoidCascadeInClientTx\([\s\S]*?\}\)/)?.[0] ?? "";
  if (!/glReversalResult:\s*reversal\.result/.test(calleeCall)) out.push(`${R(CALLEE_FILE)}: reverseSettlementForVoid must pass glReversalResult: reversal.result to the cascade`);
  if (!/deductions_released:\s*cascade\.deductions_released/.test(calleeBody)) out.push(`${R(CALLEE_FILE)}: the reversed audit must name the released deduction ids`);

  const exec = execText.match(/const executeDriverSettlement: EntityExecutor = async[\s\S]*?\n\};/)?.[0] ?? "";
  const execCall = exec.slice(Math.max(0, exec.indexOf("completeDriverSettlementVoidCascadeInClientTx("))).match(/^completeDriverSettlementVoidCascadeInClientTx\([\s\S]*?\}\)/)?.[0] ?? "";
  if (!/glReversalResult:\s*reversal\.result/.test(execCall)) out.push(`${R(EXECUTORS_FILE)}: executeDriverSettlement must pass glReversalResult: reversal.result to the cascade`);
  if (!/deductions_released\.length\s*>\s*0/.test(exec))
    out.push(`${R(EXECUTORS_FILE)}: executeDriverSettlement must count released deductions as a write (else an audited cancelled header is already_done)`);
  if ((exec.match(/deductions_released:\s*cascade\.deductions_released/g) ?? []).length < 2)
    out.push(`${R(EXECUTORS_FILE)}: both void audits (cancelled header + fresh void) must name the released deductions`);

  const restore = restoreText.match(RESTORE_RE)?.[0] ?? "";
  if (!restore) {
    out.push(`${R(RESTORE_FILE)}: restoreSettlementDeductionsInClientTx not found`);
    return out;
  }
  if (!/glPosted\?:\s*boolean/.test(restore)) out.push(`${R(RESTORE_FILE)}: restoreSettlementDeductionsInClientTx has no never-posted mode (glPosted option)`);
  if (!/d\.status\s*===\s*"pending"\s*&&\s*!d\.is_voided/.test(restore))
    out.push(`${R(RESTORE_FILE)}: the never-posted restore must release only plain pending, unvoided deductions (never a collected / voided one)`);
  const upd = restore.match(/UPDATE\s+driver_finance\.driver_settlement_deductions\b[\s\S]*?RETURNING[^`]*`/)?.[0] ?? "";
  if (!upd || /voided_at/.test(upd) || !/applied_to_settlement_id\s*=\s*NULL/.test(upd) || !/status\s*=\s*'pending'/.test(upd))
    out.push(`${R(RESTORE_FILE)}: the restore must clear the link and return the deduction to 'pending' — never void / forgive it`);
  if (!/'application'/.test(restore) || !/driver_deduction_bucket_events/.test(restore))
    out.push(`${R(RESTORE_FILE)}: the never-posted restore must credit a bucket back only for an application the bucket ledger recorded`);
  return out;
}

function report(offenders) {
  if (!offenders.length) {
    console.log(`${LABEL} OK — both settlement-reversal paths cascade is_active + the full void register to settlement_lines`);
    return 0;
  }
  console.error(`${LABEL} FAIL:`);
  for (const o of offenders) console.error(`  - ${o}`);
  return 1;
}

async function selftest() {
  const os = await import("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "settl-lines-void-"));
  const routeFile = path.join(tmp, "settlements.routes.ts");
  const execFile = path.join(tmp, "void-cancel-executors.ts");
  const failures = [];

  const goodRoute = `app.post(\n"/api/v1/driver-finance/settlements/:id/reverse",\nasync (req, reply) => {\nawait client.query(\`UPDATE driver_finance.settlement_lines SET is_active = false, voided_at = COALESCE(voided_at, now()), void_reason = COALESCE(void_reason, $3), voided_by_user_id = COALESCE(voided_by_user_id, $4::uuid) WHERE settlement_id = $1\`);\n}\n);\napp.post("/next", async () => {});`;
  const goodExec = `const executeDriverSettlement: EntityExecutor = async (ctx) => {\nawait client.query(\`UPDATE driver_finance.settlement_lines SET is_active = false, voided_at = COALESCE(voided_at, now()), void_reason = COALESCE(void_reason, $3), voided_by_user_id = COALESCE(voided_by_user_id, $4::uuid)\`);\n};`;
  fs.writeFileSync(routeFile, goodRoute);
  fs.writeFileSync(execFile, goodExec);
  const routeBody = TARGETS[0].extract(fs.readFileSync(routeFile, "utf8"));
  const execBody = TARGETS[1].extract(fs.readFileSync(execFile, "utf8"));
  if (!routeBody || !/is_active\s*=\s*false/.test(routeBody) || !/voided_at\s*=/.test(routeBody)) {
    failures.push("case1 FAIL — well-formed route fixture must extract and pass.");
  }
  if (!execBody || !/is_active\s*=\s*false/.test(execBody) || !/voided_by_user_id\s*=/.test(execBody)) {
    failures.push("case2 FAIL — well-formed executor fixture must extract and pass.");
  }

  const badExec = `const executeDriverSettlement: EntityExecutor = async (ctx) => {\nawait client.query("SELECT 1");\n};`;
  fs.writeFileSync(execFile, badExec);
  const badExecBody = TARGETS[1].extract(fs.readFileSync(execFile, "utf8"));
  if (badExecBody && /UPDATE\s+driver_finance\.settlement_lines/.test(badExecBody)) {
    failures.push("case3 FAIL — a fixture with no cascade must not appear to have one.");
  }

  // case4 (RED then GREEN): a route body with NO inline cascade but that calls
  // reverseSettlementForVoid must delegate to the REAL callee file (not vacuously pass because
  // the inline check alone failed) -- proven against the real repo, since resolveDelegate reads
  // the real CALLEE_FILE by design (the whole point is checking the real shared implementation).
  const delegatingRoute = `app.post(\n"/api/v1/driver-finance/settlements/:id/reverse",\nasync (req, reply) => {\nawait reverseSettlementForVoid(client, { operatingCompanyId, settlementId, reason, actor });\n}\n);`;
  const delegatingBody = TARGETS[0].extract(delegatingRoute);
  if (!delegatingBody || /UPDATE\s+driver_finance\.settlement_lines/.test(delegatingBody)) {
    failures.push("case4 setup FAIL — delegating fixture must NOT itself contain the inline cascade (that's the point).");
  }
  const resolved = TARGETS[0].resolveDelegate(delegatingBody);
  if (!resolved || !/is_active\s*=\s*false/.test(resolved) || !/voided_at\s*=/.test(resolved)) {
    failures.push("case4 FAIL — a route that delegates to reverseSettlementForVoid must resolve to that function's real cascade, not report missing.");
  }
  const nonDelegatingBody = TARGETS[0].extract(goodRoute);
  if (TARGETS[0].resolveDelegate(nonDelegatingBody) !== null) {
    failures.push("case5 FAIL — a route that already has its own inline cascade must not be redirected to the delegate.");
  }

  // case6 (443.192): the cancelled-header short-circuit is caught; the real executor is clean.
  const realExec = fs.readFileSync(TARGETS[1].file, "utf8");
  if (cancelledHeaderOffenders(realExec).length) failures.push("case6 FAIL — the real executor must be clean");
  if (!cancelledHeaderOffenders(realExec.replace('if (status === "cancelled") {', 'if (status === "cancelled") return { kind: "already_done" };\n  if (false) {')).length)
    failures.push("case6 FAIL — an already_done short-circuit for a cancelled header went undetected");

  // case7 (443.192 13:25Z): the reimbursement release is required; each plant must go RED.
  const realCascade = readCascade();
  if (reimbursementReleaseOffenders(realExec, realCascade).length) failures.push("case7 FAIL — the real executor must release reimbursements");
  const plants = [
    ["no reimbursement UPDATE", realExec, realCascade.replace(/UPDATE driver_finance\.driver_reimbursements/, "UPDATE driver_finance.driver_reimbursements_x")],
    ["paid rows not excluded", realExec, realCascade.replace(/AND r\.paid_at IS NULL\n/, "")],
    ["applied link kept", realExec, realCascade.replace(/applied_to_settlement_id = NULL,/, "applied_to_settlement_id = applied_to_settlement_id,")],
    ["open bills not released", realExec, realCascade.replace(/SET settled_in_settlement_id = NULL/, "SET updated_at = now()")],
    ["release not counted as a write", realExec.replace(/cascade\.reimbursements_released\.length > 0 \|\| /, ""), realCascade],
    ["audit omits released ids", realExec.replace(/\n\s*reimbursements_released: cascade\.reimbursements_released,/, ""), realCascade],
  ];
  for (const [name, e, c] of plants) {
    if (e === realExec && c === realCascade) failures.push(`case7 setup FAIL — plant '${name}' did not change the source`);
    else if (!reimbursementReleaseOffenders(e, c).length) failures.push(`case7 FAIL — plant '${name}' went undetected`);
  }

  // case8 (443.192 follow-up): reverseSettlementForVoid must run the shared cascade; each plant must go RED.
  const realCallee = fs.readFileSync(CALLEE_FILE, "utf8");
  if (calleeReleaseOffenders(realCallee).length) failures.push(`case8 FAIL — the real callee must be clean: ${calleeReleaseOffenders(realCallee).join("; ")}`);
  const calleePlants = [
    ["cascade call removed", realCallee.replace(/completeDriverSettlementVoidCascadeInClientTx\(client, \{/, "noCascade(client, {")],
    ["deductions raw-voided", realCallee.replace(/voidChildren: false/, "voidChildren: true")],
    ["audit omits reimbursements", realCallee.replace(/\n\s*reimbursements_released: cascade\.reimbursements_released,/, "")],
    ["audit omits bills", realCallee.replace(/\n\s*driver_bills_released: cascade\.driver_bills_released,/, "")],
    ["lines voided twice", realCallee.replace(/const cascade = await/, "await client.query(`UPDATE driver_finance.settlement_lines SET is_active = false`);\n  const cascade = await")],
  ];
  for (const [name, planted] of calleePlants) {
    if (planted === realCallee) failures.push(`case8 setup FAIL — plant '${name}' did not change the source`);
    else if (!calleeReleaseOffenders(planted).length) failures.push(`case8 FAIL — plant '${name}' went undetected`);
  }

  // case9 (443.193): a settlement void never voids a deduction; nothing_to_reverse releases them via the canonical restore.
  const real = { callee: realCallee, exec: realExec, cascade: realCascade, engine: fs.readFileSync(ENGINE_FILE, "utf8"), restore: fs.readFileSync(RESTORE_FILE, "utf8") };
  if (deductionReleaseOffenders(real).length) failures.push(`case9 FAIL — the real sources must be clean: ${deductionReleaseOffenders(real).join("; ")}`);
  const dedPlants = [
    ["deductions re-registered as a settlement void child", { engine: real.engine.replace(/(\{ schema: "driver_finance", table: "escrow_ledger")/, '{ schema: "driver_finance", table: "driver_settlement_deductions", fkColumn: "applied_to_settlement_id", livenessColumn: "voided_at", writeKind: "timestamp" },\n    $1') }],
    ["cascade release call removed", { cascade: real.cascade.replace(/restoreSettlementDeductionsInClientTx\(/, "noRestore(") }],
    ["full (GL) mode on an unposted settlement", { cascade: real.cascade.replace(/glPosted: false/, "glPosted: true") }],
    ["release not gated on nothing_to_reverse", { cascade: real.cascade.replace(/input\.glReversalResult === "nothing_to_reverse"/, "true") }],
    ["executor does not pass the GL result", { exec: real.exec.replace(/\n\s*glReversalResult: reversal\.result,/, "") }],
    ["callee does not pass the GL result", { callee: real.callee.replace(/\n\s*glReversalResult: reversal\.result,/, "") }],
    ["executor release not counted as a write", { exec: real.exec.replace(/ \|\| cascade\.deductions_released\.length > 0/, "") }],
    ["executor audit omits released deductions", { exec: real.exec.replace(/\n\s*deductions_released: cascade\.deductions_released,/, "") }],
    ["callee audit omits released deductions", { callee: real.callee.replace(/\n\s*deductions_released: cascade\.deductions_released,/, "") }],
    ["collected deductions released", { restore: real.restore.replace(/d\.status === "pending" && !d\.is_voided/, "!d.is_voided") }],
    ["deduction voided instead of released", { restore: real.restore.replace(/SET applied_to_settlement_id = NULL,/, "SET applied_to_settlement_id = NULL, voided_at = now(),") }],
    ["bucket credited without a recorded draw", { restore: real.restore.replace(/'application'/g, "'charge'") }],
  ];
  for (const [name, patch] of dedPlants) {
    const k = Object.keys(patch)[0];
    if (patch[k] === real[k]) failures.push(`case9 setup FAIL — plant '${name}' did not change the source`);
    else if (!deductionReleaseOffenders({ ...real, ...patch }).length) failures.push(`case9 FAIL — plant '${name}' went undetected`);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    for (const x of failures) console.error(`${LABEL} ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — well-formed fixtures extract correctly, missing-cascade fixture correctly has none`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? await selftest() : report(check()));
}
