#!/usr/bin/env node
/**
 * verify-settlement-deduction-void-branches — ACCT-SETL-DEDUCTION-VOID-DESIGN / ACCT-F5861.
 *
 * Owner ruling (docs/bus/OUTBOX-CURSOR.md, CURSOR -> CC-1): driver_settlement_deductions void is ONE
 * route, THREE branches keyed off status. "Void is a reversal, never a delete."
 *
 *   PENDING (nothing collected)  -> void the row (voided_at/void_reason/voided_by), no money moved.
 *   PARTIAL (some collected)     -> NEVER touch the collected portion; void/close only the
 *                                   uncollected REMAINING schedule going forward.
 *   APPLIED (fully collected)    -> NOT a void — a reversing JE that credits the driver back.
 *
 * WHAT IT ASSERTS, statically against apps/backend/src/driver-finance/settlement-deduction-void.service.ts:
 *   - a 'pending' branch stamps the void register and does NOT call createJournalEntryOnClient
 *   - a 'partial' branch zeroes remaining_balance_cents (stops future collection) while amount_cents
 *     itself is never assigned to (the historical collected amount is untouched), and the branch
 *     records how much was already collected in the reason text
 *   - an 'applied' branch DOES call createJournalEntryOnClient (a real reversing JE, never a silent
 *     void) and stamps void_reversal_entry_id with the posted JE's id
 *   - an unrecognized status is refused (fails closed) rather than silently falling through to one
 *     of the three named branches
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-deduction-void-branches";
const TARGET = path.join(ROOT, "apps", "backend", "src", "driver-finance", "settlement-deduction-void.service.ts");

function branchBody(src, statusLiteral) {
  const marker = `d.status === "${statusLiteral}"`;
  const idx = src.indexOf(marker);
  if (idx === -1) return null;
  const ifStart = src.indexOf("{", idx);
  if (ifStart === -1) return null;
  // Balance braces from the if-block open to its matching close.
  let depth = 0;
  for (let i = ifStart; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(ifStart, i + 1);
    }
  }
  return null;
}

export function check(targetPath = TARGET) {
  const offenders = [];
  if (!fs.existsSync(targetPath)) return [`missing: ${path.relative(ROOT, targetPath)}`];
  const src = fs.readFileSync(targetPath, "utf8");

  const pending = branchBody(src, "pending");
  if (!pending) {
    offenders.push("no PENDING branch found (expected d.status === \"pending\")");
  } else {
    if (!/voided_at\s*=\s*now\(\)/.test(pending)) offenders.push("PENDING branch does not stamp voided_at");
    if (!/void_reason\s*=\s*\$2/.test(pending)) offenders.push("PENDING branch does not stamp void_reason");
    if (!/voided_by_user_id\s*=\s*\$3::uuid/.test(pending)) offenders.push("PENDING branch does not stamp voided_by_user_id");
    if (/createJournalEntryOnClient/.test(pending)) offenders.push("PENDING branch must never post a JE — money never moved for a pending deduction");
  }

  const partial = branchBody(src, "partial");
  if (!partial) {
    offenders.push("no PARTIAL branch found (expected d.status === \"partial\")");
  } else {
    if (!/remaining_balance_cents\s*=\s*0/.test(partial)) offenders.push("PARTIAL branch does not zero remaining_balance_cents (stop future collection)");
    if (/\bamount_cents\s*=/.test(partial)) offenders.push("PARTIAL branch must never assign amount_cents — the historical collected amount is untouched");
    if (!/already collected retained/.test(partial)) offenders.push("PARTIAL branch does not record how much was already collected in the reason text");
    if (/createJournalEntryOnClient/.test(partial)) offenders.push("PARTIAL branch must never post a JE — only the uncollected remainder is voided, not a reversal");
  }

  const applied = branchBody(src, "applied");
  if (!applied) {
    offenders.push("no APPLIED branch found (expected d.status === \"applied\")");
  } else {
    if (!/createJournalEntryOnClient/.test(applied)) offenders.push("APPLIED branch does not post a reversing JE — an applied (fully collected) deduction must never be a silent void");
    if (!/void_reversal_entry_id\s*=\s*\$4::uuid/.test(applied)) offenders.push("APPLIED branch does not stamp void_reversal_entry_id with the posted JE's id");
  }

  if (!/deduction_status_not_voidable/.test(src)) {
    offenders.push("no fail-closed refusal for an unrecognized status — a 4th/future status must never silently fall through to one of the three named branches");
  }

  return offenders;
}

function report(offenders) {
  if (!offenders.length) {
    console.log(`${LABEL} OK — driver_settlement_deductions void has exactly the 3 owner-ruled branches (pending/partial/applied) with the correct money treatment in each, plus a fail-closed refusal for anything else`);
    return 0;
  }
  console.error(`${LABEL} FAIL:`);
  for (const o of offenders) console.error(`  - ${o}`);
  return 1;
}

async function selftest() {
  const os = await import("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dedvoid-branches-"));
  const f = path.join(tmp, "settlement-deduction-void.service.ts");
  const failures = [];

  const real = fs.readFileSync(TARGET, "utf8");
  fs.writeFileSync(f, real);
  if (check(f).length !== 0) failures.push(`case1 FAIL — the real file must be GREEN, got: ${check(f).join("; ")}`);

  // Plant: PENDING branch also posts a JE — must be caught.
  const badPending = real.replace(
    'if (d.status === "pending") {',
    'if (d.status === "pending") { await createJournalEntryOnClient(client, {}, {});'
  );
  fs.writeFileSync(f, badPending);
  if (!check(f).some((o) => /PENDING branch must never post a JE/.test(o))) failures.push("case2 FAIL — JE in the pending branch must be caught.");

  // Plant: APPLIED branch never posts a JE (turned into a silent void) — must be caught.
  const badApplied = real.replace(/createJournalEntryOnClient/g, "SOME_OTHER_CALL");
  fs.writeFileSync(f, badApplied);
  const appliedFailures = check(f);
  if (!appliedFailures.some((o) => /APPLIED branch does not post a reversing JE/.test(o))) {
    failures.push("case3 FAIL — a silently-voided applied branch (no JE call anywhere) must be caught.");
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    for (const x of failures) console.error(`${LABEL} ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — real file GREEN, JE-in-pending caught, silently-voided-applied caught`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? await selftest() : report(check()));
}
