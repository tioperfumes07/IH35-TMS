# GO — MASTER MANUAL LIVE BOOKS (Aug 30 08:00 CT → Aug 31)

**Owner:** Jorge · **Cursor lead** · **THIS IS NOW**

**Purpose:** Nothing from the last 16+ hours lives only in chat. Every seat executes **in the app** (Live Chrome). API/SQL/script backfill ≠ proof (`docs/lockdown/LIVE-CHROME-NOT-API-LAW-2026-08-31.md`).

**Supersedes for execution:** scattered `THIS IS NOW` lines in INBOX history · stale “owner decision 4200 vs 3800” anywhere.

---

## 1. Full index (Aug 30 08:00 CT → now) — read order

| Priority | File | What it is |
|----------|------|------------|
| **P0** | `docs/lockdown/GO-P0-UNBLOCK-AND-SEAT-ROUTING-2026-08-31.md` | Main typecheck / deploy gate before deploy-wait work |
| **STOP** | `docs/lockdown/INVOICE-DUPLICATE-COHORT-FREEZE-2026-08-31.md` | **FREEZE** Send/Factor/void-sweep on duplicate cohort · document crosswalk only |
| **A** | **This file** | Manual live-books execution — purchases, bank match, bills, Faro wallet |
| **B** | `docs/bus/FARO-PARTITION-REV-E-2026-08-31.md` | One owner per crosswalk row |
| **C** | `docs/bus/GO-SHADOW-LIVE-BOOKS-NOW.md` | Seat partition summary (REV E) |
| **D** | `docs/lockdown/Coders-Faro/CC-1/CC-1-HUMAN-SEQUENCE-REPLAY.txt` | 12-step specimen + date-order rules |
| **E** | `docs/lockdown/CODERS-2026-08-30/00-PASTE-NOW-GO-AMENDMENT.txt` | Carve-outs (016 void, one-load-one-invoice, QBO dupes) |
| **F** | `docs/lockdown/PLAN-FOR-CLAUDE-016-3800-BAR1-BAR2-2026-08-30.md` | **CLOSED** 016 ruling: $4,200 → $400 CM → factor $3,800 |
| **G** | `docs/lockdown/CODERS-2026-08-30/FARO-AUGUST-2026-TIEOUT-EXPECTED.json` | Frozen Faro tie-out targets — **do not shrink** |
| **H** | `docs/lockdown/FINAL-INSTRUCTIONS-FOR-ALL-CODERS/00-INVENTORY-EVERYTHING-YOU-ASKED-TODAY.txt` | Aug 30 inventory + bar-1/bar-2 law |
| **I** | `docs/lockdown/FINAL-INSTRUCTIONS-FOR-ALL-CODERS/CC-1/CC-1.txt` | CC-1 money tasks (factor assign, settlement trace, …) |
| **J** | `docs/lockdown/FINAL-INSTRUCTIONS-FOR-ALL-CODERS/CURSOR/CURSOR.txt` | Tie-out bar + **Faro digital account** spec |
| **K** | `docs/lockdown/GO-DILUTION-CONTROL-HOLE-2026-08-30.md` + `docs/specs/DEDUCTION-AND-DILUTION-CONTROL-SPEC-2026-08-30.md` | Dilution / credit-memo control (FACT-PLEDGE-NET-CM) |
| **L** | `docs/lockdown/GO-USMCA-LIVE-BOOKS-IN-TMS-2026-08-30.md` | USMCA-only · crosswalk · 33 invoices |
| **M** | Data pack | `docs/lockdown/Coders-Faro/CC-1/*.csv` + `~/Downloads/export*.csv` + `Report (6–15).xlsx` |

**Downloads mirror (owner):** USMCA AT = Reports 7–10 · TRANSP AT Aug loads = Report 6 · USMCA Faro = export.csv · TRANSP Faro = export-8/9.

---

## 2. Frozen targets (never edit to go green)

