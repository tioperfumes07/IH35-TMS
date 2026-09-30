# ROUND 282 — THE CANONICAL GUARD SET, AND THE CONSTRAINT THAT ENDS THE VOID DEFECT
# Claude Lead · 09-30-2026 · OWNER: *"create the real necessary guards, and replace all those."*
# Obey `00-SEAT-CONTRACT.md` + laws 280.0.a/b/c. Sequence 282.N. Cite the number.

## THE DIAGNOSIS IS CLOSED — stop re-deriving it
- `VOID_ENFORCEMENT_ENABLED` has been **ON for USMCA since 2026-09-08**. Not the cause.
- All **1,065** records were voided **09-24 → 09-29**, after that. **By repair scripts writing `voided_at`
  directly.** Void reasons prove it: *"repair zero-advance ach=NetAdv bug"*, *"ROUND 190 self-correction"*,
  *"ROUND-175 reversal"*.
- **199 of the 1,065 could never have reversed**: `factoring_advance` and `fuel_transaction` have **no executor**
  in the `EXECUTORS` map in `governance/void-cancel-executors.ts`.
- **CC-2 confirmed factoring's forward path is already clean.** The 51 are historical debt, not a live bug.
- **112 backend files write `voided_at`.** No seat contract stops a script with a database connection.

---

# 282.1 — THE DATABASE CONSTRAINT · **CC-1 (migration lane)** · THIS IS THE ACTUAL FIX
A rule in a document did not stop this and never will. **The database must refuse the write.**

Per voidable table — `accounting.expenses`, `fuel.fuel_transactions`, `accounting.factoring_advances`,
`accounting.invoices`, and every other table carrying `voided_at`:

> **A row may not carry `voided_at` while live postings reference it.**

Trigger or deferred constraint, enforced at commit. **A raw UPDATE that sets `voided_at` without a reversal must
fail at the database.** Follow-up migration only — never edit an applied one (that cost hours of downtime today).

# 282.2 — THE TWO MISSING EXECUTORS · **CC-1**
Add `factoring_advance` and `fuel_transaction` to the `EXECUTORS` map. Use the existing source-linked path —
`readOriginalGlPostings` already matches **any** `source_transaction_type`, so **no new GL math**. Mirror
`executeExpense`. 199 records currently have no legal way to be voided at all.

# 282.3 — EXTEND THE WHOLENESS GUARD · **CC-2** (this IS your lane — a guard, not a migration)
`verify-void-is-whole.mjs` only sees factoring's 41. Extend it to all four tables and make it the ratchet:
**starts at 1,065, target 0, shrink-only, `REQUIRES_LIVE_DB`, no wall-clock.**
**CC-2: answer to your question — yes, do this yourself. It is a guard. CC-1 owns 282.1 and 282.2.**

# 282.4 — REVERSE THE 1,065 · **CC-2** · after 282.1 + 282.2 deploy
Per table, smallest first: invoices 24 → advances 51 → fuel 148 → expenses 842. Prove each before the next.
**Reverse, never delete.** **AUTH-140 releases here** — CC-2 is correct to hold it until then.
**Targets: 2150 = $315,356.28 exactly · 6300 ≈ $220 · guard reads 0 · Trial Balance still balances.**

# 282.5 — WIPE · **CC-2** · owner-authorised, only after 282.4 reads 0
Archive first, children before parents, reversal deleted with its original, void reasons preserved verbatim.
**Paste the orphan check: every remaining posting must resolve to a record that exists.**

---

# 282.6 — REPLACE 5,427 GUARDS WITH THE CANONICAL SET · **CODEX**
Owner: *"it's not possible to have so many — create the real necessary guards and replace all those."* **Correct.**
**5,427** guard files (Lead's earlier 5,285 was wrong — Codex re-measured, the measurement wins),
**118 registered in LAW.json**, 399 failing (**15 of the 399 are LAW.json-registered — those are red baselines,
not cleanup candidates, and they are the priority inside this item**). Nobody can know what they assert. That is not a
safety net; it is noise that hides the 17 things that actually matter.

**Build these. They are the whole set. Each one blocks, always, for every seat.**

### MONEY — a failure here means a wrong number in the books
1. **Every journal entry balances.** Debits = credits, no exceptions, no plugs.
2. **No voided record has live postings.** (starts 1,065 → 0)
3. **Every void wrote its reversal, atomically** — flag, status and reversing entry together or not at all.
4. **No document posts twice** — unique per (document, posting type). *(This is how $79,857.74 got in.)*
5. **Control accounts tie:** 2150 = outstanding advances · 1100 = open invoices excl. proforma · 2000 = open
   bills · 1090 → 0 (all funds are deposited).
6. **Matching posts nothing.** A document posts when RECORDED. *(842 expenses.)*
7. **Never automatch** — Owner Law B. Suggest and accept only.
8. **No advance without a posted invoice** — real FK.
9. **No expense posting touches 2000 A/P.** A Bill is A/P.
10. **Statistical accounts (9100/9110/9200/9210) never reach P&L, BS, cash flow or the QBO export.**
11. **No fuel posting credits 1090.** *($108,602.28.)*
12. **A prepaid wallet never goes negative.** *(Relay, −$32,324.02.)*

### INTEGRITY — a failure here means the system cannot be trusted
13. **RLS enforced on the LIVE schema** — `pg_policies`, not migration text. Never scan applied migrations.
14. **Applied migrations are immutable** — checksum match. *(Cost hours of downtime today.)*
15. **Every status change carries an audit event.** *(13625/13626 were changed with zero audit rows.)*
16. **No test/sample/demo data in a real operating entity.**
17. **No cross-entity write.** Nothing is ever written to TRANSPORTATION.

**METHOD — do not delete 5,427 files blind:**
1. Build the 17. Register every one in `LAW.json`. Wire them in CI as the required set.
2. For each of the 5,427, decide: **covered by one of the 17 → delete** · **asserts something the 17 miss →
   the 17 are incomplete, bring the assertion up and tell Lead** · **asserts nothing → delete.**
3. Delete in batches by area, each batch its own PR, the 17 green throughout.
4. **Anything you cannot classify stays.** Report the count rather than guessing.
5. **RETRACTED BY LEAD 09-30.** Lead earlier reported "1,046 orphan guards" and that the registration
   candidates had "never run". Codex re-measured: **1,124** explicit-registration candidates, and **131 of them
   DO execute through the dynamic runner**. Both of Lead's numbers were wrong and are withdrawn. Reachability is
   established by the runner trace, never by grep for a filename.
6. **Every retirement's recovery archive must be committed to git at its real repo path.** An archive in `/tmp`
   is not a recovery path — a reboot deletes it and the retirement becomes irreversible. Nothing is retired
   until the archive that reverses it is in version control.
7. **This numbered list of 17 above is the ONLY canonical set.** Any 17 named in chat, in a handoff, or in a
   later Lead message that differs from these numbers is a paraphrase and does not govern. Build these.

**PROOF:** the 17 registered, wired, green. The guard file count, before and after. The 399-failure baseline
re-measured against the 17 — **that number is the real red count; everything else was noise.**

---

# SEQUENCE
**282.1 + 282.2 (CC-1, parallel) → 282.3 (CC-2, now) → 282.4 → 282.5. 282.6 (Codex) runs in parallel throughout.**

**NOT IN SCOPE, do not chase:** the ~30 call sites in safety, maintenance, driver-finance, banking and qbo-sync.
**The constraint in 282.1 makes them safe without touching one of them.** That is the point of fixing it at the
database instead of in 112 files.
