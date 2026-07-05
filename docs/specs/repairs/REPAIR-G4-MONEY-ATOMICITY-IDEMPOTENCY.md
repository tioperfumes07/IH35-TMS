# REPAIR G4 — Money Atomicity (G4-TX1) + Route Idempotency (G4-IDEM1)

**Status:** DESIGN + PROOF ONLY — no production code in this PR. §1.4 gate: this advances
posting/GL reliability the compliant way (design + proof first). **Nothing here is built or
merged as behavior.** Jorge reviews the design before any implementation branch.

**Type:** Reliability / Money-correctness. Two related CRITICAL findings.
**Author:** design-doc agent (isolated worktree). **Date:** 2026-07-05 (CT).

---

## 0. TL;DR

Two independent gaps let a single user action leave the books in a torn state:

- **G4-TX1 (atomicity):** the **source-row write and its GL post commit in two separate
  database transactions.** The GL poster (`postSourceTransaction`) and the settlement poster
  (`postSettlementToGl`) each call `withCurrentUser(...)`, which acquires **its own pooled
  connection and runs its own `BEGIN/COMMIT`**. They accept no caller-provided client, so the
  ledger post can **never** join the caller's source-write transaction. A crash (or a rollback
  of the caller's transaction) **between** the two commits leaves either a source row with no
  GL entry, or a GL entry with no/rolled-back source row.

- **G4-IDEM1 (idempotency):** an HTTP idempotency layer **already exists**
  (`middleware/idempotency.ts` + `public.idempotency_keys`), but **several money routes are not
  on its required-matcher list** — so a retried/duplicated POST to those routes re-executes and
  can **post twice** (double cash-advance, double customer payment, double driver-settlement).

Neither fix requires a schema migration for the recommended approach. The idempotency ledger
(`public.idempotency_keys`) and the poster dedup key (`accounting.posting_batches.idempotency_key`,
unique index) **already exist and are reused**. A migration is implied **only** if Jorge prefers
the outbox variant of the atomicity fix (§3.3) — flagged for his decision, not assumed.

---

## 1. Current state (evidenced)

### 1.1 The transaction primitive

`withCurrentUser` is one transaction on one freshly-checked-out pooled connection:

- `apps/backend/src/auth/db.ts:211` — `export async function withCurrentUser<T>(...)`
  - `:220` `await client.query("BEGIN");`
  - `:234` `await client.query("COMMIT");`
  - `:237` `await client.query("ROLLBACK")` on error

So **each `withCurrentUser` call == one DB transaction on its own connection.** Two
`withCurrentUser` calls == two transactions on two connections, with a commit boundary between
them, even if the second is invoked syntactically "inside" the first.

### 1.2 The GL posters each open their OWN transaction (root of G4-TX1)

- `apps/backend/src/accounting/posting-engine.service.ts:1328`
  `export async function postSourceTransaction(input, actor)` →
  `:1344` `return await withCurrentUser(actor.userId, async (client) => { ... })`.
  This is the canonical writer for source types `invoice | bill | customer_payment |
  bill_payment | cash_advance | driver_advance | expense | bank_categorization`
  (`:9`). It **takes no caller client** — it always opens its own transaction.

- `apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts:205`
  `export async function postSettlementToGl(...)` → `:209`
  `return withCurrentUser(actor.userId, async (client) => { ... })`. Same shape — own transaction,
  no injected client.

Because the poster owns its connection, **there is no code path by which a caller can make its
source-row write and the GL post share one transaction.** This is the single architectural root
cause behind every affected money path below.

### 1.3 Affected money paths (source write and GL post in separate transactions)

