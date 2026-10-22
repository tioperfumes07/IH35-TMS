#!/usr/bin/env node
/**
 * verify-driver-bills-void-cascade-stamps-register — ACCT-SETL-BILL-VOID-GAP.
 *
 * driver_finance.driver_bills has carried a full void register (voided_at/void_reason/
 * voided_by_user_id/void_reversal_entry_id) since GO-22 (migration 202613490001), but the ONLY
 * place in the codebase that ever sets `status = 'void'` on this table — the VOID-CASCADE-
 * DRIVER-BILLS block inside the load-cancellation cascade, dispatch/cancellation.service.ts —
 * predates GO-22 and, until this fix, never wrote the newer columns.
 *
 * WHAT IT ASSERTS: the driver_bills UPDATE inside cancellation.service.ts's load-cancel cascade
 * sets status='void' together with voided_at/void_reason/voided_by_user_id, all COALESCE-guarded
 * so a row already voided by some other path is never clobbered.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-bills-void-cascade-stamps-register";
const TARGET = path.join(ROOT, "apps", "backend", "src", "dispatch", "cancellation.service.ts");
// 443.213 / 443.220: the cascade voids through the ONE driver-bill void writer (stampDriverBillVoidedInClientTx); the guard
// follows the call into that writer and checks the same register stamps there.
const WRITER = path.join(ROOT, "apps", "backend", "src", "driver-finance", "driver-bill-void-state.service.ts");

export function check(targetPath = TARGET, writerPath = WRITER) {
  if (!fs.existsSync(targetPath)) return [`missing: ${path.relative(ROOT, targetPath)}`];
  const src = fs.readFileSync(targetPath, "utf8");
  const offenders = [];

  // The cascade's own UPDATE ... SET status = 'void' (pre-443.213 shape), or a call to the one void writer, whose UPDATE is checked.
  let m = src.match(/UPDATE\s+driver_finance\.driver_bills\s+SET\s+status\s*=\s*'void'[\s\S]{0,400}?WHERE[\s\S]{0,200}?status\s*<>\s*'void'`/);
  if (!m && /await stampDriverBillVoidedInClientTx\(client,/.test(src) && /import \{[^}]*stampDriverBillVoidedInClientTx[^}]*\} from "\.\.\/driver-finance\/driver-bill-void-state\.service\.js"/.test(src)) {
    const writer = fs.existsSync(writerPath) ? fs.readFileSync(writerPath, "utf8") : "";
    m = writer.match(/UPDATE\s+driver_finance\.driver_bills\s+SET\s+status\s*=\s*'void'[\s\S]{0,400}?WHERE[\s\S]{0,300}?RETURNING/);
  }
  if (!m) {
    offenders.push("driver_bills status='void' UPDATE not found (or its shape changed enough that this guard can't locate it — update the guard, don't just delete it)");
    return offenders;
  }
  const stmt = m[0];
  if (!/voided_at\s*=\s*COALESCE\(voided_at,\s*now\(\)\)/.test(stmt)) offenders.push("driver_bills void cascade does not stamp voided_at (COALESCE-guarded)");
  if (!/void_reason\s*=\s*COALESCE\(void_reason,\s*\$/.test(stmt)) offenders.push("driver_bills void cascade does not stamp void_reason (COALESCE-guarded)");
  if (!/voided_by_user_id\s*=\s*COALESCE\(voided_by_user_id,\s*\$\d::uuid\)/.test(stmt)) offenders.push("driver_bills void cascade does not stamp voided_by_user_id (COALESCE-guarded)");

  return offenders;
}

function report(offenders) {
  if (!offenders.length) {
    console.log(`${LABEL} OK — the load-cancellation driver_bills void cascade stamps voided_at/void_reason/voided_by_user_id alongside status='void'`);
    return 0;
  }
  console.error(`${LABEL} FAIL:`);
  for (const o of offenders) console.error(`  - ${o}`);
  return 1;
}

async function selftest() {
  const os = await import("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bill-void-"));
  const f = path.join(tmp, "cancellation.service.ts");
  const failures = [];

  const good = "await client.query(\n  `UPDATE driver_finance.driver_bills\n      SET status = 'void',\n          voided_at = COALESCE(voided_at, now()),\n          void_reason = COALESCE(void_reason, $3),\n          voided_by_user_id = COALESCE(voided_by_user_id, $4::uuid),\n          updated_at = now()\n    WHERE id = $1::uuid\n      AND operating_company_id = $2::uuid\n      AND status <> 'void'`,\n  []\n);";
  fs.writeFileSync(f, good);
  if (check(f).length !== 0) failures.push(`case1 FAIL — well-formed fixture must be GREEN, got: ${check(f).join("; ")}`);

  const bad = "await client.query(\n  `UPDATE driver_finance.driver_bills\n      SET status = 'void',\n          updated_at = now()\n    WHERE id = $1::uuid\n      AND operating_company_id = $2::uuid\n      AND status <> 'void'`,\n  []\n);";
  fs.writeFileSync(f, bad);
  if (check(f).length !== 3) failures.push(`case2 FAIL — missing all 3 register columns must flag all 3, got: ${check(f).join("; ")}`);

  // 443.213 shape: the cascade calls the one void writer — the writer's UPDATE must carry the stamps
  const w = path.join(tmp, "driver-bill-void-state.service.ts");
  const call = 'import { stampDriverBillVoidedInClientTx } from "../driver-finance/driver-bill-void-state.service.js";\nawait stampDriverBillVoidedInClientTx(client, { driverBillId: bill.id });';
  fs.writeFileSync(f, call);
  fs.writeFileSync(w, "const r = await client.query(\n  `UPDATE driver_finance.driver_bills\n      SET status = 'void', voided_at = COALESCE(voided_at, now()),\n          void_reason = COALESCE(void_reason, $3),\n          voided_by_user_id = COALESCE(voided_by_user_id, $4::uuid), updated_at = now()\n    WHERE id = $1::uuid AND operating_company_id = $2::uuid\n    RETURNING id::text`);");
  if (check(f, w).length !== 0) failures.push(`case3 FAIL — cascade through the one writer with stamps must be GREEN, got: ${check(f, w).join("; ")}`);
  fs.writeFileSync(w, "const r = await client.query(\n  `UPDATE driver_finance.driver_bills\n      SET status = 'void', updated_at = now()\n    WHERE id = $1::uuid AND operating_company_id = $2::uuid\n    RETURNING id::text`);");
  if (check(f, w).length !== 3) failures.push(`case4 FAIL — a writer without the register stamps must flag all 3, got: ${check(f, w).join("; ")}`);
  fs.writeFileSync(f, "await somethingElse(client, { driverBillId: bill.id });");
  if (check(f, w).length !== 1) failures.push(`case5 FAIL — a cascade that neither updates nor calls the writer must fail, got: ${check(f, w).join("; ")}`);

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    for (const x of failures) console.error(`${LABEL} ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — well-formed cascade GREEN, register-less cascade RED (all 3 columns flagged); through the one writer: stamped GREEN, unstamped RED, no writer RED`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? await selftest() : report(check()));
}
