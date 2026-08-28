# CLAUDE — YOU ARE LEAD (owner 2026-08-28 ~01:23 CT)

**`LEAD-SEAT.md` = `SEAT=CC-1`.** Jorge said Cursor is **not** lead coder. You own census, INBOX rewrites, verification of other seats’ claims, and money NOW. Cursor is **worker + deploy lieutenant only**.

Jorge is not the messenger. Do not wait for Cursor to “catch up.” Do not wait for Jorge to type continue.

Canonical: this file · `docs/bus/LEAD-CONTRACT.md` · FAST-MERGE `docs/bus/FAST-MERGE-4MIN-LAW.md` · NOW `docs/bus/NOW-ONE-SOURCE.md`

---

## 0. First 10 minutes (every Claude-lead session)

```
NEW SESSION · Claude is LEAD (LEAD-SEAT=CC-1) · Cursor is worker + deploy lieutenant
CURRENT-LAW
- USMCA only · no TRANSP/TRK · no TMS→QBO write-back
- U14 14/14 CERTIFIED — never restamp
- CREATE-TEST-THEN-VOID · empty TMS expected · KEEP TEST until launch
- FAST-MERGE ~4 min · never gh pr checks --watch · deploy 5–10 min AND 5–10 PRs · one in-flight · CC never trigger_deploy
- Scoreboard: C25 C26 C27 C28 C29 C30 C31 are **seven columns**. Never collapse them into one “13 GL Δ” strip.
```

Then:

1. `git fetch origin` in **your money clone**.
2. Confirm `LEAD-SEAT.md` is `CC-1`. If it says `CURSOR`, you are **not** lead — money only.
3. Read `NOW-ONE-SOURCE.md` TOP + **every** `INBOX-*.md` TOP + **every** `OUTBOX-*.md` first 20 lines.
4. Rewrite `docs/bus/LEAD-CENSUS.md` this turn. Idle = no **self-ACK** of the current GO.
5. ACK first line of `OUTBOX-CC-1.md`:  
   `CC-1 | ACK | LEAD | PORT=9223 | GO=<current> | CENSUS=LEAD-CENSUS.md | NOW=<money hop> | SHA=<healthz> | GO`
6. **Query-back** is part of lead: do not accept a seat’s “✓ sweep” without Neon (or code+Neon) of the **rows they created**. That is how Cursor failed as orchestra.

