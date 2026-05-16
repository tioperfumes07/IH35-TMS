# Approved screen mockups (canonical UI)

**Source:** Claude project knowledge (UI walkthrough), **approved 2026-05-02**.

**Locked by:** Cursor R2 (APPROVED-SCREEN LAW) in `docs/specs/CURSOR-PERMANENT-RULES.md`, and IH35-TMS master rules §F invariant **#19** (approved navigation / chrome parity).

## Inventory: **21** PNG files

The folder now includes:
- **11 canonical approved mockup PNGs** (the baseline set listed below)
- **10 QBO reference PNGs** (`qbo-*.png`) used for accounting workflow parity checks

Cursor R2 historically referenced “12 PNG mockups.” The twelfth asset, **App_Design.png** for the **driver PWA**, was never finalized as a separate PNG. Driver PWA chrome and dark-theme behavior are defined in **Part 6** of `docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md` (design system) and related PWA specs—not in this folder.

## Expected filenames (normalize on commit)

Place binary files here **exactly** as named (no content changes in Git—store originals as approved):

| # | Filename |
|---|----------|
| 1 | `1-HOME_PAGE.png` |
| 2 | `2-Maintenance.png` |
| 3 | `3-Accounting-Dropdown.png` |
| 4 | `4-Banking_Homepage.png` |
| 5 | `5-Fuel_Planner.png` |
| 6 | `6-Safety.png` |
| 7 | `7-Drivers.png` |
| 8 | `8-Dispatch-Home.png` |
| 9 | `9-Lists_and_catalogs.png` |
| 10 | `10-Reports.png` |
| 11 | `11-Form_425-Design.png` |

If upstream filenames omit dashes (e.g. `1HOME_PAGE.png`), **rename only** to match this table when adding to the repo—do not edit pixels.

## Governance

- **Updates** to any file in this directory require **explicit Jorge approval** per Cursor R2.
- **CI:** `npm run verify:arch-design` validates module/tab structure; future visual diff gates may reference these assets once all eleven binaries are present.
- **Checksums:** `MANIFEST.txt` includes per-file SHA256 rows (`shasum -a 256`) for tamper detection once binaries are present.

## Canonical copies

Eleven binaries live in this folder with the filenames in the table above. Provenance: the same bytes were first stored under `docs/design/approved-screens/` with sequential filenames; this directory is the Cursor R2 canonical path and names only (no pixel edits on copy).
