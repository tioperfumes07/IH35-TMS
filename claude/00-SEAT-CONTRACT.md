# 00-SEAT-CONTRACT — THE STANDING RULES FOR EVERY SEAT
# Claude Lead · 09-29-2026 · READ ONCE, OBEY ALWAYS
# Every round from here forward says only "Obey 00-SEAT-CONTRACT." It does not repeat these rules.
# If a round contradicts this file, the round wins for that one item and says so explicitly.

## 0. HOW YOU START EVERY TURN
`git pull --no-rebase origin main` → `ls claude/` → read today's files carrying your seat name → execute.
"CHECK YOUR ORDERS" from the owner means exactly that sequence. Never ask to have a file pasted.

## 1. THE OWNER'S LAW
1. Do what he says, the first time. Create it, live — not a plan, not a doc about it.
2. Question once, in one short paragraph. Then execute. Never raise it again.
3. You are not his attorney, CPA or compliance officer. No lectures about liability, auditors or courts.
4. Never invent a rule and cite it back to him. If you cannot quote him, it does not exist.
5. No deferring, no patching. A blocker gets fixed in the same session.
6. Live means live. If he cannot open it in Chrome and click it, it is not done.
7. Never report done without proof — the live row, the live screen, the live query, pasted.
8. Empty is a question, not an answer. Check the entity, the filter, the RLS bypass, the join, the spelling.
9. If you are guessing, stop and read the source. Signed PDF, live table, bank statement. Never memory.
10. Facts: the source wins, correct him immediately. Decisions: he wins, without argument.

**Reply format — this and nothing else: what I did · the proof it's real · what's next.**
No narrative. No status essays. Five lines beats fifty. Tokens are his money.

## 2. QUICKBOOKS TERMINOLOGY — use these words, no others
Expense (money out, paid when recorded) · Bill (creates A/P) · Bill Payment (clears A/P) ·
Invoice (creates A/R) · Receive Payment (clears A/R) · Journal Entry (debit/credit pair) ·
**Matched/Cleared** and **Reconciled** = STATUS ONLY · Void (killed, record kept) · Delete (removed).

## 3. THE POSTING RULE — owner-confirmed law, do not relitigate
A document posts its journal entry **WHEN IT IS RECORDED**, dated the transaction date.
**Matched/Cleared and Reconciled create NO journal entry.**
Owner: *"if you write a check on Dec 31 but is deposited on January 03, the accountant reports it as a December payment."*

**Corollary (ruling 09-29-2026):** an expense on an open load posts on its transaction date. No guard may
block a post because a tour is open. Cost attribution to a load is a reporting join, never a posting delay.
What is worth guarding is that the posted expense **is linked to its load**.

## 4. THE VOID ENGINE STANDARD — researched, closed, already correct
NetSuite model: original untouched at full amount and flagged Voided; a **separate reversing journal entry
dated the void date**, linked both ways (Void Of / Voided On); no GL-impacting change to the original after
the fact — not the amount, not the period.

**Every voidable entity must have a case in `executeVoidCancel`.** A void done by raw UPDATE that sets
`voided_at` without flipping `status` and without writing the reversal is a hole in the engine, not a data
defect. The flag, the status and the reversal are written together in one transaction, or none are.

## 5. THE THREE MILEAGE NUMBERS — never conflate
**PRACTICAL** = billed to the customer · **SHORT** = what the driver is paid on · **DRIVEN** = what burned
diesel, from the odometer.

## 6. STATISTICAL ACCOUNTS — never in the financials
9100 Fuel Consumed · 9110 Fuel Inventory On Hand · 9200 Downtime Cost · 9210 Lost Revenue.
All carry `posts_to_financials = false`. Excluded from P&L, Balance Sheet, cash flow and the QBO export.
Management information only. The economic margin is never posted.

## 7. PRODUCTION
Neon project `tiny-field-89581227`, branch `br-fancy-credit-akjnd07a`.
Reads need **both** lines: `SET LOCAL ROLE neondb_owner;` then `SET LOCAL app.bypass_rls = 'lucia';`
RLS guard work runs on the **pooled** endpoint only, where `current_user` resolves to `ih35_app`.
The direct endpoint has BYPASSRLS and will lie to you.

**USMCA only** — `5c854333-6ea5-4faa-af31-67cb272fef80`. TRANSPORTATION and TRUCKING are frozen: do not
read, write or report on them.

**Every USMCA record is REAL unless `is_sample_data = true`.** Never write a test, sample or demo record
into USMCA — including to prove something works. Render proofs from real records.

## 8. CANONICAL TABLES — write left, never write right. Repoint the writer; never drag the FK.
| WRITE | NEVER WRITE |
|---|---|
| `driver_finance.*` | `payroll.*`, `settlement.*` |
| `mdata.qbo_*` | `accounting.qbo_*` |
| `banking.*` | `bank.*` |
| `maintenance.*` | `maint.*` |
| `mdata.vendors` | `mdata.qbo_vendors` |
| `catalogs.load_cancellation_reasons` | `catalogs.cancellation_reasons` |
| `mdata.loads` — canonical hub | |

Hubs every record links back to: `org.companies`, `identity.users`, `mdata.drivers`, `mdata.units`,
`mdata.loads`, `catalogs.accounts`, `mdata.customers`, `maintenance.work_orders`, `mdata.vendors`,
`accounting.journal_entries`, `docs.files`, `mdata.equipment`.
**A block with no linkage declaration is not done.**

## 9. GUARDS AND RATCHETS
Shrink-only. `REQUIRES_LIVE_DB` — cannot connect = FAIL, never pass.
**No blocking guard may derive its verdict from wall-clock time.**
A guard that contradicts Section 3 or 4 is wrong and gets rewritten, never bypassed.
State the number a new ratchet starts at. It may only go down.

## 10. NOTHING STAYS ON YOUR MACHINE
If it is complete: push, merge, **trigger the deploy yourself** (auto-deploy is OFF), paste the deploy id.
If it is blocked, say which guard, which number, and who owns the fix — then keep working on something else.

## 11. YOU DO NOT PAUSE FOR BLOCKERS
You have the same production access, the same repo and the same documents everyone else has. Find the
answer. Fix the blocker. Only a decision that is genuinely the owner's goes to him, in one batch, while you
keep working on everything else.

## 12. DESTRUCTIVE WORK
No hard delete, purge or data wipe happens on a relayed instruction alone. It requires an `AUTH-<NNN>`
committed to `docs/bus/OWNER-AUTHORIZATIONS.md` on main. Archive-first, always: every deleted row and every
deleted child row lands in an `archive.*` table with the full payload, timestamp, round and reason.
Nobody deletes a record nobody has verified.

## 13. NO FABRICATED NUMBERS
Every figure you state comes from a live query you paste. A number you cannot source does not go on the
page, in the report, or in your reply. Leave it out and say why.
