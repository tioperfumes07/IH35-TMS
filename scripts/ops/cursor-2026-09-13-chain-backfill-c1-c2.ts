#!/usr/bin/env tsx
/**
 * scripts/ops/cursor-2026-09-13-chain-backfill-c1-c2.ts
 *
 * LOAD-TO-CASH CHAIN backfill (Claude Lead master register C1 + C2, owner law 2026-09-12:
 * "the instant a load is booked, a bill must be created automatically for that driver for that
 * load. that load must automatically be assigned to a pre-settlement/settlement/tour").
 *
 * These loads predate the auto-create hooks being wired into every assignment path
 * (driver-bill mint on assign: 2026-09-11; REG-008 post-booking presettlement link: 2026-09-09/10),
 * so the hooks never fired for them. This runs the SAME production hooks — no bespoke settlement or
 * bill math is authored here.
 *
 * C1 — driver bills (link 1). Mint via ensureDriverBillArtifactsForLoad (book-load.service). Only
 * loads that HAVE a seated driver are mintable — driver_finance.driver_bills.driver_id is NOT NULL,
 * so a load with no driver cannot have a "bill for that driver" (13502/13505/13507 are a separate
 * driverless-delivered anomaly, flagged to the owner, NOT minted here).
 *
 * C2 — presettlement links (link 2). ROOT CAUSE (forensic, live audit.row_changes): the settlements
 * these loads sat on were CANCELLED by two UNATTRIBUTED script batches — 2026-09-12 01:21:49Z
 * (S-2026-0013, S-2026-0021, both from 'open') and 01:46:49Z (S-2026-0018/0020/0028/0030, all from
 * 'closed') — every row with a BLANK changed_by_role and no session_id (a script/ops action, never an
 * owner in-app cancel, which stamps role='Owner'). The cancel set status='cancelled' and cleared
 * loads.presettlement_link_id; NONE of these ever posted a JE (posted_at NULL, voided_at NULL — they
 * are open/closed PRE-settlements, not posted pay-runs). So this is not money, it is tour linkage.
 *
 * FIX, split by their TRUE prior state (never guessed — read from audit old_data.status):
 *   C2a RESTORE — the 4 that were owner-CLOSED before the erroneous cancel are restored to 'closed'
 *     and their still-orphaned loads re-pointed. Reversing an unattributed script cancel of a
 *     never-posted, owner-closed pre-settlement back to its exact prior state is the root-cause fix,
 *     not a new close. The uq_driver_settlements_one_open_per_driver index is PARTIAL on status='open'
 *     (verified), so restoring to 'closed' cannot collide. Relinks 13564/13570/13580/13589/13586.
 *   C2b FLAG (owner decision, NOT auto-written) — S-2026-0013 / S-2026-0021 were 'open' when the
 *     script cancelled them, and their drivers have since opened NEWER tours (S-2026-5807 for
 *     4ff53886; S-2026-5806 for 3e138476). Restoring to 'open' would put two open settlements on one
 *     driver (constraint violation); restoring to 'closed' would be an owner-only CLOSE of a tour the
 *     owner never closed. Plus 13526 never had a settlement at all (orphan tour e3e6ea55). These 6
 *     loads (13561/13527/13567/13571/13574/13526) are surfaced for the owner, never force-linked.
 *
 * Usage:
 *   DATABASE_URL=<neon> npx tsx scripts/ops/cursor-2026-09-13-chain-backfill-c1-c2.ts --dry-run
 *   DATABASE_URL=<neon> npx tsx scripts/ops/cursor-2026-09-13-chain-backfill-c1-c2.ts --apply
 */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { ensureDriverBillArtifactsForLoad } from "../../apps/backend/src/dispatch/book-load.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

// C1 — driver-bill backfill (loads WITH a seated driver that predate the mint hook).
const C1_DRIVER_BILL_LOADS = ["13554", "13573", "13579", "13580"];

// C2a — restore the 4 script-cancelled, never-posted, owner-CLOSED pre-settlements to 'closed' and
// re-point their still-orphaned loads (matched by tour_id). prior status read live from audit = closed.
const C2A_RESTORE = [
  { settlement_id: "0b055c48-6fd7-495c-a845-aba30bca25c7", display_id: "S-2026-0018", prior_status: "closed", tour_id: "e7e07e3c-1067-43d0-963b-c47a7ac94309" },
  { settlement_id: "f820d05c-18df-44ce-a5ad-fd4a17a05b7c", display_id: "S-2026-0020", prior_status: "closed", tour_id: "bb7cd9d2-d6c8-4a74-a8da-ff1fb39ede9d" },
  { settlement_id: "fe07244f-faf0-4f83-96e7-4af3e61a0161", display_id: "S-2026-0028", prior_status: "closed", tour_id: "f6e7c3b2-190f-4249-bd27-5b71609862d9" },
  { settlement_id: "0a8aa2aa-1158-4c23-8c1b-6535df7c6e96", display_id: "S-2026-0030", prior_status: "closed", tour_id: "8a80b8c3-f948-4b4f-a382-c8fc1c12597b" },
];

