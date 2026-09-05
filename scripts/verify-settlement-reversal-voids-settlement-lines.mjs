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
 * `voided_at`, `void_reason`, `voided_by_user_id`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-reversal-voids-settlement-lines";

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
    const body = t.extract(src);
    const rel = path.relative(ROOT, t.file);
    if (!body) {
      offenders.push(`${rel}: target function/route body not found`);
      continue;
    }
    if (!/UPDATE\s+driver_finance\.settlement_lines/.test(body)) {
      offenders.push(`${rel}: no cascade UPDATE to settlement_lines found`);
      continue;
    }
    if (!/is_active\s*=\s*false/.test(body)) offenders.push(`${rel}: cascade does not set is_active = false`);
    if (!/voided_at\s*=/.test(body)) offenders.push(`${rel}: cascade does not set voided_at`);
    if (!/void_reason\s*=/.test(body)) offenders.push(`${rel}: cascade does not set void_reason`);
    if (!/voided_by_user_id\s*=/.test(body)) offenders.push(`${rel}: cascade does not set voided_by_user_id`);
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
