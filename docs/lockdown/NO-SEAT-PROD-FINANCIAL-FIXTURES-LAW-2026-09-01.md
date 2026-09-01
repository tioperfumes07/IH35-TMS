# NO SEAT PROD FINANCIAL FIXTURES (owner-locked 2026-09-01 — PERMANENT · ALL SEATS)

**Owner word (2026-09-01, chat tonight):** **NO seat-created financial records in production.** Effective immediately for every seat (Cursor, CC-1, CC-2, CC-3, Codex, Cascade, Devin, Devin-A).

**Answered = closed.** Do not re-ask. Do not leave standing fixtures “for later void.” Do not override the owner with seat memos.

---

## 1. The law (non-negotiable)

1. **Production financial records are either the owner’s real transactions or contamination.** There is no third category of “seat TEST we keep until launch.”
2. **FORBIDDEN:** Any financial row created by a seat in prod for fixtures, probes, proofs, scratch, lifecycle demos, or “certify hops” **unless** it is part of an **owner-ordered live walk** (see §2).
3. **FORBIDDEN:** Leaving a standing fixture in prod. Verification pattern is always **create → prove → void in the same session** with a **reversing entry** (WORM; void by UUID; never DELETE money rows).
4. **FORBIDDEN:** Seat memos or descriptions that instruct others **not** to void, e.g. **“do not void”**, **“KEEP TEST”**, **“void later”**, **“leave for regression”** — that is a seat overriding the owner in **his** ledger.
5. **Empty TMS tables remain expected** (not a defect). **Do not invent financial rows for “proof.”** Prove via owner-ordered walks or non-money surfaces; do not contaminate prod GL/AP/AR/cash.
6. **No TMS→QBO write-back.** USMCA TMS is authoritative for seat behavior; prod is not a shared scratch pad.

---

## 2. PERMITTED — owner-ordered live walk only

The **only** exception to §1 is an **owner-ordered live walk**:

- The owner **lists** the documents/entities **before** the walk starts (manifest).
- The walk is **sanctioned by him** in chat (decision, not a label).
- Each created financial record is **voided in the same session** with a **reversing JE** (report **record id + reversing JE id** in OUTBOX / evidence).
- Nothing from the walk may remain on the books at session end.

Seats may still use **non-financial** TEST (labels, ops rows where policy allows) per companion laws — but **money tables in prod** follow this file first.

---

## 3. Scope (prod money writers)

Treat as in-scope for this law (non-exhaustive; prod writes that move or seed money paths):

| Area | Canonical targets (examples) |
|------|------------------------------|
| Accounting | `accounting.*` (bills, expenses, invoices, payments, JEs, bill payments, …) |
| Banking | `banking.*` (matches, reconcile posts, register lines tied to money) |
| Settlements / driver finance | `driver_finance.*` (settlements, lines, advances, escrow movements) |
| Factoring | `factoring.*` (batches, advances, fees — money-bearing) |
| Master data that seeds money | `mdata.vendors`, `mdata.customers` when created to **open a money wizard path** in prod |

When in doubt: if the create **can** post or **enables** a prod money hop, it is in scope.

---

## 4. Why “TEST” in the name is NOT a control

Owner adjudicated **17 expenses** on prod (2026-09-01). Real operational and evidence transactions also carry `is_sample_data=false` and innocent substrings (**ID DOT EST**, **WHITESTOWN**, **$1 Zelle** embezzlement evidence). **Naming alone does not segregate seat contamination from real money.**

Therefore:

- **`is_sample_data` alone is insufficient** for “safe to leave in prod.”
- **Seat-created prod financial rows must not be left standing** regardless of memo prefix.
- Reports excluding sample data (G1) remain required — but **seats must not add unlabeled or “keep forever” prod money** (see `docs/lockdown/TEST-LABEL-G1-AND-CUTOVER-FALSE-ALARM-LAW-2026-08-28.md` for labeling mechanics, not permission to litter prod).

---

## 5. Examples of forbidden contamination (2026-09-01 night)

Named prod fixtures the owner flagged (void/cleanse under owner direction — **seats do not recreate**):

- **TEST-VOID-LATER Vendor 0822**
- **DEVIN-LIFECYCLE-TEST**
- **TEST CODEX ONBOARD 20260824**
- **SAMPLE Cascade-2042**
- Memos: **“do not void”**, **“KEEP TEST”**, and similar seat override language

---

## 6. CC-2 guard requirement (law = enforced guard)

**Lane:** CC-2 (verify live, never build product — guard + workflow wiring).

Ship a **ratcheting guard** that **FAILs** when a **production financial record** is created **outside** an **owner-ordered walk manifest** (mechanism TBD in guard design — manifest file, env flag, or audited allowlist **named in CI**).

Requirements:

1. Guard registered and run in **CI** via verify-step (CC-2 band + claim-before-write per Rule 25/37).
2. **Named in a workflow** (required check or documented job) so silent prod creates cannot return.
3. **DRAIN_PROOF:** guard fails on planted “seat fixture create” path; passes when only manifest-scoped creates occur (or no create).
4. Cursor **does not** author this guard in the law PR — board routes to CC-2 (`docs/audit/GUARD-WORKORDERS.md`).

---

## 7. Supersession vs CREATE-TEST-THEN-VOID

**Supersedes** for **seat-created prod financial fixtures** the following readings of `docs/lockdown/CREATE-TEST-THEN-VOID-LAW-2026-08-22.md`:

- **“Keep TEST on the books”** / **“do not void until launch”** / **“do not void-all-TEST”** as permission to **leave seat money in prod**.

**Still in force** from CREATE-TEST-THEN-VOID:

- Empty TMS tables are **expected** (not a certify stop).
- **Owner-ordered walks:** create → prove → **void same session** (this file makes that mandatory for money).
- **Void only** for true reversal tests **within** a session — not an excuse to accumulate prod fixtures.
- Disabled chrome: select row or create **only** under owner walk manifest for **money**; do not report “empty ledger” without the authorized hop.
- Banking/Accounting **proof** must not contaminate prod outside §2.

Canonical companion: `docs/lockdown/CREATE-TEST-THEN-VOID-LAW-2026-08-22.md` (banner points here).

---

## 8. Enforcement pointers

- Session announce: `docs/lockdown/SESSION-ANNOUNCE-CURRENT-LAW-HOPS-2026-08-22.md` CURRENT-LAW bullet
- Cursor rule: `.cursor/rules/43-create-test-then-void.mdc` (supersession note)
- Board: `docs/audit/GUARD-WORKORDERS.md` — `NO-SEAT-PROD-FINANCIAL-FIXTURES`
- CC-2 INBOX: `docs/bus/INBOX-CC-2.md`

**USMCA only** until launch (`docs/lockdown/USMCA-ONLY-UNTIL-LAUNCH-LAW-2026-08-19.md`). This law applies to **prod** financial writes regardless of entity focus.

