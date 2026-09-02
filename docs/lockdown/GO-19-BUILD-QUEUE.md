# What Is Left, And The Order To Build It

Checked September 2, 2026 against commit fcc5d40d6 and the live USMCA books. Every fact below was verified against the production database and the main branch before it was written.

## The rule: every fix goes all the way down and all the way up

A vertical slice carries its own table change, backend rule, endpoint, screen, guard and proof. It is finished when somebody can click it in a browser and see the right thing happen. Nothing here is a layer waiting for another layer. Horizontal work produces six things each ninety percent done and zero things that work.

| Layer | What it means |
|---|---|
| Data | the table, the column, the constraint |
| Backend | the rule that decides |
| Interface | the endpoint that carries it |
| Screen | what the operator sees and does |
| Guard | the thing that stops it regressing |
| Proof | a screenshot of it working, not an assertion |

The order is not a preference. Slices 01 and 03 are first because every number is cut from the load number, and after the first real load those numbers are on live money. Slice 02 is first because thirty-four fake bank rows sit in the feed the owner is about to match against.

## The queue

### 01. The load number becomes a plain number

**Seat:** CC-2  |  **Depends on:** None. Start here.

**Why it is here.** Every other number in the system is cut from the load number. The proforma, the expenses, the driver bill and the settlement all inherit it. If the first real load is minted as L-20260902-0001 and the format is corrected afterward, every child number is already wrong and has to be re-cut by hand, on live money. This is the only item that gets more expensive by the hour.

**What is true today.** load-id-reservation.service.ts line 77 returns `L-${ymd}-${seq padded to 4}`. The one load in USMCA is L-20260901-0001 and it is cancelled. Owner ruling: a load number is plain, for example 13561.

**The vertical slice**

- **Data** — lib.trace_counters holds the load counter. Set the USMCA seed to the number the owner names. No new table.
- **Backend** — load-id-reservation.service.ts — drop the L- and the date block. Keep the FOR UPDATE lock exactly as it is; it is correct.
- **Interface** — POST /api/v1/loads and the book-load route already accept a typed load_number. No change.
- **Screen** — Book Load — the number box shows the next plain number, stays editable, and blank means the system assigns.
- **Guard** — Reject any minted load number that is not digits. Fail the build if the L- template returns.
- **Proof** — Book one load in a real browser. Screenshot the number box before save and the saved load after.

**Done means:** A load booked through the browser carries a plain number, and a second one increments by one.

---

### 02. Clean slate — the fake bank rows come out before real money goes in

**Seat:** CC-1  |  **Depends on:** None. Runs beside slice 01.

**Why it is here.** The owner is about to enter real expenses, bills and payments and match them in banking. Thirty-four fake rows are sitting in the USMCA bank feed right now. The moment real matching starts, a real charge can be matched to a fixture and the two become impossible to separate without an audit. This has to be finished before the first real transaction, not after.

**What is true today.** 415 bank transactions in USMCA. 381 are the real Plaid feed. 34 are not: 24 with no source, 7 marked manual test, 2 csv import, 1 manual — every one of them carrying test, sample, demo or fixture in its description. banking.bank_transactions still has no is_sample_data column, so nothing can even mark them.

**The vertical slice**

- **Data** — Add is_sample_data boolean not null default false to banking.bank_transactions. Mark the 34. Do not delete: the owner's standing rule is that nothing is ever permanently deleted and every void keeps a register.
- **Backend** — Every banking read filters is_sample_data = false by default, the same way the other money tables already do.
- **Interface** — The bank transaction list endpoints exclude sample rows unless explicitly asked.
- **Screen** — Banking shows 381, not 415. A single owner-only toggle can reveal the quarantined rows.
- **Guard** — No new row may be written with is_sample_data true against USMCA. Fail the build if a seed script targets this company.
- **Proof** — Banking count before and after, side by side, with the 34 listed by description.

**Done means:** Banking shows 381 real transactions, the 34 are marked and hidden, none are deleted, and the register lists all 34.

---

### 03. The child numbers follow the load number

**Seat:** CC-1  |  **Depends on:** Slice 01. The load number has to be right first.

**Why it is here.** The owner's rule is that the first expense on load 12225 is 12225, the second is 12225-1, the third is 12225-2, and the driver bill is 12225. The code does not do either. It has to be fixed before the first load generates its first expense, for the same reason as slice 01: after that, the numbers are on real money.

