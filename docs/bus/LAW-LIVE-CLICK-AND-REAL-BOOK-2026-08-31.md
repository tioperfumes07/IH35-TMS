# LAW — LIVE CLICK + REAL BOOK · 2026-08-31 19:45Z
Owner order, verbatim: *"all these real transactions need to be created live, clicking, not neon,
not api, not env."* and *"these are the real transactions, not test."*

## LAW 1 — LIVE CLICK ONLY
Every transaction in the money cycle is created by **clicking the running app in Chrome**.
**FORBIDDEN as a means of creating a transaction:** a Neon INSERT/UPDATE, a direct API/fetch call,
an env flag flip, a seed script, a migration that inserts business rows, or any workaround.
Neon is for **reading and grading only**. If the UI cannot do it, that is the defect — **file it,
do not route around it.** Routing around a broken UI is how we ended up with rows in the database
that no user could ever have produced.
A hop is DONE when a seat can name: the URL clicked, the button clicked, the resulting record ID,
and the Neon read that confirms it. Three of four is not done.

## LAW 2 — REAL BOOK, NOT INVENTED LOADS
Seats have been inventing loads (`L-20260831-0002`…`0017`) to exercise the cycle. **Stop.**
The real book is the owner's own data, already in the repo and on his machine:
- `docs/lockdown/Coders-Faro/CC-1/CC-1-USMCA-FARO-33-INVOICES.csv` — 33 invoices
- `CC-1-DRIVER-SETTLEMENTS.csv` (58) · `CC-1-COMPANY-SETTLEMENTS.csv` (29)
- `CC-1-DRIVER-DEDUCTIONS.csv` (74, incl. 44 escrow rows = $1,100 / 12 drivers)
- `CC-1-DRIVER-ADD-PAYMENTS.csv` (32) · `CC-1-DRIVER-EXPENSES.csv` (135)
These are **real August transactions**, not fixtures. Enter them **through the UI**, with their
**original dates**, so the period lands correctly.

### ⚠ OWNER DECISION REQUIRED BEFORE THE FIRST REAL ENTRY
Every load created today carries `is_sample_data = true`. Real transactions must carry
**`is_sample_data = false`**, and the moment one does, it enters the financial statements.
Two facts the owner must weigh **before** a seat enters the first real row:
1. The **August unflagged JE baseline is 236** and has held all day. Real entries move it. That is
   correct and expected — but it is the number the month-end tie-out is built on.
2. It is **2026-08-31**. Entering 33 invoices + 58 settlements + 135 expenses by clicking, on the
   last day of the month, will not finish today.
**Recommendation:** enter them real, dated correctly, and **do not close August until the tie-out
balances.** Only the owner closes the period — that control already protects this.
**No seat sets `is_sample_data = false` on any row until the owner says go.**

## LAW 3 — ⚠ ENTITY CORRECTION, OWNER-STATED, OVERRIDES THE SKILL
Owner, verbatim: *"they are not related companies. i am the owner of trucking, i am not the owner
or partner in usmca — it is completely independent."*

This **overrides** my prior GO and contradicts `.claude/skills/ih35-entity-facts/SKILL.md`, which
frames USMCA as one of "IH35's three legal entities."
- The Trucking → USMCA lease is an **arm's-length third-party lease**, NOT a related-party lease.
  Trucking books **third-party rental revenue**; USMCA books **third-party lease expense**.
  **No related-party disclosure. No consolidation. No elimination.** Strike all three from any model.
- **The ×1.16 is ordinary third-party margin.** No transfer-pricing question arises.

### ⚠ AND THIS RAISES A CONFIDENTIALITY EXPOSURE — owner must rule
The same skill states, as a known defect:
> "`mdata.*` / `catalogs.*` RLS is **ROLE-scoped, not entity-scoped** today. Cross-entity data
> blends are masked now and **break at USMCA launch** — entity-scope remediation must land before USMCA."
While USMCA was assumed to be his company, that was internal hygiene. **If USMCA is an independent
company he does not own, then unscoped `mdata`/`catalogs` access means one company's confidential
operating data is reachable from another company's session.** That is a different class of problem
— contractual and legal, not tidiness.
**No seat "fixes" this today.** File it, size it, and put it in front of the owner as a decision.
The skill file itself is now factually wrong and must be corrected — **that is a design change and
needs owner approval before anyone edits it.**

