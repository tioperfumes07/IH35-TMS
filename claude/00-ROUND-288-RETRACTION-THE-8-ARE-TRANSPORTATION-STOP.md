# ROUND 288 — **STOP. 287.2.1 IS CANCELLED. THE 8 LOADS ARE TRANSPORTATION.**
# Claude Lead · 09-30-2026 · Issued within 20 minutes of ROUND 287, before any seat acted on it.

# 288.0 — CC-1: **DO NOT ISSUE THE 8 INVOICES. CANCEL 287.2.1 ENTIRELY.**
If you have already created any of them, void them immediately and report it. Nothing else in 287
depends on this and nothing else in 287 is affected.

I ordered $29,300.00 of invoices issued into USMCA for loads that the owner ruled TRANSPORTATION
**three and a half weeks ago**. Issuing them would have put Transportation revenue into USMCA's books
— the single thing the owner has corrected me on more than any other.

## 288.1 — THE ANSWER WAS ALREADY WRITTEN. I did not read it before ordering.
`claude/IH35-CLAUDE-JOURNAL.md`, 2026-09-06 04:0xZ, Lead ruling posted to OUTBOX-CURSOR, verbatim:

> **"13503/04/06 + the 8 Faro loads + 13505/13507 all TRANSPORTATION per the source workbook
> (TRANSPORTATION BY LOAD; QBO 08/07 = invoice date, not pickup) — nothing reclassified, nothing
> seeded. 13505→5776, 13507→5772 are owner hand settlements."**

And the same journal, 2026-09-05 13:36Z, recording the owner's own correction of a Lead error:

> **"Standing rule recorded in LAW.md: USMCA = pickup >= 2026-08-07 AND not Transportation-Faro;
> else TRANSPORTATION (frozen)."**
> **"9 Transportation-Faro (13496, 13500, 13503, 13504, 13506, 13517, 13531, 13533, 13539)"**
> **"Owner hand list corrected: 5772, 5776, 5780, 5783, 5784 (5766 is Transportation)"**

**The void reason on those 13 invoices — "Transportation load — Faro Transportation portal" — is not a
defect. It is this ruling, executed correctly.** A prior round did exactly what it was told.

## 288.2 — WHERE MY ROUND 287 REASONING BROKE
I took `00-CLOSED-USMCA-SETTLEMENTS-5769-TO-5819` and treated "USMCA's settlement series begins at
5769" as **the whole ownership test**. It is not. It is the test for **which settlements USMCA must
close**, and it was written to stop seats chasing 5753 and 5760–5768 as a gap.

**Ownership of a LOAD is decided by the rule in LAW.md: pickup >= 2026-08-07 AND not Transportation-Faro.**
The two are not the same test and they do not contradict each other:
- **5772, 5776, 5780, 5783, 5784 are OWNER HAND SETTLEMENTS.** The owner entered them by hand. A hand
  settlement numbered inside USMCA's series does **not** convert the underlying load to USMCA.
- 13503, 13504, 13506, 13531, 13533, 13539 are named individually in the 9-load Transportation-Faro
  list. 13505 and 13507 are named individually in the 09-06 ruling. **These are not inferences.**

**So: a settlement number >= 5769 proves the SETTLEMENT is USMCA's to close. It proves nothing about
the LOAD.** I inverted that and built a whole round on it.

## 288.3 — WHAT IS ACTUALLY TRUE ABOUT THOSE LOADS, from the 09-22 handoff §3.7
`claude/09-22-2026-LEAD-HANDOFF-TO-NEXT-AGENT.md`:
> "Six have **no customer reference at all** (`wo` and `po` both NULL) and therefore cannot be
> reconciled to anything: **13515, 13522, 13525, 13530, 13555, INV-2026-00002**. A load that reaches
> invoice with no customer reference is an invariant violation (I8) and should be **blocked at the
> gate, not cleaned up later**."

**13522 and 13530 — two of the eight I wanted to invoice — are on that list.** They are not unbilled
revenue. They are an invariant violation that already has a ruling: **block it at the gate.**
> "The rest: **13553**, 13567, 13574, 13578, 13582, 13588, 13613, INV-2026-00009, INV-2026-00010."

**13553 is answered too** — it is an app invoice with no Faro purchase on that reference, already
registered in §3.7. **287.3.2 is CANCELLED. CC-3 investigates nothing.**

## 288.4 — WHAT SURVIVES FROM ROUND 287
| item | verdict |
|---|---|
| 287.2.1 issue 8 invoices, $29,300 | **CANCELLED — they are Transportation** |
| 287.2.2 fix the writer that voided them | **CANCELLED — the writer was right** |
| 287.3.1 create load 13593 + invoice 074-13593 $4,800 | **STANDS.** Self-carried invoice, confirmed by the owner's own PDF `Invoice_074-13593_ALIGATOR.pdf`, and the closed reconciliation section 4 un-cancels 13593 explicitly. |
| 287.3.2 investigate 13553 | **CANCELLED — answered in the 09-22 handoff section 3.7** |
| 287.4 the closed control figures | **STANDS.** Nobody re-derives them. |
| 287.6 read the closed docs before measuring | **STANDS — and I broke it again in the very next round** |
| 286.C.1 4 revenue loads with no driver bill | **STANDS** — and see 288.5, three of them are already explained |
| 286.C.2 18 revenue loads with no expense | **STANDS**, link against the 424 unlinked lines first |
| 286.C.3 58 loads with no fuel = NOT a defect | **STANDS** |

## 288.5 — THE MISSING DRIVER BILLS ARE ALSO ALREADY ANSWERED
`claude/09-13-2026-LOAD-TO-CASH-CHAIN-LAW-AND-MEASURED-STATE.md`:
> "**The 7 loads with no driver bill:** `13502`, `13505`, `13507` — all `delivered_pending_docs` with
> **no driver, no unit, no tour, no bill**; orphans end to end. `13554`, `13573`, `13579`, `13580` —
> have a driver, no bill."

**13502, 13505 and 13507 are Transportation orphans — they are not supposed to have a USMCA driver
bill.** Only loads with a driver and no bill are real defects. **286.C.1 is re-scoped: CC-3 works only
the loads that HAVE a driver and no bill. Do not create a driver bill for a Transportation orphan.**

## 288.6 — THE RULE I KEEP BREAKING, written where I will hit it first
**Before any measurement of loads, invoices, entity ownership or the closed numbers, read, in this order:**
1. `claude/IH35-CLAUDE-JOURNAL.md` — the owner's rulings, dated. **This is where the answers are.**
2. `claude/00-USMCA-RECONCILIATION-CLOSED-NEVER-ASK-AGAIN.md`
3. `claude/00-CLOSED-USMCA-SETTLEMENTS-5769-TO-5819-TIE-EXACTLY-NEVER-ASK-AGAIN.md`
4. `claude/09-22-2026-LEAD-HANDOFF-TO-NEXT-AGENT.md` — sections 3.3 through 3.9
5. `claude/09-13-2026-LOAD-TO-CASH-CHAIN-LAW-AND-MEASURED-STATE.md`
6. `claude/00-CLOSED-ASKED-AND-ANSWERED-NEVER-REOPEN.md`

**A live query is not an answer. It is a measurement of today's rows.** Ownership, scope and intent
live in the rulings above. **When a query and a ruling disagree, the ruling wins and the query is a
bug report about the app.**

**And the harder rule, for me specifically: a load I am about to invoice, void, reclassify or delete
gets its load number grepped across all six documents FIRST.** Every single one of the 8 was already
named in writing. I did not look.
