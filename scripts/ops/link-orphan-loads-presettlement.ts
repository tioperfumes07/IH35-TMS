#!/usr/bin/env tsx
/**
 * scripts/ops/link-orphan-loads-presettlement.ts — REG-008 repair pass (owner "fix everything,
 * never defer" 2026-09-10).
 *
 * FINDING (live, Neon br-fancy-credit-akjnd07a, USMCA, bypass_rls=lucia): loads 13580 (Laredo TX ->
 * Edison NJ = NORTHBOUND) and 13581 (Battleboro NC -> Laredo TX = SOUTHBOUND) are dispatched with a
 * driver + unit assigned but trip_type = NULL and presettlement_link_id = NULL. book-load.service.ts
 * links a pre-settlement at booking ONLY when trip_type is present (line ~2520); these were booked
 * without a trip_type, so the auto-link never fired and neither dispatched truck's load carries a
 * settlement number. REG-008 (linkLoadToPresettlementAfterAssignmentInClientTx) was written for
 * exactly these loads (its own comment names 13580/13581/13508) but it defers, never guesses, while
 * trip_type is still null.
 *
 * ROOT-CAUSE, NOT PATCH: trip_type is derived from the load's own Laredo-anchored stops (a loaded
 * pickup at the border = NB; a delivery at the border = SB) — read from the document/stops, never
 * invented — then the REAL production service (suggestPresettlementLink -> confirmPresettlementLink)
 * is run. No settlement math is authored here; the existing service is the only writer. Posts
 * nothing to the GL (an open pre-settlement is not a posted ledger entry; closing stays owner-only).
 *
 * MONEY-SAFE CHOICE (action = create_new, NOT the auto link-existing): the drivers' prior tours on
 * these units are already CLOSED and GL-POSTED (S-2026-0002 $2,016.92 posted 2026-09-07;
 * S-2026-0020 $752.96 posted 2026-09-08, both unpaid). The linker's automatic REG-040 continuation
 * would REOPEN and REVERSE those posted pay-runs to fold the new leg in. That is a posted-money
 * movement and an owner decision, so this pass instead opens a FRESH pre-settlement per load
 * (create_new) — it pairs the settlement number and touches ZERO posted pay. If the owner prefers
 * these legs continue the prior tours (REG-040 reverse+repost), that is a one-word switch to
 * action="link_existing" and is done in-app, not here.
 *
 * NB the trip_type per load is passed in explicitly (measured from stops), never derived by string
 * heuristics inside this script — a wrong NB/SB guess would mis-group driver pay.
 *
 * Usage:
 *   DATABASE_URL=<neon> npx tsx scripts/ops/link-orphan-loads-presettlement.ts --dry-run
 *   DATABASE_URL=<neon> npx tsx scripts/ops/link-orphan-loads-presettlement.ts --apply
 */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import {
  suggestPresettlementLink,
  confirmPresettlementLink,
} from "../../apps/backend/src/dispatch/presettlement-link.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

// Measured from each load's own stops (live), NOT guessed:
//   13580 pickup Laredo TX (loaded, border) -> delivery Edison NJ  => NB
//   13581 pickup Battleboro NC -> delivery Laredo TX (border)      => SB
const TARGETS: Array<{ load_number: string; trip_type: "NB" | "SB" | "TR" }> = [
  { load_number: "13580", trip_type: "NB" },
  { load_number: "13581", trip_type: "SB" },
];

