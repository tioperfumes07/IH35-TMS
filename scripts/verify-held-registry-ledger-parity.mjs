#!/usr/bin/env node
// verify-held-registry-ledger-parity.mjs
//
// STATIC guard for the 2026-07-25 GUARD-HELD-REGISTRY-LEDGER-CROSSCHECK split
// (docs/trackers/GUARD-HELD-REGISTRY-LEDGER-CROSSCHECK-2026-07-25.md — "99/111 truth").
//
// BACKGROUND: an independent live-Neon cross-check (Rule 10: prod _system._schema_migrations +
// ih35_migrations.applied_migrations, both read under app.bypass_rls='lucia') found that
// db/migrations/.held-migrations.json had 120 entries for 111 unique files (9 duplicated), and that
// 99 of those 111 files were ALREADY APPLIED on prod while the registry still called them "held" —
// i.e. the registry was a stale marker-mirror, not an applied-state tracker. Consumers that read
// "listed in .held = still pending" (SAF-F02/F04, ACCT-F02) mis-reported up to 99 already-applied
// migrations as open work. This guard locks the FIX in place so that drift can't silently return.
//
// This is deliberately a STATIC guard — it does NOT connect to Neon and does NOT re-derive the
// 99/12 split from a live ledger read. That live cross-check is owner/GUARD's job (Rule 10 — prod
// wins, and a registry-only read can never prove application state on its own); re-run the GUARD
// live cross-check periodically as new PRs land new held migrations. What this guard CAN prove
// mechanically, every CI run, without a DB connection:
//
//   (1) no duplicate `file` entries — within `held`, within `applied_held`, or across the two
//       (a file duplicated across states is the exact "which one wins" ambiguity that caused the
//       original SAF-F02/F04 false premise);
//   (2) `held` contains EXACTLY the 12-file allowlist named in GUARD §3 (no more, no fewer) — any
//       file leaving `held` must be a deliberate, reviewed edit to this guard, never a silent drift;
//   (3) every `applied_held` entry explicitly carries `applied_on_prod: true` (the split's whole
//       point is that array membership IS the state — a stray unflagged entry defeats it);
//   (4) no `held` entry carries `applied_on_prod: true` (that would be self-contradictory: the
//       registry's own two arrays disagreeing about a file's state).
//
// `--selftest` plants each of these four defect shapes into an in-memory copy of the REAL registry
// and asserts every one is caught (non-inert), then asserts the live tree is clean.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-held-registry-ledger-parity";
const REG_PATH = path.join(ROOT, "db/migrations/.held-migrations.json");
const SELFTEST = process.argv.includes("--selftest");

