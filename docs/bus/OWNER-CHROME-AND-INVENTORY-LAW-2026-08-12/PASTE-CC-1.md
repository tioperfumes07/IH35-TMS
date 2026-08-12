# PASTE → CC-1 · READ FIRST · THEN BUILD

**Owner 2026-08-12:** Instructions first. Chrome + inventory law = `OWNER-CHROME-AND-INVENTORY-LAW-2026-08-12/00-README.md`.

## Your lane NOW
1. Pull `origin/main` (inventory PR when merged).
2. **Money chrome class:** every economics field uses QBO-format numbers via shared `MoneyInput` (no raw `<input type=number>` / ad-hoc money).
3. Wave C columns still: `gl_je` · `ap_bill` · `expense` · **`invoice`** · **`bank`** · `liability` — P10 then all.
4. New matrix leaves that are Bill/Expense/Payment/Invoice modals owe money columns — wire honestly; Built only with guard.
5. OUTBOX one-liner: `column=<id>|chrome=MoneyInput | Built=+N | NEXT=…`

## Forbidden
Leave seats without reading this paste. Patch one screen only. Invent load FKs. Mark Live.

## Proof
Guard must FAIL on raw money input and PASS on MoneyInput (extend existing money-input ratchet if needed).
