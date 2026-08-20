/**
 * ACCT-F5678 LIVE EXERCISE — prove closeSettlementPayRun works end-to-end now that USMCA's
 * payment methods carry a bound gl_account_id (migration 202612850000). Runs the REAL exported
 * service function against the one ready settlement (S-2026-0002: locked, acknowledged, 1
 * settlement line) — never a hand-written UPDATE, matching this session's established run-once
 * pattern (P38/F333/F345/etc.).
 *
 * Usage:
 *   DATABASE_URL=<direct> DATABASE_DIRECT_URL=<direct> npx tsx scripts/run-acct-f5678-close-settlement-payrun-once.mts [--commit]
 * Without --commit: previewOnly=true (compute only, writes nothing) — the function's own built-in
 * dry-run mode, not a separate code path.
 */
import { closeSettlementPayRun } from "../apps/backend/src/driver-finance/settlement-payrun-close.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const SETTLEMENT_ID = "9910302b-35df-4882-955a-130b7fb29c7a"; // S-2026-0002
const PAYMENT_METHOD_ID = "574d600c-7afe-4da7-a234-61148ffecc1f"; // USMCA active payment method, now GL-bound
const COMMIT = process.argv.includes("--commit");

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) throw new Error("REFUSING -pooler: session GUCs do not survive transaction pooling under FORCE RLS");

console.log(`mode=${COMMIT ? "COMMIT (previewOnly=false)" : "PREVIEW (previewOnly=true, writes nothing)"}`);

const result = await closeSettlementPayRun(
  {
    operatingCompanyId: USMCA,
    settlementId: SETTLEMENT_ID,
    paymentMethodId: PAYMENT_METHOD_ID,
    paymentReference: "ACCT-F5678 live exercise",
    previewOnly: !COMMIT,
  },
  { userId: ACTOR_USER_ID }
);

console.log(JSON.stringify(result, null, 2));
