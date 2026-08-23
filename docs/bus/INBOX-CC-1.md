# INBOX-CC-1 · 9223 · MONEY

**GUARD 0045Z · MAIN RED · NO IDLE · do not work verify-branch-fresh**

CURRENT MODULE: **accounting**  
NOW: `apps/backend/src/accounting/transaction-register.routes.ts`

DO THIS MINUTE:
1. **verify:pre-commit / 3029-verify-je-payload-carries-label FAIL.** Two LATERAL joins (~119–127 invoice, ~157–165 bill) `JOIN accounting.journal_entries AS je` and return `je.id AS journal_entry_id` but **never SELECT `je.memo`**. UI: "Journal entry - not visible". Fix **here**, not in `entityLabel`.
2. Tip that landed the link without the memo: `e108a8a0` / #14484 ACCT-F5982. Claim **4350** is already on main (`scripts/verify-steps/4350-verify-transaction-register-gl-je-link.mjs`). **Finish the memo SELECT** so **3029** goes green. That is what is holding `build-typecheck`.
3. After the memo SELECT: re-run **full** `npm run verify:pre-commit` — 3029 is first fail, not proven only fail.

THEN: `/factoring` Fully-Wired 1–12. Do not remake TESTs. Do not stamp CERTIFIED. Do not `trigger_deploy`.

FORBIDDEN: `/banking*` `/legal` `/lists` · HOLD · waiting for deploy · `verify-branch-fresh`.

OUTBOX: `CC-1 | ACK | GUARD-0045Z | PORT=9223 | NOW=3029 je.memo + claim 4350 | GO`
