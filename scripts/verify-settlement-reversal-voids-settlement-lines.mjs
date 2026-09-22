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
      return extractCalleeBody("reverseSettlementForVoid", calleeSrc);
    },
  },
  {
    file: path.join(ROOT, "apps", "backend", "src", "governance", "void-cancel-executors.ts"),
    extract: (src) => {
      const m = src.match(/const executeDriverSettlement: EntityExecutor = async \(ctx\) => \{[\s\S]*?\n\};/);
      return m ? m[0] : null;
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
        checkedLabel = `${rel} (delegates to reverseSettlementForVoid in ${path.relative(ROOT, CALLEE_FILE)})`;
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
  return offenders;
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
