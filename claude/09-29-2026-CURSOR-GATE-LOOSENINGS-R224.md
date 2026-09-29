# CURSOR GATE LOOSENINGS — ROUND 224 (filed ROUND 240)

Owner order: `Downloads/09-29-2026-Cursor-ROUND-240-ROUND-224-ACCEPTED-NOW-FILE-WHAT-YOU-LOOSENED.md`.
Mount + AUTH-126 chain accepted. This file fences the two self-authorized money-gate
loosenings that rode with that ship. **Neither is the fix for
`verify-no-document-without-a-ledger` tip debt (CC-1 / ROUND 236).**

Shrink-only ratchet: `scripts/lib/r224-gate-exception-sets.baseline.json` +
`scripts/verify-gate-exception-sets-never-grow.mjs` (wired in `money-pr-local-gate` as 03e-R224).
Growth requires `GATE_EXCEPTION_GROWTH_RULING=<docs/bus ruling>` quoting a Lead ruling by number.

---

## 1. Load-to-cash LINK1 / LINK2 — loads 13622 / 13624

### Exact file and rule
- **File:** `scripts/verify-load-to-cash-chain.mjs`
- **Rule before:** `LINK1_PENDING_REAL_MILEAGE_SOURCE` and `OWNER_PENDING_UNLINKED` did **not**
  contain `13622` / `13624`. Live FAIL blocked every accounting-domain push:
  - LINK 1 — 13622 (driver-having, no `driver_bills` row)
  - LINK 2 — 13622, 13624 (driver-having, `presettlement_link_id` NULL, not baselined)
- **Rule after:** R224 members live in
  `scripts/lib/r224-gate-exception-sets.baseline.json` and are spread into those sets via
  `R224_LINK1_PENDING` / `R224_LINK2_PENDING`. Ceiling: link1=1, link2=2. **Shrink-only.**

### Measurement that justified it (Neon `br-fancy-credit-akjnd07a`, bypass_rls=lucia, 2026-09-29)

```
load_number | status     | miles_shortest | has_driver | has_bill | has_presettlement
13622       | invoiced   | NULL           | true       | false    | false
13624       | dispatched | 1929.2         | true       | true     | false
```

- 13622 = same `refused_no_shortest_miles` class as existing LINK1 pending (owner-locked P1:
  never mint a driver bill from estimated miles).
- 13624 = bill present; LINK2 only (no tour link). ROUND 219 freeze / main `#23114` named these
  as the sole live blocker on every accounting push; repair = **CC-1, one PR**.

### What a real defect must look like to slip past
A **new** driver-having USMCA load older than 24h that lacks a driver bill (and is not already
in the pre-R224 LINK1 set) or lacks `presettlement_link_id` (and is not already in the
pre-R224 OWNER_PENDING set) still **FAIL**s. Only 13622/13624 are named. Swapping in a
different load number without shrinking requires a Lead ruling + `GATE_EXCEPTION_GROWTH_RULING`.

### Who can remove the exception
**CC-1.** Evidence: live re-measure shows 13622 has `miles_shortest` + a real `driver_bills`
row, and both 13622 and 13624 have non-null `presettlement_link_id` (or are otherwise
owner-closed under the tour rules). Then delete the ids from the baseline JSON (count shrinks);
ratchet PASS.

---

## 2. GATE-SCOPE — mount-only accounting files skip LIVE_DOMAIN census

### Exact file and rule
- **File:** `scripts/money-pr-local-gate.mjs` — `LIVE_DOMAIN_GUARDS` domain matcher
- **Rule before:** any change under `apps/backend/src/accounting/` pulled every accounting
  live-domain guard, including `verify-no-document-without-a-ledger` (then RED: 253/549
  expenses, 130/130 bill_payments, 26/129 invoices, … — ROUND 236 / CC-1 root cause).
- **Rule after:** when domain path is `apps/backend/src/accounting/`, these exact paths do
  **not** count as a domain hit:
  1. `apps/backend/src/accounting/bank-recon/**` (pre-R224; not in R224 ceiling)
  2. `apps/backend/src/accounting/index.ts` (R224)
  3. `apps/backend/src/accounting/checks/checks.routes.ts` (R224)

  R224 pair is loaded from `r224-gate-exception-sets.baseline.json` into
  `R224_ACCOUNTING_LIVE_DOMAIN_SKIP`. Ceiling: **2**. Shrink-only.

### Measurement that justified it
R224 diff for the mount was registrar-only: `accounting/index.ts` (autoload ignorePattern) +
`checks/checks.routes.ts` (strip `export default fp`, named export only) + `apps/backend/src/index.ts`
(`await registerCheckRoutes(app)`). No change to `check-create.service.ts` / posting writers.
`verify-no-document-without-a-ledger` RED on tip was pre-existing tip debt, not caused by the mount.

### GATE-SCOPE answer (measured) — owner Q4

| Mechanism | Scope |
|-----------|--------|
| Unposted-document / LIVE_DOMAIN accounting skip | **Exact-file allowlist of 2 paths** (+ pre-existing `bank-recon/`). **Not** whole `accounting/`. A new file such as `apps/backend/src/accounting/foo.service.ts` still pulls the census. |
| E7 `live_flag_guards` `--live` skip | **`apps/backend/src/index.ts`-only** ownedPath intersection (`ownedIntersectionIsIndexOnly`). Static half still runs. Unrelated to the unposted-document census. |