// C2b — owner-decision, printed only (see header). Nothing here is written.
const C2B_FLAG: Array<{ display_id: string; loads: string[]; why: string }> = [
  { display_id: "S-2026-0013", loads: ["13561", "13527", "13567"], why: "was 'open' at cancel; driver 4ff53886 now holds open S-2026-5807 — restore-open would violate one-open-per-driver; restore-closed is an owner close" },
  { display_id: "S-2026-0021", loads: ["13571", "13574"], why: "was 'open' at cancel; driver 3e138476 now holds open S-2026-5806 — same as above" },
  { display_id: "(none)", loads: ["13526"], why: "orphan tour e3e6ea55 — never had a pre-settlement; driver 4ff53886 already holds one open, cannot open another" },
];

type LoadRow = {
  id: string;
  load_number: string;
  trip_type: string | null;
  driver_id: string | null;
  unit_id: string | null;
  presettlement_link_id: string | null;
};

class DryRunRollback extends Error {
  constructor(public report: string[]) {
    super("dry-run rollback");
  }
}

async function loadByNumber(c: { query: (sql: string, v?: unknown[]) => Promise<{ rows: LoadRow[] }> }, num: string): Promise<LoadRow | null> {
  const r = await c.query(
    `SELECT id::text, load_number, trip_type::text AS trip_type,
            assigned_primary_driver_id::text AS driver_id, assigned_unit_id::text AS unit_id,
            presettlement_link_id::text AS presettlement_link_id
       FROM mdata.loads
      WHERE load_number = $1 AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL`,
    [num, USMCA_COMPANY_ID]
  );
  return r.rows[0] ?? null;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = !apply || args.includes("--dry-run");
  if (apply && args.includes("--dry-run")) throw new Error("choose --dry-run or --apply, not both");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  try {
    const report = await withCurrentUser(OWNER_USER_ID, async (c) => {
      await setScopedCompanyContext(c, OWNER_USER_ID, USMCA_COMPANY_ID);
      const out: string[] = [];

      out.push("--- C1: driver bills ---");
      for (const num of C1_DRIVER_BILL_LOADS) {
        const load = await loadByNumber(c, num);
        if (!load) { out.push(`  ${num} | SKIP not found (scope?)`); continue; }
        if (!load.driver_id) { out.push(`  ${num} | SKIP no seated driver (driverless — cannot mint)`); continue; }
        const res = await ensureDriverBillArtifactsForLoad(c, {
          loadId: load.id, operatingCompanyId: USMCA_COMPANY_ID, actorUserId: OWNER_USER_ID,
        });
        const detail = res.outcome === "minted"
          ? ` bill=${res.bill_number ?? "?"}${res.unpriced ? " (unpriced $0 tracking)" : ""}`
          : res.outcome === "skipped_no_pay_rate" ? ` (${res.missing.join(",")})` : "";
        out.push(`  ${num} | ${res.outcome}${detail}`);
      }

      out.push("--- C2a: restore script-cancelled owner-closed pre-settlements + re-point loads ---");
      for (const r of C2A_RESTORE) {
        const upd = await c.query(
          `UPDATE driver_finance.driver_settlements
              SET status = $1, updated_at = now()
            WHERE id = $2::uuid AND operating_company_id = $3::uuid AND status = 'cancelled'
            RETURNING display_id`,
          [r.prior_status, r.settlement_id, USMCA_COMPANY_ID]
        ) as { rows: Array<{ display_id: string }> };
        if (!upd.rows.length) { out.push(`  ${r.display_id} | SKIP not in 'cancelled' (already restored?)`); continue; }
        const repoint = await c.query(
          `UPDATE mdata.loads
              SET presettlement_link_id = $1::uuid, updated_at = now()
            WHERE tour_id = $2::uuid AND operating_company_id = $3::uuid
              AND soft_deleted_at IS NULL AND status <> 'cancelled'
              AND presettlement_link_id IS NULL
            RETURNING load_number`,
          [r.settlement_id, r.tour_id, USMCA_COMPANY_ID]
        ) as { rows: Array<{ load_number: string }> };
        out.push(`  ${r.display_id} | restored -> ${r.prior_status}; re-pointed ${repoint.rows.map((x) => x.load_number).join(", ") || "(none)"}`);
      }

      out.push("--- C2b: OWNER DECISION (flagged, NOT written) ---");
      for (const f of C2B_FLAG) out.push(`  ${f.display_id} loads[${f.loads.join(",")}] — ${f.why}`);

      if (dryRun) throw new DryRunRollback(out);
      return out;
    });

    console.log(`\n=== chain-backfill-c1-c2 (APPLIED) ===`);
    for (const l of report) console.log(l);
    console.log("=== end ===\n");
  } catch (err) {
    if (err instanceof DryRunRollback) {
      console.log(`\n=== chain-backfill-c1-c2 (DRY-RUN — rolled back) ===`);
      for (const l of err.report) console.log(l);
      console.log("=== end ===\n");
      process.exit(0);
    }
    throw err;
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