| Money path | Source write (txn A) | GL post (txn B, separate connection) | Evidence |
|---|---|---|---|
| **Cash advance / driver advance** | phase1 flips `driver_advances.disbursement_status = 'disbursed'` and commits | `postSourceTransaction('driver_advance')` | `cash-advances/cash-advance-disburse.ts:48` (phase1 `withCurrentUser`, commits at line 102) → `:106` separate `postSourceTransaction` |
| **Customer payment** | `applyPayment` writes `payment_applications` (+ optional credit memo) on the caller's `client` | `postSourceTransaction('customer_payment')` on a **different** connection | `accounting/payments/apply.service.ts:262` (`applyPayment(client,...)`), inserts at `:203`/`:302-308`, then `:310` `postSourceTransaction(...)`, then `:328` `createArCreditMemo` **after** the post |
| **Bill payment** | bill-payment row created by route, then GL posted | `postBillPaymentGlIfEnabled` → `postSourceTransaction('bill_payment')` | `accounting/bill-payment-gl.service.ts:47-63`; route `accounting/bill-payment-gl.routes.ts:51` |
| **Expense** | expense row created/approved, then posted | `postSourceTransaction('expense')` | `accounting/expenses.routes.ts:499`, `:733` |
| **Driver settlement (GL)** | settlement finalized/locked elsewhere | `postSettlementToGl` own txn | `accounting/settlement-posting/settlement-posting.service.ts:205` |
| **Bank-feed categorization** | categorized bank line persisted, then posted | `postSourceTransaction('bank_categorization')` | `banking/bank-feed-gl-posting.service.ts:219` |
| **Maintenance / recurring bills** | source row, then post | `postSourceTransaction(...)` | `accounting/maintenance-posting/poster.service.ts:358`; `accounting/bills/recurring/generator.service.ts:91` |

The cash-advance path even **documents the split as intentional**:

> `cash-advance-disburse.ts:32-35` — *"Two phases on purpose: the disbursed flip must COMMIT
> before the posting reads the row, so buildDriverAdvanceLines (a separate pooled connection)
> sees disbursement_status='disbursed'. The post is idempotent ... so a retry never
> double-posts."*

That comment is correct that **re-posting** is idempotent (see §2.2) — but idempotency of the
GL post does **not** make the pair atomic. If the process dies after line 102 (source committed)
and before the post at line 106 commits, the advance is `disbursed` with **no journal entry**,
and nothing re-drives the post. That is the G4-TX1 orphan.

The **customer-payment** case is the sharper one: `postSourceTransaction` at
`apply.service.ts:310` runs on its own connection and commits the GL **while the caller's `client`
transaction is still open**; a later failure in the same handler (e.g. `createArCreditMemo` at
`:328`) **rolls back the applications** but **leaves the GL post committed** — a GL entry with no
backing application rows. Order-of-commit is not controllable while the poster owns its own
connection.

### 1.4 The idempotency layer exists…

- `apps/backend/src/middleware/idempotency.ts` — full HTTP idempotency middleware
  (`registerIdempotencyMiddleware`, `:214`). Behaviors: missing key → 400 (`:226`); replay of a
  matching key → cached response, no side effects (`:255-264`); same key, different body → 409
  (`:256`); TTL 24h; **fail-closed on lookup error** (503, `:249`) so a store outage never
  double-processes.
- Registered on the prod app: `apps/backend/src/index.ts:406`
  `import { registerIdempotencyMiddleware }`; `Idempotency-Key` is an allowed CORS header
  (`index.ts:587`).
- Backing table: `db/migrations/202606071300_idempotency_keys.sql` — `public.idempotency_keys`
  (`key uuid PK`, `request_hash`, `response_status`, `response_body jsonb`, `ttl_at`, RLS +
  tenant policy, GRANTs to `ih35_app`).
- The GL poster **also** has its own DB-level dedup: `accounting.posting_batches.idempotency_key`
  with `CREATE UNIQUE INDEX ... uq_posting_batches_company_idempotency_key`
  (`db/migrations/0195_accounting_posting_backbone_schema.sql:145-147`), consulted at
  `posting-engine.service.ts:240-303` before any write. This is what makes a **repeated post of
  the same source** a no-op (`already_posted`).

### 1.5 …but several money routes are OFF it (root of G4-IDEM1)

The middleware only enforces on `REQUIRED_MATCHERS` (`idempotency.ts:38-50`):

```
/driver-finance/settlements, /accounting/invoices, /accounting/bills,
/accounting/bill-payments, /expenses, /accounting/payments,
/accounting/journal-entries, /accounting/factoring-advances,
/banking/transactions, /banking/manual-je, /qbo-sync/
```

Real money routes whose URL prefix is **NOT** in that list — so they receive **no idempotency
enforcement** and a duplicated request re-executes:

