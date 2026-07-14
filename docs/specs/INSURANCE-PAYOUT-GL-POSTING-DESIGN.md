# Insurance / Lawsuit Payout → GL Posting — DESIGN SPEC

**Block:** 11-insurance · G11-1 "GL-payout posting" half
**Status:** `HOLD-FOR-JORGE` — DESIGN ONLY. No posting code, no migration merge, no flag flip.
**Author:** GUARD (design agent). **Date:** 2026-07-14.
**Authority split (SKILL §0):** every FACT below is prod-verified (Neon `tiny-field-89581227`, read-only).
Every DECISION below is a **CANDIDATE only** — it needs the OWNER's ratification. An agent NEVER builds
GL/posting math solo (SKILL §1.4); the owner builds/merges the poster after a Neon balanced-JE ceremony.

This is the **second half** of G11-1. The **linkage half** (claim → accident/load/driver FKs) is a
**PREREQUISITE that is NOT yet on prod** — see §1 finding. This spec is the *posting* half: booking a
recorded claim/lawsuit **payout** to the general ledger.

---

## 1. VERIFIED STATE (prod, read-only — 2026-07-14)

Queried `information_schema` (RLS-immune) + counts under `SET app.bypass_rls='lucia'`.

### 1.1 `insurance.claim` — ACTUAL prod columns (exactly the base migration `0285`)
`id` uuid PK · `tenant_id` uuid NOT NULL (→ `org.companies`; this is the RLS scope key, **NOT**
`operating_company_id`) · `claim_number` text · `policy_id` uuid NOT NULL · `asset_id` uuid NULL
(→ `mdata.assets`) · `accident_date` date · `reported_date` date · `status` text
CHECK ∈ {`open`,`investigating`,`approved`,`denied`,`paid`,`closed`} · **`amount_claimed_cents` bigint** ·
**`amount_paid_cents` bigint** (the payout field; NOT NULL DEFAULT 0, CHECK ≥ 0) · `adjuster_name` /
`adjuster_email` / `notes` · `created_at`. RLS: `ENABLE`+`FORCE`, policy on `tenant_id`.

### 1.2 `insurance.lawsuit` — ACTUAL prod columns
`id` · `tenant_id` · `case_number` · `plaintiff` · `defendant` · `court_name` · `filed_date` ·
`status` text CHECK ∈ {`filed`,`active`,`settled`,`dismissed`,`judgment`} · `claim_id` uuid NULL
(→ `insurance.claim` ON DELETE SET NULL) · **`demand_cents` bigint** · **`settlement_cents` bigint**
(the payout field; NOT NULL DEFAULT 0, CHECK ≥ 0) · `attorney_name` / `attorney_email` / `notes` ·
`created_at`. RLS: `ENABLE`+`FORCE` on `tenant_id`.

There is **no `reserve` column** on either table (do not assume one). No `legal.matters` table drives
payouts; the lawsuit payout column is `insurance.lawsuit.settlement_cents`. There is **no `paid_at` /
posting-date column** — only `created_at` and `accident_date`/`reported_date` (claim) / `filed_date`
(lawsuit). A payout **as-of date** is therefore a design gap (see §2.4 / open ruling).

### 1.3 Row counts (bypass-RLS): **`insurance.claim` = 0 rows, `insurance.lawsuit` = 0 rows.**
Zero payouts (`amount_paid_cents>0` = 0; `settlement_cents>0` = 0). **No live financial exposure today** —
this poster would post nothing real on flip; it is being specified ahead of data.

### 1.4 ⚠️ LINKAGE-HALF PREMISE IS FALSE ON PROD (KEY FINDING)
The dispatch premise says "insurance.claim now has accident_report_id/load_id/driver_id FKs (migration
`202607410000`, held/merged)." **Prod does NOT have those columns** (verified: none of
`accident_report_id`, `load_id`, `driver_id`, `operating_company_id` exist on `insurance.claim`).
Migration `202607410000` is **not on prod and not in local `db/migrations/`** (local max is
`202607420000_vendor_types_catalog`; `202607410000*` is absent). The only claim-linkage on prod is the
**reverse** direction: `202607240000_incidents_auto_claim_fk` puts a `claim_id` FK on the incident/accident
side. **Per SKILL §0, prod wins.** ⇒ The claim→driver/load/accident linkage this spec's §5 depends on is a
**hard prerequisite that must land first**, not a done fact.

---

## 2. THE ACCOUNTING DECISION FOR JORGE (candidate ruling — needs owner ratification)

> FACTS above are prod-verified. The treatment below is a **CANDIDATE**; the owner rules the accounting
> treatment (SKILL §6: enabling money-posting / GL treatment is the **owner's sole decision** — no external
> CPA sign-off). GUARD supplies the balanced-JE proof; it does not decide.