Live SHA as of this packet: `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → last Cursor read **`ebc1c4f`**. Re-read yourself before you claim it.

---

## 1. Your job as lead

| You do every turn | You never |
|-------------------|-----------|
| Census all seats from **their** OUTBOX self-ACK | Say done / fully wired / launch-ready / CERTIFIED without healthz `version` + URL + click in the **same** message |
| Rewrite **other seats’ INBOX TOP** when stale | Recertify U14 |
| Re-run Neon (lucia in-txn) on claims other seats file — especially Devin | Treat Devin/CC-3/Cursor OUTBOX as ledger truth |
| Keep GO packets in `docs/lockdown/PASTE-ALL-SEATS-GO-*.md` | Steal Codex/CC-2/CC-3/Cursor NOW |
| File **one board row per FINDING id** (never a consolidated junk row) | Write a new always-apply rule instead of a census |
| FAST-MERGE **your** money PRs | `trigger_deploy` (Cursor only, when you say the 5–10 gate) |
| Order Cursor to deploy when 5–10 min **and** 5–10 PRs, one in-flight | Collapse C25–C31 into one scoreboard strip |

**Honesty:** Cursor failed as lead by pinging instead of verifying, consolidating columns, and not query-backing other seats. You fail the same way if you skip §0 or rubber-stamp Devin’s eight-finding table.

---

## 2. Seat NOW (rewrite INBOX if stale — do not steal)

| Seat | Port | Lane | NOW |
|------|------|------|-----|
| **CC-1 (you)** | 9223 | Lead + money | **(1)** Option B Event 2 (POD off Event 2 only). **(2)** `SEED-HOLD-SAMPLE-FILTER-AGING-BALANCES` — AP/AR aging, vendor balances, collections exclude `is_sample_data`. **(3)** `VEND-F-POSTERS-BYPASS-ROLE-RESOLVER` — JE `e12d04d9-4f17-425a-86ec-79eced789ad4` still **CR 1090 Undeposited Funds** $150 (Cursor Neon 2026-08-28). **(4)** Fail-closed: no success into USMCA **9000 Ask My Accountant**. **(5)** `VEND-F-TEST-DATA-NOT-FLAGGED-SAMPLE` + inherit `is_sample_data`. No 1099. No new A/R poster. Never `/425c`. Never `trigger_deploy`. |
| **CC-2** | 9224 | Detectors | INV-3 detector **and** 9000 suspense detector (balance ≠ 0 → finding, no human close). Never GL math. |
| **CC-3** | 9225 | FE | `VEND-F-VENDORDETAIL-PAYMENT-NEVER-SENDS-BANK-ACCOUNT` (`VendorDetail.tsx` `recordVendorBillPayment` body has **no** `from_bank_account_id` — Cursor code-read). Then `VEND-F-AUDIT-HISTORY-TAB-ALWAYS-EMPTY`, silent bill-GL UI, vendor create NULL/asset default expense. Factoring: `factor_id` NOT NULL at submit + reverse invoice pledge. **No GL math.** KEEP batch `583d6d03`. |
| **Codex** | 9226 | FE | `/customers` leftover or steal after `STEAL-CLAIMS.json`. Query-back. |
| **Cascade** | audit | FINDING | Latch SQL + `/fuel`. FORBIDDEN NEXT=poll. Unique FINDING only. |
| **Devin** | audit | FINDING | `/vendors` **NOT COMPLETE**. Do not wait for Jorge. Query-back every TEST row. Unique leftover only. Auto-mode pause is a Devin product issue — INBOX must be one atomic NOW. |
| **Devin-A** | audit | FINDING | Book Load KEEP. Query-back load + invoice. |
| **Cursor** | 9222 | Worker | Screens/janitor. FAST-MERGE **Cursor-lane only**. **Only** Cursor `trigger_deploy` when **you** say the gate. Do not rewrite other INBOXes unless your OUTBOX says INBOX FIXED. Do not say “I am lead.” Do not recertify U14. |

Skip **#15546**. Nobody second-kicks Render.

---

## 3. Cursor as lieutenant (keep this on INBOX-CURSOR TOP)

```
Claude is LEAD (LEAD-SEAT=CC-1). You are NOT lead.
WORKER: screens/janitor/overflow in Cursor lane only.
FAST-MERGE your PRs (gate PASS → squash). Never gh pr checks --watch.
DEPLOY: only you trigger_deploy, only when Claude’s census says gate (5–10 min AND 5–10 PRs), one in-flight.
Do not steal money. Do not recertify U14.
Scoreboard: keep C25–C31 as seven columns. Do not add a consolidated fw13 strip.
```

---

## 4. Scoreboard (owner 2026-08-28)

**Individual columns only.** C25 `gl_delta` · C26 `subledger_tie` · C27 `lifecycle_complete` · C28 `reversal_symmetry` · C29 `period_guard` · C30 `entity_isolation` · C31 `non_empty_proof`.

A single “13 GL Δ” / `fw13_gl_delta` Fully-Wired strip **loses** C26–C31. Forbidden. Group `economics` must appear in the matrix column sort (`GROUP_ORDER`). No 5th Verified Box.

---

## 5. Query-back (loop complete)

After any create/submit/post, the seat queries **every row it wrote** and reports ledger fields: accounts, signs, `factor_id`, reverse FKs, `is_sample_data`, `display_id`. UI toast is not proof. Law: `docs/lockdown/FINDING-SOURCE-OF-TRUTH-BLOCK-LAW-2026-08-28.md`. Map: `docs/specs/SOURCE-OF-TRUTH-MAP.md`. Roles live in `accounting.chart_of_accounts_roles` — **not** empty `catalogs.account_role_bindings`.

---

## 6. Devin `/vendors` on `ebc1c4f` — file as **eight rows**, not one sweep

Devin verdict (accepted as **his** status, not launch-safe): NOT COMPLETE · LAUNCH-SAFE=NO.

Cursor independently confirmed **this turn**:

| Id | Cursor proof |
|----|----------------|
| `VEND-F-POSTERS-BYPASS-ROLE-RESOLVER` | Neon: JE `e12d04d9-4f17-425a-86ec-79eced789ad4` DR 2000 $150 / **CR 1090** $150 |
| `VEND-F-VENDORDETAIL-PAYMENT-NEVER-SENDS-BANK-ACCOUNT` | `VendorDetail.tsx` ~327–336 + `api/vendors.ts` `recordVendorBillPayment` body — no bank id |
| `VEND-F-AUDIT-HISTORY-TAB-ALWAYS-EMPTY` | `audit-events-list.routes.ts` filters `payload->>'entity_type'`; tab passes `entityType="vendor"`; CRUD uses `resource_type` |

**You (Claude) must still query-back** findings 3, 5, 6, 7, 8 before you widen them. Do not rubber-stamp Devin’s “all CRUD ✓” as economics PASS.

KEEP TEST vendors. No 1099 (E1). Seed HOLD until aging/balances sample filter.

---

## 7. Also OPEN (do not drop)

- FACT-F1–F4 on batch `583d6d03` / invoice `6708d422` (KEEP).
- ACCT-F-9000 USMCA 9000 — Cursor Neon: **22 lines, $2,410.00** (Claude’s $2,260/21 was stale).
- BILL-2026-00016 asset debit: **poster fallback RETRACTED**; line had explicit `account_id`. Separate: 138/142 USMCA vendors `default_expense_account_id` NULL.
- INV-F-DISPLAYID: **not a defect** — `from-load.ts` owner 2026-08-24 load_number = invoice display_id.
- Option B Event 2 still first for pledged invoices with $0 A/R.

---

## 8. FAST-MERGE (you and Cursor)

1. Local gate PASS.
2. Push. ENV `verify-static` / no local PG only: `--no-verify` **after** gate PASS.
3. `gh pr create` — never `gh pr checks --watch`.
4. Squash via `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`

---

## 9. Do not flip lead back

Stay `SEAT=CC-1` until Jorge writes that Cursor is lead again. Cursor must not run `activate-claude-lead` to undo.
