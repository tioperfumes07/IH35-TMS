# DESIGN — Money-route idempotency: close the gaps AND invert the default

**Status:** DESIGN ONLY — no code change. Financial cluster (§1.4): owner approves before any build;
builder never self-merges.
**Author:** builder lane, 2026-07-20. **Verified against:** `origin/main`.
**Subject:** `apps/backend/src/middleware/idempotency.ts` (`REQUIRED_MATCHERS`, `isIdempotencyRequired`)
**Related:** `[[handoff-audit-and-fix-program-2026-07-20]]` §4.2 · the settlement double-pay memo
(`DESIGN-settlement-double-pay-row-lock-state-guard.md`) — same defect family: replay/duplicate money.

---

## 1. The immediate gap (verified) — and it is 4 routes, not 3

`REQUIRED_MATCHERS` is an allow-list of URL patterns that require an `Idempotency-Key`. A global
Fastify `preHandler` calls `isIdempotencyRequired(method, pathname)`; anything not matched is exempt.
So a POST that moves money but is not on the list can be **replayed** — double-click, client retry
after a slow response, two operators — with no dedupe. That is the same failure the settlement memo
describes, at the HTTP layer instead of the DB layer.

Reported as 3 uncovered routes. Verified on `origin/main` — **there are 4**; the 4th was not on the
list handed to me, which is exactly why an allow-list is the wrong shape (below):

| Route | File | Moves money? |
|---|---|---|
| `POST /api/v1/cash-advances` | `cash-advances/cash-advances.routes.ts:224` | creates a driver cash advance |
| `POST /api/v1/banking/transfers` | `banking/transfers.routes.ts:52` | `createTransfer`, `amountCents` |
| `POST /api/v1/bill-payments/cc` | `bill-payments/cc-payment.routes.ts:36` | pays a bill by card (`FOR UPDATE` on the bill) |
| **`POST /api/v1/banking/cc-payments`** | `banking/transfers.routes.ts:105` | `transferType:"cc_payment"`, `amountCents` — **NOT in the reported set** |

Note `/api/v1/banking/transactions` IS covered but its sibling `/api/v1/banking/transfers` is not —
the matcher list is path-literal, so adjacent money routes fall on opposite sides of it by accident.

### 1.1 Immediate fix (Tier 1, small)

Add all four to `REQUIRED_MATCHERS`:

```ts
/^\/api\/v1\/cash-advances(\/|$)/i,
/^\/api\/v1\/banking\/transfers(\/|$)/i,
/^\/api\/v1\/banking\/cc-payments(\/|$)/i,
/^\/api\/v1\/bill-payments\/cc(\/|$)/i,
```

`(\/|$)` (not a bare prefix) so `/cash-advances` and its sub-routes match while an unrelated
`/cash-advances-report` would not. This is correct and shippable on its own — but it does not fix the
mechanism that produced the gap.

---

## 2. The real defect — the allow-list FAILS OPEN

Every new money route is unprotected **by default** until a human remembers to add it to the list.
Nothing fails when they forget. That is the same structural shape as three other defects surfaced this
week, and it is worth naming because the fix is the same shape too:

- boilerplate `acceptance[]` passing G2 because presence was checked, not specificity;
- the reconciler reading DONE off file presence;
- the settlement UPDATE that matched without re-asserting state.

In every case **the safe outcome was not the default outcome.** An allow-list of money routes is a
standing invitation to that failure: the 4th route above already fell through it, silently, and the
next one will too.

### 2.1 Proposed inversion — fail CLOSED, enforced by a guard

Do not try to enumerate money routes by regex forever. Instead make "is this a money route?" an
**explicit, mandatory property of every mutating route**, and fail CI when a route hasn't declared:

**Option A (recommended) — route-level declaration + CI census.**
Every `POST/PUT/PATCH` under a money-bearing area must be classified, in code, as either
`idempotent: required` or `idempotent: not-money` with a one-line reason. A static guard
(`verify-money-routes-idempotency-declared.mjs`) enumerates all mutating routes (the same sweep this
memo used — 890 routes today) and FAILS if any route in a money area is undeclared. New money route
with no declaration → red CI, not a silent hole. The allow-list stops being the source of truth; the
per-route declaration is, and the guard makes omission impossible.

**Option B (lighter, weaker) — keep the allow-list but add a census guard** that lists every mutating
route matching a money-word heuristic and NOT covered by `REQUIRED_MATCHERS`, and fails if that set is
non-empty unless each is on an explicit `REVIEWED_NON_IDEMPOTENT` allow-list with a reason. This still
centralizes the list but forces a human decision on every newcomer instead of defaulting to exempt.

Recommendation: **A.** It puts the decision at the route, where the author has the context, and it
cannot be out-run by a new route the way a central regex list can. B is acceptable if A is judged too
invasive for now; both convert "silently exempt" into "loudly must-decide."

### 2.2 Scoping honesty

The full sweep flags ~110 mutating routes as money-shaped by keyword, but that number is a heuristic
with false positives (generic verbs like `post`/`complete`) and cannot be the spec. The guard must
classify from real handler behavior (does it INSERT an amount / call a poster / a transfer service),
not from the URL string. Building the money-route census is itself part of the work, and its output
must be reviewed route-by-route with the owner — I will not assert a count as fact.

---

## 3. Interaction with the settlement fix (do not double-count protection)

HTTP idempotency and the DB-level state guard are complementary, not redundant:

- Idempotency-Key dedupes at the **edge** — the same logical request submitted twice returns the
  stored first response and never re-enters the handler.
- The settlement `FOR UPDATE` + state-guarded UPDATE protects against **two DIFFERENT requests** (or a
  request without a key) racing on the same row.

A money route should have BOTH where it mutates state that another request can also mutate. Neither
substitutes for the other; the memo flags this so a reviewer does not treat one as covering the other.

---

## 4. Anti-regression guard (§2)

`scripts/verify-money-routes-idempotency-declared.mjs` (or `-census` for Option B), static, no DB:

1. Enumerate every `app.(post|put|patch)("/api/v1/...")` under money areas.
2. FAIL on any that is neither idempotency-required (matcher or declaration) nor explicitly reviewed
   as non-money with a reason.
3. Assert the 4 routes in §1 are covered (regression pin so they can't fall back off the list).
4. `--selftest` with a planted undeclared money route that MUST make the guard red.

Wire into `verify-steps/` + `locked-guards.yml` + `package.json`.

---

## 5. Open questions for the owner

1. **Option A vs B** — per-route declaration (stronger, more churn) vs central census guard (lighter,
   still fail-closed). My recommendation is A; both are real fixes, an allow-list-only patch is not.
2. **Retro-active replay check.** Has any of the 4 uncovered routes already been double-submitted in
   prod? A read-only probe (duplicate cash-advance / transfer / cc-payment rows with identical amount +
   payee + near-identical timestamps per entity) would quantify it. As with the settlement memo, a
   0-count means *not observed*, not *not vulnerable*.
3. **Priority order.** The §1.1 four-route patch is low-risk and can land first behind owner OK; the
   §2 inversion is the durable fix and can follow. They are separable PRs.

---

## 6. What this document does NOT do

No code changed. No route added to `REQUIRED_MATCHERS` yet. No guard built yet. No migration, no
posting, no prod access. A design proposal awaiting the owner's approval; per §1.4 the builder will not
self-merge, and per the standing rule the builder does not merge at all.
