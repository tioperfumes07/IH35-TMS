# DESIGN — Settlement double-pay: row lock + state-guarded UPDATE

**Status:** DESIGN ONLY — no code change, no posting math, no flag flip. Financial cluster (§1.4):
owner approves before any build; builder never self-merges.
**Author:** builder lane, 2026-07-20. **Verified against:** `origin/main` @ `68df157ff`.
**Subject:** `apps/backend/src/driver-finance/settlement-payment.service.ts`
**Related:** `[[handoff-audit-and-fix-program-2026-07-20]]` §4.1 · block `block-22-driver-settlement-engine`

---

## 1. Root cause — a TOCTOU race, and it is in ALL FIVE mutators (not just `markPaidManually`)

Every payment-state mutator in the service repeats the identical three-step shape:

```
1. loadSettlement(client, settlementId, operatingCompanyId)   -- plain SELECT, NO row lock
2. validateTransition(currentState, target)                   -- decided in APPLICATION MEMORY
3. UPDATE ... SET payment_state = '<target>'
     WHERE id = $1 AND operating_company_id = $2               -- NO payment_state predicate
```

Verified line ranges on `68df157ff`:

| Function | Target state | Load | Guarded UPDATE? | Moves money? |
|---|---|---|---|---|
| `queuePayment` | `queued` | L126–153 | NO | indirectly — enters the ACH path |
| `markSentToBank` | `sent_to_bank` | L178–196 | NO | **YES — ACH release** |
| `markCleared` | `cleared` | L221–238 | NO | records bank clearing |
| `markBounced` | `bounced` | L270–287 | NO | reverses/flags |
| `markPaidManually` | `manual_paid` | L333–354 | NO | **YES — records a real disbursement** |

The check happens against a value read in step 1; the write in step 3 never re-asserts that value.
Between the two there is no lock and no predicate. That is a textbook time-of-check-to-time-of-use race.

**The concrete double-pay:** two concurrent clicks (double-click, retry, two dispatchers, a client
retry after a slow response) both read `payment_state = 'unpaid'`, both pass `validateTransition`,
both issue the UPDATE. Both UPDATEs match, both succeed. Result: **two `settlement_payment_events`
rows, two audit entries, and a driver recorded as paid twice** — and on `markSentToBank`, potentially
two real ACH releases.

### 1.1 Why the surrounding transaction does NOT save this

`withCurrentUser` does open a transaction (`apps/backend/src/auth/db.ts` L218–220: `pool.connect()`
then `BEGIN`). That is not sufficient, and it is important to be precise about why, because "it's in a
transaction" is exactly the reasoning that lets this ship:

Postgres default isolation is **READ COMMITTED**. Under READ COMMITTED, when transaction B's UPDATE
hits a row that transaction A has locked, B *blocks* until A commits, then **re-evaluates its WHERE
clause against the newly committed row**. That re-evaluation is the safety mechanism — and it is
useless here, because the WHERE clause contains only `id` and `operating_company_id`. Both still
match after A's commit. So B proceeds and overwrites. The transaction serializes the *writes* but
enforces nothing about the *state* they were predicated on.

### 1.2 The guard existed and was lost in the canonicalization

The retired `apps/backend/src/payroll/driver-settlement.service.deprecated.ts` carries both halves:
`FOR UPDATE` on its settlement lookups (L289, L446, L587) **and** an idempotency latch that returns
`{ idempotent: true }` when the settlement is already in a terminal posted/paid state (L446–458).

The canonical `driver-finance` service has **neither**. This is not a defect that was never fixed —
it is a protection that existed, and was dropped when settlement moved `payroll.*` → `driver_finance.*`.
Same class of loss as the stale-signature-path finding in the block registry: the canonicalization
moved the code and left a safety property behind.

---

## 2. The fix

### 2.1 State-guarded UPDATE — this is the load-bearing change

Add the expected state to the WHERE clause of all five mutators:

```sql
UPDATE driver_finance.driver_settlements
   SET payment_state = 'manual_paid', ...
 WHERE id = $1
   AND operating_company_id = $2
   AND payment_state IS NOT DISTINCT FROM $5   -- the state observed in step 1
RETURNING ...
```

`IS NOT DISTINCT FROM` (not `=`) because `payment_state` is nullable and `settlementPaymentState()`
already coerces `NULL → 'unpaid'`; a plain `=` would never match a NULL row and would break the very
first transition of every settlement.

