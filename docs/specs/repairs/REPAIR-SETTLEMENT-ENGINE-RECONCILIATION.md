# REPAIR — Settlement Engine Reconciliation

**SETTLE-1 / SETTLE-2 / G11-2 / G11-3 / G7-1 — one canonical settlement money path.**

> DESIGN / ANALYSIS DOC. **No production code changed.** This is the most contentious financial
> area in the audit (prior sweep: *"M-RECONCILE-NOTE: agents disagree on the settlement engine"*).
> Everything below is **TIER-1 FINANCIAL** per CLAUDE.md §1.4 — **never self-merge**; every migration,
> flag flip, and posting change waits for Jorge's explicit "OK to merge." Money flags stay **OFF**.
>
> Builds on `docs/specs/repairs/SETTLEMENT-ENGINE-TRACE-2026-07-04.md` (the read-only trace that first
> mapped the two engines) — this doc extends it with the third posting surface, the two floor systems,
> the deduction sub-ledger map, and an implementable reconciliation plan. Read the trace first.

---

## 0. Owner-locked decisions honored here (NOT re-litigated)

From `MEMORY.md → audit-fix-decisions-2026-07-04`, `cpa-locked-decisions-2026-07-01`,
`finance-engine-decisions-locked`, `load-advance-loadid-direct-build`, `driver-escrow-is-liability`:

- **Net-pay floor = 5%, EDITABLE at apply-time.** (10% and 50% found in code are BUGS to reconcile away.)
- **Deduction recovery = PAY-FIRST, then escrow.** Escrow keeps growing for late fines (30-45d after the
  driver leaves).
- **Deduction store canonical = `driver_finance.driver_settlement_deductions`**; each line carries
  `load_id` DIRECTLY.
- **Everything links to a load. Never delete — void/archive only.**
- Drivers are **1099 vendors**; money posting flags **OFF** until CPA + Neon tie-out + owner sign-off.

---

## 1. GROUND TRUTH (evidenced) — there are THREE settlement surfaces, not two

The audit disagreement is real because there are **three** distinct code surfaces that each claim part of
"settlement." Two are LIVE; one is dormant. They do not share tables, floor logic, or a posting model.

### 1.1 Surface A — `driver_finance.*` (the canonical model + live close, but NO GL posting today)

- **Tables:** `driver_finance.driver_settlements`, `driver_finance.settlement_lines`,
  `driver_finance.driver_settlement_deductions` (the owner-locked deduction store),
  `driver_finance.driver_bills`.
- **Live close path:** `aggregateSettlementTotals` —
  `apps/backend/src/driver-finance/settlements-load-bookended.service.ts:161`. Called from
  `apps/backend/src/driver-finance/pre-settlement.routes.ts:247` and `:322` (registered live at
  `apps/backend/src/index.ts:806` `registerDriverFinanceSettlementRoutes`, `:808`
  `registerC1PreSettlementsRoutes`).
- **What it does:** sums `settlement_lines` by `line_type` (earnings / deduction / abandonment_chargeback /
  reimbursement) and writes `gross_pay / deductions_total / net_pay` back onto the settlement header
  (`settlements-load-bookended.service.ts:170-204`).
- **THE GAP (SETTLE / Repair-A root cause):** the live close appends **only** earnings lines
  (`appendSettlementLineFromDriverBillIfMissing`, `settlements-load-bookended.service.ts:289`) and
  approved **abandonment** chargebacks (`:297`). It calls **NO cash-advance / general deduction applier.**
  The schema-correct applier `applyPendingDeductionsToSettlementWithNetFloor`
  (`apps/backend/src/driver-finance/settlement-deduction-cap.service.ts:159`) **has no non-test caller**
  (verified: the only references are its own definition, tests, and a doc comment). → On this path,
  cash-advance deductions **never apply → drivers are overpaid.**
