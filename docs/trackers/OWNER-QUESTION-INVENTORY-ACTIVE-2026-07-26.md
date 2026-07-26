# OWNER QUESTION INVENTORY — how we gather answers in advance

**Owner ruling process (2026-07-26):**  
Yes — we **inventory pending blocks**, list every unanswered question **before code**, you answer once, we **save** answers in the design/law files, then builders implement without re-asking on PRs.

```
Pending blocks (packet / tracker)
        ↓
Claude or Cursor fills inventory (this file + per-block D-tables)
        ↓
Jorge answers in one sitting (plain English)
        ↓
Answers locked into docs/specs/*DESIGN* or 00_LOCKED_DECISIONS
        ↓
Build + Devin merge (no JORGE-APPROVED label)
```

---

## Layer A — Active Accounting + Banking DOM (this week)

| Block | Status | Unanswered for Jorge? |
|---|---|---|
| ACCT-DOM-01 | **LOCKED** (your D1–D6 today) | **None** — implement OK |
| ACCT-DOM-02 | Buildable read-only (#3601) | **None** (no posting; RECON-01 no $ threshold) |
| ACCT-DOM-03 | Neon applied; PR merge | **None** |
| BANK-DOM-01 | Neon applied; stamp #3603 | **None** |
| BANK-DOM-02 | Neon applied; PR merge | **None** |
| BANK-DOM-03 | Neon applied; PR merge | **None** |
| BANK-DOM-04 | Built / merge | **Optional Q:** escalation age (days) default — see **A1** below |
| BANK-DOM-05 | Claude building | **Likely Q:** due-to / due-from CoA roles — see **A2** |
| BANK-DOM-06 | Cursor building (#3602) | **Likely Q:** what counts as “overage” — see **A3** |
| MNT-ECON-02 | Design only | **D1–D5 open** — see **A4** (next sitting) |
| Escrow liability CoA role | Cross-list SAF/ACCT | **Owner Neon seed** (hands, not a policy debate) — **A5** |

### Answer these when ready (copy/paste)

**A1 — BANK-DOM-04 escalation (optional)**  
When should an aged reconciling item escalate?  
- Recommended: **90+ days** → escalate  
Your answer: ___________

**A2 — BANK-DOM-05 intercompany accounts**  
For TRANSP↔USMCA (or TRK) transfers, which CoA roles hold due-to / due-from?  
- Recommended: bind existing intercompany receivable/payable roles per entity (owner seeds if unbound)  
Your answer: ___________

**A3 — BANK-DOM-06 fuel overage**  
What is “card overage” that becomes driver liability?  
- e.g. amount over weekly card limit / unauthorized fuel type / gallons over policy  
Your answer: ___________

**A4 — MNT-ECON-02 (severe repair) — required before that implement**

| ID | Question | Options |
|----|----------|---------|
| D1 | Capitalize posts to which account role? | `fixed_asset_trucks` vs new `severe_repair_capitalized` |
| D2 | Expense posts to which role? | new `maintenance_severe_repair_expense` vs reuse parts/shop expense |
| D3 | Always create A/P bill, or cash JE if already paid? | bill+JE vs cash JE |
| D4 | Capitalize also creates fixed-asset register row? | yes later / JE-only for MVP |
| D5 | May approve estimate without a linked WO? | allow / require WO |

(You already locked: **always ask capitalize vs expense per event — no $ threshold**.)

**A5 — Escrow liability role**  
Not a debate — **seed** `escrow_liability` (or locked name) on CoA roles per entity on Neon so escrow GL stops 409ing. Cursor can prepare SQL; you say apply once.

---

## Layer B — Full backlog (44 older UNANSWERED)

Already inventoried in:  
`docs/trackers/NEEDS-OWNER-ADJUDICATION-2026-07-21.md` (§ UNANSWERED 1–44)

**Do not mix into today’s DOM wave.** Next owner sitting: answer Layer B in batches (accounting / settlements / safety / platform).

---

## Who runs the inventory

| Cadence | Who | Output |
|---|---|---|
| Each new packet / module wave | Claude or Cursor | Update **this file** Layer A (or new dated copy) |
| Before any DESIGN→implement | Builder | Confirm “UNANSWERED: None” or stop |
| After Jorge answers | Same agent | Lock into design doc + PRE-BLOCK law table |

---

## Saved answers (living)

| Date | Topic | Where saved |
|---|---|---|
| 2026-07-26 | ACCT-DOM-01 D1–D6 | `docs/specs/ACCT-DOM-01-JE-APPROVAL-SOD-DESIGN-2026-07-26.md` + PR #3605 |
