# Block-19 — Audit Hash-Chain VERIFICATION Layer (design)

**Status:** SPEC. The write-path (tamper-evident hash chain) is BUILT + CI-guarded. This spec designs the
remaining **verification/signing** layer. It contains an **owner decision** (schema retrofit of the
append-only `events.event_log`) that must be ratified before the migration is written → **Tier-1
build-and-hold.** Verified against live schema 2026-07-02.

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

**Robust verification requires a monotonic, insert-order sequence.** Recommended:
- **ADD COLUMN `chain_seq bigint`** to `events.event_log`, assigned by the append-only trigger from a
  per-company sequence at INSERT (authoritative insert order going forward). *ADD COLUMN is DDL, not a row
  mutation — the append-only immutability (no UPDATE/DELETE of rows) is preserved.*
- **Backfill** historical rows' `chain_seq` in `(operating_company_id, occurred_at, event_id)` order — an
  **approximation** of the lost historical insert order, explicitly documented as best-effort for pre-retrofit
  rows. From the retrofit forward, `chain_seq` is exact.
- The trigger's `prev_hash` lookup also moves to `ORDER BY chain_seq DESC` (deterministic) instead of
  `occurred_at`.

**OWNER DECISION:** (a) approve ADD COLUMN + trigger change on the immutable `event_log`; (b) accept the
historical backfill approximation (alternative: mark pre-retrofit rows "unverifiable-order" and only verify
forward). Nothing is built until ratified.

## 4. Verification — recompute IN SQL (never in JS)
The hash mixes `occurred_at::text` and `payload::text` — Postgres' `timestamptz`/`jsonb` text formatting is
non-trivial to reproduce byte-for-byte in JS. **The verifier must recompute via the existing
`events.calculate_event_hash` SQL function**, guaranteeing parity. Per company:
```sql
WITH chain AS (
  SELECT event_id, chain_seq, prev_hash, hash,
    events.calculate_event_hash(prev_hash, event_id, occurred_at, actor_id, event_type, subject_id, payload)
      AS recomputed,
    lag(hash) OVER (PARTITION BY operating_company_id ORDER BY chain_seq) AS expected_prev
  FROM events.event_log WHERE operating_company_id = $1
)
SELECT count(*) AS checked,
       count(*) FILTER (WHERE recomputed <> hash) AS hash_breaks,
       count(*) FILTER (WHERE prev_hash IS DISTINCT FROM expected_prev) AS link_breaks,
       min(chain_seq) FILTER (WHERE recomputed <> hash OR prev_hash IS DISTINCT FROM expected_prev)
         AS first_break_seq
FROM chain;
```
A row where `recomputed <> hash` = the row itself was altered; `prev_hash <> expected_prev` = a row was
inserted/removed/reordered in the chain. Either → tamper.

## 5. Record table (Tier-1 migration, build-and-hold)
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
  event fields), (c) the cron is registered.

## 7. Build order (all Tier-1 / build-and-hold — Jorge merges)
1. **B19-V1** (after owner ratifies §3): migration = `chain_seq` ADD COLUMN + trigger reorder + backfill.
2. **B19-V2**: migration = `ops.audit_chain_verifications` + the verify SQL service (read-only) + guard.
3. **B19-V3**: the daily cron + CRITICAL-alert-on-break.

## 8. Cross-refs
Corrects [[block19-audit-hash-chain-gap]] (write-path is BUILT; only this verify layer remains).
The system holds legal-evidence data (CLAUDE.md preamble) — this is the layer that lets us *prove*
the audit trail wasn't tampered with, so correctness here is the whole point: **do not ship a verifier that
can false-positive; ratify the ordering retrofit (§3) first.**
