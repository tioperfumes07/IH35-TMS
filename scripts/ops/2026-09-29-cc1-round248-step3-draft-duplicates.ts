#!/usr/bin/env npx tsx
/**
 * ROUND 248 Step 3 — resolve the 6 (load, date, amount) duplicate groups found among draft
 * expenses (5 draft-vs-draft pairs + 1 draft-vs-already-posted). Every VOIDED row here is a
 * DRAFT (never posted) -- no GL entry exists to reverse, so this is a pure, safe metadata void
 * via the canonical executeVoidCancel("expense", ...) executor (same primitive every other void
 * this session used). No draft that duplicates an ALREADY-POSTED row is ever kept over the posted
 * one -- the posted row is left untouched in every case.
 *
 * Rule applied: within a draft-vs-draft pair, keep the later, more specific entry (real
 * vendor_document_number and/or a cleaner, non-generic memo) and void the earlier "R145 SETTL
 * NNNN" bulk-import placeholder. Against an already-posted row, void the newer duplicate draft and
 * leave the posted row alone.
 *
 * Usage: OWNER_AUTH_ID=AUTH-130 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-29-cc1-round248-step3-draft-duplicates.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withCompanyScope } from "../../apps/backend/src/accounting/shared.js";
import { executeVoidCancel } from "../../apps/backend/src/governance/void-cancel-executors.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
{
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    console.error("OWNER_AUTH_ID required");
    process.exit(1);
  }
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), authId], {
    stdio: "inherit",
  });
}

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const VOID_PLAN: Array<{ load: string; voidId: string; keepId: string; reason: string }> = [
  { load: "13587", voidId: "215bc558-7d9a-46f1-8439-50ecb545f3dd", keepId: "d4fa22e9-f02d-4ddd-aed8-9b3c711e7c54",
    reason: "ROUND 248 Step 3 — duplicate of d4fa22e9 (real vendor_document_number HB000170474, same load/date/amount); this row is the generic R145-bulk-import placeholder, never posted." },
  { load: "13590", voidId: "11dc04f3-61a3-401c-a054-69554b4a86b1", keepId: "48ec5887-441e-4e1e-ba0d-1947c404adce",
    reason: "ROUND 248 Step 3 — duplicate of 48ec5887 (same load/date/amount, later/cleaner entry); this row is the generic R145-bulk-import placeholder, never posted." },
  { load: "13600", voidId: "3f292519-b3d5-43a7-bed7-29d33d3f617b", keepId: "ca383aa9-1e87-4c44-8b0f-8d5d5a665781",
    reason: "ROUND 248 Step 3 — duplicate of ca383aa9 (same load/date/amount, later/cleaner entry); this row is the generic R145-bulk-import placeholder, never posted." },
  { load: "13605", voidId: "f366ff9b-1db3-4c82-b4ed-c69b0b9bf78c", keepId: "83b4dd98-608d-4e80-aec4-3cbbe9561cb6",
    reason: "ROUND 248 Step 3 — duplicate of 83b4dd98 (same load/date/amount, later/cleaner entry); this row is the generic R145-bulk-import placeholder, never posted." },
  { load: "13611", voidId: "aeae6fa5-67d2-4bbe-9cd7-340c3616bd40", keepId: "c93de0eb-f147-4f45-a0db-a0689259cae8",
    reason: "ROUND 248 Step 3 — duplicate of c93de0eb (same load/date/amount, later/cleaner entry); this row is the generic R145-bulk-import placeholder, never posted." },
  { load: "13606", voidId: "cff3e687-252f-49a2-aa5b-7ec677cc58fd", keepId: "f25d98dd-704d-456e-8a28-0e72135e5b64",
    reason: "ROUND 248 Step 3 — duplicate of an ALREADY-POSTED expense f25d98dd (same load/date/amount, R-164 attributed, live since 2026-09-25). This draft never posted; the posted row stands, untouched." },
];

async function main() {
  if (process.env.OWNER_AUTH_ID !== "AUTH-130") {
    console.error("Refusing: set OWNER_AUTH_ID=AUTH-130");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Refusing: DATABASE_URL required");
    process.exit(1);
  }

  for (const plan of VOID_PLAN) {
    const result = await withCompanyScope(ACTOR, USMCA, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
      return executeVoidCancel("expense", {
        client,
        operatingCompanyId: USMCA,
        entityId: plan.voidId,
        action: "cancel",
        userId: ACTOR,
        reason: plan.reason,
      });
    });
    console.log(`load ${plan.load}: void ${plan.voidId} (keep ${plan.keepId}) ->`, result.kind);
  }
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