This alone closes the race, including without `FOR UPDATE`: under READ COMMITTED the loser's UPDATE
re-evaluates after the winner commits, the state no longer matches, and it affects **0 rows**.

### 2.2 `FOR UPDATE` on the load — defence in depth

```sql
SELECT ... FROM driver_finance.driver_settlements
 WHERE id = $1 AND operating_company_id = $2
 LIMIT 1
 FOR UPDATE
```

The predicate in 2.1 is what makes the outcome correct; `FOR UPDATE` makes it *orderly*. It serializes
contenders at the read, so the loser blocks and observes the true post-commit state rather than racing
to a doomed UPDATE, and it protects the read-decide-append window covering `appendPaymentEvent` and
`appendCrudAudit`. Ship both. Restores the property the deprecated file had.

### 2.3 Error semantics — do not turn a correct rejection into a false alarm

Today `if (!updated) throw new Error("settlement_mark_manual_paid_failed")`. After 2.1, a 0-row result
becomes the *normal* concurrency-rejection path, so that generic error would fire on healthy behavior
and page someone. Re-read the row after a 0-row UPDATE and split the outcomes:

- **already in the target state** → treat as **idempotent success**, return the existing row, append
  NO second payment event and NO second audit row. This mirrors the deprecated latch's
  `{ idempotent: true }` and is what makes a double-click safe rather than merely rejected.
- **in some other state** → `invalid_payment_state_transition` (the existing, correct error).
- **row absent** → `settlement_not_found`.

The duplicate-suppression matters as much as the UPDATE guard: without it, the loser still writes a
second `settlement_payment_events` row and a second audit entry, so the ledger still *reads* like two
payments even though only one landed.

### 2.4 Scope

Fix all five mutators in the same change. Fixing only `markPaidManually` leaves `markSentToBank` — the
ACH release, arguably the higher-consequence path — racing.

---

## 3. Anti-regression guard (§2: every bug fix gets a CI guard)

`scripts/verify-settlement-payment-state-guard.mjs`, static (no DB required, so it cannot silently
SKIP under `verify:static`'s dead-port sentinel):

1. Every `UPDATE driver_finance.driver_settlements SET payment_state` in the service carries a
   `payment_state` predicate in its WHERE clause.
2. Every settlement lookup feeding such an UPDATE uses `FOR UPDATE`.
3. No mutator throws a generic failure on a 0-row update without first distinguishing the
   already-in-target case.
4. `--selftest` covering each assertion, both directions (a deliberately unguarded fixture must FAIL).

Wire into `verify-steps/` + `locked-guards.yml` + `package.json`, per the standard pattern.

---

## 4. Verification plan (owner-gated; builder does not execute)

- **Unit/integration:** two concurrent `markPaidManually` calls against one settlement → exactly ONE
  state change, ONE `settlement_payment_events` row, ONE audit row; the loser returns idempotent
  success. Repeat for `markSentToBank`.
- **Live (GUARD, prod):** count settlements holding more than one terminal payment event, and any
  driver with duplicate disbursements for a single settlement — this quantifies whether the race has
  **already fired in production**, which is currently unknown and is the first thing worth learning.
- A 0-count on that probe means "not yet observed," **not** "not vulnerable" — the defect is proven by
  code shape regardless of whether it has fired.

---

## 5. Open questions for the owner

1. **Has it already fired?** Needs the §4 prod probe. If duplicates exist, remediation is a separate
   owner-directed correction — void-not-delete, never a silent cleanup.
2. **`markSentToBank` idempotency reaches outside the DB.** If a duplicate call already released an
   ACH instruction to the bank, a state guard prevents the *second record* but cannot recall the
   *first instruction*. Whether an external-side idempotency key is also required depends on the ACH
   integration's own replay behavior — worth answering before this is called closed.
3. **Priority.** This is the highest-consequence open financial defect on the list: it can overpay a
   driver, and per the locked driver model (Mexican-B1 1099 contractors, pay is a wage/fee) an
   overpayment is a recovery problem against a person, not a reversible inter-company entry.

---

## 6. What this document does NOT do

No code changed. No migration. No posting/GL math. No flag flipped. No prod access taken. The fix
above is a design proposal awaiting the owner's approval; per §1.4 the builder will not self-merge it,
and per the standing rule the builder does not merge at all.