// The 12 genuinely-unapplied files per GUARD-HELD-REGISTRY-LEDGER-CROSSCHECK-2026-07-25.md §3.
// Absent from BOTH _system._schema_migrations AND ih35_migrations.applied_migrations on prod,
// live-verified 2026-07-25 under app.bypass_rls='lucia'. Changing this list is an owner-reviewed
// governance decision (a file only leaves this set when GUARD re-proves it applied, or the owner
// Neon-applies + ledger-backfills it and GUARD re-proves the ledger row).
export const EXPECTED_HELD = [
  // 2026-07-27 cursor-owner-neon-apply (20:15Z batch, dual-ledger proved under lucia):
  //   202608060000, 202608110000, 202609020000, 202609030000, 202609300000 → applied_held via #3670.
  //   202609290000 (DISP-01 latch) also applied on prod; file lands with #3663 as applied_held (not held).

  // FACT-PHANTOM-01 HOLD until Jorge Neon-apply (2026-07-27).
  "202609100100_fact_phantom_01_fact_01_factoring_summary_linkage.sql",
  "202609260000_archive_legacy_fixed_assets_schema_rule07.sql",
  // SET-02 left EXPECTED_HELD 2026-07-26 after Cursor owner Neon-apply + ledger-backfill.
  // The ITEM-5a recursive demo purge (#3557). Genuinely unapplied and correctly ABSENT from prod —
  // verified absent from _system._schema_migrations on 2026-07-25. GUARD re-verifies it on a fresh
  // Neon branch before the owner applies. It must stay listed until then so it cannot silently
  // disappear from held[].
  //
  // 202608070000 (escrow forfeit sign + flag seed) is NOT here any more: it was re-proved APPLIED on
  // prod, present in BOTH _system._schema_migrations and ih35_migrations.applied_migrations, so this
  // PR moves it to applied_held. It left the list the way the charter allows, not by weakening a check.
  // SAFETY FINE-GL HOP (#3551) — genuinely unapplied on prod; owner Neon-applies then ledger-backfills.
  "202608120000_item5a_demo_purge_recursive_cascade.sql",
  // ACCT-R-03 account_merge_records (#3526) — Owner Neon-applied 2026-07-27T20:15Z; left held[] via #3670.
  // SAF-DOM-02 (this PR). Authored 2026-07-25 and NEVER applied anywhere — it is new on this branch,
  // so it cannot be in a prod ledger that predates it. It is not "GUARD re-proved unapplied"; it is
  // unapplied by construction. It leaves this list only when the owner Neon-applies + ledger-backfills
  // it and GUARD re-proves the ledger row. Note its apply-order dependency: its §3 stop-write trigger
  // must not land before SAF-B28's PATCH repoint (see the registry entry's reason).
  "202609130000_saf_dom_02_company_violation_jsonb_archive.sql",
  // SWEEP-C2 half 1 of 2 — genuinely unapplied on prod until Neon-apply.
  // SWEEP-C11 driver sub-catalog split-brain DB-level write lock.
  "202609040000_sweep_c11_driver_subcatalog_split_brain_lock.sql",
  // MNT-ECON-01
  // FLT-02 real-fleet ownership data fix. GUARD cross-check 2026-07-26 on br-fancy-credit-akjnd07a
  // (lucia, positive control mdata.vendors=2789): the FILE is absent from BOTH ledgers — genuinely
  // unapplied as a migration — while the DATA state it produces is already true on prod (87 of 87
  // non-sample units owner=TRK/leased_to=TRANSP, 0 exceptions), so applying it is a proven no-op.
  // Numbered 202609250000 after TWO collisions: 202609190000 and 202609220000 were both NOT free — prod already carries
  // 202609190000_c9_form_roundtrip_persist_columns.sql (applied 21:28Z), one of FIVE migrations
  // applied on prod that do not exist in the repo. Reported separately; not this PR's to fix.
  "202609250000_flt_02_real_fleet_owned_by_trk.sql",
  // Driver recovery policy per situation (owner ruling 2026-07-27). Authored today and never applied
  // anywhere — unapplied by construction, not "GUARD re-proved unapplied". Live cross-check on
  // br-fancy-credit-akjnd07a 2026-07-27 (lucia, positive control mdata.drivers non-zero):
  // may_draw_escrow exists as a column in NO table in the database, and
  // catalogs.driver_deduction_types still holds only its 3 INS-DED rows — so neither the ALTER nor
  // the seed has run. Numbered 202609300000: prod's true ledger max is 202609280000, and both
  // 202609190000 and 202609220000 are already taken (see FLT-02 above). Leaves this list only when
  // the owner Neon-applies + ledger-backfills and GUARD re-proves the ledger row.
  "202609310000_driver_deduction_type_recovery_policy.sql",
  // BANK-DOM-05 applied as 202609010010 — applied_held.
  // F9-02 applied as 202609010040 — applied_held.
  // F9-01 applied as 202609010050 — applied_held.
  // F9-01 follow-up applied as 202609010051 — applied_held.
  // F9-03 applied as 202609010060 — applied_held.
  // INS-01 applied as 202609100010 — applied_held.
  // INS-03 applied as 202609010080 — applied_held.
  // INS-04 applied as 202609010090 — applied_held.
  // 202609140000 (LEGAL-PAPER-01 signed_on_paper) is NOT here any more: re-proved APPLIED on prod
  // 2026-07-26T17:31:50Z (cursor-owner-batch). Live re-check on br-fancy-credit-akjnd07a, positive
  // control 762 canonical ledger rows: present in BOTH ledgers; pg_enum contract_instance_status now
  // reads draft,sent,viewed,signed_electronically,signed_on_paper,voided,expired; pg_constraint HAS
  // contract_instances_paper_signature_evidence_check. Its former held[] entry asserted all three were
  // ABSENT — accurate when authored, FALSE from 17:31Z onward, i.e. this guard was certifying a
  // migration as unapplied while prod had applied it. Moved to applied_held. It left the list the way
  // the charter allows (GUARD re-proved it applied), never by weakening a check.
  // INS-02 applied as 202609100020 — applied_held.
  // F9-04 applied as 202609100030 — applied_held.
  // FACT-01 applied as 202609100040 — applied_held.
  // C9 / MNT-ECON-04 also left EXPECTED_HELD 2026-07-26 after Cursor owner Neon-apply + ledger-backfill
  // (moved to applied_held[] with applied_on_prod:true).
  // MNT-LINK-03b + MNT-ENT-01 (PR #3655) — HOLD migs authored 2026-07-27, never Neon-applied.
  // Absent from _system._schema_migrations by construction (new on branch). Leave this list only after
  // owner Neon-apply + ledger-backfill and GUARD re-proves both ledger rows.
  "202609100060_mnt_link_03b_wo_source_intransit_fk.sql",
  "202609100070_mnt_ent_01_parts_inventory_company_fk.sql",
  // ND-INV-01 stage 1 (#3658). Authored on this branch; NEVER applied on prod — GUARD §3 allowlist
  // must list it until owner Neon-applies + ledger-backfills. Same pattern as MNT-LINK-03b / MNT-ENT-01.
  "202609100090_nd_inv_01_proforma_invoice_pipeline.sql",
  // FLT-02 class seed Neon-applied 2026-07-27 → applied_held in .held-migrations.json (NOT EXPECTED_HELD).
  // FACT-02 HOLD until Jorge Neon-apply (2026-07-27).
  "202610010000_fact_02_subledger_je_fk.sql",
  // DISP-01 (#3663) owner Neon-applied 202609290000 — moved to applied_held[]; not in EXPECTED_HELD.
];

