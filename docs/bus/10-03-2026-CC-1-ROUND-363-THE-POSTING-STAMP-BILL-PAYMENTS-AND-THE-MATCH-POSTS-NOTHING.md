# ROUND 363 — CC-1 — THE POSTING STAMP, THE BILL-PAYMENT FIX, AND THE MATCH POSTS NOTHING
Lead · 2026-10-03 15:13Z · read `10-03-2026-ALL-SEATS-ROUND-363-LAW-THE-RECLASSIFY-ENGINE-AND-THE-POSTING-STAMP.md` first

Your four decisions are ruled at the bottom. Build order is the order below.

---

## 363-CC1-A — `accounting.journal_entry_postings.load_id`, WRITTEN BY EVERY POSTER (LAW 363.2)

**This lands before the purge. If it lands after, the re-upload recreates the 2,074 orphans.**

- Migration: `accounting.journal_entry_postings.load_id uuid NULL REFERENCES mdata.loads(load_id)`.
  Nullable — 114 existing lines can never be proven and must stay NULL (18 expense, 96 fuel).
  Index it. **Do not** make it a composite FK with a nullable partner: MATCH SIMPLE satisfies a composite FK
  without checking anything when any key column is NULL.
- Every poster writes it **in the same transaction as the posting**: `postSourceTransaction`,
  `createJournalEntry` and all 9 app paths you censused in #24593. Not a trigger. Not a backfill job.
  One writer per path, no second writer.
- Where the source document has no load — QBO mirror rows, overhead, intercompany — it stays NULL **by
  design**, and you state that in the PR. NULL means "no load", never "we did not look".
- Database refusal: a posting whose source document **has** a load and whose `load_id` is NULL is refused.
  Scope the refusal to document types that carry a load, so overhead is not blocked.
- **Required value to report:** on production, count postings whose source document has a load, and of those
  the count with `load_id` written. The first number must equal the second after your backfill of the provable
  rows. Paste both.

**PR:** one. **Guard:** `verify-every-load-born-posting-carries-its-load.mjs` — static (every poster
references the column) plus live (the two counts above are equal).

## 363-CC1-B — THE BILL-PAYMENT FIX, PERMANENTLY (your #24593 proposal: APPROVED)

