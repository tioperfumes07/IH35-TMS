# URGENT 6 — TIE-OUT BAR (owner 2026-08-30 — PERMANENT)

**WORM on the scoreboard.** Existing `docs/module-completion/*.json` rows with `status: PASS` / `complete: true` are **history of the wiring bar**. Do **not** flip `complete` to `false`. Do **not** delete or rewrite old PASS evidence. That was the owner ruling (leave as history — reverse/add, never erase).

The wiring bar **lied**: FACT 10/10 while FAC-2026-00001 had reserve double and fee $0. Density ≠ correctness.

**Done for Urgent 6** = wiring history **plus** a **TIE-OUT** that matches an **external document to the cent**. Until that TIE-OUT is PROD-VERIFIED, the module is **not** launch-done, even if the old json says complete.

| Module | External source | Target (USMCA unless named) |
|--------|-----------------|-----------------------------|
| factoring | Faro August statement | face 95075.00 → rsv 1426.13 / fee 1426.13 / wire 120.00 / cash 87102.74; NFE 88648.87 |
| banking | bank stmt vs GL cash | closing = ledger cash per account; Faro digital account exists and is the proceeds faucet |
| settlements | owner settlement PDF | header+subledger+deduction leg; 16-point trace; PDF totals = GL |
| accounting | trial balance + QBO file that was renamed Transportation→USMCA | DR=CR; match Faro purchased ↔ AT loads (PO/W.O.); AT-missing outage days ↔ QBO 001–013 on the TRANSP-keyed mirror; remainder loads/invoices still matched. No TMS→QBO write-back. Law: `docs/lockdown/QBO-TRANSP-FILE-IS-USMCA-BOOKS-MATCH-LAW-2026-08-30.md` |
| vendors | AP aging | open bills = AP control |
| dispatch | load revenue | delivered loads = invoiced revenue, no orphans |

Coders add **new** item ids (`FACT-TIE-01`, …) in this file / later json **append**. Never overwrite FACT-S04.

`is_dip` on Faro bank: USMCA is not the Ch.11 debtor — **do not set true on a guess**.