**What is true today.** expense-number.ts line 47 builds `${loadNumber}-${seq}` with the sequence starting at 1, so the first expense is 12225-1 and no expense is ever numbered 12225. driver-bill-number.ts line 4 returns `B-${suffix}`, which is neither the load number nor anything the owner asked for.

**The vertical slice**

- **Data** — expense_attribution.expense_seq_per_load already exists and already locks correctly. Only the formatting changes.
- **Backend** — expense-number.ts — sequence 1 renders as the bare load number, sequence 2 as -1, sequence 3 as -2. driver-bill-number.ts — return the load number unchanged.
- **Interface** — No route change. The number is produced server side and returned on create.
- **Screen** — The expense creator and the driver bill creator show the number that will be assigned, in an editable box, blank meaning assign for me.
- **Guard** — A test that creates three expenses on one load and asserts 12225, 12225-1, 12225-2 in that order.
- **Proof** — Three expenses created on the first real load, screenshotted.

**Done means:** First expense is the bare load number. Driver bill number equals the load number. The B- prefix is gone from the code.

---

### 04. The proforma is created at pickup, not at booking

**Seat:** CURSOR  |  **Depends on:** Slice 01.

**Why it is here.** The owner stated this rule directly and the code contradicts it. A proforma minted at booking exists for loads that are never picked up, which means the revenue pipeline carries documents for work that never happened. It also means the number is burned before the load is real.

**What is true today.** book-load.service.ts line 1756 carries the comment ND-INV-01, auto-create non-posting proforma invoice at book. There is no pickup trigger anywhere in the codebase. The delivery half is correct and must not be touched.

**The vertical slice**

- **Data** — No new table. mdata.load_stops already records arrival and departure on the pickup stop.
- **Backend** — Remove the mint from book-load.service.ts. Add the mint to the first pickup stop completion, mirroring the existing delivery latch, which is already correct.
- **Interface** — The stop completion endpoint returns the proforma when it creates one.
- **Screen** — The load drawer shows no proforma at booking and shows one the moment the pickup is completed.
- **Guard** — A test that books a load and asserts zero proforma, then completes pickup and asserts exactly one.
- **Proof** — Book, screenshot no proforma. Complete pickup, screenshot the proforma with the load's number.

**Done means:** Booking creates nothing. Pickup creates the proforma with the load number. Delivery still converts it, unchanged.

---

### 05. A bill can name a driver and a trailer

**Seat:** CURSOR  |  **Depends on:** None on code, but it is the gate for slices 06 and 07.

**Why it is here.** This is the owner's road repair scenario and it cannot work today. A repair billed on thirty day terms that must appear on the driver settlement has nowhere to record which driver. The Costs board design shows it; the table cannot hold it.

**What is true today.** accounting.expenses has driver_uuid, trailer_id, recover_from_driver and recover_deduction_type. accounting.bills has none of the four. Verified in production this morning.

**The vertical slice**

- **Data** — Add driver_uuid, trailer_id, recover_from_driver and recover_deduction_type to accounting.bills, referencing the same hub tables the expense already references.
- **Backend** — bills.service.ts create and update accept and persist all four. The chargeback path mirrors the expense chargeback path exactly.
- **Interface** — The bill create and update endpoints accept the four fields.
- **Screen** — The bill creator gains Driver, Trailer and Recover from driver, laid out the same as on the expense creator.
- **Guard** — A bill marked recoverable with no driver is rejected. A driver deduction from a bill is pending until approved, never automatic.
- **Proof** — Create a bill on thirty day terms against a load, mark it recoverable, and show the pending deduction on that driver's settlement preview.

**Done means:** A road repair bill on terms reaches the load margin on the day incurred and the driver settlement as a pending deduction.

---

### 06. A bill line cannot be saved without a load

**Seat:** CC-1  |  **Depends on:** Slice 05, same table family, same migration lane, one author.

**Why it is here.** This is the quietest and most damaging defect on the list. A repair billed on terms can be saved today with no load attached, and nothing stops it. It never reaches the load margin, never reaches the company settlement, never reaches the driver settlement. It becomes an unattributed cost that makes every load look more profitable than it is. That is how a carrier convinces itself a lane makes money when it does not.

