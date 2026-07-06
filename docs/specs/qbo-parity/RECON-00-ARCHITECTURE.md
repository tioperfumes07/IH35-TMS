# RECON-00 — TMS ↔ QBO Reconciliation Architecture (canonical pointer)

**Status:** LOCKED architecture, docs-only. This file does not introduce new decisions — it is the
single, stable, easy-to-find pointer into the qbo-parity folder for anyone asking "what's the TMS↔QBO
architecture?" The full spec and current build status already exist and are the sources of truth; do
not fork a second copy of this content here.

## Read these, in this order

1. **`docs/lockdown/00_LOCKED_DECISIONS.md` §8** — the shortest statement of the law. Owner-locked,
   never re-litigated without Jorge.
2. **`docs/specs/ACCOUNTING-ARCHITECTURE.md`** — the parallel-books architecture in full (clone-once,
   reconcile-only, cutover is event-gated not date-gated).
3. **`docs/specs/TMS-QBO-RECONCILIATION.md`** — the RECON-00 architecture spec itself (this doc's
   header literally reads *"Architecture Spec (RECON-00)"*): the two Jorge-locked scheduled passes,
   the exception classes, the benchmark table against QBO/NetSuite/McLeod/Alvys, and the maker≠checker
   model.
4. **`docs/specs/qbo-parity/QBO-RECONCILIATION-MODULE-SPEC-2026-07-04.md`** — current **build status**
   (RECON-01/02 schema, engine, cron, and read API/UI are already built; see below).

## The architecture, in one paragraph

TMS and QuickBooks Online are **two independent books with NO sync** — no write path either direction.
QBO is TRANSP's book of record through the cutover ceremony (event-gated, not calendar-gated; the
12/31/2025 target date has passed with no flip — parallel continues until a final clone + to-the-cent
tieout + book-lock). A one-time **clone-once** backfill imported QBO master data + AR + AP + GL into
TMS. From then on, both systems **independently register the same daily activity**, and a
**twice-daily reconciliation module** — **06:00 CT (bank-count pass) / 19:00 CT (categorization-diff
pass)** — reads both sides and **flags every divergence** for a human to resolve through the normal
gated transaction paths. It **never auto-fixes** and is **read-only against QBO forever**. USMCA has no
QuickBooks and is TMS-authoritative from day one — never part of this clone/reconcile.

## Current build status (verified against source, 2026-07-06)

Per `QBO-RECONCILIATION-MODULE-SPEC-2026-07-04.md`, RECON-01/02 are **already built**, not just
designed: schema (`accounting.recon_runs` / `accounting.recon_exceptions`, migration `202607022100`),
engine (`recon-engine.service.ts`), cron (`reconciliation-worker.cron.ts` + `recon-cron.service.ts`,
firing at the 06:00/19:00 CT times above), and a read API + UI at
`/accounting/qbo-reconcile` under the Accounting module (§7-correct — not a new sidebar item). The one
remaining seam is `createQboReconSource()` (currently a stub returning `null` — by design, so an
unconnected entity is skipped rather than false-flagged), gated behind `TMS_QBO_RECON_ENABLED`
(default OFF, per-entity). Wiring it requires (a) an owner-initiated QBO connection per entity
(`integrations.qbo_connections` is currently empty) and (b) flipping the flag — both §1.3/§1.6 owner
actions, never an agent's to flip.

## Why this file exists instead of a fifth copy of the architecture

Two files already state this architecture in full and would drift if a third, independently-maintained
copy existed. This file is intentionally thin — a stable path for anyone who searches for
"RECON-00" without already knowing the two files above, per the additive-only / no-silent-redesign
rule (never fork a duplicate source of truth for a locked decision).