- **Payment state machine (G7-1):** `apps/backend/src/driver-finance/settlement-payment.service.ts`
  — `payment_state` enum `unpaid → queued → sent_to_bank → cleared | bounced | manual_paid`
  (`:7`, transition table `:107-112`). The auto-pay cron
  (`apps/backend/src/driver-finance/auto-pay.cron.ts:5,80`) calls `queuePayment` on **locked/final**
  settlements. **This state machine emits events but posts NOTHING to `accounting.*`** — there is **no
  `createBill` / `payBill` anywhere in `driver-finance/`** (verified by grep). So today a
  `driver_finance` settlement computes net pay + tracks a payment lifecycle but has **zero GL footprint.**

### 1.2 Surface B — `payroll.*` (LIVE-ROUTED; the surface that actually MOVES MONEY)

- **Tables:** `payroll.driver_settlements`, `payroll.driver_settlement_line_items` (a **parallel**,
  duplicate settlement + line model — NOT `driver_finance.*`).
- **Live routes:** `apps/backend/src/index.ts:992` `registerPayrollDriverSettlementRoutes` →
  `POST /api/v1/payroll/driver-settlements/compute` and `.../:settlement_id/post`
  (`apps/backend/src/payroll/driver-settlement.routes.ts:22,50`).
- **It posts REAL Bills + Payments:** `postSettlement`
  (`apps/backend/src/payroll/driver-settlement.service.ts:390`) calls `createBill`
  (`:447`) + `payBill` (`:460`) → real rows in `accounting.bills` / `accounting.bill_payments`.
  Bond lines open + deposit **escrow** (`:484-503`).
- **Guardrails are thin:** the `/post` route is gated only by `currentAuthUser`
  (`driver-settlement.routes.ts:51`) — **no owner/role gate, no money-flag gate on the Bill/Payment
  itself.** Only sanity checks: must be `draft` (`driver-settlement.service.ts:428`) and net > 0 (`:429`).
- **Recovery math is behind a RAW, resolver-bypassing flag read (finding H3-4):**
  `settlementCappedRecoveryEnabled` (`driver-settlement.service.ts:121-125`) does
  `SELECT default_enabled FROM lib.feature_flags WHERE flag_key='SETTLEMENT_CAPPED_RECOVERY_ENABLED'` —
  **bypasses** `isEnabled()` / per-entity scoping / kill-switch. When ON it grosses-up expense with a
  paired JE Dr expense / Cr QBO-149 (`:580-592`). When OFF (default) it sums approved
  `driver_finance.cash_advance_requests` into ONE `advance_recovery` line with **`load_id: null`**
  (`:199-222`) — a **load_id-aggregate** line the codebase itself flags for deprecation (`:216-218`),
  in tension with the "every deduction line carries `load_id`" lock.

### 1.3 Surface C — FIN-18 `postSettlementToGl` (the architecturally correct GL poster — DORMANT)

- **File:** `apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts:205`.
- **Reads the canonical store:** `driver_finance.driver_settlement_deductions WHERE
  applied_to_settlement_id = $settlement` (`:116-127`) and the `driver_finance.driver_settlements`
  header (`:99-114`). It is built to post the **Surface-A** model.
- **Posts a balanced JOURNAL ENTRY** (not a Bill): Dr driver-pay expense / Dr reimbursement / Cr each
  bucket recovery account / **Cr net-pay CLEARING** (`:303-357`), through the accounting spine with
  bucket-ledger decrement (`:424-443`), consent gate (`:250-263`), and idempotency (`:221-223`).
- **Flag-gated correctly OFF:** `isEnabled(... SETTLEMENT_GL_POSTING_ENABLED ...)`
  (`:213-219`, key at `settlement-posting.math.ts:6`) — proper resolver, per-entity, kill-switch aware.
- **NOT WIRED:** `registerSettlementPostingRoutes` (`settlement-posting.routes.ts:45,135`) is **not
  registered in `apps/backend/src/index.ts`** (verified: zero hits). So this poster is
  build-and-hold, reachable by no HTTP route, and OFF regardless.