**What is true today.** accounting.expense_lines has load_required and load_exemption_reason. accounting.bill_lines has load_id but neither guard. The rule exists on one side of the house and not the other.

**The vertical slice**

- **Data** — Add load_required boolean not null default true and load_exemption_reason text to accounting.bill_lines.
- **Backend** — Enforce in the bill service using the existing expense service rule. Copy it. Do not write a second rule with different words.
- **Interface** — Saving a bill line with no load and no exemption reason returns a clear refusal, not a silent success.
- **Screen** — The bill line requires a load, or an exemption chosen from the same list the expense uses.
- **Guard** — A test proving a bill line with no load and no exemption cannot be saved.
- **Proof** — Attempt to save one without a load and screenshot the refusal.

**Done means:** No bill line reaches the ledger without either a load or a written reason it has none.

---

### 07. The Load Costs board

**Seat:** CODEX  |  **Depends on:** Slices 05 and 06.

**Why it is here.** This is the screen the owner asked for: live loads with their costs underneath and an approximate settlement beside them. It is the place costs get created with every link already filled in, instead of being gathered afterward. It cannot be built before slices 05 and 06, because the links it displays do not exist in the tables yet.

**What is true today.** Designed and delivered. The load drawer has twelve tabs and no Costs tab. Nothing is built.

**The vertical slice**

- **Data** — No new table. Reads mdata.loads, accounting.expenses, accounting.bills and the driver pay tables.
- **Backend** — One read model returning open loads with revenue, costs so far, driver pay so far and approximate margin. It reads. It writes nothing.
- **Interface** — One endpoint for the board, one for the expanded load.
- **Screen** — Accounting gains a Load Costs board. The load drawer gains a thirteenth tab named Costs. Both follow the delivered design.
- **Guard** — The word approximate stays on the approximate panel. No posting happens from this screen.
- **Proof** — Click a live load, create a cost from the board, and show all twelve links filled in without typing any of them.

**Done means:** A cost created from the board carries the load, customer, vendor, driver, truck, trailer, locations and the vendor's own receipt number, with none of it typed twice.

---

### 08. Twenty-eight bank transactions are dated in the future

**Seat:** CC-3  |  **Depends on:** Slice 02, so the fake rows are already separated from the real ones.

**Why it is here.** Twenty-eight rows in the USMCA bank feed carry transaction dates after today, the furthest being July 2027. A cash flow forecast built on this is wrong in a way nobody will notice, because the numbers look reasonable. Any forecast, aging or period report that reads this feed is currently reporting fiction.

**What is true today.** Verified in production: 28 rows with transaction_date greater than today, maximum 2027-07-05.

**The vertical slice**

- **Data** — No schema change. The rows need investigation and correction, with an audit record of each change.
- **Backend** — A check that refuses a bank transaction dated more than one day ahead of the company business date.
- **Interface** — The import path rejects and reports rather than accepting silently.
- **Screen** — Banking shows a clearly labelled exception list for anything dated ahead.
- **Guard** — Fail the build if any import path can write a future-dated bank transaction.
- **Proof** — The 28 listed with their source, before and after.

**Done means:** No bank transaction is dated ahead of the business date, and the import path can no longer create one.

---

### 09. An expense can carry a class

**Seat:** CC-3  |  **Depends on:** None.

**Why it is here.** accounting.bills has class_id and accounting.expenses does not. The two sides of the same ledger report differently, which means any class-based report is incomplete on one side and nobody can tell which.

**What is true today.** Verified in production: class_id present on bills, absent on expenses.

**The vertical slice**

- **Data** — Add class_id uuid to accounting.expenses, referencing catalogs.classes as the bill does.
- **Backend** — Expense create and update accept it. Class reports read both sides.
- **Interface** — The expense endpoints accept class.
- **Screen** — The expense creator gains the same Class field the bill creator has, in the same place.
- **Guard** — A class report test that asserts bills and expenses are both counted.
- **Proof** — One class report showing an expense and a bill in the same class.

**Done means:** Class reporting covers both bills and expenses.

---

### 10. The proof trail — click to ledger

**Seat:** CC-2  |  **Depends on:** Slices 01 through 07, so the chain it proves is the corrected one.

