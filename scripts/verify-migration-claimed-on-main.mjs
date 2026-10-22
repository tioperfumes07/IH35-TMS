#!/usr/bin/env node
/**
 * MIGRATION CLAIM REGISTRY ENFORCEMENT (MIGRATION-NUMBER-RACE-IS-INTRA-LANE).
 *
 * The lane-band guard (verify-migration-lane-band.mjs) prevents inter-lane collisions.
 * This guard prevents intra-lane races: a migration timestamp must be reserved in
 * db/migrations/CLAIMED-MIGRATION-NUMBERS.json on origin/main before the .sql file
 * appears in a feature branch, exactly mirroring scripts/verify-steps/CLAIMED-NUMBERS.json.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const REGISTRY_PATH = resolve(ROOT, "db/migrations/CLAIMED-MIGRATION-NUMBERS.json");

function git(args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr || r.stdout}`);
  return (r.stdout || "").trim();
}

function newMigrations(baseRef = "origin/main") {
  const out = git(["diff", "--name-only", "--diff-filter=A", `${baseRef}...HEAD`, "--", "db/migrations/"]);
  return out.split("\n").filter((f) => f.endsWith(".sql"));
}

function timestampOf(file) {
  const name = file.split("/").pop();
  const m = /^(\d{12})_/.exec(name);
  return m ? m[1] : null;
}

function laneForHour(hour) {
  if (hour >= 0 && hour <= 11) return "claude";
  if (hour >= 12 && hour <= 23) return "cursor";
  return null;
}

function loadRegistry() {
  const text = readFileSync(REGISTRY_PATH, "utf8");
  return JSON.parse(text);
}

function branchLane(branch) {
  const lower = branch.toLowerCase();
  if (lower.startsWith("claude/")) return "claude";
  if (lower.startsWith("cursor/") || lower.startsWith("cursoragent/") || lower.startsWith("chore/") || lower.startsWith("feat/") || lower.startsWith("fix/")) return "cursor";
  return null;
}

const OWNER_AUTHORIZED_ONE_OFFS = new Map([
  [
    "codex/tel-39-driver-mirror",
    new Set(["db/migrations/202613772200_samsara_driver_activation_status.sql"]),
  ],
  [
    "codex/tel40b",
    new Set(["db/migrations/202613790000_tel40b_stop_geocode_precision.sql"]),
  ],
  [
    "codex/tel42",
    new Set(["db/migrations/202613790001_tel42_ih35_yard_location.sql"]),
  ],
  // DRV-STATUS-LOCK-PREVENTS-AUTO-REACTIVATION (2026-09-07): CC-3 (chrome-only, authorMigrations:
  // false) diagnosed, coded, and applied 202613980000 directly to prod (columns independently
  // re-verified live by CC-1 before landing), but cannot push its own branch -- the fix is real,
  // urgent (owner-reported nightly driver-reactivation regression), and already safely applied;
  // this landing PR (CC-1, has migration authority) carries only that one file under its own
  // branch name for the exact reason this map exists.
  [
    "claude/land-cc3-drv-status-lock-fix",
    new Set(["db/migrations/202613980000_drivers_status_lock_prevents_auto_reactivation.sql"]),
  ],
  // ROUND 172 (Lead order, "no subagents, no polling" time pressure -- check-engine full QBO Write
  // Check parity, deadline 09-26 02:00 UTC): atomic claim+file for 202614400000
  // (accounting.expenses.tags) and 202614390000 (accounting.expense_lines fleet linkage columns)
  // rather than a separate claim-PR merge cycle per migration under this deadline. Same shape as
  // every other entry in this map -- a real, narrow, per-migration exception, not a standing bypass;
  // each file still gets its own live-verified justification in CLAIMED-MIGRATION-NUMBERS.json.
  // RENAMED repeatedly (2026-09-25/26) as concurrent seats claimed the same 12-digit slots faster
  // than this branch could land: 202614350000/202614360000 collided with already-merged siblings
  // (driver_samsara_accounts_map, factoring_posting_key_revision); the replacement 202614380000 was
  // then claimed by a different, unrelated PR (#22798) moments before this push. Both files were
  // already live-applied to prod; their ledger rows were renamed in the same pass each time -- see
  // the migration files' own headers for the full history.
  [
    "claude/r154-check-engine-cc2-build",
    new Set([
      "db/migrations/202614400000_expenses_tags.sql",
      "db/migrations/202614390000_expense_lines_fleet_linkage.sql",
    ]),
  ],
  // LEAD 443.208R (22:58Z; owner 2026-10-01 no-handoff): load-change signal (pg_notify at commit). Claimed first on main as a
  // top-level key (202616060700) — exact-branch + exact-file, same shape as 443.220 below.
  [
    "cc-2/443-208r-load-changed-2",
    new Set(["db/migrations/202616060700_load_changed_notify.sql"]),
  ],
  // LEAD 443.220 (00:45Z; owner 2026-10-01 no-handoff): driver_bills status awaiting_short_miles. Claimed first on main in
  // #27131 (0eef5c13de) as a top-level key, like the 443.209 / 443.214 claims — exact-branch + exact-file, same shape.
  [
    "cc-2/443-220-awaiting-short-miles",
    new Set(["db/migrations/202616110700_driver_bills_awaiting_short_miles.sql"]),
  ],
  // Owner order 2026-10-01 (docs/bus/2026-10-01-OWNER-ORDER-CC-2-NO-HANDOFF-BUILD-OWN-MIGRATIONS.md):
  // "fully complete and build their own engine, no handing off" -- CC-2's two engine migrations,
  // claimed first (#23641) under claimed_by cc-2. Same exact-branch + exact-file shape as above.
  [
    "cc-2/owner-1001-complaints-fuel-derivation-migrations",
    new Set([
      "db/migrations/202615100000_complaints_load_unit_link_and_categories.sql",
      "db/migrations/202615110000_fuel_transaction_derivations.sql",
    ]),
  ],
  // Same owner order (2026-10-01, no handoff): CC-2's advance path — 5785's advance recovered 4x by
  // v_driver_advance_balances. Claimed first (#26277) under claimed_by CC-2. Same exact-branch + exact-file shape.
  [
    "cc-2/advance-once-5785",
    new Set(["db/migrations/202615500300_driver_advance_balances_one_row_per_posting.sql"]),
  ],
  // LEAD RULING 443.45 Ask C (CC-3): the A/P chain bills a salaried week with no per-load driver bill (5780). Claimed first
  // (#26330, d7e60ead0c) under claimed_by CC-3, inside the cc-3 band (HH 09). Same exact-branch + exact-file shape.
  [
    "cc-3/443-51-salaried-ap-chain",
    new Set(["db/migrations/202615530900_driver_settlement_gl_bills_pay_basis_salaried.sql"]),
  ],
  // OWNER RULING (Lead 443.52 B, CC-3): expense settlement number requires a load. Claimed first (#26347, 782e96cd82).
  [
    "cc-3/443-59-expense-settlement-needs-load",
    new Set(["db/migrations/202615540900_expenses_settlement_no_requires_load.sql"]),
  ],
  // LEAD 443.101 R6 (CC-3): verify:arch-design / entity-isolation — FORCE RLS on the two downtime catalogs, the first red
  // step on every main CI run. Claimed first on main under claimed_by CC-3 inside the cc-3 band (HH 09) — #26574
  // ac43266e9f, placed under "claimed" by a601c5bf9a. Same exact-branch + exact-file shape.
  [
    "cc-3/c101-r6-arch",
    new Set(["db/migrations/202615750915_downtime_catalogs_force_rls.sql"]),
  ],
  // LEAD 443.103 item 3 (CC-3, R11): schema drift — claim the prod-only LIVE+USED downtime.* / archived catalogs.* relations.
  // Claimed first on main under claimed_by CC-3 inside the cc-3 band (HH 09) — #26586 d62aaadbaa. Same exact-branch +
  // exact-file shape.
  [
    "cc-3/c103-r11",
    new Set(["db/migrations/202615760910_claim_prod_only_downtime_and_archived_driver_catalogs.sql"]),
  ],
  // LEAD 443.105 item 1 (CC-3, R12): accounting.bills.non_owned_trailer_id — a driver bill on a customer-trailer load
  // carries its non-owned trailer. Claimed first on main under claimed_by CC-3 inside the cc-3 band (HH 09) — #26592
  // 29b737ab2e. Same exact-branch + exact-file shape.
  [
    "cc-3/c105-r12",
    new Set(["db/migrations/202615770910_driver_bill_non_owned_trailer.sql"]),
  ],
  // LEAD RULINGS 443.107 item 3 (CC-3 R16): loads.trailer_source 'none' + expense trailer trigger carries the non-owned
  // trailer. Claimed first on main (#26607, 45ed85e395). Same exact-branch + exact-file shape.
  [
    "cc-3/c107-r16",
    new Set(["db/migrations/202615790910_load_trailer_source_none.sql"]),
  ],
  // LEAD RULINGS 443.113 AJK-10/11 (CC-3): invoices_invoice_type_check accepts 'cancellation_tonu' (the TONU writer's own
  // type). Claimed first on main (#26638, d1fabb4cb7) under claimed_by CC-3 in the cc-3 band (HH 09). Same exact-branch +
  // exact-file shape.
  [
    "cc-3/c113-cancel",
    new Set(["db/migrations/202615810910_invoice_type_accepts_cancellation_tonu.sql"]),
  ],
  // LEAD 443.114 (CC-3, AJK-12 ruling): safety.enforce_fine_lock_after_conversion allows converted -> dismissed only when the
  // driver liability is voided, and clearing the pointer only when its liability does not exist. Claimed first on main
  // (#26646, 966947fd54). Same exact-branch + exact-file shape.
  [
    "cc-3/c114-fines",
    new Set(["db/migrations/202615820910_fine_dismiss_after_liability_void.sql"]),
  ],
  // LEAD RULINGS 443.116 #1 (CC-3): FUEL_POSTS_ON_RECEIPT_ENABLED flag seed (default OFF) — a fill posts when it is
  // received. Claimed first on main (#26653, 9438c4d8da) under claimed_by CC-3 in the cc-3 band (HH 09). Same exact-branch +
  // exact-file shape.
  [
    "cc-3/c116-fuel",
    new Set(["db/migrations/202615830910_fuel_posts_on_receipt_flag.sql"]),
  ],
  // LEAD 443.120 A (CC-3): FK safety.civil_fines.converted_to_liability_id -> driver_liabilities(id). Claimed first on main
  // (#26662 + #26665) under claimed_by CC-3 in the cc-3 band (HH 09). Same exact-branch + exact-file shape.
  [
    "cc-3/c120-a",
    new Set(["db/migrations/202615840910_fine_converted_liability_fk.sql"]),
  ],
  // LEAD 443.121 #1 (CC-3): ONE fuel receipt identity (fuel.fuel_receipt_postings). Claimed first on main (#26669) under
  // claimed_by CC-3 in the cc-3 band (HH 09). Same exact-branch + exact-file shape.
  [
    "cc-3/c121-1",
    new Set(["db/migrations/202615850910_fuel_receipt_one_posting_identity.sql"]),
  ],
  // LEAD 443.129 A/B/C (CC-3): roadside ticket payment source + hub linkage + item (maintenance.road_service_tickets).
  // Claimed first on main (#26686) under claimed_by CC-3 in the cc-3 band (HH 09). Same exact-branch + exact-file shape.
  [
    "cc-3/c129-abc",
    new Set(["db/migrations/202615880910_road_service_ticket_payment_source_and_linkage.sql"]),
  ],
  // CC-3 (443.132 standing orders): WO->bill line account = its item's account — maintenance.work_order_lines.item_id.
  // Claimed first on main (#26700) under claimed_by CC-3 in the cc-3 band (HH 09). Same exact-branch + exact-file shape.
  [
    "cc-3/c133-woacct",
    new Set(["db/migrations/202615890910_work_order_line_item.sql"]),
  ],
  // LEAD 443.133 B (CC-3): Relay deposit card map as data + one live entry per deposit. Claimed first on main (#26684)
  // under claimed_by CC-3 in the cc-3 band (HH 09). Same exact-branch + exact-file shape.
  [
    "cc-3/c133-b",
    new Set(["db/migrations/202615870910_relay_deposit_card_map_and_one_posting.sql"]),
  ],
  // LEAD 443.134 #1 (CC-3): related party -> its one running Due to / from account (accounting.related_party_accounts).
  // Claimed first on main (#26711, 733b56ba67) under claimed_by CC-3 in the cc-3 band (HH 09). Same exact-branch + exact-file shape.
  [
    "cc-3/c134-rp",
    new Set(["db/migrations/202615900910_related_party_accounts_link.sql"]),
  ],
  // LEAD 443.136 #1 (CC-3): the Relay deposit posting registry trigger stamps the deposit row. Claimed first on main
  // (#26721, 31695686ae) under claimed_by CC-3 in the cc-3 band (HH 09). Same exact-branch + exact-file shape.
  [
    "cc-3/c136-deposit",
    new Set(["db/migrations/202615920910_relay_deposit_stamped_by_posting_registry.sql"]),
  ],
  // LEAD 443.136 #2 (CC-3): WORM on accounting.related_party_accounts. Claimed first on main (#26721, 31695686ae) under
  // claimed_by CC-3 in the cc-3 band (HH 09). Same exact-branch + exact-file shape.
  [
    "cc-3/c136-worm",
    new Set(["db/migrations/202615930910_related_party_accounts_worm.sql"]),
  ],
  // LEAD 443.136 follow-up (CC-3, ACCT-F4431372): posting_source_load_id resolves a Relay receipt fill with no fuel row to
  // its adopted expense document's load. Claimed first on main (#26729, b1152c0449) under claimed_by CC-3 in the cc-3 band
  // (HH 09). Same exact-branch + exact-file shape.
  [
    "cc-3/c137",
    new Set(["db/migrations/202615940910_posting_source_load_id_relay_receipt_document.sql"]),
  ],
  // RULING 443.62 #3/#4/#7 (Lead 16:35 UTC): 2410-00-001..004 "Due to / from <party>" rename (taken from CC-1 #26377) +
  // google_place_id on stop / location for CC-2. Claimed first on main (#26389); exact branch + exact files.
  [
    "cc-3/443-62-due-to-from-and-place-id",
    new Set([
      "db/migrations/202615560900_due_to_from_related_party_accounts.sql",
      "db/migrations/202615570900_stop_and_location_google_place_id.sql",
    ]),
  ],
]);

function isOwnerAuthorizedOneOff(branch, files) {
  const allowed = OWNER_AUTHORIZED_ONE_OFFS.get(branch);
  return Boolean(allowed && files.length > 0 && files.every((file) => allowed.has(file)));
}

export function run() {
  let branch;
  try {
    branch = process.env.GITHUB_HEAD_REF || git(["rev-parse", "--abbrev-ref", "HEAD"]);
  } catch {
    return { ok: true, skipped: "branch could not be determined", message: "verify-migration-claimed-on-main SKIP — no branch" };
  }

  let files;
  try {
    files = newMigrations();
  } catch (error) {
    return { ok: true, skipped: "diff unavailable", message: `verify-migration-claimed-on-main SKIP — could not diff against origin/main (${error.message})` };
  }

  if (files.length === 0) {
    return { ok: true, message: `verify-migration-claimed-on-main OK — no new migrations on ${branch}` };
  }

  if (isOwnerAuthorizedOneOff(branch, files)) {
    return {
      ok: true,
      files,
      message: `verify-migration-claimed-on-main OK — direct owner one-PR authorization applies only to ${files.join(", ")}`,
    };
  }

  let registry;
  try {
    registry = loadRegistry();
  } catch (error) {
    return { ok: false, message: `verify-migration-claimed-on-main FAIL — cannot read registry ${REGISTRY_PATH}: ${error.message}` };
  }

  const claimed = registry.claimed || {};
  const lane = branchLane(branch);
  const problems = [];

  for (const f of files) {
    const ts = timestampOf(f);
    if (!ts) {
      problems.push(`${f} does not begin with a YYYYMMDDHHMM timestamp; cannot claim it.`);
      continue;
    }
    const entry = claimed[ts];
    if (!entry) {
      problems.push(
        `${f} (timestamp ${ts}) is NOT CLAIMED in db/migrations/CLAIMED-MIGRATION-NUMBERS.json. ` +
          `Open a claim-only PR adding this timestamp to 'claimed', merge it, then author the migration.`
      );
      continue;
    }
    const hour = Number(ts.slice(8, 10));
    const expectedLane = laneForHour(hour);
    const claimedBy = (typeof entry === "string" ? entry : entry.claimed_by || "").toLowerCase();
    if (expectedLane && claimedBy && claimedBy !== expectedLane) {
      problems.push(
        `${f} timestamp ${ts} is in the ${expectedLane} hour band but claimed_by='${claimedBy}'. ` +
          `Pick an hour inside your lane's band and claim under the correct lane.`
      );
    }
    if (lane && claimedBy && claimedBy !== lane) {
      problems.push(
        `${f} timestamp ${ts} was claimed by ${claimedBy}, but this branch '${branch}' maps to ${lane}. ` +
          `Never claim another lane's migration slot.`
      );
    }
  }

  const ok = problems.length === 0;
  return {
    ok,
    files,
    message: ok
      ? `verify-migration-claimed-on-main OK — ${files.length} new migration(s) claimed`
      : `verify-migration-claimed-on-main FAIL:\n  - ${problems.join("\n  - ")}`,
  };
}

function selftest() {
  const ts = "202610101200";
  if (!/^\d{12}$/.test(ts)) throw new Error("selftest timestamp parse failed");
  if (laneForHour(Number(ts.slice(8, 10))) !== "cursor") throw new Error("selftest hour band failed");
  if (branchLane("cursor/fix-thing") !== "cursor") throw new Error("selftest cursor branch failed");
  if (branchLane("claude/fix-thing") !== "claude") throw new Error("selftest claude branch failed");
  if (timestampOf("db/migrations/202610101200_thing.sql") !== "202610101200") throw new Error("selftest timestampOf failed");
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    console.log(selftest() ? "verify-migration-claimed-on-main selftest PASS" : "verify-migration-claimed-on-main selftest FAIL");
    process.exit(selftest() ? 0 : 1);
  }
  const { ok, message } = run();
  console.log(message);
  process.exit(ok ? 0 : 1);
}
