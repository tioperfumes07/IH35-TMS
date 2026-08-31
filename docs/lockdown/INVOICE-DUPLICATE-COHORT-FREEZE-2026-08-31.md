# INVOICE DUPLICATE COHORT — FREEZE (owner ruling 2026-08-31)

**Status:** CLOSED · **Option 3: STOP**

**Supersedes:** any amount+customer duplicate void/sweep plan · blind "void the other 7" playbook · Send/Factor on duplicate cohort until crosswalk exists.

---

## Owner ruling (verbatim intent)

> Stop. Do not Void, do not Send, do not Factor. Not caution by default.
> The plan is provably wrong on its own first example, and there is already live exposure underneath it.

---

## Why amount+customer matching is forbidden

The proposed match rule (same customer + same amount → keep one, void the rest) was withdrawn earlier this session after live proof showed it is unsound.

**Live proof:** `L-20260830-0018` and `L-20260830-0028` — both $4,900, both properly load-linked — are most likely **two real loads at the same rate**. Blind cleanup would void a legitimate invoice.

Under the Faro agreement, each purchased account must be **"free from any claim, dispute, deduction and/or offset."** A duplicate open A/R for the same customer and amount is exactly that — repurchase obligation lands on the owner, not Faro.

---

## Prod facts (verified 2026-08-31 before ruling)

### First example the plan got wrong ($3,600)

Not two invoices — **three**:

| Display ID | Shape | Notes |
|------------|-------|-------|
| `INV-2026-00049` | orphan draft | `is_sample_data=false`, created 2026-08-30 21:19 |
| `INV-2026-00061` | orphan draft | same timestamp cohort |
| `L-20260830-0011` | load-linked | canonical replacement candidate |

Voiding 00049 and 00061 **without document-proven replacement crosswalk** leaves duplicates behind. "Same pattern for the other 7" would leave a duplicate behind each time.

### Real cohort size and shapes

**19 duplicate groups**, not 8 — **five different shapes**, three of which have **no safe blind rule**:

| Shape | Example | Why blind void fails |
|-------|---------|----------------------|
| Four copies, two already sent | $4,800 group: INV-00075, INV-00077, L-0023[sent], L-0025[sent] | Sent + submitted exposure |
| Two orphans, no linked replacement | INV-00069 + INV-00080 @ $4,900 | Voiding both destroys only revenue record |
| Both paid | INV-00035 + INV-00036 @ $1,000 | Real money moved — cannot void |
| Two legitimate load-linked twins | L-0018 + L-0028 @ $4,900 | Two real loads at same rate |
| Orphan + load-linked (3-way) | 00049 + 00061 + L-0011 @ $3,600 | Need document crosswalk, not amount match |

### Live exposure already submitted

**11 invoices · $30,800 · `status=sent` AND `factoring_status=submitted`**

Every one sits in a duplicate group with an open twin. Sending and factoring more on top makes repurchase exposure worse. **Triage with Faro separately** before they age into repurchase.

---

## Required sequence (in order)

1. **FREEZE** Send / Factor / bulk void on this entire duplicate cohort — all seats, immediately.
2. **BUILD** orphan→replacement crosswalk from **document evidence only** — same bar as Faro↔QBO reconciliation (**21 proven links, zero inferred**). No amount+customer inference.
3. **VOID** each orphan only after crosswalk names its **specific replacement ID** — WORM void reason must cite replacement display_id/uuid.
4. **TRIAGE** the 11 already-submitted invoices with Faro **before repurchase clock** — CC-1 + owner, not automated sweep.

---

## Seat law

| Seat | DO | DO NOT |
|------|-----|--------|
| CC-1 / CC-3 / Codex / Devin-A | Continue non-duplicate Faro purchases per REV E partition · build crosswalk rows with document proof | Send/Factor on any row in duplicate cohort · amount+customer void sweep |
| CC-2 | Grade crosswalk completeness · flag submitted-11 exposure | Infer replacements from Neon amount match |
| Cursor | Keep this file + GO master + INBOX TOP synced | Ship any guard that auto-voids on amount+customer |
| Cascade | Append FINDING rows for new duplicate shapes discovered live | Re-open amount-match cleanup plan |

---

## ACK

`SEAT | ACK | INVOICE-DUPLICATE-COHORT-FREEZE | STOP-SEND-FACTOR-VOID-SWEEP | GO`
