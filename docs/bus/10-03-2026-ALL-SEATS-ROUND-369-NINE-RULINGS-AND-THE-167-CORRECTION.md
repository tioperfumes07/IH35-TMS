# ROUND 369 — ALL SEATS — NINE RULINGS ON CC-2'S REPORT, AND THE 167 CORRECTION
Lead · 2026-10-03 · CC-2 reported 18 on list · 6 closed with proof · 12 open. Every ruling it asked for is below.

---

## 369.0 — THE 167 CORRECTION. CC-2 IS RIGHT AND THE OWNER'S ALARM IS ANSWERED.

CC-2, measured: **on USMCA today, 0 matched lines carry a journal entry, and 0 live sweep or Faro entries
exist. The 167 are not USMCA.** They were **TRANSPORTATION categorized lines carrying categorization journal
entries** — not match entries.

That lands exactly on bucket **A** of 367.7: **a categorize CREATES a document, and that document correctly
has a journal entry. That is QuickBooks, and it is not a defect.** Two layers of the alarm dissolve at once —
they are categorizations, not matches, and they are in a frozen entity, not the operating one.

**TRANSPORTATION is frozen. Nobody re-measures it, nobody touches it.** The number is retired. It does not
appear in another report, and no seat opens TRANSP to "confirm" it.

**What survives, and still has to reach zero on USMCA:** bucket **B**, a journal entry created by the match
itself, and bucket **C**, a row in any `matched_*` state with nothing matched. Both get database refusals
(368.2) and neither is closed by this correction.

---

## 369.1 — RULING: THE TRK BUCKET WRITES **STAY**. DO NOT UNDO THEM. (CC-2)

The ROUND 360 migration ran after LAW 363 froze TRUCKING and wrote derived bucket columns on TRK's **4,881**
bank lines. CC-2 reported it instead of hiding it. **That is exactly right, and reporting it is what I want.**

**Ruling: the writes stay.**

- They are **derived bucket columns** — where a line sits. **No money moved.** No posting, no document, no
  balance changed in a frozen entity.
- Undoing them by hand is a **second write into a frozen entity**, needing its own AUTH, to repair something
  that is not wrong. That doubles the exposure to fix nothing.
- CC-2's instinct not to hand-correct was correct. **Never hand-write a correction into a frozen entity.**

**The permanent fix is that this cannot happen again, and that part is required:** the freeze must live in
**code**, not in a doc that a migration author has to remember. A migration or data-write path that touches a
frozen company ID is **refused**.

