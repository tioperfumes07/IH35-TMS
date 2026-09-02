# GO-2139 · 2026-08-27 CT · USMCA LEDGER + INSTRUMENT

**Operating company = USMCA only.** TRANSP is not operating (~10–20 txns/mo, historical). TRK leases equipment; books stay in QBO. Do not certify from TRANSP/TRK.

**CC-1 NOW (serial money, do not void INV-37/38/44/45):**
1. Restore billing leg Event 2 `DR 1100 / CR 1150` on invoiced loads (missing on INV-2026-00037/00038/00044/00045). Cash already posted on 37/44/45 — do not double-cash.
2. Void of an invoice MUST reverse the Event-2 A/R leg ($9,995.50 stranded: INV-00006/00019/00023). INV-00021 $0 same load as 00023 is a query twin, not a fourth JE.
3. Unapplied payment must not credit A/R control (USMCA PMT-00006 $500 + PMT-00007 $1,200 = $1,700). Then dated correcting entry. INV-3 must read $0.00.
4. Dedup `chart_of_accounts_roles` then UNIQUE `(operating_company_id, role)`. Do not “activate” roles that already have an active twin.
5. Register 10 `integration='ledger'` detectors on `_system.reconciliation_findings`. Cron `ledger.integrity_cron` hourly. **No human close** — `resolved_at` only when drift is $0. Reuse `scripts/verify-gl-invariants.sql`. USMCA-scope INV-14.

**Cursor this PR:** C25–C31 + SQL pack + exclude `is_sample_data` from TB/P&L/BS/CF/register. Keep TEST rows. Branch protection = Jorge GitHub (this week, before A/R merge). I cannot enable it from this seat if 404.

**Do not:** recertify U14 · inherit TRANSP · TMS→QBO write-back · recommend a CPA (`OPERATING-FACT-no-CPA-owner-decides`) · 1099/fleet/factoring as USMCA FAILs (already decided in questionnaire).
