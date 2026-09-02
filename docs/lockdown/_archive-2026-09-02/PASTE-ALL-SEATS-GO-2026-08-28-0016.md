# PASTE ALL SEATS — GO-0016 (FEED delivery + next NOW)

**THIS IS NOW.** GO-0014 is on `origin/main` (`#17138` `8b34790`). Seats that only read **Desktop** `~/Desktop/IH35-SEAT-FEED/` or **INBOX TOP of IH35-TMS-clean** never saw it — Desktop was still **GO-0013**. Canonical instruction = `docs/bus/FEED/NOW-<SEAT>.md` after `git pull --ff-only origin main`. Then run `node scripts/ops/sync-seat-feed.mjs` (Cursor) so Desktop matches git.

Live API **`069d531`**. `origin/main` is ahead (Event 2 `#17157` `8af0331` is **code-only** until healthz moves). U14 never restamp. Skip #15546 #16895. Jorge is not the messenger.

## Verified this packet (2026-08-28 ~3:58 PM CT)

- `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `ok:true` `version":"069d531"`
- GO-0014 packet + FEED **are on origin/main**. Desktop FEED was **GO-0013** (delivery defect).
- `#17157` ACCT-F9876 Event 2 silent on bulk-issued invoices **merged** — do not rebuild Option B (`#16875` already ancestor of live `069d531`).
- Claude 3:47 PM CT: `ledger.integrity_cron` last success **20:20:07Z** after CHECK widen — **L2 closed**. CC-2 do not wait on that tick again.

## CURRENT-LAW (unchanged)

USMCA only. No TMS→QBO write-back. CREATE-TEST-THEN-VOID. FAST-MERGE local gate then `gh api` squash. **Cursor only** `trigger_deploy` on 5–10 gate (deploy **is** stalled — that is this seat). Money = reuse poster, no new GL math. Findings → `GUARD-WORKORDERS.md`. Cascade appends audit Verdict only.

## Do not spend seats on

9000 real-only **$36.12**. Negative bank/AR with $0 OB. USMCA QBO stale. Samsara detention (DISPROVEN). Rebuilding `#17125` CHECK. Rebuilding Option B POD removal. Second A/R poster. TRANSP/TRK.

## ACK

| Seat | ACK |
|------|-----|
| CC-1 | `CC-1 \| ACK \| GO-0016 \| NOW=event2-on-main-remeasure-after-live \| SHA=069d531 \| GO` |
| CC-2 | `CC-2 \| ACK \| GO-0016 \| NOW=silent-job-noop-unique \| SHA=069d531 \| GO` |
| CC-3 | `CC-3 \| ACK \| GO-0016 \| NOW=BANK-F01-F02-F03-F07 \| SHA=069d531 \| GO` |
| Codex | `CODEX \| ACK \| GO-0016 \| NOW=pass-unverified-evidence-8 \| SHA=069d531 \| GO` |
| Devin | `DEVIN \| ACK \| GO-0016 \| NOW=ensure-drivers-payee \| SHA=069d531 \| GO` |
| Cascade | `CASCADE \| ACK \| GO-0016 \| NOW=vendors-0-of-7-prod-verified \| SHA=069d531 \| GO` |
| Cursor | `CURSOR \| ACK \| GO-0016 \| NOW=desktop-feed-sync+deploy \| SHA=069d531 \| GO` |
