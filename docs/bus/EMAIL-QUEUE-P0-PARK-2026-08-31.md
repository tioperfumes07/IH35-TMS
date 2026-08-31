# P-0 EMAIL QUEUE PARK — 2026-08-31

**P-0 CLEARED** by Cursor via Neon (`app.bypass_rls=lucia`). WORM: status→`cancelled`, not DELETE.

| id | to | subject | was | now |
|----|-----|---------|-----|-----|
| `2256a643-bd57-44ed-9e65-5008f373aa2e` | R2XPAPERWORK@R2XLLC.COM | Invoice L-20260830-0027 — IH 35 TMS | queued | **cancelled** |
| `84c98ff8-2925-47da-8967-8671786f22f2` | invoices@pfllogistic.com | Invoice L-20260830-0020 — IH 35 TMS | queued | **cancelled** |

`error_code=P0_PARK_REAL_BROKER`. `sent_at`/`provider`/`provider_message_id` were NULL (never handed off).

## Other invoice-send still queued (harmless — reviewed, left queued)

| id | to |
|----|-----|
| `0500c69e-a199-4a5b-8fea-afe42a7e1fd0` | cc3-test-customer-20260822-1054@example.invalid |
| `ff400b9b-001c-4b10-99db-be2dd41a836f` | cascade+vp1oyj@example.com |
| `63af1ec4-9c25-404d-a1b1-1cc8a625a660` | cc3-test-customer-20260822-1054@example.invalid |
| `b3633248-1f05-49a8-94ff-3227e3dab747` | cascade+vp1oyj@example.com |

Post-park queued recipients: tioperfumes07@gmail.com×134 · example.com×2 · example.invalid×2. **Zero real-broker addresses remain queued.**

**EMAIL_CRON_ENABLED:** leave **false** until owner sets USMCA sender env. Do not flip cron from this seat.