### 1.4 The core contradiction (why agents disagreed)

| | Surface B `payroll.*` (LIVE) | Surface C FIN-18 (dormant) |
|---|---|---|
| Posting model | **A/P BILL + BillPayment** | **Balanced JE + net-pay CLEARING** |
| CI lock | `verify-driver-settlement-uses-bill-not-je.mjs` **forbids JE semantics** in the payroll service | built as JE-with-clearing per `finance-engine-decisions-locked` |
| Data model | its **own** `payroll.driver_settlements` tables | reads `driver_finance.*` (canonical) |
| Deduction ledger | `payroll.driver_settlement_line_items` + `cash_advance_requests` | `driver_finance.driver_settlement_deductions` |

There are **two locked-vs-locked decisions in direct conflict**: *"driver settlement posts as a BILL"*
(CI-guarded, live, QBO-parity-correct for 1099 A/P) **vs** *"net-pay clearing JE"* (FIN-18 /
`finance-engine-decisions-locked`). **This is a genuine drift — flagged for Jorge in §7, not resolved
here.**

### 1.5 Where each net-pay-floor value is hardcoded (SETTLE-2 / G11-3)

Two **independent** floor systems exist, reading **different tables** with **different defaults**, and
**5% appears nowhere**:

**Floor system 1 — `resolveSettlementMinNet`** (`settlement-deduction-cap.service.ts:52`), pct is an
**integer 0-100**:
- Default **`50`** — `envMinNetPct()` `process.env.SETTLEMENT_MIN_NET_PCT ?? 50`
  (`settlement-deduction-cap.service.ts:20-22`).
- Migration default **`50`** — `mdata.drivers` / `org.companies` `min_net_settlement_pct integer DEFAULT 50`
  (`db/migrations/202606071910_settlement_min_net_floor.sql:14,18`; comments literally say "default (50)").
- Floor formula `Math.max(Math.round((grossCents * pct)/100), cents)` at **four** call sites:
  `settlement-deduction-cap.service.ts:196`, `payroll/driver-settlement.service.ts:235` and `:520`,
  `payroll/settlement-shadow.service.ts:110`.

**Floor system 2 — `resolveDriverFloor` + `applicableFloorCents`** (FIN-18), pct is a **fraction 0-1**:
- Default **`0.1` (10%)** — `DEFAULT_NET_PAY_FLOOR_PCT = 0.1`
  (`accounting/settlement-posting/settlement-posting.math.ts:9`; header comment
  `settlement-posting.service.ts:15` "default 10%").
- Reads `driver_finance.driver_pay_settings.net_pay_floor_pct` → `accounting.settlement_posting_config.
  net_pay_floor_pct` → 0.1 (`settlement-posting.service.ts:158-184`).
- Enforcement is **block-not-cap** (`:270-287`) — a breach throws `NET_PAY_FLOOR_BREACH` unless an owner
  override with a reason is passed.

**Net effect:** the live payroll path floors at **50%**; the dormant FIN-18 path floors at **10%**; the
locked target **5%** is unimplemented. The two systems also disagree on **cap-vs-block** semantics and on
**integer-pct-vs-fraction** encoding.

### 1.6 The two deduction sub-ledgers (G11-2) and why they diverge

- **Canonical:** `driver_finance.driver_settlement_deductions` — has `applied_to_settlement_id`,
  `remaining_balance_cents`, `status`, `deduction_type`, and **`load_id`** (added by
  `db/migrations/202606272300_deduction_line_load_id_direct.sql`). Read by the capped applier
  (`settlement-deduction-cap.service.ts:199`), the payroll capped path
  (`driver-settlement.service.ts:250`, `:533`), the shadow diff, and FIN-18 (`settlement-posting.service.ts:120`).
- **Parallel:** `payroll.driver_settlement_line_items` — the payroll engine's OWN applied-line store
  (`driver-settlement.service.ts:348`), plus a **third** legacy source it sums directly:
  `driver_finance.cash_advance_requests` (`:199-209`).
