# VISUAL CLOSEOUT — THE PINNED PALETTE (one source, all seats read it, nobody invents a hex)

Owner 2026-10-03: "the white is too white and surfaces get lost… unselected is plain white and must
become a different tone." Owner also said to adopt the beige/green family from the renders.
Selected = blue with white text is CORRECT today and does not change.

These values go in ONE file, `apps/frontend/src/design/tokens.ts` (plus the matching CSS custom
properties), in ONE PR, together with the `verify-section7-palette-financial` baseline change.
Never per component. Never a second palette file.

| token | value | used for |
|---|---|---|
| `--surface-page` | `#FAF8F3` | the page ground (warm paper, not white) |
| `--surface-raised` | `#FFFFFF` | a card that must read as lifted OFF the page |
| `--surface-unselected` | `#F2EFE7` | **every unselected box / toggle / segment** — this is the fix |
| `--surface-hover` | `#EAE5D9` | hover on an unselected box |
| `--border-default` | `#DCD6C8` | every box outline |
| `--border-strong` | `#BFB7A4` | a box that needs to read as a boundary, not a hint |
| `--text-primary` | `#1C1A17` | body and numbers |
| `--text-muted` | `#6B6557` | labels, captions, em-dash placeholders |
| `--accent-green` | `#2F6F5E` | positive / brand accent |
| `--accent-green-soft` | `#E6EFEA` | selected-row tint where blue would be too loud |
| `--selected-bg` | unchanged | selected stays blue with white text |

RULES THAT TRAVEL WITH IT
- A money number renders tabular-nums, right-aligned.
- Missing renders as an em dash. Never 0. Never -$0.00.
- ONE control height: 34px. Widths from the named set: date 132 · money 120 · short code 104 ·
  select/name 156–200 · search 232 · email 268. Only a free-text notes field grows.
- No inline pixel widths, except a 34px checkbox column.
