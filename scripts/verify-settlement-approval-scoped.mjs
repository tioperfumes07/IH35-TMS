#!/usr/bin/env node
/**
 * ACCT-R-13 companion guard — Settlement Approval per-handler entity-scope check.
 *
 * apps/backend/src/settlements/approval.routes.ts writes money state (settlement line approve/
 * reject, settlement approve/finalize, escrow ledger via approval.service.ts) and was mounted in
 * ACCT-R-13. Before that fix, 6 of its 9 handlers trusted a client-supplied operating_company_id
 * with only a truthiness check — NO membership validation — so any authenticated Manager/Payroll
 * user could approve/reject/finalize another entity's settlement lines (cross-entity financial
 * write). See docs/specs/DESIGN-settlement-approval-safe-mount-HOLD.md and
 * docs/trackers/CODER-BUILD-INSTRUCTIONS-2026-07-19.md ticket 0091-g1-3 for the full evidence.
 *
 * This guard fails if any app.get/app.post handler in the file reads `operating_company_id` (query
 * or body) without also calling resolveOperatingCompanyId(...) in the same handler body.
 *
 * --selftest mutates the REAL route file (replaces the first resolveOperatingCompanyId(...) call
 * with a raw pass-through, reproducing the exact historical bug pattern), proves the check fails,
 * then restores the original file content from an in-memory backup in a `finally` block.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const ROUTES = "apps/backend/src/settlements/approval.routes.ts";
const LABEL = "verify-settlement-approval-scoped";

const HANDLER_START_RE = /app\.(get|post)\(\s*["'][^"']+["']/g;

export function findHandlerBlocks(src) {
  const matches = [...src.matchAll(HANDLER_START_RE)];
  const blocks = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : src.length;
    blocks.push({ label: matches[i][0], body: src.slice(start, end) });
  }
  return blocks;
}

export function check(src) {
  const errors = [];
  const blocks = findHandlerBlocks(src);
  if (blocks.length < 9) {
    errors.push(
      `${ROUTES}: expected >=9 app.get/app.post handlers (approval workflow), found ${blocks.length} — file structure changed, re-verify this guard`
    );
  }
  for (const block of blocks) {
    if (!/operating_company_id/.test(block.body)) continue;
    if (!/resolveOperatingCompanyId\s*\(/.test(block.body)) {
      errors.push(
        `${ROUTES}: handler "${block.label}" reads operating_company_id without a resolveOperatingCompanyId(...) membership check (cross-entity financial write risk — ACCT-R-13)`
      );
    }
  }
  return errors;
}

const RESOLVE_CALL_NEEDLE = "await resolveOperatingCompanyId(client, user.uuid, requestedCompanyId)";

function main() {
  const args = process.argv.slice(2);
  const realPath = path.join(ROOT, ROUTES);

  if (args.includes("--selftest")) {
    const backup = fs.readFileSync(realPath, "utf8");
    try {
      const goodErrors = check(backup);
      if (goodErrors.length !== 0) {
        console.error(`[${LABEL}] SELFTEST FAIL: real (fixed) file flagged as bad:`, goodErrors);
        process.exit(1);
      }
      if (!backup.includes(RESOLVE_CALL_NEEDLE)) {
        console.error(`[${LABEL}] SELFTEST SETUP FAIL: expected pattern not found in real file — pattern drifted`);
        process.exit(1);
      }
      // Plant the exact historical bug: one handler falls back to a raw, unvalidated pass-through
      // instead of resolving membership.
      const plantedBad = backup.replace(RESOLVE_CALL_NEEDLE, "(requestedCompanyId || \"\")");
      fs.writeFileSync(realPath, plantedBad, "utf8");
      const plantedErrors = check(plantedBad);
      if (plantedErrors.length === 0) {
        console.error(`[${LABEL}] SELFTEST FAIL: planted raw-trust regression was not caught`);
        process.exit(1);
      }
      console.log(`[${LABEL}] SELFTEST PASS (${plantedErrors.length} planted failure(s) detected)`);
    } finally {
      fs.writeFileSync(realPath, backup, "utf8");
    }
    process.exit(0);
  }

  const src = fs.readFileSync(realPath, "utf8");
  const errors = check(src);
  if (errors.length > 0) {
    console.error(`[${LABEL}] FAILED:`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — every operating_company_id-touching handler in approval.routes.ts resolves membership`);
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