class DryRunRollback extends Error {
  constructor(public payload: unknown) {
    super("dry-run rollback");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = !apply || args.includes("--dry-run");
  if (apply && args.includes("--dry-run")) throw new Error("choose --dry-run or --apply, not both");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const report: string[] = [];

  for (const t of TARGETS) {
    try {
      const outcome = await withCurrentUser(OWNER_USER_ID, async (c) => {
        await setScopedCompanyContext(c, OWNER_USER_ID, USMCA_COMPANY_ID);

        const loadRes = await c.query<{
          id: string;
          trip_type: string | null;
          tour_id: string | null;
          presettlement_link_id: string | null;
          driver_id: string | null;
          unit_id: string | null;
        }>(
          `SELECT id, trip_type::text AS trip_type, tour_id::text, presettlement_link_id::text,
                  assigned_primary_driver_id::text AS driver_id, assigned_unit_id::text AS unit_id
             FROM mdata.loads
            WHERE load_number = $1 AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL`,
          [t.load_number, USMCA_COMPANY_ID]
        );
        const load = loadRes.rows[0];
        if (!load) throw new Error(`load ${t.load_number} not found (RLS/scope?)`);
        if (load.presettlement_link_id) {
          return { load_number: t.load_number, skipped: `already linked to ${load.presettlement_link_id}` };
        }
        if (!load.driver_id) throw new Error(`load ${t.load_number} has no assigned_primary_driver_id`);

        const beforeTripType = load.trip_type;
        // Set the trip_type derived from stops, only if not already correct.
        if (load.trip_type !== t.trip_type) {
          await c.query(
            `UPDATE mdata.loads SET trip_type = $1::mdata.trip_type_enum, updated_at = now()
              WHERE id = $2::uuid AND operating_company_id = $3::uuid`,
            [t.trip_type, load.id, USMCA_COMPANY_ID]
          );
        }

        // Force create_new: never auto-inherit (and thus REG-040-reverse) a posted prior tour.
        // tour_id passed null so a fresh NB gets its own new tour and an SB does not glom onto a
        // closed one; confirmPresettlementLink(create_new) allocates the display_id + settlement.
        const suggestion = await suggestPresettlementLink(c, {
          operating_company_id: USMCA_COMPANY_ID,
          load_id: load.id,
          driver_id: load.driver_id,
          unit_id: load.unit_id,
          trip_type: t.trip_type,
          tour_id: null,
          actor_user_id: OWNER_USER_ID,
        });
        const confirmed = await confirmPresettlementLink(c, {
          operating_company_id: USMCA_COMPANY_ID,
          suggestion_id: suggestion.suggestion_id,
          action: "create_new",
          actor_user_id: OWNER_USER_ID,
        });
        const linked = { action: "create_new" as const, settlement_id: confirmed.settlement_id };

        // Read back the resulting pairing WITHIN the same txn so a dry-run can still observe it.
        const after = await c.query<{
          load_number: string;
          trip_type: string | null;
          tour_id: string | null;
          display_id: string | null;
          settlement_status: string | null;
        }>(
          `SELECT l.load_number, l.trip_type::text,
                  l.tour_id::text,
                  s.display_id, s.status::text AS settlement_status
             FROM mdata.loads l
             LEFT JOIN driver_finance.driver_settlements s ON s.id = l.presettlement_link_id
            WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid`,
          [load.id, USMCA_COMPANY_ID]
        );

        const payload = {
          load_number: t.load_number,
          trip_type_before: beforeTripType,
          trip_type_after: after.rows[0]?.trip_type ?? null,
          link_action: linked?.action ?? "null (deferred / already-linked)",
          settlement_id: linked?.settlement_id ?? null,
          settlement_display_id: after.rows[0]?.display_id ?? null,
          settlement_status: after.rows[0]?.settlement_status ?? null,
          tour_id: after.rows[0]?.tour_id ?? null,
        };

        if (dryRun) throw new DryRunRollback(payload);
        return payload;
      });
      report.push(`${dryRun ? "DRY-RUN" : "APPLIED"} ${t.load_number} | ${JSON.stringify(outcome)}`);
    } catch (err) {
      if (err instanceof DryRunRollback) {
        report.push(`DRY-RUN ${t.load_number} | ${JSON.stringify(err.payload)} | ROLLED BACK`);
      } else {
        report.push(`BLOCKED ${t.load_number} | ${(err as Error).message}`);
      }
    }
  }

  console.log(`\n=== link-orphan-loads-presettlement (${dryRun ? "DRY-RUN" : "APPLY"}) ===`);
  for (const line of report) console.log(line);
  console.log("=== end ===\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
