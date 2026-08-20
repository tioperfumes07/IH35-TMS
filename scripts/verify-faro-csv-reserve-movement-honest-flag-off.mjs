#!/usr/bin/env node
/**
 * ACCT-F5614 regression guard — faro-csv-import.ts's applyInvoiceAndReserveUpdates() must gate its
 * factoring.reserve_movement write on the entity's FACTORING_GL_POSTING_FLAG. "Honest flag-OFF = zero
 * financial rows written" is enforced everywhere else in this codebase (e.g.
 * settlement-payrun-close.service.ts's own header) — this file previously wrote a real reserve
 * movement on EVERY CSV line with reserve_amount_cents > 0 regardless of the flag, so the reserve
 * balance screen (GET /factoring/reserve-balance) could show a non-zero figure with zero GL backing
 * while the flag was OFF.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-faro-csv-reserve-movement-honest-flag-off";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/factoring/faro-csv-import.ts";

const GATED_CALL = "if (line.reserve_amount_cents > 0 && postingEnabled) {";
const PARAM_MARKER = "factorId: string | null,\n  postingEnabled: boolean";
const CALLER_ORDER_MARKER = "const enabled = await isEnabled(client, FACTORING_GL_POSTING_FLAG, {\n        operating_company_id: input.operatingCompanyId,\n      });\n      const effects = await applyInvoiceAndReserveUpdates(";

function assertAll(src) {
  const problems = [];
  if (!src.includes(GATED_CALL)) {
    problems.push(
      "applyInvoiceAndReserveUpdates' reserve-movement write is not gated on postingEnabled -- reverted " +
        "to writing factoring.reserve_movement unconditionally regardless of FACTORING_GL_POSTING_FLAG."
    );
  }
  if (!src.includes(PARAM_MARKER)) {
    problems.push("applyInvoiceAndReserveUpdates no longer takes a postingEnabled parameter.");
  }
  if (!src.includes(CALLER_ORDER_MARKER)) {
    problems.push(
      "commitFaroCsvImport no longer reads the FACTORING_GL_POSTING_FLAG BEFORE calling " +
        "applyInvoiceAndReserveUpdates -- the flag must be known before the reserve-movement write runs."
    );
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const ungated = src.replace(GATED_CALL, "if (line.reserve_amount_cents > 0) {");
  if (ungated === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: gated-call mutation string did not match live source`);
    process.exit(1);
  }
  const p1 = assertAll(ungated);
  if (!p1.some((p) => p.includes("not gated on postingEnabled"))) {
    console.error(`${LABEL} SELFTEST FAILED: un-gating the reserve-movement write not caught`);
    process.exit(1);
  }

  const live = assertAll(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Faro CSV import's reserve-movement write is gated on FACTORING_GL_POSTING_FLAG, honest flag-off preserved`);
