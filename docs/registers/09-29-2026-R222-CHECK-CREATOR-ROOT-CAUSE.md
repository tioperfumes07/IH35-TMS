# ROUND 222 — CHECK CREATOR ROOT CAUSE (Cursor, before code)

Measured 2026-09-29 ~02:15Z · Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a` ·
USMCA `5c854333-6ea5-4faa-af31-67cb272fef80` · `SET LOCAL ROLE neondb_owner` +
`app.bypass_rls='lucia'`. Credentials: Desktop master-keys §1 pooled string.

Owner / Lead live paste said:

| Measure | Lead | Cursor re-measure |
|---|---|---|
| `banking.check_number_registry` | 3 | **3** |
| `accounting.expenses` `payment_type='check'` | 0 | **4** (all `status='void'`) |
| live (non-void) checks | 0 / 0 / 0 | **0** |

## 1. ROOT CAUSE — mechanism (not a half-written allocator)

**The three registry numbers are NOT orphan allocations.** Each row has
`source_kind='check'` and a `source_id` that joins to a real `accounting.expenses`
row with `payment_type='check'`. Those expenses exist; they are **voided seat-test
fixtures**, void-not-delete, so the register correctly still shows the numbers.

### createCheck allocation order (`check-create.service.ts`)

When `print_later=false` and an explicit `check_number` is supplied:

1. `INSERT banking.check_number_registry` (status=`issued`, **source_id NULL**)
2. `INSERT accounting.expenses` (`payment_type='check'`, `check_number` set)
3. `UPDATE registry SET source_id = expense.id`
4. expense lines + optional GL post via `postSourceTransactionInClientTx`

All of that runs inside **one** `withLuciaBypass` client transaction. A failure after
the registry INSERT rolls the whole transaction back — the number is **not** burned
without a document on that path.

When `print_later=true`:

1. Expense is created first with `check_number=NULL`, `print_status='need_to_print'`
2. Number is claimed only in `assignPrintBatch` — registry INSERT already carries
   `source_id = expense.id` in the same statement, then expense is UPDATEd with the
   number + `print_complete`. Also one transaction.

**Conclusion:** The Lead’s “allocation succeeds, creation does not complete” reading
is explained by measuring **live** check expenses (=0 after seat voids) while the
registry still shows the **voided** numbers (QBO parity: void burns the number, row
stays). It is not a missing rollback on the create path.

### Why Lead saw `payment_type='check' = 0`

Likely filtered to non-void / open register, or counted only rows with live
`posting_status='posted'`. Unfiltered (bypass_rls): **4** check expenses, all void.
Smithfield `f9c5b0e4…` still has `payment_type='check'` — it did not lose the type;
it was voided (AUTH-124) so it drops out of any live-check filter.

## 2. THE THREE ALLOCATED NUMBERS — named

| # | Registry status | Expense id | Purpose | Meant to exist? | Outcome |
|---|---|---|---|---|---|
| **1001** | voided | `9b5fcc6c-6d8c-4e14-83ab-49c79c9132e9` | AUTH-117 R-191 G-16 Check Creator live proof ($1.00 AMPARTS) | Yes — seat TEST, void same session | Expense void + registry voided; JE reversed `267a4a86…` |
| **1002** | voided | `a7671a67-6b8a-4282-901a-2fd6dd7991ca` | AUTH-120 R-197 G-16 allocator registry proof ($1.00) | Yes — seat TEST, void same session | Expense void + registry voided; JE reversed `0a7cc79a…` |
| **1003** | voided | `7728cf89-6ca2-4819-b610-7a013e4dbd61` | AUTH-122 R-206 print-path proof ($1.00, print_complete) | Yes — seat TEST, void same session | Expense void + registry voided; JE `0afd6588…` / rev `496afcc3…`; print_batch `43979b9a…` |

Stock `next_check_number` = **1004**. Gapless 1001–1003. No deletes.

**Plain speech for the owner:** these were **Cursor seat test fixtures**, not owner
operating checks. Law required create→prove→void same session. The void register is
intact. Burning three numbers on tests in USMCA was a mistake of process (tests
should not land in USMCA); the void trail is honest.

## 3. THE FOUR JUNK EXPENSES

| id | Amount | Fate |
|---|---|---|
| `9b5fcc6c…` | $1.00 #1001 | Voided AUTH-117 / re-void AUTH-118 walk — `status=void`, `posting_status=reversed` |
| `a7671a67…` | $1.00 #1002 | Voided AUTH-120 — same |
| `7728cf89…` | $1.00 #1003 | Voided AUTH-122 — same; only one with `print_status=print_complete` |
| `f9c5b0e4…` | $25.00 Smithfield | **Voided AUTH-124** (ROUND 213 arm 31) via `voidCheck`. Was draft+posted with **no** check_number (never printed). Still `payment_type='check'`. Reversing JE `1e0980d4…`. No registry row (never allocated a number). |

All four are **seat / purge-era test records**. Said plainly.

## 4. WHAT IS STILL UNFINISHED (product)

Code path creator→registry→expense→GL→print **exists** and already walked once for
#1003. What the owner still cannot see:

1. **Zero live checks** — every proof was voided; the Check list looks empty for
   operating use.
2. **No permanent integrity guard** asserting every registry `source_kind='check'`
   row joins an expense (live or void) — so a future orphan would look like today’s
   misread.
3. ROUND 222 authorizes **one** chain write under the freeze exception to prove
   live hops again (create→registry→expense→JE→print), then void same session
   unless the owner keeps it.

Next in this seat: AUTH-125 + integrity guard + live chain proof with BEFORE/AFTER
paste. Factoring stays stopped. No freeze-table writes outside this chain.
