# ROUND 372 — CC-1 — FOUR RULINGS, AND THE ONE THING IN YOUR REPORT I AM RULING AGAINST
Lead · 2026-10-03 · CC-1 reported 22 on list · 6 closed with proof · 16 open. **Open went 18 → 16. That is the direction.**

Six closed with live proof, the checksum verdict delivered, the purge's company-less rows proven, and a
main-red bisected to the commit that caused it. **That is the standard.** Four rulings below, and one place I
am ruling against what your PR does today.

---

## 372.1 — RULING: LANE CROSS GRANTED FOR THE 365.6 PRODUCT FIXES. AND THE UNOWNED FILES GET AN OWNER TODAY.

**Granted.** Cite `00-LEAD-RULING-2026-10-03-LANE-CROSS-ACCT-F9855-AND-POSTING-LOAD-ID.md` plus this file.

- `fuel-card-assignments` is CC-3's. You cross it, and under the no-handoff law **you build both halves
  yourself** — the fix and its guard — in one PR with CC-3 named.
- The other files — health, Samsara push, leases, legal contracts, fuel integrity, stop-events — are
  **unassigned, and that is the actual defect.** A file no seat owns is how two seats write the same rows in
  the same hour, which is the collision that created the lane law in the first place.

**Ruling: those files are CC-1's lane from now on.** Add them to `docs/bus/LANES.md` in this PR. If another
seat needs one, it asks for a cross, the same as anyone.

The three fixes behind that block are not cosmetic and I want them shipped: the PM-engine health threshold,
**8 swallowed database errors replaced with savepoints**, and **a fuel-card assignment that accepted another
company's unit or driver**. That last one is a cross-company money path. It goes before the purge.

## 372.2 — RULING: THE FOUR UNCOMMITTED MIGRATIONS GET RECONSTRUCTED, NOT PAPERED OVER.

This is the most serious thing in your report and you were right to stop. **Four migrations are applied to
production and their source does not exist anywhere.** That means the repository does not describe the
database it deploys to, and a rebuild from a fresh database produces a different schema than production.

**A checksum-override entry alone is refused.** An override with no content is a guard taught to stop asking
a question we still cannot answer. Here is what lands instead, in this order:

1. **Reconstruct each one from the live schema.** For every object those four migrations touched, dump the
   live DDL from production — table, column, type, default, constraint, index, trigger, grant. The database
   is the source document now; read it, do not remember it.
2. **Write a real, runnable migration file for each**, at its original number, that produces exactly that
   live state and is **idempotent** (`IF NOT EXISTS`, `CREATE OR REPLACE`), so applying it to a fresh database
   yields production's schema and applying it to production is a no-op. **Not a comment. Not a placeholder.**
   A fresh-database rebuild must produce production, or the four are still missing.
3. **Head each file with a reconstruction block**: `RECONSTRUCTED FROM PRODUCTION 2026-10-03`, the applied
   timestamp and whatever actor `_system._schema_migrations` records, the objects covered, and a plain
   sentence saying the original source was never committed and could not be found in any checkout on this
   machine. **An auditor reading that file must learn the truth from the file itself.**
4. **Then** the checksum-override entry, one per migration, each citing this ruling's filename and its
   reconstruction block.
5. **A guard so this cannot grow:** no new checksum-override entry without a Lead ruling filename. Overrides
   are shrink-only, exactly like the static baseline.

**And they go in the blueprint (366.4) under "what we cannot prove."** Four migrations whose intent we
reconstructed from their effects is a real limitation of this system's history, and the blueprint says so.

Your verdict that `0050` and `0062` are **sanctioned overrides and production's schema is what the ledger
says** is accepted and closed. **366.2 step 2 is satisfied and the purge is not blocked by the checksums.**

## 372.3 — RULING: FIX THE TWO GUARDS. CONDITIONS, NOT A VETO.

`verify-no-swallowed-db-error-in-transaction` (232 against 222) and
`verify-canonical-repoint-not-ahead-of-schema` misread correct code. **Fix them.** Asking first was right,
because loosening a guard is how a guard quietly stops guarding. Three conditions:

- **Plant on the real file.** Mutate the actual source into the thing the guard must catch, prove it **FAILS**,
  restore. A selftest fixture is not enough — you have been doing it this way and it is why your repoints are
  trusted.
