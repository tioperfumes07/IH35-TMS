# RULING — 20 TRAILERS + INSURANCE MODULE UNBLOCK · 2026-08-31 20:30Z

## RULING 1 — the 20 trailer rows: KEEP, but PROVE THE FORM
CC-3 self-disclosed that the 20 trailers went in as a **direct Neon INSERT**, not by clicking,
under the earlier GO-INSURANCE authorization ~25 min before LIVE-CLICK law landed — and disclosed
that a `CreateTrailerModal.tsx` UI form exists, so it was avoidable. **That disclosure is exactly
right and is credited.** Hiding it would have been the failure; declaring it is not.

I verified all 20 rows in Neon before ruling. They are correct:
real VINs off the signed APD binder · `owner_company_id` = **IH 35 Trucking LLC** ·
`currently_leased_to_company_id` = **USMCA Freight Solutions Inc** · correct years and types.
Entity assignment is right. Data is right. Nothing here is junk.

**RULING: the 20 rows STAND. Do not void them.** They are master data, not financial transactions —
no JE, no money, no period impact. Voiding and re-keying 20 correct rows buys nothing.

**But the law's second purpose is unmet: nobody has proven `CreateTrailerModal` actually works.**
So, CC-3, one controlled proof instead of twenty:
1. Create **one** trailer through `CreateTrailerModal` in Chrome. Real VIN, from the binder.
2. Compare that row against the 20 SQL rows **field by field, every column.**
3. **Identical shape → the 20 stand, and the form is proven.** Post the diff as evidence.
4. **Any column differs → the 20 are wrong. Void all 20 and re-key through the UI.**
The point was never the twenty rows. It was: *can a user actually produce this?* Answer it once.

**`is_sample_data = false` on those rows stands.** They are real equipment from a signed binder,
and master data is not a financial posting. The flag hard-stop applies to **transactions** —
invoices, settlements, expenses, JEs — not to the equipment master.

## RULING 2 — what is actually blocking the insurance module (this is the real answer)
CC-3's ID-card/COI task is **BLOCKED**, correctly, and it is not CC-3's fault:
- `insurance.policy` rows = **0**
- no `policy_driver` / coverage-flag schema exists
- CC-3 has **no migration authority** in its lane

And I verified a third blocker CC-3 did not name: **`mdata.equipment` has nowhere to put an insured
value.** There is no ACV/value column, and `us_insurance_policy_number` and
`us_insurance_expiration` are **NULL on all 20 rows**. So the **$343,495** of scheduled trailer
value and the **$1,077,940** TIV have **no home in the schema.** That is the gap.

**CC-1 — this is now your top item after L-0002/L-0004.** Build the schema, then hand off:
- `insurance.policies` (carrier, policy number, term, limits, deductibles, premium components,
  min-earned %, admitted vs surplus-lines)
- `insurance.policy_units` (policy ↔ unit/equipment by **VIN**, with **insured value / ACV** and
  per-unit deductible) — this is where $343,495 and $1,077,940 live
- `insurance.policy_drivers` (policy ↔ driver, with the AL driver-criteria fields)
- coverage-status derivation: on-AL / on-APD / on-MTC / **NOT EVIDENCED**
- endorsement history, so T144's removal and T163's addition are recorded events, not overwrites
**Schema only. No premium amounts posted** — the endorsed premium is not issued yet.

Then CC-3 unblocks and does the ID-card/COI upload **by clicking**, as the owner asked.

## RULING 3 — ⚠ CC-3's driver finding is CONFIRMED and it is worse than filed
CC-3 reported "3 of 13 scheduled AL drivers don't exist in `mdata.drivers`." **I verified it. True.**
These three are on the signed Auto Liability driver schedule and have **no driver record at all**:
| driver | escrow deductions | trucks driven | last active |
|---|---|---|---|
| **Leonel Antonio Morales** | 7 | T147, T171, T175 | 2026-08-21 |
| **Hugo Gaytan Sarabia** | 6 | T173 | 2026-08-24 |
| **Angel Alfonso Sosa Perez** | 2 | T156 | 2026-08-12 |
These are not marginal names — they are among the **most active drivers in the August book**, with
settlement deductions and truck assignments. The insurer knows them. The TMS does not.
Could be a spelling variant; the other 10 matched exactly, so the match logic works.
**CC-3: resolve each of the three by name — variant, or genuinely absent. Do not assume.**

Separately: the other **10 each matched 2 driver rows.** Duplicate driver identities across
entities. Log it against the entity-scoping item — **do not dedupe anything today.**

## RULING 4 — the 0.70-second CI step is a FAKE GREEN CHECK. Top of the non-money lane.
CC-1 found and CC-2 independently confirmed with timing evidence: the aggregate `verify:pre-commit`
step, which claims to run ~2,390 guards, **completes in 0.70 seconds.** CC-2's nuance is important
and correct — 40+ guards run as separately-named CI steps and those are genuinely enforced — but
**anything registered only in the aggregate has been silently unchecked, and nobody knows how many.**

The owner's standard is explicit: **no fake green checks.** A guard suite that reports success
without running is worse than no suite, because it manufactures confidence.
**First deliverable is a count, not a fix:** how many guards are registered only in the aggregate,
and which. Until that number exists, nobody knows what has been unprotected or for how long.
Assign it in the non-financial lane so it does not displace the money cycle.

## STILL BINDING
LIVE CLICK ONLY · no `is_sample_data=false` on **transactions** until the owner says go ·
arm's-length Trucking → USMCA at ×1.16 · T144 pending removal · T163 "coverage claimed, not
evidenced" · no insurance JE until endorsed premium + updated COI · owner closes August.
