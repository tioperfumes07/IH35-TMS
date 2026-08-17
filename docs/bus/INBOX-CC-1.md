# INBOX-CC-1 · SYNC 2026-08-16 20:48 CT · WAVE-LIVE-MONEY-1 (ASSIGNED — DO NOT IDLE)

Chrome **9222** · USMCA · `app.ih35dispatch.com` · entity **USMCA Freight**.

## WHY YOU WERE IDLE (lead defect — fixed this sync)
Your OUTBOX said `NEXT=awaiting next FO` after 10 money surfaces PASS. Lead failed to push the next wave. **You are assigned now.** Do not wait for chat.

## OWNER ORDER (2026-08-16)
Live VERIFY seats = **Cursor + CC-1 + Codex only**. Cascade is **OFF** Live VERIFY (merger/poll only).

## BOX 4 TRUTH (live matrix @ tip `5cea89a` — measured)
| Module | Box 4 Live% | Your job |
|--------|-------------|----------|
| **accounting** | **0%** | PRIMARY — move this first |
| **banking** | **0%** | PRIMARY after accounting wave A |
| **factoring** | **0%** | PRIMARY after banking wave B |
| settlements | ~10% | continue after factoring |

**OUTBOX LIVE PASS alone does NOT move Box 4.** Matrix Live only greens when `docs/audit/AUDIT-COVERAGE-LIVE.md` has a **PROD-VERIFIED** row that **explicitly names** leaf ids (`Leaves: \`bills.list\``) + column keywords (VERIFY-1/3/4 · vendor · bill · journal · reverse · route).

## WAVE-LIVE-MONEY-1A · ACCOUNTING (start NOW)
1. OUTBOX claim: `LIVE CLAIM accounting · WAVE-LIVE-MONEY-1A`
2. Live walk USMCA (no money mutation unless flags ON + owner said turn on):
   - `/accounting` → leaf `home`
   - `/accounting/bills` → `bills.list` + `chrome.toolbar_search|range|gear|filter` (Search/Range/⚙/Filters)
   - open one bill detail → `bills.detail`
   - `/accounting/expenses/list` → `expenses.list`
   - `/accounting/invoices` → `invoices.list`
   - `/accounting/bill-payments` → `bill_payments.list`
   - JE / CoA hop if mounted → name exact leaf ids from `docs/specs/scoreboard/modules/accounting.required.json`
3. Neon (prod `br-fancy-credit-akjnd07a`, lucia): re-prove bill→`posting_batches` posted + balanced JE (cite bill uuid + batch uuid). Known posted: bill `996907d6-…` batch `a480daf9-…`; bill `62fbc5ec-…` batch `b2f4f4b0-…`.
4. **APPEND** one or more ledger rows (next nums after max on main) — Auditor=`CC-1`:
   - Verdict starts with `PROD-VERIFIED`
   - Evidence MUST include: `Leaves: \`bills.list\` · \`bills.detail\` · \`expenses.list\` · \`chrome.toolbar_search\` · …` (backticks)
   - Include: VERIFY-1 · VERIFY-3 · VERIFY-4 · vendor · bill · journal/posting · reverse · route `/accounting/bills` · healthz sha · LIVE 2026-08-16
5. Same PR: `node scripts/audit-coverage-scoreboard.mjs --write` · Claude-green body · FAST-MERGE
6. OUTBOX: `LIVE PASS accounting · Box4 was 0% · ledger #N–#M · next WAVE-LIVE-MONEY-1B banking`

## WAVE-LIVE-MONEY-1B · BANKING (immediately after 1A merges)
Leaves from `banking.required.json`: `accounts` · `transactions.list` · `transactions.categorize` · `reconciliation` · `chrome.toolbar_*` on `/banking/cash-gl-setup` · `statement_import` · `settings` · `driver_escrow` · `factoring` banking hop.
Same PROD-VERIFIED + explicit Leaves rule. Move banking off **0%**.

## WAVE-LIVE-MONEY-1C · FACTORING (after 1B)
Leaves: `home.summary` · `home.reserve_tracker` · `home.recourse_pipeline` · `submit.queue` · `chrome.toolbar_*` · `accounting.list` under factoring. Move factoring off **0%**.

## RULES
- 0 open PRs = defect. Always have next leaf claim in OUTBOX.
- FO / FE FAIL → HANDOFF=Cursor + board same turn.
- Do **not** invent GL math. Reuse poster. Flags stay OFF until owner says turn on.
- FAST-MERGE-4MIN after gate PASS.

Law: partition `docs/bus/LIVE-CHROME-MODULE-PARTITION.md` · matrix Live matcher requires explicit leaf ids.

CLAIM NEXT SCHEMA/RLS HANDOFF: `LV-INVENTORY-PARTS-DEACTIVATED-VENDOR-HISTORICAL-LABEL` — production part `780c71a9-3469-4b8a-b6eb-6958f7a6c4ae` retains same-USMCA vendor FK `2cbaf657-6aa1-4f6b-a54b-c1863e05162a`, but vendor deactivation plus `vendors_select` RLS erases its human label in `/inventory`. Preserve active-only pickers; add scoped historical-reference resolution/tombstone semantics across the bounded class. Board + audit row 953 contain exact proof and acceptance. OWNER-GATED=no.
