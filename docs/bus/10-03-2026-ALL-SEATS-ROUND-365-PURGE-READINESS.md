# ROUND 365 — ALL SEATS — PURGE READINESS: PROVE EVERYTHING POSTS WHERE IT SHOULD, BEFORE THE DELETE
Lead · 2026-10-03 · **this round outranks ROUND 364. Nothing in 364 ships before 365.1 through 365.7 are green.**

The owner purges every settlement-created transaction and load, then re-uploads **exactly the same data**
through the settlement wizard creator within hours. Everything below exists so that the re-upload lands
correctly and the defects we just closed cannot reopen on the way back in.

Read `10-03-2026-ALL-SEATS-ROUND-363-LAW-THE-RECLASSIFY-ENGINE-AND-THE-POSTING-STAMP.md` first. The nine laws
there are the contract. This round is the proof.

---

## 365.1 — THE ROLE IS THE CONTRACT. NO POSTER RESOLVES AN ACCOUNT BY NAME OR BY NUMBER. (CC-1)

`00-THE-POSTING-MAP-EVERY-TRANSACTION-EVERY-ACCOUNT.md` holds the live role -> account map for USMCA, read
from `accounting.chart_of_accounts_roles` joined to `catalogs.accounts`. It is the contract.

Prove, live, on USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`:

- **Every role in that map resolves to exactly one active account.** Required value: **0 unbound roles** and
  **0 roles bound to two or more accounts.** Paste the count of roles checked and the two zeros.
- **Every poster resolves by role.** Static sweep: zero occurrences of an account **number** or an account
  **name** literal in any posting path. A hard-coded `6300` or `"Bank Service Charges"` in a poster is the
  defect — it survives a chart-of-accounts change and silently posts to the wrong place.
- Any role the map names that no poster uses, and any poster that posts to an account no role names, is
  reported by name. Both are holes.

**Guard:** `verify-every-poster-resolves-by-role-not-by-name-or-number.mjs` — static plus live.

## 365.2 — EVERY DOCUMENT TYPE POSTS ITS DECLARED PAIR, PROVEN ON A REAL ROW (CC-1, CC-2 split by lane)

For every QBO document type we create — invoice, sales receipt, receive payment, credit memo, refund receipt,
bill, bill payment, check, expense, purchase order, vendor credit, journal entry, transfer, deposit — the
declared debit role and credit role are named, and a **live USMCA row** is pasted proving it posts that pair.

- A document type with no live row to prove it is reported as **unproven**, by name. Unproven is an honest
  state. "Assumed correct" is not.
- Payments post **on create**, never at the match (LAW 363.6).
- A one-leg entry is already refused by migration `202615330600`. Confirm it is live and that nothing
  bypasses it.
- **Required value:** the count of document types, the count proven live, the count unproven, and the
  unproven ones named.

**Guard:** `verify-every-document-type-posts-its-declared-pair.mjs`.

## 365.3 — THE WRONG-SIGN FAMILY IS CLOSED BEFORE THE PURGE, NOT AFTER (CC-1)

Bounded at exactly five accounts, measured earlier this session:

| Family | Accounts |
|---|---|
| F-1 | the three escrow sub-accounts |
| F-2 | Undeposited Funds (1090) |
| F-3 | 1295 |

A sign that is wrong today reproduces the moment the same data is re-entered. Close all five, prove each with
the live balance and its natural sign, and name the writer that produced each one. **A fix with no named
writer is not a fix** — it is a correction waiting to be re-made by the same code.

## 365.4 — THE PURGE ITSELF: NULL-COMPANY ROWS ARE NOT OPTIONAL (CC-1, ROUND 359 — still open)

`scripts/ops/2026-10-02-cc1-r326-complete-delete.ts` filters **every** plan query and **every** proof query
with `WHERE operating_company_id = $1`. Rows with a NULL company are invisible to both the plan and the
proof, so the script reports a clean delete while leaving rows behind.

Measured by CC-3 on the direct endpoint: `load_charge_lines` holds **284** rows of which **136 have no
company**; `load_id_reservations` holds **4,057**. Both read **0** through the pooler. **A `0` from a pooled
connection is MASKED, not empty.**

- The plan and the proof both account for NULL-company rows — either by including them in scope with the
  owner's word, or by naming them as deliberately out of scope with their count. **Silence is not an option.**
- Every row is written to `audit.record_deletions` before it is deleted, and the proof runs in the **same
  transaction** as the delete. That part is already correct; do not change it.
- `verify-ops-scripts-assert-not-production` is one of the 23 newly-executing guards (CC-3, 363-CC3-D). It
  matters most here: **an ops script that cannot tell it is pointed at production is how a purge runs in the
  wrong place.** It is green before the purge runs.
- The protected schemas stay protected: `identity, org, catalogs, preserve, audit, _system, lib, mdata,
  banking`, and the master tables. `mdata.loads` and `load_stops` stay exempted so loads delete.
- **Policies, rules, triggers, refusals and documents stay. Only running totals die.** The owner's words:
  "LETS STOP THE SECOND THING FROM EXISTING. YES POLICIES RULES ETC NOT DELETE."

## 365.5 — THE PRE-PURGE BASELINE IS THE PROOF THAT THE RE-UPLOAD LANDED (LEAD owns, every seat feeds it)

The owner is re-uploading **exactly the same data**. That makes the book itself the test.

- **Immediately before the purge**, re-measure and store: the trial balance both sides and the difference, the
  posting count, and the per-account balance for every account in `catalogs.accounts` — zeros included.
  Last measured this session: **2,178,029.25 / 2,178,029.25 / .00 / 7,909 postings**, unchanged across every
  chart-of-accounts move. Re-measure at the moment of the claim; a number from an hour ago is not a baseline.
- **After the re-upload**, the same documents must reproduce the same totals. Where they do not, the
  difference is named per account with its cause — not explained away, not plugged. **No plugs. Ever.**
- This is the control a CPA would ask for and it costs one query on each side.

## 365.6 — MAIN IS RED ON 31 LIVE GUARDS RIGHT NOW. THAT IS THE PURGE BLOCKER. (ALL SEATS)

Measured 2026-10-03 from `branch:precheck-push` against current main, after the gate finally got its own
credential (LAW 363.7). These fail on **main**, not on a branch:

`verify-6300-no-churn` · `verify-account-register-ref-no-journal-entry-link` ·
**`verify-applied-migrations-immutable`** · `verify-bank-feed-mark-transfer-writes-transfers` ·
`verify-bank-match-no-double-match-all-six-kinds` · `verify-bank-recon-accept-invoice-backlink` ·
`verify-bank-recon-accept-match-row-locked` ·
`verify-banking-driver-escrow-uses-accounting-escrow-source` ·
`verify-banking-factoring-f9515-9518-no-silent-catch` · `verify-banking-match-qbo-engine` ·
`verify-banking-toolbar-single` · `verify-bill-void-cascades-source-bank-txn` ·
`verify-caller-scoped-guc-membership` · `verify-canonical-repoint-not-ahead-of-schema` ·
`verify-cash-advance-disbursement-method-parity` · `verify-codex-vertical-nonmoney-zero-remainder` ·
`verify-company-settlement-pdf-house-template` · `verify-data-repair-migrations-noop-when-absent` ·
`verify-delivery-evidence-latch-wired` ·
`verify-dispatch-load-detail-deactivated-customer-left-join` · `verify-dispatch-reads-live-loads-view` ·
`verify-job-cadences-derived-from-cron` · `verify-liability-breakdown-modal-uses-paritytable` ·
`verify-load-status-single-state-machine` · **`verify-migration-checksum-collision`** ·
`verify-no-swallowed-db-error-in-transaction` · `verify-one-canonical-active-load-set` ·
`verify-record-transfer-mark-transfer-wired` · `verify-three-dates-cleared-date` ·
`verify-undo-categorization-reverses-je` · `verify-unmatch-clears-both-sides`

Read that list against this round. Eleven of them are the exact behaviours the purge and the re-upload depend
on: the bank match and unmatch pair, undo reversing its journal entry, bill void cascading to its source bank
transaction, one canonical active load set, the load status state machine, the cleared date, and no swallowed
database error inside a transaction.

**Two of them are the migration-checksum finding, independently.** `verify-applied-migrations-immutable` and
`verify-migration-checksum-collision` both fail, and I refused to commit a `.ledger.json` cache showing
changed checksums for already-applied `0050_two_section_v5_and_safety_restructure.sql` and
`0062_p3_t11_21_0_catalog_seed_data.sql`. That is two independent signals on the same defect. **CC-1 measures
it against `_system._schema_migrations` on production and reports the verdict before anything is deleted.** If
an applied migration file was edited after it applied, we do not know what production's schema actually is,
and nothing else in this round can be trusted until we do.

Lane split: each seat takes the guards in its own lane, names the cause and the writer, and does not raise a
threshold or widen a baseline to clear one. `docs/audit/VERIFY-STATIC-BASELINE.json` is **shrink-only** and no
entry is added without a Lead ruling.

## 365.7 — THE REFUSALS THAT MUST BE LIVE BEFORE THE DELETE (CC-1 confirms each, live)

Confirmed live earlier this session; re-confirm at the moment of the claim, not from this list:

| Migration | What it refuses |
|---|---|
| `202615330600` | a one-leg entry — asset accounts never credit alone |
| `202615330906` | a live posting with no spine link (`accounting.transaction_source_links`) |
| `202615340100` | escrow over-release |
| `202615330700` | fuel gallons above the per-unit cap |
| `202615330400` / `202615330800` | `tenant_id` dropped |
| `202615330905` | a load cancellation with no record |

Plus the three from ROUND 363 that must land before the purge:

- `load_id` on every load-born posting, refused when the source document has a load and the stamp is NULL
  (363-CC1-A).
- A bill payment that commits without its postings is refused (363-CC1-B).
- A send-back keeps the accepted match and records the release beside it, never overwriting `matched_load_id`
  to NULL (363-CC3-B).

The spine guard `trg_live_posting_keeps_spine_link` is a CONSTRAINT TRIGGER, **DEFERRABLE INITIALLY
DEFERRED** — it fires at COMMIT. It does **not** block the purge: it raises only when the posting still
exists and has no remaining link. Confirmed and already ruled; do not re-litigate it.

---

## THE ORDER OF OPERATIONS, AND IT IS NOT NEGOTIABLE

**REVERSE the GL -> VOID the document -> PURGE the row.** Never hand-write a void or a purge.

## STANDING, EVERY ROUND

- USMCA only. TRANSPORTATION and TRUCKING frozen — Transportation ceased operating in August as USMCA began.
- **NOBODY SEEDS ANY DATA ANYWHERE.** Not for proof, not for a test, in any entity. Every USMCA record is REAL
  unless `is_sample_data = true`. CC-1 already found one test load in real data — `E2E-2E-95603e75`, created
  in USMCA on 09-30. That is the thing we never do again.
- Read the **DIRECT** endpoint. `SET LOCAL app.bypass_rls = 'lucia'`. A `0` from the pooler is masked.
- AUTH-NNN is **owner-only**. `_system.purge_authorized_rows` carries `REVOKE ALL ... FROM ih35_app` by design.
- No fake green. The live row, the live screen, the live query — pasted.
- **Linkage declaration required in every PR.** A block with no linkage declaration is not done.
