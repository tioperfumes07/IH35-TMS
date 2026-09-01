# GO — INSURANCE: OWNER RULINGS + CORRECTION · 2026-08-31 19:20Z
**Supersedes the disputed points in `GO-INSURANCE-BOUND-2026-08-31.md`. Read both.**

## ⚠ CORRECTION I OWE THE BUS — WRONG ENTITY IN THE PRIOR GO
The prior GO named the lessor as **IH35 Transportation**. That is **wrong** and it is the
highest-cost error class in this system.

Per `.claude/skills/ih35-entity-facts/SKILL.md`:
> **TRK** — asset holder. **Owns** the units, **depreciates** them, **earns rental income by leasing
> units to the operating carrier**, and **signs equipment leases**.
> Unit ownership lives on `owner_company_id` (TRK) + `currently_leased_to_company_id` (TRANSP/USMCA)
> — **NOT `operating_company_id`**, which does not exist on `mdata.units`.

**The lease is TRK (IH 35 Trucking, asset holder) → USMCA Freight Solutions.** The owner confirmed
the same thing in his own words: *"that was the profit for TRUCKING."*
Depreciation and rental income book in **TRK**. Lease expense books in **USMCA**.
Any seat that started building this under TRANSP: stop and repoint.

## OWNER RULINGS — LOCKED, do not re-litigate
1. **Lease multiplier = ×1.16. CONFIRMED.** It is **TRK's profit margin**, not a tax and not IVA.
   Formula: `monthly lease = monthly bank note on that unit × 1.16`.
   - lease base $39,306.47/mo → **billed $45,595.51/mo**
   - **TRK margin = $6,289.04/mo = $75,468.42/yr**
   The ×1.25 line in the sheet is dead. Delete it from any model.
2. **T144 is a MISTAKE on the USMCA policies.** TRK leases T144 to **2EMS**, a third party.
   It is being removed from the policies. **Leave it in place for now — do not model it as a
   USMCA unit and do not build any USMCA lease line for it.**
3. **T163 has already been added.** A **new COI is coming from EDSA.** The liability gap closes
   when that COI lands — not before.
4. **NO PAYMENTS HAVE BEEN MADE.** Nothing has moved to First Insurance Funding or to EDSA.

## WHAT RULING 4 CHANGES — this is the important one
Because no money has moved AND the schedule is being endorsed, **every premium figure in the prior
GO is a moving target.** Do not book any of them as final.

**AL is the exposure.** The policy is rated **14 units at $14,136 each = $197,904.00**. If T163 was
**added** without T144 being **removed**, the schedule is now **15 units** and the endorsed premium
is **$212,040.00 — $14,136 more.** The owner would be paying $14,136/yr of liability premium for a
truck a third party operates.

**APD moves the other way.** T144 carries $37,400 of the $1,077,940 TIV. Removing it:
| | now | T144 removed |
|---|---|---|
| TIV | $1,077,940 | $1,040,540 |
| base @ 3.80% | $40,908.00 | $39,540.52 |
| surplus lines tax (4.85%) | $2,015.56 | $1,949.24 |
| stamping (0.04%) | $16.62 | $16.07 |
| fees (100% earned) | $650.00 | $650.00 |
| **total** | **$43,590.18** | **$42,155.83** |
**Saving $1,434.35** — but the **25% minimum earned premium** may limit what actually comes back.
Do not model a clean pro-rata return.

**MTC** is written on 15 specified trucks — same question, same endorsement.

### Separate risk the owner should hear from his broker, not from us
T144 is **currently on USMCA's liability policy while a third party (2EMS) operates it.** If 2EMS
has an at-fault loss in T144, USMCA's $1,000,000 limit is what responds and **USMCA's loss history
carries the claim into renewal.** That is a bigger number than the premium.

## HARD STOPS — updated
- **NO payment to First Insurance Funding or EDSA until the endorsed premium is issued in writing.**
  Paying now may pay for T144.
- **The $10,000 gap is now unexplained, not ambiguous.** The EDSA Deferred Premium Down Payment
  Agreement (a promissory note with a **personal guaranty**) says **$58,000 owed** and schedules
  **$24,000 + $24,000 = $48,000**. My earlier read allowed "maybe $10,000 was already paid."
  **The owner has confirmed nothing has been paid.** So the document is internally inconsistent by
  $10,000 and it is signed and guaranteed. It must be corrected by EDSA **before any money moves** —
  that leverage disappears the moment a payment is made.
- **$2,532.18** between the FIF schedule ($268,748.23) and the package ($271,280.41) still unresolved.
- **No insurance JE of any kind** until the new COI + endorsed premium arrive.
- Do not use the `$1,424,120` footer in the owner's sheet. The 14 truck values sum to **$697,045**.

## WHAT SEATS MAY BUILD NOW (structure only — no amounts)
This work does **not** depend on the moving premium and should proceed today.

**CC-3 — schedules + the flag that matters**
1. Units and trailers keyed by **VIN**, with `owner_company_id` = TRK and
   `currently_leased_to_company_id` = USMCA. **Never `operating_company_id` on `mdata.units`.**
2. Trailer values tie exactly and are safe to load now: **20 trailers, $343,495**.
3. **Coverage-status flag per unit and per driver**: on-AL / on-APD / on-MTC / NOT SCHEDULED.
   T144 must render **"leased to 2EMS — pending removal from USMCA policies."**
   T163 must render **"pending new COI"** until the COI is loaded and verified.
4. 13 scheduled drivers with the driver-criteria fields.

**CC-1 — structure, no posting**
5. Policy, endorsement-history, prepaid-amortization and note-payable **schemas**. Two distinct
   notes: FIF (secured, first-priority lien on the policies) and the EDSA deferred down payment
   (**unsecured, personally guaranteed**). Build the shape; post nothing.
6. Lease contract TRK → USMCA: per-unit `bank_note × 1.16`. **Related-party lease** — flag it as
   such on the record. TRK books rental income and continues 5-yr straight-line depreciation;
   USMCA books lease expense. These are separate legal entities: **it does not eliminate in either
   entity's own books.**

**CASCADE** — monthly-reporting-by-the-5th job (AL: units/trailers/drivers/changes; APD: values).
A missed report is a coverage argument. It must alarm, never fail silently.

**DEVIN-A / CODEX** — live-prove dispatch blocks an unscheduled driver on a scheduled truck
(fixture: Genaro Guerrero Chavez on T152, 2026-08-26) and blocks the 1,500-mile / Mexico radius.

**CURSOR** — sequence it. Insurance must not displace DEFECT A/B or the escrow backfill; both are
period-sensitive and August closes soon.

## STILL OPEN — owner action, not code
- New COI from EDSA showing T163 on **auto liability**, and T144 removed from **all three** policies.
- Endorsed premium in writing for all three, so the FIF amount financed and the $58,000 down payment
  can be corrected before any payment.
- EDSA to correct the **$10,000** in the signed guaranty.
- **Genaro Guerrero Chavez** added to the AL driver schedule — he drove T152 on 2026-08-26, seven
  days inside the policy period, unscheduled. Also Jorge Flores Valadez and Jose Miguel De Santiago
  Palacios if they are still driving.
- Written confirmation of inception: declarations say **Aug 19 2026**; MCS-90 and the EDSA agreement
  both say **Aug 25 2026**.
