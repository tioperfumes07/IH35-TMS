# Cursor · ROUND 292 ACK — 285.4.9 CLOSED · Chrome path = load 13615

## ACK (AlwaysTrack = source of truth)

Owner AlwaysTrack "1–16" Dispatched list is law. Live USMCA `status='dispatched'` returns exactly:

`13624 13625 13626 13627 13628 13629 13630 13631 13632 13633 13634 13635 13636 13637 13638 13639`

`verify-load-boards-agree` PASS — List/Kanban/Round Trips/Trip Pairing/Truck Line = **dispatch-work 16**; Load Costs = accounting 14.

Cursor already shipped defect (1) `views.live_loads` bills-require-closed: `#23312` `da0e34f2c2` / migrate `202614661200`. Defects (2)(3)(4) were Lead/CC; (5) data status corrected on prod by Lead.

**Do NOT** rewire Truck Line onto `views.live_loads` alone — view still has 15 (`13625`/`13626` excluded by invoice half while status stays `dispatched` per AT). Dispatch-work predicate is the AT-aligned board set.

## 285.4.9 remainder — CODE CLOSED on tip (re-proved 2026-09-30)

| Item | Tip proof |
|---|---|
| #31 v10 PDFs | `c57f610b4b` · `verify-company-settlement-pdf-house-template` OK |
| #58 downtime/fuel/3-margins | `company-settlement-report.service.ts` ROUND 285.4.9 blocks live |
| #59 METHOD | `39eff3b07f` · Neon `approval_method` text live · **0** USMCA `detention_requests` → Print Chrome still waits a real approve |
| #32 draft/unposted expense flag | `26ebb53419` · `verify-ldt-5-presettlement-readout` PASS · banners `settlement-unposted-draft-expense-flag` |
| #33 idle review | `da88a8338d` · Maint KPI `idle-events-needs-review` · live NULL `idle_source` count = 42 |

## 285.4.10 / Chrome BOL→invoice→Faro

- FE LIVE `version.json=93c84ac` · bundle contains `awaiting-bol-invoice`
- Live awaiting-BOL queue after AT status fix: **1** load — **13615** (`completed_docs_received`, has_invoice=true, Semares Forwarding Services)
- 13625/13626 no longer in queue (now `dispatched` per AT)

**Chrome (owner only — no seat fixtures):** open Documents › Awaiting BOL → 13615 → upload real BOL on load Documents → prove invoice send + Faro queue (screenshots + live row). Seat cannot invent a BOL or POST Book Load.

## STOP — baseline raises

Round 292: do not raise baselines to "fix" reds. Diesel ceiling 190→193 was in `#23312` after live measure (193/193 fuel-sourced, doubled twin 0) — same raise precedent as 2026-09-25; not a palette raise. No further ceiling bumps from Cursor this round.

## NEXT

1. Owner Chrome 13615 BOL→invoice→Faro
2. METHOD Print when a real detention approve stamps `approval_method`
3. Cursor overflow only on Cursor-lane defects — never another seat's AUTH / closure gate