/**
 * Pure check — takes an already-parsed registry object so --selftest can inject fixtures without
 * touching disk.
 * @param {{held?: Array<{file:string, applied_on_prod?: boolean}>, applied_held?: Array<{file:string, applied_on_prod?: boolean}>}} registry
 * @returns {string[]} problems (empty = PASS)
 */
export function assertHeldRegistryLedgerParity(registry, expectedHeld = EXPECTED_HELD) {
  const problems = [];
  const held = Array.isArray(registry?.held) ? registry.held : [];
  const appliedHeld = Array.isArray(registry?.applied_held) ? registry.applied_held : [];

  // (1) no duplicates within or across the two arrays.
  const seen = new Map(); // file -> which array(s) it appeared in
  for (const [arrName, arr] of [["held", held], ["applied_held", appliedHeld]]) {
    for (const entry of arr) {
      const f = entry?.file;
      if (!f) continue;
      if (!seen.has(f)) seen.set(f, []);
      seen.get(f).push(arrName);
    }
  }
  for (const [file, arrs] of seen) {
    if (arrs.length > 1) {
      problems.push(
        `${file}: appears ${arrs.length}x across [${arrs.join(", ")}] — duplicate registry entries reintroduce the exact "which flag wins" ambiguity behind SAF-F02/F04 (GUARD §1/§4)`
      );
    }
  }

  // (2) `held` equals EXACTLY the 12-file allowlist — no more, no fewer.
  const heldFiles = new Set(held.map((h) => h.file).filter(Boolean));
  const expected = new Set(expectedHeld);
  const missing = expectedHeld.filter((f) => !heldFiles.has(f));
  const extra = [...heldFiles].filter((f) => !expected.has(f));
  if (missing.length) {
    problems.push(
      `held[] is missing ${missing.length} file(s) from the GUARD §3 allowlist: ${missing.join(", ")} — a genuinely-unapplied held migration must never silently disappear from held[]`
    );
  }
  if (extra.length) {
    problems.push(
      `held[] has ${extra.length} unexpected file(s) not in the GUARD §3 allowlist: ${extra.join(", ")} — either GUARD re-proved this file unapplied (update EXPECTED_HELD with a fresh GUARD cross-check citation) or it drifted back into held[] by mistake`
    );
  }

  // (3) every applied_held entry explicitly says so.
  for (const entry of appliedHeld) {
    if (entry?.applied_on_prod !== true) {
      problems.push(
        `${entry?.file ?? "(no file)"}: listed in applied_held[] but applied_on_prod !== true — array membership IS the state; a stray unflagged entry defeats the split`
      );
    }
  }

  // (4) no held entry claims applied.
  for (const entry of held) {
    if (entry?.applied_on_prod === true) {
      problems.push(
        `${entry?.file ?? "(no file)"}: listed in held[] (genuinely unapplied) but carries applied_on_prod:true — self-contradictory; move it to applied_held[] instead`
      );
    }
  }

  return problems;
}

