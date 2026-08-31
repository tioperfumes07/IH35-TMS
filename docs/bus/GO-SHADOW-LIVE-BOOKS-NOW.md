# GO-SHADOW-LIVE-BOOKS-NOW — 2026-08-30 21:05 CT (Cursor lead)

**Owner ask (verbatim intent):** finish the work so modules actually operate · **upload invoices** · **upload settlements** · **dispatch** · **shadow the data Jorge uploaded** · stop seats doing nothing.

**This GO supersedes** “nine-only wait / keep polling / nothing in my lane.”  
Tie-out scripts still run **alongside** as grade — they are **not** a reason to skip Chrome.

---

## Locked (do not reopen)

| Law | Meaning |
|-----|---------|
| **U14 14/14 CERTIFIED** | Never recertify accounting/banking/settlements/factoring/dispatch/vendors/customers/drivers/fleet/lists/maintenance/safety/insurance/legal. |
| **USMCA only** | No TRANSP/TRK product work. No TMS→QBO write-back. |
| **Shadow = APP, not SQL** | `docs/lockdown/Coders-Faro/CC-1/CC-1-HUMAN-SEQUENCE-REPLAY.txt` RULES 1–5. Bulk SQL insert = **finding**, not progress. |
| **Face $95,075 frozen** | Faro 33 EXPECTED. 016 = `$4200` + CM `$400` `unknown_pending_backup` → factor `$3800`. |
| **Bill intercompany $7,241** | Not $8,890 (owner packet). |

---

## What “finish modules” means THIS SHIFT

Not stamp CERTIFIED again. Means:

1. **Prove the money path live** with Jorge’s August data (dispatch → invoice → factor → bank → settlement).
2. **Fix every blocker found in the UI** same turn (PR + FAST-MERGE).
3. **Leftover unique** 500 / dead / silent only — `docs/lockdown/POST-URGENT-14-MODULE-SEQUENCE-2026-08-23.md`.
4. Urgent-6 tie-outs = **honest grade of that live work**, not idle jobs.

Packet root (all CSVs live here — do not invent paths):

`docs/lockdown/Coders-Faro/`

---

## SEAT MATRIX — EVERYONE WORKS IN PARALLEL · IDLE = DEFECT

### CC-1 — MONEY · INVOICES · FACTORING · SETTLEMENTS (primary builder)

**Read first:** `CC-1/CC-1-HUMAN-SEQUENCE-REPLAY.txt` + `CC-1/CC-1-FARO.txt` + `CC-1/CC-1-USMCA-FARO-33-INVOICES.csv`

**NOW (same turn, in order):**

1. **Complete L13512 specimen end-to-end in Chrome** (12 steps in HUMAN-SEQUENCE-REPLAY). If step N breaks → OUTBOX FINDING + fix PR + continue. Do **not** stop the seat.
2. **016 shape:** invoice `$4200` → CM `$400` reason `unknown_pending_backup` → factor net `$3800`.
3. **Then date-order the rest of USMCA Faro 33** from `CC-1-USMCA-FARO-33-INVOICES.csv` — create/send/factor/fund **in the app**, one invoice at a time.
4. **Settlements:** after each load’s invoice path works, build **USMCA portion only** of mixed settlements from `CC-1-AUG-SETTLEMENTS-MIXED-BY-FACTOR.csv` + `CC-1-DRIVER-SETTLEMENTS.csv`. Settlement 5772 USMCA legs first (with L13512).
5. **JE-FUTURE:** execute lead decision already in prior INBOX (upper-bound going forward + sample-label TEST memos). Do not re-ask.
6. **Do not wait** on deploy/healthz. Do not wait on CC-2. FAC-VOID DONE.

**ACK line:** `CC-1 | ACK | SHADOW-LIVE | NOW=L13512-step-N | GO`

---

### Cascade — DISPATCH (loads from Jorge’s CSV)

**Read:** `CC-1/CC-1-AUG-LOADS-BY-FACTOR.csv` (60 loads) · filter `FACTOR_OWNER=USMCA` first.

**NOW:**

1. For each USMCA row: ensure load exists in app with real customer / W.O. / route / dates / miles — **Book Load UI**, not SQL.
2. Start with **13512** if missing/incomplete; then remaining USMCA Faro-backed loads in date order.
3. Assign driver + unit when CSV names them; mark delivered when dates say so.
4. Every UI blocker → FINDING on board + OUTBOX. Fill `scripts/tieout/dispatch-delivered-revenue.mjs` **same week** as grade (not instead of loads).

**ACK:** `Cascade | ACK | SHADOW-LIVE | NOW=load-NNNN | GO`

---

### CC-3 — VENDORS / CUSTOMERS / LISTS chrome that blocks CC-1

**NOW:**

1. Any picker / create / master-detail defect that blocks L13512 or Faro customers → fix now (VEND-CERT Built 7–11 continues).
2. Ensure Faro debtor customers from `CC-1-FARO-26-CUSTOMERS.csv` / name-match CSV are selectable on USMCA (no wrong twin).
3. Do **not** self-certify vendors early. Do **not** wait on healthz.

**ACK:** `CC-3 | ACK | SHADOW-LIVE | NOW=<blocker-or-VEND-7-11> | GO`

---

### CC-2 — GRADE / BIND / SHADOW VERIFY (never idle)

**NOW:**

1. **Shadow-verify** each CC-1 Chrome hop against Neon (invoice totals, Faro face, settlement lines, GL). Board OBSERVED.
2. Re-run FACT-TIEOUT after every advance land. EXPECTED face **9507500** frozen.
3. Fill **SETL** + **ACCT** tie-out scripts while waiting for next hop (parallel, not wait).
4. Bind `prod_verified` only with live proof. Never rubber-stamp VEND-CERT.

**ACK:** `CC-2 | ACK | SHADOW-LIVE | NOW=grade-<hop> | GO`

---

### Codex — BANKING shadow of factor proceeds

**NOW:**

1. When CC-1 funds an advance: prove cash in **Faro Factoring USMCA 1296**, transfer → FREIGHT, match — HUMAN-SEQUENCE steps 8–10.
2. BANK-TIEOUT honest FAIL stands. BANK-ECON/SURF stay FAIL until **real** recon — **never fabricate** statement balances.
3. Document operator packet needed; fix bank UI blockers that prevent shadow steps 8–10.

**ACK:** `Codex | ACK | SHADOW-LIVE | NOW=bank-step-8-10 | GO`

---

### Cursor (lead) — THIS FILE + merge + deploy

1. Keep every INBOX TOP = this GO. Close illegal guard/docs PRs.
2. Deploy 5–10 min / 5–10 PRs. Never leave CC-2 “waiting.”
3. If any seat OUTBOX says idle/wait → rewrite their INBOX same turn.

---

## Success metric (honest)

| Done when | Evidence |
|-----------|----------|
| L13512 12 steps green in app | Neon rows + JEs + OUTBOX |
| Faro 33 path advancing in Chrome | invoice count / advances growing |
| Settlements USMCA portions posting | settlement lines + GL |
| Dispatch USMCA loads present | mdata.loads vs AUG-LOADS CSV |
| Tie-outs | scripts FAIL/PASS honestly — never empty stub |

**Forbidden:** “waiting on CC-1” · “nothing in my lane” · bulk SQL shadow · recertify U14 · paint BANK-ECON PASS · shrink Faro EXPECTED.
