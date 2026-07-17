# XLSX upload hardening (0243-h2-1 / coder-work-order-t2-3-xlsx-cve)

**Date:** 2026-07-17  
**Status:** implemented on upload/parse paths; residual documented below

## Problem

`xlsx` (SheetJS community) `0.18.5` has known prototype-pollution and ReDoS issues on
**read/parse** of attacker-controlled workbooks. There is no clean patched npm release
in the `0.18.x` line. Upload surfaces that called `XLSX.read` on user files were the
reachable CVE surface:

- `apps/backend/src/fuel/loves-upload.routes.ts`
- `apps/backend/src/fuel/fuel-transaction-import.routes.ts`
- `apps/backend/src/catalogs/excel-uploader.ts`

## Fix

1. **Parse path** — untrusted uploads go through `apps/backend/src/lib/safe-spreadsheet-parse.ts`:
   - magic-byte gate (ZIP/`PK` for `.xlsx`; text/no-NUL for `.csv`; reject legacy `.xls`)
   - parse with **exceljs** `4.4.0` (already in tree; MIT; used on frontend exports)
2. **CI guard** — `scripts/verify-xlsx-upload-hardened.mjs` fails if those upload paths
   reintroduce `from "xlsx"` / `XLSX.read` without the safe helper.
3. **Capability** — Love's price upload, fuel-card import, and catalog Excel import remain;
   legacy `.xls` is explicitly rejected (UI already advertises `.xlsx`/`.csv`).

## Residual risk (honest)

`xlsx@^0.18.5` remains a **runtime dependency** for **trusted WRITE/export** only
(statement exports, maintenance report export, telematics export, QBO forensic report,
scheduled-report file builder, program-board sync). Those paths build workbooks from
server-side data and do not call `XLSX.read` on user uploads.

That residual is **not** a clean CVE closure for the package itself — it is a **scoped
reduction of attack surface**. Full removal of `xlsx` (migrate all writers to exceljs)
is a follow-up; not required to close the upload CVE path.

## Guard

`npm run verify:xlsx-upload-hardened` (+ `--selftest`), wired in `package.json` and
`.github/workflows/locked-guards.yml`.
