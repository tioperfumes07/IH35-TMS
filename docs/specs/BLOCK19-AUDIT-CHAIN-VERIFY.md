# Block-19 — Audit Hash-Chain VERIFICATION Layer (design)

> **HOLD LANGUAGE SUPERSEDED — OWNER LAW 2026-08-03 / owner directive 2026-08-06.** There are NO holds and no approval gate. All owner questions are asked-and-answered. Coders build, apply on Neon, and MERGE ON GREEN with proof. Any "build-and-hold", "Jorge merges", "never self-merge" or "wait for approval" wording below is HISTORICAL RECORD ONLY and must not be followed.

**Status:** SPEC. The write-path (tamper-evident hash chain) is BUILT + CI-guarded. This spec designs the
remaining **verification/signing** layer. It contains an **owner decision** (schema retrofit of the
append-only `events.event_log`) that must be ratified before the migration is written → **Tier-1
build-and-ship.** Verified against live schema 2026-07-02.

---

## 1. What exists (write-path — do NOT rebuild)
`db/migrations/202606111050` (spine) + `202606111051` (immutable + chain):
- `events.event_log` (append-only; UPDATE/DELETE blocked by `event_log_append_only_trigger`) with columns
  `event_id uuid`, `operating_company_id`, `event_type`, `actor_type/actor_id`, `subject_type/subject_id`,
  `occurred_at timestamptz`, `payload jsonb`, **`prev_hash text`, `hash text`**.
- `events.calculate_event_hash(prev_hash, event_id, occurred_at, actor_id, event_type, subject_id, payload)`
  → `encode(digest(coalesce(prev_hash,'') || event_id::text || occurred_at::text || coalesce(actor_id::text,'')
  || event_type || coalesce(subject_id::text,'') || coalesce(payload::text,''), 'sha256'), 'hex')`.
- On INSERT the trigger sets `prev_hash :=` the `hash` of the **most-recent-by `occurred_at`** row for that
  company, then `hash := calculate_event_hash(...)`. Chain is **per operating_company_id**.

## 2. The gap (this spec)
No verification layer: no job recomputes/compares the chain, there is no `ops.audit_chain_verifications`
record of verification runs, and (see §3) no monotonic ordering column to walk the chain deterministically.

## 3. The crux — the chain has no deterministic total order (owner decision)
The trigger links `prev_hash` to the row with `MAX(occurred_at)` **at insert time**. `occurred_at` is a
sensor/user timestamp — it is **NOT guaranteed monotonic with insert order** (a late-arriving event with an
earlier `occurred_at`, or two events sharing an `occurred_at`, break the assumption). So "walk the chain by
`occurred_at`" can disagree with the actual link order the trigger used — producing **false tamper
positives**. For court/CPA-grade audit that is worse than no verifier.

**Robust verification requires a monotonic, insert-order sequence — retrofitted GENESIS-ANCHORED, with NO
backfill of historical rows** (owner-ratified 2026-07-02):
- **ADD COLUMN `chain_seq bigint` NULL** on `events.event_log`. *ADD COLUMN is DDL, not a row mutation —
  append-only immutability (no UPDATE/DELETE of existing rows) is preserved.*
- **`chain_seq` is populated EXCLUSIVELY by the INSERT path** (the append-only trigger, from a per-company
  sequence). **Existing rows are NEVER UPDATEd to set `chain_seq`** — writing a sequence onto historical
  audit rows is an UPDATE against a WORM (write-once-read-many) audit log, the exact thing an auditor flags,
  even when payload columns are untouched. **No backfill. Ever.**
- **Genesis anchor:** at deployment, each company's sequence starts from a genesis value; the first
  post-deploy event is `chain_seq = genesis`. Pre-retrofit rows keep `chain_seq = NULL`.
- **Two verification regimes, split at the anchor:**
  - **Pre-retrofit rows (`chain_seq IS NULL`):** verified by the **existing `prev_hash` linkage only** — walk
    by the stored `prev_hash → hash` chain (each row's `prev_hash` must equal some earlier row's `hash`), and
    recompute each row's own `hash`. Ordering isn't asserted for these (it was never deterministically
    captured); tampering with a row's content still fails the per-row hash recompute.
  - **Post-retrofit rows (`chain_seq IS NOT NULL`):** verified by **`chain_seq` order** (deterministic) — the
    full ordering + linkage check.
- The trigger's `prev_hash` lookup moves to `ORDER BY chain_seq DESC NULLS LAST` (deterministic for the
  post-anchor chain).
- **Hard invariant + CI guard:** there must be **NO UPDATE or DELETE path against `events.event_log`
  anywhere** (the migration itself must not backfill; the trigger only fires on INSERT). A static guard
  asserts this.