## LAW 4 — INSURANCE DOCUMENT INGESTION (owner-ordered)
`20262027EDSA InsID Cards.pdf` — **14 Texas Liability Insurance Cards, one per VIN, and the PDF has
a real text layer** (no OCR needed). Parse, split per page, attach to the matching unit by VIN.
Each card carries: company Cimarron · phone 888-686-5051 · **policy CIMD-2026-0720** ·
**effective Aug 25 2026 · expiration Aug 25 2027** · year/make · VIN · agency EDSA ·
insured USMCA Freight Solutions, 7804 Sonoma Ct, Laredo TX 78045.
Attach the COI and the policy PDFs to the same unit records. Store in `docs.files`, linked to
`mdata.units` by VIN — **hub linkage required, Rule 14.**

### ⚠ THE ID CARDS SETTLE THE DATE QUESTION — AND OPEN A WORSE ONE
**All 14 cards say Aug 25 2026 – Aug 25 2027.** So do the MCS-90 and the EDSA agreement.
Only the AL declarations page says Aug 19. **Three documents to one: the period is Aug 25.**
Therefore **Aug 19–24 was almost certainly NOT covered.** Any load USMCA ran in that window had no
auto liability. Someone must check what ran Aug 19–24 and tell the owner. That is a read, not a fix.

The 14 cards list **T144** and do **not** list **T163** — consistent with the owner's account that
T163 was added last week and updated documents have not been issued. **T163 has no ID card, no COI
line, and no proof of liability coverage in hand.** Until EDSA sends updated documents, T163 must
render in the app as **"coverage claimed, not evidenced."**

---

# ASSIGNMENTS — all Live Chrome clicks

**CC-1 — close the broken chain first (do not start the real book until this is clean)**
1. Remint/settle **L-0002** and **L-0004** by clicking, on live `88d304b`. Report URL + button +
   record ID + Neon confirm. Grade **L-0017** the same way.
2. Then one **clean full chain on a single load**: dispatch → invoice → driver bill → settle line →
   deduction/escrow → factor → bank match → paid settlement. **One complete chain beats eight partial ones.**
3. Factoring profile **97% / 1.5% / 1.5% / $10 wire** replacing the hardcoded 95%/2.5% — through the UI.

**CC-2 — grade every hop live (only CC-2 writes `prod_verified`)**
4. Grade each hop CC-1 closes, in Chrome, same shift. A "found nothing" OUTBOX while a NOW is open
   is a breach.

**CC-3 — insurance documents + unit records**
5. Split the 14 ID cards by VIN, attach to units, link COI + 3 policy PDFs. `owner_company_id` =
   TRUCKING, `currently_leased_to_company_id` = USMCA. **Never `operating_company_id` on `mdata.units`.**
6. Coverage-status flag per unit: on-AL / on-APD / on-MTC / **NOT EVIDENCED**.
   T163 = "coverage claimed, not evidenced." T144 = "leased to 2EMS, pending removal."

**CASCADE — 55 minutes idle, the only silent seat**
7. Navy subnav inventory + conversion. Mechanical, no Chrome, nothing blocking you.
8. Monthly-reporting-by-the-5th job (AL: units/trailers/drivers/changes · APD: values).

**DEVIN-A / CODEX**
9. **Phase 7 bank ↔ settlement match — still zero, ever.** Click it.
10. Prove dispatch **blocks** an unscheduled driver on a scheduled truck (fixture: Genaro Guerrero
    Chavez on T152, 2026-08-26) and blocks the 1,500-mile / Mexico radius.

**CURSOR** — sequence; keep every queue ≥3 OPEN; enforce Law 1 on every OUTBOX line.

## HARD STOPS
- No `is_sample_data = false` on any row until the owner says go.
- No insurance JE until the endorsed premium and updated COI arrive.
- No Neon/API/env transaction creation. Ever. File the defect instead.
- Nobody edits `ih35-entity-facts` — owner approval required.
- Nobody closes August but the owner.