| Uncovered money route | File:line | Double-post risk |
|---|---|---|
| `POST /api/v1/payroll/driver-settlements/:id/post` | `payroll/driver-settlement.routes.ts:50` | settlement→bill + bill_payment created twice (matcher lists `/driver-finance/settlements`, **not** `/payroll/driver-settlements`) |
| `POST /api/v1/accounting/settlement-posting/post` (and `/reverse`, `/recover-from-driver`) | `accounting/settlement-posting/settlement-posting.routes.ts:47,77,93` | not matched — relies solely on the poster's own dedup key; the reverse/recover routes have money side-effects beyond the JE |
| `POST /api/v1/cash-advances` | `cash-advances/cash-advances.routes.ts:224` | duplicate advance record |
| `PATCH /api/v1/cash-advances/:id/mark-disbursed` | `cash-advances/cash-advances.routes.ts:255` | duplicate disbursement trigger |
| `POST /api/v1/cash-advances/hub/requests/:id/approve` | `cash-advances/driver-hub-requests.routes.ts:60` | duplicate approval → duplicate downstream advance |
| `POST /api/v1/customers/:id/payments` | `accounting/customer-payments.routes.ts:116` | duplicate customer payment (matcher lists `/accounting/payments`, **not** `/customers/:id/payments`) |

**Note on partial protection:** for the two settlement paths and cash-advance disburse, the GL
**post** is still guarded by the poster's `idempotency_key` unique index (§1.4), so the *journal
entry* won't duplicate. But the **source records** (bill, bill_payment, advance, customer
payment) are written *before/outside* that guard and **will** duplicate on a retried request.
That is the money bug the HTTP layer is meant to stop.

**Secondary weakness even on covered routes:** the middleware stores the key in an `onSend`
hook on a **separate `withLuciaBypass` connection AFTER** the money transaction has committed
(`idempotency.ts:270-317`; store is best-effort, failure only logged at `:308-314`). So there is
a narrow window: money commits, response is sent, key store fails → a genuine retry re-processes.
This is a smaller gap than the uncovered routes, but it is the same class and worth closing in
the same repair (see §3.4).

---

## 2. Root-cause analysis

### 2.1 Why the split exists (G4-TX1)

The posting engine was designed as a **self-contained, independently-callable writer**: a route,
a cron/backfill (`runPostingEngineMvpBackfill`, `posting-engine.service.ts:1627`), the recurring
worker, and the reconcile flows all call the *same* `postSourceTransaction`. Making it own its
transaction kept every caller trivial and guaranteed the JE + posting_batch + posting lines +
`transaction_source_links` are internally consistent. The cost is that it **cannot enroll in a
caller's transaction** — the exact property atomicity needs. The cash-advance comment shows the
split was then *rationalized* around a real constraint: `buildDriverAdvanceLines` reads the
source row, so the source flip must be visible — which is only true **because** the reader is on
a different connection. Put them on the *same* connection and the visibility problem disappears
(a transaction sees its own uncommitted writes).

### 2.2 What already exists to reuse (reuse-first)

- **A transaction primitive that can be shared:** `withCurrentUser` already yields a `client`.
  The missing piece is a poster **variant that accepts that `client`** instead of opening its
  own. No new infra — just an injected-client overload.
- **Poster-level idempotency:** `posting_batches.idempotency_key` unique index + the
  `getExistingPostingResultByIdempotencyKey` short-circuit (`posting-engine.service.ts:240`).
  Deterministic key via `buildPostingMvpIdempotencyKey` (`:168`). Reused as-is — it keeps
  re-posts safe *inside* the single transaction.
- **HTTP idempotency:** `middleware/idempotency.ts` + `public.idempotency_keys`. The G4-IDEM1
  fix is almost entirely **adding matchers**, not new machinery.

### 2.3 Why idempotency ≠ atomicity (they are complementary, both required)

- HTTP idempotency stops a **duplicate request** from being processed twice.
- Transaction atomicity stops **one request** from committing half its effects.

G4-TX1 is a *single* request tearing; G4-IDEM1 is a *duplicate* request double-posting. Fixing
one does not fix the other. The repair addresses both.

---

## 3. Proposed fix (design, not built)

### 3.1 G4-TX1 — one transaction spanning source write + GL post (recommended)