- **Why they diverge:** the canonical table is the deduction **source ledger**, but the **applied
  deduction LINES** land in **two different places** — `driver_finance.settlement_lines` (Surface A) vs
  `payroll.driver_settlement_line_items` (Surface B) — that never reconcile to each other, and the legacy
  `cash_advance_requests` sum (Surface B, flag OFF) writes an aggregate line that touches the canonical
  ledger **not at all**. So the same real-world advance can be (a) unapplied forever on Surface A, (b)
  recovered against the canonical ledger on Surface B flag-ON, or (c) summed from `cash_advance_requests`
  with no ledger write on Surface B flag-OFF — three answers, no cross-check.

---

## 2. CANONICAL DECISION

### 2.1 Recommendation (grounded in the owner-locked decisions)

**THE engine = Surface A `driver_finance.*` as the settlement lifecycle + record model, with
`driver_finance.driver_settlement_deductions` as the single deduction ledger.** Rationale:

1. It is the model the **UI, the load-bookended close, and every owner-locked decision** already point at
   (deduction store = `driver_settlement_deductions`, `load_id`-per-line, load-bookended, escrow-as-liability).
2. Both the correct applier (§1.1) and the correct GL poster FIN-18 (§1.3) **already read this model.**
3. `payroll.*` is a **parallel duplicate table set** that diverges the books; it should not be the
   system of record.

**What happens to the other surfaces (ARCHIVE, never delete — §7 additive-only):**

- **Surface B `payroll.*`:** do **not** delete. Two candidate end-states, gated on the §7 Jorge decision:
  - **(Preferred) Re-home its posting muscle.** The *Bill+Payment* posting (which the CI guard
    `verify-driver-settlement-uses-bill-not-je.mjs` locks in) is the valuable, correct-for-1099-A/P part.
    Move that posting to be driven **from** a `driver_finance` settlement (Surface A settlement → on
    post, create the A/P Bill/Payment), and **freeze** `payroll.driver_settlements` /
    `payroll.driver_settlement_line_items` as read-only legacy (stop new writes; keep for history + audit).
  - **(Alternative) Retire the Bill model in favor of FIN-18's JE model** — only if Jorge rules the
    net-pay-clearing JE is canonical over the Bill. This flips the CI guard and is a **bigger** GL change.
- **Surface C FIN-18:** keep dormant/flag-OFF until §7 resolves Bill-vs-JE. If Bill wins, FIN-18 becomes
  the **reversal/GL-detail** companion or is archived; if JE wins, FIN-18 is wired + becomes the poster.

**The one thing this doc will NOT decide:** Bill-vs-JE posting mechanism (§1.4). That is a
locked-vs-locked GL-design conflict → **Jorge, §7 Q1.**

### 2.2 Reconcile against the locked decisions

| Locked decision | Canonical-engine consequence |
|---|---|
| Deduction store = `driver_settlement_deductions` | Surface A already uses it; Surface B must stop writing a parallel applied-line store as the source of truth. |
| Every line carries `load_id` | Wire the `load_id`-direct applier into the Surface-A close; kill the `cash_advance_requests` aggregate line (Surface B flag-OFF path, `load_id:null`). |
| Floor 5% editable | One resolver, default 5, editable at apply-time (§3). |
| PAY-FIRST then escrow | §5. |
| Never delete | Freeze `payroll.*` read-only; archive FIN-18 or wire it — no DROP. |

---

## 3. NET-PAY FLOOR UNIFICATION (one implementation, 5% default, editable at apply-time)

**Target:** a single floor resolver, default **5%**, **editable at apply-time** (the person closing the
settlement can override the resolved floor per-settlement, with actor + reason recorded), block-not-silent.

**Design:**

