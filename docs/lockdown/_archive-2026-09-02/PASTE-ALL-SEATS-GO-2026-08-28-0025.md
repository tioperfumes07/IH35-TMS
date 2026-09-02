# GO-0025 — URGENT-6 SOURCE OF TRUTH + RUNTIME /program

**NOW.** Packet for every seat. Jorge is not the messenger. ACK OUTBOX.

Live API still `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version`. Do not treat SPA bake as truth.

**OFF (do not start):** PROG-01 migration `202613270000`. CREATE-TEST-THEN-VOID KEEP TEST. Nobody except Cursor `trigger_deploy`. U14 never recertify. No TRANSP/TRK/QBO campaign. Do not flip `BANK_FEED_GL_POSTING_ENABLED`.

**Terminology:** JSON `status` is `UNVERIFIED` (built-but-unproven), not `OPEN` (unstarted). Eight IDs: ACCT-SURF-02, ACCT-SURF-04, ACCT-R-04, DISP-S19, DISP-S26, DISP-S34, DISP-S35, DISP-S36.

**Permanent fix in this GO (Cursor PR):** `/program` Module Completion fetches `GET /api/v1/program/module-completion` from the API process. Gitignored `module-completion.ts` is types/U14 only. Guard: Urgent-6 `PASS` without `prod_verified:true` does not count toward N and cannot `complete:true`. banking `complete:false` (1 of 19). vendors `complete:false` (0 of 7). VEND-S01 + BANK-CTRL-01 set `UNVERIFIED` from live Neon. ACCT-SURF-02 PR field = merged #3808. DISP-S36 component = `TripPairingBoardPage` (code), click still UNVERIFIED.

**Until a deploy includes this PR,** the live SPA is still frozen. After deploy, `/program` tracks **API SHA**, not Vite SHA.

## CC-1
ACCT-SURF-02 Expenses 13 layers live rows on **current healthz** (branch is gone; #3808 merged). Then ACCT-SURF-04 Receive Payment (`pr` still `#PENDING`). Never trigger_deploy.

## CC-2
ACCT-R-04: read-only confirm `IH35_SMOKE_UNIT_ID` + `IH35_SMOKE_OPERATING_COMPANY_ID` on live service **IH35-TMS** (`srv-d7rpem7avr4c73fhp4n0`). `render.yaml` `sync:false`. No deploy.

## CC-3
Re-prove banking 17 remaining `PASS`+`prod_verified:false` **on USMCA** vs **current healthz**. BANK-CTRL-01 is UNVERIFIED (flags ON live — do not flip). Do not set `prod_verified` without a live USMCA read.

## Codex
DISP-S19, S26, S34, S35, S36. DOD-A/B/C on TRANSP+TRK+USMCA. S36 = `TripPairingBoardPage`. Not DSP-F7127.

## Devin (PASTE — this seat does not follow INBOX)
See `docs/lockdown/PASTE-DEVIN-GO-2026-08-28-0025.md`. Seven vendors items. VEND-S01 is UNVERIFIED (USMCA 123 active, not 4). `mdata.vendors` CANONICAL.

## Cascade
Unique FINDING only if true on **live healthz**. No U14 restamp.

## Cursor
Lead, FAST-MERGE, census, ping idle. Deploy only 5–10 gate. No `202613270000`.