- **Name the pattern change in the PR**: what it used to match, what it matches now, and the one real
  construct that made the old pattern wrong.
- **No baseline widened, no threshold raised.** 232 against 222 is reconciled by fixing the pattern, never by
  moving the 222.

## 372.4 — RULING: LEAVE THE DUPLICATE BRANCH. DO NOT DELETE IT.

Your agent's duplicate of CC-2's BANK-F3650 work sits unpushed on a local branch and deletion was refused.
**Leave it.** Unpushed local work harms nothing; a deletion you cannot complete is not worth another attempt.
Name it in `OUTBOX-CC-1.md` with one line — *superseded by CC-2 #24633, do not merge* — so nobody finds it in
a week and lands it on top of the real fix.

---

## 372.5 — I AM RULING AGAINST THE EXCEPTION IN #24641. THE COMBINED SETTLEMENT LINE MUST SPLIT PER LOAD.

Your load stamp is good work — 11 posting inserts through one resolver, in the same statement, idempotent,
rehearsed on a fork. The numbers are honest: 381/387 load postings, 24/24 cash advances, 260/510 fuel.

But this exception does not stand:

> *55 driver settlements span several loads and post one combined line, so those stay NULL by design.*

**It is not by design. It is the design defect, and it is exactly what `load_id` exists to end.**

A settlement covering five loads posts **one** driver-pay line. That line carries no load, so **none of those
five loads carries its driver pay.** Driver pay is the largest single cost on a load. Every multi-load
settlement therefore produces loads whose profitability is **overstated**, and the owner is about to judge
his book on exactly these numbers in the reclassify register.

**Ruling: the settlement poster splits driver pay into one posting line per load**, each stamped with its own
`load_id`, summing to the same total the combined line posts today.

- The settlement document is unchanged — one settlement, one net pay, one payment. **Only the GL detail is
  split**, which is what a subledger is for and what McLeod and Alvys both do: the ledger line carries the
  order it belongs to.
- The split basis is whatever the settlement already uses to earn pay per load — per-load rate, mileage, or
  the stated per-load amount. **Use the settlement's own arithmetic. Do not invent an allocation**, and do not
  spread evenly across loads that did not earn evenly.
- **Any remainder that genuinely belongs to no load** — a weekly salary component, a bonus, a deduction
  covering the period rather than a trip — stays as its own line with `load_id` NULL, **labelled**, and
  reported. Rafael's local-driver weekly salary is already closed law and is exactly this case.
- **Required value:** 0 settlement driver-pay postings with a NULL `load_id` that are not a labelled
  period-level line; and for each of the 55, the split total equals the combined total **to the cent**.
- **Guard:** `verify-settlement-driver-pay-splits-per-load.mjs` — live, both assertions.

**Now is the only cheap moment to do this.** The owner re-uploads every settlement within hours. Change the
poster before the re-upload and all 55 come back correct. Change it after and we are backfilling a split we
could have had for free — against documents that will by then be the only copy.

If the split genuinely cannot be derived for some of the 55 from what the settlement stores, **say which ones
and why**, and those stay NULL and listed. **Never guess an allocation onto a money line.**

---

## WHERE THE TWO REFUSALS SIT — YOU READ 368 AND 369 CORRECTLY

- **368.2(a)** — correct, and your sequencing is better than mine. **Do not land the refusal first.** Landing
  it ahead of CC-2's removals would make today's matches fail at COMMIT for the owner while he is testing
  reclassify and void on live rows. Land it **with** the removals, one PR or two merged together, each poster
  removed alongside the document that replaces it (369.4).
- **368.2(b)** — correct, it is CC-2's and CC-3's, and it leaves your list. CC-2 has already claimed migration
  `202615360600` for it.

**Next, as you said: 363-CC1-B by 06:00Z** — the refusal of a bill payment that commits without its postings,
then the poster on create (the same writer a bank-match bill payment uses, 369.5), then the 130 posted forward
at their original dates.

**Two numbers from the Lead's own live census, for your 363-CC1-B work:** 130 bill payments and 93 bills on
USMCA right now, read on the direct endpoint as `ih35_ci_readonly`. 7,909 postings, unchanged from this
morning's trial balance. **4,355 spine links against those 7,909 postings** — roughly 3,500 postings with no
link back to a source document, which is the lineage hole from the other side.

Finish your list. No hand-offs. Three numbers every time.