**Why it is here.** The owner asked for a tracker that follows a click and shows the transaction landing in the correct accounts, proving the chain is really linked. This is the thing that makes every other claim in this system checkable by somebody who does not trust it, including a CPA, an auditor or a lender.

**What is true today.** GO-17 written. Not started. Every money table already carries trace_no and trace_key, so the spine exists.

**The vertical slice**

- **Data** — No new table. audit.audit_events and the trace columns already carry what is needed.
- **Backend** — One service that, given any document, returns the full chain: what was clicked, what was written, which accounts moved, and every record it linked to.
- **Interface** — One endpoint per document type.
- **Screen** — A proof panel on every money document showing the accounts touched and the links made, in plain English.
- **Guard** — A test asserting that a load, an expense, a bill and a settlement each return a complete chain with no missing link.
- **Proof** — Click Save on a real expense and screenshot the panel showing every account and every link.

**Done means:** Any money document shows, on its own screen, exactly where the money went and what it is attached to.

---

### 11. Thirteen half-built features — build or remove

**Seat:** OWNER decides, then CC-3  |  **Depends on:** None, but do not start until slices 01 through 07 are merged.

**Why it is here.** For each of these the screen exists, the endpoint exists, the code runs, and the table was never created. The code checks and quietly skips. Nothing crashes; the operator sees an empty screen and is told nothing. Software that looks like it works and silently returns nothing is worse than software that is plainly missing, because nobody reports it.

**What is true today.** Thirteen confirmed against production and listed in the map under Gaps. They include fuel route recommendations, maintenance predictive alerts, maintenance labor rates, inventory parts, safety workers compensation claims, safety accident liabilities, telematics cargo sensor incidents, customer health scores, dispatch late arrival aggregates and banking reconciliation drift alerts.

**The vertical slice**

- **Decision** — The owner decides one at a time: build it, or take the screen out. There is no third answer that leaves the operator informed.
- **Data** — For anything kept: create the table properly, with the linkage declaration.
- **Backend** — Remove the silent skip. A missing feature says so.
- **Screen** — An empty screen states why it is empty. It never just shows nothing.
- **Guard** — Fail the build on any new silent skip of a missing relation.
- **Proof** — One list, thirteen rows, each marked built or removed, signed off.

**Done means:** No screen in the software silently shows nothing.

---

### 12. Four hundred and thirty-seven screens cannot be linked to

**Seat:** CODEX  |  **Depends on:** None. Can run in parallel throughout.

**Why it is here.** 437 of the 521 real screens are not in the deep link manifest. They can be reached by clicking, but a saved bookmark or a link sent to somebody is not reliable. For a company that will send a driver, a customer or an attorney a link to a specific record, that is a daily problem.

**What is true today.** Verified in the map. 86 of 584 routes are in the manifest.

**The vertical slice**

- **Data** — None.
- **Backend** — None.
- **Interface** — None.
- **Screen** — Add the missing routes to the deep link manifest, in module order, and confirm each one loads cold from a pasted address.
- **Guard** — Fail the build if a new route is added without a manifest entry.
- **Proof** — A run that opens every route cold and reports which ones do not render.

**Done means:** Every screen has an address that works when pasted into a fresh browser.

---

### 13. A health check that can never pass

**Seat:** CASCADE  |  **Depends on:** None.

**Why it is here.** The deep health endpoint runs four checks. Two of them query tables that do not exist and are in no migration. The file admits it in its own comment. A health check that cannot pass trains everyone to ignore the health check, which is worse than not having one.

**What is true today.** /api/v1/health/deep queries qbo.connections and banking.plaid_items. The real table is integrations.qbo_connections. banking.plaid_items does not exist anywhere.

**The vertical slice**

- **Backend** — Point the QuickBooks check at integrations.qbo_connections. Remove the Plaid check or create the table it needs.
- **Guard** — Fail the build if any health check queries a relation that is not in the migrations.
- **Proof** — The endpoint returning healthy on a healthy system, for the first time.

**Done means:** Every check in the deep health endpoint can pass, and does.

---

### 14. The static verifier connects to a dead port instead of running with no database

**Seat:** CASCADE  |  **Depends on:** None.

**Why it is here.** Guards that are supposed to run without a database instead connect to a fake address, fail to connect, and crash. Those guards have not actually been running. Every green check they produced was green because the guard never got far enough to look.

