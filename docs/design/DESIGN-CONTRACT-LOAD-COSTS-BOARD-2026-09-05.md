# DESIGN CONTRACT — LOAD COSTS BOARD (and every wide money table after it)
**Owner 2026-09-05 03:05Z, verbatim:** "Why is it so hard to get the specs and instructions to have coders make all column outlines like this, these types of shade, etc."
**Root cause, owned by the lead:** the approved render has existed since 09-04 22:48 with its exact CSS inside it, and every instruction since described it in prose ("light bg, darker border, tint runs full height") instead of handing over the file and the values. Prose gets re-interpreted; a stylesheet does not. This contract ends that: the reference file is in the repo, the values below are law, and a computed-style guard measures the live page against them.

**Reference file (pixel truth):** `docs/design/reference/LOAD-COSTS-BOARD-REFERENCE-2026-09-04.html` — open it in a browser; that is what the owner approved. Copy its CSS; do not re-derive it.

## THE VALUES (from the reference `<style>`; these are the numbers the guard asserts)
| Element | Property | Value |
|---|---|---|
| tokens | `--th-bg` `--th-ink` `--grp-bg` | `#EEF2F6` `#1F2937` `#E4EAF1` |
| tokens | `--line` (body rules) `--line2` (header rules) | `#D8DEE6` `#C7D2DC` |
| tokens | `--kpi-bg` `--kpi-bd` | `#F4F7FA` `#C7D2DC` |
| tokens | group tints odd/even | rev `#EEF4FA`/`#E4EDF6` · cost `#FDF6F3`/`#F8EDE8` · pay `#F4F1FA`/`#EDE7F5` · gross `#EDF1F5`/`#E6EBF1` |
| table | layout | `border-collapse:separate; border-spacing:0; min-width:1660px; width:100%` inside `overflow-x:auto` — columns size to content, NEVER equal-split, NEVER `table-layout:fixed` |
| group row `th` | | bg `--grp-bg`, color `#6B7280`, 10px, **700**, uppercase, letter-spacing .9px, height 24px, center, border-right 1px `--line2`, border-bottom 1px `--line2` |
| header row `th` | | bg `--th-bg`, color `--th-ink`, 11px, **700**, uppercase, letter-spacing .4px, height 30px, padding 0 9px, center, `white-space:nowrap`, border-right 1px `--line2`, border-bottom 2px `--line2`, `position:sticky; top:0` |
| body `td` | | padding 6px 9px, **border-right 1px `--line`**, border-bottom 1px `--line`, `white-space:nowrap` |
| zebra | | `tbody tr:nth-child(even) td` bg `#FAFBFC`; hover `#F1F5F9` |
| group tint | | class per column group on EVERY body td (`.b-rev/.b-cost/.b-pay`), even-row variants above; Gross `.tot-c` `#EDF1F5` bold |
| numbers | | right-aligned, `font-variant-numeric:tabular-nums`; rates `0.0000`; money `1,234.56`; dash `—` color `#B6BDC7` never `0` |
| totals row | | 700, bg `#E4EAF1`, border-top 2px `--line2` |
| status pill | | 10px 700 uppercase, radius 9px; on-time `#F0FDF4/#166534/#86EFAC`; late `#FEF2F2/#991B1B/#FCA5A5` |
| KPI tile | | bg `--kpi-bg`, border 1px `--kpi-bd`, radius 2px, height 93px, centered; label 10px/700/uppercase `#6B7280`; value 19px/700 tabular |
| chips / pills | | radius 2px, height 22px, border 1px `--line2`; active `#14314F` white |
| tabs row | | 12px, padding 9px 13px, active 600 + 2px bottom `#14314F`; count badge 10px in `--th-bg` |

**Correction to an earlier reading:** the owner's 09-04 words were "regular COLOR text" — dark ink instead of white on navy — not "regular weight". The approved reference uses **700** on both header rows. 700 stands. Cursor's global 400 change (#20390-era) is reverted on data tables to match the reference.

## THE GUARD — `scripts/verify-table-design-contract.mjs` (Playwright, real page)
Loads `/accounting/load-costs` on the deployed FE (and later every table registered in the contract list), and asserts by `getComputedStyle`: every `th` weight 700 · every `th` `scrollWidth <= clientWidth` (no truncation) · every body `td` `border-right-width` 1px · no money/mileage `td` wraps (`clientHeight <= 1 line`) · header bg `rgb(238,242,246)` · group-row bg `rgb(228,234,241)` · KPI tile height ≤ 101px. `--selftest` mutates a fixture. Wired in `scripts/verify-steps/`.

## THE RULE FOR EVERY FUTURE DESIGN INSTRUCTION (lead law, permanent)
No design instruction ships without (1) a reference file in `docs/design/reference/`, (2) the exact property values in a table like the one above, (3) a computed-style guard that fails when the live page deviates. Prose adjectives are not a spec.
