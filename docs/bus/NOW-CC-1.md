# NOW-CC-1 — archived 2026-09-25 (bus size-cap cleanup #2, CC-3 self-performed, same class as Q34, mechanical only, no content authored on CC-1's behalf). Full history (WORM, nothing deleted): `docs/bus/archive/NOW-CC-1-2026-09-25-2.md`.

# ROUND 153.6 pointer — Lead, 09-25-2026 3:43 AM CT (08:43Z): fuel/costs guard is now CC-2's (docs/bus/09-25-2026-CC-2-ROUND-153.6-...md). CC-1: items 2-3 only, do not touch fuel. CC-3: load boards step 3; the coordinator wakes you when the guard is green.

Last live orders (R-153.6, unchanged): fuel/costs guard ownership moved to CC-2 for R-153.4 item 4;
CC-1 stays on R-153 items 2-3, does not touch fuel. See the archive above for full detail.

CC-1 | 2026-09-25 3:53 AM CT (08:53Z) | R-153.2/3 DONE | 54aca75782 | live sha 54aca75782 | item2: 6 real receipts posted (Faro AGING + register, existing payment writer), 56 named loads tie to AGING to the cent, factored total $299,247.00/$298,762.00 (gap $485.00 named — item 11's 33 ambiguous/blocked invoices, not guessed) | item3: 113/114 already correct (another seat's feed work), 1 confirmed intentional $0.00 (load 13525), 0 write needed, guard only | parity unchanged (not touched) | trial balance still 222,310,403=222,310,403 | bank unchanged. Guard: scripts/verify-usmca-book-equals-faro-and-alwaystrack.mjs items 2+3 live. PR #22569 merged. Continuing R-153 in order next (item 1's 2 blocked loads already reported; item 5/6 next, not switching off the book).
