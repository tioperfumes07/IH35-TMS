# PASTE ALL SEATS — GO-19 BUILD QUEUE · 2026-09-01 22:40 CT

**Live:** API `healthz/shallow` **12bfbd6**. **origin/main** at ingest: `8901af7`. USMCA only. NO-SEAT prod money. NEVER invent bank GL. NEVER zero escrow.

**Download (in git):** `docs/lockdown/GO-19-BUILD-QUEUE.md` · `.html` · `.txt`  
**Map already in git:** `docs/lockdown/IH35-SOFTWARE-MAP/` (#19446) — do not re-copy the zip.

**Lane (this paste, Cursor lead — overrides Cascade seat labels where they conflict):**

| Slice | NOW seat | Depends |
|-------|----------|---------|
| **01** load plain number | **Cursor** leftover (mint already on main) | none |
| **02** bank fixtures + `is_sample_data` | **CC-1 MONEY only** | none (beside 01) |
| **03** child numbers | **CC-1** | after 01 mint (already on main) |
| **04** proforma at pickup | Cursor later | 01 |
| **05 / 06** bills driver/trailer + `bill_lines.load_required` | **CC-1** (GO-18 overlap) | 05 then 06, one migration author |
| **07** Load Costs board | Codex FE after 05/06 | 05+06 |
| Future bank dates (Cascade 08) + 407 uncategorized (Cascade 16) | **CC-1 + owner categorizes** — never invent GL | after 02 |
| Escrow forensic | **CC-1** — no Ask Jorge, no zero | now |
| Book Load Chrome | **Devin-A / Jorge** after 01 leftover ships | no POST / no seat money |
| 09 expense class / 11 thirteen half-built / 12 deep links / 13 health / 14 static / 15 posting contract | see GO-19 file; not this hour unless unique FINDING | — |

Copy **one** fenced block per seat chat.

---

## Cursor vs Cascade on origin/main (cheap grep — `8901af7`)

| Slice claim | Verdict | Evidence |
|-------------|---------|----------|
| 01 mint still `L-${ymd}-${seq}` at load-id-reservation.service.ts **L77** | **DISAGREE** | L77 is the `^[0-9]+$` seed regex comment. `allocateNextLoadNumber` is **plain digits** (GO-10 REV-B #19325). Guard `load-id-reservation.guard.test.ts` already forbids `L-${ymd}-${seq}`. |
| 01 Rule 03 still `L-{n}` | **WAS stale; APPLIED this PR** | Load row now `{n}` digits citing GO-19 + GO-10 REV-B. Driver bill `B-` still CC-1. |
| 01 GET load ref rejects digits | **AGREE leftover** | `apps/backend/src/lib/load-ref.ts` `LOAD_NUMBER_RE = /^L[\w-]{1,60}$/i` — a booked `13561` would 400 on UUID-or-L-only GET. **This PR starts 01 leftover.** |
| 03 expense first number is `12225-1` | **DISAGREE** | `expense-number.ts` `formatLoadExpenseNumber` seq 1 = bare load number (#19335 / ACCT-F10342). |
| 03 driver bill is `B-` | **AGREE** | `driver-bill-number.ts` still `B-${suffix}`. **CC-1 slice 03.** GO-19 is the owner ruling that closes GO-MASTER “WAIT Jorge” on dropping `B-`. |
| 02 `banking.bank_transactions` has no `is_sample_data` | **AGREE** (migrations) | no column in `db/migrations` for bank_transactions `is_sample_data`. **CC-1.** Counts 415/381/34 = UNVERIFIED Neon this turn (do not invent). |
| 05 bills missing driver/trailer/recover | **AGREE** | `docs/schema-parity-baseline.json` `accounting.bills` has `unit_id`, not `driver_uuid` / `trailer_id` / `recover_from_driver`. **CC-1** (parent lane; Cascade had Cursor). |
| 06 `bill_lines` missing `load_required` | **AGREE** | `accounting.bill_lines` has `load_id` only; `expense_lines` has `load_required` + `load_exemption_reason`. **CC-1.** |
| 04 proforma at book | **AGREE** | `book-load.service.ts` still `ND-INV-01` at book. Cursor later. |
| 14 verify-static dead port | **LIKELY STALE** | grep #19428 before rebuilding. |

**01 implementation this turn:** do **not** remint (already digits). Do **not** book a prod load. Fix GET ref + Rule 03 Load row. First typed USMCA number remains office/owner (`FirstLoadNumberRequiredError` until seed).

---

## OWNER DECISIONS (Jorge only — not coder)

Paste this box to Jorge separately. Seats do not answer these.

```
OWNER DECISIONS — not coder work
1. Escrow branch restore / basis — named most serious Sep 1. CC-1 forensics only; Jorge decides restore. NEVER zero.
2. USMCA cutover date + opening entry (bank rows from Dec 2025 vs ops Aug 7).
3. Capitalize threshold ($7,000 vs $2,500).
4. Accessorials parent account.
5. Company settlement table shape (driver settlement exists; company does not).
6. Sample insurance policies: delete vs keep+mark.
7. Thirteen half-built features (slice 11): build or remove, one each.
NOT coder: insurance short $37,400 on policy 437539 (ops/insurance action).
NOT seat GL: 407 uncategorized bank txns / “1.9% categorized” — owner categorizes; CC-1 builds queue/suggest-only after slice 02.
GO-19 vs Rule 03 Load L- prefix: APPLIED — GO-19 + live GO-10 REV-B mint. Driver bill B- drop = CC-1 slice 03 (GO-19 is the ruling).
```

---

## PASTE → CC-1

```
CC-1 | ACK | NOW=ESCROW $500.01 forensic (no zero, no Ask Jorge) THEN GO-19-02 banking.bank_transactions is_sample_data mark+hide 34 USMCA fixtures NEVER DELETE THEN GO-19-03 driver-bill-number drop B- (expense seq1 already bare — grep expense-number.ts before rebuild) THEN GO-18/GO-19-05+06 bills driver_uuid+trailer_id+recover + bill_lines.load_required copy expense rule THEN future-dated bank + 407 uncategorized SUGGEST-ONLY queue (OWNER categorizes, NEVER invent 97.5% GL) · NEVER seat fixtures · NEVER trigger_deploy | GO
```

---

## PASTE → CC-2

```
CC-2 | ACK | NOW=verify-live escrow AFTER CC-1 · grep #19428 BEFORE re-diagnose verify-static · GO-19-01 mint already PLAIN DIGITS on main (DISAGREE Cascade L-77) · then verify F+R after CC-1 05/06 · NEVER remint L- · NEVER zero escrow · NEVER --watch | GO
```

---

## PASTE → CC-3

```
CC-3 | ACK | NOW=Check ZIP 183 Option 1 EXECUTE #19419 · apply #19414 if not applied · GO-19-09 expense class_id AFTER money lane free · NEVER invent bank GL · NEVER seat money · NEVER trigger_deploy | GO
```

---

## PASTE → Codex

```
CODEX | ACK | STOP-WATCH | NOW=OPEN PRs if any then GO-19-07 / GO-18 Costs 13th tab + Costs Board AFTER CC-1 05/06 on main · NEVER silent Expense/Bill default · NEVER --watch · NEVER seat fixtures | GO
```

---

## PASTE → Cascade

```
CASCADE | ACK | NOW=unique FINDING only · CORRECT: slice 01 mint already digits GO-10 REV-B (L77 is regex not L-ymd) · expense-number already 12225 then 12225-1 · driver-bill still B- · bills still missing driver/trailer · bill_lines still missing load_required · verify-static dead-port grep #19428 · NEVER restamp U14 · NEVER ask Jorge closed Qs | GO
```

---

## PASTE → Devin-A

```
DEVIN-A | ACK | NOW=/dispatch 12bfbd6 Book Load Chrome · Laredo TX → Denton TX Practical 456.7 / Short 452.2 · Chicago IL EMPTY · CANCEL · no POST · no seat money · first real book waits owner typed seed number after 01 leftover (GET digits) deploys · NEVER invent GL | GO
```

---

## PASTE → Cursor (self ACK)

```
CURSOR | ACK | NOW=GO-19 ingest+PASTE FORCE · 01 leftover=load-ref digits + Rule 03 Load row (mint already GO-10) · NEVER remint · NEVER seat book · NEVER 97.5% GL · NEVER second deploy this hour unless 5–10 PR cadence | GO
```
