#!/usr/bin/env node
/**
 * C25–C31 — THE SEVEN ECONOMIC COLUMNS, AS EXECUTABLE PROOFS
 *
 * Definitions are NOT authored here. They are ratified from
 *   docs/specs/scoreboard/columns.economic.json   (authored 2026-08-28, owner-ratified 2026-08-30)
 * This file only binds each definition to the invariant that already proves it in
 *   scripts/verify-gl-invariants.sql
 * so a machine can replay it. If the two ever disagree, columns.economic.json wins and this
 * file is the thing that is wrong.
 *
 * Every proof is kind "sql", so every one inherits the six rules in sql-runner.mjs — above all
 * R1 (a discriminator is mandatory) and R2 (empty is never PASS). Without those two, an
 * RLS-scoped read returning nothing would satisfy "difference == 0" and every economics column
 * on the board would go green while the ledger was wrong. That is the single most dangerous
 * failure this file exists to make impossible.
 */
export const INVARIANTS_FILE = "scripts/verify-gl-invariants.sql";

/** je_control: accounting.journal_entries row count. Non-zero, known, and cheap to re-read. */
export const DISCRIMINATOR = { column: "je_control", value: 2214 };

/**
 * The probe block for every zero-rows proof. Must be ADDED to verify-gl-invariants.sql:
 *
 *   \echo '=== INV-0  CONTROL (discriminator: this connection can see the ledger) ==='
 *   SELECT count(*) AS je_control FROM accounting.journal_entries;
 *
 * Without it a zero-rows proof cannot tell a clean ledger from a blind read.
 */
export const PROBE_QUERY_ID = "INV-0";

export const ECON_PROOFS = {
  gl_delta: {
    n: "C25", auto_check: "verify-gl-delta-matches-matrix",
    proves: "The JE hits the exact accounts and signs the posting matrix specifies. Balanced is not correct.",
    proof: {
      kind: "sql", name: "C25 GL delta matches posting matrix",
      file: INVARIANTS_FILE, query_id: "INV-4",
      discriminator: DISCRIMINATOR,
      expect_rows: 0, probe_query_id: PROBE_QUERY_ID,
      expect: [],
      // packet 10 (2026-08-30): entity-wide ledger total, not an isolation proof -- bypass is
      // correct here (and mandatory, or RLS with no company context reads blind and every
      // column fails on R1-b for the wrong reason). Never used on C30 (see entity_isolation).
      rls: "bypass",
      note: "INV-4 lists sent/partial/paid TMS invoices with NO invoice-sourced GL posting. Zero rows is the only pass.",
    },
  },
  subledger_tie: {
    n: "C26", auto_check: "verify-subledger-tieout",
    proves: "After this leaf's action the module's subledger still equals its GL control account, to the cent.",
    proof: {
      kind: "sql", name: "C26 subledger ties to control account",
      file: INVARIANTS_FILE, query_id: "INV-3",
      discriminator: DISCRIMINATOR, probe_query_id: PROBE_QUERY_ID,
      rls: "bypass",
      expect: [
        { column: "ar_difference", op: "==", value: 0 },
        { column: "ap_difference", op: "==", value: 0 },
      ],
    },
  },
  lifecycle_complete: {
    n: "C27", auto_check: "verify-no-stranded-intermediate",
    proves: "Nothing parked in Unbilled Revenue, Undeposited Funds or Cash Clearing.",
    proof: {
      kind: "sql", name: "C27 no stranded intermediate",
      file: INVARIANTS_FILE, query_id: "INV-6",
      discriminator: DISCRIMINATOR,
      expect_rows: 0, probe_query_id: PROBE_QUERY_ID,
      expect: [],
      rls: "bypass",
      note: "INV-6 returns only accounts with a non-zero balance. Zero rows is the only pass.",
    },
  },
  reversal_symmetry: {
    n: "C28", auto_check: "verify-reversal-symmetry",
    proves: "Void produces a linked equal-and-opposite entry; no JE is ever voided in place.",
    proof: {
      kind: "sql", name: "C28 reversal symmetry",
      file: INVARIANTS_FILE, query_id: "INV-11",
      discriminator: DISCRIMINATOR, probe_query_id: PROBE_QUERY_ID,
      rls: "bypass",
      expect: [{ column: "je_voided_in_place_must_be_0", op: "==", value: 0 }],
    },
  },
  period_guard: {
    n: "C29", auto_check: "verify-period-and-date-guard",
    proves: "Cannot post into a closed period, and cannot be dated beyond the approved horizon.",
    proof: {
      kind: "sql", name: "C29 future-dated entries",
      file: INVARIANTS_FILE, query_id: "INV-9",
      discriminator: DISCRIMINATOR, probe_query_id: PROBE_QUERY_ID,
      rls: "bypass",
      expect: [{ column: "future_dated", op: "==", value: 0 }],
    },
    // C29 has TWO halves. INV-9 is the date horizon. INV-8 is the lock itself, and it cannot
    // pass until the posting guard exists — see the note in the work order.
    second_half: {
      kind: "sql", name: "C29 at least one period closed with a lock date",
      file: INVARIANTS_FILE, query_id: "INV-8",
      discriminator: DISCRIMINATOR, probe_query_id: PROBE_QUERY_ID,
      rls: "bypass",
      expect: [{ column: "with_lock_date", op: ">", value: 0 }],
    },
  },
  entity_isolation: {
    n: "C30", auto_check: "verify-posting-flag-has-roles",
    proves: "Entity-pure posting, and every role the poster resolves is active and unambiguous in THIS entity.",
    proof: {
      kind: "sql", name: "C30 no duplicate role rows",
      file: INVARIANTS_FILE, query_id: "INV-10", sub_id: "10c",
      discriminator: DISCRIMINATOR,
      expect_rows: 0, probe_query_id: PROBE_QUERY_ID,
      expect: [],
      rls_sensitive: true,
      // packet 10 (2026-08-30) — explicit, not relying on the fail-closed default, because this
      // is THE line that must never read "bypass": bypassing RLS to prove RLS is the purest
      // closed loop the whole R5 rule exists to forbid. With no company context set, this
      // means C30 CANNOT currently pass (INV-0's shared probe reads blind under real RLS) —
      // that is honest, not a bug. A dedicated C30 probe that proves visibility under enforced
      // RLS WITH a company context is the next, separate piece of work (not this fix).
      rls: "enforced",
      note: "Order-dependent role resolution is the defect. Zero duplicate groups is the only pass.",
    },
  },
  non_empty_proof: {
    n: "C31", auto_check: "verify-non-empty-certification",
    proves: "Certified against a real, non-voided, NON-SAMPLE document. Honest-empty is UNVERIFIED, never PASS.",
    proof: {
      kind: "sql", name: "C31 no sample data inside the trial balance",
      file: INVARIANTS_FILE, query_id: "INV-7",
      discriminator: DISCRIMINATOR, probe_query_id: PROBE_QUERY_ID,
      rls: "bypass",
      expect: [{ column: "sample_jes", op: "==", value: 0 }],
    },
  },
};

export function proofFor(columnId) {
  const e = ECON_PROOFS[columnId];
  if (!e) throw new Error(`no economic proof bound for column "${columnId}"`);
  return e;
}