### 2.1 What a claim/lawsuit payout economically is
A payout is cash (or an AP obligation) leaving the carrier to settle a claim/suit. It is **not** an
insurance *recovery* (money coming IN from the insurer). Grounding vs locked decisions
(ih35-cpa-accounting-decisions): parallel double-books, **QBO source-of-truth / reconcile-only, NO
write-back**; cash-basis mirroring for TRANSP with AP as the rare accrual exception; driver
escrow = liability (a claim funded by withholding driver escrow would DR the escrow-liability, not an
expense — an explicit sub-case for the owner).

### 2.2 CANDIDATE journal entry — claim payout (`insurance.claim.amount_paid_cents`)
Two candidate credit legs; **owner picks one** per how the payout is actually funded:

| Leg | Account (role) | Dr | Cr |
|-----|----------------|----|----|
| Expense | Insurance-claims / loss expense (**NEW role, see §3 gap**) | ✅ amount_paid_cents | |
| Cash-funded | Bank/cash (`banking.bank_accounts.ledger_account_id` bridge, like bill-payment) | | ✅ |
| **or** AP-funded | `ap_control` (accrual exception, when a vendor/insurer bill is owed) | | ✅ |

Deductible nuance for the owner: if the carrier only pays the **deductible** and the insurer pays the rest,
only the deductible is the carrier's expense — `amount_paid_cents` must mean *carrier-paid*, which the
owner must confirm (the column has no deductible/insurer split).

### 2.3 CANDIDATE journal entry — lawsuit settlement (`insurance.lawsuit.settlement_cents`)
Same shape, different expense role: **DR Legal-settlement expense** (NEW role) / **CR cash or `ap_control`**.
If the suit has `claim_id` and the underlying claim already expensed the loss, the owner must rule whether
the settlement is incremental or a reclass to avoid double-counting.

### 2.4 WHEN it posts — CANDIDATE
Post on **payout-recorded** = the transition to a terminal paid state (`claim.status='paid'`;
`lawsuit.status IN ('settled','judgment')`) with `amount_paid_cents`/`settlement_cents` > 0 — mirroring how
every existing poster gates on a status (`invoice ∈ {sent,partial,paid,factored}`, advance='disbursed',
reimbursement='paid'). **Open ruling:** there is no `paid_at`/posting-date column (§1.2) — owner must pick
the book date source (add a `paid_at` column in the linkage migration, or use `reported_date`/`created_at`).
Cash-basis (§5 locked) argues for posting only when cash actually moves.

---

## 3. REUSE — existing posting infra (NEVER build new GL math; SKILL §2/§10)

The poster is a **new source-type on the EXISTING engine**, not new math:

- **Engine:** `apps/backend/src/accounting/posting-engine.service.ts` — `postSourceTransaction(...)`.
  Add `"insurance_payout"` (and/or `"lawsuit_settlement"`) to the `PostingSourceType` union +
  `assertKnownSourceType`, and a `buildInsurancePayoutLines(...)` builder modeled on the existing
  `buildDriverReimbursementLines` / `buildBillPaymentLines` (same two-leg cash↔expense shape).
- **Balancing / spine (reused as-is):** `assertBalanced(lines)`; the `accounting.journal_entries` header
  (`createJournalEntryHeader`) + `accounting.journal_entry_postings` lines; idempotency via
  `buildPostingMvpIdempotencyKey` + `accounting.posting_batches`; the audit spine
  `accounting.transaction_source_links` (auto-written per line); period gate `ensureOpenPeriod`.
- **Account resolution (reused as-is):** `resolveRoleAccountOptional(client, operating_company_id, role)`
  in `apps/backend/src/accounting/coa-roles/resolver.service.ts` (resolves
  `accounting.chart_of_accounts_roles` → legacy `catalogs.account_role_bindings` → shape fallback,
  entity-pinned, fail-closed). Cash leg reuses `resolveBankLedgerAccountId` (bank→GL bridge); AP leg reuses
  `resolveApAccountForCompany` (`ap_control`).

### 3.1 ROLE GAP (verified on prod — must be filled by owner, NOT by new GL code)
Prod has **NO** insurance/claim/recovery/legal/payout role in either
`accounting.chart_of_accounts_roles` (`role`) **or** `catalogs.account_role_bindings` (`role_key`)
— both queries returned empty. The `COA_ROLE_VALUES` enum in `resolver.service.ts` has no such member.
**Two NEW roles are required** (added to `COA_ROLE_VALUES` + designated per-opco in
`accounting.chart_of_accounts_roles`, the existing mechanism — no new table, no new resolver):

| Proposed role | Type | Used by |
|---------------|------|---------|
| `insurance_claim_expense` | Expense | claim payout DR |
| `legal_settlement_expense` | Expense | lawsuit settlement DR |

The **owner designates** which `catalogs.accounts` id each maps to (per entity). Until designated, the
poster **fails closed** (`CoaRoleResolutionError`) — correct, no silent default (mirrors the revenue
hard-fail contract).

---

## 4. FLAG GATE (default OFF)