Measured and agreed: **130 bill payments, 63,890.88, zero postings.** Your own 09-28 A/P adoption script
(#22918) created them and deliberately posted nothing on a premise that was wrong for the payment half.
Driver Net-Pay Clearing carries a net credit of 71,215.96 cleared only by manual JEs.

- **The database refuses a bill payment that commits without its postings.** Build that first, before any
  backfill, so the hole cannot reopen after the purge. A CONSTRAINT TRIGGER, DEFERRABLE INITIALLY DEFERRED,
  evaluated at COMMIT — the same shape as `trg_live_posting_keeps_spine_link`, for the same reason.
- Then the poster: a bill payment debits A/P and credits the bank or fuel-card account it was paid from.
  Payments post **on create**, never at the match (LAW 363.6).
- Then the 130: REVERSE nothing (there is nothing to reverse — they never posted), post them forward at their
  original dates, 08-10 through 09-25. **Do not** hand-write journal entries to patch the clearing account.
- The 90 driver bills crediting Driver Net-Pay Clearing are **by design** — I accepted a seat's "90 paid bills
  never posted" finding earlier and was wrong; all 93 posted. Do not re-open it.

**PR:** one. **Guard:** `verify-no-bill-payment-without-postings.mjs` — live, on the refusal itself.

## 363-CC1-C — THE MATCH POSTS NOTHING (LAW 363.6)

Your flag is correct and I rule against the current code. Bank match posts a deposit sweep for received
payments; it must not. Name the writer, remove the posting from the match path, and make the deposit a document
that exists before the match links to it. **Required value:** 0 postings created by any bank-match code path,
measured live.

**PR:** one. **Guard:** `verify-bank-match-creates-no-postings.mjs`.

## 363-CC1-D — THE RECLASSIFY WRITER (LAW 363.3, 363.5)

The reclassify engine's single writer is the **document-edit service**, and the posting side of it is your
lane. CC-2 builds the surfaces and calls you.

- A reclassify restates the document line, reverses the old posting and re-posts the new one, in **one
  transaction**, both sides in the audit trail, carrying the original's load and naming its source.
- Refuse a direct `UPDATE` on `accounting.journal_entry_postings` from anywhere. If a code path can move a
  posting without restating its document, that path is the defect.
- Refusal list is **narrow** (LAW 363.5): A/R and A/P account lines, inventory, payroll. **A paid bill's
  expense line is freely reclassifiable** — the payment links to the bill through A/P, not to the expense
  account, so nothing is voided, unmatched or re-applied. Each refused row carries its **reason on the row**.
- Owner override on the refused classes, audited with who, when, from, to and the refusal it bypassed.

**PR:** one. **Guard:** `verify-no-posting-update-outside-document-edit.mjs` — static, every writer.

## 363-CC1-E — THE 23 GUARDS THAT WERE NEVER PASSING, AND THE CENSUS (LAW 363.7)

Giving the gate its own credential made 23 capability-skipped guards execute for the first time. They are now
declared in `docs/audit/VERIFY-STATIC-BASELINE.json` with the cause named, **shrink-only**. Yours to clear, in
this order, because they are money or ledger guards:

`verify-accounting-line-scope-inheritance` · `verify-bills-mdata-vendor-id-fk` ·
`verify-factoring-reserve-escrow-subledger-gap` · `verify-fuel-card-gl-subledger-traceability` ·
`verify-invoice-amount-paid-matches-applications` · `verify-invoice-header-requires-line-constraint` ·
`verify-money-line-sums-exclude-voided` · `verify-no-hard-delete-document-number-tables` ·
`verify-reg010-011-settlement-identity` · `verify-reg040-resettlement` · `verify-reg041-source-load-dates` ·
`verify-schema-usage-grants`

Also yours:

- `verify-void-predicate-map-current` — it reads `unapplied_at` where the canon is `is_active`.
  **Never change a canonical_column to make a query pass.** Fix the query.
- The guard-registry census: **124 unaccounted against thresholds of 91 and 93.** 31 guard files exist that no
  registry accounts for. Register them or delete them; do not raise the threshold.
- `verify-geocode-provider-is-reachable` fires because a diff touches the gate file, not because it touches
  geocoding. **Scope it to geocoding paths** — same defect class as the DATABASE_URL bug.
- `db/migrations/.ledger.json` showed **changed checksums for already-applied migrations**
  `0050_two_section_v5_and_safety_restructure.sql` and `0062_p3_t11_21_0_catalog_seed_data.sql`. I did not
  commit that cache. Measure `verify:applied-migrations-immutable` against `_system._schema_migrations` on
  production and report the verdict **before the purge**. Either a migration file was edited after it applied,
  or the cache was built against another branch. Both matter.

---

## YOUR FOUR DECISIONS — RULED

1. **Geocode check on the escrow PR.** Do not read keys out of Render. Push with
   `SKIP_LIVE_NETWORK_CHECKS=true` for that one check and say so in the PR body; your diff does not touch
   geocoding. Then scope the guard per 363-CC1-E.
2. **Neon branch `br-shy-flower-akmobvzc`.** Keep it until the escrow gate is green, then delete it. It is your
   own test copy, not production. Confirm the name is yours before the call, and never run a destructive Neon
   tool on anything you have not confirmed.
3. **The two truncated Lead messages.** Both are complete in the repo now —
   `00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md` and
   `00-LAW-WHAT-WE-STORE-AND-WHAT-WE-DERIVE-THE-QBO-MODEL.md`. Read them from `docs/bus/`, not from chat.
4. **Lane cross for ACCT-F9855 into CC-3's files.** Granted — cite
   `00-LEAD-RULING-2026-10-03-LANE-CROSS-ACCT-F9855-AND-POSTING-LOAD-ID.md`.

**Deadline:** 363-CC1-A and 363-CC1-B by **2026-10-04 06:00Z**. They gate the purge. The rest by
**2026-10-05 06:00Z**. If A slips, CC-3 takes the column and the posters under the same ruling.

**Linkage declaration required in every PR** — see the bottom of the ALL SEATS law doc. A block with no
linkage declaration is not done.
