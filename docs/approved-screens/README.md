# Approved screen mockups (canonical UI)

**Source:** Claude project knowledge (UI walkthrough), **approved 2026-05-02**.

**Locked by:** Cursor R2 (APPROVED-SCREEN LAW) in `docs/specs/CURSOR-PERMANENT-RULES.md`, and IH35-TMS master rules §F invariant **#19** (approved navigation / chrome parity).

## Inventory: **11** PNG files (not 12)

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

## Repository status

Until the eleven binaries are added from project storage, this folder carries **documentation + manifest only**. After PNGs are committed, delete or trim the “Repository status” note in a follow-up commit.