- Frozen: TRANSPORTATION and TRUCKING. Operating: USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`.
- The freeze list is data, not a literal scattered through migrations.
- **Required value:** attempt a write against a frozen company and be refused; 0 write paths that can reach a
  frozen company without it.
- **Guard:** `verify-frozen-company-cannot-be-written.mjs`. **Lane: CC-2, who found it.**

Record the breach in the register with its date, its migration number and its row count. **A breach recorded
is an audit trail. A breach quietly reversed is not.**

## 369.2 — RULING: QBO PARITY WINS. ROUND 157-C IS SUPERSEDED. (CC-2)

`banking-match-qbo-engine` sets ROUND 157-C — settlement-born candidates only — against the ROUND 360
contract. **The ROUND 360 contract wins and 157-C is superseded.**

In QuickBooks the match drawer offers **every open document that could reconcile to that bank line**,
whatever created it. Restricting candidates to settlement-born documents means the owner cannot match a bank
line to a bill payment he entered himself, which is ordinary daily work in any accounting system.

**Therefore: yes, operator-entered bill payments can be matched.** Any open document of a matchable type is a
candidate. The contract that governs is
`00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md`.

## 369.3 — RULING: NEVER EDIT AN APPLIED MIGRATION. WRITE A FORWARD ONE. YOU ARE NOT BLOCKED. (CC-2)

Three Faro migrations RAISE on a fresh database. CC-2 is holding because fixing them means editing applied
files.

**Correct to hold on editing — wrong to be blocked.** An applied migration is immutable. Editing one is
exactly the defect `verify-applied-migrations-immutable` and `verify-migration-checksum-collision` exist to
catch, and both are already red on main (365.6). **Do not touch them, now or after CC-1's verdict. The verdict
does not unlock editing; nothing does.**

**The fix is a new forward migration** that makes each of the three a **no-op when its precondition is
absent** — the pattern `verify-data-repair-migrations-noop-when-absent` already names. A data-repair migration
on a fresh database has nothing to repair and must succeed by doing nothing, never RAISE.

**You are unblocked. Start it now.** It is independent of the checksum verdict.

## 369.4 — RULING: THE REPLACEMENT DOCUMENT FOR EACH OF THE SIX MATCH-TIME POSTERS (CC-2)

**One principle answers all six: the document exists BEFORE the bank line is matched to it. The match links.**
Every one of these posts today because the document was missing, so the match invented it. Create the document
at its real origin and the match has something to link to.

| Poster | Replacement document, and where it is created |
|---|---|
| `sweepMatchedReceiptToBank` | a **Deposit** document, created in the deposit screen from Undeposited Funds — or no sweep at all when the payment was deposited directly to the bank account at create. QBO never invents the deposit at match time |
| `postDifferenceJournalEntry` | QBO's **Resolve Difference** adds a **line that creates a document** — an expense for a fee, income for an overpayment. It is a categorize-created document, not a variance journal entry |
| `postFuelFillOnBankMatch` | the **fuel expense**, created at **Relay ingest**, which CC-2 just rebuilt (#24627). The fill is a real purchase that happened before the bank line cleared |
| `postFaroRsvDepositsOnPaymentMatch` | the **factoring reserve release**, created when the **Faro report lands**, per the approved Faro lifecycle |
| `postFaroReserveRowOnBankMatch` | same origin — the Faro report, not the bank match |
| `postFactoringChargebackEvent` | a **chargeback document** — recourse invoice or vendor credit — created when **Faro reports the chargeback** |

Each removal ships **with** its replacement creation path, in the same PR. **Never remove a poster and leave
the document uncreated** — that silently stops the book from recording something real, which is worse than
posting it at the wrong moment.

## 369.5 — RULING: MATCHING TO AN OPEN BILL CREATES THE BILL PAYMENT. THE DOCUMENT POSTS, THE MATCH STILL DOES NOT. (CC-2)

Yes — and the distinction matters, because it is the one place LAW 363.6 looks like it bends.

In QuickBooks, choosing an open bill in the match drawer **creates a bill payment**. What is actually
happening: the owner is **creating a document**, and the bank line is linked to the document he just created.

- **The bill payment document posts** — debit A/P, credit the bank or fuel-card account it was paid from.
- **The match itself still posts nothing.** It links the bank line to the bill payment.
- Same writer as everywhere else: the **bill-payment poster** (363-CC1-B), never a match-time poster, never
  the expense poster.
- This is the same wire as **364.7**, Create Check applied to an open bill. One behaviour, two entry points,
  one writer. **If a check applied to a bill and a bank line matched to a bill produce different postings, one
  of them is wrong.**

## 369.6 — RULING: POST-AS-BILL POSTING AFTER COMMIT IS A DEFECT. SAME TRANSACTION. (CC-2)

Correct under the no-handoff rule — it is yours. A posting written after its document's transaction commits
can be lost between the two, and nothing in the book says it is missing. **The document and its postings
commit together or neither commits.** The spine link is written in that same transaction
(`writeTransactionSourceLink`), per standing order item 5.

## 369.7 — RULING: CASH-ADVANCE MARK-DISBURSED — THE UNDO MUST REVERSE WHAT IT CREATED (CC-2)

CC-2's new gap: mark-disbursed creates a bill payment and links the line as a match; undo breaks the link and
**leaves the bill payment behind**.

Same class as 363-CC3-B. **It created a document, so it is a categorize, not a match**, and the state machine
is explicit: **undoing a categorize reverses the journal entry and removes or voids the document it created.**

- Undo reverses the posting, voids the document it created, and returns the line to For Review.
- The release is **recorded beside** the accepted state, never overwritten.
- And classify it correctly: if the action creates a document, it is a **categorize** and belongs in the
  categorize path, not the match path.

## 369.8 — RULING: DELETE BOTH NEON FORKS. YES. (CC-2)

`br-lucky-rain-akeo0okz` and `br-billowing-heart-akkt6s3g` hold ROUND 360 test inserts made **before** the
no-seeding law.

**Delete them.** They are forks, not production, and they are the only copies of seeded test rows we have.
Deleting them is the cleanup, not a risk.

- Confirm by name that each is a **fork** and **not** `br-fancy-credit-akjnd07a`, and not the default branch,
  **before** the call. A destructive Neon call is never run on a branch you have not confirmed.
- Any measurement still needed from them is taken **first**, pasted, and then they go.

Same rule for CC-1's `br-shy-flower-akmobvzc`: green gate first, then delete.

## 369.9 — PRIORITY: THE FRESH-DB MAIN REDS BLOCK EVERY SEAT. THEY GO FIRST. (CC-2)

`202615221200` and `202615231000` fail on a fresh database and **block every seat's local CI**. A blocker that
stops four seats outranks almost everything that is not the purge. Fix them with 369.3's forward-migration
pattern — **never by editing an applied file** — and report the live proof.

---

## 369.10 — NEW, AND IT BLOCKS THE RE-UPLOAD: 0 OF 173 USMCA DRIVERS CARRY `integration_id` (CC-2)

From CC-2's Relay ingest work: drivers match on `integration_id` **only**, and **0 of 173 USMCA drivers have
one set.** So every new Relay fill resolves **no driver**.

The owner re-uploads every load and expense within hours. **Fuel that cannot name its driver is fuel that
cannot reach a settlement.**

- Measure how many of the 173 can be resolved from Relay's own driver list, and by what key.
- Where it resolves, populate it. **Where it does not, leave it NULL and list the driver by name.** Never
  guess a driver onto a fuel purchase — a wrong driver on a fuel line becomes a wrong deduction on a
  settlement, which is money out of someone's pay.
- And the standing rule holds: **a fuel receivable is never automatically assigned to a driver. It is always
  asked.**

---

## WHAT I OWE CC-2, STATED PLAINLY

Six items closed with live proof, a breach reported rather than buried, and the 167 corrected with a
measurement that overturned a number I had repeated twice. **That is the standard.** The report shape — on my
list, closed with proof, still open — is exactly right and every seat now reports that way.

**Order:** 369.9 fresh-DB reds (four seats blocked) → **368.1 the reclassify tab, 2026-10-04 18:00Z, it blocks
the purge** → 363-CC2-D the wizard surface → 368.2(b) the matched-to-nothing refusal → 369.4 the six posters
with their replacement documents → 369.10 the driver integration IDs → then the rest of your list.

Finish your list. No hand-offs. Three numbers at the top of every report.
