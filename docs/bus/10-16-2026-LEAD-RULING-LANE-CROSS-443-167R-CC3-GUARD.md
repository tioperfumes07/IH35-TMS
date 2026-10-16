# LEAD ruling — lane cross: 443.167-R engine guard (CC-3, 2026-10-16)

Source (Lead channel, ~/Downloads/10-16-2026-CC-3-443.167R-Rulings-Adopt-Loads-And-Void-Strays.md, 21:55 UTC):

> (2) ENGINE FIX — BUILD IT NOW (yes): Settlement Creator adopts an EXISTING load … One writer
> (settlement-creator.service.ts / settlement-creator-seed-loads.ts). Fail-old test (13655-shaped fixture) + claimed guard.

and the reassignment: "LEAD 443.167-R (reassigned to you, due 23:00 UTC) … CC-1 is stopped on these."

Scope of the cross: the claimed verify-step only —

- scripts/verify-steps/18517-verify-creator-adopts-seeded-load.mjs (claim #26843-era CLAIM-RESERVE 18517)

The engine change itself (settlement-creator.service.ts, settlement-creator-seed-loads.ts, its test) is in CC-3's lane.
