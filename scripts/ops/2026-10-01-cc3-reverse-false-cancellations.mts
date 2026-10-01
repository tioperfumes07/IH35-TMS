#!/usr/bin/env npx tsx
// ROUND 313 CC-3 item 5. --apply requires --auth AUTH-NNN (verified OPEN on main by 2026-10-01-cc3-lib.mjs).
// Reverses the 2026-09-28 AUTH-093 cancellations of 13625 / 13627 / 13638 through the CANONICAL path
// (apps/backend/src/dispatch/cancellation-reversal.service.ts, migration 202615180900): each cancellation row ->
// 'reversed' with the reason, the trigger clears mdata.loads.canceled_at / canceled_by, one audit row per load.
// Load status is NOT changed (all three are already 'dispatched'); no delivery date is written, no money touched.
// Refuses unless each load still carries exactly the 2026-09-28 stamp measured live.
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";
import { reverseLoadCancellationInClientTx } from "../../apps/backend/src/dispatch/cancellation-reversal.service.ts";

const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOADS: Record<string, string> = {
  "13625": "2026-09-28 10:09:51.590936+00",
  "13627": "2026-09-28 10:09:54.146773+00",
  "13638": "2026-09-28 10:09:57.015453+00",
};
const REASON =
  "AUTH-093 cancellation (2026-09-28 10:09Z) was wrong: ROUND-155.26 reinstated these loads 12 minutes later but left the cancel stamp. Owner: delivered and factored, not cancelled.";

await run("reverse_false_cancellations", async (c: any, { authId }: { authId: string | null }) => {
  const out: unknown[] = [];
  for (const [n, stamp] of Object.entries(LOADS)) {
    const row = (await c.query(`SELECT id::text, status::text, canceled_at::text FROM mdata.loads WHERE load_number = $1 AND operating_company_id = $2::uuid`, [n, USMCA])).rows[0];
    if (!row || row.canceled_at !== stamp) throw new Error(`refused: ${n} not as measured ${JSON.stringify(row)}`);
    const r = await reverseLoadCancellationInClientTx(c, OWNER_USER_ID, { operating_company_id: USMCA, load_id: row.id, reason: REASON }, `CC-3-${authId ?? "DRY-RUN"}`);
    out.push({ load: n, cancellation_id: r.cancellation_id, before: { status: r.before.status, canceled_at: r.before.canceled_at }, after: r.after });
  }
  return { loads: out };
});