1. **Collapse to ONE resolver.** Keep `resolveSettlementMinNet`
   (`settlement-deduction-cap.service.ts:52`) as the single source (per-driver → company → env chain is
   the right shape). **Retire** the FIN-18 `resolveDriverFloor` + `DEFAULT_NET_PAY_FLOOR_PCT` path and
   have FIN-18 call the same resolver, converting once between fraction/integer-pct encodings (pick
   **integer 0-100** as canonical; it matches the DB columns + CHECK constraints).
2. **Change the default 50 → 5** at every default site (Jorge-gated migration + code):
   - `settlement-deduction-cap.service.ts:20` `?? 50` → `?? 5`.
   - `db/migrations/202606071910_settlement_min_net_floor.sql:14,18` `DEFAULT 50` → **new idempotent
     migration** setting default 5 (do NOT edit the applied migration; add a follow-up `ALTER COLUMN
     ... SET DEFAULT 5` + optional data backfill of rows still holding 50, Jorge-decided).
   - `settlement-posting.math.ts:9` `0.1` → route through the unified resolver (delete the constant).
3. **Editable at apply-time:** add an explicit `overridePct` / `overrideCents` parameter to the applier
   entry point (§4), authorized (owner/admin) + reason-required, recorded in `audit.audit_events`
   (reuse the FIN-18 `floor_override` audit pattern, `settlement-posting.service.ts:471-488`). Default =
   resolved 5%; the apply-time value wins when present.
4. **Exact call sites to change** (all four floor computations must consume the unified resolver + default):
   - `settlement-deduction-cap.service.ts:196`
   - `payroll/driver-settlement.service.ts:235`, `:520`
   - `payroll/settlement-shadow.service.ts:110`
   - FIN-18 `settlement-posting.service.ts:266-267` (`resolveDriverFloor` + `applicableFloorCents`).
