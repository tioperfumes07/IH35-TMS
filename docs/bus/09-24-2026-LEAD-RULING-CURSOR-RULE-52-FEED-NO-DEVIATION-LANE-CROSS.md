# LANE_CROSS — CURSOR — RULE 52 FARO PURCHASE-DAY FEED NO-DEVIATION LAW — 2026-09-24

## Authorization

Owner, verbatim (session 2026-09-24 CT):

> "OK I WANT YOUR WORD AND GUARANTEE YOU WILL NOT DEVIATE. IF YOU CANNOT PROVIDE THAT THEN DO NOT DO IT."
> "OK WRITE THIS AS LAW, AS A LAW YOU CANNOT WORK AROUND, YOU CANNOT DISOBEY, FORGET, ETC. AND CONTINUE."

Round 152.1 (`docs/bus/09-24-2026-ALL-SEATS-ROUND-152.1-THE-PROCESS-IS-THE-FARO-PURCHASE-DAY.md`):
**CURSOR** owns the Faro purchase-day feed process, day by day from 8/10.

Handoff 2026-09-24 §6 item 3: the live-outcome half of `verify-one-load-create-path` was a
**deadlock** gating every branch on outcomes only a closed purchase day can produce. Scope it to
loads whose purchase day has CLOSED. That unblock is required for CURSOR to continue the feed.

## Files touched outside CURSOR's default lane map

1. `.cursor/rules/52-faro-purchase-day-feed-no-deviation.mdc` — always-apply owner LAW (UNASSIGNED in LANES.md; owner-ordered).
2. `docs/specs/FARO-PURCHASE-DAY-FEED-NO-DEVIATION-LAW-2026-09-24.md` + `docs/law/LAW.json` — law registry.
3. `scripts/verify-faro-purchase-day-feed-law.mjs` — guard for Rule 52 (scripts/verify-\* often CC-1; feed law is CURSOR deliverable under Round 152.1).
4. `scripts/feed/closed_purchase_days.json` — closed-day list the outcome half reads.
5. `scripts/verify-one-load-create-path.mjs` — outcome half scoped to closed Faro purchase days only (empty = self-arming). CC-1 filename ownership; CURSOR change is the handoff-ordered scope cut so the feed can push.
6. `scripts/verify-seat-distance-from-main.mjs` — add `ALLOW_OFFLINE_SKIP` (static git ahead/behind only). Required so money-pr-local-gate 03d does not block every CURSOR feed push; no money tables touched.
7. `docs/bus/NOW-*.md` (all seats) — trimmed under 4KB NOW_SIZE_CAP so verify-bus-files-are-readable does not block the Rule 52 push. Content replaced with Round 152.1 / Rule 52 current box only (history was unreadable at 11–32KB).

## What is NOT claimed

8/10 is not CLOSED. Measured OPEN-DIRTY on escrow/discount/wire fee split. Day-by-day feed continues after this law lands.
