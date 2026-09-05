# ★ DEVIN (non-A)

**22:43Z — LEAD. Shared with Cascade — ONE item, one PR between you:**

## CASCADE / DEVIN — item LST-DUP · duplicate master-records report (Lists/Reports)
- **Measured (READ-FIRST §6, live 09-03; CC-3 today):** `mdata.drivers` 264 rows with duplicates ANGEL ALFONSO SOSA ×3, Raul Esmeregildo Perez ×3, Armando Perez ×3, Ruben Pedro Perez Garcia ×2; CC-3 22:2xZ: Hugo Gaytan and Genaro Guerrero duplicated with one open/unposted settlement and no vendor on the shadow row. No screen lists duplicates today.
- **Required value:** `GET /api/v1/reports/duplicate-masters?entity=drivers|customers|vendors` — groups by normalized name (upper, accents stripped, whitespace collapsed) + secondary key (license no. / MC# / EIN when present), returns group, row ids, which row has money (bills, settlements, invoices, vendor rows), which is newest. Report page under `pages/reports/DuplicateMastersReport.tsx` with entity switch, CSV + Print (your existing parity), row click → the record. Read-only; merging/voiding is NOT in this item.
- **Guard:** `scripts/verify-duplicate-masters-report.mjs` — live: drivers report returns ≥ 4 groups today (the four named + Gaytan/Guerrero); `--selftest` plants a case-sensitive grouping bug and must fail.
- **Linkage:** mdata.drivers / customers / vendors ↔ driver_finance.driver_bills ↔ accounting.invoices/bills.
- **One PR.** **Deadline 01:00Z.** **Surrender:** Codex.

---
Lead audits each DONE line on Neon + tip + live within 30 minutes; ✔/✗ posted on OUTBOX-<SEAT>. A PR outside your item is closed unmerged.

---

Redirect → **INBOX-DEVIN-A.md**. Retired. NEVER POST Book Load.
