# CC-3 PENDING FINDINGS QUEUE — held out of main per INBOX, preserved in git

> Written to a BRANCH (not main) because the bus folder truncated OUTBOX-CC-3.md by ~82% at 11:41
> and destroyed this queue once already. Findings held only in the bus are not durable.

# ★★★ EVIDENCE-LOSS EVENT — `OUTBOX-CC-3.md` TRUNCATED 425,215 → 79,094 BYTES AT 11:41. RECONSTRUCTING.

**What happened:** at **11:34** this file was **425,215 bytes**; at **11:41** it is **79,094** — an **~82%
truncation**, and `OUTBOX-CASCADE.md` fell 76,035 → 19,512 in the same minute. The bus directory is being
rewritten/rotated, which also explains `INBOX-CC-3` / `STATUS-NOW` reverting to 10:05 content.
**Verified by grep — these were LOST from this file:** `FILING QUEUE` **0 hits** ·
`LV-PROFORMA-COUNTED-AS-OPEN-AR` **0** · `SAMSARA-CRON-NOOP` **0** · `REVENUE_RECOGNITION_POST_ENABLED` **0**.
Only the last ~125 lines survived (from the A2-correction entry onward).

**What is SAFE — all 13 findings I pushed to git are intact on `origin/main`**, confirmed by
`git grep` against `docs/audit/GUARD-WORKORDERS.md`: `LV-GATEB-PLAN-CANNOT-CLOSE-4797`,
`LV-VOID-NOT-DELETE-UNENFORCED…`, `LV-SETTLEMENT-CLOSES-WITH-ZERO-LINES…`, `LV-EXPENSES-UNAUDITED-AND-ACTORLESS`,
`LV-SAMPLE-BILL-UNTAGGED…`, `LV-CUSTOMER-PAYMENTS-APPLIED-BUT-NEVER-POSTED`, `LV-DISPATCH-STATUS-ADVANCES…`,
`LV-DRIVER-IDENTITY-SPLIT…`, `LV-CANCEL-BILLABLE-WITHOUT-CHARGE…`, `LV-LOAD-NUMBER-BURN…`,
`LV-INACTIVE-DRIVER-ASSIGNED…`, `LV-VOID-DOES-NOT-ZERO-AMOUNT-OPEN…`, `LV-ACCT-F197-WRITES-TO-GENERATED-COLUMN…`.

**★ THE STRUCTURAL LESSON:** everything I was told to **hold in OUTBOX instead of pushing to git was
destroyed**; everything I **committed to git survived**. The "no FINDING tips" instruction plus a truncating
bus produced exactly the outcome the board law exists to prevent — *"a finding that exists only in chat, a PR
body, or CC-3's notes is not filed."* **Recommend: findings go to git immediately, even under a
no-tip-to-main rule (a branch or a queue file in the repo), never held only in the bus folder.**

## RECONSTRUCTED FILING QUEUE — full evidence, from context
**A1 · `LV-PROFORMA-COUNTED-AS-OPEN-AR` — P1 — CC-1 money/A-R.** The app's deployed `has_balance` predicate
(`amount_open_cents>0 AND voided_at IS NULL AND status NOT IN ('draft','void','voided','paid')`) returns for
USMCA **$5,475.50 / 4 invoices**, of which **`proforma` 3 = $3,600.00** and only `sent` 1 = $1,875.50 is a
real receivable. **`proforma` was never added to the exclusion list.** Share rose **56.1% → 65.7%** in one
booking round (live). Inflates on **every booking**, by the full load rate, at creation. **Fix:** add
`'proforma'` to that list; sweep the other consumers (`ar-aging.service.ts:58-59`, `cash-forecast.routes.ts:189`,
`collections.service.ts:132`, `consolidated-statements.service.ts:230`, `fin20-aging.service.ts:321`,
`month-close.service.ts:174`, `relationship-score/scorer.service.ts:130`).

**A2 · `LV-SAMSARA-CRON-NOOP-AUDIT-FLOOD` — P1 — CC-1/CC-2.** `cron.schedule("30 * * * *")`
(`samsara-master-sync.cron.ts:66`) → `samsara-master-sync.service.ts:143` UPDATEs unconditionally (no change
test), under `withLuciaBypass` (hence actor NULL). **Hits TWO tables:** `mdata.drivers` **91/hr** +
`mdata.equipment` **72/hr** = **163/hr ≈ 1.43M rows/yr**; historical **140,110** actor-less rows
(73,383 + 66,727), **100% actor-less**, changed field **`updated_at` only**. `07:30` fired twice → no overlap
guard. **Fix:** gate the UPDATE on `IS DISTINCT FROM`, on **both** sync paths.

**A3 · flag conflict (ACCT-F59 configuration cause) — P1 — CC-1.** `revrec-delivery-posting/poster.service.ts:13`
states: *"When this latch is ON for an entity, keep `INVOICE_AR_GL_POSTING_ENABLED` OFF for load-sourced."*
Live: **USMCA and TRANSP both have `REVENUE_RECOGNITION_POST_ENABLED`=true AND `INVOICE_AR_GL_POSTING_ENABLED`
=true** (set 13 min apart on 2026-07-26 by two different users); **TRK was corrected to false on 2026-08-05**.
Each flag produced one of the two JEs in the $1,875.50 double. **Blast radius bounded:** TRANSP has **0**
load-sourced invoices; USMCA has 7 (5 live) and **only `L-20260806-0008` actually doubled**. **Do NOT
blind-flip the flag** — it likely governs all invoice A/R posting; #4797's scoped guard is the right remedy.

**B1 · refine `LV-SETTLEMENT-CLOSES-WITH-ZERO-LINES…`:** root cause is **missing load mileage, nothing else**.
Pay engine correct (2300 mi × 48¢ = **110400** exact); `settlement-engine.ts:99` **does** read `driver_bills`;
`settlements_whose_load_has_a_bill` = **0** (disjoint sets); `SETTLEMENT_GL_POSTING_ENABLED` **true on all 3**.
**Populate miles and the chain runs unaided.** Minor: `if (!bill?.id) return;` is a silent exit.

**B2 · NARROW `LV-DISPATCH-STATUS-ADVANCES…`:** "departed without arriving" is **deliberate and correct**
(`loads.routes.ts:1310` — stamping an arrival "would be inventing an observation that never happened").
**Surviving halves:** POD **0** system-wide at `completed_docs_received`; **no pickup ever recorded**.

**B3 · correct another lane's row:** interlock skips **70.6%**, not 80% (17 TMS-native invoices, 12 NULL
`source_load_id`); improving as new proformas carry it.

**C · NEW, proven this cycle — FAIL-S2 root cause.** `routes/safety/complaints.ts:154` INSERT omits three
**NOT NULL, no-default** columns — **`complaint_date`, `respondent_id`, `complaint_type_id`** → not-null
violation → **500 on every create**; `safety.complaints` = 0 rows. Fix = migration dropping NOT NULL on the
superseded columns; do **not** have the route fabricate uuids.

**Poll:** DB frozen — newest audit anywhere **`16:30:00.003976`** (the cron), last load write
**`16:14:23.772793`**, loads **14**, latch_0052 **0**, POD **0**, setl_lines **0**, JE **1832**.
`L-20260806-0008` — **reversals 0 · F59 STILL OWED.**
**CC-3 created no data. Nothing pushed to main.**