**Approach A (recommended, NO migration): injected-client poster overload.** Add a variant of
the poster that runs on a caller-supplied `client` and does **not** open its own transaction. The
caller wraps *both* the source write and the post in ONE `withCurrentUser`, so they commit or
roll back together.

Concrete transaction boundary (cash-advance disburse, the clearest case):

```
// BEFORE (two transactions — cash-advance-disburse.ts)
const phase1 = await withCurrentUser(user, async (client) => {
  ...FOR UPDATE lock; UPDATE driver_advances SET disbursement_status='disbursed'...
});                                   // <-- COMMIT #1 (source flipped)
if (!phase1.ok) return phase1;
const posting = await postSourceTransaction({...}, {userId: user});
                                      // <-- opens its OWN connection, COMMIT #2 (GL)
// CRASH between COMMIT #1 and COMMIT #2  →  advance 'disbursed' with NO journal entry

// AFTER (one transaction)
return await withCurrentUser(user, async (client) => {
  await client.query(`SELECT set_config('app.operating_company_id',$1::text,true)`,[companyId]);
  ...FOR UPDATE lock; UPDATE driver_advances SET disbursement_status='disbursed'...;
  const posting = await postSourceTransactionOnClient(client, {   // <-- SAME client
    operating_company_id: companyId,
    source_transaction_type: "driver_advance",
    source_transaction_id: input.advance_id,
    credit_account_id: input.credit_account_id ?? null,
  }, { userId: user });
  return { ok: true, advanceId: input.advance_id, posting };
});                                   // <-- SINGLE COMMIT: source flip + JE atomically
// CRASH anywhere before COMMIT  →  BOTH roll back. No orphan. Invariant held.
```

