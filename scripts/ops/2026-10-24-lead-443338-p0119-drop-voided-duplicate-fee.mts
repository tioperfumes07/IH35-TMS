/**
 * LEAD 443.338 — P-0119 (Angel Alfonso Sosa Perez, closed, not posted, not paid) carries line 2b56ad02 "Admin fee - GAS"
 * $10.00 applying deduction 68041143, which was VOIDED on 10-12 as the duplicate of ee43793c (already taken on 5769).
 * The cap service applied it at the 10-23 close (no voided filter — fixed in the same PR). Repair: deactivate that one
 * line, release the voided deduction from P-0119 (it stays voided), and recompute the header through the engine
 * (recomputeSettlementHeader → aggregateSettlementTotals). Expected: deductions 35.00 → 25.00, net 457.80 → 467.80.
 * Refuses unless the settlement is still unposted with no bank payment and the deduction is voided. Dry run by default.
 */
import { withLuciaBypass } from "../../apps/backend/src/auth/db.ts";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.ts";
import { recomputeSettlementHeader } from "../../apps/backend/src/driver-finance/settlement-load-reassignment.service.ts";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SETTLEMENT = "2c9ff323-e78a-406d-ad9b-ffe09e88d441";
const LINE = "2b56ad02-26fb-436d-a77f-c3a70203f935";
const DEDUCTION = "68041143-847b-44a3-a658-80515364e92a";
const COMMIT = process.argv.includes("--apply");
const AUTH = process.env.OWNER_AUTH_ID ?? "";
if (COMMIT && !/^AUTH-[0-9]+$/.test(AUTH)) throw new Error("--apply requires OWNER_AUTH_ID=AUTH-NNN");
if (COMMIT) {
  // The owner's authorization must be on record (docs/bus/OWNER-AUTHORIZATIONS.md) before any production write.
  const { execFileSync } = await import("node:child_process");
  const nodePath = await import("node:path");
  const ROOT = nodePath.resolve(nodePath.dirname(new URL(import.meta.url).pathname), "../..");
  try { execFileSync("node", [nodePath.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH], { stdio: "inherit" }); } catch { process.exit(1); }
}
class Rollback extends Error { constructor(public p: unknown) { super("dry-run"); } }
type Q = { query: (s: string, v?: unknown[]) => Promise<{ rows: Record<string, any>[]; rowCount?: number | null }> };

try {
  const out = await withLuciaBypass(async (client) => {
    const c = client as unknown as Q;
    await c.query(`SELECT set_config('app.operating_company_id', $1, true)`, [CO]);
    const hdr = async () => (await c.query(`SELECT display_id, status, posted_at, gross_pay::text, deductions_total::text, net_pay::text FROM driver_finance.driver_settlements WHERE id = $1::uuid FOR UPDATE`, [SETTLEMENT])).rows[0];
    const before = await hdr();
    if (!before || before.posted_at) throw new Error(`P-0119 missing or already posted (${before?.posted_at}) — refusing`);
    const paid = Number((await c.query(`SELECT count(*) n FROM banking.bank_transactions WHERE matched_settlement_id = $1::uuid AND voided_at IS NULL`, [SETTLEMENT])).rows[0].n);
    if (paid) throw new Error("P-0119 already has a bank payment — refusing");
    const d = (await c.query(`SELECT voided_at, applied_to_settlement_id::text FROM driver_finance.driver_settlement_deductions WHERE id = $1::uuid FOR UPDATE`, [DEDUCTION])).rows[0];
    if (!d?.voided_at || d.applied_to_settlement_id !== SETTLEMENT) throw new Error("deduction not voided-and-applied-to-P-0119 — refusing");
    const line = await c.query(`UPDATE driver_finance.settlement_lines SET is_active = false, updated_at = now()
                                 WHERE id = $1::uuid AND settlement_id = $2::uuid AND source_reference_id = $3::uuid AND is_active RETURNING id`, [LINE, SETTLEMENT, DEDUCTION]);
    if (line.rowCount !== 1) throw new Error("line not deactivated — refusing");
    await c.query(`UPDATE driver_finance.driver_settlement_deductions SET applied_to_settlement_id = NULL, updated_at = now() WHERE id = $1::uuid`, [DEDUCTION]);
    const method = await recomputeSettlementHeader(client as never, SETTLEMENT, CO);
    await appendCrudAudit(client as never, "e4117991-d2c0-406d-8cda-74e98d95bccd", "driver_finance.settlement.voided_deduction_released",
      { settlement_id: SETTLEMENT, line_id: LINE, deduction_id: DEDUCTION, auth: AUTH || "dry-run", round: "443.338" });
    const after = await hdr();
    const payload = { mode: COMMIT ? `COMMIT ${AUTH}` : "DRY RUN (ROLLED BACK)", before, after, recompute: method };
    if (!COMMIT) throw new Rollback(payload);
    return payload;
  });
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  if (e instanceof Rollback) console.log(JSON.stringify(e.p, null, 2));
  else { console.error("REFUSED/ERROR:", (e as Error).message); process.exit(1); }
}
process.exit(0);