New per-entity flag: **`INSURANCE_PAYOUT_GL_POSTING_ENABLED`** (matches the verified prod naming family —
`INVOICE_AR_GL_POSTING_ENABLED`, `SETTLEMENT_GL_POSTING_ENABLED`, `LEASE_GL_POSTING_ENABLED`, etc., all
`default_enabled=false`). Seeded `false` in `lib.feature_flags`; per-entity override via
`lib.feature_flag_overrides`. **The poster posts NOTHING until the owner flips it per entity.** When OFF the
route returns a policy error (e.g. 409), no silent behavior (ih35-financial-migrations §5). Flipping it is a
Tier-1 ceremony (SKILL §1.4) — owner only.

---

## 5. LINKAGE DECLARATION (SKILL §10 C3 — cross-module matrix)

The payout JE must link **both ways**:
- **Financial primitives:** the JE (`accounting.journal_entries`) + its postings + `transaction_source_links`
  rows (`linked_object_type='insurance_payout'|'lawsuit_settlement'`, `linked_object_id`=claim/lawsuit id),
  and the cash/AP leg (bank ledger account or `ap_control` + vendor/insurer).
- **Operational modules:** claim → **policy** (`policy_id`, exists) → **asset/unit** (`asset_id`, exists) →
  **accident report / load / driver**. ⚠️ The accident/load/driver links **require the linkage-half FKs
  that are NOT on prod (§1.4)** — so this matrix is only satisfiable **after** the linkage migration
  (`accident_report_id`/`load_id`/`driver_id` on `insurance.claim`, or an equivalent join through the
  reverse incident `claim_id` FK from `202607240000`) actually lands. lawsuit → `claim_id` (exists).
- **N/A → deferred:** none silently omitted; the accident/load/driver leg is **BLOCKED on the linkage
  prerequisite**, declared explicitly here.

---

## 6. ACCEPTANCE[] (machine-checkable) + guard

| # | kind | acceptance | guard |
|---|------|-----------|-------|
| A1 | flag | `lib.feature_flags` has `INSURANCE_PAYOUT_GL_POSTING_ENABLED`, `default_enabled=false` | `verify-insurance-payout-flag-off.mjs` (static parse of migration/seed) |
| A2 | column | `insurance.claim` has `accident_report_id`,`load_id`,`driver_id` (linkage prereq) **before** any payout poster references them | reuse linkage-half guard; block if absent |
| A3 | role | `insurance_claim_expense` + `legal_settlement_expense` ∈ `COA_ROLE_VALUES`; resolver fails closed when unmapped | `verify-insurance-payout-roles-failclosed.mjs` |
| A4 | route | payout post endpoint returns policy-error (409) when flag OFF; posts nothing | `verify-insurance-payout-gated.mjs` |
| A5 | live | on a Neon branch with flag ON + roles designated: a payout produces a **balanced** JE (`assertBalanced`) with a `transaction_source_links` row back to the claim/lawsuit | Neon ceremony (owner) + `db.test` |
| A6 | design | no new GL-math function; poster routes through `postSourceTransaction` + `resolveRoleAccountOptional` | `verify-no-new-gl-math` (grep for direct `INSERT INTO accounting.journal_entr*` outside posting-engine) |

Guard enforcing the core invariant (register in `verify:arch-design`): the payout code path must NOT
`INSERT` directly into `accounting.*` and must consult the flag before posting.

---

## 7. GATE — HOLD-FOR-JORGE

Both the migration (new flag seed + 2 COA roles + the linkage-prereq FKs + optional `paid_at`) and the
posting path are **financial cluster** (SKILL §1.4) → **NEVER self-merge**. Sequence:

1. **Prereq:** the linkage-half migration (`accident_report_id`/`load_id`/`driver_id` on `insurance.claim`)
   must actually land on prod first — it is **not there today** (§1.4).
2. Owner **rules the accounting treatment** (§2: expense roles, cash-vs-AP leg, deductible meaning,
   post-on-status + book-date source).
3. Owner **designates** the two COA roles per entity.
4. GUARD builds the poster (reuse only), validates on a **local** DB, shows full SQL + `--staged --stat`.
5. **Neon balanced-JE ceremony** on a prod-copy branch (A5) → owner flips
   `INSURANCE_PAYOUT_GL_POSTING_ENABLED` per entity and merges.

**Nothing here is merged or flipped by an agent.**

---

## KEY OWNER RULINGS NEEDED (the two that block everything)
1. **Accounting treatment of a payout:** DR `insurance_claim_expense` / `legal_settlement_expense`, CR
   **cash vs `ap_control`** — and does `amount_paid_cents`/`settlement_cents` mean *carrier-paid net of
   insurer* (deductible) or gross? Plus the driver-escrow-funded sub-case.
2. **Designate the two NEW COA roles** (`insurance_claim_expense`, `legal_settlement_expense`) to real
   `catalogs.accounts` ids per entity — none exist on prod today.

(Prereq blocker, not a ruling: the claim→accident/load/driver linkage FKs are **not on prod** — must land
before §5 can be satisfied.)
</content>
</invoke>
