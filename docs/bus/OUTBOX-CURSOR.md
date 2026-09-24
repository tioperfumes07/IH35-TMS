# OUTBOX-CURSOR

**2026-09-24T16:00Z** · Aug feed_input **61/61 LIVE** (loads+bills+fuel+expenses via historical_backfill)

- Owner: Aug 7 TRANSP→USMCA cutover; same AT+QBO; Faro USMCA+TRANSP recon done; expenses all USMCA; 5 non-Faro invoices = self-carried on loads.
- Fed last 11 MISSING_DB (13506/17/27/30/22/40/31/33/41/39/67). 13525 driver-pay only (AT PDF LH=0 / not Faro).
- Files: `scripts/feed/feed-settlement-day.mts`, recon artifacts, NOW-CURSOR.
- NEXT: close pure-Aug settlements; leave Aug–Sep open; verify 5 self-carried AR; then Sept.

**2026-09-24T15:20Z** · tour=settlement locked + Aug recon shipped (honest)

- Owner restated: **a tour is a settlement**. Usually ~1 week; longer when triangulations extend. NB (+TR*) + SB; 1-load / no-SB-on-breakdown / SB deliver-elsewhere+deadhead home are valid.
- MEMORY_BANK DOMAIN MODEL updated. Faro Aug LIVE TIE 13/13.
- Artifacts: `docs/recon/AUGUST-2026-TRUE-RECON.md` + `.json` · builders `scripts/feed/feed-settlement-day.mts`, `build-august-true-recon.mjs`.
- LIVE: 31 Aug tours · composition OK **13** · gaps **18** (missing legs) · GL Aug balanced $457,235.87 · 0 minted driver_settlements · span avg 7.7d / max 40d.
- NEXT: feed missing tour legs until 31/31 composition OK — then September.