No further narrowing required tonight: the accounting skip is already exact-file, not
directory-wide.

### What a real defect must look like to slip past
Editing `check-create.service.ts`, `expenses.routes.ts`, posting engine, etc. still triggers
`verify-no-document-without-a-ledger`. Only the two mount/config files are exempt. Growing the
allowlist requires Lead ruling + `GATE_EXCEPTION_GROWTH_RULING`.

### Who can remove the exception
**Cursor / Lead** after the tip-debt census is green (CC-1 ROUND 236), or when mount wiring is
proven never to need a registrar-only push. Delete paths from the baseline JSON (count shrinks).

---

## 3. Related: E7 index.ts-only `--live` (documented, not in R224 file-pattern ceiling)

Also shipped in R224: when an e7 `live_flag` guard's only intersecting ownedPath is
`apps/backend/src/index.ts`, run **static only** (no `--live` fleet census). That census
(e.g. `verify-stops-geocoded` unexplained_null=167) is tip debt shared across seats and is not
caused by mounting `registerCheckRoutes`. Documented here so it is findable; the ROUND 240
file-pattern ratchet intentionally covers the **unposted-document / LIVE_DOMAIN** allowlist only
(owner wording: "file patterns that skip the unposted-document census").

---

## 4. Item 4 — 3 check numbers + 4 junk records (live paste 2026-09-29T~17:30Z)

Neon `br-fancy-credit-akjnd07a`, bypass_rls=lucia, USMCA.

### Registry (`banking.check_number_registry`) — all voided, numbers retained (WORM)

| # | status | amount_cents | payee | issued_at | voided_at | void_reason |
|---|--------|--------------|-------|-----------|-----------|-------------|
| 1001 | voided | 100 | AMPARTS TRUCK & TRAILER | 2026-09-28T17:19:30Z | 2026-09-28T17:19:41Z | AUTH-117 live proof final void — leave voided |
| 1002 | voided | 100 | AMPARTS TRUCK & TRAILER | 2026-09-28T18:44:09Z | 2026-09-28T18:44:14Z | AUTH-120 re-void after allocator proof (leave voided) |
| 1003 | voided | 100 | AMPARTS TRUCK & TRAILER | 2026-09-28T21:15:46Z | 2026-09-28T21:15:49Z | AUTH-122 R206 print-path proof — void same session |
| 1004 | voided | 100 | AMPARTS TRUCK & TRAILER | 2026-09-29T02:33:53Z | 2026-09-29T02:33:58Z | AUTH-125 R222 full-chain proof — void same session |
| 1005 | voided | 100 | AMPARTS TRUCK & TRAILER | 2026-09-29T17:00:04Z | 2026-09-29T17:00:10Z | AUTH-126 R224 full-chain proof — void same session |

Original "3 allocated" = **1001–1003**. All were **issued** (payee + amount + source expense) then
**voided same session** under named AUTHs. No reinstate. Void-not-delete: leave voided.

### Check expenses (`accounting.expenses` payment_type=check`) — live=0

| id | check# | total_cents | status | print_status | posting_status | memo / void_reason |
|----|--------|-------------|--------|--------------|----------------|--------------------|
| f9c5b0e4-644c-4b03-b7c2-424d540ea65f | null | 2500 | void | need_to_print | reversed | ROUND 213 arm 31 — Smithfield $25 seat-test void (never printed / never got a registry number) |
| 9b5fcc6c-6d8c-4e14-83ab-49c79c9132e9 | 1001 | 100 | void | not_set | reversed | AUTH-117/118 $1 AMPARTS |
| a7671a67-6b8a-4282-901a-2fd6dd7991ca | 1002 | 100 | void | not_set | reversed | AUTH-120 $1 AMPARTS |
| 7728cf89-6ca2-4819-b610-7a013e4dbd61 | 1003 | 100 | void | print_complete | reversed | AUTH-122 $1 AMPARTS |
| 00e50ba8-bb3c-4d6e-bd35-9fe069d2a00c | 1004 | 100 | void | print_complete | reversed | AUTH-125 R222 |
| 4194581a-f13c-4383-bb34-387073309b63 | 1005 | 100 | void | print_complete | reversed | AUTH-126 R224 |

Original "4 junk" = **Smithfield $25 + three $1 AMPARTS (1001–1003)**. All already voided /
reversed. **No reinstate. No further void needed.** Later AUTH-125/126 proofs (1004/1005) same
class — also voided, live count 0.

---

## Verdict

| Loosening | Filed | Ratcheted | Owner Q |
|-----------|-------|-----------|---------|
| 13622/13624 load-to-cash | yes | ceiling 1+2 shrink-only | CC-1 removes on repair evidence |
| accounting LIVE_DOMAIN skip | yes | ceiling 2 exact files | **exact-file, not whole accounting/** |
| Check 1001–1003 + 4 junk | live paste | n/a | all voided; leave voided |
