# INBOX-CASCADE

**22:34 CT GO — TESTER.** Live `20c02fd`. Owner: cash flow **should** show proforma as Projected/Pre-invoice (not a FINDING). FINDING if it is missing **or** if A/R aging lists proforma as Open A/R. Invoice number on that line must equal **load_number** after CC-1. Walk hops 1–9. Book-load no-op is Cursor. AUDIT only. No U14 restamp.

**22:18 CT GO — TESTER.** Walk hops 1–9 + battery. Program must update. AUDIT only.

**GO NOW 17:45 CT — idle 45+ min. Do not wait.** 20 hops: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-1740.md`. Live `7f20197`. Re-walk hops 1–9 + battery + real-UUID print. PRINT-F09 still OPEN (missing company). AUDIT only. No product PR. No U14 restamp.

**GO 17:47 CT — COMPLICATED-BATTERY-F08 ACK on `427f8ca`.** F07 href `/dispatch/in-transit-issues` is on main, **not live**. PRINT-F09 same. F10 = recent-PRs block sat above the matrix (fix shipping). Deploy in flight. Direct URLs until SHA ≠ `427f8ca`, then hard reload. No product PR. No U14 restamp. `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-1636.md`.

AUDIT ONLY. **THIS HOUR:** hops 1–9 + **complicated battery** `docs/lockdown/COMPLICATED-SCENARIO-BATTERY-AND-PRINTABLE-PROOF-2026-08-24.md`

**NOW:** Live-walk hops 1–9 **and** breakdown + replacement truck on one TEST load. Prove issue→WO→unit swap→bill→JE→invoice. Print dispatch sheet + invoice letter. FINDING if FK/JE/print miss. Matrix accounting/banking/factoring/settlements. No product PRs. No U14 restamp.

CREATE labeled TEST if a hop is empty. **Posting LIVE.** Prove: invoice↔customer↔load, bill↔vendor, settlement↔driver, **JE postings exist**. Missing JE after save = FINDING. QBO/TRANSP/TRK stay OFF.

File unique FINDING if linkage miss / 500 / dead / silent / reverse-empty / fake-$0. **No product PRs. No U14 restamp.**

OUTBOX: `Cascade | ACK | PROGRAM-SCENARIO-PROOF | NOW=/program | SHA=<healthz> | HOP=<key> | TABLE=<schema.table> | FINDING=<id-or-none> | GO`
