# ROUND 377 — ALL SEATS — THE 1090 FUEL CREDIT IS FOUND IN CODE, AND THE LEDGER HAS TEN DIRECT WRITERS
Lead · 2026-10-03 · read in the source, line numbers below. No grep heuristics this time — I opened the files.

---

## 377.1 — ROOT CAUSE, IN CODE: COMPANY-DIRECT FUEL CREDITS **UNDEPOSITED FUNDS** (CC-2)

`apps/backend/src/accounting/fuel-posting/poster.service.ts`, inside
`resolveCompanyDirectCreditAccount(...)`:

```ts
// line 188
const undeposited = await resolveRoleAccountOptional(client, operatingCompanyId, "undeposited_funds");
if (undeposited) return { account_id: undeposited, source: "role_designation:undeposited_funds" };

// line 191 — and the fallback lists UndepositedFunds FIRST among the "cash like" subtypes
WHERE account_subtype IN ('UndepositedFunds', 'Checking', 'Savings', 'CashOnHand')
```

**When fuel is bought company-direct and paid in cash, the credit leg resolves to Undeposited Funds.** Twice —
once by role, and again in the subtype fallback, which puts `UndepositedFunds` ahead of `Checking`.

**That is the 255 fuel_event postings crediting 1090 for 108,602.28.** ROUND 375 measured the effect; this is
the line that causes it.

**Why it is wrong, and it is not a close call.** Undeposited Funds is **one thing**: money a customer has paid
us that has not yet reached the bank. It is a holding pen on the way IN. Nothing on the way **out** belongs
there. Buying diesel does not involve a customer receipt, so the account can only ever be credited here by
mistake — and a credit to an asset that was never debited is how it reached a negative balance of
**151,736.34**.

**The correct credit for a company-direct cash fuel purchase is the account the money actually left**: the
bank account (role `operating_bank`), or the fuel card's own account where the card is a liability or a
prepaid wallet. **Pick the role the money really moved through. Never a holding account, and never a
"cash like" guess ordered by `updated_at DESC`** — that last one is its own defect: which account a posting
lands in currently depends on **which row was touched most recently**, which is not a mapping, it is a
coincidence.

**Permanent fix, not a patch (owner, 2026-10-03: "no patches, only full permanent fixes"):**

1. Company-direct cash fuel resolves the **bank or card role** for its credit. No Undeposited Funds, ever.
2. **Delete the `cash_like` fallback.** A poster that cannot resolve its role **fails closed** — that is
   365.1, the role is the contract. An unresolvable role is a configuration error to be reported, not a
   nearest-neighbour guess.
3. **A refusal in the database:** no posting may credit `undeposited_funds` from any source other than a
   customer payment, and no posting may debit it from anything other than a deposit. Undeposited Funds has
   exactly two legitimate counterparties and the ledger should enforce it.
4. Then the 255 are reversed and voided through the engine — never adjusted by a second journal entry. **The
   160 `journal_entry` debits of 92,242.18 that nearly offset them are almost certainly someone having done
   exactly that.** Confirm, and reverse them together with their cause.

**Required value:** 0 postings on 1090 whose source is anything but `customer_payment` (debit) or `deposit`
(credit); the refusal proven by attempting one and being refused.

**Guard:** `verify-undeposited-funds-has-only-two-counterparties.mjs`.

## 377.2 — 1295 ALREADY KNEW, AND THE COMMENT IN THE CODE SAYS SO (CC-2)

Same file, line 133:

```ts
// ROUND 352 F-3: the Relay wallet resolves through its declared role (fuel_wallet_relay), never by account
// number — 1295 had no role, which is how it drifted to -$33,839.80 unseen.
```

**The resolution was fixed. The drift was not.** ROUND 375 measured 1295 still at exactly **-33,839.80**, from
**one source type only**: 128 expense postings drawing it down and **nothing funding it**.

So the role binding is now right and the **funding path still does not exist**. Build it: **debit 1295, credit
the bank account the wire left from**, the mirror of the draw. Then reconcile against **Relay's own wallet
balance** from their statement — their number, labelled as theirs — and **name any difference rather than
plug it**.

---

## 377.3 — THE ARCHITECTURAL FINDING: **TEN** SERVICES INSERT INTO THE LEDGER DIRECTLY

Every file containing a real `INSERT INTO accounting.journal_entry_postings`, tests excluded:

```
accounting/posting-engine.service.ts                    ← the sanctioned engine
accounting/journal-entries.service.ts
accounting/void.service.ts
accounting/bank-recon/match.service.ts                  ← a match must post NOTHING (LAW 363.6)
accounting/fuel-posting/poster.service.ts               ← 377.1
accounting/settlement-posting/settlement-posting.service.ts
accounting/amortization-posting/amortization-posting.service.ts
accounting/lease-asc842/lease-posting.service.ts
accounting/period-close-retained-earnings.service.ts
accounting/recurring.worker.ts
```

**Ten doors into one ledger.** Meanwhile 87 files call the posting engine properly.

**This is the single root cause behind nearly every defect found today.** Ten writers means ten places to
forget the spine link (3,908 missing), ten places to resolve the wrong role (1090, 1295), ten places to miss
`load_id`, ten places where a posting can land after its transaction commits, ten places a refusal has to be
re-proven. Fixing writers one at a time is the patch pattern; **collapsing the doors is the permanent fix.**

**The standard, and QBO/NetSuite both work this way:** one posting engine. Every document type hands it a
balanced set of legs and its source document. The engine resolves roles, writes the postings, writes the
spine link, stamps `load_id`, and commits in the caller's transaction. **Nothing else touches
`journal_entry_postings`.**

Not in one PR, and not before the purge — but it is the destination, and no new door opens from today:

- **`bank-recon/match.service.ts` loses its INSERT entirely** — a match links and posts nothing (368.2(a),
  369.4). That is one door closed with no replacement needed.
- **`fuel-posting`, `settlement-posting`, `amortization-posting`, `lease-posting`, `recurring.worker`,
  `period-close`** each route through the engine, one at a time, each with its own PR and guard, each proving
  the postings it produces are identical before and after.
- **`void.service.ts` and `journal-entries.service.ts`** are the engine's own neighbourhood and stay, but
  they share one insert path with it.
- **A guard freezes the list today:** no file outside the sanctioned set may contain an INSERT into
  `accounting.journal_entry_postings`, and **the list is shrink-only**, exactly like the static baseline.
  **CC-1 owns that guard and it lands this week.** It costs nothing and it stops door eleven.

**Guard:** `verify-only-the-posting-engine-writes-postings.mjs` — static, allowlist shrink-only, every entry
reasoned.

---

## 377.4 — WHAT THIS CHANGES ABOUT THE PURGE

Nothing is deleted while a writer that produced the defect is still live. The purge removes the rows; these
writers would recreate them within hours of the re-upload. **In order: the fuel credit role (377.1), the
Undeposited Funds refusal, the match INSERT removed, the wallet funding path (377.2), the writer allowlist
guard (377.3) — then the purge.**

**No patches. Only permanent fixes.** A reversal that cleans a balance while the writer survives is not a fix,
and we have the 160 offsetting journal entries on 1090 as today's example of what that looks like a month
later.