Implementation shape (no new GL math — pure extraction, honoring §1.4 "reuse EXISTING posting
functions"):

- Refactor `postSourceTransaction` so its body becomes `postSourceTransactionOnClient(client,
  input, actor)` (everything currently inside the `withCurrentUser` closure, unchanged).
- Keep `postSourceTransaction(input, actor)` as a thin wrapper: `withCurrentUser(actor.userId,
  (client) => postSourceTransactionOnClient(client, input, actor))` — **backward compatible** for
  every existing standalone caller (cron/backfill/worker keep working with zero change).
- The `set_config('app.operating_company_id', ...)` the poster does today
  (`posting-engine.service.ts:1345`) is harmless to repeat when the caller already set it (same
  value), so nested use is safe.
- Same extraction for `postSettlementToGl` → `postSettlementToGlOnClient`.
- Migrate callers to the injected-client form **one money path at a time**, behind the flag in
  §5. Order: driver-advance → customer-payment → bill-payment → expense → settlement →
  bank-feed → maintenance/recurring.
- The poster's own `idempotency_key` dedup still runs inside the shared transaction, so a
  same-source re-post remains a no-op — now *without* a cross-connection race.

**Why not "just reorder the commits":** impossible while the poster owns its connection — there
is no shared commit to order. Approach A removes the second connection entirely.

### 3.2 The one real constraint and its resolution

The cash-advance comment claims the reader needs the source row committed. Inside one
transaction that is **automatically satisfied**: `buildDriverAdvanceLines` runs on the *same*
`client` and sees the uncommitted `UPDATE ... 'disbursed'` (read-your-writes). No `FOR UPDATE`
visibility problem, no cross-connection staleness. This removes the *only* stated reason for the
split.

### 3.3 Approach B (alternative, MIGRATION IMPLIED — for Jorge's decision only)

If a future money path genuinely cannot co-locate the source write and the post in one txn (e.g.
the source lives in a different service/DB, or the post must be deferred), use a **transactional
outbox**: in txn A, write the source row **and** an `accounting.posting_outbox` intent row
(same transaction, atomic). A worker then drains the outbox and calls the poster; the poster's
existing `idempotency_key` guarantees exactly-once GL. This needs a **new table
`accounting.posting_outbox`** → **migration → §1.4 STOP, Jorge decides.** Recommended **only** if
Approach A is proven infeasible for a specific path; today none require it, so **Approach A is the
default and no migration is implied.**

### 3.4 G4-IDEM1 — put every money route on the idempotency layer (NO migration)

1. **Add the missing matchers** to `REQUIRED_MATCHERS` (`idempotency.ts:38`):
   ```
   /^\/api\/v1\/payroll\/driver-settlements(\/|$)/i,
   /^\/api\/v1\/accounting\/settlement-posting(\/|$)/i,
   /^\/api\/v1\/cash-advances(\/|$)/i,
   /^\/api\/v1\/customers\/[0-9a-f-]+\/payments(\/|$)/i,
   ```
   Nothing else in the middleware changes; the table, TTL, replay/conflict logic, and cleanup
   cron are reused verbatim. Frontend/PWA callers of these routes must send `Idempotency-Key`
   (they already do for the covered routes — same client helper).
2. **Close the store-window (secondary):** where a money route is *also* refactored to Approach A
   (single txn), write the idempotency key **inside that same transaction** rather than in
   `onSend`, so the money commit and the key store are atomic. This is an *enhancement layered on
   the §3.1 refactor*, path-by-path; the `onSend` store remains the default for read/side-effect
   routes. (Requires the middleware to expose the computed key to the handler — a request
   decoration, no schema change.)

### 3.5 Net: does this imply a migration?

**No, for the recommended path.** Both fixes reuse existing tables (`idempotency_keys`,
`posting_batches.idempotency_key`). A migration is implied **only** if Jorge picks Approach B
(`accounting.posting_outbox`) — explicitly flagged, not assumed.

---

## 4. SQL / JE proof

### 4.1 The failure today (G4-TX1 orphan) — driver advance

```
-- txn A (cash-advance-disburse.ts phase1) — COMMITS
BEGIN;
  UPDATE driver_finance.driver_advances
     SET disbursement_status='disbursed', disbursed_at=now(), posting_date=CURRENT_DATE
   WHERE id = :advance;
COMMIT;                              -- source is now 'disbursed'

-- >>> PROCESS CRASH / pod eviction / DB failover here <<<

-- txn B (postSourceTransaction) NEVER RUNS
-- Result:
SELECT disbursement_status FROM driver_finance.driver_advances WHERE id=:advance; -- 'disbursed'
SELECT count(*) FROM accounting.posting_batches
  WHERE source_transaction_type='driver_advance' AND source_transaction_id=:advance; -- 0
-- INVARIANT BROKEN: money event recorded, ZERO ledger entry. Trial balance omits the advance.
```

### 4.2 The failure today (G4-TX1 orphan, reverse direction) — customer payment

```
-- One handler, but the GL post is on a DIFFERENT connection than the applications:
BEGIN;  -- caller client (apply.service.ts applyPayment)
  INSERT INTO accounting.payment_applications (...);           -- applications
  -- postSourceTransaction() on its OWN connection COMMITS the JE here:  (apply.service.ts:310)
  --   BEGIN; INSERT journal_entries/postings...; COMMIT;   <-- GL committed independently
  ... createArCreditMemo(...) THROWS  (apply.service.ts:328)
ROLLBACK;  -- caller rolls back → applications GONE
-- Result: GL journal entry EXISTS, payment_applications DO NOT. Orphaned ledger post.
```

### 4.3 The double-post today (G4-IDEM1) — customer payment retried

```
-- Client POSTs /api/v1/customers/:id/payments, network blip, client retries.
-- Route is NOT in REQUIRED_MATCHERS → middleware does nothing → handler runs BOTH times.
SELECT count(*) FROM accounting.payments WHERE ...;  -- 2 rows for one real payment
-- (For covered routes this returns 1: the replay short-circuits at idempotency.ts:255-264.)
```

### 4.4 How the fix prevents it — single transaction (Approach A)

```
BEGIN;  -- ONE withCurrentUser(client)
  SELECT set_config('app.operating_company_id', :oci, true);
  UPDATE driver_finance.driver_advances SET disbursement_status='disbursed' WHERE id=:advance;
  -- postSourceTransactionOnClient(client, ...) — SAME connection, SAME txn:
  INSERT INTO accounting.posting_batches (..., idempotency_key) VALUES (...)
    ON CONFLICT (operating_company_id, idempotency_key) DO NOTHING;  -- reused dedup
  INSERT INTO accounting.journal_entries (...);
  INSERT INTO accounting.journal_entry_postings (...);   -- balanced, trigger-checked
COMMIT;   -- BOTH the source flip and the JE commit together
-- CRASH before COMMIT  →  BOTH gone. No orphan in EITHER direction. Invariant preserved.
```

### 4.5 How the fix prevents the double-post (Approach §3.4)

```
-- After adding /customers/:id/payments to REQUIRED_MATCHERS:
-- 1st request: no prior key → process → store {key, request_hash, 201, body} in idempotency_keys.
-- retry (same key, same body): lookup hits (idempotency.ts:255) → replay cached 201, NO handler,
--   NO second accounting.payments row.
-- retry (same key, different body): 409 conflict (idempotency.ts:256) — never silently double-writes.
```

**Idempotency ledger tables — already exist, no new migration:**
- `public.idempotency_keys` — `202606071300_idempotency_keys.sql` (HTTP-layer dedup).
- `accounting.posting_batches.idempotency_key` + `uq_posting_batches_company_idempotency_key` —
  `0195_accounting_posting_backbone_schema.sql:145-147` (GL-layer dedup).

The **only** table that would be *new* is `accounting.posting_outbox`, and **only** under
Approach B (§3.3) — a migration → Jorge's call.

---

## 5. Rollout

**Flags (default OFF, per-entity, reuse `lib/feature_flags` — the same resolver the CHAIN posters
use, e.g. `bill-payment-gl.service.ts:22-39`):**

- `MONEY_TXN_ATOMICITY_ENABLED` — when ON for an entity, that entity's migrated money paths use
  the injected-client single-transaction form; when OFF, they use today's two-phase form. Ship
  path-by-path so a regression is isolated to one path + one entity.
- `IDEMPOTENCY_REQUIRED_ENFORCEMENT` — **already exists** (`idempotency.ts:60`, default ON, kill
  switch = `off`). The new matchers inherit it; no new flag needed. (If Jorge wants the *new*
  matchers ramped separately from the existing ones, add `IDEMPOTENCY_EXTRA_MATCHERS_ENABLED`
  defaulting OFF and gate only the added regexes.)

**Sequencing:**
1. Land the pure **extraction** (`postSourceTransactionOnClient` / `postSettlementToGlOnClient`)
   with the old wrappers delegating to them — behavior-identical, provable by existing poster
   tests. (This is the only change that touches `accounting.*` code paths → **§1.4: financial,
   Jorge merges** even though it's a no-op refactor.)
2. Add the four idempotency matchers (§3.4.1) — smallest, highest-value, no `accounting.*` touch
   beyond the middleware list.
3. Migrate money paths to the injected-client form one at a time behind
   `MONEY_TXN_ATOMICITY_ENABLED`, starting with driver-advance.

**CI guard (static, no DB) — `scripts/verify-money-txn-atomicity.mjs`, wired as
`verify:money-txn-atomicity` in `package.json` (mirrors `verify-expense-gl-posting.mjs`):**
- Assert **no** `withCurrentUser(` appears *between* a source-mutating `UPDATE/INSERT` and a
  `postSourceTransaction(`/`postSettlementToGl(` call within the same migrated handler (i.e. the
  migrated paths call `postSourceTransactionOnClient(client, ...)`, never the self-transaction
  wrapper).
- Assert every route in a canonical **money-route list** matches one of
  `REQUIRED_MATCHERS` in `idempotency.ts` — fails CI if a new money route is added without an
  idempotency matcher (this is the regression guard for G4-IDEM1). §2 CLAUDE.md: *"every bug fix
  gets a static CI guard so it can't regress."*

**Risks:**
- *Long transactions:* the post now runs inside the caller's txn, holding the source-row lock
  slightly longer. Posting is small (a JE header + a few lines); negligible, but measure p95 on
  the driver-advance path first.
- *Nested `set_config`:* the poster re-runs `set_config('app.operating_company_id', ...)`; it's
  the same value (transaction-local `true`), so idempotent — verified by the RLS smoke test.
- *Caller assumptions:* any caller relying on "the advance is committed before I return" (e.g. a
  post-commit timeline emit) must move that emit AFTER the single `withCurrentUser` returns — the
  cash-advance timeline emit at `cash-advance-disburse.ts:119-147` is already a post-commit
  best-effort block, so it stays as-is.
- *Idempotency on new routes:* frontend/PWA must send `Idempotency-Key` to the newly-required
  routes or they'll 400. Ship the matcher **after** confirming those clients send the header
  (they already do for the covered routes via the shared request helper).

**Test plan:**
- DB test: kill the connection between source write and post in the *old* path → assert orphan
  reproduces; run the *new* single-txn path → assert atomic rollback (no orphan either
  direction). Model on `apps/backend/src/accounting/__tests__/posting-engine-cash-advance.test.ts`
  and `payments/__tests__/apply-idempotent.test.ts`.
- Route test: duplicate POST to each newly-covered route with the same `Idempotency-Key` →
  assert exactly one source row + cached replay; different body + same key → 409.
- Poster regression: existing `settlement-posting`, `bill-payment-gl-posting`, `expense-gl`
  DB tests must stay green against the extracted `*OnClient` functions.

---

## 6. Open questions for Jorge

1. **Approach A vs B:** confirm the injected-client single-transaction refactor (Approach A, **no
   migration**) as the default. Approach B (`accounting.posting_outbox`) is a migration — do you
   want it built now as the pattern for future cross-service posts, or only if a path proves it's
   needed?
2. **Migration order for the money paths** behind `MONEY_TXN_ATOMICITY_ENABLED`: is
   driver-advance → customer-payment → bill-payment → expense → settlement → bank-feed →
   maintenance/recurring the priority you want, or should settlement lead (it's the highest-dollar
   path)?
3. **New idempotency matchers ramp:** enforce the four new matchers under the existing
   `IDEMPOTENCY_REQUIRED_ENFORCEMENT` (all-or-nothing with today's routes), or add a separate
   OFF-by-default `IDEMPOTENCY_EXTRA_MATCHERS_ENABLED` so they can be ramped per environment
   first?
4. **The step-1 extraction** (`postSourceTransactionOnClient`) touches `accounting.*` code even
   though it's behavior-identical. Per §1.4 you merge all `accounting.*` PRs — confirm you want to
   review even the no-op extraction, or treat a proven-identical extraction as pre-cleared.
5. **Store-window close (§3.4.2):** do you want the idempotency-key store moved *into* the money
   transaction for the migrated paths (fully atomic key + money), or is the current post-commit
   `onSend` store acceptable given lookup already fails closed?

---

## Appendix — file:line index

- Transaction primitive: `apps/backend/src/auth/db.ts:211,220,234,237`
- GL poster (own txn): `apps/backend/src/accounting/posting-engine.service.ts:1328,1344`;
  poster dedup short-circuit `:240-303`; key builder `:168`
- Settlement poster (own txn): `apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts:205,209`
- Cash-advance two-phase split: `apps/backend/src/cash-advances/cash-advance-disburse.ts:32-35,48,102,106`
- Customer-payment cross-connection post: `apps/backend/src/accounting/payments/apply.service.ts:262,310,328`
- Bill-payment poster: `apps/backend/src/accounting/bill-payment-gl.service.ts:47-63`; route `bill-payment-gl.routes.ts:51`
- Expense post: `apps/backend/src/accounting/expenses.routes.ts:499,733`
- Bank-feed post: `apps/backend/src/banking/bank-feed-gl-posting.service.ts:219`
- Maintenance/recurring post: `apps/backend/src/accounting/maintenance-posting/poster.service.ts:358`; `apps/backend/src/accounting/bills/recurring/generator.service.ts:91`
- Idempotency middleware: `apps/backend/src/middleware/idempotency.ts:38-50,60,214,226,249,255-264,270-317`; registered `apps/backend/src/index.ts:406,587`
- Idempotency table: `db/migrations/202606071300_idempotency_keys.sql`
- Poster dedup unique index: `db/migrations/0195_accounting_posting_backbone_schema.sql:145-147`
- Uncovered money routes: `payroll/driver-settlement.routes.ts:50`;
  `accounting/settlement-posting/settlement-posting.routes.ts:47,77,93`;
  `cash-advances/cash-advances.routes.ts:224,255`;
  `cash-advances/driver-hub-requests.routes.ts:60`;
  `accounting/customer-payments.routes.ts:116`