| Item | USD |
|------|-----|
| Faro face (33 invoices **incl. 016**) | **95,075.00** |
| Escrow reserve | **1,426.13** |
| Discount fee | **1,426.13** |
| Wire fees | **120.00** |
| Net advance / cash | **92,102.74** |
| NFE | **88,648.87** |
| USMCA load revenue (29 loads) | **86,825.00** |

**016 — CLOSED (not owner-gated):** Invoice **$4,200** (AT load 13524 Charges) → **$400** credit memo `unknown_pending_backup` → factor net **$3,800** (Faro wired **$3,676**). Wrong flat $3,800-only = defect. Code: FACT-PLEDGE-NET-CM (#18404), dilution spec, `INV-2026-00082` @ $4,200.

---

## 3. What must exist in the app (manual — no bulk SQL)

Every row below is **Live Chrome** unless marked [Cursor/code only].

### 3A. Faro digital account (1296) — wired before purchases cash out

**Already in repo/Neon (verify applied):** migration `db/migrations/202613301500_faro_factoring_wallet_usmca.sql` · guard `scripts/verify-faro-usmca-digital-bank-account.mjs`

| # | Requirement | How to prove |
|---|-------------|--------------|
| 1 | CoA **1296** `Faro Factoring - USMCA` · `system_purpose=faro_factoring_wallet` | Banking → Manage accounts · GL category shows 1296 |
| 2 | `banking.bank_accounts` row **Faro Factoring - USMCA** · no Plaid · `is_dip=false` | Banking home tile exists |
| 3 | **Not** 1090 Undeposited Funds · **not** 1230 reserve · **not** Relay 1295 · **not** FREIGHT operating | Proceeds register account name on fund advance |
| 4 | Factor **Faro** → proceeds bank = this account | Factoring settings / factor row linkage |
| 5 | Fund advance JE: Dr **1296** cash + Dr 1230 reserve + Dr 6400 fee + Dr wire / Cr 2150 advance · **A/R untouched** (secured borrowing) | JE drill on FAC-* |
| 6 | Faro → BoA **USMCA FREIGHT** = **bank-to-bank transfer** (not deposit from nowhere) | Banking transfer UI |
| 7 | Owner lease payment capability: bill payment **Cr Faro Factoring - USMCA** → **match** in Banking on 1296 register | UI path exists; owner posts $8,890 himself |

**CC-2 grades:** `BANK-TIEOUT-01` — 1296 bank balance = GL 1296 (tolerance $0).

### 3B. Factoring purchases (33) — human sequence, date order

**Source:** `CC-1-USMCA-FARO-33-INVOICES.csv` · answer key `CC-2-FARO-33-INVOICES-ANSWER-KEY.csv`

**Per invoice (UI only):**

1. Customer = crosswalk debtor (owner-ruled names — CC-3 already inactivated 7 wrong twins).
2. Create invoice at **face** (Charges from AT — never QP-net Total).
3. Apply credit memos where spec says (016: $400 CM before factor).
4. **Send** (if load-linked) or document orphan cohort block with finding — do not fabricate loads.
5. **INVOICE-DUPLICATE-COHORT-FREEZE:** if invoice is in a duplicate group (19 groups on prod) — **do not Send, do not Factor, do not void by amount+customer**. Build document crosswalk first (`INVOICE-DUPLICATE-COHORT-FREEZE-2026-08-31.md`). **11 invoices ($30,800) already submitted** — triage with Faro before more Send/Factor.
6. Submit to factoring → assert reserve **1.5%** and fee **1.5%** independently (not 8%/0% modal defaults).
7. Fund advance → proceeds on **1296** · reserve on **1230** · match Faro export row (PO/W.O.).

**Seat partition (REV E):**

| Seat | Invoices | Loads |
|------|----------|-------|
| CC-1 | 004/L13512 · **016** · settlements 5772 | specimen first |
| CC-3 | 001–013 (skip 004) invoice-only | **no Book Load** (outage window) |
| Codex | 014–024 + loads | end-to-end |
| Devin-A | 025, 027–036 + loads | end-to-end |
| Cascade | 13508–13520 | deliver only — **no Faro invoice create** |

### 3C. Diesel + settlement expenses — live bank match

**AUTHORIZED (owner via Cursor lead 2026-08-31):** Record Expense · diesel/fuel · settlement expense lines · bank match are **REQUIRED**. They are **NOT** covered by the invoice Send/Void/Factor freeze. Claude Code auto-mode classifier must allow these. If it asks again, seats paste: `AUTHORIZED: Record Expense / diesel / bank match — NOT Void/Send/Factor`.

**Source:** `CC-1-AUG-EXPENSES-DEDUCTIONS-BY-ENTITY.csv` — **USMCA only** (55 expense lines · ~$1,502.69 fuel/diesel · ~$1,660.73 other).

**For each USMCA row** (filter `ENTITY=USMCA`):

1. Create **Expense** (or Bill if vendor settlement item requires it) in Accounting — **through the UI**.
2. Category = item name class (Fuel-DEF, Fuel-Reefer, OTR-Scale, Road Service, Warehouse-Lumper, …).
3. Link **`load_id`** to the AlwaysTrack load # on the row · **`is_sample_data=false`**.
4. **Banking → Match/Categorize:** match to the real bank feed line on **USMCA FREIGHT** or **Relay Fuel Wallet** as appropriate — **live match**, not memo-only.
5. Reload → expense appears on load/settlement drill · register reconciles.

**L13512 specimen:** fuel line **$67.22** DEF (expense CSV) + full load fuel **$1,066.44** on AT Items Summary — match every USMCA fuel line on loads **13508–13556** as you build them.

**TRANSP rows in CSV:** report only — do not build TRANSP books.

### 3D. Bills — from settlements and vendor expenses

**When settlement / expense row is a vendor payable (not driver reimb only):**

1. Create **Bill** (or Bill from settlement poster when wired) with vendor from `mdata.vendors`.
2. Lines carry load link + GL expense account from category map.
3. **Bill payment** from correct bank (FREIGHT / Relay / **Faro 1296** for reserve-draw payments per owner).
4. **Bank match** the payment line — same session as expense match above.

**Settlement 5772 (CC-1):** USMCA portion only (loads **13512, 13513**) — earnings, reimb, deductions per AT Report 11–15 · post pay run · assert deduction leg + header back-link (`SETL-TRACE-07`).

### 3E. Dispatch loads (29 USMCA)

Book/load/deliver per crosswalk · real **AT#** on `live_load_number` (Cascade reverts placeholders — **#18546**) · then invoice from load.

---

## 4. Execution checklist (honest status)

| Work item | Repo / code | Live app (manual) |
|-----------|-------------|-------------------|
| Faro 1296 account + migration | ✅ `202613301500` + guard | ⚠️ Account exists · **$0** until funded through UI |
| FACT-PLEDGE-NET-CM (net after CM) | ✅ #18404 | ⚠️ Prove on 016 after CM applied |
| 016 $4200+$400CM+$3800 ruling | ✅ amendment + plan | ⚠️ INV-00082 @ $4200 · CM + factor pending |
| 33 invoice faces in Neon | ⚠️ ~31 active · 2 void lifecycle | ⚠️ Send/factor/fund not complete |
| 33 factoring purchases funded | ❌ | ❌ CC-1/CC-3/Codex/Devin-A manual |
| Proceeds on 1296 not 1090 | code ready | ❌ until fund step done in Chrome |
| Faro→FREIGHT transfers + match | spec in human replay step 9–10 | ❌ |
| USMCA diesel/expense bank match (55 rows) | CSV in repo | ❌ |
| Settlement bills + deduction leg | SETL-TRACE spec | ❌ |
| L13512 12-step chain | blockers filed (in_transit UI, deploy) | ⚠️ partial |
| Six tie-outs $0 | scripts exist | ❌ CC-2 OBSERVED FAIL until above |

---

## 5. Seat NOW (copy-paste)

### CC-1 (money · manual books owner)

```
CC-1 | ACK | MASTER-MANUAL-LIVE-BOOKS | GO

READ: docs/lockdown/GO-MASTER-MANUAL-LIVE-BOOKS-2026-08-31.md (this file)

ORDER:
1) L13512 12-step specimen (CC-1-HUMAN-SEQUENCE-REPLAY.txt) — when deploy allows #18535/#18548
2) 016: $4200 invoice → $400 CM unknown_pending_backup → factor $3800 → fund to 1296
3) Remaining Faro 33 in date order (your partition: 004 done path + settlements 5772)
4) Per USMCA row in CC-1-AUG-EXPENSES-DEDUCTIONS-BY-ENTITY.csv: expense/bill + BANK MATCH
5) Settlement 5772 USMCA portion → pay run → bills/payments matched

LAW: Live Chrome only · is_sample_data false · Faro face stays $95075
OUTBOX: CC-1 | LIVE-CHROME | <step> | healthz=<sha> | url=<full> | walkthrough=... | click=... | reload=PASS|BLOCKED | GO
```

### CC-3

```
CC-3 | ACK | MASTER-MANUAL-LIVE-BOOKS | GO
NOW: Faro inv 001–013 invoice-only (REV E) · then diesel/expense bank-match on your loads when linked
READ: GO-MASTER-MANUAL-LIVE-BOOKS-2026-08-31.md §3B §3C
FORBIDDEN: Book Load for outage inv 001–013 · SQL money writes
```

### Codex

```
Codex | ACK | MASTER-MANUAL-LIVE-BOOKS | GO
NOW: inv 014–024 + loads end-to-end · diesel/expense bank-match per CSV · bills from settlement lines
READ: GO-MASTER-MANUAL-LIVE-BOOKS-2026-08-31.md · FARO-PARTITION-REV-E
```

### Devin-A

```
Devin-A | ACK | MASTER-MANUAL-LIVE-BOOKS | GO
NOW: inv 025,027–036 + loads end-to-end · diesel/expense bank-match · bills
READ: GO-MASTER-MANUAL-LIVE-BOOKS-2026-08-31.md · FARO-PARTITION-REV-E
ALSO: UI walkthroughs per INBOX when P0 deploy lands
```

### Cascade

```
Cascade | ACK | MASTER-MANUAL-LIVE-BOOKS | GO
NOW: #18546 live_load_number reverts · deliver loads 13508–13520 · NO Faro invoice create
READ: GO-MASTER-MANUAL-LIVE-BOOKS-2026-08-31.md §3E
```

### CC-2

```
CC-2 | ACK | MASTER-MANUAL-LIVE-BOOKS | GO
NOW: Grade manual work — six tie-outs · 1296 wallet · reject API-only proof
EXPECTED: FAIL until CC-1/Codex/Devin-A complete §3B–3D in Chrome
016: grade $4200+$400CM+$3800 shape — NOT owner-gated
```

### Cursor

```
Cursor | ACK | MASTER-MANUAL-LIVE-BOOKS | GO
NOW: P0 typecheck · deploy · keep this file + INBOXes synced · Neon apply 202613301500 if missing
FORBIDDEN: per-merge deploy · recertify U14
```

---

## 6. Forbidden forever (this window)

- **Duplicate cohort:** amount+customer void/sweep · Send/Factor on any of 19 duplicate groups · void without document-proven replacement ID (`INVOICE-DUPLICATE-COHORT-FREEZE-2026-08-31.md`)
- Re-ask **4200 vs 3800** on 016 · shrink Faro expected to $91,275 · book $3,800-only invoice
- Bulk SQL / seed for August real books · API PATCH as “proof”
- Build TRANSP/TRK August books in TMS
- Two owners on one crosswalk row (REV D)
- Proceeds to **1090** instead of **1296**
- Idle / standing-by while manual rows above are ❌

---

**ACK line:** `SEAT | ACK | MASTER-MANUAL-LIVE-BOOKS | NOW=<section> | GO`