**OWNER DECISION (RATIFIED):** ADD COLUMN + genesis-anchor + INSERT-only population, **no historical
backfill**. ALTER TABLE trips PROTECTED on the hold-merge-gate → Tier-1 build-and-ship; GUARD verifies these
§3 claims against the PR before any JORGE-APPROVED label.

## 4. Verification — recompute IN SQL (never in JS)
The hash mixes `occurred_at::text` and `payload::text` — Postgres' `timestamptz`/`jsonb` text formatting is
non-trivial to reproduce byte-for-byte in JS. **The verifier must recompute via the existing
`events.calculate_event_hash` SQL function**, guaranteeing parity. Per company. **Per-row hash recompute
applies to ALL rows** (catches content tampering regardless of regime); the **ordering/linkage check applies
only to the post-anchor deterministic chain** (`chain_seq IS NOT NULL`):
```sql
WITH chain AS (
  SELECT event_id, chain_seq, prev_hash, hash,
    events.calculate_event_hash(prev_hash, event_id, occurred_at, actor_id, event_type, subject_id, payload)
      AS recomputed,
    -- expected_prev only for the post-anchor chain; NULL chain_seq rows are excluded from ordering.
    lag(hash) OVER (PARTITION BY operating_company_id ORDER BY chain_seq)
      FILTER (WHERE chain_seq IS NOT NULL) AS expected_prev
  FROM events.event_log WHERE operating_company_id = $1
)
SELECT count(*) AS checked,
       count(*) FILTER (WHERE recomputed <> hash) AS hash_breaks,          -- all rows
       count(*) FILTER (WHERE chain_seq IS NOT NULL
                          AND prev_hash IS DISTINCT FROM expected_prev) AS link_breaks,  -- post-anchor only
       min(chain_seq) FILTER (WHERE recomputed <> hash
                          OR (chain_seq IS NOT NULL AND prev_hash IS DISTINCT FROM expected_prev))
         AS first_break_seq
FROM chain;
```
`recomputed <> hash` (any row) = that row's content was altered. `prev_hash <> expected_prev` (post-anchor) =
a row was inserted/removed/reordered in the deterministic chain. Either → tamper. (Pre-anchor rows also carry
a `prev_hash` linkage that can be walked pointer-by-pointer for a weaker, order-independent linkage check;
the per-row hash recompute is the strong guarantee for them.)

## 5. Record table (Tier-1 migration, build-and-ship)
`ops.audit_chain_verifications` (ops schema exists; grant USAGE + table grants per the 0192 pattern):
`id uuid pk`, `operating_company_id uuid NOT NULL`, `run_at timestamptz DEFAULT now()`, `events_checked bigint`,
`hash_breaks bigint`, `link_breaks bigint`, `chain_ok boolean`, `first_break_seq bigint NULL`,
`verifier_version text`. Append-only (no UPDATE/DELETE grant); entity-scoped FORCED RLS; index
`(operating_company_id, run_at DESC)`.

## 6. Cron + guard
- **Cron** `audit-chain-verify.cron.ts` — daily (and on-demand) per company: run §4, INSERT one
  `ops.audit_chain_verifications` row; on `chain_ok=false` emit a CRITICAL alert (Sentry + an event) naming
  `first_break_seq`. Read-only against `event_log` (never writes/deletes it).
- **CI guard** `verify-audit-chain-verify.mjs`: assert (a) `ops.audit_chain_verifications` migration present
  with FORCED RLS + no-DELETE grant, (b) the verifier uses `events.calculate_event_hash` (no JS sha256 of
  event fields), (c) the cron is registered, and (d) **the WORM invariant — NO `UPDATE events.event_log` /
  `DELETE FROM events.event_log` anywhere in `db/migrations/**` or `apps/backend/src/**` (the `chain_seq`
  retrofit migration must ADD COLUMN only, never backfill; population is INSERT-trigger-only).**

## 7. Build order (all Tier-1 / build-and-ship — the coder merges on green)
1. **B19-V1** (after owner ratifies §3): migration = `chain_seq` ADD COLUMN + trigger reorder + backfill.
2. **B19-V2**: migration = `ops.audit_chain_verifications` + the verify SQL service (read-only) + guard.
3. **B19-V3**: the daily cron + CRITICAL-alert-on-break.

## 8. Cross-refs
Corrects [[block19-audit-hash-chain-gap]] (write-path is BUILT; only this verify layer remains).
The system holds legal-evidence data (CLAUDE.md preamble) — this is the layer that lets us *prove*
the audit trail wasn't tampered with, so correctness here is the whole point: **do not ship a verifier that
can false-positive; ratify the ordering retrofit (§3) first.**