**What is true today.** scripts/verify-static.mjs sets DATABASE_URL and DATABASE_DIRECT_URL to postgresql://verify_static:none@127.0.0.1:59999 instead of unsetting them. Guards that test whether the variable is absent see a value, connect, and fail.

**The vertical slice**

- **Backend** — Unset the two variables instead of setting a sentinel.
- **Guard** — A test asserting both are absent inside the static verifier.
- **Proof** — The named guards running to completion for the first time, with their real result whatever it is.

**Done means:** The static guards run and report a real answer instead of an error.

---

### 15. The posting contract still describes the invoice entry wrongly

**Seat:** CC-2  |  **Depends on:** None.

**Why it is here.** The contract file specifies an entry shape that, if followed, counts revenue twice. It has not caused a defect yet because the code does not follow it. That is luck, not design, and the next person to implement from the contract will implement the double count.

**What is true today.** POSTING-CONTRACTS.json invoice contract. Filed with file and line.

**The vertical slice**

- **Data** — None.
- **Backend** — Correct the contract to the two event latch the code actually implements: delivery earns, conversion creates the receivable.
- **Guard** — A test that reads the contract and asserts the posting engine matches it.
- **Proof** — Contract and engine agreeing, proven by the test rather than by reading.

**Done means:** The contract and the code say the same thing, and a test enforces it.

---

### 16. Four hundred and seven bank transactions are uncategorized

**Seat:** CC-3 builds, OWNER decides  |  **Depends on:** Slices 02 and 08, so the feed is clean and correctly dated before anyone categorizes it.

**Why it is here.** Eight of 415 bank transactions are categorized. Until they are, the balance sheet, the profit and loss and the cash position are all incomplete, and no report from this company can be trusted by anyone outside it. This is the largest single block of work on the list and most of it is the owner's decisions, not code.

**What is true today.** Verified in production: 8 categorized, 407 not, spanning December 2025 to September 2026.

**The vertical slice**

- **Backend** — Categorization rules that suggest, never decide. A suggestion is not a posting.
- **Screen** — A categorization queue that works in bulk, groups by merchant, and remembers a decision so the same merchant is never asked twice.
- **Guard** — No rule may post automatically. Every categorization records who decided and when.
- **Proof** — The count falling, with an audit row behind every change.

**Done means:** Every bank transaction is categorized by a person or by a rule that person approved, with a name and a date on each.

---

## Seven decisions only the owner can make

None are code problems. Each blocks work that is otherwise ready.

- **The escrow question** — Whether the escrow branch is restored, and on what basis. Named as the most serious open item in the register of September 1 and still unanswered. Nothing downstream of escrow can be certified until this is decided.
- **The cutover date and the opening entry** — USMCA began operating August 7 but has bank transactions from December 2025. Somebody has to decide the date the books open and what the opening entry is. Without it, no period can close and no balance sheet is meaningful.
- **Capitalize threshold** — Seven thousand dollars or two thousand five hundred. Affects every repair and every purchase from here forward.
- **Accessorials parent account** — Which account accessorial charges roll up to.
- **Company settlement table design** — The driver settlement exists. The company settlement does not have an agreed shape.
- **The sample insurance policies** — Whether they are deleted or kept and marked.
- **The thirteen half-built features** — Build or remove, one decision each. Slice 11 cannot start without this.

## Two things that are not build work

- **Insurance is short thirty-seven thousand four hundred dollars** — Policy 437539 covers 34 units at 1,040,540 dollars against a required 1,077,940. Verified. This is not a code task and it does not belong in the build queue. It is an insurance action and it is the only item on this page that costs money every day it is open. The signed schedule is a scan and needs transcribing by hand before anything can be reconciled against it.
- **Nobody has clicked Book Load in a real browser** — Every test that has been run is a test the software wrote about itself. The only USMCA load in production is cancelled. Until a person books a load through the browser, nothing in this system is proven to work end to end. Slice 01 makes this the first thing worth doing.

## The live numbers behind this page

Read from the USMCA books this morning: 415 bank transactions, of which 8 are categorized and 28 are dated in the future; 176 drivers; 1,232 customers; 8 insurance policies; 3,375 seeded lanes; and one load, which is cancelled.

Nothing here is reported as done. Where an earlier report said something was closed and it was not, this page says so and gives the file and line.