function loadRegistry(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

if (SELFTEST) {
  const real = loadRegistry(REG_PATH);
  const failures = [];

  // 0) the live registry must be fully reconciled right now.
  const live = assertHeldRegistryLedgerParity(real);
  if (live.length) failures.push(`live registry NOT reconciled:\n  ${live.join("\n  ")}`);

  // 1) duplicate across held + applied_held must be caught.
  // Arms 1-3 use a SYNTHETIC allowlist + synthetic held[], not the live registry. The real held[] is
  // legitimately EMPTY now (zero genuinely-unapplied migrations on prod), and a selftest that can only run
  // when live data happens to be non-empty is a selftest that silently stops testing — the exact
  // can't-fail shape this repo has been removing. Passing `expectedHeld` explicitly keeps every arm real
  // regardless of what prod looks like.
  const SYN_HELD = [{ file: "209999990001_synthetic_unapplied.sql", reason: "selftest fixture" }];
  const SYN_ALLOW = ["209999990001_synthetic_unapplied.sql"];

  if (real.applied_held.length === 0) {
    failures.push("selftest: real registry has an empty applied_held[] — cannot plant the duplicate fixture");
  } else {
    const dupFile = real.applied_held[0].file;
    const withDup = {
      held: [...SYN_HELD, { file: dupFile, reason: "planted dup" }],
      applied_held: real.applied_held,
    };
    const caught = assertHeldRegistryLedgerParity(withDup, [...SYN_ALLOW, dupFile]);
    if (!caught.some((e) => e.includes(dupFile) && e.includes("appears"))) {
      failures.push("selftest: cross-array duplicate was NOT caught");
    }
  }

  // 2) held[] missing one of the 12 must be caught.
  {
    const withMissing = { held: [], applied_held: real.applied_held };
    const caught = assertHeldRegistryLedgerParity(withMissing, SYN_ALLOW);
    if (!caught.some((e) => e.includes("is missing"))) {
      failures.push("selftest: held[] missing an allowlisted file was NOT caught");
    }
  }

  // 3) held[] with an extra (unexpected) file must be caught.
  {
    const withExtra = {
      held: [...SYN_HELD, { file: "209999990000_not_on_the_allowlist.sql", reason: "planted extra" }],
      applied_held: real.applied_held,
    };
    const caught = assertHeldRegistryLedgerParity(withExtra, SYN_ALLOW);
    if (!caught.some((e) => e.includes("unexpected"))) {
      failures.push("selftest: held[] with an unexpected extra file was NOT caught");
    }
  }

  // 4) applied_held entry missing applied_on_prod:true must be caught.
  {
    const [first, ...rest] = real.applied_held;
    const withUnflagged = { held: real.held, applied_held: [{ ...first, applied_on_prod: undefined }, ...rest] };
    const caught = assertHeldRegistryLedgerParity(withUnflagged);
    if (!caught.some((e) => e.includes("applied_on_prod !== true"))) {
      failures.push("selftest: applied_held entry missing applied_on_prod:true was NOT caught");
    }
  }

  // 5) held entry wrongly flagged applied_on_prod:true must be caught.
  {
    const [first, ...rest] = real.held;
    const withFlagged = { held: [{ ...first, applied_on_prod: true }, ...rest], applied_held: real.applied_held };
    const caught = assertHeldRegistryLedgerParity(withFlagged);
    if (!caught.some((e) => e.includes("self-contradictory"))) {
      failures.push("selftest: held entry wrongly flagged applied_on_prod:true was NOT caught");
    }
  }

  if (failures.length) {
    console.error(`[${LABEL}] SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(
    `[${LABEL}] SELFTEST PASS — 5 planted defect shapes (cross-array dup, held missing allowlisted file, held extra file, unflagged applied_held, self-contradictory held) all caught; live registry reconciled.`
  );
  process.exit(0);
}

const registry = loadRegistry(REG_PATH);
const problems = assertHeldRegistryLedgerParity(registry);
if (problems.length) {
  console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `[${LABEL}] OK — ${registry.held.length} genuinely-unapplied held file(s) match the GUARD §3 allowlist exactly, ` +
    `${registry.applied_held.length} applied_held file(s) all flagged applied_on_prod:true, no duplicates. ` +
    `NOTE: this is a STATIC check only — it does NOT connect to Neon or re-derive the split from a live ledger read. ` +
    `The live _system._schema_migrations / ih35_migrations.applied_migrations cross-check is owner/GUARD's job ` +
    `(docs/trackers/GUARD-HELD-REGISTRY-LEDGER-CROSSCHECK-2026-07-25.md) — re-run it whenever a new PR adds a held migration.`
);
