# FINAL PASTE → CC-1 · CONTINUOUS MODE

Canonical: `FINAL-ALL-CODERS-2026-08-12/00-README.md`

## Scope reminder
Every money surface in **every module** — including every modal / side panel / nested create that touches AP/AR/expense/bank/JE/liability — owes Wave C columns + QBO MoneyInput.

## NOW (non-stop)
1. `git fetch && git pull --ff-only origin main` (includes #6273 matrix inventory).
2. Wave C UNIVERSAL: `gl_je` · `ap_bill` · `expense` · `invoice` · `bank` · `liability` — **P10 then ALL modules**.
3. Class: raw money inputs → MoneyInput (ratcheting guard).
4. FAST-MERGE on green local gate; OUTBOX one line; immediately NEXT.
5. Never idle. Never ask Jorge to continue. Never invent load FKs.

OUTBOX shape: `CC-1 | column=<id> | Built=+N | PR# | NEXT=<id>`