5. **Resolve the cap-vs-block conflict (Jorge, §7 Q3):** the capped-recovery engine **caps to floor +
   defers** (`settlement-capped-recovery.ts`); FIN-18 **blocks**. Locked decision D ("pay-first then
   escrow, escrow keeps growing") implies **cap-and-defer/roll-to-escrow**, NOT hard-block. Recommend
   **cap-and-carry** as the unified behavior; confirm with Jorge.

---

## 4. DEDUCTION SUB-LEDGER UNIFICATION (to `driver_settlement_deductions`, `load_id` per line)

**Target:** one ledger — `driver_finance.driver_settlement_deductions`, `load_id` on every row — applied
by one applier wired into the one canonical close.

**Design:**

1. **Wire the applier into the Surface-A live close.** Insert
   `applyPendingDeductionsToSettlementWithNetFloor` (`settlement-deduction-cap.service.ts:159`) into
   `closeLoadBookendedSettlementForDriver` **after** earnings/abandonment lines exist and **BEFORE**
   `aggregateSettlementTotals` (`settlements-load-bookended.service.ts:297→303`) — exactly where the
   docstring already says it must run (`settlement-deduction-cap.service.ts:151-153`). This closes the
   "drivers overpaid" gap for ALL deduction types (not just abandonment).
2. **Extend it to carry `load_id` per applied line.** The applier currently inserts a
   `settlement_lines` `deduction` row (`:229-236`) but does not propagate the deduction's `load_id`.
   Add `load_id` to that insert from the source `driver_settlement_deductions.load_id` (the column
   already exists via `202606272300_deduction_line_load_id_direct.sql`). Requires a `settlement_lines.
   load_id` column if absent (Jorge-gated migration).
3. **Stop the parallel applied-line store from being canonical.** Freeze
   `payroll.driver_settlement_line_items` writes (§2.1). If Bill-posting is re-homed to Surface A, the
   Bill is built from `settlement_lines` net, not from `payroll.*`.
4. **Kill the `cash_advance_requests` aggregate line** (`driver-settlement.service.ts:199-222`,
   `load_id:null`). Cash-advance recovery must flow through `driver_settlement_deductions`
   (`deduction_type='cash_advance_repayment'`) so each line carries its originating `load_id` — the
   capped path already maps `load_id` per allocation (`driver-settlement.service.ts:268-285`); make that
   the ONLY path.

**Reconciling the two existing stores WITHOUT data loss (append-only, void-not-delete):**

- **Do not migrate/delete `payroll.driver_settlements` or `payroll.driver_settlement_line_items`** —
  freeze them read-only and keep as historical/audit record.
- **Backfill bridge (Jorge-gated, one-time, reversible):** for any settlement that lived only on
  Surface B, write the equivalent `driver_finance.driver_settlement_deductions` rows (with `load_id`
  resolved from `payroll.driver_settlement_line_items.load_id`) marked `applied_to_settlement_id` →
  the corresponding `driver_finance` settlement, so the canonical ledger reflects history. Any row that
  cannot be mapped 1:1 is **surfaced, never silently dropped** (reuse the deferred-over-cap audit shape,
  `settlement-deduction-cap.service.ts:258-281`).
- **Tie-out gate:** the bridge is only "done" when Σ(canonical applied) == Σ(payroll applied) per driver
  (§6 tie-out). Until then it runs in a shadow/report mode (the existing
  `payroll/settlement-shadow.service.ts` is the natural home for the diff report).

---

## 5. PAY-FIRST-THEN-ESCROW RECOVERY + escrow-keeps-growing

**Locked (decision D):** recover from **current pay first**, up to the floor; the **remainder rolls to
escrow**; escrow **keeps growing** for fines that land 30-45 days after the driver leaves.

**Design (all on the canonical ledger, load-linked, append-only):**

1. **Pay-first:** the applier recovers pending `driver_settlement_deductions` oldest-first against
   `available = gross − floor(5%)` (`settlement-deduction-cap.service.ts:196-197`; capped-recovery math
   `settlement-capped-recovery.ts:85-136`). This is already correct — it just needs to be **wired** (§4)
   and use the **5%** floor (§3).
2. **Then-escrow:** a deduction (or remainder) that **cannot** be recovered from pay (driver has no /
   insufficient current settlement, or is deferred over the floor) is moved into the driver's **escrow
   liability** (`driver-escrow-is-liability` — Damage Claim Escrow QBO-1150040187, returned 60-90d net
   deductions). Reuse the escrow service already imported by the payroll engine (`openEscrow` /
   `depositEscrow`, `driver-settlement.service.ts:4,484-503`) — do NOT write new escrow math.
3. **Escrow-keeps-growing:** escrow is **append-only**; a late fine created after the driver's last
   settlement creates a new `driver_settlement_deductions` row (load-linked) whose recovery target,
   finding no pay, deposits to the **existing** escrow account (grows the held liability). No settlement
   is required to grow escrow — the deposit path is independent of an open settlement.
4. **Never below net 0, never silently:** the capped-recovery engine already guarantees net ≥ 0
   (`settlement-capped-recovery.ts:9,132`) and audits every deferral. Keep both guarantees.

**Open (Jorge, §7 Q4):** exact ordering when BOTH pay-recovery AND escrow-topup are possible in the same
settlement (recover to floor from pay, THEN escrow the remainder — vs — a split). Recommend
pay-to-floor-first, escrow-the-rest.

---

## 6. MIGRATIONS, ROLLOUT, CI GUARDS, TIE-OUT

### 6.1 Migration implications (EVERY one is Jorge-gated — §1.3/§1.4; numbers re-checked at push time)

Current 4-digit max on main = `0407_permits_toll_tags.sql` (plus timestamp-series migrations); new files
strictly above, idempotent (`IF NOT EXISTS` / `DO`), with `ih35_app` GRANTs where a new object is created:

1. **Floor default 50→5.** Follow-up migration `ALTER COLUMN ... SET DEFAULT 5` on
   `mdata.drivers` + `org.companies` `min_net_settlement_pct`; optional Jorge-decided backfill of rows
   still literally 50. (Do NOT edit `202606071910_*`.)
2. **`driver_finance.settlement_lines.load_id`** column (if absent) — nullable FK to `mdata.loads`,
   for §4.2.
3. **Backfill-bridge scaffolding** (§4) — a one-time reversible data migration (or `scripts/*.mjs`
   diagnostic, per the Hold-Merge-Gate .sql rule) that writes canonical-ledger rows from frozen
   `payroll.*`; surfaces unmappable rows.
4. **(Only if Jorge picks JE over Bill, §7 Q1)** wiring FIN-18 + `net_pay_floor_pct` unification DDL.

**No new GL math.** All posting reuses `createBill`/`payBill` (Bill model) or the accounting spine +
`createJournalEntry` (JE model) already present.

### 6.2 OFF-flag rollout

- All money flags stay **OFF**: `SETTLEMENT_GL_POSTING_ENABLED` (FIN-18) and
  `SETTLEMENT_CAPPED_RECOVERY_ENABLED` (payroll recovery). Ship the applier wiring + floor unification
  **behind a new OFF flag** (e.g. `SETTLEMENT_DEDUCTION_APPLY_ENABLED`) routed through `isEnabled()`
  (NOT a raw `lib.feature_flags` read — that fixes H3-4 at the same time).
- **Fix H3-4 now:** replace the raw
  `SELECT default_enabled FROM lib.feature_flags` in `driver-settlement.service.ts:121-125` with
  `isEnabled(client, 'SETTLEMENT_CAPPED_RECOVERY_ENABLED', {operating_company_id, user_uuid})` so the
  flag honors per-entity scoping + kill-switch like every other money flag.
- Sequence: (1) wire applier in shadow/report mode → (2) tie-out green → (3) Jorge flips the apply flag
  per entity (TRANSP first) → (4) Bill/JE posting flag last, after CPA + Neon sign-off.

### 6.3 CI guards (every fix gets a static guard — §2 constitution)

- **New:** `verify-settlement-net-floor-single-source.mjs` — assert exactly ONE floor resolver + default
  literal `5` (fails if `?? 50`, `0.1`, `DEFAULT 50`, or a second `resolveDriverFloor` reappears).
- **New:** `verify-deduction-applier-wired-into-close.mjs` — assert
  `applyPendingDeductionsToSettlementWithNetFloor` is invoked from the load-bookended close before
  `aggregateSettlementTotals` (regression guard for the overpay gap).
- **New:** `verify-deduction-line-carries-load-id.mjs` — assert every applied deduction line insert
  includes `load_id`; fail on any `load_id: null` aggregate advance line.
- **New:** `verify-settlement-flag-uses-resolver.mjs` — fail on any raw `lib.feature_flags` SELECT in the
  settlement services (forces `isEnabled`).
- **Keep + reconcile:** `verify-driver-settlement-uses-bill-not-je.mjs`,
  `verify-settlement-gl-flag-gate.mjs`, `verify-auto-deduction-applies-to-next-settlement.mjs`,
  `verify-driver-settlement-tenant-scope.mjs`. **Note:** the bill-not-JE guard and any FIN-18-wire are
  mutually exclusive — do NOT wire FIN-18's JE poster while that guard stands (§7 Q1 must resolve first).

### 6.4 Test / tie-out plan (settlement net pay MUST tie to GL)

1. **Unit:** the capped-recovery math is already locked (`settlement-capped-recovery.test.ts`); add
   5%-default + apply-time-override cases; add pay-first-then-escrow split cases.
2. **Integration (real PG):** close a load-bookended settlement with pending cash-advance +
   abandonment deductions → assert applied lines carry `load_id`, net = gross − Σapplied + reimb, floor
   respected at 5%, over-floor remainder deferred/escrowed.
3. **Tie-out (the money invariant):** for a posted settlement, assert
   `net_pay == Σ debits(driver-pay + reimb) − Σ credits(bucket recoveries)` **and** the posted GL
   artifact (Bill+Payment **or** JE, per §7 Q1) nets to the same `net_pay`. Σ(remaining on
   `driver_settlement_deductions`) per driver == the QBO-149 outstanding asset (the invariant
   `settlement-capped-recovery.ts:14-15` already promises). Escrow deposits == Σ(deductions routed to
   escrow).
4. **Shadow tie-out before any flip:** run the applier in report mode over live-shape data and diff
   canonical-ledger recovery vs the current payroll `advance_recovery` lines
   (`payroll/settlement-shadow.service.ts` is the vehicle); zero unexplained variance is the gate.

---

## 7. OPEN QUESTIONS FOR JORGE (do not proceed past these without a ruling)

1. **Bill vs JE posting model (THE locked-vs-locked conflict).** Live `payroll.*` posts an **A/P
   Bill+Payment** (CI-locked by `verify-driver-settlement-uses-bill-not-je.mjs`, QBO-parity-correct for
   1099 drivers). Dormant FIN-18 posts a **balanced JE with net-pay CLEARING** (per
   `finance-engine-decisions-locked`). **Which is canonical?** Everything downstream (which surface to
   wire, which guard to keep) turns on this. *Recommend: keep the Bill model, drive it from the
   `driver_finance` settlement; hold FIN-18 as GL-detail/reversal companion.*
2. **`payroll.*` disposition:** freeze read-only (recommended) vs fully retire behind an archive view?
   Confirm we keep the tables for history (no DROP).
3. **Floor semantics:** cap-and-defer (capped-recovery engine) vs hard-block (FIN-18)? *Recommend
   cap-and-defer* to match "escrow keeps growing." Confirm.
4. **Pay-vs-escrow ordering** when both are possible in one settlement (recommend pay-to-5%-floor first,
   escrow the remainder).
5. **5% default backfill:** flip only the column DEFAULT going forward, or also backfill existing rows
   still holding 50 → 5? (Some drivers/companies may have an intentional per-row value.)
6. **`SETTLEMENT_CAPPED_RECOVERY_ENABLED` H3-4 fix:** OK to reroute the raw `lib.feature_flags` read
   through `isEnabled()` now (non-money, hardening), or bundle it with the money-flag work?

---

## Appendix — evidence index (file:line)

- Surface A close: `driver-finance/settlements-load-bookended.service.ts:161,289,297,303`
- Surface A routes: `index.ts:806,808`; `driver-finance/pre-settlement.routes.ts:247,322`
- Correct applier (unwired): `driver-finance/settlement-deduction-cap.service.ts:159,196`
- Floor resolver 1 (default 50): `settlement-deduction-cap.service.ts:20-22`;
  `db/migrations/202606071910_settlement_min_net_floor.sql:14,18`
- Payment state machine (G7-1): `driver-finance/settlement-payment.service.ts:7,107-112`;
  cron `driver-finance/auto-pay.cron.ts:5,80`
- Surface B routes: `index.ts:992`; `payroll/driver-settlement.routes.ts:22,50`
- Surface B posts Bills: `payroll/driver-settlement.service.ts:390,447,460`
- Surface B raw flag (H3-4): `payroll/driver-settlement.service.ts:121-125`
- Surface B `load_id:null` aggregate line: `payroll/driver-settlement.service.ts:199-222`
- Capped-recovery math: `payroll/settlement-capped-recovery.ts:85-136`
- Surface C FIN-18 poster (dormant, JE): `accounting/settlement-posting/settlement-posting.service.ts:205,116-127,266-287,303-357`
- Floor resolver 2 (default 0.1): `accounting/settlement-posting/settlement-posting.math.ts:9,19-27`
- FIN-18 route NOT registered: `accounting/settlement-posting/settlement-posting.routes.ts:45,135` (no `index.ts` hit)
- Bill-not-JE CI lock: `scripts/verify-driver-settlement-uses-bill-not-je.mjs`
- `load_id`-direct deduction migration: `db/migrations/202606272300_deduction_line_load_id_direct.sql`
- Prior trace: `docs/specs/repairs/SETTLEMENT-ENGINE-TRACE-2026-07-04.md`
