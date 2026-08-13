# 01 — FULL LINKAGE LAW · WEEKEND FINAL · 2026-08-12

**Sources:** `ARCHITECTURE-BLUEPRINT-2026-07-05.md` §9 · Rule 14 · Rule 21 · DoD A–E + VERIFY 1–8 · Claude.docx

Silence is a defect. Partial wiring is a defect. Scoreboard green without create-path stamps is theater.

---

## Multilayer stack (every money / ops hop)

```
UI leaf / modal / panel / wizard / picker
    ↓ submit (every rendered field in payload)
API route (rate-limited · entity-scoped · audit)
    ↓
Canonical table (prod-verified · not RETIRE)
    ↓ FKs stamped (forward)
Related modules (load · driver · unit · trailer · vendor · customer · WO · claim · bill · fuel · expense · safety · insurance · bank · GL)
    ↓
Reverse graph / related list / EntityLink (click both ways)
    ↓
Economics terminus (when money): lines + CoA + balanced JE via existing poster
    ↓
Guard + (after Built 100%) Live prove
```

---

## Double-routed (mandatory)

Every record must be reachable from:

1. Its **home module** leaf (tab / sub-tab / list / detail), **and**
2. Every **cross-module** link that claims to open it (EntityLink, reverse panel, related table, CoA register drill, Lists card).

Same UUID · same entity · same live data. A 404, empty tab, or wrong twin = FAIL.

---

## Accounting / economics / financial (CC-1 + money surfaces)

- Vendor **or** customer + GL account + audit on every money txn
- Header **and** lines · balanced JE · reuse `postSourceTransaction` (no new GL math)
- Parallel books · **no TMS→QBO write-back**
- Posting flags default OFF until owner chat flip · then prove live
- WORM · void = reversal · never DELETE financial rows
- TRANSP/USMCA own no assets today · all TMS-native data is TEST · only TRANSP QBO mirror is real
- Forward-only subledger→GL (no historical backfill of QBO mirror docs)
- Reserve / holdback accounts = owner-manual only

---

## Frontend + backend parity

| Layer | Done means |
|-------|------------|
| FE | Field controlled · in submit · picker law · correct chrome (Create/Book · drawer/panel per design) |
| BE | Params ordered · INSERT columns match · RLS · audit event |
| DB | Column exists on prod · FK to canonical · entity scope |
| Reverse | Endpoint/UI returns parent↔child |
| Guard | Fails on bug · passes on fix · EVEN/≡1/≡3 band + claim-before-write |

---

## Universal picker + creator (VERIFY-2) — live exercise after gate

Open combobox → catalog behind it → **`+ Add new` FIRST ROW** → wizard → writes **same** canonical table → appears · selected · survives reload · entity-scoped.

Applies to Lists cards and nested creators too.

---

## Module / tab / leaf law

Architectural design tab counts are law. Never ship fewer tabs. Never invent tabs without design update. Deep-link every leaf that the design says is live.

---

## Completeness discriminator (Neon)

`0` is not absence until app-path / completeness discriminator. Never invent linkage to “fix” empty historical import cohorts.
