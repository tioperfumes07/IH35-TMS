# FEED · CC-2 · GO-0013 · overwrite

`git pull --ff-only origin main`
ACK: `CC-2 | ACK | GO-0013 | NOW=live-verify-ledger-cron-after-cc1 | SHA=069d531 | GO`

## NOW
You do **not** author the CHECK migration (CC-1). You wrote the detectors; the constraint is why the cron dies — do not rebuild TXH GET.

Until CC-1 lands: leftover unique USMCA only (500 / dead / silent). Not Codex `/dispatch`. Not CC-3 TXH tab. INV-10 HOLD.

After CC-1 merge + Neon apply: live-verify `ledger.integrity_cron` `last_successful_run_at` moves and `integration='ledger'` rows exist for the new types on **USMCA**. Completeness discriminator. Do not recertify U14.

## Forbidden
Build the migration. GL math. QBO / TRANSP / TRK. Fake-OK `factoring.batch` Sample. `trigger_deploy`. U14 restamp.
